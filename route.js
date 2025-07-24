/ Add this at the top of your rider.js file, replacing the existing DEV_CONFIG section:

// Development Configuration
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

// Also update the API query function to handle temporary riders better:
const supabaseAPI = {
    async query(table, options = {}) {
        const { select = '*', filter = '', order = '', limit } = options;
        
        // Don't make API calls for temporary riders
        if (filter && filter.includes('temp-')) {
            console.log('Skipping API call for temporary rider');
            return [];
        }
        
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
            // Log error but don't throw for development
            if (DEV_CONFIG.isDevelopment && DEV_CONFIG.ignoreRiderNotFound) {
                console.log(`API Error (ignored in dev): ${response.status}`);
                return [];
            }
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    },
    
    async insert(table, data) {
        // Skip for temporary riders
        if (data.rider_id && data.rider_id.includes('temp-')) {
            console.log('Skipping insert for temporary rider');
            return [data];
        }
        
        const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Insert Error: ${response.status} ${error}`);
        }
        
        return await response.json();
    },
    
    async update(table, filter, data) {
        // Skip for temporary riders
        if (filter && filter.includes('temp-')) {
            console.log('Skipping update for temporary rider');
            return [data];
        }
        
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
            const error = await response.text();
            throw new Error(`Update Error: ${response.status} ${error}`);
        }
        
        return await response.json();
    }
};
/**
 * Complete Enhanced Route Navigation Module with OpenRouteService
 * Fixed version with all requested improvements
 */

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
    navigationActive: false
};

// API Configuration
const OPENROUTE_API_KEY = '5b3ce3597851110001cf624841e48578ffb34c6b96dfe3bbe9b3ad4c';
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Route.js initializing with OpenRouteService...');
    
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

// Initialize Leaflet Map with OpenStreetMap
async function initializeMap() {
    console.log('Initializing Leaflet map...');
    
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
    state.map = L.map('map').setView([centerLat, centerLng], 13);
    
    // Add OpenStreetMap tile layer (free)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(state.map);
    
    console.log('Map initialized');
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

// Toggle route panel visibility
window.toggleRoutePanel = function() {
    const routePanel = document.getElementById('routePanel');
    const toggleBtn = document.querySelector('.nav-button.secondary');
    
    if (!routePanel) return;
    
    if (state.isPanelVisible) {
        // Collapse panel to minimal height
        routePanel.style.transform = 'translateY(calc(100% - 100px))';
        routePanel.style.maxHeight = '100px';
        state.isPanelVisible = false;
        
        if (toggleBtn) {
            toggleBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 16l-6-6h12z"/>
                </svg>
                <span>Show Details</span>
            `;
        }
    } else {
        // Expand panel to at least half screen
        routePanel.style.transform = 'translateY(0)';
        routePanel.style.maxHeight = '60%';
        routePanel.style.display = 'block';
        state.isPanelVisible = true;
        
        if (toggleBtn) {
            toggleBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>
                </svg>
                <span>Hide Details</span>
            `;
        }
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
    if (stops.length < 2) return;
    
    try {
        // Clear existing route line
        if (state.routePolyline) {
            state.routePolyline.remove();
            state.routePolyline = null;
        }
        
        // Prepare coordinates for OpenRouteService (lng, lat order!)
        const coordinates = stops.map(stop => [stop.location.lng, stop.location.lat]);
        
        // Call OpenRouteService Directions API with proper body format
        const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
            method: 'POST',
            headers: {
                'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
                'Content-Type': 'application/json',
                'Authorization': OPENROUTE_API_KEY
            },
            body: JSON.stringify({
                coordinates: coordinates
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouteService error response:', errorText);
            throw new Error('OpenRouteService API error');
        }
        
        const data = await response.json();
        
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
            
            document.getElementById('totalDistance').textContent = distance;
            document.getElementById('estimatedTime').textContent = duration;
        }
    } catch (error) {
        console.error('Error getting route:', error);
        // Don't draw fallback straight lines
        showNotification('Route optimization unavailable', 'warning');
    }
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
    
    // First optimize the route
    showNotification('Optimizing route...', 'info');
    drawOptimizedRoute().then(() => {
        // Enable continuous tracking
        startContinuousTracking();
        
        // Hide the route panel completely for cleaner navigation
        const routePanel = document.getElementById('routePanel');
        if (routePanel) {
            routePanel.style.display = 'none';
        }
        
        // Show enhanced in-app navigation
        showEnhancedNavigation(nextStop);
        
        // Set navigation active state
        state.navigationActive = true;
    });
};

// Enhanced in-app navigation interface - Better than Uber/Bolt
function showEnhancedNavigation(targetStop) {
    // Remove any existing navigation
    const existingNav = document.querySelector('.enhanced-navigation');
    if (existingNav) existingNav.remove();
    
    // Create enhanced navigation UI with Tuma theme
    const navUI = document.createElement('div');
    navUI.className = 'enhanced-navigation';
    navUI.innerHTML = `
        <div class="nav-top-bar">
            <div class="nav-header">
                <button class="nav-close-btn" onclick="exitEnhancedNavigation()">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
                <div class="nav-route-info">
                    <div class="nav-route-type ${targetStop.type}">${targetStop.type.toUpperCase()}</div>
                    <div class="nav-parcel-code">${targetStop.parcelCode}</div>
                </div>
            </div>
            
            <div class="nav-instruction-card">
                <div class="nav-direction-visual">
                    <div class="direction-icon-large">⬆️</div>
                    <div class="direction-distance">
                        <span class="distance-value">--</span>
                        <span class="distance-unit">m</span>
                    </div>
                </div>
                <div class="nav-instruction-text">
                    <div class="nav-street-name">Starting navigation...</div>
                    <div class="nav-instruction-detail">Getting GPS signal</div>
                </div>
            </div>
        </div>
        
        <div class="nav-bottom-info">
            <div class="nav-eta-card">
                <div class="eta-icon">⏱️</div>
                <div class="eta-info">
                    <div class="eta-time">--:--</div>
                    <div class="eta-label">ETA</div>
                </div>
            </div>
            
            <div class="nav-distance-card">
                <div class="distance-icon">📍</div>
                <div class="distance-info">
                    <div class="distance-remaining">-- km</div>
                    <div class="distance-label">Distance</div>
                </div>
            </div>
            
            <div class="nav-speed-card">
                <div class="speed-icon">🏍️</div>
                <div class="speed-info">
                    <div class="speed-value">0</div>
                    <div class="speed-label">km/h</div>
                </div>
            </div>
        </div>
        
        <div class="nav-destination-preview">
            <div class="destination-header">
                <span class="destination-type">${targetStop.type === 'pickup' ? '📦 PICKUP' : '📍 DELIVERY'}</span>
                <button class="nav-more-btn" onclick="showDestinationDetails('${targetStop.id}')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                    </svg>
                </button>
            </div>
            <div class="destination-address">${targetStop.address}</div>
            <div class="destination-customer">${targetStop.customerName}</div>
            
            <div class="nav-quick-actions">
                <button class="quick-action-btn call" onclick="window.location.href='tel:${targetStop.customerPhone}'">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
                    </svg>
                    Call
                </button>
                <button class="quick-action-btn verify" onclick="openQuickVerification()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                    Verify
                </button>
                <button class="quick-action-btn details" onclick="toggleRoutePanel()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
                    </svg>
                    Details
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(navUI);
    
    // Start navigation updates
    updateEnhancedNavigation(targetStop);
    
    // Get turn-by-turn directions
    getEnhancedDirections(targetStop);
    
    // Focus map on route
    if (state.map && state.currentLocation) {
        const bounds = L.latLngBounds([
            [state.currentLocation.lat, state.currentLocation.lng],
            [targetStop.location.lat, targetStop.location.lng]
        ]);
        state.map.fitBounds(bounds, { padding: [100, 50] });
    }
}

// Update navigation with real-time data
async function updateEnhancedNavigation(targetStop) {
    if (!state.currentLocation) {
        setTimeout(() => updateEnhancedNavigation(targetStop), 1000);
        return;
    }
    
    const distance = calculateDistance(state.currentLocation, targetStop.location);
    const eta = calculateETA(distance);
    
    // Update UI elements
    const distanceEl = document.querySelector('.distance-remaining');
    const etaTimeEl = document.querySelector('.eta-time');
    const speedEl = document.querySelector('.speed-value');
    
    if (distanceEl) {
        distanceEl.textContent = distance < 1 ? 
            `${Math.round(distance * 1000)} m` : 
            `${distance.toFixed(1)} km`;
    }
    
    if (etaTimeEl) {
        etaTimeEl.textContent = eta;
    }
    
    // Update speed if available
    if (navigator.geolocation && state.lastLocation) {
        const timeDiff = Date.now() - state.lastLocationTime;
        const distanceTraveled = calculateDistance(state.lastLocation, state.currentLocation);
        const speed = Math.round((distanceTraveled / timeDiff) * 3600000); // km/h
        
        if (speedEl && speed > 0 && speed < 200) { // Sanity check
            speedEl.textContent = speed;
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
        setTimeout(() => updateEnhancedNavigation(targetStop), 3000);
    }
}

// Show arrival notification
function showArrivalNotification(targetStop) {
    // Update navigation UI
    const instructionEl = document.querySelector('.nav-street-name');
    const detailEl = document.querySelector('.nav-instruction-detail');
    const iconEl = document.querySelector('.direction-icon-large');
    
    if (instructionEl) instructionEl.textContent = 'You have arrived';
    if (detailEl) detailEl.textContent = `${targetStop.type} location reached`;
    if (iconEl) iconEl.textContent = '✅';
    
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

// Update navigation instructions
function updateNavigationInstructions(route) {
    if (!route.segments || route.segments.length === 0) return;
    
    const segment = route.segments[0];
    if (!segment.steps || segment.steps.length === 0) return;
    
    // Get current step based on location
    const currentStep = getCurrentNavigationStep(segment.steps);
    if (!currentStep) return;
    
    // Update UI
    const streetEl = document.querySelector('.nav-street-name');
    const detailEl = document.querySelector('.nav-instruction-detail');
    const iconEl = document.querySelector('.direction-icon-large');
    const distanceEl = document.querySelector('.distance-value');
    const unitEl = document.querySelector('.distance-unit');
    
    if (streetEl) streetEl.textContent = currentStep.name || 'Continue';
    if (detailEl) detailEl.textContent = currentStep.instruction;
    if (iconEl) iconEl.textContent = getDirectionEmoji(currentStep.type);
    
    if (distanceEl && unitEl) {
        if (currentStep.distance < 1000) {
            distanceEl.textContent = Math.round(currentStep.distance);
            unitEl.textContent = 'm';
        } else {
            distanceEl.textContent = (currentStep.distance / 1000).toFixed(1);
            unitEl.textContent = 'km';
        }
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

// Exit minimal navigation (renamed from exitEnhancedNavigation)
window.exitEnhancedNavigation = window.exitMinimalNavigation;

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

// Add all enhanced navigation styles
const enhancedStyles = `
<style>
/* Minimal Navigation UI - Clean and Map-Focused */
.minimal-navigation {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 500;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.minimal-navigation > * {
    pointer-events: auto;
}

/* Top navigation bar - minimal */
.min-nav-top {
    background: rgba(10, 10, 11, 0.9);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    animation: slideDown 0.3s ease-out;
}

.min-nav-instruction {
    display: flex;
    align-items: center;
    gap: 16px;
}

.min-nav-direction {
    font-size: 36px;
    line-height: 1;
}

.min-nav-text {
    display: flex;
    flex-direction: column;
}

.min-nav-distance {
    font-size: 24px;
    font-weight: 700;
    color: var(--primary);
}

.min-nav-street {
    font-size: 16px;
    color: var(--text-secondary);
}

.min-nav-close {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
}

.min-nav-close:hover {
    background: var(--danger);
}

/* Bottom destination card - minimal */
.min-nav-bottom {
    background: rgba(10, 10, 11, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-top: 1px solid var(--border);
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 16px;
    animation: slideUp 0.3s ease-out;
}

.min-nav-eta {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 60px;
}

.eta-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--primary);
}

.eta-label {
    font-size: 12px;
    color: var(--text-secondary);
}

.min-nav-destination {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
}

.dest-type {
    font-size: 24px;
}

.dest-info {
    flex: 1;
    min-width: 0;
}

.dest-address {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.dest-code {
    font-size: 14px;
    color: var(--text-secondary);
}

.min-nav-actions {
    display: flex;
    gap: 8px;
}

.min-action-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: var(--surface-elevated);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
}

.min-action-btn:hover {
    transform: scale(1.1);
}

.min-action-btn.primary {
    background: var(--primary);
}

/* Speed indicator */
.min-nav-speed {
    position: fixed;
    bottom: 100px;
    right: 20px;
    background: rgba(10, 10, 11, 0.9);
    backdrop-filter: blur(10px);
    border-radius: 20px;
    padding: 8px 16px;
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-size: 14px;
    border: 1px solid var(--border);
}

.speed-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
}

.speed-unit {
    color: var(--text-secondary);
}

/* Enhanced Navigation UI - Better than Uber/Bolt */
.enhanced-navigation {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    pointer-events: none;
    display: flex;
    flex-direction: column;
}

.enhanced-navigation > * {
    pointer-events: auto;
}

.nav-top-bar {
    background: var(--surface-elevated);
    backdrop-filter: blur(20px);
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
    from {
        transform: translateY(-100%);
    }
    to {
        transform: translateY(0);
    }
}

@keyframes slideUp {
    from {
        transform: translateY(100%);
    }
    to {
        transform: translateY(0);
    }
}

.nav-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid var(--border);
}

.nav-close-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: var(--surface-high);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
}

.nav-close-btn:hover {
    background: var(--danger);
    color: white;
}

.nav-route-info {
    display: flex;
    align-items: center;
    gap: 12px;
}

.nav-route-type {
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.nav-route-type.pickup {
    background: var(--warning);
    color: black;
}

.nav-route-type.delivery {
    background: var(--primary);
    color: white;
}

.nav-parcel-code {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
}

/* Instruction Card */
.nav-instruction-card {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 24px;
    background: var(--surface);
    margin: 16px;
    border-radius: 16px;
    border: 1px solid var(--border);
}

.nav-direction-visual {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 80px;
}

.direction-icon-large {
    font-size: 48px;
    line-height: 1;
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
    color: var(--primary);
}

.distance-unit {
    font-size: 14px;
    color: var(--text-secondary);
}

.nav-instruction-text {
    flex: 1;
}

.nav-street-name {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 4px;
    line-height: 1.2;
}

.nav-instruction-detail {
    font-size: 16px;
    color: var(--text-secondary);
}

/* Bottom Info Cards */
.nav-bottom-info {
    display: flex;
    gap: 12px;
    padding: 0 16px;
    margin-bottom: 16px;
}

.nav-eta-card,
.nav-distance-card,
.nav-speed-card {
    flex: 1;
    background: var(--surface-high);
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
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
}

.eta-label,
.distance-label,
.speed-label {
    font-size: 12px;
    color: var(--text-secondary);
}

/* Destination Preview */
.nav-destination-preview {
    position: absolute;
    bottom: 20px;
    left: 20px;
    right: 20px;
    background: var(--surface-elevated);
    border-radius: 20px;
    padding: 20px;
    box-shadow: 0 -4px 20px rgba(0,0,0,0.5);
    border: 1px solid var(--border);
}

.destination-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.destination-type {
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
}

.nav-more-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--surface-high);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.destination-address {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 4px;
    line-height: 1.3;
}

.destination-customer {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 16px;
}

/* Quick Actions */
.nav-quick-actions {
    display: flex;
    gap: 8px;
}

.quick-action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px;
    border: none;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
}

.quick-action-btn.call {
    background: var(--success);
    color: white;
}

.quick-action-btn.verify {
    background: var(--primary);
    color: white;
}

.quick-action-btn.details {
    background: var(--surface-high);
    color: var(--text-primary);
}

.quick-action-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

/* Destination Details Modal */
.destination-details-modal {
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

.destination-details-modal .modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.8);
    backdrop-filter: blur(10px);
}

.destination-details-modal .modal-content {
    position: relative;
    background: var(--surface-elevated);
    border-radius: 20px;
    max-width: 400px;
    width: 100%;
    max-height: 80vh;
    overflow-y: auto;
}

.destination-details-modal .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid var(--border);
}

.destination-details-modal .modal-header h3 {
    font-size: 20px;
    font-weight: 600;
}

.modal-close {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: var(--surface-high);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.destination-details-modal .modal-body {
    padding: 20px;
}

.detail-section {
    margin-bottom: 20px;
}

.detail-section h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.detail-section p {
    font-size: 16px;
    color: var(--text-primary);
    line-height: 1.4;
}

.detail-section a {
    color: var(--primary);
    text-decoration: none;
}

.code-display {
    font-size: 20px;
    font-weight: 700;
    font-family: monospace;
    background: var(--surface-high);
    padding: 12px;
    border-radius: 8px;
    text-align: center;
}

/* Verification Modal */
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
    animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

.verification-modal .modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.9);
    backdrop-filter: blur(10px);
}

.verification-modal .modal-content {
    position: relative;
    background: var(--surface-elevated);
    border-radius: 24px;
    max-width: 400px;
    width: 100%;
    overflow: hidden;
    animation: slideUpModal 0.3s ease-out;
}

@keyframes slideUpModal {
    from {
        transform: translateY(50px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

.verification-modal .modal-header {
    padding: 24px;
    text-align: center;
    color: white;
}

.verification-modal .modal-header.pickup {
    background: var(--warning);
    color: black;
}

.verification-modal .modal-header.delivery {
    background: var(--primary);
}

.modal-icon {
    font-size: 48px;
    margin-bottom: 12px;
    display: block;
}

.verification-modal h2 {
    font-size: 24px;
    font-weight: 700;
    margin: 0;
}

.verification-modal .modal-body {
    padding: 24px;
}

.stop-summary {
    background: var(--surface-high);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 24px;
}

.stop-summary h3 {
    font-size: 18px;
    margin: 0 0 16px 0;
    color: var(--text-primary);
}

.summary-details {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.summary-row {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 12px;
}

.summary-label {
    font-size: 14px;
    color: var(--text-secondary);
    min-width: 80px;
}

.summary-value {
    font-size: 14px;
    color: var(--text-primary);
    text-align: right;
    flex: 1;
}

.summary-row.instructions {
    flex-direction: column;
    background: rgba(255, 159, 10, 0.1);
    padding: 12px;
    border-radius: 8px;
    border-left: 3px solid var(--warning);
}

.verification-section {
    text-align: center;
}

.verification-section label {
    display: block;
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 12px;
    color: var(--text-primary);
}

.verification-input {
    width: 100%;
    padding: 20px;
    font-size: 32px;
    font-weight: 700;
    text-align: center;
    background: var(--surface-high);
    border: 2px solid var(--border);
    border-radius: 12px;
    color: var(--text-primary);
    letter-spacing: 4px;
    text-transform: uppercase;
    outline: none;
    transition: all 0.3s;
}

.verification-input:focus {
    border-color: var(--primary);
    background: var(--surface);
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
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

.modal-btn.primary {
    background: var(--primary);
    color: white;
}

.modal-btn.secondary {
    background: var(--surface-high);
    color: var(--text-primary);
}

.modal-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

/* Navigation route style */
.navigation-route {
    filter: drop-shadow(0 0 4px rgba(0, 102, 255, 0.8));
}

/* Pulse animation for current location */
@keyframes pulse-animation {
    0% {
        transform: scale(1);
        opacity: 0.7;
    }
    50% {
        transform: scale(1.5);
        opacity: 0.3;
    }
    100% {
        transform: scale(2);
        opacity: 0;
    }
}

.pulse-circle {
    animation: pulse-animation 2s ease-out infinite;
}

/* Notifications */
.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 20px;
    border-radius: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: notificationSlide 0.3s ease-out;
    z-index: 10000;
    max-width: 350px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}

@keyframes notificationSlide {
    from {
        transform: translateX(400px);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

.notification.hiding {
    animation: notificationHide 0.3s ease-out;
}

@keyframes notificationHide {
    from {
        transform: translateX(0);
        opacity: 1;
    }
    to {
        transform: translateX(400px);
        opacity: 0;
    }
}

.notification-icon {
    font-size: 20px;
}

.notification.success {
    background: var(--success);
    color: white;
}

.notification.error {
    background: var(--danger);
    color: white;
}

.notification.warning {
    background: var(--warning);
    color: black;
}

.notification.info {
    background: var(--surface-elevated);
    color: white;
    border: 1px solid var(--border);
}

/* Success Animation */
.success-animation {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--success);
    color: white;
    padding: 40px;
    border-radius: 20px;
    text-align: center;
    z-index: 10000;
    animation: successPop 0.5s ease-out;
}

@keyframes successPop {
    0% {
        transform: translate(-50%, -50%) scale(0);
        opacity: 0;
    }
    50% {
        transform: translate(-50%, -50%) scale(1.1);
    }
    100% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
    }
}

.success-icon {
    font-size: 64px;
    margin-bottom: 16px;
}

.success-text {
    font-size: 24px;
    font-weight: 700;
}

/* Phase Complete Animation */
.phase-complete-animation {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.9);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease-out;
}

.phase-complete-content {
    background: var(--surface-elevated);
    border-radius: 24px;
    padding: 48px;
    text-align: center;
    max-width: 400px;
    animation: slideUpAnimation 0.5s ease-out;
}

@keyframes slideUpAnimation {
    from {
        transform: translateY(50px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

.phase-complete-content .phase-icon {
    font-size: 80px;
    margin-bottom: 24px;
    animation: bounce 1s ease-in-out;
}

@keyframes bounce {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.2); }
}

.phase-complete-content h2 {
    font-size: 32px;
    margin-bottom: 16px;
}

.phase-complete-content p {
    font-size: 18px;
    color: var(--text-secondary);
}

/* Route Complete Animation */
.route-complete-animation {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.95);
    backdrop-filter: blur(20px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease-out;
}

.route-complete-content {
    background: linear-gradient(135deg, var(--surface-elevated) 0%, var(--surface) 100%);
    border-radius: 24px;
    padding: 48px;
    text-align: center;
    max-width: 400px;
    border: 2px solid var(--success);
    animation: completePop 0.8s ease-out;
}

@keyframes completePop {
    0% {
        transform: scale(0) rotate(180deg);
        opacity: 0;
    }
    50% {
        transform: scale(1.1) rotate(-10deg);
    }
    100% {
        transform: scale(1) rotate(0);
        opacity: 1;
    }
}

.complete-icon {
    font-size: 100px;
    margin-bottom: 24px;
    animation: celebrate 2s ease-in-out infinite;
}

@keyframes celebrate {
    0%, 100% { transform: scale(1) rotate(0); }
    25% { transform: scale(1.1) rotate(-5deg); }
    75% { transform: scale(1.1) rotate(5deg); }
}

.route-complete-content h1 {
    font-size: 36px;
    margin-bottom: 16px;
    background: linear-gradient(135deg, var(--primary) 0%, var(--success) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.route-complete-content p {
    font-size: 18px;
    color: var(--text-secondary);
    margin-bottom: 32px;
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
    font-size: 32px;
    font-weight: 700;
    color: var(--primary);
    display: block;
    margin-bottom: 4px;
}

.route-stats .stat-label {
    font-size: 14px;
    color: var(--text-secondary);
}

.complete-btn {
    width: 100%;
    padding: 18px;
    background: var(--success);
    color: white;
    border: none;
    border-radius: 14px;
    font-size: 18px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s;
}

.complete-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(52, 199, 89, 0.4);
}

/* Responsive adjustments */
@media (max-width: 380px) {
    .nav-instruction-card {
        flex-direction: column;
        text-align: center;
    }
    
    .nav-street-name {
        font-size: 20px;
    }
    
    .nav-bottom-info {
        flex-wrap: wrap;
    }
    
    .nav-eta-card,
    .nav-distance-card,
    .nav-speed-card {
        min-width: calc(50% - 6px);
    }
    
    .min-nav-instruction {
        gap: 12px;
    }
    
    .min-nav-direction {
        font-size: 28px;
    }
    
    .min-nav-distance {
        font-size: 20px;
    }
}

/* Animation for closing */
.nav-closing {
    animation: fadeOut 0.3s ease-out;
}

@keyframes fadeOut {
    to {
        opacity: 0;
        transform: translateY(20px);
    }
}

.verification-modal.closing {
    animation: modalFadeOut 0.3s ease-out;
}

@keyframes modalFadeOut {
    to {
        opacity: 0;
    }
}
</style>`;

// Add styles to document if not already present
if (!document.getElementById('route-enhanced-styles')) {
    const styleElement = document.createElement('div');
    styleElement.id = 'route-enhanced-styles';
    styleElement.innerHTML = enhancedStyles;
    document.head.appendChild(styleElement);
}
    background: var(--surface);
    margin: 16px;
    border-radius: 16px;
    border: 1px solid var(--border);
}

.nav-direction-visual {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 80px;
}

.direction-icon-large {
    font-size: 48px;
    line-height: 1;
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
    color: var(--primary);
}

.distance-unit {
    font-size: 14px;
    color: var(--text-secondary);
}

.nav-instruction-text {
    flex: 1;
}

.nav-street-name {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 4px;
    line-height: 1.2;
}

.nav-instruction-detail {
    font-size: 16px;
    color: var(--text-secondary);
}

/* Bottom Info Cards */
.nav-bottom-info {
    display: flex;
    gap: 12px;
    padding: 0 16px;
    margin-bottom: 16px;
}

.nav-eta-card,
.nav-distance-card,
.nav-speed-card {
    flex: 1;
    background: var(--surface-high);
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
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
}

.eta-label,
.distance-label,
.speed-label {
    font-size: 12px;
    color: var(--text-secondary);
}

/* Destination Preview */
.nav-destination-preview {
    position: absolute;
    bottom: 20px;
    left: 20px;
    right: 20px;
    background: var(--surface-elevated);
    border-radius: 20px;
    padding: 20px;
    box-shadow: 0 -4px 20px rgba(0,0,0,0.5);
    border: 1px solid var(--border);
}

.destination-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.destination-type {
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
}

.nav-more-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--surface-high);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.destination-address {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 4px;
    line-height: 1.3;
}

.destination-customer {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 16px;
}

/* Quick Actions */
.nav-quick-actions {
    display: flex;
    gap: 8px;
}

.quick-action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px;
    border: none;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
}

.quick-action-btn.call {
    background: var(--success);
    color: white;
}

.quick-action-btn.verify {
    background: var(--primary);
    color: white;
}

.quick-action-btn.details {
    background: var(--surface-high);
    color: var(--text-primary);
}

.quick-action-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

/* Destination Details Modal */
.destination-details-modal {
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

.destination-details-modal .modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.8);
    backdrop-filter: blur(10px);
}

.destination-details-modal .modal-content {
    position: relative;
    background: var(--surface-elevated);
    border-radius: 20px;
    max-width: 400px;
    width: 100%;
    max-height: 80vh;
    overflow-y: auto;
}

.destination-details-modal .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid var(--border);
}

