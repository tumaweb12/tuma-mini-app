/**
 * COMPLETE MERGED ROUTE NAVIGATION SYSTEM - PART 1 OF 2
 * Full version combining dynamic routing from Paste 1/2 with ALL enhanced features from Paste 3
 * Includes payment tracking, proof of delivery, Waze-style navigation, and dynamic stop generation
 */

// ============================================================================
// DEVELOPMENT CONFIGURATION (from Paste 3)
// ============================================================================

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

// ============================================================================
// CONFIGURATION (Combined from all versions)
// ============================================================================

const CONFIG = {
    api: {
        SUPABASE_URL: 'https://btxavqfoirdzwpfrvezp.supabase.co',
        SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk',
        OPENROUTE_KEY: '5b3ce3597851110001cf624841e48578ffb34c6b96dfe3bbe9b3ad4c'
    },
    navigation: {
        proximityRadius: 50, // meters
        arrivalRadius: 30, // meters
        updateInterval: 5000, // ms
        headingUp: false,
        smoothMovement: true,
        autoZoom: true,
        mapRotatable: true
    },
    defaults: {
        nairobi: { lat: -1.2921, lng: 36.8219 }
    },
    business: {
        commission: {
            rider: 0.70,      // 70% of delivery fee goes to rider
            platform: 0.30,   // 30% platform fee
            maxUnpaid: 300,   // Max unpaid commission before blocking
            warningThreshold: 250  // Show warning at this amount
        }
    }
};

// ============================================================================
// GLOBAL STATE (Enhanced from Paste 3 with dynamic routing support)
// ============================================================================

const GlobalState = {
    // Core route data
    route: null,
    rider: null,
    map: null,
    markers: [],
    polylines: [],
    routePolyline: null,
    directionsPolyline: null,
    
    // Location tracking
    location: null,
    locationMarker: null,
    accuracyCircle: null,
    radiusCircle: null,
    lastLocation: null,
    lastLocationTime: null,
    locationWatchId: null,
    
    // Tracking state
    tracking: {
        watchId: null,
        isActive: false,
        lastUpdate: null,
        heading: 0,
        speed: 0,
        accuracy: 0,
        interval: null
    },
    
    // UI state
    ui: {
        panelExpanded: false,
        panelVisible: true,
        loadingVisible: true,
        navigationActive: false
    },
    
    // Offline support
    offline: {
        queue: [],
        isOffline: false
    },
    
    // Cash collection tracking
    cash: {
        totalToCollect: 0,
        totalCollected: 0,
        byDelivery: {},
        paymentsByStop: {}
    },
    
    // Parcel tracking
    parcels: {
        inPossession: []
    },
    
    // Current state
    currentStop: null,
    nextStop: null,
    currentStopIndex: 0,
    
    // Navigation state (from Paste 3)
    proximityNotified: false,
    routeControl: null,
    pickupPhaseCompleted: false,
    isFollowingUser: true,
    lastMapRotation: 0,
    smoothLocationInterval: null,
    mapBearing: 0,
    
    // Financial tracking
    totalRouteEarnings: 0,
    routeCommission: 0
};

// ============================================================================
// SUPABASE API MODULE (Enhanced with POD support)
// ============================================================================

const SupabaseAPI = {
    headers: {
        'apikey': CONFIG.api.SUPABASE_KEY,
        'Authorization': `Bearer ${CONFIG.api.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    },

    async updateParcelStatus(parcelId, status, additionalData = {}) {
        try {
            const updateData = {
                status: status,
                updated_at: new Date().toISOString(),
                ...additionalData
            };

            const response = await fetch(
                `${CONFIG.api.SUPABASE_URL}/rest/v1/parcels?id=eq.${parcelId}`,
                {
                    method: 'PATCH',
                    headers: this.headers,
                    body: JSON.stringify(updateData)
                }
            );

            if (!response.ok) {
                throw new Error(`Update failed: ${response.status}`);
            }

            console.log(`✅ Parcel ${parcelId} updated to ${status}`);
            return true;

        } catch (error) {
            console.error('Error updating parcel:', error);
            
            // Queue for offline sync
            GlobalState.offline.queue.push({
                type: 'parcel_update',
                parcelId,
                data: { status, ...additionalData },
                timestamp: new Date().toISOString()
            });
            
            return false;
        }
    },

    async createProofOfDelivery(stopId, podData) {
        try {
            const pod = {
                stop_id: stopId,
                route_id: GlobalState.route?.id,
                rider_id: GlobalState.rider?.id,
                delivery_type: podData.deliveryType || 'handed_to_customer',
                recipient_name: podData.recipientName || null,
                notes: podData.notes || null,
                location: podData.location ? {
                    lat: podData.location.lat,
                    lng: podData.location.lng
                } : null,
                photo_data: podData.photo || null,
                created_at: new Date().toISOString()
            };

            const response = await fetch(
                `${CONFIG.api.SUPABASE_URL}/rest/v1/delivery_proofs`,
                {
                    method: 'POST',
                    headers: this.headers,
                    body: JSON.stringify(pod)
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                if (errorText.includes('relation') && errorText.includes('does not exist')) {
                    console.log('Delivery proofs table not found - skipping POD save');
                    return true;
                }
                throw new Error(`POD creation failed: ${response.status}`);
            }

            console.log('✅ Proof of delivery created');
            return true;

        } catch (error) {
            console.error('Error creating POD:', error);
            
            GlobalState.offline.queue.push({
                type: 'pod_create',
                data: podData,
                stopId,
                timestamp: new Date().toISOString()
            });
            
            return true;
        }
    },

    async syncOfflineQueue() {
        if (GlobalState.offline.queue.length === 0) return;
        
        console.log('🔄 Syncing offline queue...');
        const queue = [...GlobalState.offline.queue];
        GlobalState.offline.queue = [];
        
        for (const item of queue) {
            try {
                if (item.type === 'parcel_update') {
                    await this.updateParcelStatus(item.parcelId, item.data.status, item.data);
                } else if (item.type === 'pod_create') {
                    await this.createProofOfDelivery(item.stopId, item.data);
                }
            } catch (error) {
                console.error('Sync error:', error);
                GlobalState.offline.queue.push(item);
            }
        }
    }
};

// Direct API functions (from Paste 3)
async function supabaseQuery(table, options = {}) {
    const { select = '*', filter = '', order = '', limit } = options;
    
    let url = `${CONFIG.api.SUPABASE_URL}/rest/v1/${table}?select=${select}`;
    if (filter) url += `&${filter}`;
    if (order) url += `&order=${order}`;
    if (limit) url += `&limit=${limit}`;
    
    const response = await fetch(url, {
        headers: SupabaseAPI.headers
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error: ${response.status} ${errorText}`);
        throw new Error(`API Error: ${response.status}`);
    }
    
    return await response.json();
}

