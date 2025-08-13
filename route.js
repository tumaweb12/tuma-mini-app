/**
 * Complete Enhanced Route Navigation Module with Payment Collection
 * Includes payment tracking, cash collection reminders, and financial summaries
 * PART 1 OF 2
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
    useGreedyOptimization: true // Enable greedy route optimization
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
    // Payment tracking
    totalCashToCollect: 0,
    totalCashCollected: 0,
    paymentsByStop: {},
    // Greedy optimization state
    optimizedStopOrder: null,
    proofOfDeliveryPhotos: {} // Store POD photos by stop ID
};

// API Configuration
const OPENROUTE_API_KEY = '5b3ce3597851110001cf624841e48578ffb34c6b96dfe3bbe9b3ad4c';
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

// Business configuration (matching rider.js)
const BUSINESS_CONFIG = {
    commission: {
        rider: 0.70,
        platform: 0.30,
        maxUnpaid: 300,
        warningThreshold: 250
    }
};

// Direct API functions (no wrapper)
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

// Helper function to parse price from various formats
function parsePrice(priceValue) {
    if (typeof priceValue === 'number') return priceValue;
    if (typeof priceValue === 'string') {
        const cleaned = priceValue.replace(/[^0-9.-]+/g, '');
        return parseFloat(cleaned) || 0;
    }
    return 0;
}

// Enhanced function to get payment info for a stop
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

// GREEDY OPTIMIZATION ALGORITHM
function optimizeRouteGreedy() {
    if (!state.activeRoute || !state.activeRoute.stops) return;
    
    const stops = [...state.activeRoute.stops];
    const optimized = [];
    const remaining = new Set(stops.map((s, i) => i));
    
    // Track which pickups are completed
    const pickedParcels = new Set();
    
    // Start from current location or first stop
    let currentPos = state.currentLocation || (stops[0] && stops[0].location);
    
    while (remaining.size > 0) {
        let bestIndex = -1;
        let bestDistance = Infinity;
        
        // Find the nearest valid stop
        for (const idx of remaining) {
            const stop = stops[idx];
            
            // Check if this stop is valid
            if (stop.type === 'delivery') {
                // Can only deliver if we've picked up this parcel
                const pickupStop = stops.find(s => 
                    s.type === 'pickup' && s.parcelId === stop.parcelId
                );
                if (pickupStop && !pickedParcels.has(pickupStop.parcelId)) {
                    continue; // Skip this delivery, pickup not done yet
                }
            }
            
            // Calculate distance
            const dist = calculateDistance(currentPos, stop.location);
            if (dist < bestDistance) {
                bestDistance = dist;
                bestIndex = idx;
            }
        }
        
        if (bestIndex === -1) {
            // No valid stops found (shouldn't happen)
            console.error('No valid next stop found in greedy optimization');
            break;
        }
        
        // Add the best stop to optimized route
        const bestStop = stops[bestIndex];
        optimized.push(bestStop);
        remaining.delete(bestIndex);
        
        // Update tracking
        if (bestStop.type === 'pickup') {
            pickedParcels.add(bestStop.parcelId);
        }
        
        // Update current position
        currentPos = bestStop.location;
    }
    
    // Update the route with optimized order
    state.activeRoute.stops = optimized;
    state.optimizedStopOrder = optimized.map(s => s.id);
    
    console.log('Route optimized using greedy algorithm:', optimized);
}

// Calculate total cash to collect
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

// Sync helper function
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

// CSS injection function for navigation styles
function injectNavigationStyles() {
    const style = document.createElement('style');
    style.textContent = `
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
        
        /* Enhanced Cash collection widget - GREEN THEME */
        .cash-collection-widget {
            position: fixed;
            top: 80px;
            right: 20px;
            background: linear-gradient(135deg, rgba(52, 199, 89, 0.95), rgba(34, 163, 70, 0.95));
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 16px;
            min-width: 200px;
            box-shadow: 0 4px 20px rgba(52, 199, 89, 0.3);
            z-index: 100;
            transition: all 0.3s ease;
            border: 1px solid rgba(52, 199, 89, 0.5);
        }
        
        .cash-collection-widget.has-pending {
            background: linear-gradient(135deg, rgba(52, 199, 89, 0.95), rgba(40, 180, 75, 0.95));
            animation: cashPulse 2s infinite;
        }
        
        @keyframes cashPulse {
            0%, 100% { box-shadow: 0 4px 20px rgba(52, 199, 89, 0.3); }
            50% { box-shadow: 0 4px 30px rgba(52, 199, 89, 0.6); }
        }
        
        .cash-widget-title {
            font-size: 14px;
            font-weight: 600;
            color: white;
            opacity: 0.95;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .cash-widget-amount {
            font-size: 28px;
            font-weight: 700;
            color: white;
            margin-bottom: 12px;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .cash-widget-breakdown {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding-top: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.3);
        }
        
        .cash-breakdown-item {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            color: white;
        }
        
        .cash-breakdown-label {
            opacity: 0.9;
        }
        
        .cash-breakdown-value {
            font-weight: 600;
        }
        
        /* Payment badge for stop cards */
        .payment-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: linear-gradient(135deg, rgba(255, 159, 10, 0.2), rgba(255, 149, 0, 0.1));
            border: 1px solid var(--warning);
            border-radius: 20px;
            padding: 6px 12px;
            margin-top: 8px;
            font-size: 14px;
            font-weight: 600;
            color: var(--warning);
        }
        
        .payment-badge.collected {
            background: linear-gradient(135deg, rgba(52, 199, 89, 0.2), rgba(48, 209, 88, 0.1));
            border-color: var(--success);
            color: var(--success);
        }
        
        .payment-badge.prepaid {
            background: linear-gradient(135deg, rgba(0, 102, 255, 0.2), rgba(0, 88, 255, 0.1));
            border-color: var(--primary);
            color: var(--primary);
        }
        
        /* Payment reminder in navigation */
        .payment-reminder {
            position: fixed;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #34C759, #28A745);
            color: white;
            padding: 10px 20px;
            border-radius: 25px;
            font-size: 15px;
            font-weight: 600;
            box-shadow: 0 4px 15px rgba(52, 199, 89, 0.4);
            z-index: 1001;
            animation: cashBounce 2s infinite;
        }
        
        @keyframes cashBounce {
            0%, 100% { transform: translateX(-50%) translateY(0); }
            50% { transform: translateX(-50%) translateY(-5px); }
        }
        
        /* Photo capture styles for POD */
        .photo-capture-container {
            margin: 20px 0;
            text-align: center;
        }
        
        .photo-preview {
            width: 100%;
            max-width: 300px;
            height: 200px;
            background: var(--surface-high);
            border: 2px dashed var(--border);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 12px;
            position: relative;
            overflow: hidden;
        }
        
        .photo-preview img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .photo-preview-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            color: var(--text-secondary);
        }
        
        .photo-preview-placeholder .camera-icon {
            font-size: 48px;
            opacity: 0.5;
        }
        
        .capture-button {
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 12px;
            padding: 12px 24px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
        }
        
        .capture-button:hover {
            background: var(--primary-dark);
            transform: translateY(-1px);
        }
        
        .capture-button:active {
            transform: translateY(0);
        }
        
        .photo-captured {
            background: var(--success);
        }
        
        /* Hidden file input */
        #photoInput {
            display: none;
        }
        
        /* Ensure navigation doesn't block map */
        .enhanced-navigation {
            pointer-events: none !important;
        }
        
        .enhanced-navigation.waze-style {
            pointer-events: none !important;
        }
        
        /* Individual elements should be clickable */
        .waze-nav-top,
        .waze-bottom-pills,
        .waze-fab,
        .waze-nav-menu,
        .cash-collection-widget {
            pointer-events: auto !important;
        }
        
        /* Enhanced rider location marker */
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
            background: rgba(0, 102, 255, 0.3);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% {
                transform: translate(-50%, -50%) scale(0.8);
                opacity: 0.8;
            }
            50% {
                transform: translate(-50%, -50%) scale(1.2);
                opacity: 0.4;
            }
            100% {
                transform: translate(-50%, -50%) scale(0.8);
                opacity: 0.8;
            }
        }
        
        /* Rest of the styles remain the same... */
    `;
    document.head.appendChild(style);
}

// Wait for Leaflet to load
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
    console.log('Route.js initializing with enhanced features...');
    
    injectNavigationStyles();
    addWazeNavigationStyles();
    
    await waitForLeaflet();
    
    try {
        const storedRoute = localStorage.getItem('tuma_active_route');
        console.log('Stored route data:', storedRoute);
        
        if (storedRoute) {
            state.activeRoute = JSON.parse(storedRoute);
            console.log('Parsed route:', state.activeRoute);
            
            // Apply greedy optimization if enabled
            if (config.useGreedyOptimization && !state.activeRoute.stops.some(s => s.completed)) {
                optimizeRouteGreedy();
            }
            
            calculateRouteFinancials();
            calculateCashCollection();
            
            await initializeMap();
            displayRouteInfo();
            updateDynamicHeader();
            await plotRoute();
            await drawOptimizedRoute();
            showRoutePanel();
            enhanceRoutePanel();
            
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

// Enhanced show cash collection widget with green theme
function showCashCollectionWidget() {
    const existingWidget = document.querySelector('.cash-collection-widget');
    if (existingWidget) existingWidget.remove();
    
    const pendingAmount = state.totalCashToCollect - state.totalCashCollected;
    const hasPending = pendingAmount > 0;
    
    const widget = document.createElement('div');
    widget.className = `cash-collection-widget ${hasPending ? 'has-pending' : ''}`;
    widget.innerHTML = `
        <div class="cash-widget-title">
            <span>💵</span>
            <span>Cash Collection</span>
        </div>
        <div class="cash-widget-amount">
            KES ${pendingAmount.toLocaleString()}
        </div>
        <div class="cash-widget-breakdown">
            <div class="cash-breakdown-item">
                <span class="cash-breakdown-label">Total to collect</span>
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

