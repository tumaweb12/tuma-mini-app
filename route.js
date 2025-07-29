/**
 * Complete Enhanced Route Navigation Module with OpenRouteService
 * Fixed version with all requested improvements including Waze-style navigation
 * FIXED: Map visibility issue during navigation with drone-like following
 * Part 1: Core logic and map functions
 */

// Development Configuration (same as in rider.js)
const DEV_CONFIG = {
    // Set to true when testing locally without Telegram
    isDevelopment: window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1' ||
                   window.location.hostname.includes('github.io'),
    
    // Test rider configuration (only used in development)
    testRider: {
        id: 'ef5438ef-0cc0-4e35-8d1b-be18dbce7fe4', // Bobby G's test ID
        name: 'Bobby G',
        phone: '0725046880'
    },
    
    // Whether to show detailed console logs
    verboseLogging: true,
    
    // Whether to ignore API errors for missing riders
    ignoreRiderNotFound: true
};

// Configuration for navigation behavior
const config = {
    headingUp: false, // Set to true for heading-up mode, false for north-up
    smoothMovement: true,
    autoZoom: true
};

// State management with enhanced properties for navigation
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
    navigationActive: false,
    currentSpeed: 0,
    // New properties for enhanced navigation
    currentHeading: 0,
    isFollowingUser: true,
    lastMapRotation: 0,
    smoothLocationInterval: null,
    mapBearing: 0,
    config: config,
    locationWatchId: null,
    accuracyCircle: null
};

// API Configuration
const OPENROUTE_API_KEY = '5b3ce3597851110001cf624841e48578ffb34c6b96dfe3bbe9b3ad4c';
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

// CSS injection function for navigation styles
function injectNavigationStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* CRITICAL: Ensure navigation doesn't block map */
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
        .waze-nav-menu {
            pointer-events: auto !important;
        }
        
        /* Ensure map remains visible */
        #map {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            z-index: 1 !important;
        }
        
        .map-container {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            z-index: 1 !important;
        }
        
        /* Rider location marker styles */
        .rider-location-marker {
            z-index: 1000 !important;
        }
        
        .rider-marker-container {
            position: relative;
            width: 30px;
            height: 30px;
            transition: transform 0.3s ease;
        }
        
        .rider-arrow {
            position: absolute;
            top: -5px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-bottom: 15px solid #0066FF;
            z-index: 2;
        }
        
        .rider-dot {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 20px;
            height: 20px;
            background: #0066FF;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            z-index: 1;
        }
        
        /* Hide Leaflet rotation control if visible */
        .leaflet-control-rotate {
            display: none !important;
        }
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
    console.log('Route.js initializing with Waze-style navigation...');
    
    // Inject navigation styles first
    injectNavigationStyles();
    
    // Add Waze navigation styles
    addWazeNavigationStyles();
    
    // Wait for Leaflet to load
    await waitForLeaflet();
    
    try {
        // Load active route from localStorage
        const storedRoute = localStorage.getItem('tuma_active_route');
        console.log('Stored route data:', storedRoute);
        
        if (storedRoute) {
            state.activeRoute = JSON.parse(storedRoute);
            console.log('Parsed route:', state.activeRoute);
            
            // Initialize map
            await initializeMap();
            
            // Display route information
            displayRouteInfo();
            
            // Update dynamic header
            updateDynamicHeader();
            
            // Plot route on map
            await plotRoute();
            
            // Draw optimized route line on initial load
            await drawOptimizedRoute();
            
            // Show route panel
            showRoutePanel();
            
            // Enhance route panel
            enhanceRoutePanel();
            
            // Start location tracking
            startLocationTracking();
            
            // Auto-collapse panel after 2 seconds
            setTimeout(() => {
                collapsePanel();
            }, 2000);
        } else {
            console.log('No active route found');
            showEmptyState();
        }
    } catch (error) {
        console.error('Error initializing route:', error);
        showEmptyState();
    }
});

// Initialize Leaflet Map with Waze-style view
async function initializeMap() {
    console.log('Initializing Leaflet map with Waze-style view...');
    
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.error('Map container not found!');
        return;
    }
    
    // Force proper dimensions
    mapContainer.style.width = '100%';
    mapContainer.style.height = '100%';
    
    // Get center point from route or use Nairobi default
    let centerLat = -1.2921;
    let centerLng = 36.8219;
    
    if (state.activeRoute && state.activeRoute.stops && state.activeRoute.stops.length > 0) {
        const bounds = calculateBounds(state.activeRoute.stops);
        centerLat = (bounds.north + bounds.south) / 2;
        centerLng = (bounds.east + bounds.west) / 2;
    }
    
    // Create map with options for smooth movement
    state.map = L.map('map', {
        center: [centerLat, centerLng],
        zoom: 17, // Closer zoom for navigation
        zoomControl: false,
        rotate: true, // Enable rotation
        bearing: 0, // Initial bearing
        touchRotate: true, // Allow touch rotation
        rotateControl: false, // Hide rotation control
        attributionControl: false // Hide attribution for cleaner look
    });
    
    // Use a cleaner tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(state.map);
    
    // Add zoom control in bottom left
    L.control.zoom({
        position: 'bottomleft'
    }).addTo(state.map);
    
    // Add scale control
    L.control.scale({
        position: 'bottomleft',
        imperial: false
    }).addTo(state.map);
    
    // Force a resize
    setTimeout(() => {
        state.map.invalidateSize();
    }, 100);
    
    console.log('Map initialized with Waze-style settings');
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

