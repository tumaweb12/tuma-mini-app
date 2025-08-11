/**
 * ENHANCED ROUTE NAVIGATION MODULE - MODULAR ARCHITECTURE
 * Part 1: Core Infrastructure, Route Management, and Map Module
 * All features preserved with proper separation of concerns
 */

// ============================================================================
// GLOBAL CONFIGURATION
// ============================================================================

const CONFIG = {
    api: {
        OPENROUTE_KEY: '5b3ce3597851110001cf624841e48578ffb34c6b96dfe3bbe9b3ad4c',
        SUPABASE_URL: 'https://btxavqfoirdzwpfrvezp.supabase.co',
        SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk'
    },
    business: {
        riderCommission: 0.70,
        platformCommission: 0.30
    },
    defaults: {
        nairobi: { lat: -1.2921, lng: 36.8219 }
    }
};

// ============================================================================
// GLOBAL STATE (Centralized)
// ============================================================================

const GlobalState = {
    route: null,
    map: null,
    markers: [],
    polylines: [],
    location: null,
    tracking: {
        watchId: null,
        isActive: false,
        heading: 0,
        speed: 0
    },
    navigation: {
        isActive: false,
        isFollowing: true,
        currentInstruction: null
    },
    ui: {
        panelVisible: false,
        panelExpanded: false
    },
    parcels: {
        inPossession: [],
        cashToCollect: 0,
        cashCollected: 0
    },
    verification: {
        currentStop: null,
        podData: null
    }
};

// ============================================================================
// UTILITY MODULE - Shared Functions
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
        
        // Handle string coordinates
        if (typeof locationData === 'string') {
            if (locationData.includes(',')) {
                const [lat, lng] = locationData.split(',').map(parseFloat);
                return { lat, lng };
            }
            try {
                const parsed = JSON.parse(locationData);
                return this.parseLocation(parsed);
            } catch {
                return CONFIG.defaults.nairobi;
            }
        }
        
        // Handle object coordinates
        if (typeof locationData === 'object') {
            return {
                lat: parseFloat(locationData.lat || locationData.latitude || -1.2921),
                lng: parseFloat(locationData.lng || locationData.lon || locationData.longitude || 36.8219)
            };
        }
        
        return CONFIG.defaults.nairobi;
    },

    // Parse price from various formats
    parsePrice(priceValue) {
        if (typeof priceValue === 'number') return priceValue;
        if (typeof priceValue === 'string') {
            const cleaned = priceValue.replace(/[^0-9.-]+/g, '');
            return parseFloat(cleaned) || 0;
        }
        return 0;
    },

    // Format time ago
    formatTimeAgo(timestamp) {
        if (!timestamp) return '';
        const minutes = Math.floor((Date.now() - new Date(timestamp)) / 60000);
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    },

    // Show notification
    showNotification(message, type = 'info') {
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
    },

    // Calculate bearing between two points
    calculateBearing(start, end) {
        const dLng = (end.lng - start.lng) * Math.PI / 180;
        const lat1 = start.lat * Math.PI / 180;
        const lat2 = end.lat * Math.PI / 180;
        
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - 
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        
        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    }
};

// ============================================================================
// ROUTE MODULE - Handles all route logic including dynamic optimization
// ============================================================================

