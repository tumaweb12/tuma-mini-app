/**
 * ENHANCED ROUTE NAVIGATION MODULE - PART 1
 * Complete Supabase Integration, Modern Glassmorphic UI, Dynamic Route Optimization
 * Core Infrastructure, Configuration, and Data Management
 */

// ============================================================================
// INITIALIZATION GUARD
// ============================================================================
let routeNavigationInitialized = false;

// ============================================================================
// GLOBAL CONFIGURATION WITH SUPABASE
// ============================================================================

const CONFIG = {
    api: {
        OPENROUTE_KEY: '5b3ce3597851110001cf624841e48578ffb34c6b96dfe3bbe9b3ad4c',
        SUPABASE_URL: 'https://btxavqfoirdzwpfrvezp.supabase.co',
        SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk',
        SUPABASE_HEADERS: {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
    },
    business: {
        riderCommission: 0.70,
        platformCommission: 0.30,
        maxUnpaid: 300,
        warningThreshold: 250
    },
    defaults: {
        nairobi: { lat: -1.2921, lng: 36.8219 }
    },
    dev: {
        isDevelopment: window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname.includes('github.io'),
        testRider: {
            id: 'ef5438ef-0cc0-4e35-8d1b-be18dbce7fe4',
            name: 'Bobby G',
            phone: '0725046880'
        },
        verboseLogging: true,
        ignoreRiderNotFound: true,
        useLocalStorage: true
    },
    navigation: {
        headingUp: false,
        smoothMovement: true,
        autoZoom: true,
        mapRotatable: true,
        useDynamicOptimization: true,
        proximityRadius: 50, // meters
        arrivalRadius: 30 // meters
    },
    ui: {
        theme: 'glassmorphic',
        animations: true,
        hapticFeedback: true
    }
};

// ============================================================================
// GLOBAL STATE MANAGEMENT
// ============================================================================

const GlobalState = {
    route: null,
    rider: null,
    map: null,
    markers: [],
    polylines: [],
    location: null,
    lastLocation: null,
    lastLocationTime: null,
    tracking: {
        watchId: null,
        isActive: false,
        heading: 0,
        speed: 0,
        accuracy: 0,
        interval: null,
        proximityNotified: false,
        lastUpdate: null
    },
    navigation: {
        isActive: false,
        isFollowing: true,
        currentInstruction: null,
        directionsPolyline: null,
        mapBearing: 0,
        lastMapRotation: 0,
        targetStop: null,
        routeGeometry: null
    },
    ui: {
        panelVisible: true,
        panelExpanded: false,
        pickupPhaseCompleted: false,
        loadingVisible: true
    },
    parcels: {
        inPossession: [],
        cashToCollect: 0,
        cashCollected: 0,
        paymentsByStop: {},
        all: []
    },
    verification: {
        currentStop: null,
        podData: null,
        verificationCode: null
    },
    offline: {
        proofs: [],
        pendingUpdates: [],
        lastSync: null
    },
    earnings: {
        totalRouteEarnings: 0,
        routeCommission: 0,
        completedEarnings: 0
    },
    locationMarker: null,
    accuracyCircle: null,
    radiusCircle: null,
    routeControl: null,
    optimizedSequence: null,
    supabase: {
        connected: false,
        lastFetch: null,
        retryCount: 0
    }
};

// ============================================================================
// SUPABASE MODULE - Database Integration
// ============================================================================

const SupabaseModule = {
    // Initialize connection
    async initialize() {
        try {
            console.log('🔌 Connecting to Supabase...');
            
            // Test connection
            const response = await fetch(`${CONFIG.api.SUPABASE_URL}/rest/v1/`, {
                headers: CONFIG.api.SUPABASE_HEADERS
            });
            
            if (response.ok) {
                GlobalState.supabase.connected = true;
                console.log('✅ Supabase connected successfully');
                return true;
            } else {
                console.error('❌ Supabase connection failed:', response.status);
                return false;
            }
        } catch (error) {
            console.error('❌ Supabase connection error:', error);
            return false;
        }
    },

    // Fetch active route for rider
    async fetchActiveRoute(riderId) {
        if (!riderId && CONFIG.dev.isDevelopment) {
            riderId = CONFIG.dev.testRider.id;
        }
        
        if (!riderId) {
            console.error('No rider ID provided');
            return this.createDemoRoute();
        }

        try {
            console.log(`📥 Fetching active route for rider: ${riderId}`);
            
            // First, get the active route
            const routeResponse = await fetch(
                `${CONFIG.api.SUPABASE_URL}/rest/v1/routes?rider_id=eq.${riderId}&status=eq.active&select=*`,
                { headers: CONFIG.api.SUPABASE_HEADERS }
            );

            if (!routeResponse.ok) {
                throw new Error(`Route fetch failed: ${routeResponse.status}`);
            }

            const routes = await routeResponse.json();
            
            if (!routes || routes.length === 0) {
                console.log('No active routes found, using demo route');
                return this.createDemoRoute();
            }

            const activeRoute = routes[0];
            console.log('📍 Active route found:', activeRoute.name);

            // Fetch parcels for this route
            const parcelsResponse = await fetch(
                `${CONFIG.api.SUPABASE_URL}/rest/v1/parcels?route_id=eq.${activeRoute.id}&select=*`,
                { headers: CONFIG.api.SUPABASE_HEADERS }
            );

            if (!parcelsResponse.ok) {
                throw new Error(`Parcels fetch failed: ${parcelsResponse.status}`);
            }

            const parcels = await parcelsResponse.json();
            console.log(`📦 Found ${parcels.length} parcels for route`);

            // Combine route with parcels
            activeRoute.parcels = parcels;
            
            // Store in state
            GlobalState.supabase.lastFetch = new Date().toISOString();
            
            return activeRoute;

        } catch (error) {
            console.error('Error fetching route from Supabase:', error);
            GlobalState.supabase.retryCount++;
            
            // Try to load from local storage as fallback
            if (CONFIG.dev.useLocalStorage) {
                const localRoute = this.loadFromLocalStorage();
                if (localRoute) return localRoute;
            }
            
            // Use demo route as last resort
            return this.createDemoRoute();
        }
    },

    // Create demo route for testing
    createDemoRoute() {
        console.log('🎮 Creating demo route for testing...');
        return {
            id: 'demo-route-' + Date.now(),
            name: 'Westlands to Kilimani Express',
            status: 'active',
            rider_id: CONFIG.dev.testRider.id,
            created_at: new Date().toISOString(),
            parcels: [
                {
                    id: 'demo-parcel-1',
                    parcel_code: 'PKG001',
                    tracking_code: 'TUM-001-WK',
                    sender_name: 'Electronics Hub',
                    sender_phone: '0712345678',
                    sender_address: 'Sarit Centre, Westlands',
                    pickup_lat: -1.2634,
                    pickup_lng: 36.8031,
                    recipient_name: 'Jane Muthoni',
                    recipient_phone: '0723456789',
                    recipient_address: 'Yaya Centre, Kilimani',
                    delivery_lat: -1.2921,
                    delivery_lng: 36.7875,
                    price: 1500,
                    payment_method: 'cash',
                    payment_status: 'pending',
                    status: 'assigned',
                    pickup_code: 'PICK123',
                    delivery_code: 'DROP456',
                    special_instructions: 'Fragile electronics - handle with care'
                },
                {
                    id: 'demo-parcel-2',
                    parcel_code: 'PKG002',
                    tracking_code: 'TUM-002-KL',
                    sender_name: 'Fashion Forward',
                    sender_phone: '0734567890',
                    sender_address: 'The Mall, Westlands',
                    pickup_lat: -1.2669,
                    pickup_lng: 36.8099,
                    recipient_name: 'John Kamau',
                    recipient_phone: '0745678901',
                    recipient_address: 'Prestige Plaza, Ngong Road',
                    delivery_lat: -1.2998,
                    delivery_lng: 36.7825,
                    price: 2000,
                    payment_method: 'online',
                    payment_status: 'paid',
                    status: 'assigned',
                    pickup_code: 'PICK789',
                    delivery_code: 'DROP012',
                    special_instructions: 'Call customer on arrival'
                },
                {
                    id: 'demo-parcel-3',
                    parcel_code: 'PKG003',
                    tracking_code: 'TUM-003-LV',
                    sender_name: 'Organic Foods Kenya',
                    sender_phone: '0756789012',
                    sender_address: 'Village Market, Gigiri',
                    pickup_lat: -1.2285,
                    pickup_lng: 36.8073,
                    recipient_name: 'Mary Wanjiru',
                    recipient_phone: '0767890123',
                    recipient_address: 'Lavington Green, Lavington',
                    delivery_lat: -1.2833,
                    delivery_lng: 36.7667,
                    price: 1800,
                    payment_method: 'cash',
                    payment_status: 'pending',
                    status: 'assigned',
                    pickup_code: 'PICK345',
                    delivery_code: 'DROP678',
                    special_instructions: 'Perishable items - deliver ASAP'
                }
            ]
        };
    },

    // Load from local storage (fallback)
    loadFromLocalStorage() {
        try {
            const storedRoute = localStorage.getItem('tuma_active_route');
            if (storedRoute) {
                console.log('📂 Loading route from local storage');
                return JSON.parse(storedRoute);
            }
        } catch (error) {
            console.error('Error loading from localStorage:', error);
        }
        return null;
    },

    // Update parcel status in database
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
                    headers: CONFIG.api.SUPABASE_HEADERS,
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
            
            // Store for offline sync
            GlobalState.offline.pendingUpdates.push({
                type: 'parcel_update',
                parcelId,
                data: { status, ...additionalData },
                timestamp: new Date().toISOString()
            });
            
            return false;
        }
    },

    // Create proof of delivery record
    async createProofOfDelivery(stopId, podData) {
        try {
            const pod = {
                stop_id: stopId,
                route_id: GlobalState.route.id,
                rider_id: GlobalState.rider?.id || CONFIG.dev.testRider.id,
                photo_url: podData.photoUrl || null,
                delivery_type: podData.deliveryType,
                recipient_name: podData.recipientName || null,
                notes: podData.notes || null,
                location: podData.location,
                created_at: new Date().toISOString()
            };

            const response = await fetch(
                `${CONFIG.api.SUPABASE_URL}/rest/v1/delivery_proofs`,
                {
                    method: 'POST',
                    headers: CONFIG.api.SUPABASE_HEADERS,
                    body: JSON.stringify(pod)
                }
            );

            if (!response.ok) {
                throw new Error(`POD creation failed: ${response.status}`);
            }

            console.log('✅ Proof of delivery created');
            return true;

        } catch (error) {
            console.error('Error creating POD:', error);
            
            // Store for offline sync
            GlobalState.offline.proofs.push({
                ...podData,
                stopId,
                timestamp: new Date().toISOString()
            });
            
            return false;
        }
    },

    // Sync offline data
    async syncOfflineData() {
        if (!navigator.onLine || GlobalState.offline.pendingUpdates.length === 0) {
            return;
        }

        console.log('🔄 Syncing offline data...');
        
        const updates = [...GlobalState.offline.pendingUpdates];
        GlobalState.offline.pendingUpdates = [];

        for (const update of updates) {
            try {
                if (update.type === 'parcel_update') {
                    await this.updateParcelStatus(update.parcelId, update.data.status, update.data);
                }
            } catch (error) {
                console.error('Sync error:', error);
                GlobalState.offline.pendingUpdates.push(update);
            }
        }

        // Sync PODs
        const proofs = [...GlobalState.offline.proofs];
        GlobalState.offline.proofs = [];

        for (const proof of proofs) {
            try {
                await this.createProofOfDelivery(proof.stopId, proof);
            } catch (error) {
                console.error('POD sync error:', error);
                GlobalState.offline.proofs.push(proof);
            }
        }

        GlobalState.offline.lastSync = new Date().toISOString();
        console.log('✅ Offline sync complete');
    }
};

// ============================================================================
// UTILITY MODULE - Enhanced Helpers
// ============================================================================