// Update cash collection widget
function updateCashCollectionWidget() {
    calculateCashCollection();
    const widget = document.querySelector('.cash-collection-widget');
    if (widget) {
        showCashCollectionWidget();
    }
}

// Calculate route financials
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

// Initialize Leaflet Map with rotation support
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

// Handle route completion
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
        proofOfDeliveries: state.proofOfDeliveryPhotos
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
                        payment_status: parcel.payment_method === 'cash' ? 'collected' : parcel.payment_status,
                        proof_of_delivery: state.proofOfDeliveryPhotos[parcel.id] || null
                    }
                );
            }
        } catch (error) {
            console.error('Error updating parcel status:', error);
        }
    }
}

// Create enhanced rider icon with better visibility
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
// PART 2 OF 2 - Continued from Part 1

// Fixed toggle route panel functionality
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

// Enhance route panel with drag functionality
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

// Update current location without accuracy circle
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

// Calculate zoom level based on speed
function calculateZoomFromSpeed(speed) {
    if (speed > 60) return 15;
    if (speed > 40) return 16;
    if (speed > 20) return 17;
    if (speed > 5) return 18;
    return 18;
}

// Calculate bearing between two points
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

// Update navigation info
function updateNavigationInfo() {
    // This will be called during navigation to update any real-time info
}

