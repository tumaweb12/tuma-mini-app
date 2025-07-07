/**
 * Route Page Entry Script
 * Handles route navigation and map display
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
}

// Load active route from database
async function loadActiveRoute() {
  try {
    // Get rider's active route
    const riderId = getRiderId();
    if (!riderId) {
      showEmptyState();
      return;
    }
    
    // Get claimed routes
    const routes = await routesDB.getAvailable(); // Would filter by rider_id in production
    const activeRoute = routes.find(r => r.status === 'claimed');
    
    if (!activeRoute) {
      showEmptyState();
      return;
    }
    
    // Load route parcels
    const parcels = await parcelsDB.getForRider(riderId, 'assigned');
    
    // Convert to route format
    state.currentRoute = {
      id: activeRoute.id,
      name: activeRoute.name,
      type: activeRoute.type,
      stops: parcels.map((parcel, index) => ({
        id: parcel.id,
        type: index % 2 === 0 ? 'pickup' : 'delivery', // Alternate for demo
        address: index % 2 === 0 ? parcel.pickup_location : parcel.delivery_location,
        location: {
          lat: index % 2 === 0 ? parcel.pickup_lat : parcel.delivery_lat,
          lng: index % 2 === 0 ? parcel.pickup_lng : parcel.delivery_lng
        },
        parcelCode: parcel.parcel_code,
        completed: parcel.status === 'delivered'
      }))
    };
    
    displayRoute();
    
  } catch (error) {
    console.error('Error loading active route:', error);
    loadSampleRoute(); // Fallback to sample
  }
}

// Get rider ID
function getRiderId() {
  // In production, would get from auth or session
  return localStorage.getItem('tuma_rider_id');
}

// Load sample route for demo
function loadSampleRoute() {
  state.currentRoute = {
    id: 1,
    name: 'Westlands Smart Route',
    type: 'smart',
    stops: [
      {
        id: 1,
        type: 'pickup',
        address: 'Sarit Centre, Westlands',
        location: { lat: -1.2635, lng: 36.8034 },
        parcelCode: 'PRC-A1B2C3',
        completed: false
      },
      {
        id: 2,
        type: 'delivery',
        address: 'Westgate Mall, Westlands',
        location: { lat: -1.2569, lng: 36.8035 },
        parcelCode: 'PRC-A1B2C3',
        completed: false
      },
      {
        id: 3,
        type: 'pickup',
        address: 'The Mall Westlands',
        location: { lat: -1.2602, lng: 36.8032 },
        parcelCode: 'PRC-D4E5F6',
        completed: false
      },
      {
        id: 4,
        type: 'delivery',
        address: 'Parklands, Nairobi',
        location: { lat: -1.2624, lng: 36.8129 },
        parcelCode: 'PRC-D4E5F6',
        completed: false
      }
    ]
  };
  
  displayRoute();
}

// Display route
function displayRoute() {
  elements.emptyState.style.display = 'none';
  elements.routePanel.style.display = 'block';
  elements.navControls.style.display = 'flex';
  elements.trackingIndicator.style.display = 'flex';
  
  elements.routeTitle.textContent = state.currentRoute.name;
  elements.routeType.textContent = state.currentRoute.type.toUpperCase();
  
  displayStops();
  plotRoute();
  startTracking();
}

// Show empty state
function showEmptyState() {
  elements.emptyState.style.display = 'block';
  elements.routePanel.style.display = 'none';
  elements.navControls.style.display = 'none';
  elements.trackingIndicator.style.display = 'none';
}

// Display stops
function displayStops() {
  const activeStops = state.currentRoute.stops.filter(s => !s.completed);
  
  elements.remainingStops.textContent = activeStops.length;
  
  elements.stopsList.innerHTML = state.currentRoute.stops.map((stop, index) => `
    <div class="stop-item ${stop.completed ? 'completed' : ''} ${index === 0 && !stop.completed ? 'active' : ''}">
      <div class="stop-number">${stop.completed ? '✓' : index + 1}</div>
      <div class="stop-details">
        <div class="stop-type">${stop.type.toUpperCase()}</div>
        <div class="stop-address">${stop.address}</div>
        <div class="stop-info">Code: ${stop.parcelCode}</div>
      </div>
      <button class="stop-action" onclick="navigateToStop('${stop.id}')" ${stop.completed ? 'disabled' : ''}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
        </svg>
      </button>
    </div>
  `).join('');
}

// Plot route on map
async function plotRoute() {
  // Clear existing markers
  state.markers.forEach(marker => marker.remove());
  state.markers = [];
  
  // Add markers for each stop
  state.currentRoute.stops.forEach((stop, index) => {
    const marker = addMarker(state.map, stop.location.lat, stop.location.lng, {
      type: stop.type,
      title: stop.address,
      popup: `
        <strong>${stop.type.charAt(0).toUpperCase() + stop.type.slice(1)}</strong><br>
        ${stop.address}<br>
        <em>Code: ${stop.parcelCode}</em>
      `
    });
    
    state.markers.push(marker);
  });
  
  // Calculate and display route
  if (state.currentRoute.stops.length > 1) {
    const waypoints = state.currentRoute.stops.map(stop => stop.location);
    
    try {
      const route = await getRoute(waypoints);
      
      // Draw route on map
      if (route.geometry) {
        if (state.routeLayer) {
          state.map.removeLayer(state.routeLayer);
        }
        state.routeLayer = drawRoute(state.map, route.geometry);
      }
      
      // Update stats
      elements.totalDistance.textContent = route.distance.toFixed(1);
      elements.estimatedTime.textContent = Math.round(route.duration);
      
    } catch (error) {
      console.error('Error calculating route:', error);
    }
  }
  
  // Fit map to show all markers
  fitMapToBounds(state.map, state.currentRoute.stops.map(s => s.location));
}

// Start tracking user location
function startTracking() {
  state.watchId = watchLocation(
    (location) => {
      state.userLocation = location;
      updateUserMarker();
      
      // Check proximity to stops
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
  
  state.currentRoute.stops.forEach(stop => {
    if (!stop.completed) {
      const distance = calculateDistance(state.userLocation, stop.location);
      if (distance < 0.1) { // Within 100 meters
        // Show notification
        console.log(`Near ${stop.type} location: ${stop.address}`);
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

// Global functions (called from HTML)
window.goBack = function() {
  if (state.watchId) {
    stopWatchingLocation(state.watchId);
  }
  window.history.back();
  haptic('light');
};

window.navigateToStop = function(stopId) {
  const stop = state.currentRoute.stops.find(s => s.id == stopId);
  if (stop) {
    // Open in default navigation app
    const url = `https://www.google.com/maps/dir/?api=1&destination=${stop.location.lat},${stop.location.lng}`;
    window.open(url, '_blank');
  }
  haptic('light');
};

window.startNavigation = function() {
  if (state.currentRoute && state.currentRoute.stops.length > 0) {
    const firstStop = state.currentRoute.stops.find(s => !s.completed);
    if (firstStop) {
      window.navigateToStop(firstStop.id);
    }
  }
  haptic('medium');
};

window.optimizeRoute = async function() {
  if (!state.currentRoute || state.currentRoute.stops.length < 2) return;
  
  haptic('medium');
  
  try {
    // Get uncompleted stops
    const activeStops = state.currentRoute.stops.filter(s => !s.completed);
    if (activeStops.length < 2) return;
    
    // Optimize route
    const optimizedStops = optimizeRoute(activeStops.map(s => s.location));
    
    // Reorder stops
    const completedStops = state.currentRoute.stops.filter(s => s.completed);
    const reorderedActiveStops = optimizedStops.map(location => 
      activeStops.find(stop => 
        stop.location.lat === location.lat && stop.location.lng === location.lng
      )
    );
    
    state.currentRoute.stops = [...completedStops, ...reorderedActiveStops];
    
    // Refresh display
    displayStops();
    await plotRoute();
    
    notifications.success('Route optimized! New order saves time and distance.');
    
  } catch (error) {
    console.error('Error optimizing route:', error);
    notifications.error('Failed to optimize route');
  }
};

// Initialize on load
window.addEventListener('DOMContentLoaded', initialize);