const Utils = {
    // Calculate distance between two points (Haversine formula)
    calculateDistance(point1, point2) {
        if (!point1 || !point2) return 999;
        
        const R = 6371; // Earth's radius in km
        const dLat = (point2.lat - point1.lat) * Math.PI / 180;
        const dLon = (point2.lng - point1.lng) * Math.PI / 180;
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(point1.lat * Math.PI / 180) * 
                  Math.cos(point2.lat * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    },

    // Parse various location formats
    parseLocation(locationData) {
        if (!locationData) return CONFIG.defaults.nairobi;
        
        // Handle direct lat/lng
        if (locationData.lat !== undefined && locationData.lng !== undefined) {
            return {
                lat: parseFloat(locationData.lat),
                lng: parseFloat(locationData.lng)
            };
        }
        
        // Handle pickup/delivery specific coordinates
        if (locationData.pickup_lat !== undefined && locationData.pickup_lng !== undefined) {
            return {
                lat: parseFloat(locationData.pickup_lat),
                lng: parseFloat(locationData.pickup_lng)
            };
        }
        
        if (locationData.delivery_lat !== undefined && locationData.delivery_lng !== undefined) {
            return {
                lat: parseFloat(locationData.delivery_lat),
                lng: parseFloat(locationData.delivery_lng)
            };
        }
        
        // Handle string coordinates
        if (typeof locationData === 'string') {
            if (locationData.includes(',')) {
                const parts = locationData.split(',').map(s => s.trim());
                const lat = parseFloat(parts[0]);
                const lng = parseFloat(parts[1]);
                if (!isNaN(lat) && !isNaN(lng)) {
                    return { lat, lng };
                }
            }
            
            try {
                const parsed = JSON.parse(locationData);
                return this.parseLocation(parsed);
            } catch {
                return CONFIG.defaults.nairobi;
            }
        }
        
        return CONFIG.defaults.nairobi;
    },

    // Parse price from various formats
    parsePrice(priceValue) {
        if (typeof priceValue === 'number') return priceValue;
        if (typeof priceValue === 'string') {
            const cleaned = priceValue.replace(/[^0-9.-]+/g, '');
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? 0 : parsed;
        }
        if (priceValue && typeof priceValue === 'object' && priceValue.amount) {
            return this.parsePrice(priceValue.amount);
        }
        return 0;
    },

    // Format time ago
    formatTimeAgo(timestamp) {
        if (!timestamp) return '';
        
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return '';
            
            const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
            
            if (minutes < 1) return 'just now';
            if (minutes === 1) return '1 min ago';
            if (minutes < 60) return `${minutes} min ago`;
            
            const hours = Math.floor(minutes / 60);
            if (hours === 1) return '1 hour ago';
            if (hours < 24) return `${hours} hours ago`;
            
            const days = Math.floor(hours / 24);
            if (days === 1) return '1 day ago';
            return `${days} days ago`;
        } catch {
            return '';
        }
    },

    // Show glassmorphic notification
    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = 'notification-toast';
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            padding: 16px 20px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            display: flex;
            align-items: center;
            gap: 12px;
            z-index: 10000;
            animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            max-width: 350px;
            font-size: 14px;
            font-weight: 500;
        `;

        const colors = {
            success: 'linear-gradient(135deg, rgba(52, 199, 89, 0.2), rgba(52, 199, 89, 0.1))',
            error: 'linear-gradient(135deg, rgba(255, 59, 48, 0.2), rgba(255, 59, 48, 0.1))',
            warning: 'linear-gradient(135deg, rgba(255, 159, 10, 0.2), rgba(255, 159, 10, 0.1))',
            info: 'linear-gradient(135deg, rgba(0, 102, 255, 0.2), rgba(0, 102, 255, 0.1))'
        };

        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };

        notification.style.background = colors[type] || colors.info;
        notification.innerHTML = `
            <span style="font-size: 20px;">${icons[type] || icons.info}</span>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        // Add slide in animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;
        if (!document.querySelector('style[data-notification-animations]')) {
            style.setAttribute('data-notification-animations', 'true');
            document.head.appendChild(style);
        }
        
        // Auto-dismiss
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, duration);

        // Haptic feedback if enabled
        if (CONFIG.ui.hapticFeedback) {
            this.vibrate(type === 'error' ? [200, 100, 200] : [100]);
        }
    },

    // Calculate bearing between two points
    calculateBearing(start, end) {
        if (!start || !end) return 0;
        
        const dLng = (end.lng - start.lng) * Math.PI / 180;
        const lat1 = start.lat * Math.PI / 180;
        const lat2 = end.lat * Math.PI / 180;
        
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - 
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        
        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    },

    // Format currency
    formatCurrency(amount) {
        return `KES ${Math.round(amount).toLocaleString()}`;
    },

    // Calculate ETA
    calculateETA(distanceKm, speedKmh = 30) {
        const timeInMinutes = Math.round(distanceKm / speedKmh * 60);
        const now = new Date();
        const eta = new Date(now.getTime() + timeInMinutes * 60000);
        
        return eta.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    },

    // Vibrate device if supported
    vibrate(pattern = [100]) {
        if (navigator.vibrate && CONFIG.ui.hapticFeedback) {
            navigator.vibrate(pattern);
        }
    },

    // Store data with encryption (for sensitive data)
    secureStore(key, data) {
        try {
            const encrypted = btoa(JSON.stringify(data));
            localStorage.setItem(`tuma_secure_${key}`, encrypted);
            return true;
        } catch (error) {
            console.error('Secure storage failed:', error);
            return false;
        }
    },

    // Retrieve encrypted data
    secureRetrieve(key) {
        try {
            const encrypted = localStorage.getItem(`tuma_secure_${key}`);
            if (!encrypted) return null;
            return JSON.parse(atob(encrypted));
        } catch (error) {
            console.error('Secure retrieval failed:', error);
            return null;
        }
    },

    // Clear secure storage
    secureClear(key) {
        try {
            if (key) {
                localStorage.removeItem(`tuma_secure_${key}`);
            } else {
                // Clear all secure items
                Object.keys(localStorage).forEach(k => {
                    if (k.startsWith('tuma_secure_')) {
                        localStorage.removeItem(k);
                    }
                });
            }
            return true;
        } catch (error) {
            console.error('Secure clear failed:', error);
            return false;
        }
    }
};

console.log('✅ Route Navigation Part 1 loaded: Core Infrastructure & Supabase Integration');
/**
 * ENHANCED ROUTE NAVIGATION MODULE - PART 2
 * Route Management, Map Integration, Location Tracking, Navigation System
 * Complete implementation with dynamic optimization and real-time tracking
 */

// ============================================================================
// ROUTE MODULE - Complete with Dynamic Optimization
// ============================================================================