// Calculate bounds from stops
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

// Update dynamic header
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

// Get short name for a stop
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

// Get current stop
function getCurrentStop() {
    if (!state.activeRoute) return null;
    
    const completedStops = state.activeRoute.stops.filter(s => s.completed);
    if (completedStops.length === 0) return null;
    
    return completedStops[completedStops.length - 1];
}

// Toggle follow mode
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

// Toggle heading up mode
window.toggleHeadingMode = function() {
    state.config.headingUp = !state.config.headingUp;
    showNotification(state.config.headingUp ? 'Heading up mode (rotation requires plugin)' : 'North up mode', 'info');
};

// Create custom Leaflet icon with Tuma theme
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

// Create popup content with payment info
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

// FIXED: Plot route on map without radius circles and ensure polyline is visible
async function plotRoute() {
    if (!state.map || !state.activeRoute || !state.activeRoute.stops) return;
    
    // Clear existing markers
    state.markers.forEach(marker => marker.remove());
    state.markers = [];
    
    // Remove existing polyline
    if (state.routePolyline) {
        state.map.removeLayer(state.routePolyline);
        state.routePolyline = null;
    }
    
    // Remove any radius circles
    if (state.radiusCircle) {
        state.map.removeLayer(state.radiusCircle);
        state.radiusCircle = null;
    }
    
    const bounds = L.latLngBounds();
    const routeCoordinates = [];
    
    // Add markers and collect coordinates
    state.activeRoute.stops.forEach((stop, index) => {
        const marker = L.marker([stop.location.lat, stop.location.lng], {
            icon: createLeafletIcon(stop)
        })
        .addTo(state.map)
        .bindPopup(createStopPopup(stop));
        
        state.markers.push(marker);
        bounds.extend([stop.location.lat, stop.location.lng]);
        routeCoordinates.push([stop.location.lat, stop.location.lng]);
    });
    
    // Draw simple polyline connecting all stops
    if (routeCoordinates.length > 1) {
        state.routePolyline = L.polyline(routeCoordinates, {
            color: '#0066FF',
            weight: 4,
            opacity: 0.7,
            dashArray: '10, 10',
            smoothFactor: 1
        }).addTo(state.map);
    }
    
    // Fit bounds
    state.map.fitBounds(bounds, { padding: [50, 50] });
}

