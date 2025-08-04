/**
 * Agent Page Entry Script
 * Complete production-ready agent dashboard with all features
 */

import { BUSINESS_CONFIG } from './config.js';
import { agentsDB, vendorsDB, parcelsDB, supabase } from './supabaseClient.js';
import { validation, dateTime, notifications, haptic } from './businessLogic.js';

// State management
const state = {
  agent: null,
  vendors: [],
  parcels: [],
  transactions: [],
  stats: {
    today: { parcels: 0, commission: 0 },
    week: { parcels: 0, commission: 0 },
    month: { parcels: 0, commission: 0 },
    all: { parcels: 0, commission: 0 }
  },
  payoutInfo: {
    available: 0,
    pending: 0,
    nextDate: null
  },
  performanceMetrics: {
    conversionRate: 0,
    avgOrderValue: 0,
    vendorRetention: 0,
    growthRate: 0
  },
  currentTimePeriod: 'today',
  isLoading: true,
  referralLink: null
};

// DOM elements
const elements = {
  agentName: document.getElementById('agentName'),
  agentCode: document.getElementById('agentCode'),
  totalCommission: document.getElementById('totalCommission'),
  totalParcels: document.getElementById('totalParcels'),
  activeVendors: document.getElementById('activeVendors'),
  vendorList: document.getElementById('vendorList'),
  transactionList: document.getElementById('transactionList'),
  addVendorModal: document.getElementById('addVendorModal'),
  addVendorForm: document.getElementById('addVendorForm'),
  vendorName: document.getElementById('vendorName'),
  vendorPhone: document.getElementById('vendorPhone'),
  businessName: document.getElementById('businessName'),
  businessLocation: document.getElementById('businessLocation'),
  referralLink: document.getElementById('referralLink'),
  qrCode: document.getElementById('qrCode'),
  availableBalance: document.getElementById('availableBalance'),
  pendingCommission: document.getElementById('pendingCommission'),
  nextPayoutDate: document.getElementById('nextPayoutDate'),
  payoutBtn: document.getElementById('payoutBtn'),
  conversionRate: document.getElementById('conversionRate'),
  avgOrderValue: document.getElementById('avgOrderValue'),
  vendorRetention: document.getElementById('vendorRetention'),
  growthRate: document.getElementById('growthRate')
};

// Authentication check
async function checkAuthAndLoadAgent() {
  const session = localStorage.getItem('tuma_agent_session');
  if (!session) {
    window.location.href = './auth.html?type=agent';
    return null;
  }
  
  try {
    const sessionData = JSON.parse(session);
    const phone = sessionData.phone;
    
    // Load agent from database
    const agent = await agentsDB.getByPhone(phone);
    
    if (!agent || agent.status !== 'approved') {
      if (agent && agent.status === 'pending') {
        showNotification('Your agent account is pending approval', 'warning');
        return agent;
      } else if (agent && agent.status === 'suspended') {
        showNotification('Your account has been suspended. Please contact support.', 'error');
        localStorage.removeItem('tuma_agent_session');
        setTimeout(() => {
          window.location.href = './auth.html?type=agent';
        }, 2000);
        return null;
      } else {
        localStorage.removeItem('tuma_agent_session');
        window.location.href = './auth.html?type=agent';
        return null;
      }
    }
    
    return agent;
  } catch (error) {
    console.error('Session error:', error);
    localStorage.removeItem('tuma_agent_session');
    window.location.href = './auth.html?type=agent';
    return null;
  }
}

// Initialize page
async function initialize() {
  try {
    // Check auth first
    const agent = await checkAuthAndLoadAgent();
    if (!agent) return;
    
    state.agent = agent;
    
    // Update UI with agent info
    elements.agentName.textContent = agent.agent_name || agent.name || 'Agent';
    elements.agentCode.textContent = agent.agent_code || agent.code || 'N/A';
    
    // Generate referral link
    generateReferralLink();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize Telegram Web App if available
    initializeTelegramWebApp();
    
    // Load all data
    await Promise.all([
      loadVendors(),
      loadParcels(),
      loadPayoutInfo(),
      calculatePerformanceMetrics()
    ]);
    
    // Calculate stats after loading parcels
    calculateStats();
    
    state.isLoading = false;
    
  } catch (error) {
    console.error('Initialization error:', error);
    showNotification('Failed to load agent data', 'error');
    state.isLoading = false;
  }
}

