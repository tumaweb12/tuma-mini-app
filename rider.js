/**
 * Rider Page Entry Script
 * Handles rider dashboard functionality
 */

import { BUSINESS_CONFIG } from './config.js';
import { ridersDB, parcelsDB, routesDB } from './supabaseClient.js';
import { validation, codes, dateTime, notifications, haptic } from './businessLogic.js';

// State management
const state = {
  rider: null,
  status: 'online',
  earnings: {
    daily: 0,
    weekly: 0,
    monthly: 0
  },
  stats: {
    deliveries: 0,
    distance: 0
  },
  activeDelivery: null,
  claimedRoutes: [],
  availableRoutes: [],
  currentFilter: 'all'
};

// DOM elements
const elements = {
  statusBadge: document.getElementById('statusBadge'),
  dailyEarnings: document.getElementById('dailyEarnings'),
  weeklyEarnings: document.getElementById('weeklyEarnings'),
  monthlyEarnings: document.getElementById('monthlyEarnings'),
  totalDeliveries: document.getElementById('totalDeliveries'),
  totalDistance: document.getElementById('totalDistance'),
  activeDeliverySection: document.getElementById('activeDeliverySection'),
  currentAddress: document.getElementById('currentAddress'),
  currentParcel: document.getElementById('currentParcel'),
  currentETA: document.getElementById('currentETA'),
  codeInput: document.getElementById('codeInput'),
  routeList: document.getElementById('routeList')
};

// Initialize page
async function initialize() {
  await loadRiderData();
  setupEventListeners();
  initializeTelegramWebApp();
  await loadAvailableRoutes();
}

// Load rider data
async function loadRiderData() {
  try {
    // Get rider from phone or stored data
    const phone = getRiderPhone();
    if (!phone) {
      notifications.error('Rider phone not found');
      return;
    }
    
    // Get rider details
    const rider = await ridersDB.getByPhone(phone);
    if (!rider) {
      notifications.error('Rider not found');
      return;
    }
    
    state.rider = rider;
    
    // Load earnings and stats
    await loadEarnings();
    
  } catch (error) {
    console.error('Error loading rider data:', error);
    notifications.error('Failed to load rider data');
  }
}

// Get rider phone
function getRiderPhone() {
  if (window.Telegram?.WebApp) {
    const user = window.Telegram.WebApp.initDataUnsafe.user;
    if (user?.phone_number) {
      return validation.formatPhone(user.phone_number);
    }
  }
  
  return localStorage.getItem('tuma_rider_phone');
}

// Load earnings
async function loadEarnings() {
  try {
    // Load earnings for different periods
    const dailyData = await ridersDB.getEarnings(state.rider.id, 'today');
    const weeklyData = await ridersDB.getEarnings(state.rider.id, 'week');
    const monthlyData = await ridersDB.getEarnings(state.rider.id, 'month');
    
    state.earnings = {
      daily: dailyData.totalEarnings,
      weekly: weeklyData.totalEarnings,
      monthly: monthlyData.totalEarnings
    };
    
    state.stats = {
      deliveries: monthlyData.totalDeliveries,
      distance: state.rider.total_distance || 0
    };
    
    updateEarningsDisplay();
    updateStatsDisplay();
    
  } catch (error) {
    console.error('Error loading earnings:', error);
  }
}

// Update earnings display
function updateEarningsDisplay() {
  elements.dailyEarnings.textContent = state.earnings.daily.toLocaleString();
  elements.weeklyEarnings.textContent = state.earnings.weekly.toLocaleString();
  elements.monthlyEarnings.textContent = state.earnings.monthly.toLocaleString();
}

// Update stats display
function updateStatsDisplay() {
  elements.totalDeliveries.textContent = state.stats.deliveries;
  elements.totalDistance.textContent = state.stats.distance;
}

// Load available routes
async function loadAvailableRoutes() {
  try {
    const routes = await routesDB.getAvailable();
    state.availableRoutes = routes;
    displayRoutes();
    
  } catch (error) {
    console.error('Error loading routes:', error);
  }
}