// FIXED: Draw optimized route using OpenRouteService with better error handling
async function drawOptimizedRoute() {
    if (!state.activeRoute || !state.map) return;
    
    const stops = state.activeRoute.stops.filter(s => !s.completed);
    if (stops.length < 1) {
        console.log('No stops to draw route');
        return;
    }
    
    try {
        // Remove existing polyline
        if (state.routePolyline) {
            state.map.removeLayer(state.routePolyline);
            state.routePolyline = null;
        }
        
        let coordinates = [];
        
        // Add current location if available and tracking
        if (state.currentLocation && state.isTracking) {
            coordinates.push([state.currentLocation.lng, state.currentLocation.lat]);
        }
        
        // Add stop coordinates
        stops.forEach(stop => {
            coordinates.push([stop.location.lng, stop.location.lat]);
        });
        
        // Need at least 2 points for a route
        if (coordinates.length < 2) {
            // If only one stop and no current location, just show the stop
            console.log('Not enough coordinates for route');
            return;
        }
        
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
            
            // Draw the optimized route
            state.routePolyline = L.polyline(decodedCoords, {
                color: '#0066FF',
                weight: 6,
                opacity: 0.9,
                smoothFactor: 1
            }).addTo(state.map);
            
            // Update route stats
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
        // Fallback to simple line
        drawFallbackRoute(stops);
    }
}

// Fallback route drawing with better visibility
function drawFallbackRoute(stops) {
    console.log('Drawing fallback route');
    const coords = [];
    
    // Add current location if available
    if (state.currentLocation && state.isTracking) {
        coords.push([state.currentLocation.lat, state.currentLocation.lng]);
    }
    
    // Add stop coordinates
    stops.forEach(stop => {
        coords.push([stop.location.lat, stop.location.lng]);
    });
    
    if (coords.length > 1) {
        state.routePolyline = L.polyline(coords, {
            color: '#0066FF',
            weight: 5,
            opacity: 0.8,
            dashArray: '10, 10',
            smoothFactor: 1
        }).addTo(state.map);
    }
}

// Decode polyline
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

// Display route information
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

