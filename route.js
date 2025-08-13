/**
 * Complete Enhanced Route Navigation Module with Dynamic Route Optimization
 * Intelligently interleaves pickups and deliveries based on proximity
 * Version: 3.0.0
 * COMPLETE FILE - PART 1 OF 6
 */

// Development Configuration
const DEV_CONFIG = {
    isDevelopment: window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1' ||
                   window.location.hostname.includes('github.io'),
    testRider: {
        id: 'ef5438ef-0cc0-4e35-8d1b-be18dbce7fe4',
        name: 'Bobby G',
        phone: '0725046880'
    },
    verboseLogging: true,
    ignoreRiderNotFound: true
};

// Configuration for navigation behavior
const config = {
    headingUp: false,
    smoothMovement: true,
    autoZoom: true,
    mapRotatable: true,
    // New optimization settings
    optimization: {
        enableDynamicRouting: true,
        deliveryPreferenceBonus: 0.85, // Slight preference for deliveries when nearby
        maxProximityForImmediateDelivery: 2.5, // km - deliver immediately if this close
        zoneProximityThreshold: 3, // km - consider stops in same zone
        enableSmartInterleaving: true
    }
};

// State management with enhanced properties
const state = {
    activeRoute: null,
    currentLocation: null,
    map: null,
    markers: [],
    routePolyline: null,
    directionsPolyline: null,
    isTracking: false,
    currentStopIndex: 0,
    parcelsInPossession: [],
    trackingInterval: null,
    proximityNotified: false,
    routeControl: null,
    currentLocationMarker: null,
    lastLocation: null,
    lastLocationTime: null,
    pickupPhaseCompleted: false,
    isPanelVisible: true,
    isPanelExpanded: false,
    navigationActive: false,
    currentSpeed: 0,
    currentHeading: 0,
    isFollowingUser: true,
    lastMapRotation: 0,
    smoothLocationInterval: null,
    mapBearing: 0,
    config: config,
    locationWatchId: null,
    accuracyCircle: null,
    radiusCircle: null,
    totalRouteEarnings: 0,
    routeCommission: 0,
    totalCashToCollect: 0,
    totalCashCollected: 0,
    paymentsByStop: {},
    // New optimization state
    routeOptimizationMode: 'dynamic', // 'dynamic' or 'phased'
    originalRouteOrder: null,
    optimizationStats: {
        originalDistance: 0,
        optimizedDistance: 0,
        savedDistance: 0,
        savedPercentage: 0
    }
};

// API Configuration
const OPENROUTE_API_KEY = '5b3ce3597851110001cf624841e48578ffb34c6b96dfe3bbe9b3ad4c';
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

// Business configuration
const BUSINESS_CONFIG = {
    commission: {
        rider: 0.70,
        platform: 0.30,
        maxUnpaid: 300,
        warningThreshold: 250
    }
};

// ============================================================================
// CORE API FUNCTIONS
// ============================================================================

async function supabaseQuery(table, options = {}) {
    const { select = '*', filter = '', order = '', limit } = options;
    
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}`;
    if (filter) url += `&${filter}`;
    if (order) url += `&order=${order}`;
    if (limit) url += `&limit=${limit}`;
    
    const response = await fetch(url, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error: ${response.status} ${errorText}`);
        throw new Error(`API Error: ${response.status}`);
    }
    
    return await response.json();
}