.destination-details-modal .modal-header h3 {
    font-size: 20px;
    font-weight: 600;
}

.modal-close {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: var(--surface-high);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.destination-details-modal .modal-body {
    padding: 20px;
}

.detail-section {
    margin-bottom: 20px;
}

.detail-section h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.detail-section p {
    font-size: 16px;
    color: var(--text-primary);
    line-height: 1.4;
}

.detail-section a {
    color: var(--primary);
    text-decoration: none;
}

.code-display {
    font-size: 20px;
    font-weight: 700;
    font-family: monospace;
    background: var(--surface-high);
    padding: 12px;
    border-radius: 8px;
    text-align: center;
}

/* Verification Modal */
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
    animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

.verification-modal .modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.9);
    backdrop-filter: blur(10px);
}

.verification-modal .modal-content {
    position: relative;
    background: var(--surface-elevated);
    border-radius: 24px;
    max-width: 400px;
    width: 100%;
    overflow: hidden;
    animation: slideUpModal 0.3s ease-out;
}

@keyframes slideUpModal {
    from {
        transform: translateY(50px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

.verification-modal .modal-header {
    padding: 24px;
    text-align: center;
    color: white;
}

.verification-modal .modal-header.pickup {
    background: var(--warning);
    color: black;
}

.verification-modal .modal-header.delivery {
    background: var(--primary);
}

.modal-icon {
    font-size: 48px;
    margin-bottom: 12px;
    display: block;
}

.verification-modal h2 {
    font-size: 24px;
    font-weight: 700;
    margin: 0;
}

.verification-modal .modal-body {
    padding: 24px;
}

.stop-summary {
    background: var(--surface-high);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 24px;
}

.stop-summary h3 {
    font-size: 18px;
    margin: 0 0 16px 0;
    color: var(--text-primary);
}

.summary-details {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.summary-row {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 12px;
}

.summary-label {
    font-size: 14px;
    color: var(--text-secondary);
    min-width: 80px;
}

.summary-value {
    font-size: 14px;
    color: var(--text-primary);
    text-align: right;
    flex: 1;
}

.summary-row.instructions {
    flex-direction: column;
    background: rgba(255, 159, 10, 0.1);
    padding: 12px;
    border-radius: 8px;
    border-left: 3px solid var(--warning);
}

.verification-section {
    text-align: center;
}

.verification-section label {
    display: block;
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 12px;
    color: var(--text-primary);
}

.verification-input {
    width: 100%;
    padding: 20px;
    font-size: 32px;
    font-weight: 700;
    text-align: center;
    background: var(--surface-high);
    border: 2px solid var(--border);
    border-radius: 12px;
    color: var(--text-primary);
    letter-spacing: 4px;
    text-transform: uppercase;
    outline: none;
    transition: all 0.3s;
}

.verification-input:focus {
    border-color: var(--primary);
    background: var(--surface);
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
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

.modal-btn.primary {
    background: var(--primary);
    color: white;
}

.modal-btn.secondary {
    background: var(--surface-high);
    color: var(--text-primary);
}

.modal-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

/* Navigation route style */
.navigation-route {
    filter: drop-shadow(0 0 4px rgba(0, 102, 255, 0.8));
}

/* Pulse animation for current location */
@keyframes pulse-animation {
    0% {
        transform: scale(1);
        opacity: 0.7;
    }
    50% {
        transform: scale(1.5);
        opacity: 0.3;
    }
    100% {
        transform: scale(2);
        opacity: 0;
    }
}

.pulse-circle {
    animation: pulse-animation 2s ease-out infinite;
}

/* Notifications */
.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 20px;
    border-radius: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: notificationSlide 0.3s ease-out;
    z-index: 10000;
    max-width: 350px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}

@keyframes notificationSlide {
    from {
        transform: translateX(400px);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

.notification.hiding {
    animation: notificationHide 0.3s ease-out;
}

@keyframes notificationHide {
    from {
        transform: translateX(0);
        opacity: 1;
    }
    to {
        transform: translateX(400px);
        opacity: 0;
    }
}

.notification-icon {
    font-size: 20px;
}

.notification.success {
    background: var(--success);
    color: white;
}

.notification.error {
    background: var(--danger);
    color: white;
}

.notification.warning {
    background: var(--warning);
    color: black;
}

.notification.info {
    background: var(--surface-elevated);
    color: white;
    border: 1px solid var(--border);
}

/* Success Animation */
.success-animation {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--success);
    color: white;
    padding: 40px;
    border-radius: 20px;
    text-align: center;
    z-index: 10000;
    animation: successPop 0.5s ease-out;
}

@keyframes successPop {
    0% {
        transform: translate(-50%, -50%) scale(0);
        opacity: 0;
    }
    50% {
        transform: translate(-50%, -50%) scale(1.1);
    }
    100% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
    }
}

.success-icon {
    font-size: 64px;
    margin-bottom: 16px;
}

.success-text {
    font-size: 24px;
    font-weight: 700;
}

/* Phase Complete Animation */
.phase-complete-animation {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.9);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease-out;
}

.phase-complete-content {
    background: var(--surface-elevated);
    border-radius: 24px;
    padding: 48px;
    text-align: center;
    max-width: 400px;
    animation: slideUpAnimation 0.5s ease-out;
}

@keyframes slideUpAnimation {
    from {
        transform: translateY(50px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

.phase-complete-content .phase-icon {
    font-size: 80px;
    margin-bottom: 24px;
    animation: bounce 1s ease-in-out;
}

@keyframes bounce {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.2); }
}

.phase-complete-content h2 {
    font-size: 32px;
    margin-bottom: 16px;
}

.phase-complete-content p {
    font-size: 18px;
    color: var(--text-secondary);
}

/* Route Complete Animation */
.route-complete-animation {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.95);
    backdrop-filter: blur(20px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease-out;
}

.route-complete-content {
    background: linear-gradient(135deg, var(--surface-elevated) 0%, var(--surface) 100%);
    border-radius: 24px;
    padding: 48px;
    text-align: center;
    max-width: 400px;
    border: 2px solid var(--success);
    animation: completePop 0.8s ease-out;
}

@keyframes completePop {
    0% {
        transform: scale(0) rotate(180deg);
        opacity: 0;
    }
    50% {
        transform: scale(1.1) rotate(-10deg);
    }
    100% {
        transform: scale(1) rotate(0);
        opacity: 1;
    }
}

.complete-icon {
    font-size: 100px;
    margin-bottom: 24px;
    animation: celebrate 2s ease-in-out infinite;
}

@keyframes celebrate {
    0%, 100% { transform: scale(1) rotate(0); }
    25% { transform: scale(1.1) rotate(-5deg); }
    75% { transform: scale(1.1) rotate(5deg); }
}

.route-complete-content h1 {
    font-size: 36px;
    margin-bottom: 16px;
    background: linear-gradient(135deg, var(--primary) 0%, var(--success) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.route-complete-content p {
    font-size: 18px;
    color: var(--text-secondary);
    margin-bottom: 32px;
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
    font-size: 32px;
    font-weight: 700;
    color: var(--primary);
    display: block;
    margin-bottom: 4px;
}

.route-stats .stat-label {
    font-size: 14px;
    color: var(--text-secondary);
}

.complete-btn {
    width: 100%;
    padding: 18px;
    background: var(--success);
    color: white;
    border: none;
    border-radius: 14px;
    font-size: 18px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s;
}

.complete-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(52, 199, 89, 0.4);
}

/* Responsive adjustments */
@media (max-width: 380px) {
    .nav-instruction-card {
        flex-direction: column;
        text-align: center;
    }
    
    .nav-street-name {
        font-size: 20px;
    }
    
    .nav-bottom-info {
        flex-wrap: wrap;
    }
    
    .nav-eta-card,
    .nav-distance-card,
    .nav-speed-card {
        min-width: calc(50% - 6px);
    }
}

/* Animation for closing */
.nav-closing {
    animation: fadeOut 0.3s ease-out;
}

@keyframes fadeOut {
    to {
        opacity: 0;
        transform: translateY(20px);
    }
}

.verification-modal.closing {
    animation: modalFadeOut 0.3s ease-out;
}

@keyframes modalFadeOut {
    to {
        opacity: 0;
    }
}
</style>`;

// Add styles to document if not already present
if (!document.getElementById('route-enhanced-styles')) {
    const styleElement = document.createElement('div');
    styleElement.id = 'route-enhanced-styles';
    styleElement.innerHTML = enhancedStyles;
    document.head.appendChild(styleElement);
}

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
    }
};

console.log('Fixed Route.js loaded successfully!');
console.log('Fixes applied:');
console.log('1. Map centers on route bounds properly');
console.log('2. OpenRouteService API errors fixed');
console.log('3. No straight lines drawn initially');
console.log('4. Enhanced UI with Tuma theme');
console.log('5. Better navigation than Uber/Bolt');
console.log('6. Dashboard hides during navigation');
console.log('7. Optimize button now toggles route details');
console.log('Debug: routeDebug.testOpenRoute()');