// Get next incomplete stop (respecting greedy optimization)
function getNextStop() {
    if (!state.activeRoute || !state.activeRoute.stops) return null;
    
    // If using greedy optimization, find next valid stop
    if (config.useGreedyOptimization) {
        const pickedParcels = new Set();
        state.activeRoute.stops.forEach(stop => {
            if (stop.type === 'pickup' && stop.completed) {
                pickedParcels.add(stop.parcelId);
            }
        });
        
        // Find next uncompleted stop that's valid
        for (const stop of state.activeRoute.stops) {
            if (stop.completed) continue;
            
            if (stop.type === 'delivery') {
                // Can only deliver if pickup is done
                if (!pickedParcels.has(stop.parcelId)) continue;
            }
            
            return stop;
        }
        return null;
    } else {
        // Simple approach: return first uncompleted stop
        return state.activeRoute.stops.find(stop => !stop.completed);
    }
}

// Update route statistics
function updateRouteStats() {
    const remainingStops = state.activeRoute.stops.filter(s => !s.completed).length;
    const totalDistance = state.activeRoute.distance || 0;
    const estimatedTime = Math.round(totalDistance * 2.5 + remainingStops * 5);
    
    document.getElementById('remainingStops').textContent = remainingStops;
    document.getElementById('totalDistance').textContent = totalDistance;
    document.getElementById('estimatedTime').textContent = estimatedTime;
}

// Display stops list with payment info
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
    
    // If using greedy optimization, show mixed list
    if (config.useGreedyOptimization) {
        html += `
            <div class="phase-section">
                <h3>
                    <span>📍 Optimized Route</span>
                    <span class="phase-count">${state.activeRoute.stops.filter(s => s.completed).length}/${state.activeRoute.stops.length}</span>
                </h3>
                <div class="phase-stops">
                    ${state.activeRoute.stops.map((stop, index) => {
                        const canComplete = stop.type === 'pickup' || canCompleteDelivery(stop);
                        return createStopCard(stop, index + 1, stop.type, !canComplete);
                    }).join('')}
                </div>
            </div>
        `;
    } else {
        // Original phase-based display
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
    }
    
    stopsList.innerHTML = html;
}

// Create phase progress widget
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