async function supabaseUpdate(table, filter, data) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(data)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Update Error: ${response.status} ${errorText}`);
        throw new Error(`Update Error: ${response.status}`);
    }
    
    return await response.json();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function parsePrice(priceValue) {
    if (typeof priceValue === 'number') return priceValue;
    if (typeof priceValue === 'string') {
        const cleaned = priceValue.replace(/[^0-9.-]+/g, '');
        return parseFloat(cleaned) || 0;
    }
    return 0;
}

function getPaymentInfoForStop(stop) {
    if (!state.activeRoute || !state.activeRoute.parcels) {
        return {
            amount: 0,
            method: 'unknown',
            status: 'unknown',
            needsCollection: false
        };
    }
    
    const parcel = state.activeRoute.parcels.find(p => p.id === stop.parcelId);
    if (!parcel) {
        return {
            amount: 0,
            method: 'unknown',
            status: 'unknown',
            needsCollection: false
        };
    }
    
    const amount = parsePrice(parcel.price || parcel.total_price || 0);
    const method = parcel.payment_method || 'cash';
    const status = parcel.payment_status || 'pending';
    
    return {
        amount: amount,
        method: method,
        status: status,
        needsCollection: stop.type === 'delivery' && method === 'cash' && status === 'pending'
    };
}

function calculateCashCollection() {
    state.totalCashToCollect = 0;
    state.totalCashCollected = 0;
    
    if (!state.activeRoute || !state.activeRoute.stops) return;
    
    state.activeRoute.stops.forEach(stop => {
        if (stop.type === 'delivery') {
            const paymentInfo = getPaymentInfoForStop(stop);
            
            if (paymentInfo.needsCollection) {
                state.totalCashToCollect += paymentInfo.amount;
                
                if (stop.completed) {
                    state.totalCashCollected += paymentInfo.amount;
                    state.paymentsByStop[stop.id] = {
                        amount: paymentInfo.amount,
                        collected: true,
                        timestamp: stop.timestamp
                    };
                } else {
                    state.paymentsByStop[stop.id] = {
                        amount: paymentInfo.amount,
                        collected: false
                    };
                }
            }
        }
    });
    
    console.log('Cash collection calculated:', {
        total: state.totalCashToCollect,
        collected: state.totalCashCollected,
        pending: state.totalCashToCollect - state.totalCashCollected
    });
}

async function syncRouteData() {
    if (!state.activeRoute) return;
    
    try {
        localStorage.setItem('tuma_active_route', JSON.stringify(state.activeRoute));
        
        if (state.activeRoute.stops && state.activeRoute.stops.every(s => s.completed)) {
            await handleRouteCompletion();
        }
    } catch (error) {
        console.error('Error syncing route data:', error);
    }
}

function calculateRouteFinancials() {
    if (!state.activeRoute) return;
    
    state.totalRouteEarnings = 0;
    state.routeCommission = 0;
    
    if (state.activeRoute.parcels && state.activeRoute.parcels.length > 0) {
        state.activeRoute.parcels.forEach(parcel => {
            const price = parsePrice(parcel.price || parcel.total_price || 500);
            const riderPayout = price * BUSINESS_CONFIG.commission.rider;
            const commission = price * BUSINESS_CONFIG.commission.platform;
            
            state.totalRouteEarnings += riderPayout;
            state.routeCommission += commission;
        });
    } else if (state.activeRoute.total_earnings) {
        const totalPrice = parsePrice(state.activeRoute.total_earnings);
        state.totalRouteEarnings = totalPrice * BUSINESS_CONFIG.commission.rider;
        state.routeCommission = totalPrice * BUSINESS_CONFIG.commission.platform;
    } else {
        const deliveryCount = state.activeRoute.stops?.filter(s => s.type === 'delivery').length || 0;
        state.totalRouteEarnings = deliveryCount * 350;
        state.routeCommission = deliveryCount * 150;
    }
    
    console.log('Route financials calculated:', {
        earnings: state.totalRouteEarnings,
        commission: state.routeCommission
    });
}

// ============================================================================
// ENHANCED DYNAMIC ROUTE OPTIMIZATION FUNCTIONS
// ============================================================================

function optimizeRouteStops() {
    if (!state.activeRoute || !state.activeRoute.stops) {
        showNotification('No route to optimize', 'warning');
        return;
    }
    
    if (state.activeRoute.stops.some(s => s.completed)) {
        showNotification('Cannot optimize route in progress', 'warning');
        return;
    }
    
    console.log('Starting dynamic route optimization...');
    
    // Store original order for undo functionality
    state.originalRouteOrder = [...state.activeRoute.stops];
    const originalDistance = calculateTotalRouteDistance(state.originalRouteOrder);
    
    showOptimizingAnimation();
    
    setTimeout(() => {
        // Use dynamic optimization if enabled, otherwise fall back to phased
        const optimizedStops = config.optimization.enableDynamicRouting 
            ? performDynamicOptimization(state.originalRouteOrder)
            : performPhasedOptimization(state.originalRouteOrder);
            
        const optimizedDistance = calculateTotalRouteDistance(optimizedStops);
        
        const savedDistance = Math.max(0, originalDistance - optimizedDistance);
        const savedPercentage = savedDistance > 0 
            ? ((savedDistance / originalDistance) * 100).toFixed(1) 
            : 0;
        
        // Update state with optimization results
        state.activeRoute.stops = optimizedStops;
        state.activeRoute.isOptimized = true;
        state.optimizationStats = {
            originalDistance: originalDistance,
            optimizedDistance: optimizedDistance,
            savedDistance: savedDistance,
            savedPercentage: parseFloat(savedPercentage)
        };
        
        localStorage.setItem('tuma_active_route', JSON.stringify(state.activeRoute));
        
        // Log optimization results
        console.log('Optimization complete:');
        console.log(`Mode: ${state.routeOptimizationMode}`);
        console.log(`Original distance: ${originalDistance.toFixed(1)}km`);
        console.log(`Optimized distance: ${optimizedDistance.toFixed(1)}km`);
        console.log(`Saved: ${savedDistance.toFixed(1)}km (${savedPercentage}%)`);
        
        console.log('\nOptimized route order:');
        optimizedStops.forEach((stop, index) => {
            console.log(`${index + 1}. ${stop.type.toUpperCase()} - ${stop.address} (${stop.parcelCode})`);
        });
        
        displayRouteInfo();
        plotRoute();
        drawOptimizedRoute();
        
        hideOptimizingAnimation();
        
        if (savedDistance > 0.1) {
            showOptimizationResults(savedDistance, savedPercentage);
        } else {
            showNotification('Route optimized for efficient delivery sequence', 'success');
        }
        
        updateOptimizeButton(true);
    }, 1500);
}
// ============================================================================
// PART 2 OF 6 - DYNAMIC ROUTE OPTIMIZATION ALGORITHM
// ============================================================================

/**
 * Performs dynamic route optimization with intelligent interleaving
 * of pickups and deliveries based on proximity
 */
function performDynamicOptimization(stops) {
    console.log('🚀 Starting dynamic route optimization...');
    
    // Separate pickups and deliveries
    const pickups = stops.filter(s => s.type === 'pickup');
    const deliveries = stops.filter(s => s.type === 'delivery');
    
    // Create delivery map for quick lookup
    const deliveryMap = {};
    deliveries.forEach(d => {
        const parcelId = d.parcelCode || d.parcelId;
        deliveryMap[parcelId] = d;
    });
    
    // Initialize optimization state
    const optimizedRoute = [];
    const availablePickups = [...pickups];
    const pendingDeliveries = new Set(); // Deliveries that can now be made
    const completedParcels = new Set();
    
    // Determine starting position
    let currentPosition = state.currentLocation 
        ? { lat: state.currentLocation.lat, lng: state.currentLocation.lng }
        : calculateCentroid(stops);
    
    console.log('Starting position:', currentPosition);
    
    // Main optimization loop
    while (availablePickups.length > 0 || pendingDeliveries.size > 0) {
        let nextStop = null;
        let nextStopDistance = Infinity;
        let isPickup = false;
        
        // Evaluate all available pickups
        availablePickups.forEach(pickup => {
            const distance = calculateDistance(currentPosition, pickup.location);
            
            // Check if this pickup has a nearby delivery
            const parcelId = pickup.parcelCode || pickup.parcelId;
            const correspondingDelivery = deliveryMap[parcelId];
            let adjustedDistance = distance;
            
            // If delivery is very close to pickup, favor this pickup
            if (correspondingDelivery) {
                const deliveryDistance = calculateDistance(pickup.location, correspondingDelivery.location);
                if (deliveryDistance < config.optimization.maxProximityForImmediateDelivery) {
                    adjustedDistance *= 0.8; // 20% bonus for nearby delivery
                    console.log(`Pickup ${pickup.parcelCode} has nearby delivery (${deliveryDistance.toFixed(1)}km)`);
                }
            }
            
            if (adjustedDistance < nextStopDistance) {
                nextStop = pickup;
                nextStopDistance = adjustedDistance;
                isPickup = true;
            }
        });
        
        // Evaluate all pending deliveries
        pendingDeliveries.forEach(delivery => {
            const distance = calculateDistance(currentPosition, delivery.location);
            
            // Apply delivery preference bonus to encourage completing deliveries
            const adjustedDistance = distance * config.optimization.deliveryPreferenceBonus;
            
            if (adjustedDistance < nextStopDistance) {
                nextStop = delivery;
                nextStopDistance = adjustedDistance;
                isPickup = false;
            }
        });
        
        // Add the selected stop to the route
        if (nextStop) {
            optimizedRoute.push(nextStop);
            currentPosition = nextStop.location;
            
            if (isPickup) {
                // Remove from available pickups
                const index = availablePickups.findIndex(p => p.id === nextStop.id);
                if (index > -1) availablePickups.splice(index, 1);
                
                // Add corresponding delivery to pending
                const parcelId = nextStop.parcelCode || nextStop.parcelId;
                const delivery = deliveryMap[parcelId];
                if (delivery) {
                    pendingDeliveries.add(delivery);
                    
                    // Check if we should immediately deliver if very close
                    const deliveryDistance = calculateDistance(currentPosition, delivery.location);
                    if (deliveryDistance < config.optimization.maxProximityForImmediateDelivery && 
                        availablePickups.length > 0) {
                        console.log(`Immediate delivery opportunity for ${parcelId} (${deliveryDistance.toFixed(1)}km away)`);
                        
                        // Check if there are any pickups even closer
                        let closestPickupDistance = Infinity;
                        availablePickups.forEach(p => {
                            const dist = calculateDistance(currentPosition, p.location);
                            if (dist < closestPickupDistance) closestPickupDistance = dist;
                        });
                        
                        // If delivery is closer than next pickup, do it now
                        if (deliveryDistance < closestPickupDistance * 0.9) {
                            optimizedRoute.push(delivery);
                            currentPosition = delivery.location;
                            pendingDeliveries.delete(delivery);
                            completedParcels.add(parcelId);
                            console.log(`✅ Immediate delivery completed for ${parcelId}`);
                        }
                    }
                }
            } else {
                // Remove from pending deliveries
                pendingDeliveries.delete(nextStop);
                const parcelId = nextStop.parcelCode || nextStop.parcelId;
                completedParcels.add(parcelId);
            }
            
            console.log(`Added ${isPickup ? 'PICKUP' : 'DELIVERY'}: ${nextStop.address} (${nextStopDistance.toFixed(1)}km)`);
        } else {
            console.warn('No next stop found - this should not happen');
            break;
        }
    }
    
    // Final validation
    const validatedRoute = validateRouteIntegrity(optimizedRoute);
    
    console.log(`✨ Optimization complete: ${validatedRoute.length} stops optimized`);
    return validatedRoute;
}

/**
 * Fallback phased optimization (all pickups then deliveries)
 */
function performPhasedOptimization(stops) {
    console.log('Using phased optimization (pickups → deliveries)');
    
    const pickups = stops.filter(s => s.type === 'pickup');
    const deliveries = stops.filter(s => s.type === 'delivery');
    
    // Optimize pickup order
    const optimizedPickups = optimizeStopOrder(pickups);
    
    // Optimize delivery order
    const optimizedDeliveries = optimizeStopOrder(deliveries);
    
    return [...optimizedPickups, ...optimizedDeliveries];
}

/**
 * Optimize order of stops using nearest neighbor algorithm
 */
function optimizeStopOrder(stops) {
    if (stops.length <= 1) return stops;
    
    const optimized = [];
    const remaining = [...stops];
    
    // Start from current location or centroid
    let currentPosition = state.currentLocation 
        ? { lat: state.currentLocation.lat, lng: state.currentLocation.lng }
        : calculateCentroid(stops);
    
    while (remaining.length > 0) {
        let nearestIndex = 0;
        let minDistance = Infinity;
        
        remaining.forEach((stop, index) => {
            const distance = calculateDistance(currentPosition, stop.location);
            if (distance < minDistance) {
                minDistance = distance;
                nearestIndex = index;
            }
        });
        
        const nextStop = remaining.splice(nearestIndex, 1)[0];
        optimized.push(nextStop);
        currentPosition = nextStop.location;
    }
    
    return optimized;
}

/**
 * Validate that all deliveries come after their pickups
 */
function validateRouteIntegrity(route) {
    const validated = [];
    const pickedUpParcels = new Set();
    const deferredDeliveries = [];
    
    route.forEach(stop => {
        const parcelId = stop.parcelCode || stop.parcelId;
        
        if (stop.type === 'pickup') {
            validated.push(stop);
            pickedUpParcels.add(parcelId);
            
            // Check if we have a deferred delivery for this parcel
            const deferredIndex = deferredDeliveries.findIndex(d => 
                (d.parcelCode === parcelId) || (d.parcelId === parcelId)
            );
            if (deferredIndex > -1) {
                // Add the deferred delivery right after its pickup
                validated.push(deferredDeliveries.splice(deferredIndex, 1)[0]);
            }
        } else if (stop.type === 'delivery') {
            if (pickedUpParcels.has(parcelId)) {
                validated.push(stop);
            } else {
                // Defer this delivery until after its pickup
                deferredDeliveries.push(stop);
                console.warn(`Deferring delivery ${parcelId} - pickup not yet completed`);
            }
        }
    });
    
    // Add any remaining deferred deliveries (shouldn't happen with correct data)
    if (deferredDeliveries.length > 0) {
        console.error('Found deliveries without pickups:', deferredDeliveries);
        validated.push(...deferredDeliveries);
    }
    
    return validated;
}

/**
 * Calculate the geographic centroid of stops
 */
function calculateCentroid(stops) {
    if (!stops || stops.length === 0) {
        return { lat: -1.2921, lng: 36.8219 }; // Default Nairobi center
    }
    
    let sumLat = 0, sumLng = 0;
    stops.forEach(stop => {
        if (stop.location) {
            sumLat += stop.location.lat;
            sumLng += stop.location.lng;
        }
    });
    
    return {
        lat: sumLat / stops.length,
        lng: sumLng / stops.length
    };
}

/**
 * Toggle between optimization modes
 */
function toggleOptimizationMode() {
    if (state.routeOptimizationMode === 'dynamic') {
        state.routeOptimizationMode = 'phased';
        config.optimization.enableDynamicRouting = false;
        showNotification('Switched to phased optimization (pickups → deliveries)', 'info');
    } else {
        state.routeOptimizationMode = 'dynamic';
        config.optimization.enableDynamicRouting = true;
        showNotification('Switched to dynamic optimization (smart interleaving)', 'info');
    }
    
    // Re-optimize if there's an active route
    if (state.activeRoute && !state.activeRoute.stops.some(s => s.completed)) {
        optimizeRouteStops();
    }
}

/**
 * Analyze route efficiency and provide insights
 */
function analyzeRouteEfficiency(stops) {
    const metrics = {
        totalStops: stops.length,
        pickups: stops.filter(s => s.type === 'pickup').length,
        deliveries: stops.filter(s => s.type === 'delivery').length,
        totalDistance: calculateTotalRouteDistance(stops),
        averageStopDistance: 0,
        backtrackingInstances: 0,
        efficiencyScore: 0
    };
    
    // Calculate average distance between stops
    let distanceSum = 0;
    for (let i = 0; i < stops.length - 1; i++) {
        distanceSum += calculateDistance(stops[i].location, stops[i + 1].location);
    }
    metrics.averageStopDistance = distanceSum / (stops.length - 1);
    
    // Detect backtracking
    for (let i = 1; i < stops.length - 1; i++) {
        const prev = stops[i - 1].location;
        const curr = stops[i].location;
        const next = stops[i + 1].location;
        
        // Check if we're going backwards
        const forwardDistance = calculateDistance(prev, next);
        const actualDistance = calculateDistance(prev, curr) + calculateDistance(curr, next);
        
        if (actualDistance > forwardDistance * 1.5) {
            metrics.backtrackingInstances++;
        }
    }
    
    // Calculate efficiency score (0-100)
    const backtrackPenalty = metrics.backtrackingInstances * 5;
    const distanceEfficiency = Math.min(100, (20 / metrics.averageStopDistance) * 100);
    metrics.efficiencyScore = Math.max(0, distanceEfficiency - backtrackPenalty);
    
    return metrics;
}

function calculateTotalRouteDistance(stops) {
    if (!stops || stops.length === 0) return 0;
    
    let totalDistance = 0;
    let currentPos = state.currentLocation 
        ? { lat: state.currentLocation.lat, lng: state.currentLocation.lng }
        : stops[0].location;
    
    stops.forEach(stop => {
        totalDistance += calculateDistance(currentPos, stop.location);
        currentPos = stop.location;
    });
    
    return totalDistance;
}

function calculateDistance(point1, point2) {
    if (!point1 || !point2) return 0;
    
    const R = 6371; // Earth's radius in kilometers
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLon = (point2.lng - point1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function undoOptimization() {
    if (!state.originalRouteOrder) {
        showNotification('No original route to restore', 'warning');
        return;
    }
    
    state.activeRoute.stops = [...state.originalRouteOrder];
    state.activeRoute.isOptimized = false;
    
    localStorage.setItem('tuma_active_route', JSON.stringify(state.activeRoute));
    
    displayRouteInfo();
    plotRoute();
    drawOptimizedRoute();
    
    updateOptimizeButton(false);
    showNotification('Route restored to original order', 'info');
    
    // Clear optimization stats
    state.optimizationStats = {
        originalDistance: 0,
        optimizedDistance: 0,
        savedDistance: 0,
        savedPercentage: 0
    };
}
// ============================================================================
// PART 3 OF 6 - UI FUNCTIONS AND STYLES
// ============================================================================

function injectNavigationStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Import premium fonts */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@400;500;600;700&display=swap');
        
        /* Premium font stack */
        * {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', system-ui, sans-serif;
        }
        
        /* Map container styles */
        .map-container {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            z-index: 1 !important;
        }
        
        #map {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            z-index: 1 !important;
        }
        
        /* ELEGANT CASH COLLECTION WIDGET */
        .cash-collection-widget {
            position: fixed;
            top: 80px;
            right: 20px;
            background: linear-gradient(135deg, #0A0A0B 0%, #1C1C1F 100%);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            padding: 20px;
            min-width: 240px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), 0 2px 10px rgba(0, 0, 0, 0.3);
            z-index: 100;
            transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            border: 1px solid rgba(255, 255, 255, 0.1);
            font-weight: 500;
        }
        
        .cash-collection-widget:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 50px rgba(0, 0, 0, 0.6), 0 5px 15px rgba(0, 0, 0, 0.4);
        }
        
        .cash-collection-widget.has-pending {
            background: linear-gradient(135deg, #FF9F0A 0%, #FF6B00 100%);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .cash-widget-title {
            font-size: 12px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.7);
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .cash-collection-widget.has-pending .cash-widget-title {
            color: rgba(0, 0, 0, 0.6);
        }
        
        .cash-widget-amount {
            font-size: 36px;
            font-weight: 800;
            color: white;
            margin-bottom: 16px;
            letter-spacing: -1px;
            line-height: 1;
        }
        
        .cash-collection-widget.has-pending .cash-widget-amount {
            color: #0A0A0B;
        }
        
        .cash-widget-breakdown {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding-top: 16px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .cash-collection-widget.has-pending .cash-widget-breakdown {
            border-top-color: rgba(0, 0, 0, 0.1);
        }
        
        .cash-breakdown-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
            color: rgba(255, 255, 255, 0.8);
        }
        
        .cash-collection-widget.has-pending .cash-breakdown-item {
            color: rgba(0, 0, 0, 0.8);
        }
        
        .cash-breakdown-label {
            opacity: 0.7;
            font-weight: 500;
        }
        
        .cash-breakdown-value {
            font-weight: 700;
            font-size: 15px;
        }
        
        /* OPTIMIZATION BUTTON STYLES */
        .optimize-button-container {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
            width: 100%;
        }
        
        .optimize-route-btn {
            flex: 1;
            background: linear-gradient(135deg, #9333EA, #7928CA);
            color: white;
            border: none;
            border-radius: 16px;
            padding: 16px 20px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            box-shadow: 0 4px 15px rgba(147, 51, 234, 0.4);
            letter-spacing: 0.5px;
        }
        
        .optimize-route-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(147, 51, 234, 0.5);
            background: linear-gradient(135deg, #A855F7, #9333EA);
        }
        
        .optimize-route-btn:active:not(:disabled) {
            transform: translateY(0);
        }
        
        .optimize-route-btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
        }
        
        .optimize-route-btn.optimized {
            background: linear-gradient(135deg, #34C759, #30D158);
            box-shadow: 0 4px 15px rgba(52, 199, 89, 0.4);
        }
        
        .optimize-icon {
            font-size: 20px;
        }
        
        .undo-optimize-btn {
            background: rgba(255, 255, 255, 0.1);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 16px;
            padding: 16px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.2s ease;
        }
        
        .undo-optimize-btn:hover {
            background: rgba(255, 255, 255, 0.15);
            transform: translateY(-1px);
        }
        
        /* Optimization mode toggle */
        .optimization-mode-toggle {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            margin-bottom: 8px;
            font-size: 13px;
        }
        
        .mode-indicator {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            background: linear-gradient(135deg, #9333EA, #7928CA);
            border-radius: 8px;
            font-weight: 600;
            color: white;
        }
        
        /* Optimizing animation */
        .optimizing-animation {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(10, 10, 11, 0.95);
            backdrop-filter: blur(20px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 5000;
            animation: fadeIn 0.3s ease;
        }
        
        .optimizing-content {
            background: linear-gradient(135deg, #1C1C1F, #2C2C2E);
            border-radius: 24px;
            padding: 48px;
            text-align: center;
            max-width: 420px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .optimizing-spinner {
            width: 64px;
            height: 64px;
            border: 3px solid rgba(255, 255, 255, 0.1);
            border-top-color: #9333EA;
            border-radius: 50%;
            margin: 0 auto 24px;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .optimizing-content h3 {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
            letter-spacing: -0.5px;
        }
        
        .optimizing-content p {
            color: rgba(255, 255, 255, 0.6);
            margin-bottom: 32px;
            font-weight: 500;
        }
        
        .optimizing-steps {
            text-align: left;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .optimizing-steps .step {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 16px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            opacity: 0.5;
            transition: all 0.3s ease;
            font-weight: 500;
        }
        
        .optimizing-steps .step.active {
            opacity: 1;
            background: linear-gradient(135deg, rgba(147, 51, 234, 0.15), rgba(121, 40, 202, 0.1));
            border: 1px solid rgba(147, 51, 234, 0.3);
        }
        
        /* Optimization results */
        .optimization-results {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #1C1C1F, #2C2C2E);
            border-radius: 24px;
            padding: 48px;
            text-align: center;
            z-index: 5000;
            box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
            animation: bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            max-width: 480px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        @keyframes bounceIn {
            0% {
                transform: translate(-50%, -50%) scale(0.8);
                opacity: 0;
            }
            50% {
                transform: translate(-50%, -50%) scale(1.05);
            }
            100% {
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
            }
        }
        
        .results-icon {
            font-size: 72px;
            margin-bottom: 24px;
        }
        
        .optimization-results h2 {
            font-size: 32px;
            font-weight: 800;
            margin-bottom: 28px;
            color: white;
            letter-spacing: -1px;
        }
        
        .results-stats {
            display: flex;
            justify-content: space-around;
            margin-bottom: 28px;
            padding: 24px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 16px;
            backdrop-filter: blur(10px);
        }
        
        .results-stats .stat {
            text-align: center;
        }
        
        .results-stats .stat-value {
            display: block;
            font-size: 28px;
            font-weight: 800;
            color: #9333EA;
            margin-bottom: 6px;
            letter-spacing: -0.5px;
        }
        
        .results-stats .stat-label {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.5);
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
        }
        
        .results-comparison {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 28px;
            padding: 18px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 12px;
        }
        
        .comparison-item {
            display: flex;
            justify-content: space-between;
            font-size: 16px;
            font-weight: 500;
        }
        
        .comparison-label {
            color: rgba(255, 255, 255, 0.6);
        }
        
        .comparison-value {
            font-weight: 700;
            color: white;
        }
        
        .comparison-value.success {
            color: #34C759;
        }
        
        .optimization-mode-info {
            margin-top: 16px;
            padding: 12px;
            background: rgba(147, 51, 234, 0.1);
            border-radius: 12px;
            font-size: 14px;
            color: rgba(255, 255, 255, 0.8);
        }
        
        .results-close {
            width: 100%;
            background: linear-gradient(135deg, #9333EA, #7928CA);
            color: white;
            border: none;
            border-radius: 14px;
            padding: 16px;
            font-size: 16px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            letter-spacing: 0.5px;
        }
        
        .results-close:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(147, 51, 234, 0.4);
        }
        
        .fade-out {
            animation: fadeOut 0.3s ease;
        }
        
        @keyframes fadeOut {
            to {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.9);
            }
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        /* Route efficiency indicator */
        .route-efficiency-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: linear-gradient(135deg, rgba(147, 51, 234, 0.15), rgba(121, 40, 202, 0.1));
            border: 1px solid rgba(147, 51, 234, 0.3);
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            color: #9333EA;
            margin-left: 8px;
        }
        
        .efficiency-high {
            background: linear-gradient(135deg, rgba(52, 199, 89, 0.15), rgba(48, 209, 88, 0.1));
            border-color: #34C759;
            color: #34C759;
        }
        
        .efficiency-medium {
            background: linear-gradient(135deg, rgba(255, 159, 10, 0.15), rgba(255, 107, 0, 0.1));
            border-color: #FF9F0A;
            color: #FF9F0A;
        }
        
        .efficiency-low {
            background: linear-gradient(135deg, rgba(255, 59, 48, 0.15), rgba(255, 45, 85, 0.1));
            border-color: #FF3B30;
            color: #FF3B30;
        }
        
        /* Enhanced navigation styles */
        .enhanced-navigation {
            pointer-events: none !important;
        }
        
        .enhanced-navigation.waze-style {
            pointer-events: none !important;
        }
        
        .waze-nav-top,
        .waze-bottom-pills,
        .waze-fab,
        .waze-nav-menu,
        .cash-collection-widget {
            pointer-events: auto !important;
        }
    `;
    document.head.appendChild(style);
}
// ============================================================================
// PART 4 OF 6 - OPTIMIZATION UI & CORE DISPLAY FUNCTIONS
// ============================================================================