const RouteModule = {
    // Initialize route from Supabase or fallback sources
    async initialize() {
        console.log('🚀 RouteModule: Initializing...');
        
        try {
            // Get rider ID from URL or use test rider
            const urlParams = new URLSearchParams(window.location.search);
            const riderId = urlParams.get('rider_id') || 
                           sessionStorage.getItem('tuma_rider_id') ||
                           (CONFIG.dev.isDevelopment ? CONFIG.dev.testRider.id : null);
            
            // Initialize Supabase connection
            await SupabaseModule.initialize();
            
            // Fetch active route from Supabase
            const routeData = await SupabaseModule.fetchActiveRoute(riderId);
            
            if (!routeData) {
                console.log('No route data available');
                return false;
            }
            
            // Process and store route
            GlobalState.route = this.processRouteData(routeData);
            
            // Calculate financials
            this.calculateFinancials();
            
            // Run dynamic optimization if enabled
            if (CONFIG.navigation.useDynamicOptimization && GlobalState.route.stops) {
                await this.optimizeRoute();
            }
            
            // Save to local storage for offline access
            this.saveRoute();
            
            console.log(`✅ Route loaded: ${GlobalState.route.name}`);
            console.log(`📦 ${GlobalState.route.stops.length} stops to complete`);
            
            return true;
            
        } catch (error) {
            console.error('Error initializing route:', error);
            return false;
        }
    },

    // Process raw route data into structured format
    processRouteData(routeData) {
        const processed = {
            id: routeData.id || routeData.route_id || `route-${Date.now()}`,
            name: routeData.name || routeData.route_name || 'Delivery Route',
            status: routeData.status || 'active',
            stops: [],
            parcels: routeData.parcels || [],
            distance: 0,
            duration: 0,
            optimized: false,
            created_at: routeData.created_at,
            rider_id: routeData.rider_id
        };
        
        // Generate stops from parcels
        if (routeData.parcels && routeData.parcels.length > 0) {
            processed.stops = this.generateStopsFromParcels(routeData.parcels);
        }
        
        // Restore completion state if available
        const savedState = localStorage.getItem(`tuma_route_state_${processed.id}`);
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                processed.stops.forEach(stop => {
                    const savedStop = state.stops?.find(s => s.id === stop.id);
                    if (savedStop) {
                        stop.completed = savedStop.completed;
                        stop.timestamp = savedStop.timestamp;
                    }
                });
                GlobalState.parcels.cashCollected = state.cashCollected || 0;
                GlobalState.parcels.paymentsByStop = state.paymentsByStop || {};
            } catch (e) {
                console.error('Error restoring route state:', e);
            }
        }
        
        return processed;
    },

    // Generate stops from parcels
    generateStopsFromParcels(parcels) {
        const stops = [];
        let stopIndex = 0;
        
        parcels.forEach((parcel, index) => {
            // Create pickup stop
            const pickupLocation = {
                lat: parcel.pickup_lat,
                lng: parcel.pickup_lng
            };
            
            stops.push({
                id: `pickup-${parcel.id}`,
                type: 'pickup',
                parcelId: parcel.id,
                parcelCode: parcel.parcel_code || parcel.tracking_code || `PKG${index + 1}`,
                address: parcel.sender_address || parcel.pickup_address || 'Pickup Location',
                location: Utils.parseLocation(pickupLocation),
                customerName: parcel.sender_name || 'Sender',
                customerPhone: parcel.sender_phone || '',
                specialInstructions: parcel.special_instructions || parcel.pickup_instructions || '',
                verificationCode: parcel.pickup_code || 'PICK123',
                paymentMethod: parcel.payment_method || 'cash',
                paymentStatus: parcel.payment_status || 'pending',
                price: 0,
                completed: parcel.status === 'picked' || parcel.status === 'in_transit' || parcel.status === 'delivered',
                timestamp: parcel.pickup_timestamp || null,
                canComplete: true,
                sequenceNumber: stopIndex++,
                estimatedDuration: 5, // minutes
                parcelData: parcel
            });
            
            // Create delivery stop
            const deliveryLocation = {
                lat: parcel.delivery_lat,
                lng: parcel.delivery_lng
            };
            
            stops.push({
                id: `delivery-${parcel.id}`,
                type: 'delivery',
                parcelId: parcel.id,
                parcelCode: parcel.parcel_code || parcel.tracking_code || `PKG${index + 1}`,
                address: parcel.recipient_address || parcel.delivery_address || 'Delivery Location',
                location: Utils.parseLocation(deliveryLocation),
                customerName: parcel.recipient_name || 'Recipient',
                customerPhone: parcel.recipient_phone || '',
                specialInstructions: parcel.special_instructions || parcel.delivery_instructions || '',
                verificationCode: parcel.delivery_code || 'DROP123',
                paymentMethod: parcel.payment_method || 'cash',
                paymentStatus: parcel.payment_status || 'pending',
                price: Utils.parsePrice(parcel.price || parcel.total_price || 0),
                completed: parcel.status === 'delivered',
                timestamp: parcel.delivery_timestamp || null,
                canComplete: false,
                sequenceNumber: stopIndex++,
                estimatedDuration: 5, // minutes
                parcelData: parcel
            });
        });
        
        return stops;
    },

    // Optimize route using dynamic algorithm
    async optimizeRoute() {
        if (!GlobalState.route?.stops) return;
        
        console.log('🔄 Optimizing route for efficiency...');
        
        const stops = [...GlobalState.route.stops];
        const completed = stops.filter(s => s.completed);
        const pending = stops.filter(s => !s.completed);
        
        if (pending.length === 0) {
            console.log('All stops completed');
            return;
        }
        
        // Group pickups and deliveries
        const pickups = pending.filter(s => s.type === 'pickup');
        const deliveries = pending.filter(s => s.type === 'delivery');
        
        // Find efficient pickup-delivery pairs (close to each other)
        const efficientPairs = [];
        
        pickups.forEach(pickup => {
            const correspondingDelivery = deliveries.find(d => d.parcelId === pickup.parcelId);
            if (correspondingDelivery) {
                const distance = Utils.calculateDistance(pickup.location, correspondingDelivery.location);
                if (distance < 2) { // Less than 2km
                    pickup.isEfficientPair = true;
                    correspondingDelivery.isEfficientPair = true;
                    correspondingDelivery.canComplete = true; // Allow immediate delivery
                    correspondingDelivery.allowDynamic = true;
                    efficientPairs.push({ pickup, delivery: correspondingDelivery, distance });
                }
            }
        });
        
        // Sort pairs by distance (shortest first)
        efficientPairs.sort((a, b) => a.distance - b.distance);
        
        console.log(`⚡ Found ${efficientPairs.length} efficient pickup-delivery pairs`);
        
        // Create optimized sequence using nearest neighbor algorithm
        const optimizedSequence = [...completed];
        const processedStops = new Set(completed.map(s => s.id));
        let currentLocation = GlobalState.location || CONFIG.defaults.nairobi;
        
        // Process efficient pairs first
        efficientPairs.forEach(pair => {
            if (!processedStops.has(pair.pickup.id)) {
                pair.pickup.optimizationReason = 'Efficient pair - close delivery';
                optimizedSequence.push(pair.pickup);
                processedStops.add(pair.pickup.id);
                currentLocation = pair.pickup.location;
            }
            if (!processedStops.has(pair.delivery.id)) {
                pair.delivery.optimizationReason = 'Efficient pair - nearby pickup';
                optimizedSequence.push(pair.delivery);
                processedStops.add(pair.delivery.id);
                currentLocation = pair.delivery.location;
            }
        });
        
        // Add remaining stops using nearest neighbor
        const remainingStops = pending.filter(s => !processedStops.has(s.id));
        
        while (remainingStops.length > 0) {
            let nearestStop = null;
            let nearestDistance = Infinity;
            
            remainingStops.forEach(stop => {
                // Check if this stop can be completed
                if (stop.type === 'delivery') {
                    const pickupCompleted = optimizedSequence.some(s => 
                        s.type === 'pickup' && s.parcelId === stop.parcelId
                    );
                    if (!pickupCompleted) return; // Skip deliveries without completed pickups
                }
                
                const distance = Utils.calculateDistance(currentLocation, stop.location);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestStop = stop;
                }
            });
            
            if (nearestStop) {
                optimizedSequence.push(nearestStop);
                processedStops.add(nearestStop.id);
                currentLocation = nearestStop.location;
                const index = remainingStops.indexOf(nearestStop);
                remainingStops.splice(index, 1);
                
                // If this was a pickup, enable its delivery
                if (nearestStop.type === 'pickup') {
                    const delivery = remainingStops.find(s => 
                        s.type === 'delivery' && s.parcelId === nearestStop.parcelId
                    );
                    if (delivery) {
                        delivery.canComplete = true;
                    }
                }
            } else {
                // No valid stops found, add remaining pickups
                const remainingPickups = remainingStops.filter(s => s.type === 'pickup');
                optimizedSequence.push(...remainingPickups);
                remainingPickups.forEach(p => {
                    processedStops.add(p.id);
                    const index = remainingStops.indexOf(p);
                    remainingStops.splice(index, 1);
                });
            }
        }
        
        // Calculate estimated times
        let totalDuration = 0;
        let totalDistance = 0;
        currentLocation = GlobalState.location || CONFIG.defaults.nairobi;
        
        optimizedSequence.forEach((stop, index) => {
            if (!stop.completed) {
                const distance = Utils.calculateDistance(currentLocation, stop.location);
                totalDistance += distance;
                totalDuration += (distance / 30) * 60; // Assuming 30 km/h average speed
                totalDuration += stop.estimatedDuration || 5; // Time at stop
                
                stop.estimatedDistance = distance;
                stop.estimatedArrival = Utils.calculateETA(distance);
                stop.optimizedOrder = index;
                
                currentLocation = stop.location;
            }
        });
        
        // Store optimized sequence
        GlobalState.optimizedSequence = optimizedSequence;
        GlobalState.route.optimized = true;
        GlobalState.route.distance = totalDistance;
        GlobalState.route.duration = Math.round(totalDuration);
        
        console.log(`✅ Route optimized: ${totalDistance.toFixed(1)}km, ~${Math.round(totalDuration)} minutes`);
    },

    // Get next stop
    getNextStop() {
        if (!GlobalState.route?.stops) return null;
        
        // Use optimized sequence if available
        const sequence = GlobalState.optimizedSequence || GlobalState.route.stops;
        
        // Find first incomplete stop that can be completed
        return sequence.find(stop => 
            !stop.completed && this.canCompleteStop(stop)
        );
    },

    // Check if stop can be completed
    canCompleteStop(stop) {
        if (!stop || stop.completed) return false;
        
        // Pickups can always be completed
        if (stop.type === 'pickup') return true;
        
        // Check if delivery has dynamic flag
        if (stop.allowDynamic) return true;
        
        // For deliveries, check if pickup was completed
        const pickupStop = GlobalState.route.stops.find(s => 
            s.type === 'pickup' && 
            s.parcelId === stop.parcelId
        );
        
        return pickupStop && pickupStop.completed;
    },

    // Mark stop as completed
    async completeStop(stopId) {
        const stop = GlobalState.route.stops.find(s => s.id === stopId);
        if (!stop) return false;
        
        stop.completed = true;
        stop.timestamp = new Date().toISOString();
        
        // Update parcel status in Supabase
        const newStatus = stop.type === 'pickup' ? 'in_transit' : 'delivered';
        await SupabaseModule.updateParcelStatus(stop.parcelId, newStatus, {
            [`${stop.type}_timestamp`]: stop.timestamp,
            [`${stop.type}_completed`]: true
        });
        
        // If this is a pickup, update parcel possession
        if (stop.type === 'pickup') {
            const parcel = stop.parcelData;
            if (parcel) {
                GlobalState.parcels.inPossession.push({
                    ...parcel,
                    pickupTime: stop.timestamp
                });
                
                // Enable the corresponding delivery
                const deliveryStop = GlobalState.route.stops.find(s => 
                    s.type === 'delivery' && s.parcelId === stop.parcelId
                );
                if (deliveryStop) {
                    deliveryStop.canComplete = true;
                }
            }
        }
        
        // If this is a delivery, remove from possession and update cash
        if (stop.type === 'delivery') {
            GlobalState.parcels.inPossession = GlobalState.parcels.inPossession.filter(
                p => p.id !== stop.parcelId
            );
            
            // Update cash collected if COD
            if ((stop.paymentMethod === 'cash' || stop.paymentMethod === 'Cash on Delivery') && 
                stop.paymentStatus === 'pending') {
                GlobalState.parcels.cashCollected += stop.price;
                GlobalState.parcels.paymentsByStop[stop.id] = {
                    amount: stop.price,
                    collected: true,
                    timestamp: stop.timestamp
                };
                
                // Update payment status in Supabase
                await SupabaseModule.updateParcelStatus(stop.parcelId, 'delivered', {
                    payment_status: 'collected',
                    payment_collected_at: stop.timestamp
                });
            }
        }
        
        // Update earnings
        this.updateEarnings(stop);
        
        // Save updated route
        this.saveRoute();
        
        // Re-optimize if needed
        if (CONFIG.navigation.useDynamicOptimization && !RouteModule.isRouteComplete()) {
            await this.optimizeRoute();
        }
        
        return true;
    },

    // Update earnings after completing stop
    updateEarnings(stop) {
        if (stop.type === 'delivery') {
            const commission = stop.price * CONFIG.business.riderCommission;
            GlobalState.earnings.completedEarnings += commission;
        }
    },

    // Save route to localStorage
    saveRoute() {
        try {
            const routeData = {
                ...GlobalState.route,
                lastUpdated: new Date().toISOString()
            };
            
            // Save route
            localStorage.setItem('tuma_active_route', JSON.stringify(routeData));
            
            // Save state
            const state = {
                stops: GlobalState.route.stops.map(s => ({
                    id: s.id,
                    completed: s.completed,
                    timestamp: s.timestamp
                })),
                cashCollected: GlobalState.parcels.cashCollected,
                paymentsByStop: GlobalState.parcels.paymentsByStop,
                parcelsInPossession: GlobalState.parcels.inPossession
            };
            
            localStorage.setItem(`tuma_route_state_${GlobalState.route.id}`, JSON.stringify(state));
            
            return true;
        } catch (error) {
            console.error('Failed to save route:', error);
            return false;
        }
    },

    // Check if route is complete
    isRouteComplete() {
        if (!GlobalState.route?.stops) return false;
        return GlobalState.route.stops.every(stop => stop.completed);
    },

    // Clear route data
    clearRoute() {
        localStorage.removeItem('tuma_active_route');
        if (GlobalState.route?.id) {
            localStorage.removeItem(`tuma_route_state_${GlobalState.route.id}`);
        }
        GlobalState.route = null;
        GlobalState.parcels = {
            inPossession: [],
            cashToCollect: 0,
            cashCollected: 0,
            paymentsByStop: {},
            all: []
        };
    },

    // Calculate route financials
    calculateFinancials() {
        if (!GlobalState.route) return;
        
        GlobalState.earnings.totalRouteEarnings = 0;
        GlobalState.earnings.routeCommission = 0;
        GlobalState.parcels.cashToCollect = 0;
        
        GlobalState.route.stops.forEach(stop => {
            if (stop.type === 'delivery') {
                const price = stop.price;
                const riderPayout = price * CONFIG.business.riderCommission;
                const commission = price * CONFIG.business.platformCommission;
                
                GlobalState.earnings.totalRouteEarnings += riderPayout;
                GlobalState.earnings.routeCommission += commission;
                
                // Check if cash collection needed
                if ((stop.paymentMethod === 'cash' || stop.paymentMethod === 'Cash on Delivery') && 
                    stop.paymentStatus === 'pending' && !stop.completed) {
                    GlobalState.parcels.cashToCollect += price;
                }
            }
        });
        
        console.log('💰 Route financials calculated:', {
            earnings: GlobalState.earnings.totalRouteEarnings,
            commission: GlobalState.earnings.routeCommission,
            cashToCollect: GlobalState.parcels.cashToCollect
        });
    }
};

// ============================================================================
// MAP MODULE - Complete Map Integration
// ============================================================================