// Create parcels in possession widget with payment info
function createParcelsInPossessionWidget() {
    return `
        <div class="parcels-possession-widget" style="background: linear-gradient(135deg, rgba(255, 159, 10, 0.2) 0%, rgba(255, 159, 10, 0.1) 100%); border: 1px solid var(--warning); border-radius: 14px; padding: 16px; margin-bottom: 20px;">
            <div class="carrying-banner" style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
// PART 3 OF 3 - Continued from Part 2
}

// Update parcels in possession
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

// Create stop card with payment info
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
                
                <!-- Payment Badge for Delivery Stops -->
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

// Check if stop is next
function isNextStop(stop) {
    const nextStop = getNextStop();
    return nextStop && nextStop.id === stop.id;
}

// Check if can complete delivery
function canCompleteDelivery(deliveryStop) {
    if (!state.activeRoute || !state.activeRoute.stops) return false;
    
    const pickupStop = state.activeRoute.stops.find(s => 
        s.type === 'pickup' && s.parcelId === deliveryStop.parcelId
    );
    
    return pickupStop && pickupStop.completed;
}

// Check if can complete stop
function canCompleteStop(stop) {
    if (stop.type === 'pickup') return true;
    return canCompleteDelivery(stop);
}

// Check if all completed
function allCompleted(stops) {
    return stops.every(s => s.completed);
}

// Format time ago
function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const minutes = Math.floor((Date.now() - new Date(timestamp)) / 60000);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
}

// Show route panel with fixed positioning
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
    document.getElementById('routePanel').style.display = 'none';
    document.getElementById('navControls').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
}

// Start location tracking
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
            document.getElementById('trackingIndicator').style.display = 'flex';
            document.getElementById('locationButton').classList.add('active');
            
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

// Navigation functions
window.centerOnLocation = function() {
    if (state.currentLocation && state.map) {
        state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 16);
        showNotification('Centered on your location', 'info');
    } else {
        showNotification('Getting your location...', 'info');
        startLocationTracking();
    }
};

// Start navigation
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

// Proceed with navigation
function proceedWithNavigation(nextStop) {
    startContinuousTracking();
    showEnhancedNavigation(nextStop);
    state.navigationActive = true;
}

// Enhanced Waze-like navigation interface
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
        <!-- Top instruction bar -->
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
        
        <!-- Bottom info pills -->
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
        
        <!-- Floating action button -->
        <button class="waze-fab" onclick="showNavigationActions()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
            </svg>
        </button>
        
        <!-- Navigation menu -->
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

// Toggle navigation menu
window.toggleNavigationMenu = function() {
    const menu = document.getElementById('navMenu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
};

// Show navigation actions
window.showNavigationActions = function() {
    const menu = document.getElementById('navMenu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
};

// Update navigation
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

// Show arrival notification with payment reminder
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

// Get enhanced directions
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

// Update navigation instructions
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

// Get current navigation step
function getCurrentNavigationStep(steps) {
    return steps[0];
}

// Get direction emoji
function getDirectionEmoji(type) {
    const emojis = {
        0: '⬅️', 1: '➡️', 2: '↩️', 3: '↪️', 4: '↖️', 5: '↗️',
        6: '⬆️', 7: '🔄', 8: '🔄', 9: '⤴️', 10: '🏁', 11: '🚦',
        12: '⬅️', 13: '➡️'
    };
    
    return emojis[type] || '⬆️';
}

// Exit navigation
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

// Show destination details
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
                    <div class="detail-section" style="background: linear-gradient(135deg, rgba(52, 199, 89, 0.15), rgba(34, 163, 70, 0.1)); padding: 12px; border-radius: 8px; border: 1px solid #34C759;">
                        <h4 style="color: #34C759;">Payment Collection</h4>
                        <p style="font-size: 20px; font-weight: 700; color: #34C759;">KES ${paymentInfo.amount.toLocaleString()}</p>
                        <p style="font-size: 14px; color: var(--text-secondary);">Cash on delivery</p>
                    </div>
                ` : stop.type === 'delivery' && paymentInfo.method === 'online' ? `
                    <div class="detail-section" style="background: rgba(52, 199, 89, 0.1); padding: 12px; border-radius: 8px;">
                        <h4 style="color: var(--success);">Payment Status</h4>
                        <p style="color: var(--success);">✅ Already paid online</p>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
};

// Navigate to stop
window.navigateToStop = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop) return;
    
    state.navigationActive = true;
    showEnhancedNavigation(stop);
};

// Select stop
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

// Continuous tracking
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

// Check proximity
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

// Calculate distance
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

// Calculate ETA
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

// Quick verification
window.openQuickVerification = function() {
    const nextStop = getNextStop();
    if (nextStop) {
        openVerificationModal(nextStop.id);
    }
};

// ENHANCED: Open verification modal with payment reminder and POD photo capture
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
                        background: linear-gradient(135deg, rgba(52, 199, 89, 0.2), rgba(34, 163, 70, 0.15));
                        border: 2px solid #34C759;
                        border-radius: 12px;
                        padding: 16px;
                        margin: 16px 0;
                        text-align: center;
                    ">
                        <div style="font-size: 24px; margin-bottom: 8px;">💵</div>
                        <div style="font-size: 20px; font-weight: 700; color: #34C759; margin-bottom: 4px;">
                            Collect KES ${paymentInfo.amount.toLocaleString()}
                        </div>
                        <div style="font-size: 14px; color: var(--text-secondary);">
                            Cash payment from customer
                        </div>
                    </div>
                ` : stop.type === 'delivery' && paymentInfo.method === 'online' ? `
                    <div style="
                        background: linear-gradient(135deg, rgba(52, 199, 89, 0.2), rgba(48, 209, 88, 0.1));
                        border: 1px solid var(--success);
                        border-radius: 12px;
                        padding: 12px;
                        margin: 16px 0;
                        text-align: center;
                        color: var(--success);
                        font-weight: 600;
                    ">
                        ✅ Already Paid - No collection needed
                    </div>
                ` : ''}
                
                <!-- Proof of Delivery Photo Capture -->
                ${stop.type === 'delivery' ? `
                    <div class="photo-capture-container">
                        <label style="display: block; font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">
                            📸 Proof of Delivery (Required)
                        </label>
                        <div class="photo-preview" id="photoPreview">
                            <div class="photo-preview-placeholder">
                                <span class="camera-icon">📷</span>
                                <span>No photo taken</span>
                            </div>
                        </div>
                        <input type="file" id="photoInput" accept="image/*" capture="camera" onchange="handlePhotoCapture(event, '${stop.id}')" />
                        <button class="capture-button" onclick="document.getElementById('photoInput').click()">
                            <span>📷</span>
                            <span>Take Photo</span>
                        </button>
                    </div>
                ` : ''}
                
                <div class="verification-section">
                    <label>Enter ${stop.type} verification code:</label>
                    <input type="text" 
                           class="verification-input" 
                           id="verificationCode" 
                           placeholder="XXX-XXXX"
                           maxlength="8"
                           autocomplete="off">
                    <p class="code-hint">Ask the ${stop.type === 'pickup' ? 'sender' : 'recipient'} for their code</p>
                </div>
                
                ${stop.type === 'delivery' && paymentInfo.needsCollection ? `
                    <div style="margin-top: 16px; padding: 12px; background: var(--surface-high); border-radius: 8px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="paymentCollected" style="width: 20px; height: 20px; cursor: pointer;">
                            <span style="font-size: 16px;">I have collected KES ${paymentInfo.amount.toLocaleString()} cash</span>
                        </label>
                    </div>
                ` : ''}
                
                <div class="modal-actions">
                    <button class="modal-btn primary" onclick="verifyCode('${stop.id}')">
                        <span>✓</span>
                        <span>Verify & Complete</span>
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
    
    document.getElementById('verificationCode').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            verifyCode(stop.id);
        }
    });
};

