/**
 * Enhanced Route Navigation Module with OpenRouteService
 * Free routing solution using OpenStreetMap and OpenRouteService
 */

// State management
const state = {
    activeRoute: null,
    currentLocation: null,
    map: null,
    markers: [],
    routePolyline: null,
    isTracking: false,
    currentStopIndex: 0,
    parcelsInPossession: [],
    trackingInterval: null,
    proximityNotified: false,
    routeControl: null
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
            
            // Plot route on map
            await plotRoute();
            
            // Show route panel
            showRoutePanel();
            
            // Enhance route panel
            enhanceRoutePanel();
            
            // Start location tracking
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

// Initialize Leaflet Map with OpenStreetMap
async function initializeMap() {
    console.log('Initializing Leaflet map...');
    
    // Create map centered on Nairobi
    state.map = L.map('map').setView([-1.2921, 36.8219], 13);
    
    // Add OpenStreetMap tile layer (free)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(state.map);
    
    console.log('Map initialized');
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
        panelHandle.addEventListener('click', togglePanel);
        
        // Add visual indicator
        panelHandle.innerHTML = `
            <div style="width: 40px; height: 4px; background: var(--text-tertiary); border-radius: 2px; margin: 0 auto;"></div>
            <div style="font-size: 10px; color: var(--text-tertiary); margin-top: 4px;">Tap to expand</div>
        `;
    }
    
    function togglePanel() {
        isPanelCollapsed = !isPanelCollapsed;
        
        if (isPanelCollapsed) {
            routePanel.style.transform = 'translateY(calc(100% - 140px))';
            routePanel.style.maxHeight = '140px';
            panelHandle.innerHTML = `
                <div style="width: 40px; height: 4px; background: var(--text-tertiary); border-radius: 2px; margin: 0 auto;"></div>
                <div style="font-size: 10px; color: var(--text-tertiary); margin-top: 4px;">Tap to expand</div>
            `;
        } else {
            routePanel.style.transform = 'translateY(0)';
            routePanel.style.maxHeight = '70%';
            panelHandle.innerHTML = `
                <div style="width: 40px; height: 4px; background: var(--text-tertiary); border-radius: 2px; margin: 0 auto;"></div>
                <div style="font-size: 10px; color: var(--text-tertiary); margin-top: 4px;">Tap to collapse</div>
            `;
        }
    }
    
    // Start with panel partially collapsed to show map
    setTimeout(() => {
        isPanelCollapsed = true;
        routePanel.style.transform = 'translateY(calc(100% - 140px))';
        routePanel.style.maxHeight = '140px';
    }, 1000);
}

// Create custom Leaflet icon
function createLeafletIcon(stop) {
    const color = stop.completed ? '#666' : stop.type === 'pickup' ? '#FF9F0A' : '#34C759';
    const symbol = stop.completed ? '✓' : stop.type === 'pickup' ? 'P' : 'D';
    
    return L.divIcon({
        className: 'custom-marker',
        html: `
            <div class="stop-marker-wrapper ${stop.completed ? 'completed' : ''} ${isNextStop(stop) ? 'active' : ''}">
                <div class="stop-marker ${stop.type}" style="background: ${color}; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 10px rgba(0,0,0,0.3); border: 3px solid white;">
                    <span class="marker-number" style="color: white; font-weight: bold; font-size: 18px;">${symbol}</span>
                    ${isNextStop(stop) ? '<div class="marker-pulse"></div>' : ''}
                </div>
                <div class="marker-label" style="position: absolute; top: 45px; left: 50%; transform: translateX(-50%); background: var(--surface-elevated); padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap; border: 1px solid var(--border);">${stop.type === 'pickup' ? 'Pickup' : 'Delivery'}</div>
            </div>
        `,
        iconSize: [40, 60],
        iconAnchor: [20, 50],
        popupAnchor: [0, -50]
    });
}

