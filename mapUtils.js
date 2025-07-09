/**
 * Map Utilities Module
 * Handles all map operations, routing, and distance calculations
 * Uses Leaflet for maps and OSRM for routing
 */

import { API_CONFIG, DEFAULT_MAP_CENTER, COMMON_LOCATIONS } from './config.js';

// Map instances storage
const mapInstances = new Map();

/**
 * Initialize a Leaflet map
 */
export function initializeMap(containerId, options = {}) {
  // Check if map already exists
  if (mapInstances.has(containerId)) {
    return mapInstances.get(containerId);
  }

  // Create map
  const map = L.map(containerId, {
    center: [options.center?.lat || DEFAULT_MAP_CENTER.lat, options.center?.lng || DEFAULT_MAP_CENTER.lng],
    zoom: options.zoom || DEFAULT_MAP_CENTER.zoom,
    zoomControl: options.zoomControl !== false
  });

  // Add tile layer
  L.tileLayer(API_CONFIG.maps.tileServerUrl, {
    attribution: API_CONFIG.maps.attribution,
    maxZoom: 19
  }).addTo(map);

  // Store instance
  mapInstances.set(containerId, map);

  return map;
}

/**
 * Add a marker to the map
 */
export function addMarker(map, lat, lng, options = {}) {
  const marker = L.marker([lat, lng], {
    icon: options.icon || createCustomIcon(options.type || 'default'),
    title: options.title || ''
  });

  if (options.popup) {
    marker.bindPopup(options.popup);
  }

  marker.addTo(map);
  return marker;
}

/**
 * Create custom map icons
 */
export function createCustomIcon(type) {
  const iconOptions = {
    pickup: {
      iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="18" fill="#FF9F0A" stroke="#fff" stroke-width="2"/>
          <text x="20" y="26" text-anchor="middle" fill="white" font-size="20" font-weight="bold">P</text>
        </svg>
      `),
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40]
    },
    delivery: {
      iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="18" fill="#0066FF" stroke="#fff" stroke-width="2"/>
          <text x="20" y="26" text-anchor="middle" fill="white" font-size="20" font-weight="bold">D</text>
        </svg>
      `),
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40]
    },
    rider: {
      iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
          <circle cx="15" cy="15" r="14" fill="#34C759" stroke="#fff" stroke-width="2"/>
          <text x="15" y="20" text-anchor="middle" fill="white" font-size="16" font-weight="bold">R</text>
        </svg>
      `),
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -30]
    },
    default: {
      iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 0C6.7 0 0 6.7 0 15c0 8.3 15 25 15 25s15-16.7 15-25C30 6.7 23.3 0 15 0z" fill="#0066FF"/>
          <circle cx="15" cy="15" r="8" fill="white"/>
        </svg>
      `),
      iconSize: [30, 40],
      iconAnchor: [15, 40],
      popupAnchor: [0, -40]
    }
  };

  return L.icon(iconOptions[type] || iconOptions.default);
}

/**
 * Calculate straight-line distance between two points (Haversine formula)
 */
export function calculateStraightDistance(point1, point2) {
  const R = 6371; // Earth's radius in km
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLon = (point2.lng - point1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
          Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Get route from OSRM
 */
export async function getRoute(waypoints, options = {}) {
  const coordinates = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
  const url = `${API_CONFIG.maps.osrmUrl}/driving/${coordinates}?` + new URLSearchParams({
    overview: options.overview || 'full',
    geometries: options.geometries || 'geojson',
    steps: options.steps || 'false',
    alternatives: options.alternatives || 'false'
  });

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok') throw new Error(data.message || 'Route calculation failed');
    const route = data.routes[0];

    return {
      distance: route.distance / 1000,
      duration: route.duration / 60,
      geometry: route.geometry,
      waypoints: data.waypoints
    };
  } catch (error) {
    console.error('OSRM routing error:', error);
    const distance = calculateStraightDistance(
      waypoints[0], waypoints[waypoints.length - 1]
    ) * 1.3;
    return { distance, duration: distance * 3, geometry: null, waypoints: [] };
  }
}

/**
 * Draw route on map
 */
export function drawRoute(map, routeGeometry, options = {}) {
  const routeLayer = L.geoJSON(routeGeometry, {
    style: { color: options.color || '#0066FF', weight: options.weight || 5, opacity: options.opacity || 0.8 }
  });
  routeLayer.addTo(map);
  return routeLayer;
}

/**
 * Geocode address using Nominatim
 */
export async function geocodeAddress(address) {
  // Check common locations first
  const normalizedAddress = address.toLowerCase().trim();
  for (const [key, location] of Object.entries(COMMON_LOCATIONS)) {
    if (normalizedAddress.includes(key) || location.name.toLowerCase().includes(normalizedAddress)) {
      return { lat: location.lat, lng: location.lng, display_name: `${location.name}, Nairobi, Kenya` };
    }
  }

  // Use Nominatim for geocoding
  const url = `${API_CONFIG.maps.nominatimUrl}/search?${new URLSearchParams({
    q: address + ', Nairobi, Kenya',
    format: 'json',
    limit: '1',
    countrycodes: 'ke'
  })}`;

  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Tuma Delivery App' } });
    const data = await response.json();

    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display_name: data[0].display_name };
    }

    throw new Error('Address not found');
  } catch (error) {
    console.error('Geocoding error:', error);
    throw error;
  }
}