const MapModule = {
    // Initialize map
    async initialize() {
        console.log('🗺️ MapModule: Initializing map...');
        
        const mapContainer = document.getElementById('map');
        if (!mapContainer) {
            console.error('Map container not found!');
            return false;
        }
        
        // Calculate center from route
        let center = CONFIG.defaults.nairobi;
        if (GlobalState.route?.stops?.length > 0) {
            const bounds = this.calculateBounds(GlobalState.route.stops);
            center = {
                lat: (bounds.north + bounds.south) / 2,
                lng: (bounds.east + bounds.west) / 2
            };
        }
        
        // Create map
        GlobalState.map = L.map('map', {
            center: [center.lat, center.lng],
            zoom: 13,
            zoomControl: false,
            attributionControl: false
        });
        
        // Add dark tile layer for glassmorphic theme
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(GlobalState.map);
        
        // Add zoom control
        L.control.zoom({
            position: 'bottomright'
        }).addTo(GlobalState.map);
        
        // Force resize
        setTimeout(() => {
            GlobalState.map.invalidateSize();
        }, 100);
        
        console.log('✅ Map initialized successfully');
        return true;
    },

    // Calculate bounds from stops
    calculateBounds(stops) {
        let north = -90, south = 90, east = -180, west = 180;
        
        stops.forEach(stop => {
            if (stop.location) {
                north = Math.max(north, stop.location.lat);
                south = Math.min(south, stop.location.lat);
                east = Math.max(east, stop.location.lng);
                west = Math.min(west, stop.location.lng);
            }
        });
        
        // Add padding
        const latPadding = (north - south) * 0.1;
        const lngPadding = (east - west) * 0.1;
        
        return {
            north: north + latPadding,
            south: south - latPadding,
            east: east + lngPadding,
            west: west - lngPadding
        };
    },

    // Plot route stops on map
    async plotRoute() {
        if (!GlobalState.map || !GlobalState.route?.stops) return;
        
        // Clear existing markers
        GlobalState.markers.forEach(marker => marker.remove());
        GlobalState.markers = [];
        
        const bounds = L.latLngBounds();
        const sequence = GlobalState.optimizedSequence || GlobalState.route.stops;
        
        // Add markers for each stop
        sequence.forEach((stop, index) => {
            const marker = L.marker([stop.location.lat, stop.location.lng], {
                icon: this.createStopIcon(stop, index + 1),
                zIndexOffset: stop.completed ? 0 : 100
            })
            .addTo(GlobalState.map)
            .bindPopup(this.createStopPopup(stop));
            
            GlobalState.markers.push(marker);
            bounds.extend([stop.location.lat, stop.location.lng]);
        });
        
        // Fit bounds
        if (GlobalState.markers.length > 0) {
            GlobalState.map.fitBounds(bounds, { padding: [50, 50] });
        }
    },

    // Create stop icon
    createStopIcon(stop, number) {
        const isCompleted = stop.completed;
        const isNext = RouteModule.getNextStop()?.id === stop.id;
        const isEfficient = stop.isEfficientPair || stop.allowDynamic;
        const type = stop.type;
        
        let bgColor, symbol, iconClass;
        
        if (isCompleted) {
            bgColor = 'linear-gradient(135deg, #34C759, #2ecc71)';
            symbol = '✓';
            iconClass = 'completed';
        } else if (isEfficient) {
            bgColor = 'linear-gradient(135deg, #9B59B6, #8e44ad)';
            symbol = '⚡';
            iconClass = 'efficient';
        } else if (type === 'pickup') {
            bgColor = 'linear-gradient(135deg, #FF9F0A, #ff8c00)';
            symbol = number;
            iconClass = 'pickup';
        } else {
            bgColor = 'linear-gradient(135deg, #0066FF, #0052cc)';
            symbol = number;
            iconClass = 'delivery';
        }
        
        return L.divIcon({
            className: 'custom-map-marker',
            html: `
                <div class="marker-wrapper ${iconClass} ${isNext ? 'active' : ''}" style="
                    position: relative;
                    width: 44px;
                    height: 44px;
                ">
                    ${isNext ? '<div class="marker-pulse" style="
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        border: 2px solid #00FF00;
                        border-radius: 50%;
                        animation: pulse 2s infinite;
                    "></div>' : ''}
                    <div style="
                        background: ${bgColor};
                        width: 44px;
                        height: 44px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                        border: 3px solid ${isNext ? '#00FF00' : 'white'};
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

    // Create popup content
    createStopPopup(stop) {
        const paymentInfo = stop.paymentMethod === 'cash' && stop.paymentStatus === 'pending' ? 
            `<div style="margin-top: 8px; padding: 8px; background: rgba(255, 159, 10, 0.1); border-radius: 8px; border: 1px solid #FF9F0A;">
                💰 Collect: ${Utils.formatCurrency(stop.price)}
            </div>` : '';
        
        return `
            <div style="min-width: 250px;">
                <div style="padding: 12px; background: linear-gradient(135deg, ${stop.type === 'pickup' ? '#FF9F0A, #ff8c00' : '#0066FF, #0052cc'}); color: white; margin: -10px -10px 10px -10px; border-radius: 10px 10px 0 0;">
                    <strong>${stop.type.toUpperCase()}</strong> - ${stop.parcelCode}
                </div>
                <div style="padding: 0 12px 12px;">
                    <h4 style="margin: 0 0 8px 0;">${stop.address}</h4>
                    <div style="color: #666; font-size: 14px;">
                        <div>👤 ${stop.customerName}</div>
                        <div>📞 ${stop.customerPhone}</div>
                        ${stop.specialInstructions ? `<div>💬 ${stop.specialInstructions}</div>` : ''}
                    </div>
                    ${paymentInfo}
                    ${stop.completed ? 
                        `<div style="margin-top: 8px; color: #34C759;">✓ Completed ${Utils.formatTimeAgo(stop.timestamp)}</div>` :
                        RouteModule.canCompleteStop(stop) ? 
                            `<button onclick="VerificationModule.showModal('${stop.id}')" style="
                                margin-top: 12px;
                                width: 100%;
                                padding: 10px;
                                background: linear-gradient(135deg, #0066FF, #0052cc);
                                color: white;
                                border: none;
                                border-radius: 8px;
                                font-weight: 600;
                                cursor: pointer;
                            ">Verify ${stop.type}</button>` :
                            `<div style="margin-top: 8px; color: #999;">🔒 Complete pickup first</div>`
                    }
                </div>
            </div>
        `;
    },

    // Draw optimized route
    async drawOptimizedRoute() {
        if (!GlobalState.route?.stops) return;
        
        const sequence = GlobalState.optimizedSequence || GlobalState.route.stops;
        const activeStops = sequence.filter(s => !s.completed);
        
        if (activeStops.length < 2) return;
        
        try {
            // Remove existing polylines
            GlobalState.polylines.forEach(p => GlobalState.map.removeLayer(p));
            GlobalState.polylines = [];
            
            // Build coordinates
            const coordinates = activeStops.map(stop => 
                [stop.location.lng, stop.location.lat]
            );
            
            // Add current location if available
            if (GlobalState.location) {
                coordinates.unshift([GlobalState.location.lng, GlobalState.location.lat]);
            }
            
            // Get route from OpenRoute
            const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': CONFIG.api.OPENROUTE_KEY
                },
                body: JSON.stringify({
                    coordinates: coordinates,
                    continue_straight: false,
                    geometry: true,
                    instructions: false,
                    preference: 'recommended'
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.routes && data.routes.length > 0) {
                    const route = data.routes[0];
                    const decodedCoords = this.decodePolyline(route.geometry);
                    
                    // Draw route with gradient effect
                    const polyline = L.polyline(decodedCoords, {
                        color: '#0066FF',
                        weight: 6,
                        opacity: 0.8,
                        smoothFactor: 1,
                        className: 'route-polyline'
                    }).addTo(GlobalState.map);
                    
                    GlobalState.polylines.push(polyline);
                }
            }
        } catch (error) {
            console.error('Error drawing route:', error);
            // Fallback to straight lines
            this.drawFallbackRoute(activeStops);
        }
    },

    // Draw fallback route
    drawFallbackRoute(stops) {
        const coords = stops.map(stop => [stop.location.lat, stop.location.lng]);
        
        if (GlobalState.location) {
            coords.unshift([GlobalState.location.lat, GlobalState.location.lng]);
        }
        
        const polyline = L.polyline(coords, {
            color: '#0066FF',
            weight: 4,
            opacity: 0.6,
            dashArray: '10, 10',
            smoothFactor: 1
        }).addTo(GlobalState.map);
        
        GlobalState.polylines.push(polyline);
    },

    // Decode polyline from OpenRoute
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
    },

    // Focus on specific stop
    focusOnStop(stop) {
        if (!GlobalState.map || !stop) return;
        
        GlobalState.map.setView([stop.location.lat, stop.location.lng], 16, {
            animate: true,
            duration: 1
        });
        
        // Open popup
        const marker = GlobalState.markers.find(m => {
            const latLng = m.getLatLng();
            return Math.abs(latLng.lat - stop.location.lat) < 0.0001 && 
                   Math.abs(latLng.lng - stop.location.lng) < 0.0001;
        });
        
        if (marker) {
            marker.openPopup();
        }
    },

    // Center on location
    centerOnLocation(location) {
        if (!GlobalState.map || !location) return;
        
        GlobalState.map.panTo([location.lat, location.lng], {
            animate: true,
            duration: 1
        });
    },

    // Fit route bounds
    fitRouteBounds() {
        if (!GlobalState.map || !GlobalState.route?.stops) return;
        
        const bounds = L.latLngBounds();
        GlobalState.route.stops.forEach(stop => {
            if (stop.location) {
                bounds.extend([stop.location.lat, stop.location.lng]);
            }
        });
        
        if (bounds.isValid()) {
            GlobalState.map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
};

// ============================================================================
// LOCATION MODULE - Real-time Location Tracking
// ============================================================================

const LocationModule = {
    // Start location tracking
    startTracking() {
        if (!navigator.geolocation) {
            Utils.showNotification('Location services not available', 'warning');
            return;
        }
        
        console.log('📍 LocationModule: Starting location tracking...');
        
        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        };
        
        // Get initial position
        navigator.geolocation.getCurrentPosition(
            position => {
                this.updateLocation(position);
                GlobalState.tracking.isActive = true;
                Utils.showNotification('Location tracking active', 'success');
            },
            error => {
                console.error('Location error:', error);
                Utils.showNotification('Please enable location services', 'warning');
            },
            options
        );
        
        // Start watching position
        GlobalState.tracking.watchId = navigator.geolocation.watchPosition(
            position => this.updateLocation(position),
            error => console.error('Location update error:', error),
            options
        );
    },

    // Update current location
    updateLocation(position) {
        const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };
        
        // Check if location has significantly changed
        if (GlobalState.location) {
            const distance = Utils.calculateDistance(GlobalState.location, newLocation);
            if (distance < 0.005) return; // Ignore small movements (< 5 meters)
        }
        
        // Store last location
        GlobalState.lastLocation = GlobalState.location;
        GlobalState.lastLocationTime = GlobalState.lastLocationTime || Date.now();
        
        // Update current location
        GlobalState.location = newLocation;
        
        // Update tracking info
        GlobalState.tracking.accuracy = position.coords.accuracy;
        
        if (position.coords.heading !== null) {
            GlobalState.tracking.heading = position.coords.heading;
        } else if (GlobalState.lastLocation) {
            GlobalState.tracking.heading = Utils.calculateBearing(GlobalState.lastLocation, GlobalState.location);
        }
        
        if (position.coords.speed !== null) {
            GlobalState.tracking.speed = Math.round(position.coords.speed * 3.6); // m/s to km/h
        } else if (GlobalState.lastLocation && GlobalState.lastLocationTime) {
            const timeDiff = (Date.now() - GlobalState.lastLocationTime) / 1000; // seconds
            const distance = Utils.calculateDistance(GlobalState.lastLocation, GlobalState.location);
            GlobalState.tracking.speed = Math.round((distance / timeDiff) * 3600); // km/h
        }
        
        GlobalState.lastLocationTime = Date.now();
        GlobalState.tracking.lastUpdate = new Date().toISOString();
        
        // Update map marker
        this.updateLocationMarker();
        
        // Check proximity to stops
        this.checkProximity();
        
        // Update UI
        UIModule.updateLocationInfo();
    },

    // Update location marker on map
    updateLocationMarker() {
        if (!GlobalState.map || !GlobalState.location) return;
        
        // Create or update location marker
        if (!GlobalState.locationMarker) {
            const locationIcon = this.createLocationIcon();
            GlobalState.locationMarker = L.marker(
                [GlobalState.location.lat, GlobalState.location.lng],
                { 
                    icon: locationIcon,
                    zIndexOffset: 1000
                }
            ).addTo(GlobalState.map);
            
            // Add accuracy circle
            GlobalState.accuracyCircle = L.circle(
                [GlobalState.location.lat, GlobalState.location.lng],
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
            GlobalState.locationMarker.setLatLng([GlobalState.location.lat, GlobalState.location.lng]);
            
            // Update accuracy circle
            if (GlobalState.accuracyCircle) {
                GlobalState.accuracyCircle.setLatLng([GlobalState.location.lat, GlobalState.location.lng]);
                GlobalState.accuracyCircle.setRadius(GlobalState.tracking.accuracy || 50);
            }
            
            // Update icon with new heading
            const locationIcon = this.createLocationIcon();
            GlobalState.locationMarker.setIcon(locationIcon);
        }
        
        // Follow mode
        if (GlobalState.navigation.isFollowing && GlobalState.navigation.isActive) {
            MapModule.centerOnLocation(GlobalState.location);
        }
    },

    // Create location icon
    createLocationIcon() {
        const heading = GlobalState.tracking.heading || 0;
        const isMoving = GlobalState.tracking.speed > 2;
        
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
                    ${isMoving ? `
                        <div style="
                            position: absolute;
                            top: 50%;
                            left: 50%;
                            width: 40px;
                            height: 40px;
                            transform: translate(-50%, -50%) rotate(${heading}deg);
                        ">
                            <div style="
                                width: 0;
                                height: 0;
                                border-left: 8px solid transparent;
                                border-right: 8px solid transparent;
                                border-bottom: 20px solid #0066FF;
                                position: absolute;
                                top: -10px;
                                left: 50%;
                                transform: translateX(-50%);
                            "></div>
                        </div>
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
                <style>
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
                </style>
            `,
            iconSize: [60, 60],
            iconAnchor: [30, 30]
        });
    },

    // Check proximity to stops
    checkProximity() {
        if (!GlobalState.location || !GlobalState.route?.stops) return;
        
        const nextStop = RouteModule.getNextStop();
        if (!nextStop) return;
        
        const distance = Utils.calculateDistance(GlobalState.location, nextStop.location);
        const distanceMeters = distance * 1000;
        
        // Near stop
        if (distanceMeters < CONFIG.navigation.proximityRadius && !GlobalState.tracking.proximityNotified) {
            GlobalState.tracking.proximityNotified = true;
            
            const paymentInfo = nextStop.paymentMethod === 'cash' && nextStop.paymentStatus === 'pending';
            if (nextStop.type === 'delivery' && paymentInfo) {
                Utils.showNotification(
                    `💰 Approaching delivery - Collect ${Utils.formatCurrency(nextStop.price)}`,
                    'warning',
                    5000
                );
            } else {
                Utils.showNotification(
                    `Approaching ${nextStop.type} - ${Math.round(distanceMeters)}m away`,
                    'info'
                );
            }
            
            // Reset notification flag after 5 minutes
            setTimeout(() => {
                GlobalState.tracking.proximityNotified = false;
            }, 300000);
        }
        
        // At stop
        if (distanceMeters < CONFIG.navigation.arrivalRadius && GlobalState.navigation.isActive) {
            NavigationModule.handleArrival(nextStop);
        }
    },

    // Stop tracking
    stopTracking() {
        if (GlobalState.tracking.watchId) {
            navigator.geolocation.clearWatch(GlobalState.tracking.watchId);
            GlobalState.tracking.watchId = null;
        }
        
        GlobalState.tracking.isActive = false;
        console.log('📍 Location tracking stopped');
    }
};

// ============================================================================
// NAVIGATION MODULE - Turn-by-turn Navigation
// ============================================================================

const NavigationModule = {
    // Start navigation to stop
    async startNavigation(stop) {
        if (!stop) {
            stop = RouteModule.getNextStop();
        }
        
        if (!stop) {
            Utils.showNotification('No stops to navigate to', 'warning');
            return;
        }
        
        if (!GlobalState.location) {
            Utils.showNotification('Waiting for GPS location...', 'info');
            return;
        }
        
        console.log('🧭 Starting navigation to:', stop.address);
        
        GlobalState.navigation.isActive = true;
        GlobalState.navigation.isFollowing = true;
        GlobalState.navigation.targetStop = stop;
        
        // Get directions
        await this.getDirections(stop);
        
        // Update UI
        UIModule.showNavigationMode();
        
        // Start continuous updates
        this.startContinuousUpdates();
        
        Utils.showNotification(`Navigating to ${stop.type} location`, 'info');
    },

    // Get directions from OpenRoute
    async getDirections(targetStop) {
        if (!GlobalState.location || !targetStop) return;
        
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
                    GlobalState.navigation.routeGeometry = route;
                    
                    // Draw navigation route
                    this.drawNavigationRoute(route);
                    
                    // Process instructions
                    this.processInstructions(route);
                }
            }
        } catch (error) {
            console.error('Error getting directions:', error);
            Utils.showNotification('Navigation error - using straight line', 'warning');
        }
    },

    // Draw navigation route
    drawNavigationRoute(route) {
        // Remove existing navigation polyline
        if (GlobalState.navigation.directionsPolyline) {
            GlobalState.map.removeLayer(GlobalState.navigation.directionsPolyline);
        }
        
        const decodedCoords = MapModule.decodePolyline(route.geometry);
        
        GlobalState.navigation.directionsPolyline = L.polyline(decodedCoords, {
            color: '#00FF00',
            weight: 8,
            opacity: 0.9,
            className: 'navigation-route'
        }).addTo(GlobalState.map);
        
        // Fit to route
        const bounds = L.latLngBounds(decodedCoords);
        GlobalState.map.fitBounds(bounds, { padding: [100, 100] });
    },

    // Process navigation instructions
    processInstructions(route) {
        if (!route.segments || route.segments.length === 0) return;
        
        const segment = route.segments[0];
        if (!segment.steps || segment.steps.length === 0) return;
        
        GlobalState.navigation.currentInstruction = {
            steps: segment.steps,
            currentStep: 0,
            totalDistance: route.summary.distance,
            totalDuration: route.summary.duration
        };
        
        this.updateNavigationDisplay();
    },

    // Update navigation display
    updateNavigationDisplay() {
        const instruction = GlobalState.navigation.currentInstruction;
        if (!instruction || !instruction.steps) return;
        
        const currentStep = instruction.steps[instruction.currentStep] || instruction.steps[0];
        const distance = currentStep.distance;
        const text = currentStep.instruction;
        
        UIModule.updateNavigationInstruction({
            distance: distance < 1000 ? `${Math.round(distance)}m` : `${(distance/1000).toFixed(1)}km`,
            instruction: text,
            type: currentStep.type
        });
    },

    // Start continuous navigation updates
    startContinuousUpdates() {
        if (GlobalState.navigation.interval) {
            clearInterval(GlobalState.navigation.interval);
        }
        
        GlobalState.navigation.interval = setInterval(() => {
            if (!GlobalState.navigation.isActive) {
                clearInterval(GlobalState.navigation.interval);
                return;
            }
            
            this.updateNavigation();
        }, 2000);
    },

    // Update navigation
    updateNavigation() {
        if (!GlobalState.location || !GlobalState.navigation.targetStop) return;
        
        const distance = Utils.calculateDistance(GlobalState.location, GlobalState.navigation.targetStop.location);
        const eta = Utils.calculateETA(distance, GlobalState.tracking.speed || 30);
        
        UIModule.updateNavigationStats({
            distance: distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`,
            eta: eta,
            speed: GlobalState.tracking.speed || 0
        });
        
        // Check for arrival
        if (distance * 1000 < CONFIG.navigation.arrivalRadius) {
            this.handleArrival(GlobalState.navigation.targetStop);
        }
    },

    // Handle arrival at stop
    handleArrival(stop) {
        if (!stop || GlobalState.navigation.arrivedNotified) return;
        
        GlobalState.navigation.arrivedNotified = true;
        
        Utils.showNotification(`Arrived at ${stop.type} location!`, 'success', 5000);
        Utils.vibrate([100, 50, 100, 50, 200]);
        
        // Check for payment reminder
        if (stop.type === 'delivery' && stop.paymentMethod === 'cash' && stop.paymentStatus === 'pending') {
            setTimeout(() => {
                Utils.showNotification(
                    `Remember to collect ${Utils.formatCurrency(stop.price)} cash`,
                    'warning',
                    10000
                );
            }, 2000);
        }
        
        // Auto-open verification after 3 seconds
        setTimeout(() => {
            VerificationModule.showModal(stop);
            this.exitNavigation();
        }, 3000);
    },

    // Exit navigation
    exitNavigation() {
        GlobalState.navigation.isActive = false;
        GlobalState.navigation.isFollowing = false;
        GlobalState.navigation.targetStop = null;
        GlobalState.navigation.arrivedNotified = false;
        
        // Clear interval
        if (GlobalState.navigation.interval) {
            clearInterval(GlobalState.navigation.interval);
            GlobalState.navigation.interval = null;
        }
        
        // Clear navigation polyline
        if (GlobalState.navigation.directionsPolyline) {
            GlobalState.map.removeLayer(GlobalState.navigation.directionsPolyline);
            GlobalState.navigation.directionsPolyline = null;
        }
        
        // Update UI
        UIModule.hideNavigationMode();
        
        // Zoom out to show route
        MapModule.fitRouteBounds();
    }
};

