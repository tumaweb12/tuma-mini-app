/**
 * Complete Route Page Script with Multi-Stop Support
 * Handles route navigation, map display, and multi-pickup/delivery flow
 */

import { DEFAULT_MAP_CENTER } from './config.js';
import { routesDB, parcelsDB, ridersDB } from './supabaseClient.js';
import { 
  initializeMap, 
  addMarker, 
  drawRoute, 
  getRoute,
  optimizeRoute,
  fitMapToBounds,
  watchLocation,
  stopWatchingLocation,
  createRouteSummaryPopup
} from './mapUtils.js';
import { notifications, haptic } from './businessLogic.js';

// State management
const state = {
  map: null,
  currentRoute: null,
  markers: [],
  routeLayer: null,
  userMarker: null,
  userLocation: null,
  watchId: null,
  isNavigating: false
};

// DOM elements
const elements = {
  routeTitle: document.getElementById('routeTitle'),
  routeType: document.getElementById('routeType'),
  trackingIndicator: document.getElementById('trackingIndicator'),
  emptyState: document.getElementById('emptyState'),
  routePanel: document.getElementById('routePanel'),
  navControls: document.getElementById('navControls'),
  remainingStops: document.getElementById('remainingStops'),
  totalDistance: document.getElementById('totalDistance'),
  estimatedTime: document.getElementById('estimatedTime'),
  stopsList: document.getElementById('stopsList')
};

// Initialize page
async function initialize() {
  // Initialize map
  state.map = initializeMap('map', {
    center: DEFAULT_MAP_CENTER,
    zoom: 13
  });
  
  // Check for active route
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('active') === 'true') {
    await loadActiveRoute();
  } else {
    // Load sample route for demo
    loadSampleRoute();
  }
  
  setupEventListeners();
  initializeTelegramWebApp();
  addEnhancedStyles();
}

// Load active route from storage
async function loadActiveRoute() {
  try {
    // Get stored route data from rider dashboard
    const storedRoute = localStorage.getItem('tuma_active_route');
    if (!storedRoute) {
      showEmptyState();
      return;
    }
    
    const routeData = JSON.parse(storedRoute);
    
    // Convert to route format with enhanced stop information
    state.currentRoute = {
      id: routeData.id,
      name: routeData.name,
      type: routeData.type,
      stops: routeData.stops || [],
      parcels: routeData.parcels || []
    };
    
    displayEnhancedRoute();
    
  } catch (error) {
    console.error('Error loading active route:', error);
    loadSampleRoute(); // Fallback to sample
  }
}

// Get rider ID
function getRiderId() {
  return localStorage.getItem('tuma_rider_id') || 'demo-rider-001';
}