function addOptimizeButton() {
    if (document.getElementById('optimizeBtn')) return;
    
    const navControls = document.getElementById('navControls');
    if (!navControls) return;
    
    const optimizeContainer = document.createElement('div');
    optimizeContainer.className = 'optimize-button-container';
    optimizeContainer.innerHTML = `
        <div class="optimization-mode-toggle">
            <span>Mode:</span>
            <span class="mode-indicator">
                ${config.optimization.enableDynamicRouting ? '⚡ Dynamic' : '📦 Phased'}
            </span>
            <button onclick="toggleOptimizationMode()" style="
                background: rgba(255, 255, 255, 0.1);
                border: none;
                border-radius: 6px;
                padding: 4px 8px;
                color: white;
                font-size: 12px;
                cursor: pointer;
            ">Switch</button>
        </div>
        <button id="optimizeBtn" class="optimize-route-btn" onclick="optimizeRouteStops()">
            <span class="optimize-icon">✨</span>
            <span class="optimize-text">Optimize Route</span>
        </button>
        <button id="undoOptimizeBtn" class="undo-optimize-btn" onclick="undoOptimization()" style="display: none;">
            <span class="undo-icon">↩️</span>
            <span>Undo</span>
        </button>
    `;
    
    navControls.insertBefore(optimizeContainer, navControls.firstChild);
}