// Generate referral link
function generateReferralLink() {
  const baseUrl = window.location.origin;
  const agentCode = state.agent.agent_code || state.agent.code;
  const referralUrl = `${baseUrl}/vendor.html?ref=${agentCode}`;
  
  state.referralLink = referralUrl;
  elements.referralLink.textContent = referralUrl;
  
  // Generate QR code
  if (window.QRCode) {
    new QRCode(elements.qrCode, {
      text: referralUrl,
      width: 200,
      height: 200,
      colorDark: "#0066FF",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }
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
    displayVendors();
  }
}

// Load agent parcels
async function loadParcels() {
  try {
    const { data, error } = await supabase
      .from('parcels')
      .select('*')
      .eq('agent_id', state.agent.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    state.parcels = data || [];
    
    // Extract transactions for display
    state.transactions = state.parcels.map(parcel => ({
      id: parcel.id,
      vendorName: parcel.vendor_name,
      vendorPhone: parcel.vendor_phone,
      parcelCode: parcel.parcel_code,
      amount: parcel.price,
      commission: parcel.price * 0.20,
      status: parcel.status,
      createdAt: parcel.created_at
    }));
    
    displayTransactions();
    
  } catch (error) {
    console.error('Error loading parcels:', error);
    state.parcels = [];
    displayTransactions();
  }
}

// Calculate stats from actual parcels
function calculateStats() {
  const now = new Date();
  const periods = {
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    week: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    month: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    all: new Date(0)
  };
  
  Object.keys(periods).forEach(period => {
    const startDate = periods[period];
    const periodParcels = state.parcels.filter(parcel => 
      new Date(parcel.created_at) >= startDate
    );
    
    state.stats[period] = {
      parcels: periodParcels.length,
      commission: periodParcels.reduce((sum, parcel) => 
        sum + (parcel.price * 0.20), 0
      )
    };
  });
  
  updateStatsDisplay();
}

// Load payout information
async function loadPayoutInfo() {
  try {
    // Get unpaid commissions
    const unpaidParcels = state.parcels.filter(p => 
      p.status === 'delivered' && !p.commission_paid
    );
    
    const paidParcels = state.parcels.filter(p => 
      p.status === 'delivered' && p.commission_paid
    );
    
    state.payoutInfo = {
      available: unpaidParcels.reduce((sum, p) => sum + (p.price * 0.20), 0),
      pending: state.parcels
        .filter(p => ['pending', 'assigned', 'picked'].includes(p.status))
        .reduce((sum, p) => sum + (p.price * 0.20), 0),
      nextDate: getNextPayoutDate()
    };
    
    updatePayoutDisplay();
    
  } catch (error) {
    console.error('Error loading payout info:', error);
  }
}

// Calculate performance metrics
async function calculatePerformanceMetrics() {
  try {
    // Conversion rate: vendors who sent at least one parcel
    const activeVendors = new Set(state.parcels.map(p => p.vendor_phone)).size;
    const conversionRate = state.vendors.length > 0 
      ? Math.round((activeVendors / state.vendors.length) * 100) 
      : 0;
    
    // Average order value
    const avgOrderValue = state.parcels.length > 0
      ? Math.round(state.parcels.reduce((sum, p) => sum + p.price, 0) / state.parcels.length)
      : 0;
    
    // Vendor retention (vendors who sent multiple parcels)
    const vendorParcelCounts = {};
    state.parcels.forEach(p => {
      vendorParcelCounts[p.vendor_phone] = (vendorParcelCounts[p.vendor_phone] || 0) + 1;
    });
    const repeatVendors = Object.values(vendorParcelCounts).filter(count => count > 1).length;
    const vendorRetention = activeVendors > 0
      ? Math.round((repeatVendors / activeVendors) * 100)
      : 0;
    
    // Growth rate (month over month)
    const thisMonth = state.stats.month.parcels;
    const lastMonth = state.parcels.filter(p => {
      const date = new Date(p.created_at);
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      return date >= twoMonthsAgo && date < monthAgo;
    }).length;
    
    const growthRate = lastMonth > 0
      ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
      : 0;
    
    state.performanceMetrics = {
      conversionRate,
      avgOrderValue,
      vendorRetention,
      growthRate
    };
    
    updateMetricsDisplay();
    
  } catch (error) {
    console.error('Error calculating metrics:', error);
  }
}

// Display functions
function displayVendors() {
  if (state.isLoading) {
    elements.vendorList.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
      </div>
    `;
    return;
  }
  
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
  
  // Calculate real vendor stats
  elements.vendorList.innerHTML = state.vendors.map(vendor => {
    const vendorParcels = state.parcels.filter(p => p.vendor_phone === vendor.phone);
    const periodParcels = getParcelsByPeriod(vendorParcels, state.currentTimePeriod);
    const commission = periodParcels.reduce((sum, p) => sum + (p.price * 0.20), 0);
    
    return `
      <div class="vendor-item" onclick="viewVendorDetails('${vendor.id}')">
        <div class="vendor-header">
          <div class="vendor-name">${vendor.name || vendor.vendor_name || 'Unknown'}</div>
          <div class="vendor-parcels">
            <span>${periodParcels.length}</span>
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
            <span>KES ${commission.toLocaleString()}</span>
          </div>
        </div>
        <div class="vendor-actions">
          <button class="vendor-action-btn primary" onclick="event.stopPropagation(); sendReminder('${vendor.id}')">
            Send Reminder
          </button>
          <button class="vendor-action-btn secondary" onclick="event.stopPropagation(); editVendor('${vendor.id}')">
            Edit
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function displayTransactions() {
  const periodTransactions = getTransactionsByPeriod(state.transactions, state.currentTimePeriod);
  
  if (periodTransactions.length === 0) {
    elements.transactionList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <h3 class="empty-title">No Transactions</h3>
        <p class="empty-message">Transactions will appear here when vendors send parcels</p>
      </div>
    `;
    return;
  }
  
  elements.transactionList.innerHTML = periodTransactions.map(transaction => {
    const timeAgo = getTimeAgo(new Date(transaction.createdAt));
    const statusColor = transaction.status === 'delivered' ? 'var(--success)' : 'var(--warning)';
    
    return `
      <div class="transaction-item">
        <div class="transaction-info">
          <div class="vendor-name">${transaction.vendorName}</div>
          <div class="parcel-code">${transaction.parcelCode}</div>
        </div>
        <div class="transaction-amount">
          <div class="commission" style="color: ${statusColor}">
            +KES ${transaction.commission.toFixed(0)}
          </div>
          <div class="transaction-date">${timeAgo}</div>
        </div>
      </div>
    `;
  }).join('');
}

// Update display functions
function updateStatsDisplay() {
  const stats = state.stats[state.currentTimePeriod];
  elements.totalParcels.textContent = stats.parcels;
  elements.totalCommission.textContent = stats.commission.toLocaleString();
}

function updatePayoutDisplay() {
  elements.availableBalance.textContent = state.payoutInfo.available.toLocaleString();
  elements.pendingCommission.textContent = state.payoutInfo.pending.toLocaleString();
  elements.nextPayoutDate.textContent = state.payoutInfo.nextDate || 'Not scheduled';
  
  // Enable/disable payout button
  elements.payoutBtn.disabled = state.payoutInfo.available < 100; // Minimum payout
}

function updateMetricsDisplay() {
  elements.conversionRate.textContent = state.performanceMetrics.conversionRate;
  elements.avgOrderValue.textContent = state.performanceMetrics.avgOrderValue.toLocaleString();
  elements.vendorRetention.textContent = state.performanceMetrics.vendorRetention;
  elements.growthRate.textContent = state.performanceMetrics.growthRate;
}

// Helper functions
function getParcelsByPeriod(parcels, period) {
  const now = new Date();
  const startDate = {
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    week: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    month: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    all: new Date(0)
  }[period];
  
  return parcels.filter(parcel => new Date(parcel.created_at) >= startDate);
}

function getTransactionsByPeriod(transactions, period) {
  const now = new Date();
  const startDate = {
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    week: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    month: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    all: new Date(0)
  }[period];
  
  return transactions.filter(t => new Date(t.createdAt) >= startDate);
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };
  
  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
    }
  }
  
  return 'Just now';
}

function getNextPayoutDate() {
  // Payouts every Friday
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
  const nextFriday = new Date(today);
  nextFriday.setDate(today.getDate() + daysUntilFriday);
  return nextFriday.toLocaleDateString();
}

// Setup event listeners
function setupEventListeners() {
  // Add vendor form
  elements.addVendorForm?.addEventListener('submit', handleAddVendor);
  
  // Phone number formatting
  elements.vendorPhone?.addEventListener('input', (e) => {
    e.target.value = validation.formatPhone(e.target.value);
  });
  
  // Payout form
  document.getElementById('payoutForm')?.addEventListener('submit', handlePayoutRequest);
  
  // Handle scroll for header
  const mainContent = document.getElementById('mainContent');
  const header = document.getElementById('header');
  
  mainContent?.addEventListener('scroll', () => {
    if (mainContent.scrollTop > 50) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }
  });
}

// Handle add vendor
async function handleAddVendor(e) {
  e.preventDefault();
  
  if (!validation.validatePhone(elements.vendorPhone.value)) {
    showNotification('Please enter a valid phone number', 'error');
    return;
  }
  
  try {
    const vendorData = {
      name: elements.vendorName.value.trim(),
      phone: validation.formatPhone(elements.vendorPhone.value),
      business_name: elements.businessName.value.trim() || null,
      business_location: elements.businessLocation.value.trim(),
      agent_id: state.agent.id
    };
    
    await vendorsDB.create(vendorData);
    
    // Reload vendors
    await loadVendors();
    
    // Close modal and reset form
    hideAddVendorModal();
    elements.addVendorForm.reset();
    
    showNotification(`Vendor ${vendorData.name} has been successfully onboarded!`, 'success');
    
    // Send welcome message
    sendWelcome