// Load sample route for demo
function loadSampleRoute() {
  state.currentRoute = {
    id: 1,
    name: 'Westlands Smart Route',
    type: 'smart',
    stops: [
      {
        id: '1-pickup',
        parcelId: '1',
        type: 'pickup',
        address: 'Sarit Centre, Westlands',
        location: { lat: -1.2635, lng: 36.8034 },
        parcelCode: 'PRC-A1B2C3',
        verificationCode: 'PKP-1234',
        customerName: 'John Sender',
        customerPhone: '+254712345678',
        completed: false
      },
      {
        id: '2-pickup',
        parcelId: '2',
        type: 'pickup',
        address: 'The Mall Westlands',
        location: { lat: -1.2602, lng: 36.8032 },
        parcelCode: 'PRC-D4E5F6',
        verificationCode: 'PKP-5678',
        customerName: 'Jane Sender',
        customerPhone: '+254723456789',
        completed: false
      },
      {
        id: '3-pickup',
        parcelId: '3',
        type: 'pickup',
        address: 'Westgate Mall',
        location: { lat: -1.2569, lng: 36.8035 },
        parcelCode: 'PRC-G7H8I9',
        verificationCode: 'PKP-9012',
        customerName: 'Mike Sender',
        customerPhone: '+254734567890',
        completed: false
      },
      {
        id: '1-delivery',
        parcelId: '1',
        type: 'delivery',
        address: 'Parklands, Nairobi',
        location: { lat: -1.2624, lng: 36.8129 },
        parcelCode: 'PRC-A1B2C3',
        verificationCode: 'DLV-1234',
        customerName: 'Alice Receiver',
        customerPhone: '+254745678901',
        completed: false,
        dependsOn: '1-pickup'
      },
      {
        id: '2-delivery',
        parcelId: '2',
        type: 'delivery',
        address: 'Kileleshwa',
        location: { lat: -1.2741, lng: 36.7810 },
        parcelCode: 'PRC-D4E5F6',
        verificationCode: 'DLV-5678',
        customerName: 'Bob Receiver',
        customerPhone: '+254756789012',
        completed: false,
        dependsOn: '2-pickup'
      },
      {
        id: '3-delivery',
        parcelId: '3',
        type: 'delivery',
        address: 'Lavington',
        location: { lat: -1.2789, lng: 36.7772 },
        parcelCode: 'PRC-G7H8I9',
        verificationCode: 'DLV-9012',
        customerName: 'Carol Receiver',
        customerPhone: '+254767890123',
        completed: false,
        dependsOn: '3-pickup'
      }
    ]
  };
  
  displayEnhancedRoute();
}

// Enhanced route display
function displayEnhancedRoute() {
  elements.emptyState.style.display = 'none';
  elements.routePanel.style.display = 'block';
  elements.navControls.style.display = 'flex';
  elements.trackingIndicator.style.display = 'flex';
  
  elements.routeTitle.textContent = state.currentRoute.name;
  elements.routeType.textContent = state.currentRoute.type.toUpperCase();
  
  // Add multi-stop specific UI elements
  addRoutePhases();
  addParcelsInPossessionWidget();
  
  displayEnhancedStops();
  plotEnhancedRoute();
  startTracking();
}

// Show empty state
function showEmptyState() {
  elements.emptyState.style.display = 'block';
  elements.routePanel.style.display = 'none';
  elements.navControls.style.display = 'none';
  elements.trackingIndicator.style.display = 'none';
}

// Add route phases display
function addRoutePhases() {
  if (!state.currentRoute.stops) return;
  
  const pickups = state.currentRoute.stops.filter(s => s.type === 'pickup');
  const deliveries = state.currentRoute.stops.filter(s => s.type === 'delivery');
  const parcelsInPossession = getParcelsInPossession();
  
  const phasesHTML = `
    <div class="route-phases">
      <div class="phase ${pickups.some(p => !p.completed) ? 'active' : 'completed'}">
        <div class="phase-icon">📦</div>
        <div class="phase-info">
          <div class="phase-title">Pickups</div>
          <div class="phase-progress">${pickups.filter(p => p.completed).length}/${pickups.length}</div>
        </div>
      </div>
      
      <div class="phase-arrow ${pickups.every(p => p.completed) ? 'active' : ''}">→</div>
      
      <div class="phase ${deliveries.some(d => !d.completed) && pickups.every(p => p.completed) ? 'active' : 
                          deliveries.every(d => d.completed) ? 'completed' : 'pending'}">
        <div class="phase-icon">📍</div>
        <div class="phase-info">
          <div class="phase-title">Deliveries</div>
          <div class="phase-progress">${deliveries.filter(d => d.completed).length}/${deliveries.length}</div>
        </div>
      </div>
    </div>
    
    ${parcelsInPossession.length > 0 ? `
      <div class="carrying-banner">
        <span class="carrying-icon">🎒</span>
        <span>Carrying ${parcelsInPossession.length} parcel${parcelsInPossession.length > 1 ? 's' : ''}</span>
      </div>
    ` : ''}
  `;
  
  // Insert after route stats
  const routeStats = document.querySelector('.route-stats');
  if (routeStats) {
    const existingPhases = document.querySelector('.route-phases');
    const existingBanner = document.querySelector('.carrying-banner');
    
    if (existingPhases) existingPhases.remove();
    if (existingBanner) existingBanner.remove();
    
    routeStats.insertAdjacentHTML('afterend', phasesHTML);
  }
}