// Update dynamic header based on current navigation state
function updateDynamicHeader() {
    const routeTitle = document.getElementById('routeTitle');
    if (!routeTitle || !state.activeRoute) return;
    
    const nextStop = getNextStop();
    const currentStop = getCurrentStop();
    
    if (!nextStop) {
        routeTitle.textContent = 'Route Complete';
        return;
    }
    
    // Determine header text based on navigation state
    let headerText = '';
    
    if (currentStop && state.currentLocation) {
        // Currently navigating from current location to next stop
        headerText = `Your Location → ${getStopShortName(nextStop)}`;
    } else if (currentStop) {
        // Show from current stop to next stop
        headerText = `${getStopShortName(currentStop)} → ${getStopShortName(nextStop)}`;
    } else {
        // Starting navigation
        const firstStop = state.activeRoute.stops[0];
        headerText = `Starting → ${getStopShortName(firstStop)}`;
    }
    
    routeTitle.textContent = headerText;
}

// Get short name for a stop
function getStopShortName(stop) {
    if (!stop) return '';
    
    // Try to extract key location name from address
    const address = stop.address;
    
    // Common patterns to extract location names
    const patterns = [
        /^([^,]+),/, // First part before comma
        /^(.+?)(?:\s+Road|\s+Street|\s+Avenue|\s+Drive|\s+Centre|\s+Center)/i // Location before road type
    ];
    
    for (const pattern of patterns) {
        const match = address.match(pattern);
        if (match) {
            return match[1].trim();
        }
    }
    
    // Fallback to first 20 characters
    return address.length > 20 ? address.substring(0, 20) + '...' : address;
}

// Get current stop (last completed pickup if in delivery phase)
function getCurrentStop() {
    if (!state.activeRoute) return null;
    
    const completedStops = state.activeRoute.stops.filter(s => s.completed);
    if (completedStops.length === 0) return null;
    
    // Return last completed stop
    return completedStops[completedStops.length - 1];
}

