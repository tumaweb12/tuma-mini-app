/**
 * Complete Enhanced Route Navigation Module with OpenRouteService
 * Fixed version with map visibility fixes for navigation mode
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
    pickupPhaseCompleted: false,
    isPanelVisible: true,
    navigationActive: false,
    currentSpeed: 0
};

// API Configuration
const OPENROUTE_API_KEY = '5b3ce3597851110001cf624841e48578ffb34c6b96dfe3bbe9b3ad4c';
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Route.js initializing with OpenRouteService...');
    
    // Add Waze navigation styles
    addWazeNavigationStyles();
    
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

// Initialize Leaflet Map with Simplistic Style (like Google Maps Transit)
async function initializeMap() {
    console.log('Initializing Leaflet map with simplistic style...');
    
    // Get the center point from route stops
    let centerLat = -1.2921;
    let centerLng = 36.8219;
    
    if (state.activeRoute && state.activeRoute.stops && state.activeRoute.stops.length > 0) {
        // Calculate center from all stops
        const bounds = calculateBounds(state.activeRoute.stops);
        centerLat = (bounds.north + bounds.south) / 2;
        centerLng = (bounds.east + bounds.west) / 2;
    }
    
    // Create map centered on route
    state.map = L.map('map', {
        zoomControl: false // Remove default zoom control for cleaner look
    }).setView([centerLat, centerLng], 13);
    
    // Use CartoDB Positron for a clean, minimal map style (similar to Google Maps transit)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(state.map);
    
    // Alternative: Use Stamen Toner-Lite for even more minimal style
    // L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}{r}.png', {
    //     attribution: 'Map tiles by Stamen Design, CC BY 3.0 — Map data © OpenStreetMap contributors',
    //     subdomains: 'abcd',
    //     maxZoom: 20,
    //     minZoom: 0
    // }).addTo(state.map);
    
    // Add custom zoom control in bottom left
    L.control.zoom({
        position: 'bottomleft'
    }).addTo(state.map);
    
    console.log('Map initialized with simplistic style');
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

// Location tracking
function startLocationTracking() {
    if (!navigator.geolocation) {
        showNotification('Location services not available', 'warning');
        return;
    }
    
    // Get initial location
    navigator.geolocation.getCurrentPosition(
        position => {
            updateCurrentLocation(position);
            state.isTracking = true;
            document.getElementById('trackingIndicator').style.display = 'flex';
            document.getElementById('locationButton').classList.add('active');
        },
        error => {
            console.error('Location error:', error);
            showNotification('Please enable location services', 'warning');
        },
        { enableHighAccuracy: true }
    );
    
    // Watch position
    navigator.geolocation.watchPosition(
        position => updateCurrentLocation(position),
        error => console.error('Location update error:', error),
        { enableHighAccuracy: true, maximumAge: 5000 }
    );
}

// Update current location
function updateCurrentLocation(position) {
    state.currentLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
    };
    
    // Update map
    if (state.map) {
        // Add or update current location marker
        if (!state.currentLocationMarker) {
            state.currentLocationMarker = L.circleMarker(
                [state.currentLocation.lat, state.currentLocation.lng],
                {
                    radius: 8,
                    fillColor: '#0066FF',
                    color: 'white',
                    weight: 3,
                    opacity: 1,
                    fillOpacity: 1
                }
            ).addTo(state.map);
            
            // Add pulsing effect
            L.circle([state.currentLocation.lat, state.currentLocation.lng], {
                radius: 20,
                fillColor: '#0066FF',
                fillOpacity: 0.2,
                color: '#0066FF',
                weight: 1,
                className: 'pulse-circle'
            }).addTo(state.map);
        } else {
            state.currentLocationMarker.setLatLng([state.currentLocation.lat, state.currentLocation.lng]);
        }
    }
    
    // Update dynamic header when location changes
    updateDynamicHeader();
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
}

// Enhanced Waze-like navigation interface - FIXED WITH MAP VISIBILITY
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
    
    // IMPORTANT: Ensure map container stays visible
    const mapContainer = document.querySelector('.map-container');
    if (mapContainer) {
        mapContainer.style.zIndex = '1';
        mapContainer.style.position = 'absolute';
        mapContainer.style.top = '0';
        mapContainer.style.left = '0';
        mapContainer.style.right = '0';
        mapContainer.style.bottom = '0';
        mapContainer.style.display = 'block';
        mapContainer.style.visibility = 'visible';
        mapContainer.style.opacity = '1';
    }
    
    // Create minimalist Waze-like navigation UI
    const navUI = document.createElement('div');
    navUI.className = 'enhanced-navigation waze-style';
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
            
            // Force a redraw of the map tiles
            state.map._onResize();
            
            // Ensure map container is visible
            const mapEl = document.getElementById('map');
            if (mapEl) {
                mapEl.style.display = 'block';
                mapEl.style.visibility = 'visible';
                mapEl.style.opacity = '1';
                mapEl.style.position = 'absolute';
                mapEl.style.top = '0';
                mapEl.style.left = '0';
                mapEl.style.width = '100%';
                mapEl.style.height = '100%';
            }
            
            // Then set view to current location
            if (state.currentLocation) {
                state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 17);
            } else if (targetStop && targetStop.location) {
                // Fallback to target stop location if current location not available
                state.map.setView([targetStop.location.lat, targetStop.location.lng], 15);
            }
        }
    }, 150); // Slightly longer delay
    
    // Start navigation updates
    updateWazeNavigation(targetStop);
    
    // Get turn-by-turn directions
    getEnhancedDirections(targetStop);
    
    // Debug: Check map visibility
    console.log('Map element:', document.getElementById('map'));
    console.log('Map container:', document.querySelector('.map-container'));
    console.log('Map instance:', state.map);
    console.log('Map container computed style:', window.getComputedStyle(document.querySelector('.map-container')));
}

// Update navigation with Waze-style minimal info - UPDATED
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
    
    // Update speed if available
    if (speedPill && state.lastLocation) {
        const timeDiff = Date.now() - state.lastLocationTime;
        const distanceTraveled = calculateDistance(state.lastLocation, state.currentLocation);
        const speed = Math.round((distanceTraveled / timeDiff) * 3600000); // km/h
        
        if (speed > 0 && speed < 200) { // Sanity check
            speedPill.textContent = speed;
            state.currentSpeed = speed;
        }
    }
    
    // Follow the user with drone-like view
    if (state.map && state.currentLocation) {
        // Smooth pan to current location
        state.map.panTo([state.currentLocation.lat, state.currentLocation.lng], {
            animate: true,
            duration: 1
        });
        
        // Adjust zoom based on speed (zoom out when moving fast)
        const currentZoom = state.map.getZoom();
        const targetZoom = state.currentSpeed > 50 ? 15 : state.currentSpeed > 30 ? 16 : 17;
        if (Math.abs(currentZoom - targetZoom) > 0.5) {
            state.map.setZoom(targetZoom, { animate: true });
        }
    }
    
    // Check arrival
    if (distance < 0.05) { // Within 50 meters
        showArrivalNotification(targetStop);
    }
    
    state.lastLocation = state.currentLocation;
    state.lastLocationTime = Date.now();
    
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

// Exit enhanced navigation and restore normal view - FIXED
window.exitEnhancedNavigation = function() {
    const nav = document.querySelector('.enhanced-navigation');
    if (nav) nav.remove();
    
    state.navigationActive = false;
    
    // Show route panel again
    const routePanel = document.getElementById('routePanel');
    if (routePanel) {
        routePanel.style.display = 'block';
        state.isPanelVisible = true;
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