const RouteModule = {
    // Initialize route from localStorage or session
    async initialize() {
        try {
            console.log('RouteModule: Initializing...');
            
            // Try to load route from localStorage
            const storedRoute = localStorage.getItem('tuma_active_route');
            if (!storedRoute) {
                console.log('RouteModule: No stored route found');
                return false;
            }

            // Parse and validate route
            const routeData = JSON.parse(storedRoute);
            if (!this.validateRoute(routeData)) {
                console.error('RouteModule: Invalid route data');
                return false;
            }

            // Normalize route data (handle different formats)
            const normalizedRoute = this.normalizeRoute(routeData);
            
            // Generate stops if needed
            if (!normalizedRoute.stops || normalizedRoute.stops.length === 0) {
                if (normalizedRoute.parcels && normalizedRoute.parcels.length > 0) {
                    console.log('RouteModule: Generating stops from parcels');
                    normalizedRoute.stops = this.generateOptimizedStops(normalizedRoute.parcels);
                } else {
                    console.error('RouteModule: No stops or parcels available');
                    return false;
                }
            }

            // Set global state
            GlobalState.route = normalizedRoute;
            console.log('RouteModule: Route loaded successfully', {
                id: normalizedRoute.id,
                stops: normalizedRoute.stops.length,
                parcels: normalizedRoute.parcels?.length
            });

            return true;
        } catch (error) {
            console.error('RouteModule: Initialization failed', error);
            return false;
        }
    },

    // Validate route structure
    validateRoute(routeData) {
        if (!routeData || typeof routeData !== 'object') return false;
        
        // Must have either stops or parcels
        const hasParcels = routeData.parcels?.length > 0 || 
                          routeData.parcelDetails?.length > 0 || 
                          routeData.packages?.length > 0;
        const hasStops = routeData.stops?.length > 0;
        
        return hasParcels || hasStops;
    },

    // Normalize route data to handle different formats
    normalizeRoute(routeData) {
        const normalized = {
            id: routeData.id || `route-${Date.now()}`,
            name: routeData.name || 'Active Route',
            stops: routeData.stops || [],
            parcels: routeData.parcels || routeData.parcelDetails || routeData.packages || [],
            distance: routeData.distance || 0,
            duration: routeData.duration || 0
        };

        // Ensure parcels is always named 'parcels'
        if (routeData.parcelDetails) normalized.parcels = routeData.parcelDetails;
        if (routeData.packages) normalized.parcels = routeData.packages;

        return normalized;
    },

    // DYNAMIC ROUTE OPTIMIZATION ALGORITHM
    generateOptimizedStops(parcels) {
        const stops = [];
        
        // First, create all pickup and delivery stops
        parcels.forEach(parcel => {
            // Parse locations
            const pickupLocation = Utils.parseLocation(
                parcel.pickup_coordinates || 
                parcel.pickup_location || 
                parcel.pickupCoordinates ||
                parcel.pickupLocation
            );
            
            const deliveryLocation = Utils.parseLocation(
                parcel.delivery_coordinates || 
                parcel.delivery_location ||
                parcel.deliveryCoordinates ||
                parcel.deliveryLocation
            );

            // Create pickup stop
            stops.push({
                id: `${parcel.id}-pickup`,
                parcelId: parcel.id,
                parcelCode: parcel.parcel_code || parcel.parcelCode || parcel.code || `P${parcel.id.slice(-6)}`,
                type: 'pickup',
                location: pickupLocation,
                address: parcel.pickup_address || parcel.pickupAddress || 'Pickup Location',
                verificationCode: parcel.pickup_code || parcel.pickupCode || 'PICKUP123',
                customerName: parcel.vendor_name || parcel.vendorName || parcel.sender_name || 'Vendor',
                customerPhone: parcel.vendor_phone || parcel.vendorPhone || parcel.sender_phone || '',
                price: Utils.parsePrice(parcel.price || parcel.amount || parcel.total_price || 0),
                completed: false,
                canComplete: true
            });

            // Create delivery stop
            stops.push({
                id: `${parcel.id}-delivery`,
                parcelId: parcel.id,
                parcelCode: parcel.parcel_code || parcel.parcelCode || parcel.code || `P${parcel.id.slice(-6)}`,
                type: 'delivery',
                location: deliveryLocation,
                address: parcel.delivery_address || parcel.deliveryAddress || 'Delivery Location',
                verificationCode: parcel.delivery_code || parcel.deliveryCode || 'DELIVER123',
                customerName: parcel.recipient_name || parcel.recipientName || parcel.receiver_name || 'Recipient',
                customerPhone: parcel.recipient_phone || parcel.recipientPhone || parcel.receiver_phone || '',
                price: Utils.parsePrice(parcel.price || parcel.amount || parcel.total_price || 0),
                paymentMethod: parcel.payment_method || parcel.paymentMethod || 'cash',
                paymentStatus: parcel.payment_status || parcel.paymentStatus || 'pending',
                completed: false,
                canComplete: false,
                dependsOn: `${parcel.id}-pickup`
            });
        });

        // Apply dynamic optimization
        return this.optimizeStopSequence(stops);
    },

    // Dynamic optimization algorithm (preserves your intelligent sequencing)
    optimizeStopSequence(stops) {
        const sequence = [];
        const visited = new Set();
        const pickedUp = new Set();
        
        // Start from current location or first pickup
        let currentPos = GlobalState.location || stops.find(s => s.type === 'pickup').location;
        
        while (visited.size < stops.length) {
            let bestNext = null;
            let bestScore = -Infinity;
            
            // Find candidates (pickups always allowed, deliveries only if picked up)
            const candidates = stops.filter(stop => {
                if (visited.has(stop.id)) return false;
                if (stop.type === 'pickup') return true;
                if (stop.type === 'delivery') return pickedUp.has(stop.parcelId);
                return false;
            });

            // Score each candidate
            for (const stop of candidates) {
                const distance = Utils.calculateDistance(currentPos, stop.location);
                let score = 100 - (distance * 10);
                
                // Prefer nearby deliveries
                if (stop.type === 'delivery' && distance < 1) {
                    score += 80;
                }
                
                // Group nearby pickups
                if (stop.type === 'pickup') {
                    const nearbyPickups = candidates.filter(c => 
                        c.type === 'pickup' && 
                        c.id !== stop.id &&
                        Utils.calculateDistance(stop.location, c.location) < 2
                    );
                    score += nearbyPickups.length * 20;
                }
                
                // Consider delivery after pickup proximity
                if (stop.type === 'delivery') {
                    const nextPickups = candidates.filter(c => c.type === 'pickup');
                    for (const pickup of nextPickups) {
                        const distToPickup = Utils.calculateDistance(stop.location, pickup.location);
                        if (distToPickup < 2) {
                            score += 40; // Deliver before going to nearby pickup
                        }
                    }
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestNext = stop;
                }
            }
            
            if (!bestNext) break;
            
            // Add to sequence
            sequence.push(bestNext);
            visited.add(bestNext.id);
            currentPos = bestNext.location;
            
            // Track pickups to enable deliveries
            if (bestNext.type === 'pickup') {
                pickedUp.add(bestNext.parcelId);
                // Enable the corresponding delivery
                const delivery = stops.find(s => 
                    s.type === 'delivery' && s.parcelId === bestNext.parcelId
                );
                if (delivery) delivery.canComplete = true;
            }
        }
        
        return sequence;
    },

    // Get next stop
    getNextStop() {
        if (!GlobalState.route?.stops) return null;
        return GlobalState.route.stops.find(stop => 
            !stop.completed && stop.canComplete !== false
        );
    },

    // Check if stop can be completed
    canCompleteStop(stop) {
        if (stop.type === 'pickup') return true;
        
        // For delivery, check if pickup is done
        const pickupStop = GlobalState.route.stops.find(s => 
            s.type === 'pickup' && s.parcelId === stop.parcelId
        );
        
        return pickupStop && pickupStop.completed;
    },

    // Mark stop as completed
    completeStop(stopId) {
        const stop = GlobalState.route.stops.find(s => s.id === stopId);
        if (!stop) return false;
        
        stop.completed = true;
        stop.timestamp = new Date();
        
        // Enable delivery if this was a pickup
        if (stop.type === 'pickup') {
            const delivery = GlobalState.route.stops.find(s => 
                s.type === 'delivery' && s.parcelId === stop.parcelId
            );
            if (delivery) delivery.canComplete = true;
        }
        
        // Save to localStorage
        this.saveRoute();
        
        return true;
    },

    // Save route to localStorage
    saveRoute() {
        if (GlobalState.route) {
            localStorage.setItem('tuma_active_route', JSON.stringify(GlobalState.route));
        }
    },

    // Check if route is complete
    isRouteComplete() {
        return GlobalState.route?.stops?.every(s => s.completed) || false;
    },

    // Clear route
    clearRoute() {
        GlobalState.route = null;
        localStorage.removeItem('tuma_active_route');
    }
};

// ============================================================================
// MAP MODULE - Handles all map operations
// ============================================================================

