/**
 * Enhanced Route Navigation Module - Part 1/4
 * Setup, Configuration, and Core API Functions
 * Version: 4.0.0 - Uses External Route Optimizer Module
 */

// Import the route optimizer module (adjust path as needed)
// For ES6 modules, ensure your HTML includes type="module" in script tag
// <script type="module" src="route.js"></script>
import RouteOptimizer from './route-optimizer.js';

// Initialize the route optimizer with comprehensive settings
const routeOptimizer = new RouteOptimizer({
    // Distance thresholds
    immediateDeliveryRadius: 1.5,      // km - deliver immediately if this close
    clusterRadius: 2.0,                // km - stops within this are considered clustered
    zoneRadius: 3.0,                   // km - for zone creation
    
    // Scoring weights
    distanceWeight: 1.0,               // Base weight for distance
    backtrackPenalty: 5.0,             // Penalty multiplier for going backwards
    directionChangesPenalty: 2.0,      // Penalty for changing direction frequently
    clusterBonus: 0.7,                 // Bonus multiplier for staying in cluster
    
    // Algorithm settings
    enableZoning: true,                // Group stops into zones
    enableSmartPairing: true,          // Pair pickups with nearby deliveries
    maxLookahead: 3,                   // How many stops to look ahead for optimization
    
    // Performance settings
    maxIterations: 1000,               // Max iterations for optimization algorithms
    convergenceThreshold: 0.01         // Stop optimizing when improvement < this
});

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
    optimization: {
        enableDynamicRouting: true,
        autoReoptimize: false,
        reoptimizeThreshold: 2.0 // km savings to trigger re-optimization
    }
};

// State management
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
    lastLocationErrorTime: null,
    lastOptimizationCheck: null,
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
    routeOptimizationMode: 'dynamic',
    originalRouteOrder: null,
    optimizationStats: {
        originalDistance: 0,
        optimizedDistance: 0,
        savedDistance: 0,
        savedPercentage: 0
    },
    stopOrderMap: {},
    showNumberedMarkers: true
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
// ROUTE OPTIMIZATION FUNCTIONS (Using External Module)
// ============================================================================

/**
 * Main route optimization function - calls external optimizer
 */
function optimizeRouteStops() {
    if (!state.activeRoute || !state.activeRoute.stops) {
        showNotification('No route to optimize', 'warning');
        return;
    }
    
    const hasCompletedStops = state.activeRoute.stops.some(s => s.completed);
    
    if (hasCompletedStops) {
        // Only optimize remaining stops
        reoptimizeRemainingStops();
        showNotification('Remaining stops optimized!', 'success');
    } else {
        // Full route optimization
        console.log('Starting full route optimization...');
        
        // Store original for undo
        state.originalRouteOrder = [...state.activeRoute.stops];
        const originalDistance = calculateTotalRouteDistance(state.originalRouteOrder);
        
        showOptimizingAnimation();
        
        setTimeout(() => {
            // Call external RouteOptimizer module - NO currentLocation parameter
            const optimizedStops = routeOptimizer.optimizeRoute(state.originalRouteOrder);
            
            // Get statistics from the optimizer
            const stats = routeOptimizer.getStatistics();
            
            // Update state with optimizer's calculated stats
            state.activeRoute.stops = optimizedStops;
            state.activeRoute.isOptimized = true;
            state.optimizationStats = {
                originalDistance: stats.originalDistance || originalDistance,
                optimizedDistance: stats.optimizedDistance,
                savedDistance: stats.savedDistance,
                savedPercentage: stats.savedPercentage
            };
            
            // Update UI
            updateStopOrderMap();
            localStorage.setItem('tuma_active_route', JSON.stringify(state.activeRoute));
            
            console.log('Optimization complete:');
            console.log(`Original distance: ${state.optimizationStats.originalDistance.toFixed(1)}km`);
            console.log(`Optimized distance: ${state.optimizationStats.optimizedDistance.toFixed(1)}km`);
            console.log(`Saved: ${state.optimizationStats.savedDistance.toFixed(1)}km (${state.optimizationStats.savedPercentage.toFixed(1)}%)`);
            console.log(`Backtracking eliminated: ${stats.backtrackingEliminated} instances`);
            console.log(`Zones created: ${stats.zonesCreated}`);
            console.log(`Execution time: ${stats.executionTime?.toFixed(2)}ms`);
            
            console.log('\nOptimized route order:');
            optimizedStops.forEach((stop, index) => {
                console.log(`${index + 1}. ${stop.type.toUpperCase()} - ${stop.address} (${stop.parcelCode})`);
            });
            
            displayRouteInfo();
            plotRoute();
            drawOptimizedRoute();
            
            hideOptimizingAnimation();
            
            if (state.optimizationStats.savedDistance > 0.1) {
                showOptimizationResults(state.optimizationStats.savedDistance, state.optimizationStats.savedPercentage);
            } else {
                showNotification('Route optimized for efficient delivery sequence', 'success');
            }
            
            updateOptimizeButton(true);
        }, 1500);
    }
}

/**
 * Real-time route re-optimization for remaining stops
 */
function reoptimizeRemainingStops() {
    if (!state.activeRoute || !state.activeRoute.stops) return;
    
    // Get only uncompleted stops
    const remainingStops = state.activeRoute.stops.filter(s => !s.completed);
    
    if (remainingStops.length <= 1) return; // No need to optimize
    
    console.log('📍 Re-optimizing remaining stops...');
    
    // Re-optimize remaining stops using external optimizer
    const reoptimized = routeOptimizer.optimizeRoute(remainingStops);
    
    // Get updated statistics
    const stats = routeOptimizer.getStatistics();
    console.log(`Re-optimization saved: ${stats.savedDistance.toFixed(1)}km`);
    
    // Update the route with completed + reoptimized stops
    const completedStops = state.activeRoute.stops.filter(s => s.completed);
    state.activeRoute.stops = [...completedStops, ...reoptimized];
    
    // Update UI
    updateStopOrderMap();
    displayRouteInfo();
    plotRoute();
    drawOptimizedRoute();
    
    console.log('Route re-optimized in real-time');
}

/**
 * Check if re-optimization would provide significant savings
 */
function checkForBetterRoute() {
    if (!state.navigationActive || !config.optimization.autoReoptimize) return;
    
    const remainingStops = state.activeRoute.stops.filter(s => !s.completed);
    if (remainingStops.length <= 2) return; // Too few stops to matter
    
    // Test if re-optimization would save significant distance
    const currentOrderDistance = calculateTotalRouteDistance(remainingStops);
    const testOptimized = routeOptimizer.optimizeRoute(remainingStops);
    const testStats = routeOptimizer.getStatistics();
    
    const savings = testStats.savedDistance;
    
    // If we can save more than threshold km, suggest re-optimization
    if (savings > config.optimization.reoptimizeThreshold) {
        showNotification(
            `Route optimization available - Save ${savings.toFixed(1)}km! Tap to optimize.`,
            'info'
        );
        
        // Show a button to re-optimize
        showReoptimizeButton();
    }
}

/**
 * Undo the last optimization
 */