// Add parcels in possession widget
function addParcelsInPossessionWidget() {
  const parcelsInPossession = getParcelsInPossession();
  
  const existingWidget = document.querySelector('.parcels-possession-widget');
  if (existingWidget) existingWidget.remove();
  
  if (parcelsInPossession.length === 0) return;
  
  const widgetHTML = `
    <div class="parcels-possession-widget">
      <h3 class="widget-title">Parcels in Hand</h3>
      <div class="parcels-grid">
        ${parcelsInPossession.map(parcel => `
          <div class="parcel-card">
            <div class="parcel-code">${parcel.parcelCode}</div>
            <div class="parcel-time">Picked up ${formatTimeAgo(parcel.pickupTime)}</div>
            <div class="parcel-destination">→ ${parcel.destination}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  // Insert before stops list
  const stopsHeader = document.querySelector('.stops-header');
  if (stopsHeader) {
    stopsHeader.insertAdjacentHTML('beforebegin', widgetHTML);
  }
}

// Get parcels currently in possession
function getParcelsInPossession() {
  const inPossession = [];
  
  state.currentRoute.stops.forEach(stop => {
    if (stop.type === 'pickup' && stop.completed) {
      const deliveryStop = state.currentRoute.stops.find(s => 
        s.type === 'delivery' && s.parcelId === stop.parcelId
      );
      
      if (deliveryStop && !deliveryStop.completed) {
        inPossession.push({
          parcelId: stop.parcelId,
          parcelCode: stop.parcelCode,
          pickupTime: stop.timestamp,
          destination: deliveryStop.address
        });
      }
    }
  });
  
  return inPossession;
}