const MapModule = {
    // Initialize map (works independently of route)
    async initialize() {
        try {
            console.log('MapModule: Initializing...');
            
            // Wait for Leaflet
            await this.waitForLeaflet();
            
            // Get map container
            const mapContainer = document.getElementById('map');
            if (!mapContainer) {
                console.error('MapModule: Map container not found');
                return false;
            }

            // Clear container
            mapContainer.innerHTML = '';
            
            // Determine center
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

            // Add tile layer
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                subdomains: 'abcd'
            }).addTo(GlobalState.map);

            // Add controls
            L.control.zoom({ position: 'bottomleft' }).addTo(GlobalState.map);
            L.control.scale({ position: 'bottomleft', imperial: false }).addTo(GlobalState.map);

            // Force resize
            setTimeout(() => GlobalState.map.invalidateSize(), 100);

            console.log('MapModule: Map initialized successfully');
            return true;
        } catch (error) {
            console.error('MapModule: Initialization failed', error);
            return false;
        }
    },

    // Wait for Leaflet to load
    waitForLeaflet() {
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
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve();
                }, 10000);
            }
        });
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
        
        return { north, south, east, west };
    },

    // Plot route stops on map
    plotStops() {
        if (!GlobalState.map || !GlobalState.route?.stops) return;
        
        // Clear existing markers
        GlobalState.markers.forEach(marker => marker.remove());
        GlobalState.markers = [];
        
        const bounds = L.latLngBounds();
        
        // Add markers for each stop
        GlobalState.route.stops.forEach(stop => {
            const icon = this.createStopIcon(stop);
            const marker = L.marker([stop.location.lat, stop.location.lng], { icon })
                .addTo(GlobalState.map)
                .bindPopup(this.createStopPopup(stop));
            
            GlobalState.markers.push(marker);
            bounds.extend([stop.location.lat, stop.location.lng]);
        });
        
        // Fit map to bounds
        if (GlobalState.markers.length > 0) {
            GlobalState.map.fitBounds(bounds, { padding: [50, 50] });
        }
    },

    // Create stop icon
    createStopIcon(stop) {
        const isCompleted = stop.completed;
        const isNext = RouteModule.getNextStop()?.id === stop.id;
        const type = stop.type;
        
        const bgColor = isCompleted ? '#1C1C1F' : type === 'pickup' ? '#FF9F0A' : '#0066FF';
        const borderColor = isCompleted ? '#48484A' : '#FFFFFF';
        const symbol = isCompleted ? '✓' : type === 'pickup' ? 'P' : 'D';
        
        return L.divIcon({
            className: 'custom-marker',
            html: `
                <div class="stop-marker-wrapper ${isCompleted ? 'completed' : ''} ${isNext ? 'active' : ''}">
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
                        ${isNext ? '<div class="marker-pulse" style="position: absolute; width: 100%; height: 100%; border-radius: 50%; border: 2px solid #0066FF; animation: pulse 2s infinite;"></div>' : ''}
                    </div>
                </div>
            `,
            iconSize: [44, 44],
            iconAnchor: [22, 22],
            popupAnchor: [0, -22]
        });
    },

    // Create stop popup
    createStopPopup(stop) {
        const paymentInfo = PaymentModule.getPaymentInfoForStop(stop);
        
        return `
            <div class="stop-popup" style="min-width: 250px;">
                <div class="popup-header ${stop.type}" style="
                    background: ${stop.type === 'pickup' ? '#FF9F0A' : '#0066FF'};
                    color: ${stop.type === 'pickup' ? 'black' : 'white'};
                    padding: 12px;
                    margin: -14px -20px 12px -20px;
                    border-radius: 12px 12px 0 0;
                ">
                    <span style="font-weight: 600; font-size: 14px;">${stop.type.toUpperCase()}</span>
                    <span style="float: right; font-size: 12px;">${stop.parcelCode}</span>
                </div>
                <div class="popup-body" style="padding: 0;">
                    <h3 style="margin: 0 0 12px 0; font-size: 16px;">${stop.address}</h3>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span>👤</span>
                            <span>${stop.customerName}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span>📞</span>
                            <a href="tel:${stop.customerPhone}">${stop.customerPhone}</a>
                        </div>
                        ${paymentInfo.needsCollection ? `
                            <div style="
                                margin-top: 8px;
                                padding: 8px;
                                background: rgba(255, 159, 10, 0.1);
                                border-radius: 8px;
                                font-weight: 600;
                                color: #FF9F0A;
                            ">
                                💰 Collect: KES ${paymentInfo.amount.toLocaleString()}
                            </div>
                        ` : ''}
                    </div>
                    ${!stop.completed && RouteModule.canCompleteStop(stop) ? `
                        <div style="
                            display: flex;
                            gap: 8px;
                            margin-top: 12px;
                            padding-top: 12px;
                            border-top: 1px solid #eee;
                        ">
                            <button onclick="VerificationModule.openModal('${stop.id}')" style="
                                flex: 1;
                                padding: 8px;
                                background: #0066FF;
                                color: white;
                                border: none;
                                border-radius: 8px;
                                cursor: pointer;
                                font-weight: 600;
                            ">
                                ✓ Verify
                            </button>
                            <button onclick="NavigationModule.navigateToStop('${stop.id}')" style="
                                flex: 1;
                                padding: 8px;
                                background: #f0f0f0;
                                color: #333;
                                border: none;
                                border-radius: 8px;
                                cursor: pointer;
                                font-weight: 600;
                            ">
                                🧭 Navigate
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    // Draw route polyline
    async drawRoute() {
        if (!GlobalState.map || !GlobalState.route?.stops) return;
        
        // Clear existing polylines
        GlobalState.polylines.forEach(p => p.remove());
        GlobalState.polylines = [];
        
        const uncompletedStops = GlobalState.route.stops.filter(s => !s.completed);
        if (uncompletedStops.length < 2) return;
        
        try {
            // Get coordinates
            let coordinates = [];
            if (GlobalState.location && GlobalState.navigation.isActive) {
                coordinates.push([GlobalState.location.lng, GlobalState.location.lat]);
            }
            coordinates = coordinates.concat(
                uncompletedStops.map(s => [s.location.lng, s.location.lat])
            );
            
            // Try to get optimized route from API
            const routeData = await this.fetchOptimizedRoute(coordinates);
            
            if (routeData) {
                const polyline = L.polyline(routeData.coordinates, {
                    color: '#0066FF',
                    weight: 6,
                    opacity: 0.8,
                    smoothFactor: 1
                }).addTo(GlobalState.map);
                
                GlobalState.polylines.push(polyline);
            } else {
                // Fallback to simple line
                this.drawFallbackRoute(uncompletedStops);
            }
        } catch (error) {
            console.error('MapModule: Error drawing route', error);
            this.drawFallbackRoute(uncompletedStops);
        }
    },

    // Fetch optimized route from API
    async fetchOptimizedRoute(coordinates) {
        try {
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
            
            if (!response.ok) return null;
            
            const data = await response.json();
            if (data.routes && data.routes.length > 0) {
                return {
                    coordinates: this.decodePolyline(data.routes[0].geometry),
                    distance: (data.routes[0].summary.distance / 1000).toFixed(1),
                    duration: Math.round(data.routes[0].summary.duration / 60)
                };
            }
        } catch (error) {
            console.error('MapModule: API route fetch failed', error);
        }
        return null;
    },

    // Decode polyline from API
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

    // Draw fallback route
    drawFallbackRoute(stops) {
        const coords = stops.map(s => [s.location.lat, s.location.lng]);
        
        if (GlobalState.location) {
            coords.unshift([GlobalState.location.lat, GlobalState.location.lng]);
        }
        
        const polyline = L.polyline(coords, {
            color: '#0066FF',
            weight: 5,
            opacity: 0.7,
            dashArray: '10, 10',
            smoothFactor: 2
        }).addTo(GlobalState.map);
        
        GlobalState.polylines.push(polyline);
    },

    // Update current location marker
    updateLocationMarker() {
        if (!GlobalState.map || !GlobalState.location) return;
        
        if (!this.locationMarker) {
            const icon = L.divIcon({
                className: 'current-location-marker',
                html: `
                    <div class="location-marker-wrapper">
                        <div class="location-pulse"></div>
                        <div class="location-dot"></div>
                    </div>
                `,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });
            
            this.locationMarker = L.marker(
                [GlobalState.location.lat, GlobalState.location.lng],
                { icon }
            ).addTo(GlobalState.map);
        } else {
            this.locationMarker.setLatLng([GlobalState.location.lat, GlobalState.location.lng]);
        }
    }
};

// ============================================================================
// PAYMENT MODULE - Handles cash collection tracking
// ============================================================================