// Display routes
function displayRoutes() {
  const filteredRoutes = state.currentFilter === 'all' 
    ? state.availableRoutes 
    : state.availableRoutes.filter(r => r.type === state.currentFilter);
  
  if (filteredRoutes.length === 0) {
    elements.routeList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🗺️</div>
        <h3 class="empty-title">No Routes Available</h3>
        <p class="empty-message">Check back soon for new clustered routes</p>
      </div>
    `;
    return;
  }
  
  elements.routeList.innerHTML = filteredRoutes.map(route => `
    <div class="route-card ${route.status !== 'available' ? 'claimed' : ''}" 
         onclick="${route.status === 'available' ? `claimRoute('${route.id}')` : ''}">
      <div class="route-header">
        <div class="route-cluster">${route.name}</div>
        <div class="route-type ${route.type}">${route.type.toUpperCase()}</div>
      </div>
      <div class="route-details">
        <div class="route-detail">
          <div class="route-detail-value">${route.deliveries}</div>
          <div class="route-detail-label">Deliveries</div>
        </div>
        <div class="route-detail">
          <div class="route-detail-value">${route.distance} km</div>
          <div class="route-detail-label">Distance</div>
        </div>
        <div class="route-detail">
          <div class="route-detail-value">KES ${route.total_earnings}</div>
          <div class="route-detail-label">Earnings</div>
        </div>
      </div>
      <button class="claim-button" ${route.status !== 'available' ? 'disabled' : ''}>
        ${route.status === 'available' ? 'Claim Route' : 'Already Claimed'}
      </button>
    </div>
  `).join('');
}

// Setup event listeners
function setupEventListeners() {
  // Code input formatting
  elements.codeInput?.addEventListener('input', (e) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Add hyphen after 3 characters
    if (value.length > 3) {
      value = value.slice(0, 3) + '-' + value.slice(3);
    }
    
    e.target.value = value;
  });
  
  // Status badge click
  elements.statusBadge?.addEventListener('click', toggleStatus);
}

// Toggle online/offline status
async function toggleStatus() {
  state.status = state.status === 'online' ? 'offline' : 'online';
  
  if (state.status === 'online') {
    elements.statusBadge.classList.remove('offline');
    elements.statusBadge.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="4"/>
      </svg>
      <span>Online</span>
    `;
  } else {
    elements.statusBadge.classList.add('offline');
    elements.statusBadge.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="4"/>
      </svg>
      <span>Offline</span>
    `;
  }
  
  // Update status in database
  try {
    await ridersDB.updateStatus(state.rider.id, state.status);
  } catch (error) {
    console.error('Error updating status:', error);
  }
  
  haptic('light');
}

// Initialize Telegram Web App
function initializeTelegramWebApp() {
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
  }
}

// Global functions (called from HTML)
window.filterRoutes = function(type) {
  state.currentFilter = type;
  
  // Update tabs
  document.querySelectorAll('.route-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  event.target.classList.add('active');
  
  displayRoutes();
  haptic('light');
};

window.claimRoute = async function(routeId) {
  const route = state.availableRoutes.find(r => r.id === routeId);
  if (!route || route.status !== 'available') return;
  
  try {
    // Claim route in database
    await routesDB.claim(routeId, state.rider.id);
    
    // Update local state
    route.status = 'claimed';
    state.claimedRoutes.push(route);
    
    // Show active delivery
    state.activeDelivery = {
      routeId: routeId,
      currentStop: 0,
      parcelCode: codes.generateParcelCode()
    };
    
    elements.activeDeliverySection.style.display = 'block';
    elements.currentAddress.textContent = route.stops?.[0]?.address || 'First pickup location';
    elements.currentParcel.textContent = state.activeDelivery.parcelCode;
    elements.currentETA.textContent = '15 min';
    
    // Update display
    displayRoutes();
    
    notifications.success(`Route claimed! Navigate to your first pickup.`);
    haptic('success');
    
  } catch (error) {
    console.error('Error claiming route:', error);
    notifications.error('Failed to claim route. Please try again.');
  }
};

window.verifyCode = async function(type) {
  const code = elements.codeInput.value.toUpperCase();
  
  if (!code || code.length < 6) {
    notifications.error('Please enter a valid code');
    return;
  }
  
  try {
    // Verify code in database
    const parcel = await parcelsDB.getByCode(code);
    
    if (!parcel) {
      notifications.error('Invalid code. Please check and try again.');
      return;
    }
    
    if (type === 'pickup' && code.startsWith('VPK')) {
      // Update parcel status to picked up
      await parcelsDB.updateStatus(parcel.parcel_code, 'picked_up', {
        picked_up_at: dateTime.now()
      });
      
      notifications.success('Pickup verified! Package collected successfully.');
      elements.codeInput.value = '';
      
      // Update delivery status
      if (state.activeDelivery) {
        document.querySelector('.delivery-status').textContent = 'En route to delivery';
        elements.currentAddress.textContent = parcel.delivery_location;
      }
      
    } else if (type === 'delivery' && code.startsWith('DLV')) {
      // Update parcel status to delivered
      await parcelsDB.updateStatus(parcel.parcel_code, 'delivered', {
        delivered_at: dateTime.now()
      });
      
      notifications.success('Delivery confirmed! Payment processed.');
      elements.codeInput.value = '';
      
      // Update stats
      state.stats.deliveries++;
      state.earnings.daily += parcel.price * 0.70; // 70% rider commission
      updateStatsDisplay();
      updateEarningsDisplay();
      
      // Move to next delivery or complete route
      if (state.activeDelivery) {
        const route = state.claimedRoutes.find(r => r.id === state.activeDelivery.routeId);
        if (route) {
          state.activeDelivery.currentStop++;
          if (state.activeDelivery.currentStop < route.deliveries) {
            elements.currentAddress.textContent = route.stops?.[state.activeDelivery.currentStop]?.address || 'Next location';
            document.querySelector('.delivery-status').textContent = 'En route to pickup';
          } else {
            // Route completed
            elements.activeDeliverySection.style.display = 'none';
            state.activeDelivery = null;
            await routesDB.complete(route.id);
            notifications.success('🎉 Route completed! Great work!');
          }
        }
      }
    } else {
      notifications.error('Invalid code type. Please check and try again.');
    }
    
    haptic('success');
    
  } catch (error) {
    console.error('Error verifying code:', error);
    notifications.error('Verification failed. Please try again.');
  }
};

window.navigateToRoute = function() {
  if (state.activeDelivery) {
    window.location.href = 'route.html?active=true';
  } else {
    notifications.warning('Claim a route first to see navigation');
  }
  haptic('light');
};

// Initialize on load
window.addEventListener('DOMContentLoaded', initialize);