// Helper function to create rider icon with heading
function createRiderIcon(heading = 0) {
    return L.divIcon({
        className: 'rider-location-marker',
        html: `
            <div class="rider-marker-container" style="transform: rotate(${heading}deg)">
                <div class="rider-arrow"></div>
                <div class="rider-dot"></div>
            </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

// Calculate zoom level based on speed
function calculateZoomFromSpeed(speed) {
    // Adjust zoom based on speed for better visibility
    if (speed > 60) return 15;      // Highway speed
    if (speed > 40) return 16;      // Normal driving
    if (speed > 20) return 17;      // City driving
    if (speed > 5) return 18;       // Slow/walking
    return 18;                      // Stationary
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

// Update current location with enhanced tracking
function updateCurrentLocation(position) {
    const newLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
    };
    
    // Smooth out location updates
    if (state.currentLocation) {
        // Calculate distance moved
        const distance = calculateDistance(state.currentLocation, newLocation);
        
        // Ignore if moved less than 5 meters (GPS jitter)
        if (distance < 0.005) return;
    }
    
    state.currentLocation = newLocation;
    
    // Update heading if available
    if (position.coords.heading !== null && position.coords.heading !== undefined) {
        state.currentHeading = position.coords.heading;
    } else if (state.lastLocation) {
        // Calculate heading from movement
        state.currentHeading = calculateBearing(state.lastLocation, state.currentLocation);
    }
    
    // Update speed
    if (position.coords.speed !== null) {
        state.currentSpeed = Math.round(position.coords.speed * 3.6); // m/s to km/h
    }
    
    // Update map
    if (state.map) {
        // Create or update rider marker
        if (!state.currentLocationMarker) {
            const riderIcon = createRiderIcon(state.currentHeading);
            state.currentLocationMarker = L.marker(
                [state.currentLocation.lat, state.currentLocation.lng],
                { 
                    icon: riderIcon,
                    rotationAngle: 0,
                    zIndexOffset: 1000
                }
            ).addTo(state.map);
            
            // Add accuracy circle
            state.accuracyCircle = L.circle([state.currentLocation.lat, state.currentLocation.lng], {
                radius: position.coords.accuracy,
                fillColor: '#0066FF',
                fillOpacity: 0.1,
                color: '#0066FF',
                weight: 1,
                interactive: false
            }).addTo(state.map);
        } else {
            // Update marker position smoothly
            state.currentLocationMarker.setLatLng([state.currentLocation.lat, state.currentLocation.lng]);
            
            // Update icon rotation
            const riderIcon = createRiderIcon(state.currentHeading);
            state.currentLocationMarker.setIcon(riderIcon);
            
            // Update accuracy circle
            if (state.accuracyCircle) {
                state.accuracyCircle.setLatLng([state.currentLocation.lat, state.currentLocation.lng]);
                state.accuracyCircle.setRadius(position.coords.accuracy);
            }
        }
        
        // Drone follow mode when navigating
        if (state.navigationActive && state.isFollowingUser) {
            // Smooth map movement to follow user
            state.map.panTo([state.currentLocation.lat, state.currentLocation.lng], {
                animate: true,
                duration: 1,
                noMoveStart: true
            });
            
            // Rotate map based on heading (North up for now, can be changed to heading up)
            if (state.currentHeading !== null && state.config?.headingUp) {
                const rotation = 360 - state.currentHeading;
                if (Math.abs(rotation - state.lastMapRotation) > 5) {
                    state.map.setBearing(rotation);
                    state.lastMapRotation = rotation;
                }
            }
            
            // Adjust zoom based on speed
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
    
    // Update navigation if active
    if (state.navigationActive) {
        updateNavigationInfo();
    }
    
    // Update dynamic header when location changes
    updateDynamicHeader();
}

// Update navigation info (placeholder for navigation updates)
function updateNavigationInfo() {
    // This will be called during navigation to update any real-time info
    // Currently handled by updateWazeNavigation
}

// Toggle route panel visibility - UPDATED with complete hide functionality
window.toggleRoutePanel = function() {
    const routePanel = document.getElementById('routePanel');
    const toggleBtn = document.querySelector('.nav-button.secondary');
    const navControls = document.getElementById('navControls');
    
    if (!routePanel) return;
    
    if (state.isPanelVisible) {
        // Completely hide the panel
        routePanel.style.display = 'none';
        state.isPanelVisible = false;
        
        // Move nav controls to bottom when panel is hidden
        if (navControls) {
            navControls.style.bottom = 'calc(20px + var(--safe-area-bottom))';
        }
        
        if (toggleBtn) {
            toggleBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
                </svg>
                <span>Details</span>
            `;
        }
    } else {
        // Show the panel
        routePanel.style.display = 'block';
        routePanel.style.transform = 'translateY(0)';
        routePanel.style.maxHeight = '60%';
        state.isPanelVisible = true;
        
        // Adjust nav controls position when panel is visible
        if (navControls) {
            navControls.style.bottom = 'calc(200px + var(--safe-area-bottom))';
        }
        
        if (toggleBtn) {
            toggleBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
                <span>Hide</span>
            `;
        }
    }
    
    // Force map resize when toggling panel
    if (state.map) {
        setTimeout(() => {
            state.map.invalidateSize();
        }, 300);
    }
};

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

// Collapse panel
function collapsePanel() {
    const routePanel = document.getElementById('routePanel');
    if (routePanel) {
        routePanel.style.transform = 'translateY(calc(100% - 140px))';
        routePanel.style.maxHeight = '140px';
    }
}

// Make route panel collapsible
function enhanceRoutePanel() {
    const routePanel = document.getElementById('routePanel');
    if (!routePanel) return;
    
    let isPanelCollapsed = false;
    
    // Add click handler to panel handle
    const panelHandle = routePanel.querySelector('.panel-handle');
    if (panelHandle) {
        panelHandle.style.cursor = 'pointer';
        panelHandle.addEventListener('click', togglePanelHeight);
        
        // Add visual indicator
        panelHandle.innerHTML = `
            <div style="width: 40px; height: 4px; background: var(--text-tertiary); border-radius: 2px; margin: 0 auto;"></div>
        `;
    }
    
    function togglePanelHeight() {
        isPanelCollapsed = !isPanelCollapsed;
        
        if (isPanelCollapsed) {
            routePanel.style.transform = 'translateY(calc(100% - 140px))';
            routePanel.style.maxHeight = '140px';
        } else {
            routePanel.style.transform = 'translateY(0)';
            routePanel.style.maxHeight = '60%'; // Changed to 60% for better visibility
        }
    }
}

// Create custom Leaflet icon with Tuma theme
function createLeafletIcon(stop) {
    const isCompleted = stop.completed;
    const isActive = isNextStop(stop);
    const type = stop.type;
    
    // Tuma color scheme
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

// Create popup content with Tuma theme
function createStopPopup(stop) {
    const bgColor = stop.type === 'pickup' ? '#FF9F0A' : '#0066FF';
    const textColor = stop.type === 'pickup' ? 'black' : 'white';
    
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

// Plot route on map with OpenRouteService (FIXED)
async function plotRoute() {
    if (!state.map || !state.activeRoute || !state.activeRoute.stops) return;
    
    // Clear existing markers and routes
    state.markers.forEach(marker => marker.remove());
    state.markers = [];
    if (state.routePolyline) {
        state.routePolyline.remove();
        state.routePolyline = null;
    }
    
    const bounds = L.latLngBounds();
    
    // Add stop markers
    state.activeRoute.stops.forEach((stop, index) => {
        const marker = L.marker([stop.location.lat, stop.location.lng], {
            icon: createLeafletIcon(stop)
        })
        .addTo(state.map)
        .bindPopup(createStopPopup(stop));
        
        state.markers.push(marker);
        bounds.extend([stop.location.lat, stop.location.lng]);
    });
    
    // Fit map to show all markers with padding
    state.map.fitBounds(bounds, { padding: [50, 50] });
    
    // DON'T draw any routes initially - wait for optimization
}

// Draw optimized route using OpenRouteService (FIXED)
async function drawOptimizedRoute() {
    if (!state.activeRoute) return;
    
    const stops = state.activeRoute.stops.filter(s => !s.completed);
    if (stops.length < 2) {
        console.log('Not enough stops to draw route');
        return;
    }
    
    try {
        // Clear existing route line
        if (state.routePolyline) {
            state.routePolyline.remove();
            state.routePolyline = null;
        }
        
        // Add current location if available and we're in navigation mode
        let coordinates = [];
        if (state.currentLocation && state.navigationActive) {
            coordinates.push([state.currentLocation.lng, state.currentLocation.lat]);
        }
        
        // Add stop coordinates
        coordinates = coordinates.concat(stops.map(stop => [stop.location.lng, stop.location.lat]));
        
        console.log('Drawing route with coordinates:', coordinates);
        
        // Call OpenRouteService Directions API with proper body format
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
            console.error('OpenRouteService error response:', errorText);
            throw new Error('OpenRouteService API error');
        }
        
        const data = await response.json();
        console.log('Route response:', data);
        
        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            
            // Decode the geometry
            const decodedCoords = decodePolyline(route.geometry);
            
            // Draw the route with Tuma colors
            state.routePolyline = L.polyline(decodedCoords, {
                color: '#0066FF',
                weight: 6,
                opacity: 0.8,
                smoothFactor: 1
            }).addTo(state.map);
            
            // Update distance and time
            const distance = (route.summary.distance / 1000).toFixed(1);
            const duration = Math.round(route.summary.duration / 60);
            
            if (document.getElementById('totalDistance')) {
                document.getElementById('totalDistance').textContent = distance;
            }
            if (document.getElementById('estimatedTime')) {
                document.getElementById('estimatedTime').textContent = duration;
            }
            
            console.log('Route drawn successfully');
        }
    } catch (error) {
        console.error('Error getting route:', error);
        // Draw fallback straight lines between stops
        drawFallbackRoute(stops);
    }
}

// Fallback route drawing
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

// Decode polyline from OpenRouteService
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
    
    // Update route type badge - now as a verify button
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
    
    // Update stats
    updateRouteStats();
    
    // Display stops
    displayStops();
}

// Get next incomplete stop
function getNextStop() {
    if (!state.activeRoute || !state.activeRoute.stops) return null;
    return state.activeRoute.stops.find(stop => !stop.completed);
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

// Display stops list with enhanced UI
function displayStops() {
    const stopsList = document.getElementById('stopsList');
    if (!stopsList || !state.activeRoute) return;
    
    // Group stops by phase
    const pickupStops = state.activeRoute.stops.filter(s => s.type === 'pickup');
    const deliveryStops = state.activeRoute.stops.filter(s => s.type === 'delivery');
    
    // Check parcels in possession
    updateParcelsInPossession();
    
    let html = '';
    
    // Add phase progress widget
    html += createPhaseProgressWidget(pickupStops, deliveryStops);
    
    // Add parcels in possession widget if any
    if (state.parcelsInPossession.length > 0) {
        html += createParcelsInPossessionWidget();
    }
    
    // Add pickup phase
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
    
    // Add delivery phase
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

// Create parcels in possession widget
function createParcelsInPossessionWidget() {
    return `
        <div class="parcels-possession-widget" style="background: linear-gradient(135deg, rgba(255, 159, 10, 0.2) 0%, rgba(255, 159, 10, 0.1) 100%); border: 1px solid var(--warning); border-radius: 14px; padding: 16px; margin-bottom: 20px;">
            <div class="carrying-banner" style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                <span class="carrying-icon">📦</span>
                <span style="font-weight: 600; color: var(--text-primary);">Carrying ${state.parcelsInPossession.length} parcel${state.parcelsInPossession.length > 1 ? 's' : ''}</span>
            </div>
            <div class="parcel-cards" style="display: flex; flex-direction: column; gap: 8px;">
                ${state.parcelsInPossession.map(parcel => `
                    <div class="parcel-card" style="background: var(--surface-high); border-radius: 8px; padding: 12px; border-left: 3px solid var(--warning);">
                        <div class="parcel-code" style="font-weight: 600; margin-bottom: 4px; color: var(--text-primary);">${parcel.parcelCode}</div>
                        <div class="parcel-destination" style="font-size: 14px; color: var(--text-secondary); margin-bottom: 4px;">${parcel.destination}</div>
                        <div class="parcel-time" style="font-size: 12px; color: var(--text-tertiary);">Picked up ${formatTimeAgo(parcel.pickupTime)}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
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

// Create enhanced stop card
function createStopCard(stop, number, type, isLocked = false) {
    const isActive = isNextStop(stop);
    const canInteract = !stop.completed && !isLocked && (type === 'pickup' || canCompleteDelivery(stop));
    
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

// Check if stop is the next one
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

// Check if all stops in array are completed
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

// Show/hide UI elements
function showRoutePanel() {
    document.getElementById('routePanel').style.display = 'block';
    document.getElementById('navControls').style.display = 'flex';
    document.getElementById('emptyState').style.display = 'none';
}

function showEmptyState() {
    document.getElementById('routePanel').style.display = 'none';
    document.getElementById('navControls').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
}

// Enhanced location tracking with high accuracy
function startLocationTracking() {
    if (!navigator.geolocation) {
        showNotification('Location services not available', 'warning');
        return;
    }
    
    // Request high accuracy location with heading
    const geoOptions = {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
    };
    
    // Get initial location
    navigator.geolocation.getCurrentPosition(
        position => {
            updateCurrentLocation(position);
            state.isTracking = true;
            document.getElementById('trackingIndicator').style.display = 'flex';
            document.getElementById('locationButton').classList.add('active');
            
            // Center map on user location initially
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
    
    // Watch position with high frequency updates
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

// Enhanced start navigation with better UX
window.startNavigation = function() {
    const nextStop = getNextStop();
    if (!nextStop) {
        showNotification('No stops to navigate to', 'warning');
        return;
    }
    
    // Don't need to optimize route again if it's already drawn
    if (!state.routePolyline) {
        showNotification('Optimizing route...', 'info');
        drawOptimizedRoute().then(() => {
            proceedWithNavigation(nextStop);
        });
    } else {
        proceedWithNavigation(nextStop);
    }
};

// Helper function to proceed with navigation
function proceedWithNavigation(nextStop) {
    // Enable continuous tracking
    startContinuousTracking();
    
    // Show enhanced in-app navigation
    showEnhancedNavigation(nextStop);
    
    // Set navigation active state
    state.navigationActive = true;
};

// Enhanced Waze-like navigation interface - FIXED MAP VISIBILITY
function showEnhancedNavigation(targetStop) {
    // Remove any existing navigation
    const existingNav = document.querySelector('.enhanced-navigation');
    if (existingNav) existingNav.remove();
    
    // Hide the route panel completely when starting navigation
    const routePanel = document.getElementById('routePanel');
    if (routePanel) {
        routePanel.style.display = 'none';
        state.isPanelVisible = false;
    }
    
    // Hide nav controls
    const navControls = document.getElementById('navControls');
    if (navControls) {
        navControls.style.display = 'none';
    }
    
    // Enable follow mode
    state.isFollowingUser = true;
    
    // Create minimalist Waze-like navigation UI - FIXED: No blocking elements
    const navUI = document.createElement('div');
    navUI.className = 'enhanced-navigation waze-style';
    navUI.style.cssText = 'pointer-events: none !important;';
    navUI.innerHTML = `
        <!-- Minimal top instruction bar -->
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
        
        <!-- Floating bottom info pills -->
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
        
        <!-- Floating action button for details/verify -->
        <button class="waze-fab" onclick="showNavigationActions()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
            </svg>
        </button>
        
        <!-- Collapsible navigation menu -->
        <div class="waze-nav-menu" id="navMenu" style="display: none;">
            <button class="nav-menu-item" onclick="toggleRoutePanel()">
                <span class="menu-icon">📋</span>
                <span>Route Details</span>
            </button>
            <button class="nav-menu-item" onclick="toggleFollowMode()">
                <span class="menu-icon">🎯</span>
                <span id="followModeText">Following On</span>
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
    
    // IMPORTANT: Force map resize after UI changes
    setTimeout(() => {
        if (state.map) {
            // Invalidate size to force map to recalculate its dimensions
            state.map.invalidateSize();
            
            // Then set view to current location
            if (state.currentLocation) {
                state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 17, {
                    animate: true
                });
            } else if (targetStop && targetStop.location) {
                // Fallback to target stop location if current location not available
                state.map.setView([targetStop.location.lat, targetStop.location.lng], 15);
            }
        }
    }, 100);
    
    // Start navigation updates
    updateWazeNavigation(targetStop);
    
    // Get turn-by-turn directions
    getEnhancedDirections(targetStop);
}

// Toggle navigation menu - NEW
window.toggleNavigationMenu = function() {
    const menu = document.getElementById('navMenu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
};

// Show navigation actions (FAB menu) - NEW
window.showNavigationActions = function() {
    const menu = document.getElementById('navMenu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
};

// Update navigation with Waze-style minimal info - UPDATED with drone follow
async function updateWazeNavigation(targetStop) {
    if (!state.currentLocation) {
        setTimeout(() => updateWazeNavigation(targetStop), 1000);
        return;
    }
    
    const distance = calculateDistance(state.currentLocation, targetStop.location);
    const eta = calculateETA(distance);
    
    // Update minimal UI elements
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
    
    // Follow the user with drone-like view
    if (state.map && state.currentLocation && state.isFollowingUser) {
        // Smooth pan to current location
        state.map.panTo([state.currentLocation.lat, state.currentLocation.lng], {
            animate: true,
            duration: 1
        });
        
        // Adjust zoom based on speed (zoom out when moving fast)
        const currentZoom = state.map.getZoom();
        const targetZoom = calculateZoomFromSpeed(state.currentSpeed);
        if (Math.abs(currentZoom - targetZoom) > 0.5) {
            state.map.setZoom(targetZoom, { animate: true });
        }
    }
    
    // Check arrival
    if (distance < 0.05) { // Within 50 meters
        showArrivalNotification(targetStop);
    }
    
    // Continue updating if navigation is active
    if (document.querySelector('.enhanced-navigation') && state.navigationActive) {
        setTimeout(() => updateWazeNavigation(targetStop), 2000); // Update every 2 seconds
    }
}

// Show arrival notification
function showArrivalNotification(targetStop) {
    // Update navigation UI
    const distanceEl = document.querySelector('.waze-distance');
    const streetEl = document.querySelector('.waze-street');
    const arrowEl = document.querySelector('.direction-arrow');
    
    if (distanceEl) distanceEl.textContent = 'Arrived';
    if (streetEl) streetEl.textContent = `${targetStop.type} location reached`;
    if (arrowEl) arrowEl.textContent = '✅';
    
    // Vibrate and show notification
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    showNotification(`Arrived at ${targetStop.type} location`, 'success');
    
    // Auto-show verification after 2 seconds
    setTimeout(() => {
        openQuickVerification();
    }, 2000);
}

// Get enhanced directions from OpenRouteService
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
                
                // Draw route on map
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
                
                // Update navigation instructions
                updateNavigationInstructions(route);
            }
        }
    } catch (error) {
        console.error('Error getting directions:', error);
    }
}

// Update navigation instructions for minimal display - UPDATED
function updateNavigationInstructions(route) {
    if (!route.segments || route.segments.length === 0) return;
    
    const segment = route.segments[0];
    if (!segment.steps || segment.steps.length === 0) return;
    
    // Get current step based on location
    const currentStep = getCurrentNavigationStep(segment.steps);
    if (!currentStep) return;
    
    // Update minimal UI
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
        // Keep instruction short for minimal UI
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
    // For now, return the first uncompleted step
    // This could be enhanced with more sophisticated logic
    return steps[0];
}

// Get direction emoji
function getDirectionEmoji(type) {
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
}

// Exit enhanced navigation and restore normal view - FIXED
window.exitEnhancedNavigation = function() {
    const nav = document.querySelector('.enhanced-navigation');
    if (nav) nav.remove();
    
    state.navigationActive = false;
    state.isFollowingUser = false;
    
    // Show route panel again
    const routePanel = document.getElementById('routePanel');
    if (routePanel) {
        routePanel.style.display = 'block';
        state.isPanelVisible = true;
    }
    
    // Show nav controls
    const navControls = document.getElementById('navControls');
    if (navControls) {
        navControls.style.display = 'flex';
    }
    
    // Reset map view and invalidate size
    if (state.map) {
        state.map.invalidateSize();
        state.map.setZoom(14);
        
        // Re-fit bounds to show all stops
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
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
};

// Navigate to stop
window.navigateToStop = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop) return;
    
    // Set navigation active state
    state.navigationActive = true;
    
    // Show in-app navigation
    showEnhancedNavigation(stop);
};