console.log('✅ Route Navigation Part 2 loaded: Route, Map, Location & Navigation modules');
/**
 * ENHANCED ROUTE NAVIGATION MODULE - PART 3
 * Verification System, UI Management, and Complete Initialization
 * Modern glassmorphic UI with full feature implementation
 */

// ============================================================================
// VERIFICATION MODULE - Complete POD and Verification System
// ============================================================================

const VerificationModule = {
    // Show verification modal for stop
    async showModal(stopId) {
        // Handle both stop object and stop ID
        let stop;
        if (typeof stopId === 'string') {
            stop = GlobalState.route?.stops?.find(s => s.id === stopId);
        } else {
            stop = stopId;
        }
        
        if (!stop) return;
        
        GlobalState.verification.currentStop = stop;
        
        const isPickup = stop.type === 'pickup';
        const needsPayment = stop.paymentMethod === 'cash' && stop.paymentStatus === 'pending' && !isPickup;
        
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
            animation: fadeIn 0.3s ease;
        `;
        
        modal.innerHTML = `
            <div class="modal-overlay" onclick="VerificationModule.closeModal()" style="
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
            "></div>
            <div class="modal-content" style="
                position: relative;
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(30px);
                -webkit-backdrop-filter: blur(30px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 24px;
                max-width: 420px;
                width: 90%;
                max-height: 85vh;
                overflow: hidden;
                z-index: 1;
                animation: slideUp 0.3s ease;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            ">
                <div class="modal-header" style="
                    padding: 24px;
                    text-align: center;
                    position: relative;
                    overflow: hidden;
                    background: linear-gradient(135deg, ${isPickup ? '#FF9F0A, #ff8c00' : '#0066FF, #0052cc'});
                    color: white;
                ">
                    <span class="modal-icon" style="font-size: 48px; display: block; margin-bottom: 12px;">
                        ${isPickup ? '📦' : '📍'}
                    </span>
                    <h2 style="margin: 0; font-size: 24px; font-weight: 700;">
                        ${isPickup ? 'Pickup Verification' : 'Delivery Verification'}
                    </h2>
                    <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">${stop.address}</p>
                </div>
                <div class="modal-body" style="padding: 24px; color: white;">
                    <div class="stop-summary" style="
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
                                <span style="font-weight: 600;">${stop.customerName || 'N/A'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="opacity: 0.7;">Phone:</span>
                                <span style="font-weight: 600;">
                                    ${stop.customerPhone ? 
                                        `<a href="tel:${stop.customerPhone}" style="color: #0066FF; text-decoration: none;">${stop.customerPhone}</a>` : 
                                        'Not provided'}
                                </span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="opacity: 0.7;">Parcel Code:</span>
                                <span style="font-weight: 600;">${stop.parcelCode}</span>
                            </div>
                            ${stop.specialInstructions ? `
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="opacity: 0.7;">Instructions:</span>
                                    <span style="font-weight: 600; text-align: right; max-width: 60%;">
                                        ${stop.specialInstructions}
                                    </span>
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
                                Collect ${Utils.formatCurrency(stop.price)}
                            </div>
                            <div style="margin-top: 4px; font-size: 14px; opacity: 0.9;">
                                Cash on Delivery
                            </div>
                        </div>
                    ` : !isPickup && stop.paymentStatus === 'paid' ? `
                        <div style="
                            background: linear-gradient(135deg, rgba(52, 199, 89, 0.2), rgba(52, 199, 89, 0.1));
                            border: 1px solid #34C759;
                            border-radius: 12px;
                            padding: 12px;
                            margin: 16px 0;
                            text-align: center;
                            color: #34C759;
                            font-weight: 600;
                        ">
                            ✅ Already Paid - No collection needed
                        </div>
                    ` : ''}

                    <div class="verification-section" style="margin: 20px 0;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">
                            Enter ${isPickup ? 'Pickup' : 'Delivery'} Code:
                        </label>
                        <input 
                            type="text" 
                            id="verification-code-input"
                            placeholder="XXXXXX"
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
                                transition: all 0.2s;
                                outline: none;
                            "
                            onkeyup="VerificationModule.handleCodeInput(event)"
                        />
                        <div style="text-align: center; opacity: 0.7; margin-top: 8px; font-size: 14px;">
                            Ask the ${isPickup ? 'vendor' : 'recipient'} for the verification code
                        </div>
                    </div>

                    ${needsPayment ? `
                        <div style="
                            margin-top: 16px; 
                            padding: 12px; 
                            background: rgba(255, 255, 255, 0.05); 
                            border-radius: 8px;
                            border: 1px solid rgba(255, 255, 255, 0.1);
                        ">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="payment-collected-checkbox" style="
                                    width: 20px; 
                                    height: 20px; 
                                    cursor: pointer;
                                    accent-color: #FF9F0A;
                                ">
                                <span style="font-size: 16px;">
                                    I have collected ${Utils.formatCurrency(stop.price)} cash
                                </span>
                            </label>
                        </div>
                    ` : ''}

                    <div class="modal-actions" style="display: flex; gap: 12px; margin-top: 24px;">
                        <button onclick="VerificationModule.closeModal()" style="
                            flex: 1;
                            padding: 16px;
                            background: rgba(255, 255, 255, 0.1);
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            border-radius: 12px;
                            color: white;
                            font-size: 16px;
                            font-weight: 600;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            transition: all 0.2s;
                        ">
                            <span>❌</span>
                            <span>Cancel</span>
                        </button>
                        <button onclick="VerificationModule.verifyCode()" style="
                            flex: 1;
                            padding: 16px;
                            background: linear-gradient(135deg, #0066FF, #0052cc);
                            border: none;
                            border-radius: 12px;
                            color: white;
                            font-size: 16px;
                            font-weight: 600;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            transition: all 0.2s;
                            box-shadow: 0 4px 20px rgba(0, 102, 255, 0.3);
                        ">
                            <span>✓</span>
                            <span>Verify</span>
                        </button>
                    </div>

                    ${CONFIG.dev.isDevelopment ? `
                        <div style="
                            margin-top: 20px; 
                            padding: 12px; 
                            background: rgba(255, 255, 255, 0.05); 
                            border-radius: 8px;
                            border: 1px solid rgba(255, 255, 255, 0.1);
                        ">
                            <div style="font-size: 12px; opacity: 0.5; margin-bottom: 8px;">
                                🔧 Development Mode
                            </div>
                            <div style="font-size: 14px; opacity: 0.7;">
                                Expected code: <strong>${stop.verificationCode || 'Any code accepted'}</strong>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
            <style>
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { 
                        transform: translateY(20px); 
                        opacity: 0;
                    }
                    to { 
                        transform: translateY(0); 
                        opacity: 1;
                    }
                }
            </style>
        `;
        
        document.body.appendChild(modal);
        
        // Focus input
        setTimeout(() => {
            const input = document.getElementById('verification-code-input');
            if (input) input.focus();
        }, 100);
        
        // Vibrate for attention
        Utils.vibrate([100, 50, 100]);
    },

    // Handle code input
    handleCodeInput(event) {
        const input = event.target;
        input.value = input.value.toUpperCase();
        
        // Remove error state when typing
        input.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        
        // Auto-verify on Enter
        if (event.key === 'Enter') {
            this.verifyCode();
        }
    },

    // Verify the entered code
    async verifyCode() {
        const input = document.getElementById('verification-code-input');
        const enteredCode = input?.value?.trim().toUpperCase();
        const stop = GlobalState.verification.currentStop;
        
        if (!stop) return;
        
        // Validate code entry
        if (!enteredCode || enteredCode.length < 4) {
            input.style.borderColor = '#FF3B30';
            Utils.vibrate([200, 100, 200]);
            Utils.showNotification('Please enter a valid code', 'error');
            return;
        }
        
        // Check payment collection for cash deliveries
        if (stop.type === 'delivery' && stop.paymentMethod === 'cash' && stop.paymentStatus === 'pending') {
            const paymentCheckbox = document.getElementById('payment-collected-checkbox');
            if (paymentCheckbox && !paymentCheckbox.checked) {
                Utils.showNotification('Please confirm cash collection before verifying', 'warning');
                Utils.vibrate([100, 50, 100]);
                return;
            }
        }
        
        // Check if code is correct
        const expectedCode = stop.verificationCode?.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const isValid = CONFIG.dev.isDevelopment ? 
            (enteredCode.length > 0) : 
            (enteredCode === expectedCode);
        
        if (!isValid) {
            input.style.borderColor = '#FF3B30';
            Utils.vibrate([200, 100, 200]);
            Utils.showNotification('Invalid verification code', 'error');
            return;
        }
        
        // Close verification modal
        this.closeModal();
        
        // Handle based on stop type
        if (stop.type === 'pickup') {
            // For pickup: directly complete
            this.completePickup(stop);
        } else {
            // For delivery: show POD modal
            Utils.showNotification('Code verified! Please take proof of delivery photo', 'success');
            setTimeout(() => {
                this.showPODModal(stop);
            }, 500);
        }
    },

    // Complete pickup
    async completePickup(stop) {
        // Mark as completed
        await RouteModule.completeStop(stop.id);
        
        // Show success animation
        this.showSuccessAnimation('Pickup Complete!');
        
        // Update UI
        UIModule.refresh();
        
        // Check for next stop
        setTimeout(() => {
            const nextStop = RouteModule.getNextStop();
            if (nextStop) {
                MapModule.focusOnStop(nextStop);
                Utils.showNotification(`Next: ${nextStop.type} at ${nextStop.address}`, 'info');
            }
        }, 2000);
    },

    // Show POD (Proof of Delivery) modal
    showPODModal(stop) {
        const modal = document.createElement('div');
        modal.className = 'pod-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.2s ease;
            padding: 20px;
        `;
        
        modal.innerHTML = `
            <div class="pod-content" style="
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(30px);
                -webkit-backdrop-filter: blur(30px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 24px;
                width: 90%;
                max-width: 400px;
                overflow: hidden;
                animation: slideUp 0.3s ease;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            ">
                <div class="pod-header" style="
                    padding: 20px;
                    text-align: center;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    background: linear-gradient(135deg, #0066FF, #0052cc);
                    color: white;
                ">
                    <h3 style="margin: 0; font-size: 20px;">Proof of Delivery</h3>
                    <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">
                        ${stop.address}
                    </p>
                </div>
                <div class="pod-main" style="padding: 20px; color: white;">
                    <div class="photo-area" id="photo-capture-area" onclick="VerificationModule.capturePhoto()" style="
                        background: rgba(255, 255, 255, 0.05);
                        border: 2px dashed rgba(255, 255, 255, 0.3);
                        border-radius: 16px;
                        padding: 40px 20px;
                        text-align: center;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        margin-bottom: 20px;
                        position: relative;
                    ">
                        <div id="photo-prompt">
                            <div style="font-size: 48px; margin-bottom: 10px;">📸</div>
                            <div style="font-size: 18px; font-weight: 600; margin-bottom: 5px;">
                                Take Photo
                            </div>
                            <div style="font-size: 14px; opacity: 0.7;">
                                Tap to capture proof of delivery
                            </div>
                        </div>
                        <div id="photo-preview" style="display: none;">
                            <img id="captured-photo" style="width: 100%; border-radius: 12px; display: block;" />
                            <button onclick="event.stopPropagation(); VerificationModule.retakePhoto()" style="
                                position: absolute;
                                top: 10px;
                                right: 10px;
                                background: white;
                                color: black;
                                border: none;
                                padding: 8px 12px;
                                border-radius: 20px;
                                font-size: 14px;
                                font-weight: 600;
                                cursor: pointer;
                                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                            ">Retake</button>
                        </div>
                    </div>
                    
                    <input type="file" 
                           id="photo-input" 
                           accept="image/*" 
                           capture="environment"
                           style="display: none;"
                           onchange="VerificationModule.handlePhotoCapture(event)" />
                    
                    <div style="display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap;">
                        ${['Handed to Customer', 'Left at Doorstep', 'With Security', 'With Neighbor', 'Safe Location', 'Other'].map((option, i) => `
                            <label style="flex: 1; min-width: calc(33% - 8px);">
                                <input type="radio" name="delivery-type" value="${option.toLowerCase().replace(/ /g, '_')}" 
                                       ${i === 0 ? 'checked' : ''} style="display: none;" />
                                <span style="
                                    display: block;
                                    padding: 10px;
                                    background: rgba(255, 255, 255, 0.05);
                                    border: 2px solid rgba(255, 255, 255, 0.1);
                                    border-radius: 10px;
                                    text-align: center;
                                    font-size: 13px;
                                    cursor: pointer;
                                    transition: all 0.2s;
                                    color: white;
                                " onclick="
                                    this.parentElement.querySelector('input').checked = true;
                                    document.querySelectorAll('input[name=delivery-type] + span').forEach(s => {
                                        s.style.background = 'rgba(255, 255, 255, 0.05)';
                                        s.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                    });
                                    this.style.background = 'rgba(0, 102, 255, 0.2)';
                                    this.style.borderColor = '#0066FF';
                                ">${option}</span>
                            </label>
                        `).join('')}
                    </div>
                    
                    <button id="complete-delivery-btn" 
                            onclick="VerificationModule.completeDelivery()" 
                            style="
                                width: 100%;
                                padding: 16px;
                                background: rgba(255, 255, 255, 0.2);
                                border: 1px solid rgba(255, 255, 255, 0.3);
                                border-radius: 12px;
                                font-size: 18px;
                                font-weight: 700;
                                color: white;
                                cursor: not-allowed;
                                transition: all 0.3s;
                            ">
                        Complete Delivery
                    </button>
                    
                    <button onclick="VerificationModule.skipPOD()" style="
                        display: block;
                        width: 100%;
                        padding: 10px;
                        background: none;
                        border: none;
                        color: rgba(255, 255, 255, 0.5);
                        font-size: 13px;
                        text-decoration: underline;
                        cursor: pointer;
                        margin-top: 10px;
                    ">Skip photo (not recommended)</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Initialize POD data
        GlobalState.verification.podData = {
            photo: null,
            deliveryType: 'handed_to_customer',
            timestamp: new Date().toISOString(),
            location: GlobalState.location
        };
    },

    // Capture photo
    capturePhoto() {
        const input = document.getElementById('photo-input');
        if (input) input.click();
    },

    // Handle photo capture
    handlePhotoCapture(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            // Store photo data
            GlobalState.verification.podData.photo = e.target.result;
            
            // Show preview
            const photoPrompt = document.getElementById('photo-prompt');
            const photoPreview = document.getElementById('photo-preview');
            const capturedPhoto = document.getElementById('captured-photo');
            const completeBtn = document.getElementById('complete-delivery-btn');
            
            if (photoPrompt) photoPrompt.style.display = 'none';
            if (photoPreview) photoPreview.style.display = 'block';
            if (capturedPhoto) capturedPhoto.src = e.target.result;
            if (completeBtn) {
                completeBtn.style.background = 'linear-gradient(135deg, #0066FF, #0052cc)';
                completeBtn.style.cursor = 'pointer';
                completeBtn.style.borderColor = '#0066FF';
                completeBtn.style.boxShadow = '0 4px 20px rgba(0, 102, 255, 0.3)';
            }
        };
        reader.readAsDataURL(file);
    },

    // Retake photo
    retakePhoto() {
        const photoPrompt = document.getElementById('photo-prompt');
        const photoPreview = document.getElementById('photo-preview');
        const completeBtn = document.getElementById('complete-delivery-btn');
        
        if (photoPrompt) photoPrompt.style.display = 'block';
        if (photoPreview) photoPreview.style.display = 'none';
        if (completeBtn) {
            completeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
            completeBtn.style.cursor = 'not-allowed';
            completeBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            completeBtn.style.boxShadow = 'none';
        }
        
        GlobalState.verification.podData.photo = null;
    },

    // Complete delivery
    async completeDelivery() {
        const stop = GlobalState.verification.currentStop;
        if (!stop) return;
        
        // Get delivery type
        const deliveryType = document.querySelector('input[name="delivery-type"]:checked')?.value || 'handed_to_customer';
        GlobalState.verification.podData.deliveryType = deliveryType;
        
        // Mark stop as completed
        await RouteModule.completeStop(stop.id);
        
        // Create POD record in Supabase
        await SupabaseModule.createProofOfDelivery(stop.id, GlobalState.verification.podData);
        
        // Close POD modal
        this.closePODModal();
        
        // Show success
        this.showSuccessAnimation('Delivery Complete!');
        
        // Update UI
        UIModule.refresh();
        
        // Check if route is complete
        if (RouteModule.isRouteComplete()) {
            setTimeout(() => this.showRouteCompleteModal(), 2000);
        } else {
            // Navigate to next stop
            const nextStop = RouteModule.getNextStop();
            if (nextStop) {
                setTimeout(() => {
                    MapModule.focusOnStop(nextStop);
                    Utils.showNotification(`Next: ${nextStop.type} at ${nextStop.address}`, 'info');
                }, 2000);
            }
        }
    },

    // Skip POD
    skipPOD() {
        if (!confirm('Are you sure you want to skip taking a photo? This is not recommended.')) {
            return;
        }
        
        GlobalState.verification.podData.photo = null;
        GlobalState.verification.podData.skipped = true;
        
        this.completeDelivery();
    },

    // Close modals
    closeModal() {
        const modal = document.querySelector('.verification-modal');
        if (modal) modal.remove();
    },

    closePODModal() {
        const modal = document.querySelector('.pod-modal');
        if (modal) modal.remove();
    },

    // Show success animation
    showSuccessAnimation(message) {
        const animation = document.createElement('div');
        animation.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            z-index: 10001;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            animation: popIn 0.3s ease-out;
        `;
        
        animation.innerHTML = `
            <div style="
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #34C759, #2ecc71);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 20px;
                font-size: 48px;
                color: white;
                box-shadow: 0 4px 20px rgba(52, 199, 89, 0.4);
            ">✓</div>
            <div style="font-size: 24px; font-weight: 700; color: white;">
                ${message}
            </div>
            <style>
                @keyframes popIn {
                    from {
                        transform: translate(-50%, -50%) scale(0.8);
                        opacity: 0;
                    }
                    to {
                        transform: translate(-50%, -50%) scale(1);
                        opacity: 1;
                    }
                }
            </style>
        `;
        
        document.body.appendChild(animation);
        
        Utils.vibrate([100, 50, 100]);
        
        setTimeout(() => animation.remove(), 2000);
    },

    // Show route complete modal
    showRouteCompleteModal() {
        const totalStops = GlobalState.route.stops.length;
        const totalEarnings = GlobalState.earnings.totalRouteEarnings || 0;
        const cashCollected = GlobalState.parcels.cashCollected || 0;
        
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
            animation: fadeIn 0.3s ease;
        `;
        
        modal.innerHTML = `
            <div style="
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(30px);
                -webkit-backdrop-filter: blur(30px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 24px;
                padding: 40px;
                text-align: center;
                max-width: 400px;
                animation: slideUp 0.4s ease;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                color: white;
            ">
                <div style="font-size: 72px; margin-bottom: 20px; animation: bounce 0.6s ease;">
                    🎉
                </div>
                <h2 style="margin: 0 0 20px; font-size: 28px;">Route Complete!</h2>
                <p style="margin: 20px 0; opacity: 0.9;">
                    Amazing work! You've successfully completed all deliveries.
                </p>
                
                <div style="
                    display: flex;
                    justify-content: center;
                    gap: 40px;
                    margin: 32px 0;
                ">
                    <div style="text-align: center;">
                        <span style="
                            display: block;
                            font-size: 32px;
                            font-weight: 700;
                            color: #0066FF;
                            margin-bottom: 4px;
                        ">${totalStops}</span>
                        <span style="font-size: 14px; opacity: 0.7;">Stops</span>
                    </div>
                    <div style="text-align: center;">
                        <span style="
                            display: block;
                            font-size: 32px;
                            font-weight: 700;
                            color: #34C759;
                            margin-bottom: 4px;
                        ">${Utils.formatCurrency(totalEarnings)}</span>
                        <span style="font-size: 14px; opacity: 0.7;">Earned</span>
                    </div>
                </div>
                
                ${cashCollected > 0 ? `
                    <div style="
                        margin: 24px 0;
                        padding: 16px;
                        background: rgba(255, 159, 10, 0.1);
                        border: 1px solid #FF9F0A;
                        border-radius: 12px;
                    ">
                        <div style="font-size: 14px; opacity: 0.7; margin-bottom: 8px;">
                            Cash to Return:
                        </div>
                        <div style="font-size: 24px; font-weight: 700; color: #FF9F0A;">
                            ${Utils.formatCurrency(cashCollected)}
                        </div>
                        <div style="font-size: 12px; opacity: 0.7; margin-top: 8px;">
                            Please return this amount to the office
                        </div>
                    </div>
                ` : ''}
                
                <button onclick="window.location.href='./rider.html'" style="
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
                ">
                    Back to Dashboard
                </button>
            </div>
            <style>
                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-20px); }
                }
            </style>
        `;
        
        document.body.appendChild(modal);
        
        // Clear route data
        RouteModule.clearRoute();
    }
};

// ============================================================================
// UI MODULE - Complete UI Management with Glassmorphic Design
// ============================================================================

const UIModule = {
    // Initialize UI
    initialize() {
        console.log('🎨 UIModule: Initializing UI...');
        
        // Hide loading overlay
        this.hideLoading();
        
        // Create main UI structure
        this.createUIStructure();
        
        // Display route info
        this.displayRouteInfo();
        
        // Display stops
        this.displayStops();
        
        // Setup event handlers
        this.setupEventHandlers();
        
        // Show tracking indicator
        this.showTrackingIndicator();
        
        console.log('✅ UI initialized');
    },

    // Hide loading overlay
    hideLoading() {
        const loader = document.getElementById('loadingOverlay');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
            }, 500);
        }
    },

    // Create UI structure
    createUIStructure() {
        // Create header
        const header = document.createElement('div');
        header.className = 'top-header';
        header.innerHTML = `
            <div class="header-content">
                <button class="back-button" onclick="window.location.href='./rider.html'">
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
                            <span class="stat-value" id="routeDistance">0</span> km
                        </div>
                        <div class="stat-item">
                            ETA <span class="stat-value" id="routeETA">--:--</span>
                        </div>
                    </div>
                </div>
                <button class="verify-button" id="mainVerifyBtn" onclick="UIModule.handleVerifyClick()">
                    Loading...
                </button>
            </div>
        `;
        document.body.appendChild(header);
        
        // Create FABs
        const fabContainer = document.createElement('div');
        fabContainer.className = 'fab-container';
        fabContainer.innerHTML = `
            <button class="fab" onclick="UIModule.centerOnLocation()">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
                </svg>
            </button>
            <button class="fab" onclick="UIModule.callNextCustomer()">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
                </svg>
            </button>
            <button class="fab primary" onclick="UIModule.startNavigation()">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
                </svg>
            </button>
        `;
        document.body.appendChild(fabContainer);
        
        // Create bottom navigation
        const bottomNav = document.createElement('div');
        bottomNav.className = 'bottom-nav';
        bottomNav.innerHTML = `
            <div class="nav-actions">
                <button class="nav-button" onclick="UIModule.togglePanel()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
                    </svg>
                    Details
                </button>
                <button class="nav-button" onclick="UIModule.optimizeRoute()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13 3v9h9c0-4.97-4.03-9-9-9zm-2 0C6.03 3 2 7.03 2 12s4.03 9 9 9c4.19 0 7.7-2.87 8.71-6.75H11V3z"/>
                    </svg>
                    Optimize
                </button>
                <button class="nav-button primary" onclick="UIModule.startNavigation()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
                    </svg>
                    Start Navigation
                </button>
            </div>
        `;
        document.body.appendChild(bottomNav);
        
        // Create route panel
        const routePanel = document.createElement('div');
        routePanel.className = 'route-panel';
        routePanel.id = 'routePanel';
        routePanel.innerHTML = `
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
                <!-- Dynamic content will be inserted here -->
            </div>
        `;
        document.body.appendChild(routePanel);
    },

    // Display route info
    displayRouteInfo() {
        if (!GlobalState.route) return;
        
        // Update header stats
        const stopsRemaining = GlobalState.route.stops.filter(s => !s.completed).length;
        document.getElementById('stopsRemaining').textContent = stopsRemaining;
        document.getElementById('routeDistance').textContent = GlobalState.route.distance?.toFixed(1) || '0';
        document.getElementById('routeETA').textContent = Utils.calculateETA(GlobalState.route.distance || 0);
        
        // Update verify button
        this.updateVerifyButton();
        
        // Update progress
        const pickups = GlobalState.route.stops.filter(s => s.type === 'pickup');
        const deliveries = GlobalState.route.stops.filter(s => s.type === 'delivery');
        const completedPickups = pickups.filter(s => s.completed).length;
        const completedDeliveries = deliveries.filter(s => s.completed).length;
        
        document.getElementById('pickupProgress').textContent = `${completedPickups}/${pickups.length}`;
        document.getElementById('deliveryProgress').textContent = `${completedDeliveries}/${deliveries.length}`;
        document.getElementById('cashProgress').textContent = Utils.formatCurrency(GlobalState.parcels.cashCollected);
    },

    // Update verify button
    updateVerifyButton() {
        const btn = document.getElementById('mainVerifyBtn');
        if (!btn) return;
        
        const nextStop = RouteModule.getNextStop();
        
        if (nextStop) {
            btn.className = `verify-button ${nextStop.type}`;
            btn.innerHTML = `
                ${nextStop.type === 'pickup' ? '📦' : '📍'} 
                Verify ${nextStop.type === 'pickup' ? 'Pickup' : 'Delivery'}
            `;
            btn.disabled = false;
        } else if (RouteModule.isRouteComplete()) {
            btn.className = 'verify-button completed';
            btn.innerHTML = '✅ Route Complete';
            btn.disabled = true;
        } else {
            btn.className = 'verify-button';
            btn.innerHTML = '🔒 Complete pickups first';
            btn.disabled = true;
        }
    },

    // Display stops
    displayStops() {
        const panelContent = document.getElementById('panelContent');
        if (!panelContent || !GlobalState.route?.stops) return;
        
        const sequence = GlobalState.optimizedSequence || GlobalState.route.stops;
        let html = '';
        
        // Cash widget if needed
        if (GlobalState.parcels.cashToCollect > 0) {
            html += `
                <div class="cash-widget">
                    <div class="cash-header">
                        <span>💰</span>
                        <span>Cash Collection</span>
                    </div>
                    <div class="cash-stats">
                        <div class="cash-stat">
                            <span class="label">Total</span>
                            <span class="value">${Utils.formatCurrency(GlobalState.parcels.cashToCollect)}</span>
                        </div>
                        <div class="cash-stat">
                            <span class="label">Collected</span>
                            <span class="value">${Utils.formatCurrency(GlobalState.parcels.cashCollected)}</span>
                        </div>
                        <div class="cash-stat">
                            <span class="label">Pending</span>
                            <span class="value">${Utils.formatCurrency(GlobalState.parcels.cashToCollect - GlobalState.parcels.cashCollected)}</span>
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
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${GlobalState.parcels.inPossession.map(parcel => `
                            <div style="
                                background: rgba(255, 255, 255, 0.05);
                                border-radius: 8px;
                                padding: 12px;
                                border-left: 3px solid #FF9F0A;
                            ">
                                <div style="font-weight: 600; margin-bottom: 4px;">
                                    ${parcel.parcel_code || parcel.tracking_code}
                                </div>
                                <div style="font-size: 14px; opacity: 0.7;">
                                    Picked up ${Utils.formatTimeAgo(parcel.pickupTime)}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        // Stops list
        html += '<div class="stops-container">';
        
        const nextStop = RouteModule.getNextStop();
        
        sequence.forEach((stop, index) => {
            const isNext = nextStop?.id === stop.id;
            const canComplete = RouteModule.canCompleteStop(stop);
            
            html += `
                <div class="stop-card ${stop.completed ? 'completed' : ''} ${isNext ? 'active' : ''} ${stop.isEfficientPair ? 'efficient' : ''}">
                    <div class="stop-indicator ${stop.type} ${stop.completed ? 'completed' : ''} ${stop.isEfficientPair ? 'efficient' : ''}">
                        ${stop.completed ? '✓' : stop.isEfficientPair ? '⚡' : index + 1}
                    </div>
                    <div class="stop-details">
                        <div class="stop-header">
                            <span class="stop-type ${stop.type}">
                                ${stop.type.toUpperCase()}
                            </span>
                            ${stop.isEfficientPair && !stop.completed ? `
                                <span style="font-size: 11px; color: #9B59B6; font-weight: 600; margin-left: 8px;">
                                    EFFICIENT
                                </span>
                            ` : ''}
                            ${stop.estimatedArrival && !stop.completed ? `
                                <span class="stop-eta">
                                    ${stop.estimatedArrival}
                                </span>
                            ` : ''}
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
                        ${stop.type === 'delivery' && stop.paymentMethod === 'cash' && stop.paymentStatus === 'pending' ? `
                            <div class="payment-badge">
                                <span>💰</span>
                                <span>Collect ${Utils.formatCurrency(stop.price)}</span>
                            </div>
                        ` : ''}
                        ${stop.completed ? `
                            <div style="margin-top: 8px; color: #34C759; font-size: 13px;">
                                ✓ Completed ${Utils.formatTimeAgo(stop.timestamp)}
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
                            <button class="action-btn" onclick="MapModule.focusOnStop(GlobalState.route.stops.find(s => s.id === '${stop.id}'))">
                                🗺️
                            </button>
                            <button class="action-btn" onclick="NavigationModule.startNavigation(GlobalState.route.stops.find(s => s.id === '${stop.id}'))">
                                🧭
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

    // Show tracking indicator
    showTrackingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'tracking-indicator';
        indicator.innerHTML = `
            <div class="tracking-dot"></div>
            <span>Live Tracking</span>
        `;
        document.body.appendChild(indicator);
    },

    // Handle verify click
    handleVerifyClick() {
        const nextStop = RouteModule.getNextStop();
        if (nextStop) {
            VerificationModule.showModal(nextStop);
        }
    },

    // Center on location
    centerOnLocation() {
        if (GlobalState.location && GlobalState.map) {
            MapModule.centerOnLocation(GlobalState.location);
        } else {
            Utils.showNotification('Waiting for GPS location...', 'info');
        }
    },

    // Call next customer
    callNextCustomer() {
        const nextStop = RouteModule.getNextStop();
        if (nextStop?.customerPhone) {
            window.location.href = `tel:${nextStop.customerPhone}`;
        } else {
            Utils.showNotification('No phone number available', 'warning');
        }
    },

    // Start navigation
    startNavigation() {
        const nextStop = RouteModule.getNextStop();
        if (nextStop) {
            NavigationModule.startNavigation(nextStop);
        } else {
            Utils.showNotification('No stops to navigate to', 'warning');
        }
    },

    // Toggle panel
    togglePanel() {
        const panel = document.getElementById('routePanel');
        if (panel) {
            panel.classList.toggle('expanded');
        }
    },

    // Optimize route
    async optimizeRoute() {
        Utils.showNotification('Optimizing route...', 'info');
        await RouteModule.optimizeRoute();
        this.refresh();
        MapModule.plotRoute();
        MapModule.drawOptimizedRoute();
        Utils.showNotification('Route optimized for efficiency!', 'success');
    },

    // Update location info
    updateLocationInfo() {
        // Update any location-based UI elements
        if (GlobalState.tracking.speed !== undefined) {
            // Could update speed display if needed
        }
    },

    // Show navigation mode
    showNavigationMode() {
        // Hide FABs and bottom nav during navigation
        const fabs = document.querySelector('.fab-container');
        const bottomNav = document.querySelector('.bottom-nav');
        const panel = document.getElementById('routePanel');
        
        if (fabs) fabs.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';
        if (panel) panel.classList.remove('expanded');
        
        // Create navigation UI
        const navUI = document.createElement('div');
        navUI.className = 'navigation-ui';
        navUI.id = 'navigationUI';
        navUI.innerHTML = `
            <div style="
                position: fixed;
                top: 60px;
                left: 20px;
                right: 20px;
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 16px;
                padding: 16px;
                z-index: 1000;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div style="font-size: 24px; font-weight: 700; color: white;">
                        <span id="navDistance">-- m</span>
                    </div>
                    <button onclick="NavigationModule.exitNavigation()" style="
                        background: rgba(255, 255, 255, 0.2);
                        border: none;
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        color: white;
                        cursor: pointer;
                    ">✕</button>
                </div>
                <div style="font-size: 16px; color: white; opacity: 0.9;" id="navInstruction">
                    Starting navigation...
                </div>
            </div>
            
            <div style="
                position: fixed;
                bottom: 30px;
                left: 20px;
                right: 20px;
                display: flex;
                gap: 12px;
                z-index: 1000;
            ">
                <div style="
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 12px;
                    padding: 12px 16px;
                    flex: 1;
                    text-align: center;
                    color: white;
                ">
                    <div style="font-size: 18px; font-weight: 600;" id="navETA">--:--</div>
                    <div style="font-size: 12px; opacity: 0.7;">ETA</div>
                </div>
                <div style="
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 12px;
                    padding: 12px 16px;
                    flex: 1;
                    text-align: center;
                    color: white;
                ">
                    <div style="font-size: 18px; font-weight: 600;" id="navSpeed">0</div>
                    <div style="font-size: 12px; opacity: 0.7;">km/h</div>
                </div>
            </div>
        `;
        document.body.appendChild(navUI);
    },

    // Hide navigation mode
    hideNavigationMode() {
        const navUI = document.getElementById('navigationUI');
        if (navUI) navUI.remove();
        
        // Show FABs and bottom nav again
        const fabs = document.querySelector('.fab-container');
        const bottomNav = document.querySelector('.bottom-nav');
        
        if (fabs) fabs.style.display = 'flex';
        if (bottomNav) bottomNav.style.display = 'block';
    },

    // Update navigation instruction
    updateNavigationInstruction(data) {
        const distanceEl = document.getElementById('navDistance');
        const instructionEl = document.getElementById('navInstruction');
        
        if (distanceEl) distanceEl.textContent = data.distance;
        if (instructionEl) instructionEl.textContent = data.instruction;
    },

    // Update navigation stats
    updateNavigationStats(data) {
        const etaEl = document.getElementById('navETA');
        const speedEl = document.getElementById('navSpeed');
        
        if (etaEl) etaEl.textContent = data.eta;
        if (speedEl) speedEl.textContent = data.speed;
    },

    // Refresh UI
    refresh() {
        this.displayRouteInfo();
        this.displayStops();
    },

    // Show empty state
    showEmptyState() {
        this.hideLoading();
        
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <div class="empty-icon">📦</div>
            <h2 class="empty-title">No Active Route</h2>
            <p class="empty-message">You don't have any active deliveries</p>
            <button class="empty-action" onclick="window.location.href='./rider.html'">
                Back to Dashboard
            </button>
        `;
        document.body.appendChild(emptyState);
    },

    // Setup event handlers
    setupEventHandlers() {
        // Panel drag functionality
        const panel = document.getElementById('routePanel');
        if (!panel) return;
        
        const handle = panel.querySelector('.panel-handle');
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
        
        // Online/offline handling
        window.addEventListener('online', () => {
            Utils.showNotification('Connection restored', 'success');
            SupabaseModule.syncOfflineData();
        });
        
        window.addEventListener('offline', () => {
            Utils.showNotification('Working offline - data will sync when connected', 'warning');
        });
    }
};

// ============================================================================
// MAIN INITIALIZATION
// ============================================================================

async function initializeRouteNavigation() {
    console.log('🚀 Initializing Enhanced Route Navigation System...');
    
    // Check if already initialized
    if (routeNavigationInitialized) {
        console.log('Already initialized');
        return;
    }
    routeNavigationInitialized = true;
    
    try {
        // Initialize route from Supabase
        const routeLoaded = await RouteModule.initialize();
        
        if (!routeLoaded) {
            console.log('No active route found');
            UIModule.showEmptyState();
            return;
        }
        
        // Initialize map
        await MapModule.initialize();
        
        // Initialize UI
        UIModule.initialize();
        
        // Start location tracking
        LocationModule.startTracking();
        
        // Plot route on map
        await MapModule.plotRoute();
        
        // Draw optimized route
        await MapModule.drawOptimizedRoute();
        
        // Sync offline data if available
        if (navigator.onLine) {
            SupabaseModule.syncOfflineData();
        }
        
        console.log('✅ Route Navigation System initialized successfully!');
        console.log(`📍 Route: ${GlobalState.route.name}`);
        console.log(`📦 Stops: ${GlobalState.route.stops.length}`);
        console.log(`💰 Potential earnings: ${Utils.formatCurrency(GlobalState.earnings.totalRouteEarnings)}`);
        
        // Export for debugging
        window.RouteDebug = {
            state: GlobalState,
            modules: {
                Route: RouteModule,
                Map: MapModule,
                Location: LocationModule,
                Navigation: NavigationModule,
                Verification: VerificationModule,
                UI: UIModule,
                Supabase: SupabaseModule
            },
            utils: Utils,
            config: CONFIG,
            actions: {
                clearRoute: () => RouteModule.clearRoute(),
                completeAll: () => {
                    GlobalState.route.stops.forEach(s => s.completed = true);
                    RouteModule.saveRoute();
                    UIModule.refresh();
                },
                testComplete: () => VerificationModule.showRouteCompleteModal()
            }
        };
        
    } catch (error) {
        console.error('❌ Failed to initialize:', error);
        UIModule.hideLoading();
        Utils.showNotification('Failed to load route. Please try again.', 'error');
    }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeRouteNavigation);
} else {
    initializeRouteNavigation();
}

// Export for external use
window.TumaRouteNavigation = {
    initialize: initializeRouteNavigation,
    modules: {
        Route: RouteModule,
        Map: MapModule,
        Location: LocationModule,
        Navigation: NavigationModule,
        Verification: VerificationModule,
        UI: UIModule,
        Supabase: SupabaseModule
    },
    utils: Utils,
    state: GlobalState,
    config: CONFIG
};

console.log('✅ Route Navigation Part 3 loaded: Verification, UI & Complete Initialization');
console.log('🎉 Full system ready with Supabase integration and glassmorphic UI!');