const PaymentModule = {
    // Initialize payment tracking
    initialize() {
        if (!GlobalState.route) return;
        
        this.calculateCashCollection();
        this.calculateEarnings();
    },

    // Calculate cash collection amounts
    calculateCashCollection() {
        GlobalState.parcels.cashToCollect = 0;
        GlobalState.parcels.cashCollected = 0;
        
        if (!GlobalState.route?.stops) return;
        
        GlobalState.route.stops.forEach(stop => {
            if (stop.type === 'delivery') {
                const paymentInfo = this.getPaymentInfoForStop(stop);
                
                if (paymentInfo.needsCollection) {
                    GlobalState.parcels.cashToCollect += paymentInfo.amount;
                    
                    if (stop.completed) {
                        GlobalState.parcels.cashCollected += paymentInfo.amount;
                    }
                }
            }
        });
        
        console.log('PaymentModule: Cash collection calculated', {
            toCollect: GlobalState.parcels.cashToCollect,
            collected: GlobalState.parcels.cashCollected
        });
    },

    // Get payment info for a stop
    getPaymentInfoForStop(stop) {
        if (!GlobalState.route?.parcels) {
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
        
        const amount = Utils.parsePrice(parcel.price || parcel.total_price || parcel.amount || 0);
        const method = parcel.payment_method || parcel.paymentMethod || 'cash';
        const status = parcel.payment_status || parcel.paymentStatus || 'pending';
        
        return {
            amount: amount,
            method: method,
            status: status,
            needsCollection: stop.type === 'delivery' && method === 'cash' && status === 'pending'
        };
    },

    // Calculate earnings
    calculateEarnings() {
        let totalEarnings = 0;
        
        if (GlobalState.route?.parcels) {
            GlobalState.route.parcels.forEach(parcel => {
                const price = Utils.parsePrice(parcel.price || parcel.total_price || parcel.amount || 0);
                totalEarnings += price * CONFIG.business.riderCommission;
            });
        }
        
        return totalEarnings;
    },

    // Update parcels in possession
    updateParcelsInPossession() {
        GlobalState.parcels.inPossession = [];
        
        if (!GlobalState.route?.stops) return;
        
        GlobalState.route.stops.forEach(stop => {
            if (stop.type === 'pickup' && stop.completed) {
                const deliveryStop = GlobalState.route.stops.find(s => 
                    s.type === 'delivery' && s.parcelId === stop.parcelId
                );
                
                if (deliveryStop && !deliveryStop.completed) {
                    GlobalState.parcels.inPossession.push({
                        parcelId: stop.parcelId,
                        parcelCode: stop.parcelCode,
                        pickupTime: stop.timestamp,
                        destination: deliveryStop.address
                    });
                }
            }
        });
    }
};
/**
 * ENHANCED ROUTE NAVIGATION MODULE - MODULAR ARCHITECTURE
 * Part 2: Verification, Navigation, UI Modules and Main Initialization
 * Includes POD, Waze-style navigation, and all UI components
 */

// ============================================================================
// VERIFICATION MODULE - Handles all verification including POD
// ============================================================================

const VerificationModule = {
    // Open verification modal
    openModal(stopId) {
        const stop = GlobalState.route?.stops?.find(s => s.id === stopId);
        if (!stop || stop.completed) return;
        
        const paymentInfo = PaymentModule.getPaymentInfoForStop(stop);
        
        const modal = document.createElement('div');
        modal.className = 'verification-modal';
        modal.innerHTML = `
            <div class="modal-overlay" onclick="VerificationModule.closeModal()"></div>
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
                    
                    ${stop.type === 'delivery' && paymentInfo.needsCollection ? `
                        <div class="payment-collection-alert" style="
                            background: linear-gradient(135deg, rgba(255, 159, 10, 0.2), rgba(255, 149, 0, 0.1));
                            border: 2px solid var(--warning);
                            border-radius: 12px;
                            padding: 16px;
                            margin: 16px 0;
                            text-align: center;
                        ">
                            <div style="font-size: 24px; margin-bottom: 8px;">💰</div>
                            <div style="font-size: 20px; font-weight: 700; color: var(--warning); margin-bottom: 4px;">
                                Collect KES ${paymentInfo.amount.toLocaleString()}
                            </div>
                            <div style="font-size: 14px; color: var(--text-secondary);">
                                Cash payment from customer
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="verification-section">
                        <label>Enter ${stop.type} verification code:</label>
                        <input type="text" 
                               class="verification-input" 
                               id="verificationCode" 
                               placeholder="Enter code"
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
                        <button class="modal-btn primary" onclick="VerificationModule.verifyCode('${stop.id}')">
                            <span>✓</span>
                            <span>Verify ${stop.type === 'pickup' ? 'Pickup' : 'Delivery'}</span>
                        </button>
                        <button class="modal-btn secondary" onclick="VerificationModule.closeModal()">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Focus input
        setTimeout(() => {
            const input = document.getElementById('verificationCode');
            if (input) {
                input.focus();
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.verifyCode(stop.id);
                    }
                });
            }
        }, 100);
    },

    // Close modal
    closeModal() {
        const modal = document.querySelector('.verification-modal');
        if (modal) modal.remove();
    },

    // Verify code
    async verifyCode(stopId) {
        const stop = GlobalState.route?.stops?.find(s => s.id === stopId);
        if (!stop) return;
        
        const codeInput = document.getElementById('verificationCode');
        const code = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const paymentInfo = PaymentModule.getPaymentInfoForStop(stop);
        
        // Validate code (accept any 4+ chars for testing)
        if (!code || code.length < 4) {
            codeInput.classList.add('error');
            Utils.showNotification('Please enter a valid code', 'error');
            return;
        }
        
        // Check payment collection for cash deliveries
        if (stop.type === 'delivery' && paymentInfo.needsCollection) {
            const paymentCheckbox = document.getElementById('paymentCollected');
            if (paymentCheckbox && !paymentCheckbox.checked) {
                Utils.showNotification('Please confirm cash collection before verifying', 'warning');
                return;
            }
        }
        
        // Close modal
        this.closeModal();
        
        // Handle pickup completion
        if (stop.type === 'pickup') {
            this.completePickup(stop);
        } else {
            // Show POD for delivery
            this.showPOD(stop);
        }
    },

    // Complete pickup
    completePickup(stop) {
        RouteModule.completeStop(stop.id);
        
        Utils.showNotification('Pickup completed!', 'success');
        this.showSuccessAnimation();
        
        // Update UI
        UIModule.updateAll();
        MapModule.plotStops();
        MapModule.drawRoute();
        
        // Navigate to next stop if in navigation mode
        const nextStop = RouteModule.getNextStop();
        if (nextStop && GlobalState.navigation.isActive) {
            NavigationModule.navigateToStop(nextStop.id);
        }
    },

    // Show POD (Proof of Delivery) modal
    showPOD(stop) {
        const modal = document.createElement('div');
        modal.className = 'pod-modal';
        modal.innerHTML = `
            <div class="pod-content">
                <div class="pod-header">
                    <h3>📸 Quick Photo Required</h3>
                    <p>${stop.address}</p>
                </div>
                
                <div class="pod-main">
                    <input type="file" 
                           id="podPhoto" 
                           accept="image/*" 
                           capture="environment"
                           style="display: none;"
                           onchange="VerificationModule.photoTaken(this, '${stop.id}')">
                    
                    <div id="photoArea" class="photo-area" onclick="document.getElementById('podPhoto').click()">
                        <div class="photo-prompt">
                            <div class="camera-icon">📷</div>
                            <div class="prompt-text">Tap to Take Photo</div>
                            <div class="prompt-hint">Photo of package at delivery location</div>
                        </div>
                    </div>
                    
                    <div class="delivery-options">
                        <label class="delivery-option">
                            <input type="radio" name="deliveryType" value="customer" checked>
                            <span>👤 Given to Customer</span>
                        </label>
                        <label class="delivery-option">
                            <input type="radio" name="deliveryType" value="door">
                            <span>🚪 Left at Door</span>
                        </label>
                        <label class="delivery-option">
                            <input type="radio" name="deliveryType" value="security">
                            <span>👮 With Security</span>
                        </label>
                    </div>
                    
                    <button id="completeDeliveryBtn" 
                            class="complete-btn" 
                            onclick="VerificationModule.completeDelivery('${stop.id}')"
                            disabled>
                        Complete Delivery
                    </button>
                    
                    <button class="skip-link" onclick="VerificationModule.skipPOD('${stop.id}')">
                        Skip photo (not recommended)
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Store POD data
        GlobalState.verification.podData = {
            stopId: stop.id,
            photo: null,
            deliveryType: 'customer',
            timestamp: new Date().toISOString()
        };
    },

    // Handle photo taken
    photoTaken(input, stopId) {
        const file = input.files[0];
        if (!file) return;
        
        GlobalState.verification.podData.photo = file;
        
        // Show preview
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('photoArea').innerHTML = `
                <img src="${e.target.result}" class="photo-preview">
                <button class="retake-btn" onclick="VerificationModule.retakePhoto()">↻ Retake</button>
            `;
            
            // Enable complete button
            document.getElementById('completeDeliveryBtn').disabled = false;
            document.getElementById('completeDeliveryBtn').classList.add('ready');
        };
        reader.readAsDataURL(file);
    },

    // Retake photo
    retakePhoto() {
        document.getElementById('podPhoto').value = '';
        document.getElementById('photoArea').innerHTML = `
            <div class="photo-prompt">
                <div class="camera-icon">📷</div>
                <div class="prompt-text">Tap to Take Photo</div>
                <div class="prompt-hint">Photo of package at delivery location</div>
            </div>
        `;
        document.getElementById('completeDeliveryBtn').disabled = true;
        document.getElementById('completeDeliveryBtn').classList.remove('ready');
        
        // Re-trigger camera
        setTimeout(() => {
            document.getElementById('podPhoto').click();
        }, 100);
    },

    // Complete delivery with POD
    async completeDelivery(stopId) {
        if (!GlobalState.verification.podData?.photo) return;
        
        const btn = document.getElementById('completeDeliveryBtn');
        btn.disabled = true;
        btn.innerHTML = '⏳ Completing...';
        
        try {
            // Get delivery type
            const deliveryType = document.querySelector('input[name="deliveryType"]:checked').value;
            GlobalState.verification.podData.deliveryType = deliveryType;
            
            // Complete the stop
            RouteModule.completeStop(stopId);
            
            // Update payment tracking
            const stop = GlobalState.route.stops.find(s => s.id === stopId);
            const paymentInfo = PaymentModule.getPaymentInfoForStop(stop);
            if (paymentInfo.needsCollection) {
                GlobalState.parcels.cashCollected += paymentInfo.amount;
            }
            
            // Close POD modal
            document.querySelector('.pod-modal').remove();
            
            // Show success
            Utils.showNotification('Delivery completed!', 'success');
            this.showSuccessAnimation();
            
            // Update UI
            UIModule.updateAll();
            MapModule.plotStops();
            MapModule.drawRoute();
            
            // Check if route complete
            if (RouteModule.isRouteComplete()) {
                this.showRouteComplete();
            } else {
                // Navigate to next stop
                const nextStop = RouteModule.getNextStop();
                if (nextStop && GlobalState.navigation.isActive) {
                    NavigationModule.navigateToStop(nextStop.id);
                }
            }
            
        } catch (error) {
            console.error('Error completing delivery:', error);
            btn.disabled = false;
            btn.innerHTML = 'Try Again';
            Utils.showNotification('Error completing delivery', 'error');
        }
    },

    // Skip POD
    skipPOD(stopId) {
        if (confirm('⚠️ Skipping photo is not recommended. Continue anyway?')) {
            RouteModule.completeStop(stopId);
            
            document.querySelector('.pod-modal').remove();
            
            Utils.showNotification('Delivery marked complete (no photo)', 'warning');
            
            UIModule.updateAll();
            MapModule.plotStops();
            MapModule.drawRoute();
            
            if (RouteModule.isRouteComplete()) {
                this.showRouteComplete();
            }
        }
    },

    // Show success animation
    showSuccessAnimation() {
        const animation = document.createElement('div');
        animation.className = 'success-animation';
        animation.innerHTML = `
            <div class="success-icon">✓</div>
        `;
        
        document.body.appendChild(animation);
        setTimeout(() => animation.remove(), 2000);
    },

    // Show route complete
    showRouteComplete() {
        const earnings = PaymentModule.calculateEarnings();
        const cashCollected = GlobalState.parcels.cashCollected;
        
        const modal = document.createElement('div');
        modal.className = 'route-complete-modal';
        modal.innerHTML = `
            <div class="route-complete-content">
                <div class="complete-icon">🏆</div>
                <h1>Route Complete!</h1>
                <p>Excellent work! All deliveries completed successfully.</p>
                <div class="route-stats">
                    <div class="stat">
                        <span class="stat-value">${GlobalState.route.stops.length}</span>
                        <span class="stat-label">Stops</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">KES ${Math.round(earnings).toLocaleString()}</span>
                        <span class="stat-label">Earned</span>
                    </div>
                    ${cashCollected > 0 ? `
                        <div class="stat">
                            <span class="stat-value">KES ${Math.round(cashCollected).toLocaleString()}</span>
                            <span class="stat-label">Cash Collected</span>
                        </div>
                    ` : ''}
                </div>
                <button class="complete-btn" onclick="window.location.href='./rider.html'">
                    Back to Dashboard
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Clear route data
        RouteModule.clearRoute();
    }
};