async function supabaseUpdate(table, filter, data) {
    const response = await fetch(`${CONFIG.api.SUPABASE_URL}/rest/v1/${table}?${filter}`, {
        method: 'PATCH',
        headers: SupabaseAPI.headers,
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
// HELPER FUNCTIONS (from Paste 3)
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
    if (!GlobalState.route || !GlobalState.route.parcels) {
        return {
            amount: 0,
            method: 'unknown',
            status: 'unknown',
            needsCollection: false
        };
    }
    
    const parcel = GlobalState.route.parcels.find(p => p.id === stop.parcelId);
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

// ============================================================================
// ROUTE MODULE (Dynamic stop generation from Paste 1/2 + enhancements from Paste 3)
// ============================================================================

const RouteModule = {
    async loadRoute() {
        console.log('📥 Loading route data...');
        
        const storedRoute = localStorage.getItem('tuma_active_route');
        if (!storedRoute) {
            console.log('No active route found');
            return false;
        }
        
        try {
            const routeData = JSON.parse(storedRoute);
            console.log('📍 Route loaded:', routeData.name);
            
            // Process route data with dynamic stop generation
            GlobalState.route = this.processRouteData(routeData);
            
            // Calculate financials
            this.calculateRouteFinancials();
            this.calculateCashCollection();
            
            // Get rider info
            const riderId = sessionStorage.getItem('tuma_rider_id') || 
                           new URLSearchParams(window.location.search).get('rider_id');
            GlobalState.rider = { id: riderId };
            
            return true;
            
        } catch (error) {
            console.error('Error loading route:', error);
            return false;
        }
    },
    
    processRouteData(routeData) {
        // Dynamic stop generation if stops don't exist
        if (!routeData.stops && routeData.parcels) {
            routeData.stops = this.generateStopsFromParcels(routeData.parcels);
        }
        
        // Find next uncompleted stop using dynamic routing logic
        GlobalState.nextStop = routeData.stops.find(s => !s.completed && this.canCompleteStop(s, routeData.stops));
        
        return routeData;
    },
    
    generateStopsFromParcels(parcels) {
        const stops = [];
        
        parcels.forEach(parcel => {
            // Pickup stop
            stops.push({
                id: `pickup-${parcel.id}`,
                type: 'pickup',
                parcelId: parcel.id,
                parcelCode: parcel.parcel_code || parcel.tracking_code,
                address: parcel.sender_address || 'Pickup Location',
                location: {
                    lat: parseFloat(parcel.pickup_lat) || CONFIG.defaults.nairobi.lat,
                    lng: parseFloat(parcel.pickup_lng) || CONFIG.defaults.nairobi.lng
                },
                customerName: parcel.sender_name || 'Sender',
                customerPhone: parcel.sender_phone || '',
                verificationCode: parcel.pickup_code || 'PICKUP',
                completed: false,
                canComplete: true
            });
            
            // Delivery stop with dependency on its pickup
            stops.push({
                id: `delivery-${parcel.id}`,
                type: 'delivery',
                parcelId: parcel.id,
                parcelCode: parcel.parcel_code || parcel.tracking_code,
                address: parcel.recipient_address || 'Delivery Location',
                location: {
                    lat: parseFloat(parcel.delivery_lat) || CONFIG.defaults.nairobi.lat,
                    lng: parseFloat(parcel.delivery_lng) || CONFIG.defaults.nairobi.lng
                },
                customerName: parcel.recipient_name || 'Recipient',
                customerPhone: parcel.recipient_phone || '',
                verificationCode: parcel.delivery_code || 'DELIVERY',
                paymentMethod: parcel.payment_method || 'cash',
                paymentStatus: parcel.payment_status || 'pending',
                price: parseFloat(parcel.price) || 0,
                completed: false,
                canComplete: false,
                dependsOn: `pickup-${parcel.id}` // Dynamic dependency
            });
        });
        
        return stops;
    },
    
    // DYNAMIC ROUTING LOGIC - Each delivery only needs its pickup completed
    canCompleteStop(stop, allStops) {
        if (!stop) return false;
        if (stop.completed) return false;
        
        // Pickups can always be completed
        if (stop.type === 'pickup') return true;
        
        // Deliveries only require their specific pickup to be completed
        if (stop.type === 'delivery' && stop.dependsOn) {
            const pickupStop = allStops.find(s => s.id === stop.dependsOn);
            return pickupStop && pickupStop.completed;
        }
        
        return true;
    },
    
    calculateRouteFinancials() {
        GlobalState.totalRouteEarnings = 0;
        GlobalState.routeCommission = 0;
        
        if (!GlobalState.route?.parcels) return;
        
        GlobalState.route.parcels.forEach(parcel => {
            const price = parsePrice(parcel.price || parcel.total_price || 500);
            const riderPayout = price * CONFIG.business.commission.rider;
            const commission = price * CONFIG.business.commission.platform;
            
            GlobalState.totalRouteEarnings += riderPayout;
            GlobalState.routeCommission += commission;
        });
        
        console.log('Route financials calculated:', {
            earnings: GlobalState.totalRouteEarnings,
            commission: GlobalState.routeCommission
        });
    },
    
    calculateCashCollection() {
        GlobalState.cash.totalToCollect = 0;
        GlobalState.cash.totalCollected = 0;
        
        if (!GlobalState.route?.stops) return;
        
        GlobalState.route.stops.forEach(stop => {
            if (stop.type === 'delivery') {
                const paymentInfo = getPaymentInfoForStop(stop);
                
                if (paymentInfo.needsCollection) {
                    GlobalState.cash.totalToCollect += paymentInfo.amount;
                    
                    if (stop.completed) {
                        GlobalState.cash.totalCollected += paymentInfo.amount;
                        GlobalState.cash.paymentsByStop[stop.id] = {
                            amount: paymentInfo.amount,
                            collected: true,
                            timestamp: stop.timestamp
                        };
                    } else {
                        GlobalState.cash.paymentsByStop[stop.id] = {
                            amount: paymentInfo.amount,
                            collected: false
                        };
                    }
                }
            }
        });
        
        console.log('Cash collection calculated:', {
            total: GlobalState.cash.totalToCollect,
            collected: GlobalState.cash.totalCollected,
            pending: GlobalState.cash.totalToCollect - GlobalState.cash.totalCollected
        });
    },
    
    async completeStop(stopId) {
        const stop = GlobalState.route.stops.find(s => s.id === stopId);
        if (!stop) return false;
        
        stop.completed = true;
        stop.timestamp = new Date().toISOString();
        
        // Update parcel status in Supabase
        const newStatus = stop.type === 'pickup' ? 'picked' : 'delivered';
        await SupabaseAPI.updateParcelStatus(stop.parcelId, newStatus, {
            [`${stop.type}_timestamp`]: stop.timestamp
        });
        
        // Handle cash collection for deliveries
        if (stop.type === 'delivery' && stop.paymentMethod === 'cash' && stop.paymentStatus === 'pending') {
            GlobalState.cash.totalCollected += stop.price;
            
            // Update payment status
            await SupabaseAPI.updateParcelStatus(stop.parcelId, 'delivered', {
                payment_status: 'collected',
                payment_collected_at: stop.timestamp
            });
        }
        
        // Update parcels in possession
        if (stop.type === 'pickup') {
            const parcel = GlobalState.route.parcels?.find(p => p.id === stop.parcelId);
            if (parcel) {
                GlobalState.parcels.inPossession.push({
                    parcelId: stop.parcelId,
                    parcelCode: stop.parcelCode,
                    pickupTime: stop.timestamp,
                    destination: GlobalState.route.stops.find(s => 
                        s.type === 'delivery' && s.parcelId === stop.parcelId
                    )?.address
                });
            }
            
            // Enable corresponding delivery (dynamic routing)
            const deliveryStop = GlobalState.route.stops.find(s => 
                s.type === 'delivery' && s.parcelId === stop.parcelId
            );
            if (deliveryStop) {
                deliveryStop.canComplete = true;
            }
        } else if (stop.type === 'delivery') {
            GlobalState.parcels.inPossession = GlobalState.parcels.inPossession.filter(
                p => p.parcelId !== stop.parcelId
            );
        }
        
        // Save updated route
        this.saveRoute();
        
        // Find next stop using dynamic routing logic
        GlobalState.nextStop = GlobalState.route.stops.find(s => 
            !s.completed && this.canCompleteStop(s, GlobalState.route.stops)
        );
        
        return true;
    },
    
    saveRoute() {
        localStorage.setItem('tuma_active_route', JSON.stringify(GlobalState.route));
    },
    
    isRouteComplete() {
        return GlobalState.route?.stops?.every(s => s.completed) || false;
    },
    
    async handleRouteCompletion() {
        console.log('Handling route completion...');
        
        // Calculate final earnings
        const deliveryCount = GlobalState.route.stops.filter(s => s.type === 'delivery').length;
        
        // Create completion data
        const completionData = {
            completed: true,
            earnings: Math.round(GlobalState.totalRouteEarnings),
            commission: Math.round(GlobalState.routeCommission),
            cashCollected: Math.round(GlobalState.cash.totalCollected),
            deliveries: deliveryCount,
            stops: GlobalState.route.stops.length,
            timestamp: new Date().toISOString(),
            routeId: GlobalState.route.id,
            parcels: GlobalState.route.parcels || []
        };
        
        console.log('Storing completion data:', completionData);
        
        // Store completion data for rider.js to process
        localStorage.setItem('tuma_route_completion', JSON.stringify(completionData));
        
        // Clear active route
        localStorage.removeItem('tuma_active_route');
        
        // Update parcels in database if not demo route
        if (!GlobalState.route.id?.startsWith('demo-')) {
            try {
                for (const parcel of (GlobalState.route.parcels || [])) {
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
        
        return completionData;
    },
    
    clearRoute() {
        localStorage.removeItem('tuma_active_route');
        GlobalState.route = null;
    }
};

// ============================================================================
// MAP MODULE (Enhanced from all versions)
// ============================================================================

const MapModule = {
    async initialize() {
        console.log('🗺️ Initializing map with rotation support...');
        
        const mapContainer = document.getElementById('map');
        if (!mapContainer) {
            console.error('Map container not found!');
            return false;
        }
        
        // Force proper dimensions
        mapContainer.style.width = '100%';
        mapContainer.style.height = '100%';
        
        // Calculate center from route
        let center = CONFIG.defaults.nairobi;
        if (GlobalState.route?.stops?.length > 0) {
            const firstStop = GlobalState.route.stops.find(s => !s.completed) || GlobalState.route.stops[0];
            center = firstStop.location;
        }
        
        // Create map with rotation support
        GlobalState.map = L.map('map', {
            center: [center.lat, center.lng],
            zoom: 14,
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
        
        // Add dark tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(GlobalState.map);
        
        // Add zoom control
        L.control.zoom({
            position: 'bottomright'
        }).addTo(GlobalState.map);
        
        // Add scale
        L.control.scale({
            position: 'bottomleft',
            imperial: false
        }).addTo(GlobalState.map);
        
        // Enable two-finger rotation on mobile if available
        if (L.Browser.touch && GlobalState.map.touchRotate) {
            GlobalState.map.touchRotate.enable();
        }
        
        // Force resize
        setTimeout(() => {
            GlobalState.map.invalidateSize();
        }, 100);
        
        console.log('✅ Map initialized');
        return true;
    },
    
    async plotRoute() {
        if (!GlobalState.map || !GlobalState.route?.stops) return;
        
        // Clear existing markers
        GlobalState.markers.forEach(marker => marker.remove());
        GlobalState.markers = [];
        
        const bounds = L.latLngBounds();
        
        // Add markers for each stop
        GlobalState.route.stops.forEach((stop, index) => {
            const icon = this.createStopIcon(stop, index + 1);
            
            const marker = L.marker([stop.location.lat, stop.location.lng], {
                icon: icon,
                zIndexOffset: stop.completed ? 0 : 100
            }).addTo(GlobalState.map);
            
            // Add popup
            marker.bindPopup(this.createStopPopup(stop));
            
            GlobalState.markers.push(marker);
            bounds.extend([stop.location.lat, stop.location.lng]);
        });
        
        // Fit bounds
        if (GlobalState.markers.length > 0) {
            GlobalState.map.fitBounds(bounds, { padding: [50, 50] });
        }
    },
    
    createStopIcon(stop, number) {
        const isNext = GlobalState.nextStop?.id === stop.id;
        const canComplete = RouteModule.canCompleteStop(stop, GlobalState.route.stops);
        
        let bgColor, symbol;
        
        if (stop.completed) {
            bgColor = '#34C759';
            symbol = '✓';
        } else if (stop.type === 'pickup') {
            bgColor = '#FF9F0A';
            symbol = number;
        } else if (!canComplete) {
            bgColor = '#48484A';
            symbol = '🔒';
        } else {
            bgColor = '#0066FF';
            symbol = number;
        }
        
        return L.divIcon({
            className: 'custom-map-marker',
            html: `
                <div style="
                    position: relative;
                    width: 44px;
                    height: 44px;
                ">
                    ${isNext ? `<div style="
                        position: absolute;
                        width: 44px;
                        height: 44px;
                        border: 2px solid #00FF00;
                        border-radius: 50%;
                        animation: pulse 2s infinite;
                    "></div>` : ''}
                    <div style="
                        background: ${bgColor};
                        width: 44px;
                        height: 44px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                        border: 3px solid white;
                        font-weight: bold;
                        font-size: 18px;
                        color: white;
                    ">${symbol}</div>
                </div>
                <style>
                    @keyframes pulse {
                        0% { transform: scale(1); opacity: 1; }
                        50% { transform: scale(1.5); opacity: 0.5; }
                        100% { transform: scale(1); opacity: 1; }
                    }
                </style>
            `,
            iconSize: [44, 44],
            iconAnchor: [22, 22],
            popupAnchor: [0, -22]
        });
    },
    
    createStopPopup(stop) {
        const canComplete = RouteModule.canCompleteStop(stop, GlobalState.route.stops);
        const paymentInfo = getPaymentInfoForStop(stop);
        
        let cashInfo = '';
        if (stop.type === 'delivery' && paymentInfo.needsCollection) {
            cashInfo = `
                <div style="margin-top: 8px; padding: 8px; background: rgba(255, 159, 10, 0.1); border-radius: 8px; border: 1px solid #FF9F0A;">
                    💰 Collect: KES ${paymentInfo.amount}
                </div>
            `;
        }
        
        return `
            <div style="min-width: 250px;">
                <h4>${stop.type.toUpperCase()} - ${stop.parcelCode}</h4>
                <p>${stop.address}</p>
                <p>Customer: ${stop.customerName}</p>
                ${stop.customerPhone ? `<p>Phone: ${stop.customerPhone}</p>` : ''}
                ${cashInfo}
                ${stop.completed ? 
                    '<p style="color: #34C759;">✓ Completed</p>' :
                    canComplete ? 
                        `<button onclick="UIModule.showVerificationModal('${stop.id}')" style="
                            margin-top: 8px;
                            padding: 8px 16px;
                            background: #0066FF;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                        ">Verify ${stop.type}</button>` :
                        '<p style="color: #999;">Complete pickup first</p>'
                }
            </div>
        `;
    },
    
    updateLocationMarker(location) {
        if (!GlobalState.map || !location) return;
        
        // Create or update location marker
        if (!GlobalState.locationMarker) {
            GlobalState.locationMarker = L.marker(
                [location.lat, location.lng],
                { 
                    icon: this.createLocationIcon(),
                    zIndexOffset: 1000
                }
            ).addTo(GlobalState.map);
            
            // Add accuracy circle
            GlobalState.accuracyCircle = L.circle(
                [location.lat, location.lng],
                {
                    radius: GlobalState.tracking.accuracy || 50,
                    color: '#0066FF',
                    fillColor: '#0066FF',
                    fillOpacity: 0.1,
                    weight: 1,
                    opacity: 0.3
                }
            ).addTo(GlobalState.map);
        } else {
            // Update position
            GlobalState.locationMarker.setLatLng([location.lat, location.lng]);
            
            if (GlobalState.accuracyCircle) {
                GlobalState.accuracyCircle.setLatLng([location.lat, location.lng]);
                GlobalState.accuracyCircle.setRadius(GlobalState.tracking.accuracy || 50);
            }
        }
        
        // Update icon rotation if heading available
        if (GlobalState.tracking.heading) {
            const icon = this.createLocationIcon(GlobalState.tracking.heading);
            GlobalState.locationMarker.setIcon(icon);
        }
    },
    
    createLocationIcon(heading = 0) {
        return L.divIcon({
            className: 'current-location-marker',
            html: `
                <div style="
                    position: relative;
                    width: 60px;
                    height: 60px;
                ">
                    <div style="
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        width: 60px;
                        height: 60px;
                        background: rgba(0, 102, 255, 0.2);
                        border-radius: 50%;
                        transform: translate(-50%, -50%);
                        animation: pulse 2s infinite;
                    "></div>
                    <div style="
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        width: 40px;
                        height: 40px;
                        transform: translate(-50%, -50%) rotate(${heading}deg);
                    ">
                        ${heading ? `
                            <div style="
                                position: absolute;
                                top: -15px;
                                left: 50%;
                                width: 0;
                                height: 0;
                                border-left: 8px solid transparent;
                                border-right: 8px solid transparent;
                                border-bottom: 20px solid rgba(0, 102, 255, 0.6);
                                transform: translateX(-50%);
                            "></div>
                        ` : ''}
                        <div style="
                            position: absolute;
                            top: 50%;
                            left: 50%;
                            width: 16px;
                            height: 16px;
                            background: #0066FF;
                            border: 3px solid white;
                            border-radius: 50%;
                            transform: translate(-50%, -50%);
                            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                        "></div>
                    </div>
                </div>
            `,
            iconSize: [60, 60],
            iconAnchor: [30, 30]
        });
    },
    
    centerOnLocation() {
        if (GlobalState.map && GlobalState.location) {
            GlobalState.map.panTo([GlobalState.location.lat, GlobalState.location.lng], {
                animate: true,
                duration: 1
            });
        }
    },
    
    focusOnStop(stop) {
        if (!GlobalState.map || !stop) return;
        
        GlobalState.map.setView([stop.location.lat, stop.location.lng], 16, {
            animate: true,
            duration: 1
        });
    },
    
    async drawOptimizedRoute() {
        if (!GlobalState.route) return;
        
        const stops = GlobalState.route.stops.filter(s => !s.completed);
        if (stops.length < 2) {
            console.log('Not enough stops to draw route');
            return;
        }
        
        try {
            if (GlobalState.routePolyline) {
                GlobalState.routePolyline.remove();
                GlobalState.routePolyline = null;
            }
            
            let coordinates = [];
            if (GlobalState.location && GlobalState.ui.navigationActive) {
                coordinates.push([GlobalState.location.lng, GlobalState.location.lat]);
            }
            
            coordinates = coordinates.concat(stops.map(stop => [stop.location.lng, stop.location.lat]));
            
            const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
                    'Content-Type': 'application/json',
                    'Authorization': CONFIG.api.OPENROUTE_KEY
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
                const decodedCoords = this.decodePolyline(route.geometry);
                
                GlobalState.routePolyline = L.polyline(decodedCoords, {
                    color: '#0066FF',
                    weight: 6,
                    opacity: 0.8,
                    smoothFactor: 1
                }).addTo(GlobalState.map);
            }
        } catch (error) {
            console.error('Error getting route:', error);
            this.drawFallbackRoute(stops);
        }
    },
    
    drawFallbackRoute(stops) {
        console.log('Drawing fallback route');
        const coords = stops.map(stop => [stop.location.lat, stop.location.lng]);
        
        if (GlobalState.location && GlobalState.ui.navigationActive) {
            coords.unshift([GlobalState.location.lat, GlobalState.location.lng]);
        }
        
        GlobalState.routePolyline = L.polyline(coords, {
            color: '#0066FF',
            weight: 4,
            opacity: 0.6,
            dashArray: '10, 10',
            smoothFactor: 1
        }).addTo(GlobalState.map);
    },
    
    decodePolyline(encoded) {
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
};

// Continue in Part 2...
// PART 2 OF 2 - Continued from Part 1

// ============================================================================
// LOCATION MODULE (from Paste 1/2 with enhancements)
// ============================================================================

const LocationModule = {
    startTracking() {
        if (!navigator.geolocation) {
            console.error('Geolocation not supported');
            return;
        }
        
        console.log('📍 Starting location tracking...');
        
        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        };
        
        // Get initial position
        navigator.geolocation.getCurrentPosition(
            position => this.updateLocation(position),
            error => console.error('Location error:', error),
            options
        );
        
        // Start watching position
        GlobalState.tracking.watchId = navigator.geolocation.watchPosition(
            position => this.updateLocation(position),
            error => console.error('Location update error:', error),
            options
        );
        
        GlobalState.tracking.isActive = true;
    },
    
    updateLocation(position) {
        const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };
        
        // Check if location has changed significantly
        if (GlobalState.location) {
            const distance = this.calculateDistance(GlobalState.location, newLocation);
            if (distance < 0.005) return; // Ignore small movements
        }
        
        GlobalState.location = newLocation;
        GlobalState.tracking.accuracy = position.coords.accuracy;
        GlobalState.tracking.lastUpdate = new Date().toISOString();
        
        if (position.coords.heading !== null && position.coords.heading !== undefined) {
            GlobalState.tracking.heading = position.coords.heading;
        } else if (GlobalState.lastLocation) {
            GlobalState.tracking.heading = this.calculateBearing(GlobalState.lastLocation, GlobalState.location);
        }
        
        if (position.coords.speed !== null) {
            GlobalState.tracking.speed = Math.round(position.coords.speed * 3.6); // m/s to km/h
        }
        
        // Update map marker
        MapModule.updateLocationMarker(newLocation);
        
        // Drone follow mode
        if (GlobalState.ui.navigationActive && GlobalState.isFollowingUser) {
            GlobalState.map.panTo([newLocation.lat, newLocation.lng], {
                animate: true,
                duration: 1,
                noMoveStart: true
            });
            
            // Adjust zoom based on speed
            const targetZoom = this.calculateZoomFromSpeed(GlobalState.tracking.speed);
            const currentZoom = GlobalState.map.getZoom();
            if (Math.abs(currentZoom - targetZoom) > 0.5) {
                GlobalState.map.setZoom(targetZoom, {
                    animate: true,
                    duration: 1
                });
            }
        }
        
        GlobalState.lastLocation = GlobalState.location;
        GlobalState.lastLocationTime = Date.now();
        
        // Check proximity to stops
        this.checkProximity();
        
        // Update navigation if active
        if (GlobalState.ui.navigationActive) {
            NavigationModule.updateNavigation();
        }
    },
    
    checkProximity() {
        if (!GlobalState.location || !GlobalState.nextStop) return;
        
        const distance = this.calculateDistance(GlobalState.location, GlobalState.nextStop.location);
        const distanceMeters = distance * 1000;
        
        // Check if arrived at stop
        if (distanceMeters < CONFIG.navigation.arrivalRadius && !GlobalState.proximityNotified) {
            GlobalState.proximityNotified = true;
            
            // Check if it's a cash collection delivery
            const paymentInfo = getPaymentInfoForStop(GlobalState.nextStop);
            if (GlobalState.nextStop.type === 'delivery' && paymentInfo.needsCollection) {
                UIModule.showNotification(
                    `💰 Arrived! Remember to collect KES ${paymentInfo.amount.toLocaleString()}`,
                    'warning'
                );
                
                // Show payment reminder overlay
                const reminderDiv = document.createElement('div');
                reminderDiv.className = 'payment-reminder';
                reminderDiv.innerHTML = `💰 Collect KES ${paymentInfo.amount.toLocaleString()}`;
                document.body.appendChild(reminderDiv);
                
                // Remove after 5 seconds
                setTimeout(() => reminderDiv.remove(), 5000);
            } else {
                UIModule.showNotification(`Arrived at ${GlobalState.nextStop.type} location!`, 'success');
            }
            
            // Reset notification flag after 5 minutes
            setTimeout(() => {
                GlobalState.proximityNotified = false;
            }, 300000);
        }
    },
    
    calculateDistance(point1, point2) {
        const R = 6371; // Earth's radius in km
        const dLat = (point2.lat - point1.lat) * Math.PI / 180;
        const dLon = (point2.lng - point1.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    },
    
    calculateBearing(start, end) {
        const dLng = (end.lng - start.lng) * Math.PI / 180;
        const lat1 = start.lat * Math.PI / 180;
        const lat2 = end.lat * Math.PI / 180;
        
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - 
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        
        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    },
    
    calculateZoomFromSpeed(speed) {
        if (speed > 60) return 15;
        if (speed > 40) return 16;
        if (speed > 20) return 17;
        if (speed > 5) return 18;
        return 18;
    },
    
    stopTracking() {
        if (GlobalState.tracking.watchId) {
            navigator.geolocation.clearWatch(GlobalState.tracking.watchId);
            GlobalState.tracking.watchId = null;
        }
        GlobalState.tracking.isActive = false;
    }
};

// ============================================================================
// NAVIGATION MODULE (Waze-style from Paste 3)
// ============================================================================

const NavigationModule = {
    async startNavigation() {
        const nextStop = GlobalState.nextStop;
        if (!nextStop) {
            UIModule.showNotification('No stops to navigate to', 'warning');
            return;
        }
        
        GlobalState.ui.navigationActive = true;
        GlobalState.isFollowingUser = true;
        
        // Hide panels
        const routePanel = document.getElementById('routePanel');
        if (routePanel) {
            routePanel.style.display = 'none';
            GlobalState.ui.panelVisible = false;
        }
        
        // Show navigation UI
        this.showNavigationUI(nextStop);
        
        // Get directions
        await this.getDirections(nextStop);
        
        // Start continuous updates
        this.startNavigationUpdates();
    },
    
    showNavigationUI(targetStop) {
        const existingNav = document.querySelector('.enhanced-navigation');
        if (existingNav) existingNav.remove();
        
        const navUI = document.createElement('div');
        navUI.className = 'enhanced-navigation waze-style';
        navUI.style.cssText = 'pointer-events: none !important;';
        navUI.innerHTML = `
            <!-- Top instruction bar -->
            <div class="waze-nav-top">
                <div class="waze-instruction-bar">
                    <button class="waze-close-btn" onclick="NavigationModule.exitNavigation()">
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
                    
                    <button class="waze-menu-btn" onclick="NavigationModule.toggleMenu()">
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
            <button class="waze-fab" onclick="NavigationModule.toggleMenu()">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
                </svg>
            </button>
            
            <!-- Navigation menu -->
            <div class="waze-nav-menu" id="navMenu" style="display: none;">
                <button class="nav-menu-item" onclick="NavigationModule.toggleMenu(); UIModule.togglePanel();">
                    <span class="menu-icon">📋</span>
                    <span>Route Details</span>
                </button>
                <button class="nav-menu-item" onclick="NavigationModule.toggleFollowMode()">
                    <span class="menu-icon">🎯</span>
                    <span id="followModeText">Following On</span>
                </button>
                <button class="nav-menu-item" onclick="UIModule.handleVerifyClick()">
                    <span class="menu-icon">✓</span>
                    <span>Verify Stop</span>
                </button>
                <button class="nav-menu-item" onclick="window.location.href='tel:${targetStop.customerPhone}'">
                    <span class="menu-icon">📞</span>
                    <span>Call Customer</span>
                </button>
            </div>
        `;
        
        document.body.appendChild(navUI);
    },
    
    async getDirections(targetStop) {
        if (!GlobalState.location) return;
        
        try {
            const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': CONFIG.api.OPENROUTE_KEY
                },
                body: JSON.stringify({
                    coordinates: [
                        [GlobalState.location.lng, GlobalState.location.lat],
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
                    
                    if (GlobalState.directionsPolyline) {
                        GlobalState.directionsPolyline.remove();
                    }
                    
                    const decodedCoords = MapModule.decodePolyline(route.geometry);
                    GlobalState.directionsPolyline = L.polyline(decodedCoords, {
                        color: '#0066FF',
                        weight: 6,
                        opacity: 0.9,
                        className: 'navigation-route'
                    }).addTo(GlobalState.map);
                    
                    this.updateNavigationInstructions(route);
                }
            }
        } catch (error) {
            console.error('Error getting directions:', error);
        }
    },
    
    updateNavigationInstructions(route) {
        if (!route.segments || route.segments.length === 0) return;
        
        const segment = route.segments[0];
        if (!segment.steps || segment.steps.length === 0) return;
        
        const currentStep = segment.steps[0];
        
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
            arrowEl.textContent = this.getDirectionEmoji(currentStep.type);
        }
    },
    
    getDirectionEmoji(type) {
        const emojis = {
            0: '⬅️',   // Left
            1: '➡️',   // Right  
            2: '↩️',   // Sharp left
            3: '↪️',   // Sharp right
            4: '↖️',   // Slight left
            5: '↗️',   // Slight right
            6: '⬆️',   // Straight
            7: '🔄',   // Enter roundabout
            8: '🔄',   // Exit roundabout
            9: '⤴️',   // U-turn
            10: '🏁',  // Goal
            11: '🚦',  // Depart
            12: '⬅️',  // Keep left
            13: '➡️'   // Keep right
        };
        
        return emojis[type] || '⬆️';
    },
    
    updateNavigation() {
        if (!GlobalState.location || !GlobalState.nextStop) return;
        
        const distance = LocationModule.calculateDistance(GlobalState.location, GlobalState.nextStop.location);
        const eta = this.calculateETA(distance);
        
        const etaPill = document.querySelector('.eta-pill .pill-value');
        const distancePill = document.querySelector('.distance-pill .pill-value');
        const speedPill = document.querySelector('.speed-pill .pill-value');
        
        if (etaPill) etaPill.textContent = eta;
        
        if (distancePill) {
            distancePill.textContent = distance < 1 ? 
                `${Math.round(distance * 1000)} m` : 
                `${distance.toFixed(1)} km`;
        }
        
        if (speedPill && GlobalState.tracking.speed !== undefined) {
            speedPill.textContent = GlobalState.tracking.speed || 0;
        }
        
        // Check if arrived
        if (distance < 0.05) {
            this.showArrivalNotification(GlobalState.nextStop);
        }
    },
    
    calculateETA(distance) {
        const avgSpeed = 30; // km/h
        const timeInHours = distance / avgSpeed;
        const timeInMinutes = Math.round(timeInHours * 60);
        
        const now = new Date();
        const eta = new Date(now.getTime() + timeInMinutes * 60000);
        
        return eta.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    },
    
    showArrivalNotification(targetStop) {
        const distanceEl = document.querySelector('.waze-distance');
        const streetEl = document.querySelector('.waze-street');
        const arrowEl = document.querySelector('.direction-arrow');
        const paymentInfo = getPaymentInfoForStop(targetStop);
        
        if (distanceEl) distanceEl.textContent = 'Arrived';
        if (streetEl) streetEl.textContent = `${targetStop.type} location reached`;
        if (arrowEl) arrowEl.textContent = '✅';
        
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        
        // Show payment reminder for cash collection
        if (targetStop.type === 'delivery' && paymentInfo.needsCollection) {
            UIModule.showNotification(
                `⚠️ Remember to collect KES ${paymentInfo.amount.toLocaleString()} from customer`,
                'warning'
            );
        }
        
        // Auto-open verification after 2 seconds
        setTimeout(() => {
            UIModule.handleVerifyClick();
        }, 2000);
    },
    
    startNavigationUpdates() {
        if (GlobalState.tracking.interval) {
            clearInterval(GlobalState.tracking.interval);
        }
        
        GlobalState.tracking.interval = setInterval(() => {
            this.updateNavigation();
        }, 2000);
    },
    
    toggleMenu() {
        const menu = document.getElementById('navMenu');
        if (menu) {
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        }
    },
    
    toggleFollowMode() {
        GlobalState.isFollowingUser = !GlobalState.isFollowingUser;
        const followText = document.getElementById('followModeText');
        if (followText) {
            followText.textContent = GlobalState.isFollowingUser ? 'Following On' : 'Following Off';
        }
        
        if (GlobalState.isFollowingUser && GlobalState.location) {
            GlobalState.map.panTo([GlobalState.location.lat, GlobalState.location.lng], {
                animate: true,
                duration: 1
            });
        }
        
        UIModule.showNotification(
            GlobalState.isFollowingUser ? 'Following mode enabled' : 'Following mode disabled',
            'info'
        );
    },
    
    exitNavigation() {
        const nav = document.querySelector('.enhanced-navigation');
        if (nav) nav.remove();
        
        GlobalState.ui.navigationActive = false;
        GlobalState.isFollowingUser = false;
        
        if (GlobalState.tracking.interval) {
            clearInterval(GlobalState.tracking.interval);
            GlobalState.tracking.interval = null;
        }
        
        // Show route panel again
        const routePanel = document.getElementById('routePanel');
        if (routePanel) {
            routePanel.style.display = 'none';
            GlobalState.ui.panelVisible = false;
        }
        
        // Show nav controls
        const navControls = document.getElementById('navControls');
        if (navControls) {
            navControls.style.display = 'flex';
        }
        
        // Reset map view
        if (GlobalState.map && GlobalState.route && GlobalState.route.stops) {
            const bounds = L.latLngBounds();
            GlobalState.route.stops.forEach(stop => {
                if (stop.location) {
                    bounds.extend([stop.location.lat, stop.location.lng]);
                }
            });
            GlobalState.map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
};

// ============================================================================
// UI MODULE (Complete from Paste 1/2 with enhancements)
// ============================================================================

const UIModule = {
    initialize() {
        console.log('🎨 Initializing UI...');
        
        this.createHeader();
        this.createFABs();
        this.createBottomNav();
        this.createRoutePanel();
        this.createTrackingIndicator();
        
        // Show cash widget if needed
        if (GlobalState.cash.totalToCollect > 0) {
            this.showCashCollectionWidget();
        }
        
        this.updateDisplay();
    },
    
    createHeader() {
        const header = document.createElement('div');
        header.className = 'top-header';
        header.innerHTML = `
            <div class="header-content">
                <button class="back-button" onclick="UIModule.goBack()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M15 19l-7-7 7-7"/>
                    </svg>
                </button>
                <div class="route-info-header">
                    <div class="route-title" id="routeTitle">
                        ${GlobalState.route?.name || 'Loading...'}
                    </div>
                    <div class="route-stats-bar">
                        <div class="stat-item">
                            <span class="stat-value" id="stopsRemaining">0</span> stops
                        </div>
                        <div class="stat-item">
                            <span class="stat-value" id="cashToCollect">0</span> cash
                        </div>
                    </div>
                </div>
                <button class="verify-button" id="mainVerifyBtn" onclick="UIModule.handleVerifyClick()">
                    Loading...
                </button>
            </div>
        `;
        document.body.appendChild(header);
    },
    
    createFABs() {
        const fabContainer = document.createElement('div');
        fabContainer.className = 'fab-container';
        fabContainer.innerHTML = `
            <button class="fab" onclick="MapModule.centerOnLocation()">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
                </svg>
            </button>
            <button class="fab" onclick="UIModule.callCustomer()">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
                </svg>
            </button>
        `;
        document.body.appendChild(fabContainer);
    },
    
    createBottomNav() {
        const bottomNav = document.createElement('div');
        bottomNav.className = 'bottom-nav';
        bottomNav.id = 'navControls';
        bottomNav.innerHTML = `
            <div class="nav-actions">
                <button class="nav-button" onclick="UIModule.togglePanel()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
                    </svg>
                    Details
                </button>
                <button class="nav-button" onclick="NavigationModule.startNavigation()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M21.71 11.29l-9-9c-.39-.39-1.02-.39-1.41 0l-9 9c-.39.39-.39 1.02 0 1.41l9 9c.39.39 1.02.39 1.41 0l9-9c.39-.39.39-1.02 0-1.41zM14 14.5V12h-4v3H8v-4c0-.55.45-1 1-1h5V7.5l3.5 3.5-3.5 3.5z"/>
                    </svg>
                    Navigate
                </button>
                <button class="nav-button" onclick="UIModule.refreshRoute()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                    </svg>
                    Refresh
                </button>
            </div>
        `;
        document.body.appendChild(bottomNav);
    },
    
    createRoutePanel() {
        const panel = document.createElement('div');
        panel.className = 'route-panel';
        panel.id = 'routePanel';
        panel.innerHTML = `
            <div class="panel-handle"></div>
            <div class="panel-header">
                <h2 class="panel-title">Route Details</h2>
                <div class="route-progress">
                    <div class="progress-item">
                        <div class="progress-icon">📦</div>
                        <div class="progress-label">Pickups</div>
                        <div class="progress-value" id="pickupProgress">0/0</div>
                    </div>
                    <div class="progress-item">
                        <div class="progress-icon">📍</div>
                        <div class="progress-label">Deliveries</div>
                        <div class="progress-value" id="deliveryProgress">0/0</div>
                    </div>
                    <div class="progress-item">
                        <div class="progress-icon">💰</div>
                        <div class="progress-label">Cash</div>
                        <div class="progress-value" id="cashProgress">KES 0</div>
                    </div>
                </div>
            </div>
            <div class="panel-content" id="panelContent">
                <!-- Stops will be inserted here -->
            </div>
        `;
        document.body.appendChild(panel);
        
        // Setup drag to expand
        this.setupPanelDrag();
    },
    
    createTrackingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'tracking-indicator';
        indicator.id = 'trackingIndicator';
        indicator.style.display = 'none';
        indicator.innerHTML = `
            <div class="tracking-dot"></div>
            <span>Live Tracking</span>
        `;
        document.body.appendChild(indicator);
    },
    
    showCashCollectionWidget() {
        const existingWidget = document.querySelector('.cash-collection-widget');
        if (existingWidget) existingWidget.remove();
        
        const pendingAmount = GlobalState.cash.totalToCollect - GlobalState.cash.totalCollected;
        const hasPending = pendingAmount > 0;
        
        const widget = document.createElement('div');
        widget.className = `cash-collection-widget ${hasPending ? 'has-pending' : ''}`;
        widget.innerHTML = `
            <div class="cash-widget-title">
                <span>💰</span>
                <span>Cash Collection</span>
            </div>
            <div class="cash-widget-amount">
                KES ${pendingAmount.toLocaleString()}
            </div>
            <div class="cash-widget-breakdown">
                <div class="cash-breakdown-item">
                    <span class="cash-breakdown-label">Total to collect</span>
                    <span class="cash-breakdown-value">KES ${GlobalState.cash.totalToCollect.toLocaleString()}</span>
                </div>
                <div class="cash-breakdown-item">
                    <span class="cash-breakdown-label">✓ Collected</span>
                    <span class="cash-breakdown-value">KES ${GlobalState.cash.totalCollected.toLocaleString()}</span>
                </div>
                <div class="cash-breakdown-item">
                    <span class="cash-breakdown-label">⏳ Pending</span>
                    <span class="cash-breakdown-value">KES ${pendingAmount.toLocaleString()}</span>
                </div>
            </div>
        `;
        
        document.body.appendChild(widget);
    },
    
    updateDisplay() {
        // Update header
        const stopsRemaining = GlobalState.route?.stops?.filter(s => !s.completed).length || 0;
        document.getElementById('stopsRemaining').textContent = stopsRemaining;
        document.getElementById('cashToCollect').textContent = `KES ${GlobalState.cash.totalToCollect - GlobalState.cash.totalCollected}`;
        
        // Update verify button
        this.updateVerifyButton();
        
        // Update progress
        const pickups = GlobalState.route?.stops?.filter(s => s.type === 'pickup') || [];
        const deliveries = GlobalState.route?.stops?.filter(s => s.type === 'delivery') || [];
        
        document.getElementById('pickupProgress').textContent = 
            `${pickups.filter(s => s.completed).length}/${pickups.length}`;
        document.getElementById('deliveryProgress').textContent = 
            `${deliveries.filter(s => s.completed).length}/${deliveries.length}`;
        document.getElementById('cashProgress').textContent = 
            `KES ${GlobalState.cash.totalCollected}`;
        
        // Update stops display
        this.displayStops();
    },
    
    updateVerifyButton() {
        const btn = document.getElementById('mainVerifyBtn');
        if (!btn) return;
        
        if (GlobalState.nextStop) {
            const canComplete = RouteModule.canCompleteStop(GlobalState.nextStop, GlobalState.route.stops);
            
            if (canComplete) {
                btn.className = `verify-button ${GlobalState.nextStop.type}`;
                btn.innerHTML = `
                    ${GlobalState.nextStop.type === 'pickup' ? '📦' : '📍'} 
                    Verify ${GlobalState.nextStop.type}
                `;
                btn.disabled = false;
            } else {
                btn.className = 'verify-button locked';
                btn.innerHTML = '🔒 Complete pickup first';
                btn.disabled = true;
            }
        } else if (RouteModule.isRouteComplete()) {
            btn.className = 'verify-button completed';
            btn.innerHTML = '✅ Route Complete';
            btn.disabled = true;
        } else {
            btn.className = 'verify-button';
            btn.innerHTML = '⏳ Loading...';
            btn.disabled = true;
        }
    },
    
    displayStops() {
        const panelContent = document.getElementById('panelContent');
        if (!panelContent || !GlobalState.route?.stops) return;
        
        let html = '';
        
        // Cash widget if needed
        if (GlobalState.cash.totalToCollect > 0) {
            html += `
                <div class="cash-widget">
                    <div class="cash-header">
                        <span>💰</span>
                        <span>Cash Collection</span>
                    </div>
                    <div class="cash-stats">
                        <div class="cash-stat">
                            <span class="label">Total</span>
                            <span class="value">KES ${GlobalState.cash.totalToCollect}</span>
                        </div>
                        <div class="cash-stat">
                            <span class="label">Collected</span>
                            <span class="value">KES ${GlobalState.cash.totalCollected}</span>
                        </div>
                        <div class="cash-stat">
                            <span class="label">Pending</span>
                            <span class="value">KES ${GlobalState.cash.totalToCollect - GlobalState.cash.totalCollected}</span>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Parcels in possession
        if (GlobalState.parcels.inPossession.length > 0) {
            html += `
                <div style="
                    background: linear-gradient(135deg, rgba(255, 159, 10, 0.1), rgba(255, 159, 10, 0.05));
                    border: 1px solid rgba(255, 159, 10, 0.3);
                    border-radius: 16px;
                    padding: 16px;
                    margin-bottom: 20px;
                ">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-weight: 600; color: #FF9F0A;">
                        <span>📦</span>
                        <span>Carrying ${GlobalState.parcels.inPossession.length} parcel${GlobalState.parcels.inPossession.length > 1 ? 's' : ''}</span>
                    </div>
                </div>
            `;
        }
        
        // Stops list
        html += '<div class="stops-container">';
        
        GlobalState.route.stops.forEach((stop, index) => {
            const isNext = GlobalState.nextStop?.id === stop.id;
            const canComplete = RouteModule.canCompleteStop(stop, GlobalState.route.stops);
            const paymentInfo = getPaymentInfoForStop(stop);
            
            html += `
                <div class="stop-card ${stop.completed ? 'completed' : ''} ${isNext ? 'active' : ''}">
                    <div class="stop-indicator ${stop.type} ${stop.completed ? 'completed' : ''}">
                        ${stop.completed ? '✓' : canComplete ? index + 1 : '🔒'}
                    </div>
                    <div class="stop-details">
                        <div class="stop-header">
                            <span class="stop-type ${stop.type}">
                                ${stop.type.toUpperCase()}
                            </span>
                        </div>
                        <div class="stop-address">${stop.address}</div>
                        <div class="stop-info">
                            <div class="info-row">
                                <span>👤</span> ${stop.customerName}
                            </div>
                            <div class="info-row">
                                <span>📋</span> ${stop.parcelCode}
                            </div>
                            ${stop.customerPhone ? `
                                <div class="info-row">
                                    <span>📞</span> ${stop.customerPhone}
                                </div>
                            ` : ''}
                        </div>
                        ${stop.type === 'delivery' && paymentInfo.needsCollection ? `
                            <div class="payment-badge">
                                <span>💰</span>
                                <span>Collect KES ${paymentInfo.amount}</span>
                            </div>
                        ` : ''}
                        ${stop.completed ? `
                            <div style="margin-top: 8px; color: #34C759; font-size: 13px;">
                                ✓ Completed
                            </div>
                        ` : isNext ? `
                            <div style="margin-top: 8px; color: #0066FF; font-size: 13px; font-weight: 600;">
                                → Current Target
                            </div>
                        ` : !canComplete ? `
                            <div style="margin-top: 8px; color: #999; font-size: 13px;">
                                🔒 Complete pickup first
                            </div>
                        ` : ''}
                    </div>
                    ${!stop.completed && canComplete ? `
                        <div class="stop-actions">
                            <button class="action-btn" onclick="MapModule.focusOnStop(GlobalState.route.stops[${index}])">
                                🗺️
                            </button>
                            ${stop.customerPhone ? `
                                <a href="tel:${stop.customerPhone}" class="action-btn">
                                    📞
                                </a>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += '</div>';
        
        panelContent.innerHTML = html;
    },
    
    handleVerifyClick() {
        if (GlobalState.nextStop) {
            this.showVerificationModal(GlobalState.nextStop.id);
        }
    },
    
    showVerificationModal(stopId) {
        const stop = GlobalState.route?.stops?.find(s => s.id === stopId);
        if (!stop) return;
        
        GlobalState.currentStop = stop;
        
        const modal = document.createElement('div');
        modal.className = 'verification-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(10px);
        `;
        
        const needsPayment = stop.type === 'delivery' && 
                            stop.paymentMethod === 'cash' && 
                            stop.paymentStatus === 'pending';
        
        modal.innerHTML = `
            <div style="
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(30px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 24px;
                max-width: 420px;
                width: 90%;
                padding: 0;
                overflow: hidden;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            ">
                <div style="
                    padding: 24px;
                    text-align: center;
                    background: linear-gradient(135deg, ${stop.type === 'pickup' ? '#FF9F0A, #ff8c00' : '#0066FF, #0052cc'});
                    color: white;
                ">
                    <span style="font-size: 48px; display: block; margin-bottom: 12px;">
                        ${stop.type === 'pickup' ? '📦' : '📍'}
                    </span>
                    <h2 style="margin: 0; font-size: 24px; font-weight: 700;">
                        ${stop.type === 'pickup' ? 'Pickup' : 'Delivery'} Verification
                    </h2>
                    <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">
                        ${stop.address}
                    </p>
                </div>
                
                <div style="padding: 24px; color: white;">
                    <div style="
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 12px;
                        padding: 16px;
                        margin-bottom: 20px;
                    ">
                        <h3 style="margin: 0 0 12px 0; font-size: 18px;">Stop Details</h3>
                        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 14px;">
                            <div style="display: flex; justify-content: space-between;">
                                <span style="opacity: 0.7;">Customer:</span>
                                <span style="font-weight: 600;">${stop.customerName}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="opacity: 0.7;">Parcel:</span>
                                <span style="font-weight: 600;">${stop.parcelCode}</span>
                            </div>
                            ${stop.customerPhone ? `
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="opacity: 0.7;">Phone:</span>
                                    <a href="tel:${stop.customerPhone}" style="color: #0066FF; text-decoration: none; font-weight: 600;">
                                        ${stop.customerPhone}
                                    </a>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    ${needsPayment ? `
                        <div style="
                            background: linear-gradient(135deg, rgba(255, 159, 10, 0.2), rgba(255, 159, 10, 0.1));
                            border: 2px solid #FF9F0A;
                            border-radius: 12px;
                            padding: 16px;
                            margin: 16px 0;
                            text-align: center;
                        ">
                            <div style="font-size: 24px; margin-bottom: 8px;">💰</div>
                            <div style="font-size: 20px; font-weight: 700; color: #FF9F0A;">
                                Collect KES ${stop.price}
                            </div>
                            <div style="margin-top: 4px; font-size: 14px; opacity: 0.9;">
                                Cash on Delivery
                            </div>
                        </div>
                    ` : ''}
                    
                    <div style="margin: 20px 0;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">
                            Enter ${stop.type === 'pickup' ? 'Pickup' : 'Delivery'} Code:
                        </label>
                        <input 
                            type="text" 
                            id="verification-code-input"
                            placeholder="Enter code"
                            maxlength="10"
                            autocomplete="off"
                            style="
                                width: 100%;
                                padding: 16px;
                                font-size: 24px;
                                text-align: center;
                                border: 2px solid rgba(255, 255, 255, 0.2);
                                border-radius: 12px;
                                background: rgba(255, 255, 255, 0.05);
                                color: white;
                                text-transform: uppercase;
                                letter-spacing: 2px;
                                font-weight: 600;
                                outline: none;
                            "
                            onkeyup="if(event.key === 'Enter') UIModule.verifyCode()"
                        />
                        <div style="text-align: center; opacity: 0.7; margin-top: 8px; font-size: 14px;">
                            Expected: ${stop.verificationCode}
                        </div>
                    </div>
                    
                    ${needsPayment ? `
                        <label style="
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            cursor: pointer;
                            padding: 12px;
                            background: rgba(255, 255, 255, 0.05);
                            border-radius: 8px;
                            margin-bottom: 16px;
                        ">
                            <input type="checkbox" id="payment-collected-checkbox" style="
                                width: 20px;
                                height: 20px;
                                cursor: pointer;
                            ">
                            <span style="font-size: 16px;">
                                I have collected KES ${stop.price} cash
                            </span>
                        </label>
                    ` : ''}
                    
                    <div style="display: flex; gap: 12px;">
                        <button onclick="UIModule.closeModal()" style="
                            flex: 1;
                            padding: 16px;
                            background: rgba(255, 255, 255, 0.1);
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            border-radius: 12px;
                            color: white;
                            font-size: 16px;
                            font-weight: 600;
                            cursor: pointer;
                        ">Cancel</button>
                        <button onclick="UIModule.verifyCode()" style="
                            flex: 1;
                            padding: 16px;
                            background: linear-gradient(135deg, #0066FF, #0052cc);
                            border: none;
                            border-radius: 12px;
                            color: white;
                            font-size: 16px;
                            font-weight: 600;
                            cursor: pointer;
                            box-shadow: 0 4px 20px rgba(0, 102, 255, 0.3);
                        ">Verify</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Focus input
        setTimeout(() => {
            document.getElementById('verification-code-input')?.focus();
        }, 100);
    },
    
    async verifyCode() {
        const input = document.getElementById('verification-code-input');
        const enteredCode = input?.value?.trim().toUpperCase();
        const stop = GlobalState.currentStop;
        
        if (!stop || !enteredCode) {
            this.showNotification('Please enter a code', 'error');
            return;
        }
        
        // Check payment collection for cash deliveries
        if (stop.type === 'delivery' && stop.paymentMethod === 'cash' && stop.paymentStatus === 'pending') {
            const paymentCheckbox = document.getElementById('payment-collected-checkbox');
            if (!paymentCheckbox?.checked) {
                this.showNotification('Please confirm cash collection', 'warning');
                return;
            }
        }
        
        // Verify code (accept any code for now)
        const isValid = enteredCode.length > 0;
        
        if (!isValid) {
            this.showNotification('Invalid code', 'error');
            return;
        }
        
        // Close modal
        this.closeModal();
        
        // Complete stop
        await RouteModule.completeStop(stop.id);
        
        // Update displays
        this.updateDisplay();
        MapModule.plotRoute();
        MapModule.drawOptimizedRoute();
        
        // Update cash widget
        if (GlobalState.cash.totalToCollect > 0) {
            this.showCashCollectionWidget();
        }
        
        // Show success
        this.showNotification(
            `${stop.type === 'pickup' ? 'Pickup' : 'Delivery'} completed!`,
            'success'
        );
        
        // Check if route is complete
        if (RouteModule.isRouteComplete()) {
            this.showRouteCompleteModal();
        }
    },
    
    async showRouteCompleteModal() {
        // Handle route completion
        const completionData = await RouteModule.handleRouteCompletion();
        
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.95);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        modal.innerHTML = `
            <div style="
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(30px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 24px;
                padding: 40px;
                text-align: center;
                max-width: 400px;
                color: white;
            ">
                <div style="font-size: 72px; margin-bottom: 20px;">🎉</div>
                <h2 style="margin: 0 0 20px; font-size: 28px;">Route Complete!</h2>
                <p style="margin: 20px 0; opacity: 0.9;">
                    Great job! All deliveries completed successfully.
                </p>
                
                ${GlobalState.cash.totalCollected > 0 ? `
                    <div style="
                        margin: 24px 0;
                        padding: 16px;
                        background: rgba(255, 159, 10, 0.1);
                        border: 1px solid #FF9F0A;
                        border-radius: 12px;
                    ">
                        <div style="font-size: 14px; opacity: 0.7; margin-bottom: 8px;">
                            Cash Collected:
                        </div>
                        <div style="font-size: 24px; font-weight: 700; color: #FF9F0A;">
                            KES ${GlobalState.cash.totalCollected}
                        </div>
                        <div style="font-size: 12px; opacity: 0.7; margin-top: 8px;">
                            Please deposit to your wallet
                        </div>
                    </div>
                ` : ''}
                
                <button onclick="UIModule.goBack()" style="
                    width: 100%;
                    padding: 16px;
                    background: linear-gradient(135deg, #0066FF, #0052cc);
                    border: none;
                    border-radius: 12px;
                    color: white;
                    font-size: 18px;
                    font-weight: 700;
                    cursor: pointer;
                    box-shadow: 0 4px 20px rgba(0, 102, 255, 0.3);
                ">Back to Dashboard</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Clear route data
        RouteModule.clearRoute();
    },
    
    closeModal() {
        document.querySelector('.verification-modal')?.remove();
    },
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#FF3B30' : type === 'warning' ? '#FF9F0A' : '#34C759'};
            color: ${type === 'warning' ? 'black' : 'white'};
            padding: 12px 20px;
            border-radius: 12px;
            font-weight: 600;
            z-index: 10001;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    },
    
    togglePanel() {
        const panel = document.getElementById('routePanel');
        if (panel) {
            if (panel.style.display === 'none' || !GlobalState.ui.panelVisible) {
                panel.style.display = 'block';
                GlobalState.ui.panelVisible = true;
            } else {
                panel.style.display = 'none';
                GlobalState.ui.panelVisible = false;
            }
        }
    },
    
    setupPanelDrag() {
        const panel = document.getElementById('routePanel');
        const handle = panel?.querySelector('.panel-handle');
        if (!handle) return;
        
        let startY = 0;
        let currentHeight = 0;
        let isDragging = false;
        
        handle.addEventListener('touchstart', (e) => {
            isDragging = true;
            startY = e.touches[0].clientY;
            currentHeight = panel.offsetHeight;
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            const deltaY = startY - e.touches[0].clientY;
            const newHeight = currentHeight + deltaY;
            
            if (newHeight > 100 && newHeight < window.innerHeight * 0.8) {
                panel.style.height = `${newHeight}px`;
            }
        }, { passive: true });
        
        document.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            
            const finalHeight = panel.offsetHeight;
            if (finalHeight > window.innerHeight * 0.4) {
                panel.classList.add('expanded');
            } else {
                panel.classList.remove('expanded');
                panel.style.height = '';
            }
        });
    },
    
    callCustomer() {
        if (GlobalState.nextStop?.customerPhone) {
            window.location.href = `tel:${GlobalState.nextStop.customerPhone}`;
        } else {
            this.showNotification('No phone number available', 'warning');
        }
    },
    
    refreshRoute() {
        window.location.reload();
    },
    
    goBack() {
        window.location.href = './rider.html';
    },
    
    showEmptyState() {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <div class="empty-icon">📦</div>
            <h2 class="empty-title">No Active Route</h2>
            <p class="empty-message">Please claim a route from the dashboard</p>
            <button class="empty-action" onclick="UIModule.goBack()">
                Back to Dashboard
            </button>
        `;
        document.body.appendChild(emptyState);
    },
    
    hideLoading() {
        const loader = document.getElementById('loadingOverlay');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
            }, 500);
        }
    }
};

// ============================================================================
// CSS INJECTION (from Paste 3)
// ============================================================================

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
        
        /* Cash collection widget */
        .cash-collection-widget {
            position: fixed;
            top: 80px;
            right: 20px;
            background: linear-gradient(135deg, rgba(52, 199, 89, 0.95), rgba(48, 209, 88, 0.85));
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 16px;
            min-width: 200px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            z-index: 100;
            transition: all 0.3s ease;
        }
        
        .cash-collection-widget.has-pending {
            background: linear-gradient(135deg, rgba(255, 159, 10, 0.95), rgba(255, 149, 0, 0.85));
        }
        
        /* Payment reminder */
        .payment-reminder {
            position: fixed;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--warning, #FF9F0A);
            color: black;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
            z-index: 1001;
            animation: pulse 2s infinite;
        }
        
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
        
        .waze-bottom-pills {
            position: fixed;
            bottom: calc(30px + var(--safe-area-bottom));
            left: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
            z-index: 999;
            pointer-events: auto !important;
        }
        
        .waze-pill {
            background: rgba(10, 10, 11, 0.9);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 25px;
            padding: 8px 16px;
            display: flex;
            align-items: center;
            gap: 6px;
            color: white;
            font-size: 14px;
        }
        
        .waze-fab {
            position: fixed;
            bottom: calc(100px + var(--safe-area-bottom));
            right: 20px;
            width: 56px;
            height: 56px;
            background: var(--primary, #0066FF);
            border-radius: 50%;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0, 102, 255, 0.4);
            cursor: pointer;
            z-index: 998;
            transition: all 0.3s;
            pointer-events: auto !important;
        }
        
        .waze-nav-menu {
            position: fixed;
            bottom: calc(170px + var(--safe-area-bottom));
            right: 20px;
            background: var(--surface-elevated, #1C1C1F);
            border-radius: 12px;
            padding: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            z-index: 997;
            min-width: 200px;
            pointer-events: auto !important;
        }
        
        .nav-menu-item {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            padding: 12px;
            background: transparent;
            border: none;
            color: var(--text-primary, white);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.2s;
            text-align: left;
        }
        
        @keyframes pulse {
            0% { transform: translateX(-50%) scale(1); }
            50% { transform: translateX(-50%) scale(1.05); }
            100% { transform: translateX(-50%) scale(1); }
        }
    `;
    document.head.appendChild(style);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initialize() {
    console.log('🚀 Initializing Enhanced Route Navigation with Dynamic Routing...');
    
    try {
        // Inject styles
        injectNavigationStyles();
        
        // Load route data
        const routeLoaded = await RouteModule.loadRoute();
        if (!routeLoaded) {
            UIModule.showEmptyState();
            UIModule.hideLoading();
            return;
        }
        
        // Initialize map
        await MapModule.initialize();
        
        // Initialize UI
        UIModule.initialize();
        
        // Plot route on map
        await MapModule.plotRoute();
        
        // Draw optimized route
        await MapModule.drawOptimizedRoute();
        
        // Start location tracking
        LocationModule.startTracking();
        
        // Setup online/offline handlers
        window.addEventListener('online', () => {
            document.getElementById('connectionStatus')?.classList.remove('offline');
            SupabaseAPI.syncOfflineQueue();
        });
        
        window.addEventListener('offline', () => {
            document.getElementById('connectionStatus')?.classList.add('offline');
            GlobalState.offline.isOffline = true;
        });
        
        // Hide loading
        UIModule.hideLoading();
        
        console.log('✅ Enhanced Route Navigation ready with dynamic routing!');
        console.log('Features: Dynamic pickup/delivery flow, payment tracking, navigation, POD support');
        
    } catch (error) {
        console.error('❌ Initialization error:', error);
        UIModule.hideLoading();
        UIModule.showNotification('Failed to initialize', 'error');
    }
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

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded - Starting initialization...');
    await waitForLeaflet();
    await initialize();
});

// Export for debugging
window.RouteDebug = {
    state: GlobalState,
    modules: {
        Route: RouteModule,
        Map: MapModule,
        Location: LocationModule,
        UI: UIModule,
        Navigation: NavigationModule,
        Supabase: SupabaseAPI
    },
    config: CONFIG,
    // Debug utilities
    forceComplete: async () => {
        if (GlobalState.route && GlobalState.route.stops) {
            GlobalState.route.stops.forEach(stop => {
                stop.completed = true;
                stop.timestamp = new Date();
            });
            await RouteModule.saveRoute();
            await RouteModule.handleRouteCompletion();
        }
    },
    checkCompletion: () => {
        const completionData = localStorage.getItem('tuma_route_completion');
        console.log('Stored completion data:', completionData);
        return completionData ? JSON.parse(completionData) : null;
    },
    simulatePickup: (parcelId) => {
        const stop = GlobalState.route.stops.find(s => 
            s.type === 'pickup' && s.parcelId === parcelId && !s.completed
        );
        if (stop) {
            RouteModule.completeStop(stop.id);
            UIModule.updateDisplay();
            MapModule.plotRoute();
            console.log(`✅ Pickup for parcel ${parcelId} completed`);
        }
    },
    simulateDelivery: (parcelId) => {
        const stop = GlobalState.route.stops.find(s => 
            s.type === 'delivery' && s.parcelId === parcelId && !s.completed
        );
        if (stop && RouteModule.canCompleteStop(stop, GlobalState.route.stops)) {
            RouteModule.completeStop(stop.id);
            UIModule.updateDisplay();
            MapModule.plotRoute();
            console.log(`✅ Delivery for parcel ${parcelId} completed`);
        } else {
            console.log('❌ Cannot complete delivery - pickup not completed');
        }
    }
};

console.log('✅ Complete Merged Route Navigation System loaded!');
console.log('Dynamic routing enabled: Each delivery only needs its pickup completed');
console.log('Debug: window.RouteDebug');