function updateOptimizeButton(isOptimized) {
    const optimizeBtn = document.getElementById('optimizeBtn');
    const undoBtn = document.getElementById('undoOptimizeBtn');
    
    if (optimizeBtn) {
        if (isOptimized) {
            optimizeBtn.innerHTML = `
                <span class="optimize-icon">✅</span>
                <span class="optimize-text">Route Optimized</span>
            `;
            optimizeBtn.disabled = true;
            optimizeBtn.classList.add('optimized');
        } else {
            optimizeBtn.innerHTML = `
                <span class="optimize-icon">✨</span>
                <span class="optimize-text">Optimize Route</span>
            `;
            optimizeBtn.disabled = false;
            optimizeBtn.classList.remove('optimized');
        }
    }
    
    if (undoBtn) {
        undoBtn.style.display = isOptimized ? 'flex' : 'none';
    }
    
    // Update mode indicator
    const modeIndicator = document.querySelector('.mode-indicator');
    if (modeIndicator) {
        modeIndicator.innerHTML = config.optimization.enableDynamicRouting 
            ? '⚡ Dynamic' 
            : '📦 Phased';
    }
}

function showOptimizingAnimation() {
    const animation = document.createElement('div');
    animation.id = 'optimizingAnimation';
    animation.className = 'optimizing-animation';
    
    const steps = config.optimization.enableDynamicRouting
        ? [
            '📍 Analyzing stop locations',
            '🧮 Calculating optimal paths',
            '⚡ Smart interleaving stops',
            '✅ Validating sequence'
        ]
        : [
            '📍 Analyzing locations',
            '📦 Organizing pickups',
            '📍 Organizing deliveries',
            '✅ Finalizing route'
        ];
    
    animation.innerHTML = `
        <div class="optimizing-content">
            <div class="optimizing-spinner"></div>
            <h3>Optimizing Route...</h3>
            <p>${config.optimization.enableDynamicRouting 
                ? 'Using smart dynamic routing' 
                : 'Using phased routing'}</p>
            <div class="optimizing-steps">
                ${steps.map((step, i) => `
                    <div class="step ${i === 0 ? 'active' : ''}" data-step="${i}">
                        ${step}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    document.body.appendChild(animation);
    
    // Animate steps
    steps.forEach((_, index) => {
        if (index > 0) {
            setTimeout(() => {
                const step = animation.querySelector(`.step[data-step="${index}"]`);
                if (step) step.classList.add('active');
            }, 300 * (index + 1));
        }
    });
}

function hideOptimizingAnimation() {
    const animation = document.getElementById('optimizingAnimation');
    if (animation) {
        animation.classList.add('fade-out');
        setTimeout(() => animation.remove(), 300);
    }
}

function showOptimizationResults(savedDistance, savedPercentage) {
    // Store original route for undo
    if (!state.originalRouteOrder) {
        state.originalRouteOrder = [...state.activeRoute.stops];
    }
    
    const results = document.createElement('div');
    results.className = 'optimization-results';
    
    // Get route efficiency metrics
    const efficiency = analyzeRouteEfficiency(state.activeRoute.stops);
    const efficiencyClass = efficiency.efficiencyScore > 80 ? 'high' : 
                           efficiency.efficiencyScore > 60 ? 'medium' : 'low';
    
    results.innerHTML = `
        <div class="results-content">
            <div class="results-icon">🎉</div>
            <h2>Route Optimized!</h2>
            <div class="results-stats">
                <div class="stat">
                    <span class="stat-value">${savedDistance.toFixed(1)} km</span>
                    <span class="stat-label">Distance Saved</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${savedPercentage}%</span>
                    <span class="stat-label">More Efficient</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${Math.round(savedDistance * 2.5)} min</span>
                    <span class="stat-label">Time Saved</span>
                </div>
            </div>
            <div class="results-comparison">
                <div class="comparison-item">
                    <span class="comparison-label">Original:</span>
                    <span class="comparison-value">${state.optimizationStats.originalDistance.toFixed(1)} km</span>
                </div>
                <div class="comparison-item">
                    <span class="comparison-label">Optimized:</span>
                    <span class="comparison-value success">${state.optimizationStats.optimizedDistance.toFixed(1)} km</span>
                </div>
                <div class="comparison-item">
                    <span class="comparison-label">Efficiency Score:</span>
                    <span class="comparison-value efficiency-${efficiencyClass}">
                        ${Math.round(efficiency.efficiencyScore)}%
                    </span>
                </div>
            </div>
            <div class="optimization-mode-info">
                <strong>Optimization Mode:</strong> ${config.optimization.enableDynamicRouting ? 'Dynamic' : 'Phased'}<br>
                ${config.optimization.enableDynamicRouting 
                    ? 'Smart interleaving of pickups and deliveries based on proximity'
                    : 'All pickups completed before deliveries'}
            </div>
            <button class="results-close" onclick="this.parentElement.parentElement.remove()">
                Got it!
            </button>
        </div>
    `;
    
    document.body.appendChild(results);
    
    // Auto-close after 7 seconds
    setTimeout(() => {
        if (results.parentElement) {
            results.classList.add('fade-out');
            setTimeout(() => results.remove(), 300);
        }
    }, 7000);
}

function initializeOptimizeButton() {
    setTimeout(() => {
        addOptimizeButton();
        
        if (state.activeRoute && state.activeRoute.isOptimized) {
            updateOptimizeButton(true);
        }
    }, 500);
}

// Show elegant cash collection widget
function showCashCollectionWidget() {
    const existingWidget = document.querySelector('.cash-collection-widget');
    if (existingWidget) existingWidget.remove();
    
    const pendingAmount = state.totalCashToCollect - state.totalCashCollected;
    const hasPending = pendingAmount > 0;
    
    const widget = document.createElement('div');
    widget.className = `cash-collection-widget ${hasPending ? 'has-pending' : ''}`;
    widget.innerHTML = `
        <div class="cash-widget-title">
            ${hasPending ? '⚡' : '✓'} Cash Collection
        </div>
        <div class="cash-widget-amount">
            KES ${pendingAmount.toLocaleString()}
        </div>
        <div class="cash-widget-breakdown">
            <div class="cash-breakdown-item">
                <span class="cash-breakdown-label">Total Expected</span>
                <span class="cash-breakdown-value">KES ${state.totalCashToCollect.toLocaleString()}</span>
            </div>
            <div class="cash-breakdown-item">
                <span class="cash-breakdown-label">✓ Collected</span>
                <span class="cash-breakdown-value">KES ${state.totalCashCollected.toLocaleString()}</span>
            </div>
            <div class="cash-breakdown-item">
                <span class="cash-breakdown-label">⏳ Pending</span>
                <span class="cash-breakdown-value">KES ${pendingAmount.toLocaleString()}</span>
            </div>
        </div>
    `;
    
    document.body.appendChild(widget);
}

function updateCashCollectionWidget() {
    calculateCashCollection();
    const widget = document.querySelector('.cash-collection-widget');
    if (widget) {
        showCashCollectionWidget();
    }
}

async function handleRouteCompletion() {
    console.log('Handling route completion...');
    
    const deliveryCount = state.activeRoute.stops.filter(s => s.type === 'delivery').length;
    
    const completionData = {
        completed: true,
        earnings: Math.round(state.totalRouteEarnings),
        commission: Math.round(state.routeCommission),
        cashCollected: Math.round(state.totalCashCollected),
        deliveries: deliveryCount,
        stops: state.activeRoute.stops.length,
        timestamp: new Date().toISOString(),
        routeId: state.activeRoute.id,
        parcels: state.activeRoute.parcels || [],
        optimizationMode: state.routeOptimizationMode,
        distanceSaved: state.optimizationStats.savedDistance
    };
    
    console.log('Storing completion data:', completionData);
    
    localStorage.setItem('tuma_route_completion', JSON.stringify(completionData));
    localStorage.removeItem('tuma_active_route');
    
    if (!state.activeRoute.id?.startsWith('demo-')) {
        try {
            for (const parcel of (state.activeRoute.parcels || [])) {
                await supabaseUpdate('parcels',
                    `id=eq.${parcel.id}`,
                    {
                        status: 'delivered',
                        delivery_timestamp: new Date().toISOString(),
                        payment_status: parcel.payment_method === 'cash' ? 'collected' : parcel.payment_status
                    }
                );
            }
        } catch (error) {
            console.error('Error updating parcel status:', error);
        }
    }
}

function createRiderIcon(heading = 0) {
    return L.divIcon({
        className: 'rider-location-marker',
        html: `
            <div class="rider-marker-wrapper">
                <div class="rider-pulse"></div>
                <div class="rider-marker-container" style="transform: rotate(${heading}deg)">
                    <div class="rider-direction-cone"></div>
                    <div class="rider-dot">
                        <div class="rider-inner-dot"></div>
                    </div>
                </div>
            </div>
        `,
        iconSize: [60, 60],
        iconAnchor: [30, 30]
    });
}