// Handle photo capture for POD
window.handlePhotoCapture = function(event, stopId) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const photoData = e.target.result;
        state.proofOfDeliveryPhotos[stopId] = photoData;
        
        const preview = document.getElementById('photoPreview');
        if (preview) {
            preview.innerHTML = `<img src="${photoData}" alt="Proof of Delivery">`;
        }
        
        const captureBtn = document.querySelector('.capture-button');
        if (captureBtn) {
            captureBtn.classList.add('photo-captured');
            captureBtn.innerHTML = `
                <span>✅</span>
                <span>Photo Captured</span>
            `;
        }
    };
    reader.readAsDataURL(file);
};

// Close verification modal
window.closeVerificationModal = function() {
    const modal = document.querySelector('.verification-modal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 300);
    }
};

// ENHANCED: Verify code with POD validation
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
    
    // Check POD for deliveries
    if (stop.type === 'delivery' && !state.proofOfDeliveryPhotos[stop.id]) {
        showNotification('Please take a proof of delivery photo', 'warning');
        const photoContainer = document.querySelector('.photo-capture-container');
        if (photoContainer) {
            photoContainer.style.animation = 'shake 0.3s';
        }
        return;
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
    
    // Mark stop as completed
    stop.completed = true;
    stop.timestamp = new Date();
    stop.proofOfDelivery = state.proofOfDeliveryPhotos[stop.id] || null;
    
    // Update payment tracking
    if (stop.type === 'delivery' && paymentInfo.needsCollection) {
        state.paymentsByStop[stop.id].collected = true;
        state.paymentsByStop[stop.id].timestamp = stop.timestamp;
        updateCashCollectionWidget();
    }
    
    // Save immediately
    await syncRouteData();
    
    closeVerificationModal();
    showSuccessAnimation(stop.type);
    
    // Update database for non-demo routes
    if (!state.activeRoute.id?.startsWith('demo-')) {
        try {
            await supabaseUpdate('parcels',
                `id=eq.${stop.parcelId}`,
                {
                    status: stop.type === 'pickup' ? 'picked' : 'delivered',
                    [`${stop.type}_timestamp`]: stop.timestamp.toISOString(),
                    payment_status: stop.type === 'delivery' && paymentInfo.needsCollection ? 'collected' : undefined,
                    proof_of_delivery: stop.proofOfDelivery || undefined
                }
            );
        } catch (error) {
            console.error('Database update error:', error);
        }
    }
    
    // Refresh UI
    displayRouteInfo();
    updateDynamicHeader();
    plotRoute();
    drawOptimizedRoute();
    
    checkPhaseCompletion();
    
    // Check if route is complete
    if (state.activeRoute.stops.every(s => s.completed)) {
        await completeRoute();
    } else {
        const nextStop = getNextStop();
        if (nextStop && state.navigationActive) {
            showEnhancedNavigation(nextStop);
        }
    }
};