// ============================================================================
// NAVIGATION MODULE - Waze-style navigation
// ============================================================================

const NavigationModule = {
    // Navigate to a specific stop
    navigateToStop(stopId) {
        const stop = GlobalState.route?.stops?.find(s => s.id === stopId);
        if (!stop) return;
        
        GlobalState.navigation.isActive = true;
        GlobalState.navigation.isFollowing = true;
        
        // Hide regular UI
        const routePanel = document.getElementById('routePanel');
        if (routePanel) routePanel.style.display = 'none';
        
        // Show navigation UI
        this.showNavigationUI(stop);
        
        // Start location tracking
        LocationModule.startTracking();
        
        // Center map on current location or stop
        if (GlobalState.location) {
            GlobalState.map.setView([GlobalState.location.lat, GlobalState.location.lng], 17);
        } else {
            GlobalState.map.setView([stop.location.lat, stop.location.lng], 16);
        }
        
        // Draw route
        MapModule.drawRoute();
    },

    // Show navigation UI (Waze-style)
    showNavigationUI(targetStop) {
        const navUI = document.createElement('div');
        navUI.className = 'navigation-ui';
        navUI.innerHTML = `
            <!-- Top instruction bar -->
            <div class="nav-top-bar">
                <button class="nav-close-btn" onclick="NavigationModule.exitNavigation()">✕</button>
                
                <div class="nav-direction-icon">
                    <span class="direction-arrow">⬆️</span>
                </div>
                
                <div class="nav-instruction">
                    <div class="nav-distance">Starting...</div>
                    <div class="nav-street">Calculating route...</div>
                </div>
                
                <button class="nav-menu-btn" onclick="NavigationModule.toggleMenu()">⋮</button>
            </div>
            
            <!-- Bottom info pills -->
            <div class="nav-bottom-pills">
                <div class="nav-pill eta">
                    <span class="pill-icon">⏱</span>
                    <span class="pill-value">--:--</span>
                    <span class="pill-label">ETA</span>
                </div>
                
                <div class="nav-pill distance">
                    <span class="pill-icon">📍</span>
                    <span class="pill-value">-- km</span>
                    <span class="pill-label">left</span>
                </div>
                
                <div class="nav-pill speed">
                    <span class="pill-value">0</span>
                    <span class="pill-label">km/h</span>
                </div>
            </div>
            
            <!-- Navigation menu -->
            <div class="nav-menu" id="navMenu" style="display: none;">
                <button onclick="NavigationModule.toggleMenu(); UIModule.togglePanel();">📋 Route Details</button>
                <button onclick="NavigationModule.toggleFollowing()">🎯 Following: ON</button>
                <button onclick="VerificationModule.openModal('${targetStop.id}')">✓ Verify Stop</button>
                <button onclick="window.location.href='tel:${targetStop.customerPhone}'">📞 Call Customer</button>
            </div>
        `;
        
        document.body.appendChild(navUI);
        
        // Start updating navigation
        this.updateNavigation(targetStop);
    },

    // Update navigation info
    updateNavigation(targetStop) {
        if (!GlobalState.navigation.isActive) return;
        
        // Calculate distance to stop
        const distance = GlobalState.location ? 
            Utils.calculateDistance(GlobalState.location, targetStop.location) : 0;
        
        // Update distance pill
        const distancePill = document.querySelector('.nav-pill.distance .pill-value');
        if (distancePill) {
            distancePill.textContent = distance < 1 ? 
                `${Math.round(distance * 1000)} m` : 
                `${distance.toFixed(1)} km`;
        }
        
        // Update speed
        const speedPill = document.querySelector('.nav-pill.speed .pill-value');
        if (speedPill) {
            speedPill.textContent = GlobalState.tracking.speed || 0;
        }
        
        // Update ETA
        const etaPill = document.querySelector('.nav-pill.eta .pill-value');
        if (etaPill) {
            const eta = this.calculateETA(distance);
            etaPill.textContent = eta;
        }
        
        // Check if arrived
        if (distance < 0.05) {
            this.handleArrival(targetStop);
        } else {
            // Continue updating
            setTimeout(() => this.updateNavigation(targetStop), 2000);
        }
    },

    // Calculate ETA
    calculateETA(distance) {
        const avgSpeed = 30; // km/h
        const timeInMinutes = Math.round(distance / avgSpeed * 60);
        const now = new Date();
        const eta = new Date(now.getTime() + timeInMinutes * 60000);
        
        return eta.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    },

    // Handle arrival
    handleArrival(stop) {
        // Update UI
        const distanceEl = document.querySelector('.nav-distance');
        const streetEl = document.querySelector('.nav-street');
        
        if (distanceEl) distanceEl.textContent = 'Arrived';
        if (streetEl) streetEl.textContent = `${stop.type} location reached`;
        
        // Vibrate if available
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        
        // Show payment reminder if needed
        const paymentInfo = PaymentModule.getPaymentInfoForStop(stop);
        if (stop.type === 'delivery' && paymentInfo.needsCollection) {
            Utils.showNotification(
                `⚠️ Remember to collect KES ${paymentInfo.amount.toLocaleString()}`,
                'warning'
            );
        }
        
        Utils.showNotification(`Arrived at ${stop.type} location`, 'success');
        
        // Open verification after delay
        setTimeout(() => {
            VerificationModule.openModal(stop.id);
        }, 2000);
    },

    // Toggle menu
    toggleMenu() {
        const menu = document.getElementById('navMenu');
        if (menu) {
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        }
    },

    // Toggle following mode
    toggleFollowing() {
        GlobalState.navigation.isFollowing = !GlobalState.navigation.isFollowing;
        Utils.showNotification(
            GlobalState.navigation.isFollowing ? 'Following mode ON' : 'Following mode OFF',
            'info'
        );
    },

    // Exit navigation
    exitNavigation() {
        GlobalState.navigation.isActive = false;
        GlobalState.navigation.isFollowing = false;
        
        // Remove navigation UI
        const navUI = document.querySelector('.navigation-ui');
        if (navUI) navUI.remove();
        
        // Show regular UI
        const routePanel = document.getElementById('routePanel');
        if (routePanel) routePanel.style.display = 'block';
        
        // Reset map view
        if (GlobalState.map && GlobalState.route?.stops) {
            const bounds = MapModule.calculateBounds(GlobalState.route.stops);
            GlobalState.map.fitBounds([
                [bounds.south, bounds.west],
                [bounds.north, bounds.east]
            ], { padding: [50, 50] });
        }
    }
};