window.selectStop = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop || stop.completed) return;
    
    // Center map on stop
    if (state.map) {
        state.map.setView([stop.location.lat, stop.location.lng], 16);
        
        // Open popup for this marker
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
    }, 5000); // Update every 5 seconds
}

// Check proximity to stops
function checkStopProximity() {
    if (!state.currentLocation || !state.activeRoute) return;
    
    const nextStop = getNextStop();
    if (!nextStop) return;
    
    const distance = calculateDistance(
        state.currentLocation,
        nextStop.location
    );
    
    // If within 100 meters, show notification
    if (distance < 0.1 && !state.proximityNotified) {
        state.proximityNotified = true;
        showNotification(
            `Approaching ${nextStop.type} location - ${Math.round(distance * 1000)}m away`,
            'info'
        );
        
        // Reset flag after 5 minutes
        setTimeout(() => {
            state.proximityNotified = false;
        }, 300000);
    }
}

// Calculate distance between two points
function calculateDistance(point1, point2) {
    const R = 6371; // Earth's radius in km
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
    // Assume average speed of 30 km/h in city
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

// Quick verification from header
window.openQuickVerification = function() {
    const nextStop = getNextStop();
    if (nextStop) {
        openVerificationModal(nextStop.id);
    }
};

// Open verification modal
window.openVerificationModal = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop || stop.completed) return;
    
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
                
                <div class="modal-actions">
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
    
    // Focus on input
    setTimeout(() => {
        document.getElementById('verificationCode').focus();
    }, 100);
    
    // Add enter key handler
    document.getElementById('verificationCode').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            verifyCode(stop.id);
        }
    });
};