// Show success animation
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

// Check phase completion
function checkPhaseCompletion() {
    const pickupStops = state.activeRoute.stops.filter(s => s.type === 'pickup');
    const allPickupsComplete = pickupStops.every(s => s.completed);
    
    if (allPickupsComplete && !state.pickupPhaseCompleted) {
        state.pickupPhaseCompleted = true;
        showPhaseCompleteAnimation();
    }
}

// Show phase complete animation
function showPhaseCompleteAnimation() {
    const animation = document.createElement('div');
    animation.className = 'phase-complete-animation';
    animation.innerHTML = `
        <div class="phase-complete-content">
            <div class="phase-icon">🎉</div>
            <h2>All Pickups Complete!</h2>
            <p>Time to deliver the parcels</p>
        </div>
    `;
    
    document.body.appendChild(animation);
    
    setTimeout(() => animation.remove(), 3000);
}

// Complete route with proper sync and cash collection summary
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
            <button class="complete-btn" onclick="finishRoute()">
                Back to Dashboard
            </button>
        </div>
    `;
    
    document.body.appendChild(animation);
}

// Finish route
window.finishRoute = function() {
    window.location.href = './rider.html';
};

// Go back
window.goBack = function() {
    if (confirm('Are you sure you want to exit navigation?')) {
        window.location.href = './rider.html';
    }
};

// Notification function
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
        notification.classList.add('hiding');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add Waze navigation styles
function addWazeNavigationStyles() {
    const wazeNavigationStyles = `
        /* Waze-style Navigation */
        .waze-nav-top {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 1000;
            pointer-events: auto !important;
        }
        
        .waze-instruction-bar {
            background: linear-gradient(to bottom, rgba(10, 10, 11, 0.95), rgba(10, 10, 11, 0.85));
            backdrop-filter: blur(20px);
            padding: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        /* Rest of Waze styles already included in Part 1 */
    `;
    
    const existingStyle = document.getElementById('waze-nav-styles');
    if (!existingStyle) {
        const style = document.createElement('style');
        style.id = 'waze-nav-styles';
        style.textContent = wazeNavigationStyles;
        document.head.appendChild(style);
    }
}

// Add remaining CSS
const navStyles = document.createElement('style');
navStyles.textContent = `
    /* Modal and navigation styles already included in Part 1 */
`;
document.head.appendChild(navStyles);

// Export for debugging
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
    simulatePickup: () => {
        const nextPickup = state.activeRoute.stops.find(s => s.type === 'pickup' && !s.completed);
        if (nextPickup) {
            nextPickup.completed = true;
            nextPickup.timestamp = new Date();
            localStorage.setItem('tuma_active_route', JSON.stringify(state.activeRoute));
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
    testGreedyOptimization: () => {
        console.log('Before optimization:', state.activeRoute.stops.map(s => ({
            type: s.type,
            parcelId: s.parcelId,
            address: s.address.substring(0, 30)
        })));
        
        optimizeRouteGreedy();
        
        console.log('After optimization:', state.activeRoute.stops.map(s => ({
            type: s.type,
            parcelId: s.parcelId,
            address: s.address.substring(0, 30)
        })));
    }
};

console.log('✅ Enhanced Route.js loaded successfully with all fixes!');
console.log('Features: Cash collection (green theme), POD photos, Greedy optimization, Fixed polyline');
console.log('Debug commands: window.routeDebug');
console.log('Test greedy optimization: window.routeDebug.testGreedyOptimization()');

// END OF ENHANCED ROUTE.JS