// ============================================================================
// LOCATION MODULE - Handles location tracking
// ============================================================================

const LocationModule = {
    // Start tracking location
    startTracking() {
        if (!navigator.geolocation) {
            Utils.showNotification('Location services not available', 'warning');
            return;
        }
        
        if (GlobalState.tracking.watchId) return; // Already tracking
        
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
        
        // Watch position
        GlobalState.tracking.watchId = navigator.geolocation.watchPosition(
            position => this.updateLocation(position),
            error => console.error('Location update error:', error),
            options
        );
        
        GlobalState.tracking.isActive = true;
    },

    // Update location
    updateLocation(position) {
        const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };
        
        // Update global state
        GlobalState.location = newLocation;
        
        // Update tracking info
        if (position.coords.heading !== null) {
            GlobalState.tracking.heading = position.coords.heading;
        }
        if (position.coords.speed !== null) {
            GlobalState.tracking.speed = Math.round(position.coords.speed * 3.6); // m/s to km/h
        }
        
        // Update map marker
        MapModule.updateLocationMarker();
        
        // Follow user if in navigation mode
        if (GlobalState.navigation.isActive && GlobalState.navigation.isFollowing) {
            GlobalState.map.panTo([newLocation.lat, newLocation.lng], {
                animate: true,
                duration: 1
            });
        }
    },

    // Stop tracking
    stopTracking() {
        if (GlobalState.tracking.watchId) {
            navigator.geolocation.clearWatch(GlobalState.tracking.watchId);
            GlobalState.tracking.watchId = null;
        }
        GlobalState.tracking.isActive = false;
    }
};

// ============================================================================
// UI MODULE - Handles all UI updates
// ============================================================================