// Display enhanced stops
function displayEnhancedStops() {
  const stats = calculateRouteStats();
  
  elements.remainingStops.textContent = stats.remainingStops;
  elements.totalDistance.textContent = stats.totalDistance.toFixed(1);
  elements.estimatedTime.textContent = stats.estimatedTime;
  
  // Create enhanced stop list
  elements.stopsList.innerHTML = state.currentRoute.stops.map((stop, index) => {
    const isActive = state.currentRoute.stops.filter(s => !s.completed)[0]?.id === stop.id;
    const canComplete = canCompleteStop(stop);
    const isBlocked = stop.type === 'delivery' && !canComplete;
    
    return `
      <div class="stop-item ${stop.completed ? 'completed' : ''} 
                            ${isActive ? 'active' : ''} 
                            ${isBlocked ? 'blocked' : ''}"
           data-stop-id="${stop.id}">
        <div class="stop-connector ${index === 0 ? 'first' : ''} ${index === state.currentRoute.stops.length - 1 ? 'last' : ''}"></div>
        <div class="stop-content">
          <div class="stop-number">${stop.completed ? '✓' : index + 1}</div>
          <div class="stop-details">
            <div class="stop-type ${stop.type}">
              ${stop.type === 'pickup' ? '📦 PICKUP' : '📍 DELIVERY'}
            </div>
            <div class="stop-address">${stop.address}</div>
            <div class="stop-info">
              <span class="stop-code">Code: ${stop.parcelCode}</span>
              ${stop.customerPhone ? `
                <a href="tel:${stop.customerPhone}" class="stop-phone">
                  📞 Call
                </a>
              ` : ''}
            </div>
            ${isBlocked ? 
              '<div class="stop-blocked-message">⚠️ Complete pickup first</div>' : 
              ''}
            ${stop.specialInstructions ? 
              `<div class="stop-instructions">📝 ${stop.specialInstructions}</div>` : 
              ''}
          </div>
          <button class="stop-action" 
                  onclick="navigateToStop('${stop.id}')" 
                  ${stop.completed || isBlocked ? 'disabled' : ''}>
            ${stop.completed ? '✓' : '🧭'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Check if stop can be completed
function canCompleteStop(stop) {
  if (stop.type === 'delivery' && stop.dependsOn) {
    const pickupStop = state.currentRoute.stops.find(s => s.id === stop.dependsOn);
    return pickupStop && pickupStop.completed;
  }
  return true;
}

// Calculate route statistics
function calculateRouteStats() {
  const activeStops = state.currentRoute.stops.filter(s => !s.completed);
  const completedStops = state.currentRoute.stops.filter(s => s.completed);
  
  return {
    totalStops: state.currentRoute.stops.length,
    completedStops: completedStops.length,
    remainingStops: activeStops.length,
    progress: Math.round((completedStops.length / state.currentRoute.stops.length) * 100),
    estimatedTime: activeStops.length * 10, // 10 min per stop estimate
    totalDistance: 0 // Will be calculated from route
  };
}

// Enhanced route plotting
async function plotEnhancedRoute() {
  // Clear existing markers and routes
  state.markers.forEach(marker => marker.remove());
  state.markers = [];
  
  if (state.routeLayer) {
    state.map.removeLayer(state.routeLayer);
  }
  
  // Add markers for each stop with custom icons
  state.currentRoute.stops.forEach((stop, index) => {
    const icon = createStopIcon(index + 1, stop.type, stop.completed);
    
    const marker = L.marker([stop.location.lat, stop.location.lng], { icon })
      .bindPopup(`
        <div class="stop-popup">
          <strong>Stop ${index + 1}: ${stop.type.toUpperCase()}</strong><br>
          ${stop.address}<br>
          <em>Code: ${stop.parcelCode}</em><br>
          ${!stop.completed && canCompleteStop(stop) ? 
            `<button class="popup-action-btn" onclick="verifyStop('${stop.id}')">
              Verify & Complete
            </button>` : 
            stop.completed ? '<span class="completed-label">✓ Completed</span>' :
            '<span class="blocked-label">⚠️ Complete pickup first</span>'
          }
        </div>
      `);
    
    marker.addTo(state.map);
    state.markers.push(marker);
  });
  
  // Draw optimized route through all stops
  if (state.currentRoute.stops.length > 1) {
    const waypoints = state.currentRoute.stops
      .filter(s => !s.completed)
      .map(s => [s.location.lat, s.location.lng]);
    
    if (waypoints.length > 0) {
      // Add current location as starting point if available
      if (state.userLocation) {
        waypoints.unshift([state.userLocation.lat, state.userLocation.lng]);
      }
      
      // Draw route line
      state.routeLayer = L.polyline(waypoints, {
        color: '#0066FF',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 10',
        className: 'animated-route'
      }).addTo(state.map);
      
      // Calculate total distance
      let totalDistance = 0;
      for (let i = 0; i < waypoints.length - 1; i++) {
        totalDistance += calculateDistance(
          { lat: waypoints[i][0], lng: waypoints[i][1] },
          { lat: waypoints[i + 1][0], lng: waypoints[i + 1][1] }
        );
      }
      
      elements.totalDistance.textContent = totalDistance.toFixed(1);
    }
  }
  
  // Fit map to show all markers
  if (state.markers.length > 0) {
    const group = new L.featureGroup(state.markers);
    state.map.fitBounds(group.getBounds().pad(0.1));
  }
}

// Create custom stop icon
function createStopIcon(number, type, completed) {
  const color = completed ? '#666' : type === 'pickup' ? '#FF9F0A' : '#34C759';
  
  return L.divIcon({
    className: 'custom-stop-marker',
    html: `
      <div class="stop-marker ${type} ${completed ? 'completed' : ''}">
        <span class="marker-number">${completed ? '✓' : number}</span>
      </div>
    `,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -35]
  });
}

// Start tracking user location
function startTracking() {
  state.watchId = watchLocation(
    (location) => {
      state.userLocation = location;
      updateUserMarker();
      checkProximityToStops();
    },
    (error) => {
      console.error('Location tracking error:', error);
    }
  );
}

// Update user marker
function updateUserMarker() {
  if (!state.userLocation) return;
  
  if (!state.userMarker) {
    state.userMarker = addMarker(
      state.map, 
      state.userLocation.lat, 
      state.userLocation.lng, 
      {
        type: 'rider',
        title: 'Your Location'
      }
    );
  } else {
    state.userMarker.setLatLng([state.userLocation.lat, state.userLocation.lng]);
  }
}

// Check proximity to stops
function checkProximityToStops() {
  if (!state.userLocation || !state.currentRoute) return;
  
  const activeStops = state.currentRoute.stops.filter(s => !s.completed && canCompleteStop(s));
  
  activeStops.forEach((stop, index) => {
    const distance = calculateDistance(state.userLocation, stop.location);
    
    // Update distance on stop card
    const stopElement = document.querySelector(`[data-stop-id="${stop.id}"] .stop-distance`);
    if (stopElement) {
      stopElement.textContent = `${distance.toFixed(1)} km away`;
    }
    
    // Alert when near stop
    if (distance < 0.1) { // Within 100 meters
      if (!stop.notified) {
        stop.notified = true;
        showNotification(
          `Arriving at ${stop.type} location: ${stop.address}`,
          'info'
        );
        haptic('success');
      }
    }
  });
}

// Calculate distance between two points (in km)
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

// Setup event listeners
function setupEventListeners() {
  // Handle panel dragging
  setupPanelDragging();
}

// Setup panel dragging
function setupPanelDragging() {
  let isPanelDragging = false;
  let startY = 0;
  let panelHeight = 0;
  
  const panelHandle = document.querySelector('.panel-handle');
  
  if (panelHandle) {
    panelHandle.addEventListener('touchstart', (e) => {
      isPanelDragging = true;
      startY = e.touches[0].clientY;
      panelHeight = elements.routePanel.offsetHeight;
      elements.routePanel.style.transition = 'none';
    });
    
    document.addEventListener('touchmove', (e) => {
      if (!isPanelDragging) return;
      
      const currentY = e.touches[0].clientY;
      const deltaY = currentY - startY;
      const newHeight = Math.max(200, Math.min(window.innerHeight * 0.7, panelHeight - deltaY));
      
      elements.routePanel.style.height = `${newHeight}px`;
    });
    
    document.addEventListener('touchend', () => {
      if (!isPanelDragging) return;
      
      isPanelDragging = false;
      elements.routePanel.style.transition = 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      
      // Snap to positions
      const currentHeight = elements.routePanel.offsetHeight;
      const windowHeight = window.innerHeight;
      
      if (currentHeight < windowHeight * 0.3) {
        elements.routePanel.style.height = '200px';
      } else if (currentHeight > windowHeight * 0.5) {
        elements.routePanel.style.height = '70%';
      } else {
        elements.routePanel.style.height = '40%';
      }
    });
  }
}

// Initialize Telegram Web App
function initializeTelegramWebApp() {
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    
    // Configure back button
    tg.BackButton.show();
    tg.BackButton.onClick(goBack);
  }
}

// Format time ago helper
function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const minutes = Math.floor((Date.now() - new Date(timestamp)) / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours > 1 ? 's' : ''} ago`;
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => notification.remove(), 3000);
}

// Create verification modal
function createVerificationModal(stop) {
  const modal = document.createElement('div');
  modal.className = 'verification-modal';
  modal.id = 'verificationModal';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Verify ${stop.type === 'pickup' ? 'Pickup' : 'Delivery'}</h2>
      <div class="stop-info">
        <p><strong>${stop.address}</strong></p>
        <p>Customer: ${stop.customerName}</p>
        <p>Parcel: ${stop.parcelCode}</p>
      </div>
      
      <div class="verification-form">
        <label>Enter ${stop.type} code:</label>
        <input type="text" 
               id="stopVerificationCode" 
               placeholder="Enter code" 
               maxlength="8"
               class="code-input"
               autocomplete="off">
        
        <button class="verify-button" onclick="confirmStopCompletion('${stop.id}')">
          Verify & Complete
        </button>
        <button class="cancel-button" onclick="closeVerificationModal()">
          Cancel
        </button>
      </div>
    </div>
  `;
  
  return modal;
}

// Global functions (called from HTML)
window.goBack = function() {
  if (state.watchId) {
    stopWatchingLocation(state.watchId);
  }
  localStorage.removeItem('tuma_active_route');
  window.history.back();
  haptic('light');
};

window.navigateToStop = function(stopId) {
  const stop = state.currentRoute.stops.find(s => s.id == stopId);
  if (stop && !stop.completed && canCompleteStop(stop)) {
    // Open in default navigation app
    const url = `https://www.google.com/maps/dir/?api=1&destination=${stop.location.lat},${stop.location.lng}`;
    window.open(url, '_blank');
  }
  haptic('light');
};

