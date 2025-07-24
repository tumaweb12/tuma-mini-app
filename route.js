/**
 * Complete Enhanced Route Navigation Module with OpenRouteService
 * Fixed version with all requested improvements
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

// Exit enhanced navigation
window.exitEnhancedNavigation = function() {
    const nav = document.querySelector('.enhanced-navigation');
    if (nav) {
        nav.classList.add('nav-closing');
        setTimeout(() => nav.remove(), 300);
    }
    
    state.navigationActive = false;
    
    // Show route panel again
    const routePanel = document.getElementById('routePanel');
    if (routePanel) {
        routePanel.style.display = 'block';
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
console.log('Debug: window.routeDebug.testOpenRoute()');