const UIModule = {
    // Update all UI components
    updateAll() {
        this.updateHeader();
        this.updateStats();
        this.updateStopsList();
        this.updateCashWidget();
        PaymentModule.updateParcelsInPossession();
        this.updateParcelsWidget();
    },

    // Update header
    updateHeader() {
        const routeTitle = document.getElementById('routeTitle');
        const routeType = document.getElementById('routeType');
        
        if (!GlobalState.route) {
            if (routeTitle) routeTitle.textContent = 'No Active Route';
            if (routeType) {
                routeType.className = 'route-badge';
                routeType.innerHTML = 'No Route';
            }
            return;
        }
        
        if (routeTitle) {
            routeTitle.textContent = GlobalState.route.name || 'Route Navigation';
        }
        
        if (routeType) {
            const nextStop = RouteModule.getNextStop();
            if (nextStop) {
                routeType.className = `route-badge verify-btn ${nextStop.type}`;
                routeType.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                    <span>Verify ${nextStop.type === 'pickup' ? 'Pickup' : 'Delivery'}</span>
                `;
                routeType.onclick = () => VerificationModule.openModal(nextStop.id);
            } else {
                routeType.className = 'route-badge completed';
                routeType.innerHTML = 'Route Complete';
                routeType.onclick = null;
            }
        }
    },

    // Update stats
    updateStats() {
        if (!GlobalState.route) return;
        
        const remainingStops = GlobalState.route.stops.filter(s => !s.completed).length;
        const totalDistance = GlobalState.route.distance || 0;
        const estimatedTime = Math.round(totalDistance * 2.5 + remainingStops * 5);
        
        ['remainingStops', 'remainingStopsPanel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = remainingStops;
        });
        
        ['totalDistance', 'totalDistancePanel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = totalDistance;
        });
        
        ['estimatedTime', 'estimatedTimePanel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = estimatedTime;
        });
    },

    // Update stops list
    updateStopsList() {
        const stopsList = document.getElementById('stopsList');
        if (!stopsList || !GlobalState.route) return;
        
        let html = '';
        
        // Add parcels in possession widget if needed
        if (GlobalState.parcels.inPossession.length > 0) {
            html += this.createParcelsInPossessionWidget();
        }
        
        // Add cash widget container
        html += '<div id="cashWidgetContainer"></div>';
        
        // Add stops
        GlobalState.route.stops.forEach((stop, index) => {
            html += this.createStopCard(stop, index + 1);
        });
        
        stopsList.innerHTML = html;
    },

    // Create stop card
    createStopCard(stop, number) {
        const isNext = RouteModule.getNextStop()?.id === stop.id;
        const canInteract = !stop.completed && RouteModule.canCompleteStop(stop);
        const paymentInfo = PaymentModule.getPaymentInfoForStop(stop);
        
        return `
            <div class="stop-card ${stop.completed ? 'completed' : ''} ${isNext ? 'active' : ''}" 
                 onclick="${canInteract ? `UIModule.selectStop('${stop.id}')` : ''}"
                 data-stop-id="${stop.id}">
                <div class="stop-number-badge ${stop.type}">
                    ${stop.completed ? '✓' : number}
                </div>
                <div class="stop-content">
                    <h3 class="stop-address">${stop.address}</h3>
                    <div class="stop-details">
                        <div class="detail-row">
                            <span>${stop.type === 'pickup' ? '📦' : '📍'}</span>
                            <span>${stop.type === 'pickup' ? 'Pickup' : 'Delivery'}</span>
                        </div>
                        <div class="detail-row">
                            <span>👤</span>
                            <span>${stop.customerName}</span>
                        </div>
                        <div class="detail-row">
                            <span>📋</span>
                            <span>Code: ${stop.parcelCode}</span>
                        </div>
                    </div>
                    
                    ${stop.type === 'delivery' && paymentInfo.needsCollection ? `
                        <div class="payment-badge">
                            <span>💵</span>
                            <span>${stop.completed ? 'Collected' : 'COLLECT'}: KES ${paymentInfo.amount.toLocaleString()}</span>
                        </div>
                    ` : ''}
                    
                    ${stop.completed ? `
                        <div class="stop-status completed">
                            ✓ Completed ${Utils.formatTimeAgo(stop.timestamp)}
                        </div>
                    ` : isNext ? `
                        <div class="stop-status active">
                            → Current Stop
                        </div>
                    ` : !RouteModule.canCompleteStop(stop) ? `
                        <div class="stop-status blocked">
                            🔒 Complete pickup first
                        </div>
                    ` : ''}
                </div>
                <div class="stop-actions">
                    ${!stop.completed && canInteract ? `
                        <button onclick="event.stopPropagation(); NavigationModule.navigateToStop('${stop.id}')">
                            🧭
                        </button>
                        <a href="tel:${stop.customerPhone}" onclick="event.stopPropagation();">
                            📞
                        </a>
                    ` : ''}
                </div>
            </div>
        `;
    },

    // Create parcels in possession widget
    createParcelsInPossessionWidget() {
        return `
            <div class="parcels-widget">
                <div class="widget-header">
                    <span>📦</span>
                    <span>Carrying ${GlobalState.parcels.inPossession.length} parcel${GlobalState.parcels.inPossession.length > 1 ? 's' : ''}</span>
                </div>
                <div class="parcel-cards">
                    ${GlobalState.parcels.inPossession.map(parcel => {
                        const deliveryStop = GlobalState.route.stops.find(s => 
                            s.type === 'delivery' && s.parcelId === parcel.parcelId
                        );
                        const paymentInfo = deliveryStop ? PaymentModule.getPaymentInfoForStop(deliveryStop) : null;
                        
                        return `
                            <div class="parcel-card">
                                <div class="parcel-code">${parcel.parcelCode}</div>
                                <div class="parcel-destination">${parcel.destination}</div>
                                <div class="parcel-time">Picked up ${Utils.formatTimeAgo(parcel.pickupTime)}</div>
                                ${paymentInfo?.needsCollection ? `
                                    <div class="parcel-payment">
                                        💰 Collect: KES ${paymentInfo.amount.toLocaleString()}
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    },

    // Update parcels widget
    updateParcelsWidget() {
        // This is called after parcels in possession is updated
        // The widget will be recreated when stops list is updated
    },

    // Update cash collection widget
    updateCashWidget() {
        const container = document.getElementById('cashWidgetContainer');
        if (!container) return;
        
        PaymentModule.calculateCashCollection();
        
        const pendingAmount = GlobalState.parcels.cashToCollect - GlobalState.parcels.cashCollected;
        
        if (GlobalState.parcels.cashToCollect === 0) {
            container.innerHTML = '';
            return;
        }
        
        container.innerHTML = `
            <div class="cash-widget">
                <div class="cash-header">
                    <span>💰</span>
                    <span>Cash Collection</span>
                </div>
                <div class="cash-stats">
                    <div class="cash-stat">
                        <span class="label">Total</span>
                        <span class="value">KES ${GlobalState.parcels.cashToCollect.toLocaleString()}</span>
                    </div>
                    <div class="cash-stat">
                        <span class="label">Collected</span>
                        <span class="value">KES ${GlobalState.parcels.cashCollected.toLocaleString()}</span>
                    </div>
                    <div class="cash-stat">
                        <span class="label">Pending</span>
                        <span class="value">KES ${pendingAmount.toLocaleString()}</span>
                    </div>
                </div>
            </div>
        `;
    },

    // Select stop
    selectStop(stopId) {
        const stop = GlobalState.route?.stops?.find(s => s.id === stopId);
        if (!stop || stop.completed) return;
        
        if (GlobalState.map) {
            GlobalState.map.setView([stop.location.lat, stop.location.lng], 16);
            
            // Find and open marker popup
            const marker = GlobalState.markers.find(m => {
                const latLng = m.getLatLng();
                return Math.abs(latLng.lat - stop.location.lat) < 0.0001 && 
                       Math.abs(latLng.lng - stop.location.lng) < 0.0001;
            });
            
            if (marker) {
                marker.openPopup();
            }
        }
    },

    // Toggle panel
    togglePanel() {
        const routePanel = document.getElementById('routePanel');
        const navControls = document.getElementById('navControls');
        
        if (!routePanel) return;
        
        GlobalState.ui.panelVisible = !GlobalState.ui.panelVisible;
        
        if (GlobalState.ui.panelVisible) {
            routePanel.style.display = 'block';
            if (navControls) {
                navControls.style.bottom = 'calc(60% + 20px + var(--safe-area-bottom))';
            }
        } else {
            routePanel.style.display = 'none';
            if (navControls) {
                navControls.style.bottom = 'calc(30px + var(--safe-area-bottom))';
            }
        }
        
        // Resize map
        if (GlobalState.map) {
            setTimeout(() => GlobalState.map.invalidateSize(), 300);
        }
    }
};

// ============================================================================
// MAIN INITIALIZATION - Orchestrates all modules
// ============================================================================

async function initializeApp() {
    console.log('🚀 Starting Enhanced Route Navigation...');
    
    try {
        // Step 1: Initialize route
        const routeLoaded = await RouteModule.initialize();
        
        if (!routeLoaded) {
            console.log('No route available');
            showNoRouteState();
            // Still initialize map for visual feedback
            await MapModule.initialize();
            return;
        }
        
        // Step 2: Initialize map
        const mapInitialized = await MapModule.initialize();
        
        if (!mapInitialized) {
            console.error('Failed to initialize map');
            Utils.showNotification('Map initialization failed', 'error');
            return;
        }
        
        // Step 3: Initialize payment tracking
        PaymentModule.initialize();
        
        // Step 4: Plot route on map
        MapModule.plotStops();
        MapModule.drawRoute();
        
        // Step 5: Update UI
        UIModule.updateAll();
        
        // Step 6: Show UI elements
        showUIElements();
        
        // Step 7: Start location tracking
        LocationModule.startTracking();
        
        console.log('✅ Initialization complete!');
        console.log('Route:', {
            id: GlobalState.route.id,
            stops: GlobalState.route.stops.length,
            cashToCollect: GlobalState.parcels.cashToCollect
        });
        
    } catch (error) {
        console.error('❌ Fatal initialization error:', error);
        Utils.showNotification('Failed to initialize route', 'error');
        showErrorState(error.message);
    }
}

// Show no route state
function showNoRouteState() {
    const routePanel = document.getElementById('routePanel');
    const navControls = document.getElementById('navControls');
    const emptyState = document.getElementById('emptyState');
    
    if (routePanel) routePanel.style.display = 'none';
    if (navControls) navControls.style.display = 'none';
    if (emptyState) {
        emptyState.style.display = 'block';
        emptyState.innerHTML = `
            <div class="empty-content">
                <div class="empty-icon">📦</div>
                <h2>No Active Route</h2>
                <p>You don't have any active routes at the moment.</p>
                <button onclick="window.location.href='./rider.html'">
                    Back to Dashboard
                </button>
            </div>
        `;
    }
}

// Show UI elements
function showUIElements() {
    const routePanel = document.getElementById('routePanel');
    const navControls = document.getElementById('navControls');
    const emptyState = document.getElementById('emptyState');
    
    if (emptyState) emptyState.style.display = 'none';
    
    if (routePanel) {
        routePanel.style.display = 'none'; // Start hidden
        GlobalState.ui.panelVisible = false;
    }
    
    if (navControls) {
        navControls.style.display = 'flex';
        navControls.style.bottom = 'calc(30px + var(--safe-area-bottom))';
    }
}

// Show error state
function showErrorState(message) {
    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
        emptyState.style.display = 'block';
        emptyState.innerHTML = `
            <div class="error-content">
                <div class="error-icon">⚠️</div>
                <h2>Error Loading Route</h2>
                <p>${message}</p>
                <button onclick="location.reload()">Try Again</button>
                <button onclick="window.location.href='./rider.html'">Back to Dashboard</button>
            </div>
        `;
    }
}

// ============================================================================
// GLOBAL WINDOW FUNCTIONS - Exposed for HTML onclick handlers
// ============================================================================

window.goBack = function() {
    if (confirm('Are you sure you want to leave this route?')) {
        window.location.href = './rider.html';
    }
};

window.toggleRoutePanel = function() {
    UIModule.togglePanel();
};

window.startNavigation = function() {
    const nextStop = RouteModule.getNextStop();
    if (nextStop) {
        NavigationModule.navigateToStop(nextStop.id);
    } else {
        Utils.showNotification('No stops to navigate to', 'warning');
    }
};

window.centerOnLocation = function() {
    if (GlobalState.location && GlobalState.map) {
        GlobalState.map.setView([GlobalState.location.lat, GlobalState.location.lng], 16);
        Utils.showNotification('Centered on your location', 'info');
    } else {
        Utils.showNotification('Getting your location...', 'info');
        LocationModule.startTracking();
    }
};

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

window.RouteDebug = {
    // State inspection
    getState: () => GlobalState,
    getRoute: () => GlobalState.route,
    
    // Module access
    modules: {
        Route: RouteModule,
        Map: MapModule,
        Payment: PaymentModule,
        Verification: VerificationModule,
        Navigation: NavigationModule,
        Location: LocationModule,
        UI: UIModule
    },
    
    // Test functions
    createTestRoute: () => {
        const testRoute = {
            id: 'test-route-' + Date.now(),
            name: 'Test Route - Nairobi',
            parcels: [
                {
                    id: 'parcel-001',
                    parcel_code: 'TM123456',
                    pickup_address: 'Westlands, Nairobi',
                    pickup_coordinates: { lat: -1.2635, lng: 36.8021 },
                    pickup_code: 'PICKUP1',
                    delivery_address: 'Kilimani, Nairobi',
                    delivery_coordinates: { lat: -1.2898, lng: 36.7876 },
                    delivery_code: 'DELIVER1',
                    vendor_name: 'Test Vendor',
                    vendor_phone: '0712345678',
                    recipient_name: 'Test Customer',
                    recipient_phone: '0723456789',
                    price: 500,
                    payment_method: 'cash',
                    payment_status: 'pending'
                },
                {
                    id: 'parcel-002',
                    parcel_code: 'TM789012',
                    pickup_address: 'Karen, Nairobi',
                    pickup_coordinates: { lat: -1.3191, lng: 36.7093 },
                    pickup_code: 'PICKUP2',
                    delivery_address: 'Lavington, Nairobi',
                    delivery_coordinates: { lat: -1.2804, lng: 36.7754 },
                    delivery_code: 'DELIVER2',
                    vendor_name: 'Another Vendor',
                    vendor_phone: '0722334455',
                    recipient_name: 'Another Customer',
                    recipient_phone: '0733445566',
                    price: 750,
                    payment_method: 'online',
                    payment_status: 'paid'
                }
            ]
        };
        
        localStorage.setItem('tuma_active_route', JSON.stringify(testRoute));
        location.reload();
    },
    
    clearRoute: () => {
        RouteModule.clearRoute();
        location.reload();
    },
    
    completeNextStop: () => {
        const nextStop = RouteModule.getNextStop();
        if (nextStop) {
            RouteModule.completeStop(nextStop.id);
            UIModule.updateAll();
            MapModule.plotStops();
            MapModule.drawRoute();
        }
    },
    
    resetStops: () => {
        if (GlobalState.route?.stops) {
            GlobalState.route.stops.forEach(stop => {
                stop.completed = false;
                stop.timestamp = null;
                if (stop.type === 'delivery') {
                    stop.canComplete = false;
                }
            });
            RouteModule.saveRoute();
            location.reload();
        }
    }
};

// ============================================================================
// START APPLICATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    initializeApp();
});

console.log('✅ Enhanced Route Navigation Module loaded');
console.log('📦 All features preserved with modular architecture');
console.log('🛠️ Debug: window.RouteDebug');
console.log('🚀 Features: Dynamic optimization, POD, Cash tracking, Waze navigation');