function undoOptimization() {
    if (!state.originalRouteOrder) {
        showNotification('No original route to restore', 'warning');
        return;
    }
    
    state.activeRoute.stops = [...state.originalRouteOrder];
    state.activeRoute.isOptimized = false;
    
    updateStopOrderMap();
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

/**
 * Update optimizer configuration
 */
window.updateOptimizerSetting = function(setting, value) {
    routeOptimizer.updateConfig({ [setting]: parseFloat(value) });
    console.log(`Optimizer setting updated: ${setting} = ${value}`);
    
    // Optionally re-optimize current route with new settings
    if (state.activeRoute && !state.activeRoute.stops.some(s => s.completed)) {
        optimizeRouteStops();
    }
};

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
    if (!state.activeRoute) {
        return {
            amount: 0,
            method: 'unknown',
            status: 'unknown',
            needsCollection: false
        };
    }
    
    let parcel = null;
    if (state.activeRoute.parcels && state.activeRoute.parcels.length > 0) {
        parcel = state.activeRoute.parcels.find(p => 
            p.id === stop.parcelId || 
            p.parcel_code === stop.parcelCode ||
            p.code === stop.parcelCode
        );
    }
    
    if (!parcel && stop.paymentInfo) {
        return {
            amount: parsePrice(stop.paymentInfo.amount || 0),
            method: stop.paymentInfo.method || 'cash',
            status: stop.paymentInfo.status || 'pending',
            needsCollection: stop.type === 'delivery' && 
                           (stop.paymentInfo.method || 'cash') === 'cash' && 
                           (stop.paymentInfo.status || 'pending') === 'pending'
        };
    }
    
    if (!parcel) {
        return {
            amount: 0,
            method: 'unknown',
            status: 'unknown',
            needsCollection: false
        };
    }
    
    const amount = parsePrice(parcel.price || parcel.total_price || parcel.amount || 0);
    const method = parcel.payment_method || parcel.paymentMethod || 'cash';
    const status = parcel.payment_status || parcel.paymentStatus || 'pending';
    
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

function updateStopOrderMap() {
    state.stopOrderMap = {};
    if (!state.activeRoute || !state.activeRoute.stops) return;
    
    state.activeRoute.stops.forEach((stop, index) => {
        state.stopOrderMap[stop.id] = index + 1;
    });
    
    console.log('Stop order map updated:', state.stopOrderMap);
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

// Toggle numbered markers
window.toggleNumberedMarkers = function() {
    state.showNumberedMarkers = !state.showNumberedMarkers;
    plotRoute(); // Redraw with new marker style
    showNotification(
        state.showNumberedMarkers ? 'Showing route numbers' : 'Showing pickup/delivery labels',
        'info'
    );
};
/**
 * Enhanced Route Navigation Module - Part 2/4
 * UI Functions, Styles, and Display Components
 * Version: 4.0.0
 */

// ============================================================================
// UI STYLING & INITIALIZATION
// ============================================================================

function injectNavigationStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Import premium fonts */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        
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
        
        /* Premium Leaflet popup styles */
        .leaflet-popup {
            margin-bottom: 25px !important;
        }
        
        .leaflet-popup-content-wrapper {
            background: linear-gradient(145deg, #1A1A1D 0%, #2D2D30 100%) !important;
            border-radius: 24px !important;
            box-shadow: 
                0 20px 60px rgba(0, 0, 0, 0.8),
                0 10px 20px rgba(0, 0, 0, 0.6),
                inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            overflow: hidden !important;
            padding: 0 !important;
            backdrop-filter: blur(10px) !important;
        }
        
        .leaflet-popup-content {
            margin: 0 !important;
            width: 340px !important;
            max-width: 340px !important;
            color: white !important;
            padding: 0 !important;
        }
        
        .leaflet-popup-tip-container {
            display: none !important;
        }
        
        .leaflet-popup-close-button {
            color: rgba(255, 255, 255, 0.6) !important;
            font-size: 28px !important;
            font-weight: 200 !important;
            padding: 10px 14px !important;
            right: 10px !important;
            top: 10px !important;
            opacity: 0.8 !important;
            z-index: 100 !important;
            transition: all 0.2s ease !important;
            background: rgba(0, 0, 0, 0.3) !important;
            border-radius: 50% !important;
            width: 36px !important;
            height: 36px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            line-height: 1 !important;
        }
        
        .leaflet-popup-close-button:hover {
            opacity: 1 !important;
            color: #FF453A !important;
            background: rgba(255, 69, 58, 0.2) !important;
            transform: rotate(90deg) !important;
        }
        
        /* Cash Collection Widget */
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
        
        /* Optimization Button Styles */
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
        
        .optimize-route-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(147, 51, 234, 0.5);
        }
        
        .optimize-route-btn.optimized {
            background: linear-gradient(135deg, #34C759, #30D158);
            cursor: default;
        }
        
        .undo-optimize-btn {
            background: rgba(255, 255, 255, 0.1);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 16px;
            padding: 16px 20px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.3s ease;
        }
        
        .undo-optimize-btn:hover {
            background: rgba(255, 255, 255, 0.15);
        }
        
        /* Optimization Animation */
        .optimizing-animation {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 5000;
        }
        
        .optimizing-content {
            background: linear-gradient(135deg, #1C1C1F, #2C2C2E);
            border-radius: 24px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
            max-width: 400px;
        }
        
        .optimizing-spinner {
            width: 60px;
            height: 60px;
            border: 3px solid rgba(147, 51, 234, 0.3);
            border-top-color: #9333EA;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .optimizing-steps {
            margin-top: 20px;
        }
        
        .optimizing-steps .step {
            padding: 8px;
            margin: 5px 0;
            border-radius: 8px;
            opacity: 0.5;
            transition: all 0.3s ease;
        }
        
        .optimizing-steps .step.active {
            opacity: 1;
            background: rgba(147, 51, 234, 0.2);
        }
        
        /* Optimization Results */
        .optimization-results {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #1C1C1F, #2C2C2E);
            border-radius: 24px;
            padding: 40px;
            text-align: center;
            z-index: 5000;
            box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
            max-width: 450px;
            animation: slideIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        
        @keyframes slideIn {
            from {
                transform: translate(-50%, -50%) scale(0.9);
                opacity: 0;
            }
            to {
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
            }
        }
        
        .optimization-results.fade-out {
            animation: fadeOut 0.3s ease-out forwards;
        }
        
        @keyframes fadeOut {
            to {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.9);
            }
        }
        
        .results-icon {
            font-size: 60px;
            margin-bottom: 20px;
        }
        
        .results-stats {
            display: flex;
            justify-content: space-around;
            margin: 30px 0;
        }
        
        .results-stats .stat {
            text-align: center;
        }
        
        .stat-value {
            display: block;
            font-size: 28px;
            font-weight: 700;
            color: #9333EA;
            margin-bottom: 5px;
        }
        
        .stat-label {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.6);
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .results-comparison {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 15px;
            margin: 20px 0;
        }
        
        .comparison-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            color: rgba(255, 255, 255, 0.8);
        }
        
        .comparison-value.success {
            color: #34C759;
            font-weight: 600;
        }
        
        .efficiency-high { color: #34C759; }
        .efficiency-medium { color: #FF9F0A; }
        .efficiency-low { color: #FF3B30; }
        
        .results-close {
            background: linear-gradient(135deg, #9333EA, #7928CA);
            color: white;
            border: none;
            border-radius: 12px;
            padding: 12px 30px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 20px;
        }
        
        /* Reoptimize button */
        .reoptimize-float-btn {
            position: fixed;
            bottom: 100px;
            right: 20px;
            background: linear-gradient(135deg, #FF9F0A, #FF6B00);
            color: white;
            border: none;
            border-radius: 50px;
            padding: 15px 25px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 6px 20px rgba(255, 159, 10, 0.4);
            z-index: 1000;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
    `;
    
    document.head.appendChild(style);
}

// ============================================================================
// UI DISPLAY FUNCTIONS
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
    
    const steps = [
        '📍 Analyzing stop locations',
        '🗺️ Detecting route direction',
        '⚡ Optimizing delivery sequence',
        '✅ Validating route integrity'
    ];
    
    animation.innerHTML = `
        <div class="optimizing-content">
            <div class="optimizing-spinner"></div>
            <h3 style="color: white; margin-bottom: 10px;">Optimizing Route...</h3>
            <p style="color: rgba(255, 255, 255, 0.6); margin-bottom: 20px;">
                Using intelligent geographical flow analysis
            </p>
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
    const results = document.createElement('div');
    results.className = 'optimization-results';
    
    results.innerHTML = `
        <div class="results-content">
            <div class="results-icon">🎉</div>
            <h2 style="color: white; margin-bottom: 10px;">Route Optimized!</h2>
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

function showReoptimizeButton() {
    // Remove existing button if any
    const existing = document.querySelector('.reoptimize-float-btn');
    if (existing) existing.remove();
    
    const btn = document.createElement('button');
    btn.className = 'reoptimize-float-btn';
    btn.innerHTML = '🔄 Re-optimize Route';
    btn.onclick = () => {
        reoptimizeRemainingStops();
        btn.remove();
    };
    
    document.body.appendChild(btn);
    
    // Auto-remove after 10 seconds
    setTimeout(() => btn.remove(), 10000);
}

function showCashCollectionWidget() {
    const existingWidget = document.querySelector('.cash-collection-widget');
    if (existingWidget) existingWidget.remove();
    
    const pendingAmount = state.totalCashToCollect - state.totalCashCollected;
    const hasPending = pendingAmount > 0;
    
    const widget = document.createElement('div');
    widget.className = `cash-collection-widget ${hasPending ? 'has-pending' : ''}`;
    widget.innerHTML = `
        <div class="cash-widget-title" style="font-size: 14px; font-weight: 600; margin-bottom: 10px; color: white;">
            ${hasPending ? '⚡' : '✓'} Cash Collection
        </div>
        <div class="cash-widget-amount" style="font-size: 24px; font-weight: 700; color: #FF9F0A; margin-bottom: 15px;">
            KES ${pendingAmount.toLocaleString()}
        </div>
        <div class="cash-widget-breakdown" style="font-size: 13px; color: rgba(255,255,255,0.7);">
            <div class="cash-breakdown-item" style="display: flex; justify-content: space-between; padding: 5px 0;">
                <span>Total Expected</span>
                <span style="font-weight: 600;">KES ${state.totalCashToCollect.toLocaleString()}</span>
            </div>
            <div class="cash-breakdown-item" style="display: flex; justify-content: space-between; padding: 5px 0;">
                <span>✓ Collected</span>
                <span style="font-weight: 600; color: #34C759;">KES ${state.totalCashCollected.toLocaleString()}</span>
            </div>
            <div class="cash-breakdown-item" style="display: flex; justify-content: space-between; padding: 5px 0; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 5px; padding-top: 10px;">
                <span>⏳ Pending</span>
                <span style="font-weight: 600; color: #FF9F0A;">KES ${pendingAmount.toLocaleString()}</span>
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
/**
 * Enhanced Route Navigation Module - Part 3/4
 * Map, Navigation, and Location Tracking Functions
 * Version: 4.0.0
 */

// ============================================================================
// MAP INITIALIZATION & MANAGEMENT
// ============================================================================

async function initializeMap() {
    console.log('Initializing map...');
    
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
    
    console.log('Map initialized');
}

// ============================================================================
// LOCATION TRACKING FUNCTIONS
// ============================================================================

function startLocationTracking() {
    if (!navigator.geolocation) {
        showNotification('Location services not available', 'warning');
        return;
    }
    
    console.log('Starting location tracking...');
    
    const geoOptions = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    };
    
    // Get initial position
    navigator.geolocation.getCurrentPosition(
        position => {
            console.log('Initial position obtained');
            updateCurrentLocation(position);
            state.isTracking = true;
            
            // Center map on location
            if (state.map && state.currentLocation) {
                state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 17, {
                    animate: true
                });
            }
            
            // Check for better route with new location
            if (config.optimization.autoReoptimize) {
                checkForBetterRoute();
            }
            
            showNotification('Location tracking started', 'success');
        },
        error => {
            console.error('Location error:', error);
            let errorMessage = 'Unable to get location';
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Please enable location permissions';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Location information unavailable';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Location request timed out';
                    break;
            }
            
            showNotification(errorMessage, 'error');
            
            // Use fallback location (Nairobi center)
            state.currentLocation = { lat: -1.2921, lng: 36.8219 };
            if (state.map) {
                state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 13);
            }
        },
        geoOptions
    );
    
    // Watch position for continuous updates
    if (state.locationWatchId) {
        navigator.geolocation.clearWatch(state.locationWatchId);
    }
    
    state.locationWatchId = navigator.geolocation.watchPosition(
        position => {
            updateCurrentLocation(position);
            
            // Periodic optimization check
            if (state.navigationActive && config.optimization.autoReoptimize) {
                if (!state.lastOptimizationCheck || 
                    Date.now() - state.lastOptimizationCheck > 300000) { // Every 5 minutes
                    checkForBetterRoute();
                    state.lastOptimizationCheck = Date.now();
                }
            }
        },
        error => {
            console.error('Location update error:', error);
            
            if (Date.now() - (state.lastLocationErrorTime || 0) > 30000) {
                state.lastLocationErrorTime = Date.now();
                showNotification('Location update failed - using last known position', 'warning');
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );
    
    // Backup interval for location updates
    if (state.trackingInterval) {
        clearInterval(state.trackingInterval);
    }
    
    state.trackingInterval = setInterval(() => {
        if (navigator.geolocation && state.isTracking) {
            navigator.geolocation.getCurrentPosition(
                position => updateCurrentLocation(position),
                error => console.log('Interval location update failed:', error),
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 5000 }
            );
        }
    }, 10000); // Update every 10 seconds
}

function stopLocationTracking() {
    console.log('Stopping location tracking...');
    
    if (state.locationWatchId) {
        navigator.geolocation.clearWatch(state.locationWatchId);
        state.locationWatchId = null;
    }
    
    if (state.trackingInterval) {
        clearInterval(state.trackingInterval);
        state.trackingInterval = null;
    }
    
    state.isTracking = false;
    
    // Remove location marker from map
    if (state.currentLocationMarker) {
        state.currentLocationMarker.remove();
        state.currentLocationMarker = null;
    }
    
    if (state.accuracyCircle) {
        state.accuracyCircle.remove();
        state.accuracyCircle = null;
    }
    
    showNotification('Location tracking stopped', 'info');
}

function updateCurrentLocation(position) {
    const newLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
    };
    
    // Skip update if location hasn't changed significantly
    if (state.currentLocation) {
        const distance = calculateDistance(state.currentLocation, newLocation);
        if (distance < 0.005) return; // Less than 5 meters
    }
    
    state.currentLocation = newLocation;
    
    // Update heading
    if (position.coords.heading !== null && position.coords.heading !== undefined) {
        state.currentHeading = position.coords.heading;
    } else if (state.lastLocation) {
        state.currentHeading = calculateBearing(state.lastLocation, state.currentLocation);
    }
    
    // Update speed
    if (position.coords.speed !== null) {
        state.currentSpeed = Math.round(position.coords.speed * 3.6); // Convert m/s to km/h
    }
    
    // Update map marker
    if (state.map) {
        // Create or update location marker
        if (!state.currentLocationMarker) {
            const riderIcon = createRiderIcon(state.currentHeading);
            state.currentLocationMarker = L.marker(
                [state.currentLocation.lat, state.currentLocation.lng],
                { 
                    icon: riderIcon,
                    zIndexOffset: 2000,
                    interactive: false
                }
            ).addTo(state.map);
            
            state.currentLocationMarker.bindPopup(`
                <div style="text-align: center; padding: 10px;">
                    <strong>Your Location</strong><br>
                    <span style="font-size: 12px; color: #666;">
                        Speed: ${state.currentSpeed} km/h<br>
                        Accuracy: ±${Math.round(position.coords.accuracy)}m
                    </span>
                </div>
            `);
        } else {
            state.currentLocationMarker.setLatLng([state.currentLocation.lat, state.currentLocation.lng]);
            const riderIcon = createRiderIcon(state.currentHeading);
            state.currentLocationMarker.setIcon(riderIcon);
        }
        
        // Update accuracy circle
        if (position.coords.accuracy) {
            if (state.accuracyCircle) {
                state.accuracyCircle.setLatLng([state.currentLocation.lat, state.currentLocation.lng]);
                state.accuracyCircle.setRadius(position.coords.accuracy);
            } else {
                state.accuracyCircle = L.circle([state.currentLocation.lat, state.currentLocation.lng], {
                    radius: position.coords.accuracy,
                    color: '#007AFF',
                    fillColor: '#007AFF',
                    fillOpacity: 0.1,
                    weight: 1,
                    opacity: 0.3,
                    interactive: false
                }).addTo(state.map);
            }
        }
        
        // Auto-pan to location if following
        if (state.navigationActive && state.isFollowingUser) {
            state.map.panTo([state.currentLocation.lat, state.currentLocation.lng], {
                animate: true,
                duration: 1,
                noMoveStart: true
            });
            
            // Auto-zoom based on speed
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
    
    // Update last location
    state.lastLocation = state.currentLocation;
    state.lastLocationTime = Date.now();
    
    // Update UI elements
    if (state.navigationActive) {
        updateNavigationInfo();
    }
    
    updateDynamicHeader();
    
    // Check proximity to stops
    checkStopProximity();
    
    console.log('Location updated:', {
        lat: newLocation.lat.toFixed(6),
        lng: newLocation.lng.toFixed(6),
        accuracy: `±${Math.round(newLocation.accuracy)}m`,
        heading: Math.round(state.currentHeading) + '°',
        speed: state.currentSpeed + ' km/h'
    });
}

function checkStopProximity() {
    if (!state.currentLocation || !state.activeRoute) return;
    
    const nextStop = getNextStop();
    if (!nextStop) return;
    
    const distance = calculateDistance(
        state.currentLocation,
        nextStop.location
    );
    
    // Alert when within 100 meters
    if (distance < 0.1 && !state.proximityNotified) {
        state.proximityNotified = true;
        
        const paymentInfo = getPaymentInfoForStop(nextStop);
        
        let message = `Approaching ${nextStop.type} location - ${Math.round(distance * 1000)}m away`;
        
        if (nextStop.type === 'delivery' && paymentInfo.needsCollection) {
            message = `💰 Approaching delivery - Remember to collect KES ${paymentInfo.amount.toLocaleString()}`;
        }
        
        showNotification(message, 'warning');
        
        // Play sound if available
        if ('Audio' in window) {
            try {
                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBStz0Oy9nzUIHGGz7+OZURE');
                audio.play().catch(e => console.log('Could not play notification sound'));
            } catch (e) {
                console.log('Audio not supported');
            }
        }
        
        // Reset notification after 5 minutes
        setTimeout(() => {
            state.proximityNotified = false;
        }, 300000);
    }
}

// ============================================================================
// MAP PLOTTING & ROUTE DISPLAY
// ============================================================================

async function plotRoute() {
    if (!state.map || !state.activeRoute || !state.activeRoute.stops) return;
    
    // Update the stop order map FIRST
    updateStopOrderMap();
    
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
            icon: createLeafletIcon(stop),
            zIndexOffset: isNextStop(stop) ? 1000 : index
        })
        .addTo(state.map)
        .bindPopup(createStopPopup(stop), {
            maxWidth: 340,
            className: 'enhanced-popup',
            autoPan: true,
            autoPanPadding: [20, 20],
            autoClose: true,
            closeOnClick: true
        });
        
        marker.on('click', function() {
            this.openPopup();
        });
        
        state.markers.push(marker);
        bounds.extend([stop.location.lat, stop.location.lng]);
    });
    
    // Add current location if available
    if (state.currentLocation) {
        bounds.extend([state.currentLocation.lat, state.currentLocation.lng]);
    }
    
    state.map.fitBounds(bounds, { 
        padding: [60, 60],
        maxZoom: 16
    });
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

// ============================================================================
// MARKER & POPUP CREATION
// ============================================================================

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

function createLeafletIcon(stop) {
    const isCompleted = stop.completed;
    const isActive = isNextStop(stop);
    const type = stop.type;
    
    // Get the order number from the map
    const orderNumber = state.stopOrderMap[stop.id] || '';
    
    // Show order number if route is optimized and numbered markers are enabled
    const showOrderNumber = state.activeRoute?.isOptimized && 
                           orderNumber && 
                           state.showNumberedMarkers !== false;
    
    const bgColor = isCompleted ? '#2C2C2E' : type === 'pickup' ? '#FF9F0A' : '#007AFF';
    const borderColor = isCompleted ? '#48484A' : '#FFFFFF';
    const symbol = isCompleted ? '✓' : showOrderNumber ? orderNumber : (type === 'pickup' ? 'P' : 'D');
    
    // Different sizes for number vs letter
    const fontSize = showOrderNumber ? '17px' : '20px';
    const markerSize = showOrderNumber ? '46px' : '44px';
    
    return L.divIcon({
        className: 'custom-marker',
        html: `
            <div class="stop-marker-wrapper ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}">
                <div class="stop-marker ${type}" style="
                    background: ${bgColor};
                    width: ${markerSize};
                    height: ${markerSize};
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 6px 16px rgba(0,0,0,0.6);
                    border: 3px solid ${borderColor};
                    position: relative;
                    transition: all 0.3s ease;
                ">
                    <span style="
                        color: ${isCompleted ? '#8E8E93' : 'white'};
                        font-weight: 800;
                        font-size: ${fontSize};
                        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                    ">${symbol}</span>
                    ${isActive ? '<div class="marker-pulse"></div>' : ''}
                </div>
                <div class="marker-label" style="
                    position: absolute;
                    bottom: -24px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(28, 28, 31, 0.95);
                    color: white;
                    padding: 3px 10px;
                    border-radius: 10px;
                    font-size: 11px;
                    font-weight: 600;
                    white-space: nowrap;
                    pointer-events: none;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                ">${type === 'pickup' ? 'Pickup' : 'Delivery'}</div>
            </div>
        `,
        iconSize: [parseInt(markerSize) + 20, 80],
        iconAnchor: [(parseInt(markerSize) + 20) / 2, 60],
        popupAnchor: [0, -60]
    });
}

function createStopPopup(stop) {
    const type = stop.type;
    const paymentInfo = getPaymentInfoForStop(stop);
    const orderNumber = state.stopOrderMap[stop.id] || '';
    const showOrderNumber = state.activeRoute?.isOptimized && orderNumber;
    
    // Different fields for pickup vs delivery
    let customerName, customerPhone;
    if (type === 'pickup') {
        customerName = stop.vendor_name || stop.vendorName || stop.sender_name || stop.customerName || 'Vendor';
        customerPhone = stop.vendor_phone || stop.vendorPhone || stop.sender_phone || stop.customerPhone || '';
    } else {
        customerName = stop.recipient_name || stop.recipientName || stop.customer_name || stop.customerName || 'Recipient';
        customerPhone = stop.recipient_phone || stop.recipientPhone || stop.customer_phone || stop.customerPhone || '';
    }
    
    const address = stop.address || stop.location_address || 'Address not available';
    const parcelCode = stop.parcelCode || stop.parcel_code || stop.code || 'N/A';
    const instructions = stop.specialInstructions || stop.special_instructions || stop.instructions || '';
    
    return `
        <div class="stop-popup">
            <div class="popup-header ${type}" style="
                padding: 18px 22px;
                margin: 0;
                font-weight: 700;
                font-size: 14px;
                letter-spacing: 1px;
                text-transform: uppercase;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: ${type === 'pickup' ? 'linear-gradient(135deg, #FF9F0A 0%, #FF6000 100%)' : 'linear-gradient(135deg, #007AFF 0%, #0051D5 100%)'};
                color: ${type === 'pickup' ? '#000000' : 'white'};
            ">
                ${showOrderNumber ? `
                    <div style="
                        position: absolute;
                        left: 20px;
                        top: 50%;
                        transform: translateY(-50%);
                        width: 36px;
                        height: 36px;
                        background: rgba(0, 0, 0, 0.25);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 18px;
                        font-weight: 800;
                        border: 2px solid rgba(255, 255, 255, 0.3);
                    ">${orderNumber}</div>
                    <span style="margin-left: 50px;">${type.toUpperCase()}</span>
                ` : `<span>${type.toUpperCase()}</span>`}
                <span style="
                    background: rgba(0, 0, 0, 0.2);
                    padding: 5px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                ">${parcelCode}</span>
            </div>
            <div class="popup-body" style="padding: 22px; background: transparent;">
                <h3 style="margin: 0 0 18px 0; font-size: 18px; font-weight: 600; color: white;">${address}</h3>
                <div class="popup-info" style="display: flex; flex-direction: column; gap: 14px;">
                    <div class="info-row" style="display: flex; align-items: flex-start; gap: 12px; padding: 10px; background: rgba(255, 255, 255, 0.03); border-radius: 10px;">
                        <span class="info-icon" style="width: 24px; font-size: 18px;">👤</span>
                        <span style="color: rgba(255, 255, 255, 0.9);">${customerName}</span>
                    </div>
                    ${customerPhone ? `
                        <div class="info-row" style="display: flex; align-items: flex-start; gap: 12px; padding: 10px; background: rgba(255, 255, 255, 0.03); border-radius: 10px;">
                            <span class="info-icon" style="width: 24px; font-size: 18px;">📞</span>
                            <a href="tel:${customerPhone}" style="color: #007AFF; text-decoration: none; font-weight: 600;">${customerPhone}</a>
                        </div>
                    ` : ''}
                    ${instructions ? `
                        <div class="info-row instructions" style="display: flex; align-items: flex-start; gap: 12px; padding: 10px; background: rgba(147, 51, 234, 0.1); border: 1px solid rgba(147, 51, 234, 0.2); border-radius: 10px;">
                            <span class="info-icon" style="width: 24px; font-size: 18px;">💬</span>
                            <span style="color: rgba(255, 255, 255, 0.9);">${instructions}</span>
                        </div>
                    ` : ''}
                    ${paymentInfo.needsCollection ? `
                        <div class="info-row payment" style="display: flex; align-items: flex-start; gap: 12px; padding: 14px; background: linear-gradient(135deg, rgba(255, 159, 10, 0.15), rgba(255, 107, 0, 0.1)); border: 1px solid rgba(255, 159, 10, 0.3); border-radius: 10px; margin-top: 12px;">
                            <span class="info-icon" style="width: 24px; font-size: 18px;">💰</span>
                            <span style="font-weight: 700; color: #FF9F0A;">
                                Collect: KES ${paymentInfo.amount.toLocaleString()}
                            </span>
                        </div>
                    ` : paymentInfo.method === 'online' ? `
                        <div class="info-row payment" style="display: flex; align-items: flex-start; gap: 12px; padding: 14px; background: rgba(52, 199, 89, 0.1); border: 1px solid rgba(52, 199, 89, 0.3); border-radius: 10px;">
                            <span class="info-icon" style="width: 24px; font-size: 18px;">✅</span>
                            <span style="color: #34C759; font-weight: 600;">Already Paid Online</span>
                        </div>
                    ` : ''}
                </div>
                ${!stop.completed && canCompleteStop(stop) ? `
                    <div class="popup-actions" style="display: flex; gap: 10px; margin-top: 22px; padding-top: 22px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                        <button onclick="openVerificationModal('${stop.id}')" style="
                            flex: 1;
                            padding: 14px 18px;
                            border: none;
                            border-radius: 14px;
                            font-size: 14px;
                            font-weight: 600;
                            cursor: pointer;
                            background: linear-gradient(135deg, #34C759, #30D158);
                            color: white;
                            box-shadow: 0 4px 12px rgba(52, 199, 89, 0.3);
                        ">
                            <span>✓ Verify ${stop.type}</span>
                        </button>
                        <button onclick="navigateToStop('${stop.id}')" style="
                            padding: 14px 18px;
                            border: none;
                            border-radius: 14px;
                            font-size: 14px;
                            font-weight: 600;
                            cursor: pointer;
                            background: rgba(255, 255, 255, 0.08);
                            color: white;
                            border: 1px solid rgba(255, 255, 255, 0.15);
                        ">
                            <span>🧭 Navigate</span>
                        </button>
                    </div>
                ` : stop.completed ? `
                    <div style="margin-top: 18px; padding: 14px; background: linear-gradient(135deg, rgba(52, 199, 89, 0.15), rgba(48, 209, 88, 0.1)); border: 1px solid rgba(52, 199, 89, 0.3); border-radius: 14px; text-align: center; color: #34C759; font-weight: 600; font-size: 14px;">
                        <span>✓ Completed ${formatTimeAgo(stop.timestamp)}</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

function calculateZoomFromSpeed(speed) {
    if (speed > 60) return 15;
    if (speed > 40) return 16;
    if (speed > 20) return 17;
    if (speed > 5) return 18;
    return 18;
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

// ============================================================================
// NAVIGATION CONTROL FUNCTIONS
// ============================================================================

window.centerOnLocation = function() {
    if (state.currentLocation && state.map) {
        state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 17, {
            animate: true,
            duration: 1
        });
        
        // Flash the location marker
        if (state.currentLocationMarker) {
            const marker = state.currentLocationMarker.getElement();
            if (marker) {
                marker.style.animation = 'none';
                setTimeout(() => {
                    marker.style.animation = '';
                }, 100);
            }
        }
        
        showNotification('Centered on your location', 'info');
    } else {
        showNotification('Getting your location...', 'info');
        startLocationTracking();
    }
};

window.toggleLocationTracking = function() {
    if (state.isTracking) {
        stopLocationTracking();
    } else {
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
    state.navigationActive = true;
    showNotification(`Navigating to ${nextStop.type} at ${nextStop.address}`, 'info');
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

window.navigateToStop = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop) return;
    
    state.navigationActive = true;
    showNotification(`Navigating to ${stop.type} location`, 'info');
    
    // Center map on stop
    if (state.map) {
        state.map.setView([stop.location.lat, stop.location.lng], 16);
    }
};
/**
 * Enhanced Route Navigation Module - Part 4/4
 * Display, Verification, and Completion Functions
 * Version: 4.0.0
 */

// ============================================================================
// ROUTE DISPLAY FUNCTIONS
// ============================================================================

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

function displayStops() {
    const stopsList = document.getElementById('stopsList');
    if (!stopsList || !state.activeRoute) return;
    
    updateParcelsInPossession();
    
    let html = '';
    
    // Add route efficiency badge if optimized
    if (state.activeRoute.isOptimized) {
        html += `
            <div class="route-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                <h3 style="margin: 0; color: white;">Optimized Route</h3>
                ${state.optimizationStats.savedDistance > 0 ? `
                    <span style="
                        background: linear-gradient(135deg, #9333EA, #7928CA);
                        color: white;
                        padding: 6px 12px;
                        border-radius: 20px;
                        font-size: 12px;
                        font-weight: 600;
                    ">
                        Saved ${state.optimizationStats.savedDistance.toFixed(1)}km
                    </span>
                ` : ''}
            </div>
        `;
    }
    
    if (state.parcelsInPossession.length > 0) {
        html += createParcelsInPossessionWidget();
    }
    
    // Display all stops in current order
    html += `<div class="stops-container">`;
    state.activeRoute.stops.forEach((stop, index) => {
        const orderNumber = state.stopOrderMap[stop.id] || (index + 1);
        html += createStopCard(stop, orderNumber, stop.type);
    });
    html += `</div>`;
    
    stopsList.innerHTML = html;
}

function createParcelsInPossessionWidget() {
    return `
        <div class="parcels-possession-widget" style="
            background: linear-gradient(135deg, rgba(255, 159, 10, 0.15), rgba(255, 107, 0, 0.1));
            border: 1px solid rgba(255, 159, 10, 0.3);
            border-radius: 16px;
            padding: 18px;
            margin-bottom: 20px;
        ">
            <div class="carrying-banner" style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
                <span class="carrying-icon">📦</span>
                <span style="font-weight: 700; color: white; font-size: 15px;">
                    Carrying ${state.parcelsInPossession.length} parcel${state.parcelsInPossession.length > 1 ? 's' : ''}
                </span>
            </div>
            <div class="parcel-cards" style="display: flex; flex-direction: column; gap: 10px;">
                ${state.parcelsInPossession.map(parcel => {
                    const deliveryStop = state.activeRoute.stops.find(s => 
                        s.type === 'delivery' && (s.parcelId === parcel.parcelId || s.parcelCode === parcel.parcelCode)
                    );
                    const paymentInfo = deliveryStop ? getPaymentInfoForStop(deliveryStop) : null;
                    
                    return `
                        <div class="parcel-card" style="
                            background: rgba(255, 255, 255, 0.05);
                            border-radius: 12px;
                            padding: 14px;
                            border-left: 3px solid #FF9F0A;
                        ">
                            <div style="font-weight: 700; margin-bottom: 4px; color: white; font-size: 15px;">
                                ${parcel.parcelCode}
                            </div>
                            <div style="font-size: 14px; color: rgba(255, 255, 255, 0.6); margin-bottom: 4px;">
                                ${parcel.destination}
                            </div>
                            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.4);">
                                Picked up ${formatTimeAgo(parcel.pickupTime)}
                            </div>
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
                s.type === 'delivery' && 
                (s.parcelId === stop.parcelId || s.parcelCode === stop.parcelCode)
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

function createStopCard(stop, number, type) {
    const isActive = isNextStop(stop);
    const canInteract = !stop.completed && canCompleteStop(stop);
    const paymentInfo = getPaymentInfoForStop(stop);
    
    // Different fields for pickup vs delivery
    let customerName, customerPhone;
    if (type === 'pickup') {
        customerName = stop.vendor_name || stop.vendorName || stop.sender_name || stop.customerName || 'Vendor';
        customerPhone = stop.vendor_phone || stop.vendorPhone || stop.sender_phone || stop.customerPhone || '';
    } else {
        customerName = stop.recipient_name || stop.recipientName || stop.customer_name || stop.customerName || 'Recipient';
        customerPhone = stop.recipient_phone || stop.recipientPhone || stop.customer_phone || stop.customerPhone || '';
    }
    
    const address = stop.address || stop.location_address || 'Address not available';
    const parcelCode = stop.parcelCode || stop.parcel_code || stop.code || 'N/A';
    const instructions = stop.specialInstructions || stop.special_instructions || stop.instructions || '';
    
    return `
        <div class="stop-card ${stop.completed ? 'completed' : ''} ${isActive ? 'active' : ''}" 
             onclick="${canInteract ? `selectStop('${stop.id}')` : ''}"
             data-stop-id="${stop.id}"
             style="
                 background: ${stop.completed ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)'};
                 border: 1px solid ${stop.completed ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'};
                 border-radius: 16px;
                 padding: 16px;
                 margin-bottom: 12px;
                 cursor: ${canInteract ? 'pointer' : 'default'};
                 transition: all 0.3s ease;
                 ${isActive ? 'border-color: #9333EA; box-shadow: 0 0 20px rgba(147, 51, 234, 0.3);' : ''}
             ">
            <div style="display: flex; gap: 16px;">
                <div class="stop-number-badge" style="
                    width: 44px;
                    height: 44px;
                    background: ${stop.completed ? '#2C2C2E' : type === 'pickup' ? '#FF9F0A' : '#007AFF'};
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 800;
                    font-size: 18px;
                    color: ${stop.completed ? '#8E8E93' : 'white'};
                    flex-shrink: 0;
                ">
                    ${stop.completed ? '✓' : number}
                </div>
                <div style="flex: 1;">
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; color: white; font-weight: 600;">
                        ${address}
                    </h3>
                    <div style="display: flex; flex-direction: column; gap: 6px; font-size: 14px;">
                        <div style="color: rgba(255,255,255,0.7);">
                            <span>👤 ${customerName}</span>
                            ${customerPhone ? ` • ${customerPhone}` : ''}
                        </div>
                        <div style="color: rgba(255,255,255,0.6);">
                            📋 Code: ${parcelCode}
                        </div>
                        ${instructions ? `
                            <div style="color: rgba(255,255,255,0.6); font-style: italic;">
                                💬 ${instructions}
                            </div>
                        ` : ''}
                    </div>
                    
                    ${type === 'delivery' && paymentInfo.needsCollection ? `
                        <div style="
                            margin-top: 10px;
                            padding: 8px 12px;
                            background: ${stop.completed ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 159, 10, 0.15)'};
                            border: 1px solid ${stop.completed ? 'rgba(52, 199, 89, 0.3)' : 'rgba(255, 159, 10, 0.3)'};
                            border-radius: 8px;
                            font-weight: 600;
                            color: ${stop.completed ? '#34C759' : '#FF9F0A'};
                        ">
                            💵 ${stop.completed ? 'Collected' : 'COLLECT'}: KES ${paymentInfo.amount.toLocaleString()}
                        </div>
                    ` : type === 'delivery' && paymentInfo.method === 'online' ? `
                        <div style="
                            margin-top: 10px;
                            padding: 8px 12px;
                            background: rgba(52, 199, 89, 0.1);
                            border: 1px solid rgba(52, 199, 89, 0.3);
                            border-radius: 8px;
                            color: #34C759;
                            font-weight: 600;
                        ">
                            ✅ Already Paid Online
                        </div>
                    ` : ''}
                    
                    ${stop.completed ? `
                        <div style="margin-top: 10px; color: #34C759; font-size: 13px; font-weight: 600;">
                            ✓ Completed ${formatTimeAgo(stop.timestamp)}
                        </div>
                    ` : isActive ? `
                        <div style="margin-top: 10px; color: #9333EA; font-size: 13px; font-weight: 600;">
                            → Current Stop
                        </div>
                    ` : ''}
                </div>
                ${!stop.completed && canInteract ? `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <button onclick="event.stopPropagation(); navigateToStop('${stop.id}')" style="
                            background: rgba(255,255,255,0.1);
                            border: none;
                            border-radius: 10px;
                            width: 40px;
                            height: 40px;
                            cursor: pointer;
                            font-size: 20px;
                        ">🧭</button>
                        ${customerPhone ? `
                            <a href="tel:${customerPhone}" onclick="event.stopPropagation();" style="
                                background: rgba(255,255,255,0.1);
                                border: none;
                                border-radius: 10px;
                                width: 40px;
                                height: 40px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                text-decoration: none;
                                font-size: 20px;
                            ">📞</a>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// ============================================================================
// VERIFICATION & COMPLETION FUNCTIONS
// ============================================================================

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
    modal.style.cssText = `
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
    `;
    
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeVerificationModal()" style="
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(10, 10, 11, 0.9);
            backdrop-filter: blur(20px);
        "></div>
        <div class="modal-content" style="
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
        ">
            <div class="modal-header" style="
                padding: 20px 24px;
                background: ${stop.type === 'pickup' ? 'linear-gradient(135deg, #FF9F0A, #FF6B00)' : 'linear-gradient(135deg, #34C759, #30D158)'};
                color: ${stop.type === 'pickup' ? '#0A0A0B' : 'white'};
                display: flex;
                align-items: center;
                gap: 12px;
                border-radius: 24px 24px 0 0;
            ">
                <span style="font-size: 24px;">${stop.type === 'pickup' ? '📦' : '📍'}</span>
                <h2 style="margin: 0; font-size: 20px; font-weight: 700;">
                    Verify ${stop.type === 'pickup' ? 'Pickup' : 'Delivery'}
                </h2>
            </div>
            <div class="modal-body" style="padding: 24px;">
                <div class="stop-summary" style="margin-bottom: 24px;">
                    <h3 style="font-size: 18px; margin-bottom: 14px; color: white; font-weight: 600;">
                        ${stop.address}
                    </h3>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: flex; gap: 12px; font-size: 15px;">
                            <span style="color: rgba(255, 255, 255, 0.5); min-width: 90px;">Customer:</span>
                            <span style="color: white; font-weight: 600;">
                                ${stop.customerName || stop.vendor_name || stop.recipient_name || 'N/A'}
                            </span>
                        </div>
                        <div style="display: flex; gap: 12px; font-size: 15px;">
                            <span style="color: rgba(255, 255, 255, 0.5); min-width: 90px;">Phone:</span>
                            <span style="color: white; font-weight: 600;">
                                ${stop.customerPhone || stop.vendor_phone || stop.recipient_phone || 'N/A'}
                            </span>
                        </div>
                        <div style="display: flex; gap: 12px; font-size: 15px;">
                            <span style="color: rgba(255, 255, 255, 0.5); min-width: 90px;">Parcel Code:</span>
                            <span style="color: white; font-weight: 600;">
                                ${stop.parcelCode || 'N/A'}
                            </span>
                        </div>
                    </div>
                </div>
                
                <div class="verification-section">
                    <label style="font-weight: 600; font-size: 15px; color: white; display: block; margin-bottom: 12px;">
                        Enter ${stop.type} verification code:
                    </label>
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
                    <p style="font-size: 13px; color: rgba(255, 255, 255, 0.5); text-align: center; margin-top: 8px;">
                        Ask the ${stop.type === 'pickup' ? 'sender' : 'recipient'} for their code
                    </p>
                </div>
                
                ${stop.type === 'delivery' && paymentInfo.needsCollection ? `
                    <div style="margin-top: 18px; padding: 14px; background: rgba(255, 255, 255, 0.05); border-radius: 12px;">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-weight: 600;">
                            <input type="checkbox" id="paymentCollected" style="width: 22px; height: 22px; cursor: pointer;">
                            <span style="font-size: 15px; color: white;">
                                I have collected KES ${paymentInfo.amount.toLocaleString()} cash
                            </span>
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
                        background: linear-gradient(135deg, #0066FF, #0052CC);
                        color: white;
                    ">
                        ✓ Verify ${stop.type === 'pickup' ? 'Pickup' : 'Delivery'}
                    </button>
                    <button class="modal-btn secondary" onclick="closeVerificationModal()" style="
                        padding: 18px 24px;
                        border: none;
                        border-radius: 14px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
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
        code === stop.verificationCode?.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
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
        <div style="
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
        <div style="
            font-size: 26px;
            font-weight: 800;
            color: white;
            letter-spacing: -0.5px;
        ">${type === 'pickup' ? 'Pickup' : 'Delivery'} Verified!</div>
    `;
    
    document.body.appendChild(animation);
    setTimeout(() => animation.remove(), 2000);
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
            <div style="font-size: 72px; margin-bottom: 24px;">🏆</div>
            <h1 style="font-size: 32px; font-weight: 800; margin-bottom: 14px; letter-spacing: -1px; color: white;">
                Route Complete!
            </h1>
            <p style="font-size: 16px; color: rgba(255, 255, 255, 0.6); margin-bottom: 28px; font-weight: 500;">
                Excellent work! All deliveries completed successfully.
            </p>
            <div style="display: flex; justify-content: center; gap: 40px; margin-bottom: 36px;">
                <div style="text-align: center;">
                    <span style="display: block; font-size: 36px; font-weight: 800; color: #9333EA; margin-bottom: 6px;">
                        ${state.activeRoute.stops.length}
                    </span>
                    <span style="font-size: 13px; color: rgba(255, 255, 255, 0.5); text-transform: uppercase;">
                        Stops
                    </span>
                </div>
                <div style="text-align: center;">
                    <span style="display: block; font-size: 36px; font-weight: 800; color: #9333EA; margin-bottom: 6px;">
                        KES ${Math.round(state.totalRouteEarnings)}
                    </span>
                    <span style="font-size: 13px; color: rgba(255, 255, 255, 0.5); text-transform: uppercase;">
                        Earned
                    </span>
                </div>
            </div>
            ${state.optimizationStats.savedDistance > 0 ? `
                <div style="margin-bottom: 24px; padding: 14px; background: rgba(147, 51, 234, 0.1); border-radius: 12px;">
                    <p style="margin: 0; color: #9333EA; font-weight: 600;">
                        Route optimization saved ${state.optimizationStats.savedDistance.toFixed(1)}km (${state.optimizationStats.savedPercentage}%)
                    </p>
                </div>
            ` : ''}
            <button onclick="finishRoute()" style="
                width: 100%;
                background: linear-gradient(135deg, #9333EA, #7928CA);
                color: white;
                border: none;
                border-radius: 16px;
                padding: 18px;
                font-size: 17px;
                font-weight: 700;
                cursor: pointer;
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getNextStop() {
    if (!state.activeRoute || !state.activeRoute.stops) return null;
    return state.activeRoute.stops.find(stop => !stop.completed);
}

function getCurrentStop() {
    if (!state.activeRoute) return null;
    
    const completedStops = state.activeRoute.stops.filter(s => s.completed);
    if (completedStops.length === 0) return null;
    
    return completedStops[completedStops.length - 1];
}

function isNextStop(stop) {
    const nextStop = getNextStop();
    return nextStop && nextStop.id === stop.id;
}

function canCompleteStop(stop) {
    if (stop.type === 'pickup') return true;
    return canCompleteDelivery(stop);
}

function canCompleteDelivery(deliveryStop) {
    if (!state.activeRoute || !state.activeRoute.stops) return false;
    
    const pickupStop = state.activeRoute.stops.find(s => 
        s.type === 'pickup' && 
        (s.parcelId === deliveryStop.parcelId || s.parcelCode === deliveryStop.parcelCode)
    );
    
    return pickupStop && pickupStop.completed;
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const minutes = Math.floor((Date.now() - new Date(timestamp)) / 60000);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
}

function updateRouteStats() {
    const remainingStops = state.activeRoute.stops.filter(s => !s.completed).length;
    
    let totalDistance = 0;
    if (state.activeRoute.distance) {
        totalDistance = parseFloat(state.activeRoute.distance);
    } else if (state.activeRoute.total_distance) {
        totalDistance = parseFloat(state.activeRoute.total_distance);
    } else {
        totalDistance = calculateTotalRouteDistance(state.activeRoute.stops);
    }
    
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

function updateNavigationInfo() {
    // Called during navigation to update real-time info
}

function initializeOptimizeButton() {
    setTimeout(() => {
        addOptimizeButton();
        
        if (state.activeRoute && state.activeRoute.isOptimized) {
            updateOptimizeButton(true);
        }
    }, 500);
}

// ============================================================================
// WINDOW FUNCTIONS
// ============================================================================

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

window.goBack = function() {
    if (confirm('Are you sure you want to exit navigation?')) {
        window.location.href = './rider.html';
    }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Route.js v4.0.0 initializing with external optimizer...');
    
    injectNavigationStyles();
    
    await waitForLeaflet();
    
    try {
        const storedRoute = localStorage.getItem('tuma_active_route');
        
        if (storedRoute) {
            state.activeRoute = JSON.parse(storedRoute);
            console.log('Route loaded:', state.activeRoute);
            console.log('Using external route optimizer module');
            
            updateStopOrderMap();
            calculateRouteFinancials();
            calculateCashCollection();
            
            await initializeMap();
            
            displayRouteInfo();
            updateDynamicHeader();
            
            await plotRoute();
            await drawOptimizedRoute();
            
            // Show UI elements
            const routePanel = document.getElementById('routePanel');
            const navControls = document.getElementById('navControls');
            const emptyState = document.getElementById('emptyState');
            
            if (routePanel) {
                routePanel.style.display = 'block';
                state.isPanelVisible = true;
            }
            
            if (navControls) {
                navControls.style.display = 'flex';
            }
            
            if (emptyState) {
                emptyState.style.display = 'none';
            }
            
            initializeOptimizeButton();
            
            if (state.totalCashToCollect > 0) {
                showCashCollectionWidget();
            }
            
            startLocationTracking();
            
            console.log('Route initialization complete');
        } else {
            console.log('No active route found');
            
            const routePanel = document.getElementById('routePanel');
            const navControls = document.getElementById('navControls');
            const emptyState = document.getElementById('emptyState');
            
            if (routePanel) routePanel.style.display = 'none';
            if (navControls) navControls.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
        }
    } catch (error) {
        console.error('Error initializing route:', error);
        
        const emptyState = document.getElementById('emptyState');
        if (emptyState) {
            emptyState.style.display = 'block';
        }
    }
});

// Debug utilities
window.routeDebug = {
    state,
    config,
    optimizer: routeOptimizer,
    testOptimization: () => {
        if (!state.activeRoute) {
            console.log('No route loaded');
            return;
        }
        
        // Test optimization without current location
        const result = routeOptimizer.optimizeRoute(state.activeRoute.stops);
        
        // Get statistics
        const stats = routeOptimizer.getStatistics();
        
        console.log('Optimization result:', result);
        console.log('Statistics:', stats);
        return { optimizedRoute: result, statistics: stats };
    },
    getOptimizerConfig: () => routeOptimizer.getConfig(),
    updateOptimizerConfig: (newConfig) => routeOptimizer.updateConfig(newConfig)
};

console.log('✅ Route.js v4.0.0 loaded - Using external route-optimizer.js module');
console.log('Debug: window.routeDebug');
console.log('Optimizer config:', routeOptimizer.getConfig());