// Create popup content
function createStopPopup(stop) {
    return `
        <div class="stop-popup" style="min-width: 250px;">
            <div class="popup-header ${stop.type}" style="padding: 12px 16px; color: white; background: ${stop.type === 'pickup' ? '#FF9F0A' : '#34C759'}; margin: -15px -15px 12px -15px; border-radius: 12px 12px 0 0;">
                <span class="popup-phase">${stop.type.toUpperCase()}</span>
                <span class="popup-code" style="float: right;">${stop.parcelCode}</span>
            </div>
            <div class="popup-body">
                <h3 style="margin: 0 0 12px 0; font-size: 16px;">${stop.address}</h3>
                <div class="popup-info">
                    <div class="info-row" style="margin-bottom: 8px;">
                        <span class="info-icon">👤</span>
                        <span>${stop.customerName}</span>
                    </div>
                    <div class="info-row" style="margin-bottom: 8px;">
                        <span class="info-icon">📞</span>
                        <a href="tel:${stop.customerPhone}" style="color: #0066FF; text-decoration: none;">${stop.customerPhone}</a>
                    </div>
                    ${stop.specialInstructions ? `
                        <div class="info-row instructions" style="background: rgba(255, 159, 10, 0.1); padding: 8px; border-radius: 8px;">
                            <span class="info-icon">💬</span>
                            <span>${stop.specialInstructions}</span>
                        </div>
                    ` : ''}
                </div>
                ${!stop.completed && canCompleteStop(stop) ? `
                    <div class="popup-actions" style="margin-top: 16px;">
                        <button onclick="openVerificationModal('${stop.id}')" style="width: 100%; padding: 12px; background: #0066FF; color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; margin-bottom: 8px;">
                            ✓ Verify ${stop.type}
                        </button>
                        <button onclick="navigateToStop('${stop.id}')" style="width: 100%; padding: 12px; background: var(--surface-high); color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer;">
                            🧭 Navigate
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

// Plot route on map with OpenRouteService
async function plotRoute() {
    if (!state.map || !state.activeRoute || !state.activeRoute.stops) return;
    
    // Clear existing markers and routes
    state.markers.forEach(marker => marker.remove());
    state.markers = [];
    if (state.routePolyline) {
        state.routePolyline.remove();
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
    
    // Fit map to show all markers
    state.map.fitBounds(bounds, { padding: [50, 50] });
    
    // Draw optimized route
    await drawOptimizedRoute();
}

// Draw optimized route using OpenRouteService
async function drawOptimizedRoute() {
    if (!state.activeRoute) return;
    
    const stops = state.activeRoute.stops.filter(s => !s.completed);
    if (stops.length < 2) return;
    
    try {
        // Prepare coordinates for OpenRouteService
        const coordinates = stops.map(stop => [stop.location.lng, stop.location.lat]);
        
        // Call OpenRouteService Directions API
        const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': OPENROUTE_API_KEY
            },
            body: JSON.stringify({
                coordinates: coordinates,
                // Only optimize if we have more than 2 stops (exclude first and last)
                optimize_waypoints: stops.length > 2
            })
        });
        
        if (!response.ok) {
            throw new Error('OpenRouteService API error');
        }
        
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            
            // Decode the geometry
            const decodedCoords = decodePolyline(route.geometry);
            
            // Draw the route
            state.routePolyline = L.polyline(decodedCoords, {
                color: '#0066FF',
                weight: 5,
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
        // Fallback to straight lines
        drawStraightLines();
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

// Fallback: Draw straight lines
function drawStraightLines() {
    if (!state.map || !state.activeRoute) return;
    
    const coordinates = [];
    const stops = state.activeRoute.stops.filter(s => !s.completed);
    
    stops.forEach(stop => {
        coordinates.push([stop.location.lat, stop.location.lng]);
    });
    
    if (coordinates.length > 1) {
        state.routePolyline = L.polyline(coordinates, {
            color: '#0066FF',
            weight: 4,
            opacity: 0.8,
            dashArray: '10, 10'
        }).addTo(state.map);
    }
}

// Display route information
function displayRouteInfo() {
    if (!state.activeRoute) return;
    
    // Update header
    const routeTitle = document.getElementById('routeTitle');
    const routeType = document.getElementById('routeType');
    
    if (routeTitle) {
        routeTitle.textContent = state.activeRoute.name || 'Active Route';
    }
    
    // Update route type badge - now as a verify button
    if (routeType) {
        const nextStop = getNextStop();
        if (nextStop) {
            routeType.className = `route-badge verify-btn ${nextStop.type}`;
            routeType.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 4px;">
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
            <h3 class="phase-title">
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
            <h3 class="phase-title">
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
                <span style="font-weight: 600;">Carrying ${state.parcelsInPossession.length} parcel${state.parcelsInPossession.length > 1 ? 's' : ''}</span>
            </div>
            <div class="parcel-cards" style="display: flex; flex-direction: column; gap: 8px;">
                ${state.parcelsInPossession.map(parcel => `
                    <div class="parcel-card" style="background: var(--surface-elevated); border-radius: 8px; padding: 12px; border-left: 3px solid var(--warning);">
                        <div class="parcel-code" style="font-weight: 600; margin-bottom: 4px;">${parcel.parcelCode}</div>
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

window.optimizeRoute = async function() {
    showNotification('Optimizing route...', 'info');
    await drawOptimizedRoute();
};

window.startNavigation = function() {
    const nextStop = getNextStop();
    if (!nextStop) {
        showNotification('No stops to navigate to', 'warning');
        return;
    }
    
    // Enable continuous tracking
    startContinuousTracking();
    
    // Show navigation mode
    showNavigationMode(nextStop);
};

// In-app navigation mode
function showNavigationMode(targetStop) {
    // Create navigation overlay
    const navOverlay = document.createElement('div');
    navOverlay.className = 'navigation-overlay';
    navOverlay.innerHTML = `
        <div class="nav-header">
            <button class="nav-close" onclick="exitNavigationMode()">✕</button>
            <div class="nav-title">Navigating to ${targetStop.type === 'pickup' ? 'Pickup' : 'Delivery'}</div>
        </div>
        <div class="nav-instructions">
            <div class="nav-direction-icon">➡️</div>
            <div class="nav-instruction-text">Calculating route...</div>
            <div class="nav-distance">-- m</div>
        </div>
        <div class="nav-eta">
            <span class="eta-label">ETA:</span>
            <span class="eta-time">--:--</span>
        </div>
        <div class="nav-destination">
            <div class="destination-icon">${targetStop.type === 'pickup' ? '📦' : '📍'}</div>
            <div class="destination-info">
                <div class="destination-address">${targetStop.address}</div>
                <div class="destination-name">${targetStop.customerName} • ${targetStop.parcelCode}</div>
            </div>
        </div>
        <div class="nav-actions">
            <button class="nav-action-btn" onclick="openWaze('${targetStop.id}')">
                <span>Open in Waze</span>
            </button>
            <button class="nav-action-btn" onclick="openGoogleMaps('${targetStop.id}')">
                <span>Open in Google Maps</span>
            </button>
        </div>
    `;
    
    document.body.appendChild(navOverlay);
    
    // Start navigation updates
    updateNavigation(targetStop);
    
    // Get turn-by-turn directions
    getDirectionsToStop(targetStop);
}

// Get directions using OpenRouteService
async function getDirectionsToStop(targetStop) {
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
                const nextInstruction = route.segments[0]?.steps[0];
                
                if (nextInstruction) {
                    const instructionText = document.querySelector('.nav-instruction-text');
                    if (instructionText) {
                        instructionText.textContent = nextInstruction.instruction;
                    }
                    
                    // Update direction icon based on instruction type
                    const directionIcon = document.querySelector('.nav-direction-icon');
                    if (directionIcon) {
                        directionIcon.textContent = getDirectionIcon(nextInstruction.type);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error getting directions:', error);
    }
}

// Get direction icon based on instruction type
function getDirectionIcon(type) {
    const icons = {
        0: '➡️',  // Left
        1: '➡️',  // Right  
        2: '⬅️',  // Sharp left
        3: '➡️',  // Sharp right
        4: '⬅️',  // Slight left
        5: '➡️',  // Slight right
        6: '⬆️',  // Straight
        7: '🔄',  // Enter roundabout
        8: '🔄',  // Exit roundabout
        9: '📍',  // U-turn
        10: '✓',  // Goal
        11: '🚦', // Depart
        12: '⬅️', // Keep left
        13: '➡️'  // Keep right
    };
    
    return icons[type] || '➡️';
}

// Update navigation in real-time
function updateNavigation(targetStop) {
    if (!state.currentLocation) {
        setTimeout(() => updateNavigation(targetStop), 1000);
        return;
    }
    
    const distance = calculateDistance(
        state.currentLocation,
        targetStop.location
    );
    
    const eta = calculateETA(distance);
    
    // Update UI
    const instructionText = document.querySelector('.nav-instruction-text');
    const distanceText = document.querySelector('.nav-distance');
    const etaTime = document.querySelector('.eta-time');
    
    if (instructionText) {
        if (distance < 0.05) { // Within 50 meters
            instructionText.textContent = 'You have arrived!';
            document.querySelector('.nav-direction-icon').textContent = '✓';
            
            // Auto-open verification after arrival
            setTimeout(() => {
                exitNavigationMode();
                openVerificationModal(targetStop.id);
            }, 2000);
        } else if (distance < 0.2) { // Within 200 meters
            instructionText.textContent = 'Destination is nearby';
            document.querySelector('.nav-direction-icon').textContent = '📍';
        }
    }
    
    if (distanceText) {
        distanceText.textContent = distance < 1 ? 
            `${Math.round(distance * 1000)} m` : 
            `${distance.toFixed(1)} km`;
    }
    
    if (etaTime) {
        etaTime.textContent = eta;
    }
    
    // Continue updating if navigation is active
    if (document.querySelector('.navigation-overlay')) {
        setTimeout(() => updateNavigation(targetStop), 3000);
        
        // Update directions every 10 seconds
        if (!state.lastDirectionUpdate || Date.now() - state.lastDirectionUpdate > 10000) {
            getDirectionsToStop(targetStop);
            state.lastDirectionUpdate = Date.now();
        }
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

// Exit navigation mode
window.exitNavigationMode = function() {
    const overlay = document.querySelector('.navigation-overlay');
    if (overlay) {
        overlay.remove();
    }
    
    // Stop continuous tracking
    if (state.trackingInterval) {
        clearInterval(state.trackingInterval);
        state.trackingInterval = null;
    }
};

// Open in external apps
window.openWaze = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop) return;
    
    const wazeUrl = `https://waze.com/ul?ll=${stop.location.lat},${stop.location.lng}&navigate=yes`;
    window.open(wazeUrl, '_blank');
};

window.openGoogleMaps = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop) return;
    
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${stop.location.lat},${stop.location.lng}`;
    window.open(mapsUrl, '_blank');
};

// Navigate to stop
window.navigateToStop = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop) return;
    
    // Show in-app navigation instead of opening external map
    showNavigationMode(stop);
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
    plotRoute();
    
    // Check if phase complete
    checkPhaseCompletion();
    
    // Check if route complete
    if (state.activeRoute.stops.every(s => s.completed)) {
        completeRoute();
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

// Add navigation styles
const navStyles = `
<style>
.navigation-overlay {
    position: fixed;
    top: 80px;
    left: 20px;
    right: 20px;
    background: var(--surface-elevated);
    border-radius: 20px;
    padding: 20px;
    z-index: 1000;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
    max-width: 400px;
    margin: 0 auto;
}

.nav-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}

.nav-close {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--surface-high);
    color: white;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.nav-title {
    font-size: 16px;
    font-weight: 600;
    flex: 1;
    text-align: center;
}

.nav-instructions {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px;
    background: var(--surface-high);
    border-radius: 16px;
    margin-bottom: 16px;
}

.nav-direction-icon {
    font-size: 32px;
}

.nav-instruction-text {
    flex: 1;
    font-size: 18px;
    font-weight: 600;
}

.nav-distance {
    font-size: 16px;
    color: var(--text-secondary);
}

.nav-eta {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 20px;
    font-size: 14px;
}

.eta-label {
    color: var(--text-secondary);
}

.eta-time {
    font-weight: 600;
    color: var(--primary);
}

.nav-destination {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: var(--surface-high);
    border-radius: 12px;
    margin-bottom: 20px;
}

.destination-icon {
    font-size: 24px;
}

.destination-info {
    flex: 1;
}

.destination-address {
    font-weight: 600;
    margin-bottom: 4px;
}

.destination-name {
    font-size: 14px;
    color: var(--text-secondary);
}

.nav-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}

.nav-action-btn {
    padding: 12px;
    border: none;
    border-radius: 10px;
    background: var(--surface-high);
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
}

.nav-action-btn:hover {
    background: var(--primary);
}

/* Make route panel more mobile friendly */
.route-panel {
    transition: transform 0.3s ease, max-height 0.3s ease;
    box-shadow: 0 -5px 20px rgba(0,0,0,0.3);
}

.panel-handle {
    padding: 8px;
    text-align: center;
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

@media (max-width: 428px) {
    .navigation-overlay {
        top: 70px;
        left: 10px;
        right: 10px;
    }
}
</style>`;

// Add styles to document
if (!document.getElementById('navigation-styles')) {
    const styleElement = document.createElement('div');
    styleElement.id = 'navigation-styles';
    styleElement.innerHTML = navStyles;
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

console.log('Route.js with OpenRouteService loaded successfully!');
console.log('Debug commands: routeDebug.reloadRoute(), routeDebug.simulatePickup(), routeDebug.clearRoute(), routeDebug.testOpenRoute()');