// Close verification modal
window.closeVerificationModal = function() {
    const modal = document.querySelector('.verification-modal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 300);
    }
};

// Verify code
window.verifyCode = async function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop) return;
    
    const codeInput = document.getElementById('verificationCode');
    const code = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    if (!code || code.length < 6) {
        codeInput.classList.add('error');
        showNotification('Please enter a valid code', 'error');
        return;
    }
    
    // Check code
    if (code !== stop.verificationCode.toUpperCase().replace(/[^A-Z0-9]/g, '')) {
        codeInput.classList.add('error');
        showNotification('Invalid code. Please try again.', 'error');
        return;
    }
    
    // Mark stop as completed
    stop.completed = true;
    stop.timestamp = new Date();
    
    // Update localStorage
    localStorage.setItem('tuma_active_route', JSON.stringify(state.activeRoute));
    
    // Close modal
    closeVerificationModal();
    
    // Show success animation
    showSuccessAnimation(stop.type);
    
    // Update displays
    displayRouteInfo();
    updateDynamicHeader();
    plotRoute();
    
    // Redraw the route line to reflect completed stops
    drawOptimizedRoute();
    
    // Check if phase complete
    checkPhaseCompletion();
    
    // Check if route complete
    if (state.activeRoute.stops.every(s => s.completed)) {
        completeRoute();
    } else {
        // If still navigating, show next stop
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

// Complete route
function completeRoute() {
    // Calculate earnings (70% of total)
    const totalEarnings = state.activeRoute.total_earnings || 0;
    const riderEarnings = Math.round(totalEarnings * 0.7);
    
    // Show completion animation
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
                    <span class="stat-value">KES ${riderEarnings}</span>
                    <span class="stat-label">Earned</span>
                </div>
            </div>
            <button class="complete-btn" onclick="finishRoute()">
                Back to Dashboard
            </button>
        </div>
    `;
    
    document.body.appendChild(animation);
    
    // Store completion data for rider.js
    localStorage.setItem('tuma_route_completion', JSON.stringify({
        completed: true,
        earnings: riderEarnings,
        stops: state.activeRoute.stops.length,
        timestamp: new Date()
    }));
}

// Finish route
window.finishRoute = function() {
    // Clear active route
    localStorage.removeItem('tuma_active_route');
    
    // Navigate back to rider dashboard
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

// Add Waze-style navigation CSS - FIXED for map visibility
function addWazeNavigationStyles() {
    const wazeNavigationStyles = `
        /* FIXED: Ensure map is always visible */
        #map {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            z-index: 1 !important;
        }
        
        .map-container {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            z-index: 1 !important;
        }
        
        /* Waze-style Navigation - No blocking container */
        .enhanced-navigation.waze-style {
            /* Remove all positioning that could block the map */
            pointer-events: none !important;
        }
        
        /* Individual navigation elements with pointer events */
        .waze-nav-top,
        .waze-bottom-pills,
        .waze-fab,
        .waze-nav-menu {
            pointer-events: auto !important;
        }
        
        .waze-nav-top {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 1000;
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
        
        .waze-close-btn,
        .waze-menu-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .waze-close-btn:active,
        .waze-menu-btn:active {
            background: rgba(255, 255, 255, 0.2);
            transform: scale(0.95);
        }
        
        .waze-direction-icon {
            width: 40px;
            height: 40px;
            background: var(--primary);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        
        .direction-arrow {
            font-size: 24px;
        }
        
        .waze-instruction-text {
            flex: 1;
            min-width: 0;
        }
        
        .waze-distance {
            font-size: 20px;
            font-weight: 700;
            color: white;
            margin-bottom: 2px;
        }
        
        .waze-street {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.8);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        /* Floating bottom pills */
        .waze-bottom-pills {
            position: fixed;
            bottom: calc(30px + var(--safe-area-bottom));
            left: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
            z-index: 999;
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
        
        .pill-icon {
            font-size: 16px;
        }
        
        .pill-value {
            font-weight: 600;
        }
        
        .pill-label {
            color: rgba(255, 255, 255, 0.7);
            font-size: 12px;
        }
        
        .speed-pill {
            margin-left: auto;
            flex-direction: column;
            align-items: center;
            padding: 8px 12px;
        }
        
        .speed-pill .pill-value {
            font-size: 18px;
            line-height: 1;
        }
        
        /* Floating Action Button */
        .waze-fab {
            position: fixed;
            bottom: calc(100px + var(--safe-area-bottom));
            right: 20px;
            width: 56px;
            height: 56px;
            background: var(--primary);
            border-radius: 50%;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0, 102, 255, 0.4);
            cursor: pointer;
            z-index: 998;
            transition: all 0.3s;
        }
        
        .waze-fab:active {
            transform: scale(0.9);
        }
        
        /* Navigation Menu */
        .waze-nav-menu {
            position: fixed;
            bottom: calc(170px + var(--safe-area-bottom));
            right: 20px;
            background: var(--surface-elevated);
            border-radius: 12px;
            padding: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            z-index: 997;
            min-width: 200px;
        }
        
        .nav-menu-item {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            padding: 12px;
            background: transparent;
            border: none;
            color: var(--text-primary);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.2s;
            text-align: left;
        }
        
        .nav-menu-item:hover {
            background: var(--surface-high);
        }
        
        .nav-menu-item:active {
            transform: scale(0.98);
        }
        
        .menu-icon {
            font-size: 18px;
            width: 24px;
            text-align: center;
        }
        
        /* Make sure nav controls are properly positioned */
        .nav-controls {
            transition: bottom 0.3s ease;
        }
    `;
    
    const existingStyle = document.getElementById('waze-nav-styles');
    if (!existingStyle) {
        const style = document.createElement('style');
        style.id = 'waze-nav-styles';
        style.textContent = wazeNavigationStyles;
        document.head.appendChild(style);
    }
}

// Add CSS for navigation UI
const navStyles = document.createElement('style');
navStyles.textContent = `
    .enhanced-navigation {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--surface);
        z-index: 1000;
        display: flex;
        flex-direction: column;
    }
    
    .nav-top-bar {
        background: var(--surface-elevated);
        border-bottom: 1px solid var(--border);
        padding: 16px;
        padding-top: calc(16px + var(--safe-area-top));
    }
    
    .nav-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
    }
    
    .nav-close-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--surface-high);
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--text-primary);
    }
    
    .nav-route-info {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    
    .nav-route-type {
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        background: var(--primary);
        color: white;
    }
    
    .nav-route-type.pickup {
        background: var(--warning);
        color: black;
    }
    
    .nav-parcel-code {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-secondary);
    }
    
    .nav-instruction-card {
        background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
        border-radius: 16px;
        padding: 24px;
        color: white;
        display: flex;
        gap: 20px;
        align-items: center;
    }
    
    .nav-direction-visual {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 80px;
    }
    
    .direction-icon-large {
        font-size: 48px;
        margin-bottom: 8px;
    }
    
    .direction-distance {
        display: flex;
        align-items: baseline;
        gap: 4px;
    }
    
    .distance-value {
        font-size: 24px;
        font-weight: 700;
    }
    
    .distance-unit {
        font-size: 16px;
        opacity: 0.9;
    }
    
    .nav-instruction-text {
        flex: 1;
    }
    
    .nav-street-name {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 4px;
    }
    
    .nav-instruction-detail {
        font-size: 16px;
        opacity: 0.9;
    }
    
    .nav-bottom-info {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        padding: 16px;
        background: var(--surface);
    }
    
    .nav-eta-card,
    .nav-distance-card,
    .nav-speed-card {
        background: var(--surface-elevated);
        border-radius: 12px;
        padding: 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        border: 1px solid var(--border);
    }
    
    .eta-icon,
    .distance-icon,
    .speed-icon {
        font-size: 24px;
    }
    
    .eta-info,
    .distance-info,
    .speed-info {
        flex: 1;
    }
    
    .eta-time,
    .distance-remaining,
    .speed-value {
        font-size: 18px;
        font-weight: 700;
        color: var(--primary);
    }
    
    .eta-label,
    .distance-label,
    .speed-label {
        font-size: 12px;
        color: var(--text-secondary);
    }
    
    .nav-destination-preview {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: var(--surface-elevated);
        border-radius: 20px 20px 0 0;
        padding: 20px;
        padding-bottom: calc(20px + var(--safe-area-bottom));
        box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
    }
    
    .destination-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
    }
    
    .destination-type {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-secondary);
    }
    
    .nav-more-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--surface-high);
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--text-primary);
    }
    
    .destination-address {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 8px;
    }
    
    .destination-customer {
        font-size: 16px;
        color: var(--text-secondary);
        margin-bottom: 16px;
    }
    
    .nav-quick-actions {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
    }
    
    .quick-action-btn {
        background: var(--surface-high);
        border: none;
        border-radius: 12px;
        padding: 12px;
        color: var(--text-primary);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        transition: all 0.2s;
    }
    
    .quick-action-btn:active {
        scale: 0.95;
    }
    
    .quick-action-btn.call {
        background: var(--success);
        color: white;
    }
    
    .quick-action-btn.verify {
        background: var(--primary);
        color: white;
    }
    
    .nav-closing {
        animation: slideOut 0.3s ease-out;
    }
    
    @keyframes slideOut {
        to {
            transform: translateY(100%);
        }
    }
    
    .destination-details-modal,
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
    }
    
    .modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
    }
    
    .modal-content {
        position: relative;
        background: var(--surface-elevated);
        border-radius: 20px;
        max-width: 400px;
        width: 100%;
        overflow: hidden;
        z-index: 1;
    }
    
    .modal-header {
        padding: 20px;
        background: var(--surface-high);
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    
    .modal-header.pickup {
        background: var(--warning);
        color: black;
    }
    
    .modal-header.delivery {
        background: var(--success);
        color: white;
    }
    
    .modal-close {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: inherit;
    }
    
    .modal-body {
        padding: 20px;
    }
    
    .detail-section {
        margin-bottom: 20px;
    }
    
    .detail-section h4 {
        font-size: 14px;
        color: var(--text-secondary);
        margin-bottom: 8px;
    }
    
    .detail-section p {
        font-size: 16px;
        line-height: 1.5;
    }
    
    .code-display {
        font-family: monospace;
        font-size: 20px;
        font-weight: 700;
        color: var(--primary);
    }
    
    .verification-section {
        margin: 20px 0;
    }
    
    .verification-section label {
        display: block;
        font-size: 16px;
        margin-bottom: 12px;
    }
    
    .verification-input {
        width: 100%;
        background: var(--surface-high);
        border: 2px solid var(--border);
        border-radius: 12px;
        padding: 16px;
        font-size: 24px;
        font-weight: 700;
        text-align: center;
        color: var(--text-primary);
        letter-spacing: 4px;
        text-transform: uppercase;
        outline: none;
        transition: all 0.3s;
    }
    
    .verification-input:focus {
        border-color: var(--primary);
        transform: translateY(-2px);
        box-shadow: 0 4px 20px rgba(0, 102, 255, 0.2);
    }
    
    .verification-input.error {
        border-color: var(--danger);
        animation: shake 0.3s;
    }
    
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-10px); }
        75% { transform: translateX(10px); }
    }
    
    .code-hint {
        font-size: 14px;
        color: var(--text-secondary);
        text-align: center;
        margin-top: 8px;
    }
    
    .modal-actions {
        display: flex;
        gap: 12px;
        margin-top: 24px;
    }
    
    .modal-btn {
        flex: 1;
        padding: 16px;
        border: none;
        border-radius: 12px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.2s;
    }
    
    .modal-btn.primary {
        background: var(--primary);
        color: white;
    }
    
    .modal-btn.secondary {
        background: var(--surface-high);
        color: var(--text-primary);
    }
    
    .modal-btn:active {
        scale: 0.95;
    }
    
    .success-animation,
    .phase-complete-animation,
    .route-complete-animation {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--surface-elevated);
        border-radius: 20px;
        padding: 40px;
        text-align: center;
        z-index: 3000;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        animation: popIn 0.3s ease-out;
    }
    
    @keyframes popIn {
        from {
            scale: 0.8;
            opacity: 0;
        }
        to {
            scale: 1;
            opacity: 1;
        }
    }
    
    .success-icon {
        width: 80px;
        height: 80px;
        background: var(--success);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px;
        font-size: 48px;
        color: white;
    }
    
    .success-text {
        font-size: 24px;
        font-weight: 700;
    }
    
    .phase-complete-content,
    .route-complete-content {
        max-width: 360px;
    }
    
    .phase-icon,
    .complete-icon {
        font-size: 64px;
        margin-bottom: 20px;
    }
    
    .route-complete-content h1 {
        font-size: 28px;
        margin-bottom: 12px;
    }
    
    .route-complete-content p {
        font-size: 16px;
        color: var(--text-secondary);
        margin-bottom: 24px;
    }
    
    .route-stats {
        display: flex;
        justify-content: center;
        gap: 40px;
        margin-bottom: 32px;
    }
    
    .route-stats .stat {
        text-align: center;
    }
    
    .route-stats .stat-value {
        display: block;
        font-size: 32px;
        font-weight: 700;
        color: var(--primary);
        margin-bottom: 4px;
    }
    
    .route-stats .stat-label {
        font-size: 14px;
        color: var(--text-secondary);
    }
    
    .complete-btn {
        width: 100%;
        background: var(--primary);
        color: white;
        border: none;
        border-radius: 14px;
        padding: 16px;
        font-size: 18px;
        font-weight: 700;
        cursor: pointer;
    }
    
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--surface-elevated);
        color: var(--text-primary);
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 4000;
        animation: slideIn 0.3s ease-out;
        max-width: 350px;
        border: 1px solid var(--border);
    }
    
    .notification.success {
        background: var(--success);
        color: white;
        border-color: var(--success);
    }
    
    .notification.error {
        background: var(--danger);
        color: white;
        border-color: var(--danger);
    }
    
    .notification.warning {
        background: var(--warning);
        color: black;
        border-color: var(--warning);
    }
    
    .notification-icon {
        font-size: 20px;
    }
    
    .notification.hiding {
        animation: slideOut 0.3s ease-out;
    }
    
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
    
    .modal-closing {
        animation: fadeOut 0.3s ease-out;
    }
    
    @keyframes fadeOut {
        to {
            opacity: 0;
        }
    }
    
    /* Pulse effect for current location */
    @keyframes pulse {
        0% {
            transform: scale(0.95);
            opacity: 0.7;
        }
        70% {
            transform: scale(1.3);
            opacity: 0.3;
        }
        100% {
            transform: scale(0.95);
            opacity: 0.7;
        }
    }
    
    .pulse-circle {
        animation: pulse 2s infinite;
    }
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
        window.location.reload();
    },
    testOpenRoute: async () => {
        // Test OpenRouteService API
        const testCoords = [
            [36.8219, -1.2921], // Nairobi CBD
            [36.7853, -1.2906]  // Kilimani
        ];
        
        try {
            const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': OPENROUTE_API_KEY
                },
                body: JSON.stringify({ coordinates: testCoords })
            });
            
            const data = await response.json();
            console.log('OpenRouteService test:', data);
            return data;
        } catch (error) {
            console.error('OpenRouteService test failed:', error);
        }
    },
    toggleFollowMode: () => {
        state.isFollowingUser = !state.isFollowingUser;
        console.log('Follow mode:', state.isFollowingUser);
    },
    setHeadingUp: (enabled) => {
        state.config.headingUp = enabled;
        console.log('Heading up mode:', enabled);
    }
};

console.log('Fixed Route.js with Waze-style navigation and drone following!');
console.log('Debug commands: window.routeDebug');
console.log('Test navigation: window.routeDebug.simulatePickup()');
console.log('Toggle follow: window.routeDebug.toggleFollowMode()');