window.startNavigation = function() {
  if (state.currentRoute && state.currentRoute.stops.length > 0) {
    const firstActiveStop = state.currentRoute.stops.find(s => !s.completed && canCompleteStop(s));
    if (firstActiveStop) {
      window.navigateToStop(firstActiveStop.id);
    }
  }
  haptic('medium');
};

window.optimizeRoute = async function() {
  if (!state.currentRoute || state.currentRoute.stops.length < 2) return;
  
  haptic('medium');
  
  try {
    // Get uncompleted stops by type
    const pickups = state.currentRoute.stops.filter(s => s.type === 'pickup' && !s.completed);
    const deliveries = state.currentRoute.stops.filter(s => s.type === 'delivery' && !s.completed);
    
    if (pickups.length < 2 && deliveries.length < 2) {
      showNotification('Not enough stops to optimize', 'info');
      return;
    }
    
    // Optimize pickups and deliveries separately
    const optimizedPickups = pickups.length > 1 ? optimizeStopOrder(pickups) : pickups;
    const optimizedDeliveries = deliveries.length > 1 ? optimizeStopOrder(deliveries) : deliveries;
    
    // Rebuild route with optimized order
    const completedStops = state.currentRoute.stops.filter(s => s.completed);
    state.currentRoute.stops = [...completedStops, ...optimizedPickups, ...optimizedDeliveries];
    
    // Refresh display
    displayEnhancedRoute();
    
    showNotification('Route optimized for efficiency!', 'success');
    
  } catch (error) {
    console.error('Error optimizing route:', error);
    showNotification('Failed to optimize route', 'error');
  }
};

