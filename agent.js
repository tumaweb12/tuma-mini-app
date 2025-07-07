/**
 * Agent Page Entry Script
 * Handles agent dashboard functionality
 */

import { BUSINESS_CONFIG } from './config.js';
import { agentsDB, vendorsDB, parcelsDB } from './supabaseClient.js';
import { validation, dateTime, notifications, haptic } from './businessLogic.js';

// State management
const state = {
  agent: null,
  vendors: [],
  stats: {
    today: { parcels: 0, commission: 0 },
    week: { parcels: 0, commission: 0 },
    month: { parcels: 0, commission: 0 },
    all: { parcels: 0, commission: 0 }
  },
  currentTimePeriod: 'today'
};

// DOM elements
const elements = {
  agentCode: document.getElementById('agentCode'),
  totalCommission: document.getElementById('totalCommission'),
  totalParcels: document.getElementById('totalParcels'),
  activeVendors: document.getElementById('activeVendors'),
  vendorList: document.getElementById('vendorList'),
  addVendorModal: document.getElementById('addVendorModal'),
  addVendorForm: document.getElementById('addVendorForm'),
  vendorName: document.getElementById('vendorName'),
  vendorPhone: document.getElementById('vendorPhone'),
  businessName: document.getElementById('businessName'),
  businessLocation: document.getElementById('businessLocation')
};

// Initialize page
async function initialize() {
  await loadAgentData();
  setupEventListeners();
  initializeTelegramWebApp();
}

// Load agent data
async function loadAgentData() {
  try {
    // Get agent from phone or stored data
    const phone = getAgentPhone();
    if (!phone) {
      notifications.error('Agent phone not found');
      return;
    }
    
    // Get agent details
    const agent = await agentsDB.getByPhone(phone);
    if (!agent) {
      notifications.error('Agent not found');
      return;
    }
    
    state.agent = agent;
    elements.agentCode.textContent = agent.code;
    
    // Load vendors
    await loadVendors();
    
    // Load stats
    await loadStats();
    
  } catch (error) {
    console.error('Error loading agent data:', error);
    notifications.error('Failed to load agent data');
  }
}

// Get agent phone (from Telegram or localStorage)
function getAgentPhone() {
  // Try Telegram user data first
  if (window.Telegram?.WebApp) {
    const user = window.Telegram.WebApp.initDataUnsafe.user;
    if (user?.phone_number) {
      return validation.formatPhone(user.phone_number);
    }
  }
  
  // Fallback to stored data
  return localStorage.getItem('tuma_agent_phone');
}

// Load managed vendors
async function loadVendors() {
  try {
    const vendors = await vendorsDB.getByAgent(state.agent.id);
    state.vendors = vendors;
    
    elements.activeVendors.textContent = vendors.length;
    displayVendors();
    
  } catch (error) {
    console.error('Error loading vendors:', error);
  }
}

// Load agent statistics
async function loadStats() {
  try {
    // Load stats for each time period
    const periods = ['today', 'week', 'month', 'all'];
    
    for (const period of periods) {
      const stats = await agentsDB.getStats(state.agent.id, period);
      state.stats[period] = {
        parcels: stats.totalParcels,
        commission: stats.commission
      };
    }
    
    updateStatsDisplay();
    
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Display vendors
function displayVendors() {
  if (state.vendors.length === 0) {
    elements.vendorList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <h3 class="empty-title">No Vendors Yet</h3>
        <p class="empty-message">Add your first vendor to start earning commissions</p>
      </div>
    `;
    return;
  }
  
  // Calculate vendor parcels for current period
  elements.vendorList.innerHTML = state.vendors.map(vendor => {
    const vendorStats = getVendorStats(vendor);
    
    return `
      <div class="vendor-item" onclick="viewVendorDetails('${vendor.id}')">
        <div class="vendor-header">
          <div class="vendor-name">${vendor.name}</div>
          <div class="vendor-parcels">
            <span>${vendorStats.parcels}</span>
            <span style="font-size: 12px;">parcels</span>
          </div>
        </div>
        <div class="vendor-details">
          <div class="vendor-phone">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
            </svg>
            <span>${vendor.phone}</span>
          </div>
          <div class="vendor-commission">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
            </svg>
            <span>KES ${vendorStats.commission.toLocaleString()}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Get vendor stats (mock data for now)
function getVendorStats(vendor) {
  // In production, this would calculate from actual parcels
  const mockStats = {
    today: { parcels: Math.floor(Math.random() * 10), commission: Math.floor(Math.random() * 1000) },
    week: { parcels: Math.floor(Math.random() * 50), commission: Math.floor(Math.random() * 5000) },
    month: { parcels: Math.floor(Math.random() * 200), commission: Math.floor(Math.random() * 20000) },
    all: { parcels: Math.floor(Math.random() * 1000), commission: Math.floor(Math.random() * 100000) }
  };
  
  return mockStats[state.currentTimePeriod];
}

// Update stats display
function updateStatsDisplay() {
  const stats = state.stats[state.currentTimePeriod];
  
  elements.totalParcels.textContent = stats.parcels;
  elements.totalCommission.textContent = stats.commission.toLocaleString();
}

// Setup event listeners
function setupEventListeners() {
  // Add vendor form
  elements.addVendorForm?.addEventListener('submit', handleAddVendor);
  
  // Phone number formatting
  elements.vendorPhone?.addEventListener('input', (e) => {
    e.target.value = validation.formatPhone(e.target.value);
  });
}

// Handle add vendor
async function handleAddVendor(e) {
  e.preventDefault();
  
  if (!validation.validatePhone(elements.vendorPhone.value)) {
    notifications.error('Please enter a valid phone number');
    return;
  }
  
  try {
    const vendorData = {
      name: elements.vendorName.value,
      phone: elements.vendorPhone.value,
      business_name: elements.businessName.value || null,
      business_location: elements.businessLocation.value,
      agent_id: state.agent.id
    };
    
    await vendorsDB.create(vendorData);
    
    // Reload vendors
    await loadVendors();
    
    // Close modal and reset form
    hideAddVendorModal();
    elements.addVendorForm.reset();
    
    notifications.success(`Vendor ${vendorData.name} has been successfully onboarded!`);
    
  } catch (error) {
    console.error('Error adding vendor:', error);
    notifications.error('Failed to add vendor. Please try again.');
  }
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
window.selectTimePeriod = function(period) {
  state.currentTimePeriod = period;
  
  // Update UI
  document.querySelectorAll('.time-option').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
  
  // Update displays
  updateStatsDisplay();
  displayVendors();
  
  haptic('light');
};

window.showAddVendorModal = function() {
  elements.addVendorModal.style.display = 'flex';
  elements.vendorName.focus();
  haptic('light');
};

window.hideAddVendorModal = function() {
  elements.addVendorModal.style.display = 'none';
  haptic('light');
};

window.viewVendorDetails = function(vendorId) {
  const vendor = state.vendors.find(v => v.id === vendorId);
  if (vendor) {
    // In production, this would navigate to vendor details page
    alert(`${vendor.name}\n${vendor.phone}\n${vendor.business_name || 'N/A'}\n${vendor.business_location}`);
  }
  haptic('light');
};

// Initialize on load
window.addEventListener('DOMContentLoaded', initialize);