// Core display functions
function displayRouteInfo() {
    if (!state.activeRoute) return;
    
    const routeType = document.getElementById('routeType');
    if (routeType) {
        const nextStop = getNextStop();
        if (nextStop) {
            routeType.className = `route-badge verify-btn ${nextStop.type}`;
            routeType.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                <span>Verify ${nextStop.type === 'pickup' ? 'Pickup' : 'Delivery'}</span>
            `;
            routeType.onclick = () => openQuickVerification();
        } else {
            routeType.className = 'route-badge completed';
            routeType.innerHTML = 'Route Complete';
            routeType.onclick = null;
        }
    }
    
    updateRouteStats();
    displayStops();
}

function getNextStop() {
    if (!state.activeRoute || !state.activeRoute.stops) return null;
    return state.activeRoute.stops.find(stop => !stop.completed);
}

function updateRouteStats() {
    const remainingStops = state.activeRoute.stops.filter(s => !s.completed).length;
    const totalDistance = state.activeRoute.distance || 
                         calculateTotalRouteDistance(state.activeRoute.stops);
    const estimatedTime = Math.round(totalDistance * 2.5 + remainingStops * 5);
    
    const remainingEl = document.getElementById('remainingStops');
    const distanceEl = document.getElementById('totalDistance');
    const timeEl = document.getElementById('estimatedTime');
    
    if (remainingEl) remainingEl.textContent = remainingStops;
    if (distanceEl) distanceEl.textContent = totalDistance.toFixed(1);
    if (timeEl) timeEl.textContent = estimatedTime;
}

function updateDynamicHeader() {
    const routeTitle = document.getElementById('routeTitle');
    if (!routeTitle || !state.activeRoute) return;
    
    const nextStop = getNextStop();
    const currentStop = getCurrentStop();
    
    if (!nextStop) {
        routeTitle.textContent = 'Route Complete';
        return;
    }
    
    let headerText = '';
    
    if (currentStop && state.currentLocation) {
        headerText = `Your Location → ${getStopShortName(nextStop)}`;
    } else if (currentStop) {
        headerText = `${getStopShortName(currentStop)} → ${getStopShortName(nextStop)}`;
    } else {
        const firstStop = state.activeRoute.stops[0];
        headerText = `Starting → ${getStopShortName(firstStop)}`;
    }
    
    routeTitle.textContent = headerText;
}

function getStopShortName(stop) {
    if (!stop) return '';
    
    const address = stop.address;
    const patterns = [
        /^([^,]+),/,
        /^(.+?)(?:\s+Road|\s+Street|\s+Avenue|\s+Drive|\s+Centre|\s+Center)/i
    ];
    
    for (const pattern of patterns) {
        const match = address.match(pattern);
        if (match) {
            return match[1].trim();
        }
    }
    
    return address.length > 20 ? address.substring(0, 20) + '...' : address;
}

function getCurrentStop() {
    if (!state.activeRoute) return null;
    
    const completedStops = state.activeRoute.stops.filter(s => s.completed);
    if (completedStops.length === 0) return null;
    
    return completedStops[completedStops.length - 1];
}

function showRoutePanel() {
    const routePanel = document.getElementById('routePanel');
    const navControls = document.getElementById('navControls');
    const emptyState = document.getElementById('emptyState');
    
    if (routePanel) {
        routePanel.style.display = 'block';
        state.isPanelVisible = true;
        state.isPanelExpanded = false;
    }
    
    if (navControls) {
        navControls.style.display = 'flex';
        navControls.style.bottom = 'calc(30px + var(--safe-area-bottom))';
    }
    
    if (emptyState) {
        emptyState.style.display = 'none';
    }
}

function showEmptyState() {
    const routePanel = document.getElementById('routePanel');
    const navControls = document.getElementById('navControls');
    const emptyState = document.getElementById('emptyState');
    
    if (routePanel) routePanel.style.display = 'none';
    if (navControls) navControls.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
}

function enhanceRoutePanel() {
    const routePanel = document.getElementById('routePanel');
    if (!routePanel) return;
    
    const panelHandle = routePanel.querySelector('.panel-handle');
    if (panelHandle) {
        panelHandle.style.cursor = 'grab';
        
        let isDragging = false;
        let startY = 0;
        let startTransform = 0;
        
        panelHandle.addEventListener('touchstart', handleStart, { passive: true });
        panelHandle.addEventListener('touchmove', handleMove, { passive: false });
        panelHandle.addEventListener('touchend', handleEnd);
        
        panelHandle.addEventListener('mousedown', handleStart);
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
        
        function handleStart(e) {
            isDragging = true;
            panelHandle.style.cursor = 'grabbing';
            startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            const transform = routePanel.style.transform;
            const match = transform.match(/translateY\(calc\(100% - (\d+)px\)\)/);
            startTransform = match ? parseInt(match[1]) : 0;
        }
        
        function handleMove(e) {
            if (!isDragging) return;
            e.preventDefault();
            
            const currentY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            const deltaY = startY - currentY;
            const newHeight = Math.max(140, Math.min(window.innerHeight * 0.6, startTransform + deltaY));
            
            routePanel.style.transform = `translateY(calc(100% - ${newHeight}px))`;
            routePanel.style.maxHeight = `${newHeight}px`;
        }
        
        function handleEnd() {
            if (!isDragging) return;
            isDragging = false;
            panelHandle.style.cursor = 'grab';
            
            const currentHeight = parseInt(routePanel.style.maxHeight);
            if (currentHeight > 300) {
                routePanel.style.transform = 'translateY(0)';
                routePanel.style.maxHeight = '60%';
                state.isPanelExpanded = true;
            } else {
                routePanel.style.transform = 'translateY(calc(100% - 140px))';
                routePanel.style.maxHeight = '140px';
                state.isPanelExpanded = false;
            }
        }
    }
}

function waitForLeaflet() {
    return new Promise((resolve) => {
        if (window.L) {
            resolve();
        } else {
            const checkInterval = setInterval(() => {
                if (window.L) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        }
    });
}

function isNextStop(stop) {
    const nextStop = getNextStop();
    return nextStop && nextStop.id === stop.id;
}

function updateNavigationInfo() {
    // Called during navigation to update real-time info
}

window.toggleRoutePanel = function() {
    const routePanel = document.getElementById('routePanel');
    const navControls = document.getElementById('navControls');
    const toggleBtn = document.querySelector('.nav-button.secondary');
    
    if (!routePanel) return;
    
    if (routePanel.style.display === 'none' || !state.isPanelVisible) {
        routePanel.style.display = 'block';
        routePanel.style.transform = 'translateY(0)';
        routePanel.style.maxHeight = '60%';
        state.isPanelVisible = true;
        state.isPanelExpanded = true;
        
        if (navControls) {
            navControls.style.bottom = 'calc(60% + 20px + var(--safe-area-bottom))';
        }
        
        if (toggleBtn) {
            toggleBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
                <span>Hide</span>
            `;
        }
    } else {
        routePanel.style.display = 'none';
        state.isPanelVisible = false;
        state.isPanelExpanded = false;
        
        if (navControls) {
            navControls.style.bottom = 'calc(30px + var(--safe-area-bottom))';
        }
        
        if (toggleBtn) {
            toggleBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
                </svg>
                <span>Details</span>
            `;
        }
    }
    
    if (state.map) {
        setTimeout(() => {
            state.map.invalidateSize();
        }, 300);
    }
};

window.toggleFollowMode = function() {
    state.isFollowingUser = !state.isFollowingUser;
    const followText = document.getElementById('followModeText');
    if (followText) {
        followText.textContent = state.isFollowingUser ? 'Following On' : 'Following Off';
    }
    
    if (state.isFollowingUser && state.currentLocation) {
        state.map.panTo([state.currentLocation.lat, state.currentLocation.lng], {
            animate: true,
            duration: 1
        });
    }
    
    showNotification(state.isFollowingUser ? 'Following mode enabled' : 'Following mode disabled', 'info');
};

window.toggleHeadingMode = function() {
    state.config.headingUp = !state.config.headingUp;
    showNotification(state.config.headingUp ? 'Heading up mode (rotation requires plugin)' : 'North up mode', 'info');
};

window.navigateToStop = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop) return;
    
    state.navigationActive = true;
    showEnhancedNavigation(stop);
};

window.selectStop = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop || stop.completed) return;
    
    if (state.map) {
        state.map.setView([stop.location.lat, stop.location.lng], 16);
        
        const marker = state.markers.find(m => {
            const latLng = m.getLatLng();
            return latLng.lat === stop.location.lat && latLng.lng === stop.location.lng;
        });
        
        if (marker) {
            marker.openPopup();
        }
    }
};
// ============================================================================
// PART 5 OF 6 - MAP, NAVIGATION & LOCATION FUNCTIONS
// ============================================================================

async function initializeMap() {
    console.log('Initializing map with rotation support...');
    
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.error('Map container not found!');
        return;
    }
    
    mapContainer.style.width = '100%';
    mapContainer.style.height = '100%';
    
    let centerLat = -1.2921;
    let centerLng = 36.8219;
    
    if (state.activeRoute && state.activeRoute.stops && state.activeRoute.stops.length > 0) {
        const bounds = calculateBounds(state.activeRoute.stops);
        centerLat = (bounds.north + bounds.south) / 2;
        centerLng = (bounds.east + bounds.west) / 2;
    }
    
    state.map = L.map('map', {
        center: [centerLat, centerLng],
        zoom: 17,
        zoomControl: false,
        rotate: true,
        bearing: 0,
        touchRotate: true,
        shiftKeyRotate: true,
        rotateControl: {
            closeOnZeroBearing: false,
            position: 'topleft'
        },
        attributionControl: false
    });
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(state.map);
    
    L.control.zoom({
        position: 'bottomleft'
    }).addTo(state.map);
    
    L.control.scale({
        position: 'bottomleft',
        imperial: false
    }).addTo(state.map);
    
    if (L.Browser.touch && state.map.touchRotate) {
        state.map.touchRotate.enable();
    }
    
    setTimeout(() => {
        state.map.invalidateSize();
    }, 100);
    
    console.log('Map initialized with rotation enabled');
}

function updateCurrentLocation(position) {
    const newLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
    };
    
    if (state.currentLocation) {
        const distance = calculateDistance(state.currentLocation, newLocation);
        if (distance < 0.005) return;
    }
    
    state.currentLocation = newLocation;
    
    if (position.coords.heading !== null && position.coords.heading !== undefined) {
        state.currentHeading = position.coords.heading;
    } else if (state.lastLocation) {
        state.currentHeading = calculateBearing(state.lastLocation, state.currentLocation);
    }
    
    if (position.coords.speed !== null) {
        state.currentSpeed = Math.round(position.coords.speed * 3.6);
    }
    
    if (state.map) {
        if (!state.currentLocationMarker) {
            const riderIcon = createRiderIcon(state.currentHeading);
            state.currentLocationMarker = L.marker(
                [state.currentLocation.lat, state.currentLocation.lng],
                { 
                    icon: riderIcon,
                    zIndexOffset: 1000
                }
            ).addTo(state.map);
        } else {
            state.currentLocationMarker.setLatLng([state.currentLocation.lat, state.currentLocation.lng]);
            const riderIcon = createRiderIcon(state.currentHeading);
            state.currentLocationMarker.setIcon(riderIcon);
        }
        
        if (state.navigationActive && state.isFollowingUser) {
            state.map.panTo([state.currentLocation.lat, state.currentLocation.lng], {
                animate: true,
                duration: 1,
                noMoveStart: true
            });
            
            const targetZoom = calculateZoomFromSpeed(state.currentSpeed);
            const currentZoom = state.map.getZoom();
            if (Math.abs(currentZoom - targetZoom) > 0.5) {
                state.map.setZoom(targetZoom, {
                    animate: true,
                    duration: 1
                });
            }
        }
    }
    
    state.lastLocation = state.currentLocation;
    state.lastLocationTime = Date.now();
    
    if (state.navigationActive) {
        updateNavigationInfo();
    }
    
    updateDynamicHeader();
}

function calculateZoomFromSpeed(speed) {
    if (speed > 60) return 15;
    if (speed > 40) return 16;
    if (speed > 20) return 17;
    if (speed > 5) return 18;
    return 18;
}

function calculateBearing(start, end) {
    const dLng = (end.lng - start.lng) * Math.PI / 180;
    const lat1 = start.lat * Math.PI / 180;
    const lat2 = end.lat * Math.PI / 180;
    
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - 
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
}

function calculateBounds(stops) {
    let north = -90, south = 90, east = -180, west = 180;
    
    stops.forEach(stop => {
        if (stop.location) {
            north = Math.max(north, stop.location.lat);
            south = Math.min(south, stop.location.lat);
            east = Math.max(east, stop.location.lng);
            west = Math.min(west, stop.location.lng);
        }
    });
    
    return { north, south, east, west };
}

function createLeafletIcon(stop) {
    const isCompleted = stop.completed;
    const isActive = isNextStop(stop);
    const type = stop.type;
    
    const bgColor = isCompleted ? '#1C1C1F' : type === 'pickup' ? '#FF9F0A' : '#0066FF';
    const borderColor = isCompleted ? '#48484A' : '#FFFFFF';
    const symbol = isCompleted ? '✓' : type === 'pickup' ? 'P' : 'D';
    
    return L.divIcon({
        className: 'custom-marker',
        html: `
            <div class="stop-marker-wrapper ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}">
                <div class="stop-marker ${type}" style="
                    background: ${bgColor};
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    border: 3px solid ${borderColor};
                    position: relative;
                ">
                    <span style="
                        color: white;
                        font-weight: bold;
                        font-size: 20px;
                        ${isCompleted ? 'color: #8E8E93;' : ''}
                    ">${symbol}</span>
                    ${isActive ? '<div class="marker-pulse"></div>' : ''}
                </div>
                <div class="marker-label">${type === 'pickup' ? 'Pickup' : 'Delivery'}</div>
            </div>
        `,
        iconSize: [44, 70],
        iconAnchor: [22, 55],
        popupAnchor: [0, -55]
    });
}

function createStopPopup(stop) {
    const bgColor = stop.type === 'pickup' ? '#FF9F0A' : '#0066FF';
    const textColor = stop.type === 'pickup' ? 'black' : 'white';
    const paymentInfo = getPaymentInfoForStop(stop);
    
    return `
        <div class="stop-popup">
            <div class="popup-header ${stop.type}" style="background: ${bgColor}; color: ${textColor};">
                <span class="popup-phase">${stop.type.toUpperCase()}</span>
                <span class="popup-code">${stop.parcelCode}</span>
            </div>
            <div class="popup-body">
                <h3>${stop.address}</h3>
                <div class="popup-info">
                    <div class="info-row">
                        <span class="info-icon">👤</span>
                        <span>${stop.customerName}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-icon">📞</span>
                        <a href="tel:${stop.customerPhone}">${stop.customerPhone}</a>
                    </div>
                    ${stop.specialInstructions ? `
                        <div class="info-row instructions">
                            <span class="info-icon">💬</span>
                            <span>${stop.specialInstructions}</span>
                        </div>
                    ` : ''}
                    ${paymentInfo.needsCollection ? `
                        <div class="info-row payment" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.1);">
                            <span class="info-icon">💰</span>
                            <span style="font-weight: 600; color: var(--warning);">
                                Collect: KES ${paymentInfo.amount.toLocaleString()}
                            </span>
                        </div>
                    ` : paymentInfo.method === 'online' ? `
                        <div class="info-row payment" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.1);">
                            <span class="info-icon">✅</span>
                            <span style="color: var(--success);">Already Paid</span>
                        </div>
                    ` : ''}
                </div>
                ${!stop.completed && canCompleteStop(stop) ? `
                    <div class="popup-actions">
                        <button onclick="openVerificationModal('${stop.id}')">
                            ✓ Verify ${stop.type}
                        </button>
                        <button onclick="navigateToStop('${stop.id}')">
                            🧭 Navigate Here
                        </button>
                    </div>
                ` : stop.completed ? `
                    <div style="margin-top: 12px; padding: 8px; background: rgba(52, 199, 89, 0.1); border-radius: 8px; text-align: center; color: #34C759;">
                        ✓ Completed ${formatTimeAgo(stop.timestamp)}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

async function plotRoute() {
    if (!state.map || !state.activeRoute || !state.activeRoute.stops) return;
    
    // Clear existing markers
    state.markers.forEach(marker => marker.remove());
    state.markers = [];
    if (state.routePolyline) {
        state.routePolyline.remove();
        state.routePolyline = null;
    }
    
    if (state.radiusCircle) {
        state.radiusCircle.remove();
        state.radiusCircle = null;
    }
    
    const bounds = L.latLngBounds();
    
    // Add markers for each stop
    state.activeRoute.stops.forEach((stop, index) => {
        const marker = L.marker([stop.location.lat, stop.location.lng], {
            icon: createLeafletIcon(stop)
        })
        .addTo(state.map)
        .bindPopup(createStopPopup(stop));
        
        state.markers.push(marker);
        bounds.extend([stop.location.lat, stop.location.lng]);
    });
    
    state.map.fitBounds(bounds, { padding: [50, 50] });
}

async function drawOptimizedRoute() {
    if (!state.activeRoute) return;
    
    const stops = state.activeRoute.stops.filter(s => !s.completed);
    if (stops.length < 2) {
        console.log('Not enough stops to draw route');
        return;
    }
    
    try {
        if (state.routePolyline) {
            state.routePolyline.remove();
            state.routePolyline = null;
        }
        
        let coordinates = [];
        if (state.currentLocation && state.navigationActive) {
            coordinates.push([state.currentLocation.lng, state.currentLocation.lat]);
        }
        
        coordinates = coordinates.concat(stops.map(stop => [stop.location.lng, stop.location.lat]));
        
        const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
            method: 'POST',
            headers: {
                'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
                'Content-Type': 'application/json',
                'Authorization': OPENROUTE_API_KEY
            },
            body: JSON.stringify({
                coordinates: coordinates,
                continue_straight: false,
                elevation: false,
                extra_info: [],
                geometry: true,
                instructions: false,
                preference: 'recommended',
                units: 'km'
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouteService error:', errorText);
            throw new Error('OpenRouteService API error');
        }
        
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const decodedCoords = decodePolyline(route.geometry);
            
            state.routePolyline = L.polyline(decodedCoords, {
                color: '#0066FF',
                weight: 6,
                opacity: 0.8,
                smoothFactor: 1
            }).addTo(state.map);
            
            const distance = (route.summary.distance / 1000).toFixed(1);
            const duration = Math.round(route.summary.duration / 60);
            
            if (document.getElementById('totalDistance')) {
                document.getElementById('totalDistance').textContent = distance;
            }
            if (document.getElementById('estimatedTime')) {
                document.getElementById('estimatedTime').textContent = duration;
            }
        }
    } catch (error) {
        console.error('Error getting route:', error);
        drawFallbackRoute(stops);
    }
}

function drawFallbackRoute(stops) {
    console.log('Drawing fallback route');
    const coords = stops.map(stop => [stop.location.lat, stop.location.lng]);
    
    if (state.currentLocation && state.navigationActive) {
        coords.unshift([state.currentLocation.lat, state.currentLocation.lng]);
    }
    
    state.routePolyline = L.polyline(coords, {
        color: '#0066FF',
        weight: 4,
        opacity: 0.6,
        dashArray: '10, 10',
        smoothFactor: 1
    }).addTo(state.map);
}

function decodePolyline(encoded) {
    const poly = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
        let b;
        let shift = 0;
        let result = 0;
        
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        
        const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;

        shift = 0;
        result = 0;
        
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        
        const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;

        poly.push([lat / 1E5, lng / 1E5]);
    }

    return poly;
}

function calculateETA(distance) {
    const avgSpeed = 30;
    const timeInHours = distance / avgSpeed;
    const timeInMinutes = Math.round(timeInHours * 60);
    
    const now = new Date();
    const eta = new Date(now.getTime() + timeInMinutes * 60000);
    
    return eta.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
    });
}

function startLocationTracking() {
    if (!navigator.geolocation) {
        showNotification('Location services not available', 'warning');
        return;
    }
    
    const geoOptions = {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
    };
    
    navigator.geolocation.getCurrentPosition(
        position => {
            updateCurrentLocation(position);
            state.isTracking = true;
            
            const trackingIndicator = document.getElementById('trackingIndicator');
            if (trackingIndicator) trackingIndicator.style.display = 'flex';
            
            const locationButton = document.getElementById('locationButton');
            if (locationButton) locationButton.classList.add('active');
            
            if (state.map && state.currentLocation) {
                state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 17);
            }
        },
        error => {
            console.error('Location error:', error);
            showNotification('Please enable location services', 'warning');
        },
        geoOptions
    );
    
    state.locationWatchId = navigator.geolocation.watchPosition(
        position => updateCurrentLocation(position),
        error => console.error('Location update error:', error),
        geoOptions
    );
}

// Navigation control functions
window.centerOnLocation = function() {
    if (state.currentLocation && state.map) {
        state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 16);
        showNotification('Centered on your location', 'info');
    } else {
        showNotification('Getting your location...', 'info');
        startLocationTracking();
    }
};

window.startNavigation = function() {
    const nextStop = getNextStop();
    if (!nextStop) {
        showNotification('No stops to navigate to', 'warning');
        return;
    }
    
    if (!state.routePolyline) {
        showNotification('Optimizing route...', 'info');
        drawOptimizedRoute().then(() => {
            proceedWithNavigation(nextStop);
        });
    } else {
        proceedWithNavigation(nextStop);
    }
};

function proceedWithNavigation(nextStop) {
    startContinuousTracking();
    showEnhancedNavigation(nextStop);
    state.navigationActive = true;
}

function startContinuousTracking() {
    if (state.trackingInterval) {
        clearInterval(state.trackingInterval);
    }
    
    state.trackingInterval = setInterval(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    updateCurrentLocation(position);
                    checkStopProximity();
                },
                error => console.error('Tracking error:', error),
                { enableHighAccuracy: true, maximumAge: 5000 }
            );
        }
    }, 5000);
}

function checkStopProximity() {
    if (!state.currentLocation || !state.activeRoute) return;
    
    const nextStop = getNextStop();
    if (!nextStop) return;
    
    const distance = calculateDistance(
        state.currentLocation,
        nextStop.location
    );
    
    if (distance < 0.1 && !state.proximityNotified) {
        state.proximityNotified = true;
        
        const paymentInfo = getPaymentInfoForStop(nextStop);
        if (nextStop.type === 'delivery' && paymentInfo.needsCollection) {
            showNotification(
                `💰 Approaching delivery - Remember to collect KES ${paymentInfo.amount.toLocaleString()}`,
                'warning'
            );
        } else {
            showNotification(
                `Approaching ${nextStop.type} location - ${Math.round(distance * 1000)}m away`,
                'info'
            );
        }
        
        setTimeout(() => {
            state.proximityNotified = false;
        }, 300000);
    }
}
// ============================================================================
// PART 6 OF 6 (FINAL) - NAVIGATION UI, VERIFICATION & COMPLETION
// ============================================================================

// Display functions continued from Part 4
function displayStops() {
    const stopsList = document.getElementById('stopsList');
    if (!stopsList || !state.activeRoute) return;
    
    // In dynamic mode, show all stops in optimized order
    // In phased mode, separate pickups and deliveries
    if (config.optimization.enableDynamicRouting) {
        displayDynamicStops();
    } else {
        displayPhasedStops();
    }
}

function displayDynamicStops() {
    const stopsList = document.getElementById('stopsList');
    if (!stopsList) return;
    
    updateParcelsInPossession();
    
    let html = '';
    
    // Add route efficiency badge
    const efficiency = analyzeRouteEfficiency(state.activeRoute.stops);
    const efficiencyClass = efficiency.efficiencyScore > 80 ? 'efficiency-high' : 
                           efficiency.efficiencyScore > 60 ? 'efficiency-medium' : 'efficiency-low';
    
    html += `
        <div class="route-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
            <h3 style="margin: 0;">Optimized Route</h3>
            <span class="route-efficiency-badge ${efficiencyClass}">
                ⚡ ${Math.round(efficiency.efficiencyScore)}% Efficient
            </span>
        </div>
    `;
    
    if (state.parcelsInPossession.length > 0) {
        html += createParcelsInPossessionWidget();
    }
    
    // Display all stops in optimized order
    html += `<div class="optimized-stops">`;
    state.activeRoute.stops.forEach((stop, index) => {
        html += createStopCard(stop, index + 1, stop.type, false);
    });
    html += `</div>`;
    
    stopsList.innerHTML = html;
}

function displayPhasedStops() {
    const stopsList = document.getElementById('stopsList');
    if (!stopsList) return;
    
    const pickupStops = state.activeRoute.stops.filter(s => s.type === 'pickup');
    const deliveryStops = state.activeRoute.stops.filter(s => s.type === 'delivery');
    
    updateParcelsInPossession();
    
    let html = '';
    
    html += createPhaseProgressWidget(pickupStops, deliveryStops);
    
    if (state.parcelsInPossession.length > 0) {
        html += createParcelsInPossessionWidget();
    }
    
    html += `
        <div class="phase-section ${allCompleted(pickupStops) ? 'completed' : ''}">
            <h3>
                <span>📦 Pickup Phase</span>
                <span class="phase-count">${pickupStops.filter(s => s.completed).length}/${pickupStops.length}</span>
            </h3>
            <div class="phase-stops">
                ${pickupStops.map((stop, index) => createStopCard(stop, index + 1, 'pickup')).join('')}
            </div>
        </div>
    `;
    
    const deliveryLocked = !allCompleted(pickupStops);
    html += `
        <div class="phase-section ${deliveryLocked ? 'locked' : ''} ${allCompleted(deliveryStops) ? 'completed' : ''}">
            <h3>
                <span>📍 Delivery Phase</span>
                <span class="phase-count">${deliveryStops.filter(s => s.completed).length}/${deliveryStops.length}</span>
            </h3>
            <div class="phase-stops">
                ${deliveryStops.map((stop, index) => createStopCard(stop, index + 1, 'delivery', deliveryLocked)).join('')}
            </div>
        </div>
    `;
    
    stopsList.innerHTML = html;
}

function createPhaseProgressWidget(pickupStops, deliveryStops) {
    const pickupsComplete = pickupStops.filter(s => s.completed).length;
    const deliveriesComplete = deliveryStops.filter(s => s.completed).length;
    
    return `
        <div class="route-phases">
            <div class="phase ${pickupsComplete === pickupStops.length ? 'completed' : pickupsComplete > 0 ? 'active' : ''}">
                <div class="phase-icon">📦</div>
                <div class="phase-info">
                    <div class="phase-title">Pickups</div>
                    <div class="phase-progress">${pickupsComplete}/${pickupStops.length}</div>
                </div>
            </div>
            
            <div class="phase-arrow">→</div>
            
            <div class="phase ${deliveriesComplete === deliveryStops.length ? 'completed' : deliveriesComplete > 0 ? 'active' : ''}">
                <div class="phase-icon">📍</div>
                <div class="phase-info">
                    <div class="phase-title">Deliveries</div>
                    <div class="phase-progress">${deliveriesComplete}/${deliveryStops.length}</div>
                </div>
            </div>
        </div>
    `;
}

function createParcelsInPossessionWidget() {
    return `
        <div class="parcels-possession-widget" style="background: linear-gradient(135deg, rgba(255, 159, 10, 0.15), rgba(255, 107, 0, 0.1)); border: 1px solid rgba(255, 159, 10, 0.3); border-radius: 16px; padding: 18px; margin-bottom: 20px;">
            <div class="carrying-banner" style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
                <span class="carrying-icon">📦</span>
                <span style="font-weight: 700; color: white; font-size: 15px;">Carrying ${state.parcelsInPossession.length} parcel${state.parcelsInPossession.length > 1 ? 's' : ''}</span>
            </div>
            <div class="parcel-cards" style="display: flex; flex-direction: column; gap: 10px;">
                ${state.parcelsInPossession.map(parcel => {
                    const deliveryStop = state.activeRoute.stops.find(s => 
                        s.type === 'delivery' && s.parcelId === parcel.parcelId
                    );
                    const paymentInfo = deliveryStop ? getPaymentInfoForStop(deliveryStop) : null;
                    
                    return `
                        <div class="parcel-card" style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 14px; border-left: 3px solid #FF9F0A;">
                            <div class="parcel-code" style="font-weight: 700; margin-bottom: 4px; color: white; font-size: 15px;">${parcel.parcelCode}</div>
                            <div class="parcel-destination" style="font-size: 14px; color: rgba(255, 255, 255, 0.6); margin-bottom: 4px;">${parcel.destination}</div>
                            <div class="parcel-time" style="font-size: 12px; color: rgba(255, 255, 255, 0.4);">Picked up ${formatTimeAgo(parcel.pickupTime)}</div>
                            ${paymentInfo && paymentInfo.needsCollection ? `
                                <div style="margin-top: 8px; font-size: 14px; font-weight: 700; color: #FF9F0A;">
                                    💰 Collect: KES ${paymentInfo.amount.toLocaleString()}
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function updateParcelsInPossession() {
    state.parcelsInPossession = [];
    
    if (!state.activeRoute || !state.activeRoute.stops) return;
    
    state.activeRoute.stops.forEach(stop => {
        if (stop.type === 'pickup' && stop.completed) {
            const deliveryStop = state.activeRoute.stops.find(s => 
                s.type === 'delivery' && s.parcelId === stop.parcelId
            );
            
            if (deliveryStop && !deliveryStop.completed) {
                state.parcelsInPossession.push({
                    parcelId: stop.parcelId,
                    parcelCode: stop.parcelCode,
                    pickupTime: stop.timestamp,
                    destination: deliveryStop.address
                });
            }
        }
    });
}

function createStopCard(stop, number, type, isLocked = false) {
    const isActive = isNextStop(stop);
    const canInteract = !stop.completed && !isLocked && (type === 'pickup' || canCompleteDelivery(stop));
    const paymentInfo = getPaymentInfoForStop(stop);
    
    return `
        <div class="stop-card ${stop.completed ? 'completed' : ''} ${isActive ? 'active' : ''} ${isLocked ? 'blocked' : ''}" 
             onclick="${canInteract ? `selectStop('${stop.id}')` : ''}"
             data-stop-id="${stop.id}">
            <div class="stop-number-badge ${type}">
                ${stop.completed ? '✓' : number}
            </div>
            <div class="stop-content">
                <div class="stop-header">
                    <h3 class="stop-address">${stop.address}</h3>
                    ${stop.distance ? `<span class="stop-distance">${stop.distance} km</span>` : ''}
                </div>
                <div class="stop-details">
                    <div class="detail-row">
                        <span class="detail-icon">👤</span>
                        <span>${stop.customerName} • ${stop.customerPhone}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">📋</span>
                        <span>Code: ${stop.parcelCode}</span>
                    </div>
                    ${stop.specialInstructions ? `
                        <div class="detail-row instructions">
                            <span class="detail-icon">💬</span>
                            <span>${stop.specialInstructions}</span>
                        </div>
                    ` : ''}
                </div>
                
                ${type === 'delivery' && paymentInfo.needsCollection ? `
                    <div class="payment-badge ${stop.completed ? 'collected' : ''}">
                        <span>💵</span>
                        <span>${stop.completed ? 'Collected' : 'COLLECT'}: KES ${paymentInfo.amount.toLocaleString()}</span>
                    </div>
                ` : type === 'delivery' && paymentInfo.method === 'online' ? `
                    <div class="payment-badge prepaid">
                        <span>✅</span>
                        <span>Already Paid</span>
                    </div>
                ` : ''}
                
                ${stop.completed ? `
                    <div class="stop-status completed">
                        ✓ Completed ${formatTimeAgo(stop.timestamp)}
                    </div>
                ` : isActive ? `
                    <div class="stop-status active">
                        → Current Stop
                    </div>
                ` : isLocked ? `
                    <div class="stop-status blocked">
                        🔒 Complete pickups first
                    </div>
                ` : ''}
            </div>
            <div class="stop-actions">
                ${!stop.completed && canInteract ? `
                    <button class="action-btn navigate" onclick="event.stopPropagation(); navigateToStop('${stop.id}')">
                        🧭
                    </button>
                    <a href="tel:${stop.customerPhone}" class="action-btn call" onclick="event.stopPropagation();">
                        📞
                    </a>
                ` : ''}
            </div>
        </div>
    `;
}

// Helper functions
function isNextStop(stop) {
    const nextStop = getNextStop();
    return nextStop && nextStop.id === stop.id;
}

function canCompleteDelivery(deliveryStop) {
    if (!state.activeRoute || !state.activeRoute.stops) return false;
    
    const pickupStop = state.activeRoute.stops.find(s => 
        s.type === 'pickup' && s.parcelId === deliveryStop.parcelId
    );
    
    return pickupStop && pickupStop.completed;
}

function canCompleteStop(stop) {
    if (stop.type === 'pickup') return true;
    return canCompleteDelivery(stop);
}

function allCompleted(stops) {
    return stops.every(s => s.completed);
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const minutes = Math.floor((Date.now() - new Date(timestamp)) / 60000);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
}

// Verification functions
window.openQuickVerification = function() {
    const nextStop = getNextStop();
    if (nextStop) {
        openVerificationModal(nextStop.id);
    }
};

window.openVerificationModal = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop || stop.completed) return;
    
    const paymentInfo = getPaymentInfoForStop(stop);
    
    const modal = document.createElement('div');
    modal.className = 'verification-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeVerificationModal()"></div>
        <div class="modal-content">
            <div class="modal-header ${stop.type}">
                <span class="modal-icon">${stop.type === 'pickup' ? '📦' : '📍'}</span>
                <h2>Verify ${stop.type === 'pickup' ? 'Pickup' : 'Delivery'}</h2>
            </div>
            <div class="modal-body">
                <div class="stop-summary">
                    <h3>${stop.address}</h3>
                    <div class="summary-details">
                        <div class="summary-row">
                            <span class="summary-label">Customer:</span>
                            <span class="summary-value">${stop.customerName}</span>
                        </div>
                        <div class="summary-row">
                            <span class="summary-label">Phone:</span>
                            <span class="summary-value">${stop.customerPhone}</span>
                        </div>
                        <div class="summary-row">
                            <span class="summary-label">Parcel Code:</span>
                            <span class="summary-value">${stop.parcelCode}</span>
                        </div>
                    </div>
                </div>
                
                <div class="verification-section">
                    <label style="font-weight: 600; font-size: 15px;">Enter ${stop.type} verification code:</label>
                    <input type="text" 
                           class="verification-input" 
                           id="verificationCode" 
                           placeholder="XXX-XXXX"
                           maxlength="8"
                           autocomplete="off">
                    <p class="code-hint" style="font-size: 13px; color: rgba(255, 255, 255, 0.5); text-align: center; margin-top: 8px;">
                        Ask the ${stop.type === 'pickup' ? 'sender' : 'recipient'} for their code
                    </p>
                </div>
                
                ${stop.type === 'delivery' && paymentInfo.needsCollection ? `
                    <div style="margin-top: 18px; padding: 14px; background: rgba(255, 255, 255, 0.05); border-radius: 12px;">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-weight: 600;">
                            <input type="checkbox" id="paymentCollected" style="width: 22px; height: 22px; cursor: pointer;">
                            <span style="font-size: 15px;">I have collected KES ${paymentInfo.amount.toLocaleString()} cash</span>
                        </label>
                    </div>
                ` : ''}
                
                <div class="modal-actions" style="display: flex; gap: 12px; margin-top: 24px;">
                    <button class="modal-btn primary" onclick="verifyCode('${stop.id}')">
                        <span>✓</span>
                        <span>Verify ${stop.type === 'pickup' ? 'Pickup' : 'Delivery'}</span>
                    </button>
                    <button class="modal-btn secondary" onclick="closeVerificationModal()">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    setTimeout(() => {
        document.getElementById('verificationCode').focus();
    }, 100);
};

window.closeVerificationModal = function() {
    const modal = document.querySelector('.verification-modal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 300);
    }
};

window.verifyCode = async function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop) return;
    
    const codeInput = document.getElementById('verificationCode');
    const code = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const paymentInfo = getPaymentInfoForStop(stop);
    
    // Demo mode - accept any code for testing
    const isValidCode = DEV_CONFIG.isDevelopment ? 
        code.length >= 6 : 
        code === stop.verificationCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    if (!isValidCode) {
        codeInput.classList.add('error');
        showNotification('Invalid code. Please try again.', 'error');
        return;
    }
    
    if (stop.type === 'delivery' && paymentInfo.needsCollection) {
        const paymentCheckbox = document.getElementById('paymentCollected');
        if (paymentCheckbox && !paymentCheckbox.checked) {
            showNotification('Please confirm cash collection before verifying', 'warning');
            return;
        }
    }
    
    stop.completed = true;
    stop.timestamp = new Date();
    
    if (stop.type === 'delivery' && paymentInfo.needsCollection) {
        state.paymentsByStop[stop.id] = {
            collected: true,
            amount: paymentInfo.amount,
            timestamp: stop.timestamp
        };
        updateCashCollectionWidget();
    }
    
    await syncRouteData();
    
    closeVerificationModal();
    showSuccessAnimation(stop.type);
    
    displayRouteInfo();
    plotRoute();
    drawOptimizedRoute();
    
    if (state.activeRoute.stops.every(s => s.completed)) {
        await completeRoute();
    }
};

function showSuccessAnimation(type) {
    const animation = document.createElement('div');
    animation.className = 'success-animation';
    animation.innerHTML = `
        <div class="success-icon">✓</div>
        <div class="success-text">${type === 'pickup' ? 'Pickup' : 'Delivery'} Verified!</div>
    `;
    
    document.body.appendChild(animation);
    setTimeout(() => animation.remove(), 2000);
}

async function completeRoute() {
    console.log('Completing route...');
    
    await handleRouteCompletion();
    
    const animation = document.createElement('div');
    animation.className = 'route-complete-animation';
    animation.innerHTML = `
        <div class="route-complete-content">
            <div class="complete-icon">🏆</div>
            <h1>Route Complete!</h1>
            <p>Excellent work! All deliveries completed successfully.</p>
            <div class="route-stats">
                <div class="stat">
                    <span class="stat-value">${state.activeRoute.stops.length}</span>
                    <span class="stat-label">Stops</span>
                </div>
                <div class="stat">
                    <span class="stat-value">KES ${Math.round(state.totalRouteEarnings)}</span>
                    <span class="stat-label">Earned</span>
                </div>
                ${state.totalCashCollected > 0 ? `
                    <div class="stat">
                        <span class="stat-value">KES ${Math.round(state.totalCashCollected)}</span>
                        <span class="stat-label">Cash Collected</span>
                    </div>
                ` : ''}
            </div>
            ${state.optimizationStats.savedDistance > 0 ? `
                <div class="optimization-summary">
                    <p>Route optimization saved ${state.optimizationStats.savedDistance.toFixed(1)}km (${state.optimizationStats.savedPercentage}%)</p>
                </div>
            ` : ''}
            <button class="complete-btn" onclick="finishRoute()">
                Back to Dashboard
            </button>
        </div>
    `;
    
    document.body.appendChild(animation);
}

window.finishRoute = function() {
    window.location.href = './rider.html';
};

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span class="notification-icon">
            ${type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ'}
        </span>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Route.js v3.0.0 initializing with dynamic optimization...');
    
    injectNavigationStyles();
    
    try {
        const storedRoute = localStorage.getItem('tuma_active_route');
        
        if (storedRoute) {
            state.activeRoute = JSON.parse(storedRoute);
            console.log('Route loaded:', state.activeRoute);
            console.log('Optimization mode:', config.optimization.enableDynamicRouting ? 'Dynamic' : 'Phased');
            
            calculateRouteFinancials();
            calculateCashCollection();
            
            await initializeMap();
            
            displayRouteInfo();
            
            await plotRoute();
            await drawOptimizedRoute();
            
            initializeOptimizeButton();
            
            if (state.totalCashToCollect > 0) {
                showCashCollectionWidget();
            }
            
            startLocationTracking();
        } else {
            console.log('No active route found');
        }
    } catch (error) {
        console.error('Error initializing route:', error);
    }
});

// Debug utilities
window.routeDebug = {
    state,
    config,
    toggleMode: toggleOptimizationMode,
    analyzeEfficiency: () => analyzeRouteEfficiency(state.activeRoute?.stops || []),
    testOptimization: () => {
        if (!state.activeRoute) {
            console.log('No route loaded');
            return;
        }
        
        console.log('Testing both optimization modes...');
        
        // Test dynamic
        config.optimization.enableDynamicRouting = true;
        const dynamicResult = performDynamicOptimization([...state.activeRoute.stops]);
        const dynamicDistance = calculateTotalRouteDistance(dynamicResult);
        
        // Test phased
        config.optimization.enableDynamicRouting = false;
        const phasedResult = performPhasedOptimization([...state.activeRoute.stops]);
        const phasedDistance = calculateTotalRouteDistance(phasedResult);
        
        console.log('=== Optimization Comparison ===');
        console.log('Dynamic distance:', dynamicDistance.toFixed(1), 'km');
        console.log('Phased distance:', phasedDistance.toFixed(1), 'km');
        console.log('Dynamic saves:', (phasedDistance - dynamicDistance).toFixed(1), 'km');
        
        return {
            dynamic: dynamicResult,
            phased: phasedResult,
            savings: phasedDistance - dynamicDistance
        };
    }
};

console.log('✅ Enhanced Route.js v3.0.0 loaded successfully!');
console.log('Features: Dynamic route optimization with smart pickup/delivery interleaving');
console.log('Debug: window.routeDebug');

// END OF COMPLETE ROUTE.JS FILE