// Optimize stop order using nearest neighbor
function optimizeStopOrder(stops) {
  if (stops.length <= 1) return stops;
  
  const optimized = [stops[0]];
  const remaining = stops.slice(1);
  
  while (remaining.length > 0) {
    const lastStop = optimized[optimized.length - 1];
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    
    remaining.forEach((stop, index) => {
      const distance = calculateDistance(lastStop.location, stop.location);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    
    optimized.push(remaining.splice(nearestIndex, 1)[0]);
  }
  
  return optimized;
}

window.verifyStop = function(stopId) {
  const stop = state.currentRoute.stops.find(s => s.id === stopId);
  if (!stop || stop.completed || !canCompleteStop(stop)) return;
  
  // Show verification modal
  const modal = createVerificationModal(stop);
  document.body.appendChild(modal);
  
  // Focus on code input
  setTimeout(() => {
    document.getElementById('stopVerificationCode').focus();
  }, 100);
};

window.confirmStopCompletion = async function(stopId) {
  const stop = state.currentRoute.stops.find(s => s.id === stopId);
  const code = document.getElementById('stopVerificationCode').value.toUpperCase();
  
  if (!code) {
    alert('Please enter the verification code');
    return;
  }
  
  if (code !== stop.verificationCode.toUpperCase()) {
    alert('Invalid code. Please try again.');
    document.getElementById('stopVerificationCode').value = '';
    document.getElementById('stopVerificationCode').focus();
    return;
  }
  
  // Mark stop as completed
  stop.completed = true;
  stop.timestamp = new Date();
  
  // Update display
  closeVerificationModal();
  displayEnhancedRoute();
  
  // Show success message
  showNotification(`${stop.type} completed successfully!`, 'success');
  haptic('success');
  
  // Check if entering delivery phase
  const pickups = state.currentRoute.stops.filter(s => s.type === 'pickup');
  if (pickups.every(p => p.completed) && stop.type === 'pickup') {
    setTimeout(() => {
      showNotification('🚀 All pickups complete! Starting delivery phase', 'phase');
    }, 1000);
  }
  
  // Check if route is complete
  if (state.currentRoute.stops.every(s => s.completed)) {
    setTimeout(() => {
      showNotification('🎉 Route completed! Great work!', 'complete');
      setTimeout(() => {
        // Clear stored route and go back
        localStorage.removeItem('tuma_active_route');
        window.history.back();
      }, 2000);
    }, 1000);
  }
};

window.closeVerificationModal = function() {
  document.getElementById('verificationModal')?.remove();
};

// Add enhanced styles
function addEnhancedStyles() {
  const enhancedMapStyles = `
    <style>
    /* Route Phases */
    .route-phases {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 20px;
      background: var(--surface-elevated);
      border-radius: 14px;
      margin: 20px 0;
    }

    .phase {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      background: var(--surface-high);
      border-radius: 12px;
      border: 2px solid var(--border);
      transition: all 0.3s;
    }

    .phase.active {
      border-color: var(--primary);
      background: var(--surface);
    }

    .phase.completed {
      border-color: var(--success);
      opacity: 0.8;
    }

    .phase.pending {
      opacity: 0.5;
    }

    .phase-icon {
      font-size: 28px;
    }

    .phase-info {
      text-align: left;
    }

    .phase-title {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 4px;
    }

    .phase-progress {
      font-size: 18px;
      font-weight: 700;
      color: var(--primary);
    }

    .phase.completed .phase-progress {
      color: var(--success);
    }

    .phase-arrow {
      font-size: 24px;
      color: var(--text-tertiary);
      transition: all 0.3s;
    }

    .phase-arrow.active {
      color: var(--primary);
    }

    /* Carrying Banner */
    .carrying-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: rgba(255, 159, 10, 0.2);
      border: 1px solid var(--warning);
      border-radius: 12px;
      padding: 12px 20px;
      margin: 0 20px 20px;
      font-weight: 600;
    }

    .carrying-icon {
      font-size: 24px;
    }

    /* Parcels Widget */
    .parcels-possession-widget {
      background: var(--surface-elevated);
      border-radius: 14px;
      padding: 20px;
      margin: 20px 0;
    }

    .widget-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
    }

    .parcels-grid {
      display: grid;
      gap: 12px;
    }

    .parcel-card {
      background: var(--surface-high);
      border-radius: 10px;
      padding: 12px;
      border-left: 4px solid var(--warning);
    }

    .parcel-code {
      font-weight: 700;
      color: var(--warning);
      margin-bottom: 4px;
    }

    .parcel-time {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .parcel-destination {
      font-size: 14px;
      margin-top: 4px;
    }

    /* Enhanced Stop Items */
    .stop-connector {
      width: 4px;
      background: var(--border);
      margin: 0 20px;
      position: relative;
    }

    .stop-connector::before {
      content: '';
      position: absolute;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--surface-elevated);
      border: 3px solid var(--border);
      left: 50%;
      top: 20px;
      transform: translateX(-50%);
    }

    .stop-item.active .stop-connector::before {
      background: var(--primary);
      border-color: var(--primary);
      animation: pulse 2s infinite;
    }

    .stop-item.completed .stop-connector::before {
      background: var(--success);
      border-color: var(--success);
    }

    .stop-item.blocked {
      opacity: 0.6;
    }

    .stop-blocked-message {
      color: var(--warning);
      font-size: 12px;
      margin-top: 8px;
    }

    .stop-phone {
      color: var(--primary);
      text-decoration: none;
      margin-left: 12px;
    }

    .stop-instructions {
      background: rgba(255, 159, 10, 0.1);
      padding: 8px;
      border-radius: 6px;
      margin-top: 8px;
      font-size: 12px;
    }

    /* Custom Stop Markers */
    .stop-marker {
      width: 32px;
      height: 42px;
      position: relative;
      background: var(--primary);
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 3px 10px rgba(0,0,0,0.3);
    }

    .stop-marker.pickup {
      background: #FF9F0A;
    }

    .stop-marker.delivery {
      background: #34C759;
    }

    .stop-marker.completed {
      background: #666;
      opacity: 0.8;
    }

    .marker-number {
      transform: rotate(45deg);
      color: white;
      font-weight: bold;
      font-size: 14px;
    }

    /* Popup styles */
    .stop-popup {
      min-width: 200px;
    }

    .popup-action-btn {
      margin-top: 8px;
      width: 100%;
      padding: 8px 12px;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
    }

    .completed-label {
      color: var(--success);
      font-weight: 600;
    }

    .blocked-label {
      color: var(--warning);
      font-weight: 600;
    }

    /* Verification Modal */
    .verification-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 20px;
    }

    .modal-content {
      background: var(--surface-elevated);
      border-radius: 20px;
      padding: 24px;
      max-width: 400px;
      width: 100%;
    }

    .modal-content h2 {
      margin-bottom: 20px;
      font-size: 24px;
    }

    .stop-info {
      background: var(--surface-high);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 20px;
    }

    .stop-info p {
      margin: 8px 0;
    }

    .verification-form label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
    }

    .code-input {
      width: 100%;
      padding: 16px;
      border: 2px solid var(--border);
      border-radius: 12px;
      background: var(--surface-high);
      color: white;
      font-size: 20px;
      text-align: center;
      letter-spacing: 2px;
      margin-bottom: 20px;
      text-transform: uppercase;
    }

    .code-input:focus {
      border-color: var(--primary);
      outline: none;
    }

    .verify-button {
      width: 100%;
      padding: 16px;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      margin-bottom: 12px;
    }

    .cancel-button {
      width: 100%;
      padding: 16px;
      background: var(--surface-high);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }

    /* Notifications */
    .notification {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 24px;
      border-radius: 12px;
      font-weight: 600;
      animation: slideIn 0.3s ease-out;
      z-index: 10000;
      max-width: 350px;
    }

    .notification.success {
      background: var(--success);
      color: white;
    }

    .notification.phase {
      background: var(--primary);
      color: white;
    }

    .notification.complete {
      background: linear-gradient(135deg, var(--success) 0%, var(--primary) 100%);
      color: white;
      font-size: 18px;
    }

    .notification.error {
      background: var(--danger);
      color: white;
    }

    .notification.info {
      background: var(--surface-elevated);
      color: white;
      border: 1px solid var(--border);
    }

    /* Animated Route */
    .animated-route {
      animation: routeFlow 2s linear infinite;
    }

    @keyframes routeFlow {
      0% { stroke-dashoffset: 0; }
      100% { stroke-dashoffset: -20; }
    }

    @keyframes pulse {
      0%, 100% { transform: translateX(-50%) scale(1); opacity: 1; }
      50% { transform: translateX(-50%) scale(1.2); opacity: 0.8; }
    }

    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    </style>
  `;
  
  document.head.insertAdjacentHTML('beforeend', enhancedMapStyles);
}

// Initialize on load
window.addEventListener('DOMContentLoaded', initialize);
