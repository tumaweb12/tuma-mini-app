/**
 * Complete Enhanced Route Navigation Module with Payment Collection and Route Optimization
 * Premium UI with elegant cash collection widget and professional fonts
 * Version: 2.0.0
 * COMPLETE FILE - PART 1 OF 5
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
    mapRotatable: true
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
    paymentsByStop: {}
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
// ROUTE OPTIMIZATION FUNCTIONS
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
    
    console.log('Starting route optimization...');
    
    const originalStops = [...state.activeRoute.stops];
    const originalDistance = calculateTotalRouteDistance(originalStops);
    
    showOptimizingAnimation();
    
    setTimeout(() => {
        const optimizedStops = performSmartOptimization(originalStops);
        const optimizedDistance = calculateTotalRouteDistance(optimizedStops);
        
        const savedDistance = originalDistance - optimizedDistance;
        const savedPercentage = ((savedDistance / originalDistance) * 100).toFixed(1);
        
        state.activeRoute.stops = optimizedStops;
        state.activeRoute.isOptimized = true;
        state.activeRoute.originalDistance = originalDistance;
        state.activeRoute.optimizedDistance = optimizedDistance;
        
        localStorage.setItem('tuma_active_route', JSON.stringify(state.activeRoute));
        
        displayRouteInfo();
        plotRoute();
        drawOptimizedRoute();
        
        hideOptimizingAnimation();
        showOptimizationResults(savedDistance, savedPercentage);
        
        updateOptimizeButton(true);
        
        console.log(`Optimization complete! Saved ${savedDistance.toFixed(1)}km (${savedPercentage}%)`);
    }, 1000);
}

function performSmartOptimization(stops) {
    const zones = groupStopsByZone(stops);
    const orderedZones = optimizeZoneOrder(zones);
    const optimizedStops = [];
    
    orderedZones.forEach(zone => {
        const zoneStops = optimizeZoneStops(zone.stops);
        optimizedStops.push(...zoneStops);
    });
    
    return validateAndAdjustSequence(optimizedStops);
}

function groupStopsByZone(stops) {
    const zones = {};
    
    stops.forEach(stop => {
        const zone = detectZone(stop);
        if (!zones[zone]) {
            zones[zone] = {
                name: zone,
                center: getZoneCenter(zone),
                stops: []
            };
        }
        zones[zone].stops.push(stop);
    });
    
    return zones;
}

function detectZone(stop) {
    const lat = stop.location.lat;
    const lng = stop.location.lng;
    
    if (lat > -1.25 && lng < 36.75) return 'Parklands';
    if (lat > -1.27 && lng > 36.85) return 'Eastlands';
    if (lat < -1.30 && lng < 36.78) return 'Karen/Langata';
    if (lat > -1.27 && lng < 36.82) return 'Westlands';
    if (lat < -1.28 && lat > -1.30 && lng > 36.80 && lng < 36.84) return 'CBD';
    if (lat < -1.29 && lng > 36.82) return 'Upper Hill';
    if (lat < -1.32) return 'South';
    
    const address = stop.address.toLowerCase();
    if (address.includes('westlands')) return 'Westlands';
    if (address.includes('cbd') || address.includes('central')) return 'CBD';
    if (address.includes('karen')) return 'Karen/Langata';
    if (address.includes('kilimani')) return 'Kilimani';
    if (address.includes('upper hill')) return 'Upper Hill';
    if (address.includes('eastlands') || address.includes('eastleigh')) return 'Eastlands';
    
    return 'General';
}

function getZoneCenter(zoneName) {
    const centers = {
        'CBD': { lat: -1.2833, lng: 36.8167 },
        'Westlands': { lat: -1.2634, lng: 36.8097 },
        'Kilimani': { lat: -1.2906, lng: 36.7853 },
        'Karen/Langata': { lat: -1.3194, lng: 36.7096 },
        'Eastlands': { lat: -1.2921, lng: 36.8608 },
        'Upper Hill': { lat: -1.2975, lng: 36.8189 },
        'Parklands': { lat: -1.2570, lng: 36.8194 },
        'South': { lat: -1.3200, lng: 36.8200 },
        'General': { lat: -1.2921, lng: 36.8219 }
    };
    
    return centers[zoneName] || centers['General'];
}

function optimizeZoneOrder(zones) {
    const zoneArray = Object.values(zones);
    if (zoneArray.length <= 1) return zoneArray;
    
    const startZone = zoneArray.find(z => z.name === 'CBD') || 
                     zoneArray.reduce((max, z) => z.stops.length > max.stops.length ? z : max);
    
    const ordered = [startZone];
    const remaining = zoneArray.filter(z => z !== startZone);
    
    while (remaining.length > 0) {
        const current = ordered[ordered.length - 1];
        let nearestIndex = 0;
        let minDistance = Infinity;
        
        remaining.forEach((zone, index) => {
            const distance = calculateDistance(current.center, zone.center);
            if (distance < minDistance) {
                minDistance = distance;
                nearestIndex = index;
            }
        });
        
        ordered.push(remaining.splice(nearestIndex, 1)[0]);
    }
    
    return ordered;
}

function optimizeZoneStops(stops) {
    if (stops.length <= 2) return stops;
    
    const pickups = stops.filter(s => s.type === 'pickup');
    const deliveries = stops.filter(s => s.type === 'delivery');
    
    if (stops.length <= 4) {
        return [...pickups, ...deliveries];
    }
    
    const optimized = [];
    const processedParcels = new Set();
    
    pickups.forEach(pickup => {
        optimized.push(pickup);
        processedParcels.add(pickup.parcelId);
        
        const delivery = deliveries.find(d => d.parcelId === pickup.parcelId);
        if (delivery) {
            const distance = calculateDistance(pickup.location, delivery.location);
            if (distance < 2) {
                optimized.push(delivery);
                processedParcels.add(delivery.parcelId);
            }
        }
    });
    
    deliveries.forEach(delivery => {
        if (!optimized.includes(delivery)) {
            optimized.push(delivery);
        }
    });
    
    return optimized;
}

function validateAndAdjustSequence(stops) {
    const validated = [];
    const deliveryQueue = [];
    
    stops.forEach(stop => {
        if (stop.type === 'pickup') {
            validated.push(stop);
            const queuedDelivery = deliveryQueue.find(d => d.parcelId === stop.parcelId);
            if (queuedDelivery) {
                validated.push(queuedDelivery);
                deliveryQueue.splice(deliveryQueue.indexOf(queuedDelivery), 1);
            }
        } else {
            const pickupDone = validated.some(s => s.type === 'pickup' && s.parcelId === stop.parcelId);
            if (pickupDone) {
                validated.push(stop);
            } else {
                deliveryQueue.push(stop);
            }
        }
    });
    
    validated.push(...deliveryQueue);
    return validated;
}

function calculateTotalRouteDistance(stops) {
    if (!stops || stops.length === 0) return 0;
    
    let totalDistance = 0;
    
    for (let i = 0; i < stops.length - 1; i++) {
        totalDistance += calculateDistance(stops[i].location, stops[i + 1].location);
    }
    
    return totalDistance;
}

function undoOptimization() {
    const storedRoute = localStorage.getItem('tuma_original_route');
    if (!storedRoute) {
        showNotification('No original route to restore', 'warning');
        return;
    }
    
    const originalRoute = JSON.parse(storedRoute);
    state.activeRoute = originalRoute;
    state.activeRoute.isOptimized = false;
    
    localStorage.setItem('tuma_active_route', JSON.stringify(state.activeRoute));
    localStorage.removeItem('tuma_original_route');
    
    displayRouteInfo();
    plotRoute();
    drawOptimizedRoute();
    
    updateOptimizeButton(false);
    showNotification('Route restored to original order', 'info');
}
// ============================================================================
// PART 2 OF 5 - UI FUNCTIONS AND STYLES
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
        
        /* GLASSMORPHIC CASH COLLECTION WIDGET - GREEN MONEY THEME */
        .cash-collection-widget {
            position: fixed;
            top: 70px;
            right: 12px;
            left: 12px;
            background: linear-gradient(135deg, rgba(46, 125, 50, 0.85) 0%, rgba(67, 160, 71, 0.75) 100%);
            backdrop-filter: blur(16px) saturate(180%);
            -webkit-backdrop-filter: blur(16px) saturate(180%);
            border-radius: 20px;
            padding: 16px 18px;
            box-shadow: 0 8px 32px rgba(46, 125, 50, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
            z-index: 95;
            transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            border: 1px solid rgba(255, 255, 255, 0.18);
            font-weight: 500;
            position: relative;
            overflow: hidden;
            max-width: 400px;
            margin: 0 auto;
        }
        
        @media (min-width: 428px) {
            .cash-collection-widget {
                left: auto;
                right: 20px;
                max-width: 280px;
            }
        }
        
        .cash-collection-widget::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 50%;
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.15) 0%, transparent 100%);
            pointer-events: none;
        }
        
        .cash-collection-widget::after {
            content: '💰';
            position: absolute;
            top: 16px;
            right: 18px;
            font-size: 24px;
            opacity: 0.3;
            animation: float 3s ease-in-out infinite;
        }
        
        @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
        }
        
        .cash-collection-widget.has-pending {
            background: linear-gradient(135deg, rgba(255, 152, 0, 0.85) 0%, rgba(255, 183, 77, 0.75) 100%);
            box-shadow: 0 8px 32px rgba(255, 152, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
            animation: pulseGlow 2s ease-in-out infinite;
        }
        
        @keyframes pulseGlow {
            0%, 100% { box-shadow: 0 8px 32px rgba(255, 152, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2); }
            50% { box-shadow: 0 8px 40px rgba(255, 152, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.3); }
        }
        
        .cash-widget-title {
            font-size: 11px;
            font-weight: 700
        
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
            color: var(--text-primary);
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
        
        /* Payment badge styles */
        .payment-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: linear-gradient(135deg, rgba(255, 159, 10, 0.15), rgba(255, 107, 0, 0.1));
            border: 1px solid #FF9F0A;
            border-radius: 24px;
            padding: 8px 14px;
            margin-top: 10px;
            font-size: 13px;
            font-weight: 600;
            color: #FF9F0A;
            letter-spacing: 0.3px;
        }
        
        .payment-badge.collected {
            background: linear-gradient(135deg, rgba(52, 199, 89, 0.15), rgba(48, 209, 88, 0.1));
            border-color: #34C759;
            color: #34C759;
        }
        
        .payment-badge.prepaid {
            background: linear-gradient(135deg, rgba(0, 102, 255, 0.15), rgba(0, 88, 255, 0.1));
            border-color: #0066FF;
            color: #0066FF;
        }
        
        /* Payment reminder */
        .payment-reminder {
            position: fixed;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #FF9F0A, #FF6B00);
            color: #0A0A0B;
            padding: 10px 20px;
            border-radius: 24px;
            font-size: 14px;
            font-weight: 700;
            box-shadow: 0 4px 15px rgba(255, 159, 10, 0.4);
            z-index: 1001;
            animation: pulse 2s infinite;
            letter-spacing: 0.3px;
        }
        
        @keyframes pulse {
            0% { transform: translateX(-50%) scale(1); }
            50% { transform: translateX(-50%) scale(1.05); }
            100% { transform: translateX(-50%) scale(1); }
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
        
        /* Enhanced rider marker */
        .rider-location-marker {
            z-index: 1000 !important;
        }
        
        .rider-marker-wrapper {
            position: relative;
            width: 60px;
            height: 60px;
        }
        
        .rider-pulse {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 60px;
            height: 60px;
            background: radial-gradient(circle, rgba(0, 102, 255, 0.4), transparent);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            animation: pulse 2s infinite;
        }
        
        .rider-marker-container {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 40px;
            height: 40px;
            transform-origin: center;
            transform: translate(-50%, -50%);
            transition: transform 0.3s ease;
        }
        
        .rider-direction-cone {
            position: absolute;
            top: -15px;
            left: 50%;
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-bottom: 20px solid rgba(0, 102, 255, 0.7);
            transform: translateX(-50%);
        }
        
        .rider-dot {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 26px;
            height: 26px;
            background: linear-gradient(135deg, #0066FF, #0052CC);
            border: 3px solid white;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            box-shadow: 0 3px 12px rgba(0, 102, 255, 0.5);
            z-index: 2;
        }
        
        .rider-inner-dot {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 8px;
            height: 8px;
            background: white;
            border-radius: 50%;
            transform: translate(-50%, -50%);
        }
        
        /* Navigation controls */
        .nav-controls {
            position: fixed !important;
            bottom: calc(30px + var(--safe-area-bottom)) !important;
            left: 20px;
            right: 20px;
            z-index: 100;
            display: flex;
            flex-direction: column;
            gap: 12px;
            transition: bottom 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        
        /* Route panel styles */
        .route-panel {
            position: fixed !important;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(to bottom, #1C1C1F, #0A0A0B);
            border-radius: 24px 24px 0 0;
            padding: 24px;
            padding-bottom: calc(24px + var(--safe-area-bottom));
            z-index: 50;
            transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            max-height: 70%;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .route-panel.expanded ~ .nav-controls {
            bottom: calc(70% + 20px + var(--safe-area-bottom)) !important;
        }
        
        .panel-handle {
            width: 48px;
            height: 4px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 2px;
            margin: 0 auto 20px;
            cursor: grab;
            transition: all 0.2s;
        }
        
        .panel-handle:hover {
            background: rgba(255, 255, 255, 0.5);
            transform: scaleX(1.2);
        }
        
        .panel-handle:active {
            cursor: grabbing;
            background: rgba(255, 255, 255, 0.6);
        }
        
        /* Hide Leaflet rotation control */
        .leaflet-control-rotate {
            display: none !important;
        }
        
        .leaflet-touch-rotate {
            pointer-events: auto;
        }
        
        /* Modal styles with improvements */
        .verification-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 2000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            overflow-y: auto;
        }
        
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(10, 10, 11, 0.9);
            backdrop-filter: blur(20px);
        }
        
        .modal-content {
            position: relative;
            background: linear-gradient(135deg, #1C1C1F, #2C2C2E);
            border-radius: 24px;
            max-width: 420px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            z-index: 1;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
        }
        
        .modal-header {
            padding: 20px 24px;
            background: rgba(255, 255, 255, 0.05);
            display: flex;
            align-items: center;
            gap: 12px;
            border-radius: 24px 24px 0 0;
            position: sticky;
            top: 0;
            z-index: 2;
            backdrop-filter: blur(10px);
        }
        
        .modal-header.pickup {
            background: linear-gradient(135deg, #FF9F0A, #FF6B00);
            color: #0A0A0B;
            padding: 20px 24px;
        }
        
        .modal-header.delivery {
            background: linear-gradient(135deg, #34C759, #30D158);
            color: white;
            padding: 14px 24px;
        }
        
        .modal-icon {
            font-size: 24px;
        }
        
        .modal-header h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 700;
            letter-spacing: -0.3px;
        }
        
        .modal-body {
            padding: 24px;
            overflow-y: auto;
            max-height: calc(90vh - 80px);
        }
        
        .stop-summary {
            margin-bottom: 24px;
        }
        
        .stop-summary h3 {
            font-size: 18px;
            margin-bottom: 14px;
            color: white;
            font-weight: 600;
        }
        
        .summary-details {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .summary-row {
            display: flex;
            gap: 12px;
            font-size: 15px;
        }
        
        .summary-label {
            color: rgba(255, 255, 255, 0.5);
            min-width: 90px;
            font-weight: 500;
        }
        
        .summary-value {
            color: white;
            font-weight: 600;
        }
    `;
    document.head.appendChild(style);
}
// ============================================================================
// PART 3 OF 5 - OPTIMIZATION UI & CORE DISPLAY FUNCTIONS
// ============================================================================

function addOptimizeButton() {
    if (document.getElementById('optimizeBtn')) return;
    
    const navControls = document.getElementById('navControls');
    if (!navControls) return;
    
    const optimizeContainer = document.createElement('div');
    optimizeContainer.className = 'optimize-button-container';
    optimizeContainer.innerHTML = `
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
}

function showOptimizingAnimation() {
    const animation = document.createElement('div');
    animation.id = 'optimizingAnimation';
    animation.className = 'optimizing-animation';
    animation.innerHTML = `
        <div class="optimizing-content">
            <div class="optimizing-spinner"></div>
            <h3>Optimizing Route...</h3>
            <p>Finding the most efficient path</p>
            <div class="optimizing-steps">
                <div class="step active">📍 Analyzing locations</div>
                <div class="step">🗺️ Grouping by zones</div>
                <div class="step">🛣️ Calculating best path</div>
            </div>
        </div>
    `;
    
    document.body.appendChild(animation);
    
    setTimeout(() => {
        animation.querySelectorAll('.step')[1].classList.add('active');
    }, 300);
    
    setTimeout(() => {
        animation.querySelectorAll('.step')[2].classList.add('active');
    }, 600);
}

function hideOptimizingAnimation() {
    const animation = document.getElementById('optimizingAnimation');
    if (animation) {
        animation.classList.add('fade-out');
        setTimeout(() => animation.remove(), 300);
    }
}

function showOptimizationResults(savedDistance, savedPercentage) {
    const originalRoute = { ...state.activeRoute };
    originalRoute.stops = originalRoute.stops.map(s => ({ ...s }));
    originalRoute.isOptimized = false;
    localStorage.setItem('tuma_original_route', JSON.stringify(originalRoute));
    
    const results = document.createElement('div');
    results.className = 'optimization-results';
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
                    <span class="comparison-value">${state.activeRoute.originalDistance.toFixed(1)} km</span>
                </div>
                <div class="comparison-item">
                    <span class="comparison-label">Optimized:</span>
                    <span class="comparison-value success">${state.activeRoute.optimizedDistance.toFixed(1)} km</span>
                </div>
            </div>
            <button class="results-close" onclick="this.parentElement.parentElement.remove()">
                Got it!
            </button>
        </div>
    `;
    
    document.body.appendChild(results);
    
    setTimeout(() => {
        if (results.parentElement) {
            results.classList.add('fade-out');
            setTimeout(() => results.remove(), 300);
        }
    }, 5000);
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
        parcels: state.activeRoute.parcels || []
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
    const totalDistance = state.activeRoute.distance || 0;
    const estimatedTime = Math.round(totalDistance * 2.5 + remainingStops * 5);
    
    const remainingEl = document.getElementById('remainingStops');
    const distanceEl = document.getElementById('totalDistance');
    const timeEl = document.getElementById('estimatedTime');
    
    if (remainingEl) remainingEl.textContent = remainingStops;
    if (distanceEl) distanceEl.textContent = totalDistance;
    if (timeEl) timeEl.textContent = estimatedTime;
}

function displayStops() {
    const stopsList = document.getElementById('stopsList');
    if (!stopsList || !state.activeRoute) return;
    
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

function showRoutePanel() {
    const routePanel = document.getElementById('routePanel');
    const navControls = document.getElementById('navControls');
    const emptyState = document.getElementById('emptyState');
    
    if (routePanel) {
        routePanel.style.display = 'none';
        state.isPanelVisible = false;
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

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Route.js initializing with enhanced features and optimization...');
    
    injectNavigationStyles();
    addWazeNavigationStyles();
    
    await waitForLeaflet();
    
    try {
        const storedRoute = localStorage.getItem('tuma_active_route');
        console.log('Stored route data:', storedRoute);
        
        if (storedRoute) {
            state.activeRoute = JSON.parse(storedRoute);
            console.log('Parsed route:', state.activeRoute);
            
            calculateRouteFinancials();
            calculateCashCollection();
            
            await initializeMap();
            
            displayRouteInfo();
            updateDynamicHeader();
            
            await plotRoute();
            await drawOptimizedRoute();
            
            showRoutePanel();
            enhanceRoutePanel();
            initializeOptimizeButton();
            
            if (state.totalCashToCollect > 0) {
                showCashCollectionWidget();
            }
            
            startLocationTracking();
        } else {
            console.log('No active route found');
            showEmptyState();
        }
    } catch (error) {
        console.error('Error initializing route:', error);
        showEmptyState();
    }
});
// ============================================================================
// PART 4 OF 5 - MAP, NAVIGATION & LOCATION FUNCTIONS
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

function updateNavigationInfo() {
    // Called during navigation to update real-time info
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

function calculateDistance(point1, point2) {
    const R = 6371;
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLon = (point2.lng - point1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
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
// ============================================================================
// PART 5 OF 5 (FINAL) - NAVIGATION, VERIFICATION & COMPLETION
// ============================================================================

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

function showEnhancedNavigation(targetStop) {
    const existingNav = document.querySelector('.enhanced-navigation');
    if (existingNav) existingNav.remove();
    
    const routePanel = document.getElementById('routePanel');
    if (routePanel) {
        routePanel.style.display = 'none';
        state.isPanelVisible = false;
    }
    
    const navControls = document.getElementById('navControls');
    if (navControls) {
        navControls.style.display = 'none';
    }
    
    state.isFollowingUser = true;
    
    const navUI = document.createElement('div');
    navUI.className = 'enhanced-navigation waze-style';
    navUI.style.cssText = 'pointer-events: none !important;';
    navUI.innerHTML = `
        <div class="waze-nav-top">
            <div class="waze-instruction-bar">
                <button class="waze-close-btn" onclick="exitEnhancedNavigation()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
                
                <div class="waze-direction-icon">
                    <span class="direction-arrow">⬆️</span>
                </div>
                
                <div class="waze-instruction-text">
                    <div class="waze-distance">-- m</div>
                    <div class="waze-street">Starting navigation...</div>
                </div>
                
                <button class="waze-menu-btn" onclick="toggleNavigationMenu()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                    </svg>
                </button>
            </div>
        </div>
        
        <div class="waze-bottom-pills">
            <div class="waze-pill eta-pill">
                <span class="pill-icon">⏱</span>
                <span class="pill-value">--:--</span>
                <span class="pill-label">ETA</span>
            </div>
            
            <div class="waze-pill distance-pill">
                <span class="pill-icon">📍</span>
                <span class="pill-value">-- km</span>
                <span class="pill-label">left</span>
            </div>
            
            <div class="waze-pill speed-pill">
                <span class="pill-value">0</span>
                <span class="pill-label">km/h</span>
            </div>
        </div>
        
        <button class="waze-fab" onclick="showNavigationActions()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
            </svg>
        </button>
        
        <div class="waze-nav-menu" id="navMenu" style="display: none;">
            <button class="nav-menu-item" onclick="toggleNavigationMenu(); toggleRoutePanel();">
                <span class="menu-icon">📋</span>
                <span>Route Details</span>
            </button>
            <button class="nav-menu-item" onclick="toggleFollowMode()">
                <span class="menu-icon">🎯</span>
                <span id="followModeText">Following On</span>
            </button>
            <button class="nav-menu-item" onclick="toggleHeadingMode()">
                <span class="menu-icon">🧭</span>
                <span>Toggle Map Orientation</span>
            </button>
            <button class="nav-menu-item" onclick="openQuickVerification()">
                <span class="menu-icon">✓</span>
                <span>Verify Stop</span>
            </button>
            <button class="nav-menu-item" onclick="window.location.href='tel:${targetStop.customerPhone}'">
                <span class="menu-icon">📞</span>
                <span>Call Customer</span>
            </button>
            <button class="nav-menu-item" onclick="showDestinationDetails('${targetStop.id}')">
                <span class="menu-icon">📍</span>
                <span>Stop Info</span>
            </button>
        </div>
    `;
    
    document.body.appendChild(navUI);
    
    setTimeout(() => {
        if (state.map) {
            state.map.invalidateSize();
            
            if (state.currentLocation) {
                state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 17, {
                    animate: true
                });
            } else if (targetStop && targetStop.location) {
                state.map.setView([targetStop.location.lat, targetStop.location.lng], 15);
            }
        }
    }, 100);
    
    updateWazeNavigation(targetStop);
    getEnhancedDirections(targetStop);
}

window.toggleNavigationMenu = function() {
    const menu = document.getElementById('navMenu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
};

window.showNavigationActions = function() {
    const menu = document.getElementById('navMenu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
};

async function updateWazeNavigation(targetStop) {
    if (!state.currentLocation) {
        setTimeout(() => updateWazeNavigation(targetStop), 1000);
        return;
    }
    
    const distance = calculateDistance(state.currentLocation, targetStop.location);
    const eta = calculateETA(distance);
    
    const etaPill = document.querySelector('.eta-pill .pill-value');
    const distancePill = document.querySelector('.distance-pill .pill-value');
    const speedPill = document.querySelector('.speed-pill .pill-value');
    
    if (etaPill) etaPill.textContent = eta;
    
    if (distancePill) {
        distancePill.textContent = distance < 1 ? 
            `${Math.round(distance * 1000)} m` : 
            `${distance.toFixed(1)} km`;
    }
    
    if (speedPill && state.currentSpeed !== undefined) {
        speedPill.textContent = state.currentSpeed || 0;
    }
    
    if (state.map && state.currentLocation && state.isFollowingUser) {
        state.map.panTo([state.currentLocation.lat, state.currentLocation.lng], {
            animate: true,
            duration: 1
        });
        
        const currentZoom = state.map.getZoom();
        const targetZoom = calculateZoomFromSpeed(state.currentSpeed);
        if (Math.abs(currentZoom - targetZoom) > 0.5) {
            state.map.setZoom(targetZoom, { animate: true });
        }
    }
    
    if (distance < 0.05) {
        showArrivalNotification(targetStop);
    }
    
    if (document.querySelector('.enhanced-navigation') && state.navigationActive) {
        setTimeout(() => updateWazeNavigation(targetStop), 2000);
    }
}

function showArrivalNotification(targetStop) {
    const distanceEl = document.querySelector('.waze-distance');
    const streetEl = document.querySelector('.waze-street');
    const arrowEl = document.querySelector('.direction-arrow');
    const paymentInfo = getPaymentInfoForStop(targetStop);
    
    if (distanceEl) distanceEl.textContent = 'Arrived';
    if (streetEl) streetEl.textContent = `${targetStop.type} location reached`;
    if (arrowEl) arrowEl.textContent = '✅';
    
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    
    if (targetStop.type === 'delivery' && paymentInfo.needsCollection) {
        showNotification(`⚠️ Remember to collect KES ${paymentInfo.amount.toLocaleString()} from customer`, 'warning');
        
        const reminderDiv = document.createElement('div');
        reminderDiv.className = 'payment-reminder';
        reminderDiv.innerHTML = `💰 Collect KES ${paymentInfo.amount.toLocaleString()}`;
        document.body.appendChild(reminderDiv);
        
        setTimeout(() => reminderDiv.remove(), 5000);
    } else {
        showNotification(`Arrived at ${targetStop.type} location`, 'success');
    }
    
    setTimeout(() => {
        openQuickVerification();
    }, 2000);
}

async function getEnhancedDirections(targetStop) {
    if (!state.currentLocation) return;
    
    try {
        const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': OPENROUTE_API_KEY
            },
            body: JSON.stringify({
                coordinates: [
                    [state.currentLocation.lng, state.currentLocation.lat],
                    [targetStop.location.lng, targetStop.location.lat]
                ],
                instructions: true,
                language: 'en'
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                
                if (state.directionsPolyline) {
                    state.directionsPolyline.remove();
                }
                
                const decodedCoords = decodePolyline(route.geometry);
                state.directionsPolyline = L.polyline(decodedCoords, {
                    color: '#0066FF',
                    weight: 6,
                    opacity: 0.9,
                    className: 'navigation-route'
                }).addTo(state.map);
                
                updateNavigationInstructions(route);
            }
        }
    } catch (error) {
        console.error('Error getting directions:', error);
    }
}

function updateNavigationInstructions(route) {
    if (!route.segments || route.segments.length === 0) return;
    
    const segment = route.segments[0];
    if (!segment.steps || segment.steps.length === 0) return;
    
    const currentStep = getCurrentNavigationStep(segment.steps);
    if (!currentStep) return;
    
    const distanceEl = document.querySelector('.waze-distance');
    const streetEl = document.querySelector('.waze-street');
    const arrowEl = document.querySelector('.direction-arrow');
    
    if (distanceEl) {
        const dist = currentStep.distance;
        distanceEl.textContent = dist < 1000 ? 
            `${Math.round(dist)} m` : 
            `${(dist / 1000).toFixed(1)} km`;
    }
    
    if (streetEl) {
        const instruction = currentStep.instruction.replace(/Continue straight on|Continue on|Drive along/, '');
        streetEl.textContent = instruction.length > 30 ? 
            instruction.substring(0, 30) + '...' : 
            instruction;
    }
    
    if (arrowEl) {
        arrowEl.textContent = getDirectionEmoji(currentStep.type);
    }
}

function getCurrentNavigationStep(steps) {
    return steps[0];
}

function getDirectionEmoji(type) {
    const emojis = {
        0: '⬅️', 1: '➡️', 2: '↩️', 3: '↪️', 4: '↖️', 5: '↗️',
        6: '⬆️', 7: '🔄', 8: '🔄', 9: '⤴️', 10: '🏁', 11: '🚦',
        12: '⬅️', 13: '➡️'
    };
    
    return emojis[type] || '⬆️';
}

window.exitEnhancedNavigation = function() {
    const nav = document.querySelector('.enhanced-navigation');
    if (nav) nav.remove();
    
    state.navigationActive = false;
    state.isFollowingUser = false;
    
    const routePanel = document.getElementById('routePanel');
    if (routePanel) {
        routePanel.style.display = 'none';
        state.isPanelVisible = false;
        state.isPanelExpanded = false;
    }
    
    const navControls = document.getElementById('navControls');
    if (navControls) {
        navControls.style.display = 'flex';
        navControls.style.bottom = 'calc(30px + var(--safe-area-bottom))';
    }
    
    const toggleBtn = document.querySelector('.nav-button.secondary');
    if (toggleBtn) {
        toggleBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
            </svg>
            <span>Details</span>
        `;
    }
    
    if (state.map) {
        state.map.invalidateSize();
        state.map.setZoom(14);
        
        if (state.activeRoute && state.activeRoute.stops) {
            const bounds = L.latLngBounds();
            state.activeRoute.stops.forEach(stop => {
                if (stop.location) {
                    bounds.extend([stop.location.lat, stop.location.lng]);
                }
            });
            state.map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
};

window.showDestinationDetails = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop) return;
    
    const paymentInfo = getPaymentInfoForStop(stop);
    
    const modal = document.createElement('div');
    modal.className = 'destination-details-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="this.parentElement.remove()"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h3>Destination Details</h3>
                <button class="modal-close" onclick="this.closest('.destination-details-modal').remove()">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                <div class="detail-section">
                    <h4>Address</h4>
                    <p>${stop.address}</p>
                </div>
                <div class="detail-section">
                    <h4>Customer</h4>
                    <p>${stop.customerName}</p>
                    <p><a href="tel:${stop.customerPhone}">${stop.customerPhone}</a></p>
                </div>
                <div class="detail-section">
                    <h4>Parcel Code</h4>
                    <p class="code-display">${stop.parcelCode}</p>
                </div>
                ${stop.specialInstructions ? `
                    <div class="detail-section">
                        <h4>Special Instructions</h4>
                        <p>${stop.specialInstructions}</p>
                    </div>
                ` : ''}
                ${stop.type === 'delivery' && paymentInfo.needsCollection ? `
                    <div class="detail-section" style="background: linear-gradient(135deg, rgba(255, 159, 10, 0.15), rgba(255, 107, 0, 0.1)); padding: 14px; border-radius: 12px; border: 1px solid #FF9F0A;">
                        <h4 style="color: #FF9F0A;">Payment Collection</h4>
                        <p style="font-size: 22px; font-weight: 800; color: #FF9F0A;">KES ${paymentInfo.amount.toLocaleString()}</p>
                        <p style="font-size: 14px; color: rgba(255, 255, 255, 0.6);">Cash on delivery</p>
                    </div>
                ` : stop.type === 'delivery' && paymentInfo.method === 'online' ? `
                    <div class="detail-section" style="background: rgba(52, 199, 89, 0.1); padding: 14px; border-radius: 12px;">
                        <h4 style="color: #34C759;">Payment Status</h4>
                        <p style="color: #34C759;">✅ Already paid online</p>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
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
                        ${stop.specialInstructions ? `
                            <div class="summary-row instructions">
                                <span class="summary-label">Instructions:</span>
                                <span class="summary-value">${stop.specialInstructions}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                ${stop.type === 'delivery' && paymentInfo.needsCollection ? `
                    <div class="payment-collection-alert" style="
                        background: linear-gradient(135deg, rgba(255, 159, 10, 0.15), rgba(255, 107, 0, 0.1));
                        border: 2px solid #FF9F0A;
                        border-radius: 14px;
                        padding: 18px;
                        margin: 18px 0;
                        text-align: center;
                    ">
                        <div style="font-size: 28px; margin-bottom: 10px;">💰</div>
                        <div style="font-size: 22px; font-weight: 800; color: #FF9F0A; margin-bottom: 6px; letter-spacing: -0.5px;">
                            Collect KES ${paymentInfo.amount.toLocaleString()}
                        </div>
                        <div style="font-size: 14px; color: rgba(255, 255, 255, 0.6); font-weight: 500;">
                            Cash payment from customer
                        </div>
                    </div>
                ` : stop.type === 'delivery' && paymentInfo.method === 'online' ? `
                    <div style="
                        background: linear-gradient(135deg, rgba(52, 199, 89, 0.15), rgba(48, 209, 88, 0.1));
                        border: 1px solid #34C759;
                        border-radius: 14px;
                        padding: 14px;
                        margin: 18px 0;
                        text-align: center;
                        color: #34C759;
                        font-weight: 700;
                        font-size: 15px;
                    ">
                        ✅ Already Paid - No collection needed
                    </div>
                ` : ''}
                
                ${stop.type === 'delivery' ? `
                    <div class="photo-capture-section" style="
                        margin: 18px 0;
                        padding: 16px;
                        background: rgba(255, 255, 255, 0.05);
                        border-radius: 12px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                    ">
                        <label style="
                            display: block;
                            font-size: 14px;
                            font-weight: 600;
                            margin-bottom: 12px;
                            color: rgba(255, 255, 255, 0.9);
                        ">
                            📸 Proof of Delivery (Required)
                        </label>
                        <div id="photoPreview" style="
                            display: none;
                            margin-bottom: 12px;
                            border-radius: 8px;
                            overflow: hidden;
                            border: 2px solid #34C759;
                        ">
                            <img id="capturedPhoto" style="width: 100%; height: auto; display: block;" />
                        </div>
                        <button id="capturePhotoBtn" onclick="captureDeliveryPhoto()" style="
                            width: 100%;
                            padding: 14px;
                            background: linear-gradient(135deg, rgba(0, 102, 255, 0.2), rgba(0, 82, 204, 0.15));
                            border: 1px solid #0066FF;
                            border-radius: 10px;
                            color: white;
                            font-weight: 600;
                            font-size: 15px;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            transition: all 0.2s;
                        ">
                            <span>📷</span>
                            <span id="photoButtonText">Take Photo</span>
                        </button>
                        <input type="file" 
                               id="photoInput" 
                               accept="image/*" 
                               capture="environment" 
                               style="display: none;" 
                               onchange="handlePhotoCapture(event)" />
                        <p style="
                            font-size: 12px;
                            color: rgba(255, 255, 255, 0.5);
                            text-align: center;
                            margin-top: 8px;
                        ">
                            Photo required to complete delivery
                        </p>
                    </div>
                ` : ''}
                
                <div class="verification-section">
                    <label style="font-weight: 600; font-size: 15px;">Enter ${stop.type} verification code:</label>
                    <input type="text" 
                           class="verification-input" 
                           id="verificationCode" 
                           placeholder="XXX-XXXX"
                           maxlength="8"
                           autocomplete="off"
                           style="
                               width: 100%;
                               background: rgba(255, 255, 255, 0.05);
                               border: 2px solid rgba(255, 255, 255, 0.2);
                               border-radius: 14px;
                               padding: 18px;
                               font-size: 26px;
                               font-weight: 700;
                               text-align: center;
                               color: white;
                               letter-spacing: 5px;
                               text-transform: uppercase;
                               outline: none;
                               transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                               margin: 12px 0;
                           ">
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
                    <button class="modal-btn primary" onclick="verifyCode('${stop.id}')" style="
                        flex: 1;
                        padding: 18px;
                        border: none;
                        border-radius: 14px;
                        font-size: 16px;
                        font-weight: 700;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        transition: all 0.2s;
                        background: linear-gradient(135deg, #0066FF, #0052CC);
                        color: white;
                        letter-spacing: 0.3px;
                    ">
                        <span>✓</span>
                        <span>Verify ${stop.type === 'pickup' ? 'Pickup' : 'Delivery'}</span>
                    </button>
                    <button class="modal-btn secondary" onclick="closeVerificationModal()" style="
                        padding: 18px 24px;
                        border: none;
                        border-radius: 14px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        background: rgba(255, 255, 255, 0.1);
                        color: white;
                    ">
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
    
    document.getElementById('verificationCode').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            verifyCode(stop.id);
        }
    });
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
    
    if (!code || code.length < 6) {
        codeInput.classList.add('error');
        showNotification('Please enter a valid code', 'error');
        return;
    }
    
    if (code !== stop.verificationCode.toUpperCase().replace(/[^A-Z0-9]/g, '')) {
        codeInput.classList.add('error');
        showNotification('Invalid code. Please try again.', 'error');
        return;
    }
    
    // Check photo requirement for deliveries
    if (stop.type === 'delivery') {
        const photoData = window.capturedPhotoData;
        if (!photoData) {
            showNotification('📸 Please take a photo for proof of delivery', 'warning');
            document.getElementById('capturePhotoBtn').style.animation = 'shake 0.3s';
            return;
        }
    }
    
    // Check payment collection for cash deliveries
    if (stop.type === 'delivery' && paymentInfo.needsCollection) {
        const paymentCheckbox = document.getElementById('paymentCollected');
        if (paymentCheckbox && !paymentCheckbox.checked) {
            showNotification('Please confirm cash collection before verifying', 'warning');
            paymentCheckbox.parentElement.style.animation = 'shake 0.3s';
            return;
        }
    }
    
    stop.completed = true;
    stop.timestamp = new Date();
    
    // Store photo data if delivery
    if (stop.type === 'delivery' && window.capturedPhotoData) {
        stop.deliveryPhoto = window.capturedPhotoData;
        // Clear photo data after storing
        window.capturedPhotoData = null;
    }
    
    if (stop.type === 'delivery' && paymentInfo.needsCollection) {
        state.paymentsByStop[stop.id].collected = true;
        state.paymentsByStop[stop.id].timestamp = stop.timestamp;
        updateCashCollectionWidget();
    }
    
    await syncRouteData();
    
    closeVerificationModal();
    showSuccessAnimation(stop.type);
    
    if (!state.activeRoute.id?.startsWith('demo-')) {
        try {
            await supabaseUpdate('parcels',
                `id=eq.${stop.parcelId}`,
                {
                    status: stop.type === 'pickup' ? 'picked' : 'delivered',
                    [`${stop.type}_timestamp`]: stop.timestamp.toISOString(),
                    payment_status: stop.type === 'delivery' && paymentInfo.needsCollection ? 'collected' : undefined,
                    delivery_photo: stop.type === 'delivery' && stop.deliveryPhoto ? stop.deliveryPhoto : undefined
                }
            );
        } catch (error) {
            console.error('Database update error:', error);
        }
    }
    
    displayRouteInfo();
    updateDynamicHeader();
    plotRoute();
    drawOptimizedRoute();
    
    checkPhaseCompletion();
    
    if (state.activeRoute.stops.every(s => s.completed)) {
        await completeRoute();
    } else {
        const nextStop = getNextStop();
        if (nextStop && state.navigationActive) {
            showEnhancedNavigation(nextStop);
        }
    }
};

// Photo capture functions
window.captureDeliveryPhoto = function() {
    const input = document.getElementById('photoInput');
    if (input) {
        input.click();
    }
};

window.handlePhotoCapture = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const photoData = e.target.result;
        window.capturedPhotoData = photoData;
        
        // Show preview
        const preview = document.getElementById('photoPreview');
        const img = document.getElementById('capturedPhoto');
        const btn = document.getElementById('capturePhotoBtn');
        const btnText = document.getElementById('photoButtonText');
        
        if (preview && img) {
            img.src = photoData;
            preview.style.display = 'block';
            btn.style.background = 'linear-gradient(135deg, rgba(52, 199, 89, 0.2), rgba(48, 209, 88, 0.15))';
            btn.style.borderColor = '#34C759';
            btnText.textContent = 'Retake Photo';
        }
        
        showNotification('✅ Photo captured successfully', 'success');
    };
    
    reader.readAsDataURL(file);
};

function showSuccessAnimation(type) {
    const animation = document.createElement('div');
    animation.className = 'success-animation';
    animation.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #1C1C1F, #2C2C2E);
        border-radius: 24px;
        padding: 48px;
        text-align: center;
        z-index: 3000;
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
        animation: popIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        border: 1px solid rgba(255, 255, 255, 0.1);
    `;
    animation.innerHTML = `
        <div class="success-icon" style="
            width: 84px;
            height: 84px;
            background: linear-gradient(135deg, #34C759, #30D158);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            font-size: 48px;
            color: white;
            box-shadow: 0 8px 30px rgba(52, 199, 89, 0.4);
        ">✓</div>
        <div class="success-text" style="
            font-size: 26px;
            font-weight: 800;
            color: white;
            letter-spacing: -0.5px;
        ">${type === 'pickup' ? 'Pickup' : 'Delivery'} Verified!</div>
    `;
    
    document.body.appendChild(animation);
    
    setTimeout(() => animation.remove(), 2000);
}

function checkPhaseCompletion() {
    const pickupStops = state.activeRoute.stops.filter(s => s.type === 'pickup');
    const allPickupsComplete = pickupStops.every(s => s.completed);
    
    if (allPickupsComplete && !state.pickupPhaseCompleted) {
        state.pickupPhaseCompleted = true;
        showPhaseCompleteAnimation();
    }
}

function showPhaseCompleteAnimation() {
    const animation = document.createElement('div');
    animation.className = 'phase-complete-animation';
    animation.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #1C1C1F, #2C2C2E);
        border-radius: 24px;
        padding: 48px;
        text-align: center;
        z-index: 3000;
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
        animation: popIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        border: 1px solid rgba(255, 255, 255, 0.1);
    `;
    animation.innerHTML = `
        <div class="phase-complete-content">
            <div class="phase-icon" style="font-size: 72px; margin-bottom: 24px;">🎉</div>
            <h2 style="font-size: 28px; font-weight: 800; margin-bottom: 12px; letter-spacing: -0.5px;">All Pickups Complete!</h2>
            <p style="font-size: 16px; color: rgba(255, 255, 255, 0.6); font-weight: 500;">Time to deliver the parcels</p>
        </div>
    `;
    
    document.body.appendChild(animation);
    
    setTimeout(() => animation.remove(), 3000);
}

async function completeRoute() {
    console.log('Completing route...');
    
    await handleRouteCompletion();
    
    const animation = document.createElement('div');
    animation.className = 'route-complete-animation';
    animation.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #1C1C1F, #2C2C2E);
        border-radius: 24px;
        padding: 48px;
        text-align: center;
        z-index: 3000;
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
        animation: popIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        border: 1px solid rgba(255, 255, 255, 0.1);
        max-width: 420px;
    `;
    animation.innerHTML = `
        <div class="route-complete-content">
            <div class="complete-icon" style="font-size: 72px; margin-bottom: 24px;">🏆</div>
            <h1 style="font-size: 32px; font-weight: 800; margin-bottom: 14px; letter-spacing: -1px;">Route Complete!</h1>
            <p style="font-size: 16px; color: rgba(255, 255, 255, 0.6); margin-bottom: 28px; font-weight: 500;">Excellent work! All deliveries completed successfully.</p>
            <div class="route-stats" style="display: flex; justify-content: center; gap: 40px; margin-bottom: 36px;">
                <div class="stat" style="text-align: center;">
                    <span class="stat-value" style="display: block; font-size: 36px; font-weight: 800; color: #9333EA; margin-bottom: 6px; letter-spacing: -1px;">${state.activeRoute.stops.length}</span>
                    <span class="stat-label" style="font-size: 13px; color: rgba(255, 255, 255, 0.5); text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Stops</span>
                </div>
                <div class="stat" style="text-align: center;">
                    <span class="stat-value" style="display: block; font-size: 36px; font-weight: 800; color: #9333EA; margin-bottom: 6px; letter-spacing: -1px;">KES ${Math.round(state.totalRouteEarnings)}</span>
                    <span class="stat-label" style="font-size: 13px; color: rgba(255, 255, 255, 0.5); text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Earned</span>
                </div>
                ${state.totalCashCollected > 0 ? `
                    <div class="stat" style="text-align: center;">
                        <span class="stat-value" style="display: block; font-size: 36px; font-weight: 800; color: #9333EA; margin-bottom: 6px; letter-spacing: -1px;">KES ${Math.round(state.totalCashCollected)}</span>
                        <span class="stat-label" style="font-size: 13px; color: rgba(255, 255, 255, 0.5); text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Cash Collected</span>
                    </div>
                ` : ''}
            </div>
            <button class="complete-btn" onclick="finishRoute()" style="
                width: 100%;
                background: linear-gradient(135deg, #9333EA, #7928CA);
                color: white;
                border: none;
                border-radius: 16px;
                padding: 18px;
                font-size: 17px;
                font-weight: 700;
                cursor: pointer;
                letter-spacing: 0.5px;
                transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                box-shadow: 0 6px 20px rgba(147, 51, 234, 0.4);
            ">
                Back to Dashboard
            </button>
        </div>
    `;
    
    document.body.appendChild(animation);
}

window.finishRoute = function() {
    window.location.href = './rider.html';
};

window.goBack = function() {
    if (confirm('Are you sure you want to exit navigation?')) {
        window.location.href = './rider.html';
    }
};

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? 'linear-gradient(135deg, #34C759, #30D158)' : 
                      type === 'error' ? 'linear-gradient(135deg, #FF3B30, #FF2D55)' : 
                      type === 'warning' ? 'linear-gradient(135deg, #FF9F0A, #FF6B00)' : 
                      'linear-gradient(135deg, #1C1C1F, #2C2C2E)'};
        color: ${type === 'warning' ? '#0A0A0B' : 'white'};
        padding: 16px 20px;
        border-radius: 14px;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 4000;
        animation: slideIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        max-width: 380px;
        font-weight: 600;
        font-size: 15px;
        letter-spacing: 0.3px;
    `;
    notification.innerHTML = `
        <span class="notification-icon" style="font-size: 20px;">
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

function addWazeNavigationStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes popIn {
            from { scale: 0.8; opacity: 0; }
            to { scale: 1; opacity: 1; }
        }
        
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-10px); }
            75% { transform: translateX(10px); }
        }
        
        .verification-input:focus {
            border-color: #0066FF !important;
            transform: translateY(-2px);
            box-shadow: 0 6px 24px rgba(0, 102, 255, 0.3);
        }
        
        .verification-input.error {
            border-color: #FF3B30 !important;
            animation: shake 0.3s;
        }
        
        .modal-closing {
            animation: fadeOut 0.3s ease-out;
        }
        
        @keyframes fadeOut {
            to { opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// Debug exports
window.routeDebug = {
    state,
    reloadRoute: () => {
        const stored = localStorage.getItem('tuma_active_route');
        if (stored) {
            state.activeRoute = JSON.parse(stored);
            displayRouteInfo();
            updateDynamicHeader();
            plotRoute();
        }
    },
    clearRoute: () => {
        localStorage.removeItem('tuma_active_route');
        localStorage.removeItem('tuma_route_completion');
        window.location.reload();
    },
    forceComplete: async () => {
        if (state.activeRoute && state.activeRoute.stops) {
            state.activeRoute.stops.forEach(stop => {
                stop.completed = true;
                stop.timestamp = new Date();
            });
            await syncRouteData();
            await completeRoute();
        }
    },
    checkCompletion: () => {
        const completionData = localStorage.getItem('tuma_route_completion');
        console.log('Stored completion data:', completionData);
        return completionData ? JSON.parse(completionData) : null;
    },
    calculateFinancials: () => {
        calculateRouteFinancials();
        calculateCashCollection();
        console.log('Route financials:', {
            totalEarnings: state.totalRouteEarnings,
            totalCommission: state.routeCommission,
            cashToCollect: state.totalCashToCollect,
            cashCollected: state.totalCashCollected
        });
    },
    testOptimization: () => {
        if (!state.activeRoute) {
            console.log('No route loaded');
            return;
        }
        
        const original = [...state.activeRoute.stops];
        const optimized = performSmartOptimization(original);
        
        const originalDist = calculateTotalRouteDistance(original);
        const optimizedDist = calculateTotalRouteDistance(optimized);
        
        console.log('=== Optimization Test ===');
        console.log('Original distance:', originalDist.toFixed(1), 'km');
        console.log('Optimized distance:', optimizedDist.toFixed(1), 'km');
        console.log('Saved:', (originalDist - optimizedDist).toFixed(1), 'km');
        console.log('Improvement:', ((1 - optimizedDist/originalDist) * 100).toFixed(1), '%');
        
        return optimized;
    }
};

console.log('✅ Enhanced Route.js loaded successfully!');
console.log('Version 2.0.0 - Complete with optimization, payment tracking, and premium UI');
console.log('Debug: window.routeDebug');

// END OF COMPLETE ROUTE.JS FILE
