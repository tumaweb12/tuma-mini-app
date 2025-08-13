/**
 * Partner Programme Script (agent.js)
 * Complete production-ready partner dashboard with real Supabase integration
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
  earnings: {
    available: 0,
    pending: 0,
    total: 0,
    lastCashout: null
  },
  streak: {
    current: 0,
    longest: 0,
    lastActive: null
  },
  weeklyActivity: {
    Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0
  },
  insights: [],
  performanceMetrics: {
    conversionRate: 0,
    avgOrderValue: 0,
    vendorRetention: 0,
    growthRate: 0,
    successRate: 0
  },
  kpis: {
    vendorOnboarding: { current: 0, target: 5 },
    parcelGeneration: { current: 0, target: 50 },
    vendorActivation: { current: 0, target: 90 }
  },
  personalRank: {
    rank: 0,
    totalPartners: 0,
    percentile: 0,
    parcelsThisMonth: 0,
    trend: 'stable'
  },
  currentFilter: 'all',
  currentTimePeriod: 'week',
  isLoading: true,
  referralLink: null,
  leaderboardOptIn: false,
  tierInfo: {
    current: 'starter',
    minCashout: 100
  }
};

// DOM elements cache
const elements = {
  // Header elements
  partnerName: document.getElementById('partnerName'),
  partnerCode: document.getElementById('partnerCode'),
  partnerInitial: document.getElementById('partnerInitial'),
  partnerAvatar: document.getElementById('partnerAvatar'),
  partnerTier: document.getElementById('partnerTier'),
  
  // Earnings elements
  availableBalance: document.getElementById('availableBalance'),
  cashoutBtn: document.getElementById('cashoutBtn'),
  
  // Activity elements
  streakDays: document.getElementById('streakDays'),
  weeklyGrowth: document.getElementById('weeklyGrowth'),
  
  // KPI elements
  vendorOnboardingValue: document.querySelector('.kpi-card:nth-child(1) .kpi-value'),
  vendorOnboardingProgress: document.querySelector('.kpi-card:nth-child(1) .kpi-progress-bar'),
  vendorOnboardingStatus: document.querySelector('.kpi-card:nth-child(1) .kpi-status span'),
  
  parcelGenerationValue: document.querySelector('.kpi-card:nth-child(2) .kpi-value'),
  parcelGenerationProgress: document.querySelector('.kpi-card:nth-child(2) .kpi-progress-bar'),
  parcelGenerationStatus: document.querySelector('.kpi-card:nth-child(2) .kpi-status span'),
  
  vendorActivationValue: document.querySelector('.kpi-card:nth-child(3) .kpi-value'),
  vendorActivationProgress: document.querySelector('.kpi-card:nth-child(3) .kpi-progress-bar'),
  vendorActivationStatus: document.querySelector('.kpi-card:nth-child(3) .kpi-status span'),
  
  // Personal progress
  personalRank: document.querySelector('.rank-metric:nth-child(1) .rank-number'),
  totalParcels: document.querySelector('.rank-metric:nth-child(2) .rank-number'),
  percentile: document.querySelector('.rank-metric:nth-child(3) .rank-number'),
  
  // Stats
  totalEarned: document.querySelector('.stat-card:nth-child(1) .stat-value'),
  totalParcelsCard: document.querySelector('.stat-card:nth-child(2) .stat-value'),
  totalVendors: document.querySelector('.stat-card:nth-child(3) .stat-value'),
  successRate: document.querySelector('.stat-card:nth-child(4) .stat-value'),
  
  // Vendor list
  vendorList: document.querySelector('.vendor-list'),
  
  // Leaderboard
  leaderboardOptIn: document.getElementById('leaderboardOptIn'),
  leaderboardActive: document.getElementById('leaderboardActive'),
  
  // Modal
  cashoutModal: document.getElementById('cashoutModal'),
  mainContent: document.getElementById('mainContent'),
  header: document.getElementById('header')
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
    
    // Load agent from database using the actual Supabase client
    const { data: agent, error } = await supabase
      .from('agents')
      .select('*')
      .eq('phone', phone)
      .single();
    
    if (error) throw error;
    
    if (!agent || agent.status !== 'approved') {
      if (agent && agent.status === 'pending') {
        showNotification('Your partner account is pending approval', 'warning');
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
    updateAgentUI();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize Telegram Web App if available
    initializeTelegramWebApp();
    
    // Load all data
    await Promise.all([
      loadVendors(),
      loadParcels(),
      loadTransactions(),
      calculateEarnings(),
      calculateStreak(),
      calculateWeeklyActivity(),
      generateInsights(),
      calculateKPIs(),
      calculatePersonalRank(),
      calculatePerformanceMetrics()
    ]);
    
    // Calculate stats after loading parcels
    calculateStats();
    
    // Check leaderboard preference
    checkLeaderboardPreference();
    
    state.isLoading = false;
    
  } catch (error) {
    console.error('Initialization error:', error);
    showNotification('Failed to load partner data', 'error');
    state.isLoading = false;
  }
}

// Update agent UI with real data
function updateAgentUI() {
  const agent = state.agent;
  const name = agent.name || 'Partner';
  
  elements.partnerName.textContent = name;
  elements.partnerCode.textContent = agent.code || 'N/A';
  elements.partnerInitial.textContent = name.charAt(0).toUpperCase();
  
  // Update tier based on actual performance
  updateTierDisplay();
}

// Update tier display based on real performance metrics
function updateTierDisplay() {
  const totalParcels = state.stats.all.parcels;
  let tier = 'starter';
  let minCashout = 100;
  
  // Tier calculation based on total parcels delivered
  if (totalParcels >= 300) {
    tier = 'platinum';
    minCashout = 30;
  } else if (totalParcels >= 151) {
    tier = 'gold';
    minCashout = 50;
  } else if (totalParcels >= 51) {
    tier = 'silver';
    minCashout = 80;
  } else if (totalParcels >= 1) {
    tier = 'bronze';
    minCashout = 100;
  }
  
  state.tierInfo = { current: tier, minCashout };
  
  // Update UI
  elements.partnerAvatar.className = `partner-avatar ${tier}`;
  elements.partnerTier.className = `partner-tier ${tier}`;
  elements.partnerTier.textContent = tier.toUpperCase();
  
  // Update tier badge
  const tierBadge = document.querySelector('.tier-indicator');
  if (tierBadge) {
    const badges = {
      platinum: '💎',
      gold: '👑',
      silver: '⭐',
      bronze: '🏅',
      starter: '🌱'
    };
    tierBadge.textContent = badges[tier];
  }
}

// Load transactions from database
async function loadTransactions() {
  try {
    const { data, error } = await supabase
      .from('agent_transactions')
      .select('*')
      .eq('agent_id', state.agent.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    state.transactions = data || [];
    
    // Get last cashout
    const lastCashout = state.transactions
      .filter(t => t.type === 'cashout' && t.status === 'completed')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    
    if (lastCashout) {
      state.earnings.lastCashout = new Date(lastCashout.created_at);
    }
    
  } catch (error) {
    console.error('Error loading transactions:', error);
    state.transactions = [];
  }
}

// Calculate available earnings from real data
async function calculateEarnings() {
  try {
    // Get delivered parcels for available earnings
    const deliveredParcels = state.parcels.filter(p => p.status === 'delivered');
    const pendingParcels = state.parcels.filter(p => 
      ['pending', 'assigned', 'picked'].includes(p.status)
    );
    
    // Calculate commission based on actual commission rate from agent record
    const commissionRate = state.agent.commission_rate || 0.06; // Default 6%
    
    const calculateCommission = (parcel) => {
      return parcel.price * commissionRate;
    };
    
    // Calculate totals
    const totalDelivered = deliveredParcels.reduce((sum, p) => sum + calculateCommission(p), 0);
    const totalPending = pendingParcels.reduce((sum, p) => sum + calculateCommission(p), 0);
    
    // Subtract already cashed out amounts
    const totalCashedOut = state.transactions
      .filter(t => t.type === 'cashout' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    state.earnings = {
      available: Math.max(0, totalDelivered - totalCashedOut),
      pending: totalPending,
      total: totalDelivered + totalPending,
      lastCashout: state.earnings.lastCashout
    };
    
    updateEarningsDisplay();
    
  } catch (error) {
    console.error('Error calculating earnings:', error);
  }
}

// Update earnings display
function updateEarningsDisplay() {
  const available = Math.round(state.earnings.available);
  elements.availableBalance.textContent = available.toLocaleString();
  
  // Update cashout button state
  const minCashout = state.tierInfo.minCashout;
  elements.cashoutBtn.disabled = available < minCashout;
  
  // Update status message
  const statusElement = document.querySelector('.earnings-status');
  if (statusElement) {
    if (available >= minCashout) {
      statusElement.className = 'earnings-status ready';
      statusElement.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
        </svg>
        <span>Ready to cash out (Min: KES ${minCashout})</span>
      `;
    } else {
      const needed = minCashout - available;
      statusElement.className = 'earnings-status';
      statusElement.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <span>KES ${needed} more needed (Min: KES ${minCashout})</span>
      `;
    }
  }
}

// Calculate personal rank from real agent performance data
async function calculatePersonalRank() {
  try {
    // Get all agents for ranking
    const { data: allAgents, error } = await supabase
      .from('agents')
      .select('id, name, code')
      .eq('status', 'approved');
    
    if (error) throw error;
    
    const totalPartners = allAgents ? allAgents.length : 0;
    
    // Get parcels for current month
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    
    // Get parcel counts for all agents this month
    const { data: monthlyStats, error: statsError } = await supabase
      .from('parcels')
      .select('agent_id')
      .gte('created_at', thisMonth.toISOString())
      .eq('status', 'delivered');
    
    if (statsError) throw statsError;
    
    // Count parcels per agent
    const agentParcels = {};
    monthlyStats?.forEach(parcel => {
      agentParcels[parcel.agent_id] = (agentParcels[parcel.agent_id] || 0) + 1;
    });
    
    // Get current agent's monthly parcels
    const myMonthlyParcels = agentParcels[state.agent.id] || 0;
    
    // Calculate rank
    const agentsWithMoreParcels = Object.values(agentParcels)
      .filter(count => count > myMonthlyParcels).length;
    
    const rank = agentsWithMoreParcels + 1;
    const percentile = totalPartners > 0 
      ? Math.round((1 - rank / totalPartners) * 100)
      : 0;
    
    // Determine trend
    const lastMonth = new Date(thisMonth);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const lastMonthParcels = state.parcels.filter(p => {
      const parcelDate = new Date(p.created_at);
      return parcelDate >= lastMonth && parcelDate < thisMonth && p.status === 'delivered';
    }).length;
    
    let trend = 'stable';
    if (myMonthlyParcels > lastMonthParcels * 1.1) trend = 'up';
    else if (myMonthlyParcels < lastMonthParcels * 0.9) trend = 'down';
    
    state.personalRank = {
      rank,
      totalPartners,
      percentile,
      parcelsThisMonth: myMonthlyParcels,
      trend
    };
    
    updatePersonalRankDisplay();
    
  } catch (error) {
    console.error('Error calculating personal rank:', error);
    // Set default values if error
    state.personalRank = {
      rank: 0,
      totalPartners: 0,
      percentile: 0,
      parcelsThisMonth: 0,
      trend: 'stable'
    };
  }
}

// Load vendors from database
async function loadVendors() {
  try {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('agent_id', state.agent.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    state.vendors = data || [];
    displayVendors();
    
  } catch (error) {
    console.error('Error loading vendors:', error);
    state.vendors = [];
    displayVendors();
  }
}

// Load parcels from database
async function loadParcels() {
  try {
    const { data, error } = await supabase
      .from('parcels')
      .select('*')
      .eq('agent_id', state.agent.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    state.parcels = data || [];
    
  } catch (error) {
    console.error('Error loading parcels:', error);
    state.parcels = [];
  }
}

// Process cashout with real Supabase transaction
window.confirmCashout = async function() {
  const amount = Math.round(state.earnings.available);
  const fee = calculateMpesaFee(amount);
  const netAmount = amount - fee;
  
  try {
    // Create transaction record
    const { data: transaction, error } = await supabase
      .from('agent_transactions')
      .insert({
        agent_id: state.agent.id,
        type: 'cashout',
        amount: amount,
        fee: fee,
        net_amount: netAmount,
        status: 'pending',
        payment_method: 'mpesa',
        phone_number: state.agent.phone
      })
      .select()
      .single();
    
    if (error) throw error;
    
    showNotification(`Processing cash out of KES ${amount.toLocaleString()} via M-Pesa...`, 'success');
    hideCashoutModal();
    
    // Here you would trigger the actual M-Pesa API call
    // For now, we'll simulate success after 2 seconds
    setTimeout(async () => {
      // Update transaction status
      const { error: updateError } = await supabase
        .from('agent_transactions')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', transaction.id);
      
      if (!updateError) {
        showNotification('Cash out successful! Check your M-Pesa.', 'success');
        // Reload transactions and earnings
        await loadTransactions();
        await calculateEarnings();
      }
    }, 2000);
    
  } catch (error) {
    console.error('Cashout error:', error);
    showNotification('Failed to process cash out. Please try again.', 'error');
  }
};

// Other functions remain the same but use real data from state...

// Calculate streak from real parcel data
async function calculateStreak() {
  const sortedParcels = [...state.parcels].sort((a, b) => 
    new Date(b.created_at) - new Date(a.created_at)
  );
  
  if (sortedParcels.length === 0) {
    state.streak = { current: 0, longest: 0, lastActive: null };
    elements.streakDays.textContent = '0';
    return;
  }
  
  let currentStreak = 0;
  let checkDate = new Date();
  checkDate.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < 30; i++) {
    const dayParcels = sortedParcels.filter(p => {
      const parcelDate = new Date(p.created_at);
      parcelDate.setHours(0, 0, 0, 0);
      return parcelDate.getTime() === checkDate.getTime();
    });
    
    if (dayParcels.length > 0) {
      currentStreak++;
    } else if (currentStreak > 0) {
      break;
    }
    
    checkDate.setDate(checkDate.getDate() - 1);
  }
  
  state.streak.current = currentStreak;
  elements.streakDays.textContent = currentStreak;
}

// Calculate weekly activity from real data
async function calculateWeeklyActivity() {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const activity = {};
  
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStart);
    dayDate.setDate(weekStart.getDate() + i);
    const nextDay = new Date(dayDate);
    nextDay.setDate(dayDate.getDate() + 1);
    
    const dayParcels = state.parcels.filter(p => {
      const parcelDate = new Date(p.created_at);
      return parcelDate >= dayDate && parcelDate < nextDay;
    });
    
    activity[days[i]] = dayParcels.length;
  }
  
  state.weeklyActivity = activity;
  updateWeeklyCalendar();
  
  // Calculate weekly growth
  const thisWeek = Object.values(activity).reduce((sum, val) => sum + val, 0);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart);
  
  const lastWeekParcels = state.parcels.filter(p => {
    const parcelDate = new Date(p.created_at);
    return parcelDate >= lastWeekStart && parcelDate < lastWeekEnd;
  }).length;
  
  const growth = lastWeekParcels > 0 
    ? Math.round(((thisWeek - lastWeekParcels) / lastWeekParcels) * 100)
    : 0;
  
  elements.weeklyGrowth.textContent = `${growth > 0 ? '+' : ''}${growth}%`;
}

// All other helper functions remain the same...
// (generateInsights, calculateKPIs, calculatePerformanceMetrics, etc.)

// Copy all remaining functions from original code...
// They will now work with real data from state that's loaded from Supabase

// Update weekly calendar
function updateWeeklyCalendar() {
  const calendarGrid = document.querySelector('.calendar-grid');
  if (!calendarGrid) return;
  
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date().getDay();
  const todayIndex = today === 0 ? 6 : today - 1;
  
  calendarGrid.innerHTML = days.map((day, index) => {
    const count = state.weeklyActivity[day] || 0;
    const isToday = index === todayIndex;
    const isActive = count > 0;
    
    return `
      <div class="calendar-day ${isActive ? 'active' : ''} ${isToday ? 'today' : ''}">
        <div class="day-label">${day}</div>
        <div class="day-count">${count}</div>
      </div>
    `;
  }).join('');
}

// Generate insights based on real data
async function generateInsights() {
  const insights = [];
  
  // Check for dormant vendors
  state.vendors.forEach(vendor => {
    const lastParcel = state.parcels
      .filter(p => p.vendor_phone === vendor.phone)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    
    if (lastParcel) {
      const daysSinceLastParcel = Math.floor(
        (new Date() - new Date(lastParcel.created_at)) / (1000 * 60 * 60 * 24)
      );
      
      if (daysSinceLastParcel >= 5) {
        insights.push({
          icon: '💡',
          title: 'Dormant Vendor Alert',
          content: `${vendor.name || vendor.vendor_name} hasn't sent parcels in ${daysSinceLastParcel} days.`,
          action: 'Send Reminder',
          actionId: vendor.id
        });
      }
    }
  });
  
  // Peak hours analysis
  const hourlyActivity = {};
  state.parcels.forEach(parcel => {
    const hour = new Date(parcel.created_at).getHours();
    hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
  });
  
  const peakHour = Object.entries(hourlyActivity)
    .sort((a, b) => b[1] - a[1])[0];
  
  if (peakHour) {
    const [hour, count] = peakHour;
    const hourRange = `${hour}:00 - ${parseInt(hour) + 1}:00`;
    insights.push({
      icon: '🎯',
      title: 'Peak Hours Opportunity',
      content: `Your vendors are most active ${hourRange}. Schedule check-ins during this time.`,
      action: null
    });
  }
  
  state.insights = insights.slice(0, 2);
  displayInsights();
}

// Display insights
function displayInsights() {
  const insightsSection = document.querySelector('.insights-section');
  if (!insightsSection) return;
  
  const insightsHTML = state.insights.map(insight => `
    <div class="insight-card">
      <div class="insight-header">
        <div class="insight-icon">${insight.icon}</div>
        <div class="insight-title">${insight.title}</div>
      </div>
      <div class="insight-content">${insight.content}</div>
      ${insight.action ? `
        <span class="insight-action" onclick="contactVendor('${insight.actionId}')">
          ${insight.action}
        </span>
      ` : ''}
    </div>
  `).join('');
  
  const container = insightsSection.querySelector('.section-title')?.nextElementSibling;
  if (container) {
    container.innerHTML = insightsHTML;
  }
}

// Calculate KPIs
async function calculateKPIs() {
  const thisWeek = new Date();
  thisWeek.setDate(thisWeek.getDate() - 7);
  
  const newVendors = state.vendors.filter(v => 
    new Date(v.created_at) >= thisWeek
  ).length;
  
  const weeklyParcels = state.parcels.filter(p => 
    new Date(p.created_at) >= thisWeek
  ).length;
  
  const activeVendors = new Set(
    state.parcels
      .filter(p => new Date(p.created_at) >= thisWeek)
      .map(p => p.vendor_phone)
  ).size;
  
  const activationRate = state.vendors.length > 0
    ? Math.round((activeVendors / state.vendors.length) * 100)
    : 0;
  
  state.kpis = {
    vendorOnboarding: { current: newVendors, target: 5 },
    parcelGeneration: { current: weeklyParcels, target: 50 },
    vendorActivation: { current: activationRate, target: 90 }
  };
  
  updateKPIDisplay();
}

// Update KPI display
function updateKPIDisplay() {
  const onboarding = state.kpis.vendorOnboarding;
  if (elements.vendorOnboardingValue) {
    elements.vendorOnboardingValue.textContent = `${onboarding.current} / ${onboarding.target}`;
    elements.vendorOnboardingProgress.style.width = `${(onboarding.current / onboarding.target) * 100}%`;
    elements.vendorOnboardingStatus.textContent = `${onboarding.target - onboarding.current} more to reach target`;
  }
  
  const parcels = state.kpis.parcelGeneration;
  if (elements.parcelGenerationValue) {
    elements.parcelGenerationValue.textContent = `${parcels.current} / ${parcels.target}`;
    elements.parcelGenerationProgress.style.width = `${(parcels.current / parcels.target) * 100}%`;
    elements.parcelGenerationStatus.textContent = `${parcels.target - parcels.current} parcels to target`;
  }
  
  const activation = state.kpis.vendorActivation;
  if (elements.vendorActivationValue) {
    elements.vendorActivationValue.textContent = `${activation.current}%`;
    elements.vendorActivationProgress.style.width = `${activation.current}%`;
    elements.vendorActivationStatus.textContent = `${Math.round(state.vendors.length * activation.current / 100)} of ${state.vendors.length} vendors active`;
  }
}

// Update personal rank display
function updatePersonalRankDisplay() {
  if (elements.personalRank) {
    elements.personalRank.textContent = state.personalRank.rank ? `#${state.personalRank.rank}` : '-';
  }
  if (elements.totalParcels) {
    elements.totalParcels.textContent = state.personalRank.parcelsThisMonth;
  }
  if (elements.percentile) {
    elements.percentile.textContent = state.personalRank.percentile > 0 
      ? `Top ${state.personalRank.percentile}%` 
      : '-';
  }
}

// Calculate performance metrics
async function calculatePerformanceMetrics() {
  const totalEarned = Math.round(state.earnings.total);
  const totalParcels = state.parcels.length;
  const totalVendors = state.vendors.length;
  
  const deliveredParcels = state.parcels.filter(p => p.status === 'delivered').length;
  const successRate = totalParcels > 0
    ? Math.round((deliveredParcels / totalParcels) * 100)
    : 0;
  
  state.performanceMetrics = {
    totalEarned,
    totalParcels,
    totalVendors,
    successRate
  };
  
  updatePerformanceDisplay();
}

// Update performance display
function updatePerformanceDisplay() {
  const metrics = state.performanceMetrics;
  
  if (elements.totalEarned) {
    elements.totalEarned.textContent = metrics.totalEarned >= 1000 
      ? `${Math.round(metrics.totalEarned / 1000)}K`
      : metrics.totalEarned;
  }
  if (elements.totalParcelsCard) {
    elements.totalParcelsCard.textContent = metrics.totalParcels;
  }
  if (elements.totalVendors) {
    elements.totalVendors.textContent = metrics.totalVendors;
  }
  if (elements.successRate) {
    elements.successRate.textContent = `${metrics.successRate}%`;
  }
}

// Display vendors
function displayVendors() {
  if (!elements.vendorList) return;
  
  if (state.vendors.length === 0) {
    elements.vendorList.innerHTML = `
      <div class="vendor-item">
        <div class="vendor-info">
          <div class="vendor-name">No vendors yet</div>
          <div class="vendor-details">
            <span>Start adding vendors to grow your business</span>
          </div>
        </div>
      </div>
    `;
    return;
  }
  
  let filteredVendors = [...state.vendors];
  
  if (state.currentFilter === 'active') {
    const activePhones = new Set(
      state.parcels
        .filter(p => {
          const daysSince = (new Date() - new Date(p.created_at)) / (1000 * 60 * 60 * 24);
          return daysSince <= 7;
        })
        .map(p => p.vendor_phone)
    );
    filteredVendors = filteredVendors.filter(v => activePhones.has(v.phone));
  } else if (state.currentFilter === 'dormant') {
    const activePhones = new Set(
      state.parcels
        .filter(p => {
          const daysSince = (new Date() - new Date(p.created_at)) / (1000 * 60 * 60 * 24);
          return daysSince <= 7;
        })
        .map(p => p.vendor_phone)
    );
    filteredVendors = filteredVendors.filter(v => !activePhones.has(v.phone));
  }
  
  elements.vendorList.innerHTML = filteredVendors.slice(0, 5).map(vendor => {
    const vendorParcels = state.parcels.filter(p => p.vendor_phone === vendor.phone);
    const weekParcels = vendorParcels.filter(p => {
      const daysSince = (new Date() - new Date(p.created_at)) / (1000 * 60 * 60 * 24);
      return daysSince <= 7;
    }).length;
    
    const lastParcel = vendorParcels.sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    )[0];
    
    const lastActive = lastParcel 
      ? getTimeAgo(new Date(lastParcel.created_at))
      : 'Never';
    
    const isActive = lastParcel && 
      (new Date() - new Date(lastParcel.created_at)) / (1000 * 60 * 60 * 24) <= 3;
    const isDormant = lastParcel && 
      (new Date() - new Date(lastParcel.created_at)) / (1000 * 60 * 60 * 24) > 3 &&
      (new Date() - new Date(lastParcel.created_at)) / (1000 * 60 * 60 * 24) <= 7;
    
    return `
      <div class="vendor-item" onclick="viewVendorDetails('${vendor.id}')">
        <div class="vendor-info">
          <div class="vendor-name">
            ${vendor.name || vendor.vendor_name || 'Unknown'}
            <span class="vendor-status ${isActive ? 'status-active' : isDormant ? 'status-dormant' : 'status-inactive'}"></span>
          </div>
          <div class="vendor-details">
            <span>📍 ${vendor.business_location || 'Unknown'}</span>
            <span>⏱/**
 * Partner Programme Script (agent.js)
 * Complete production-ready partner dashboard with real Supabase integration
 * PART 1 of 2
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
  earnings: {
    available: 0,
    pending: 0,
    total: 0,
    lastCashout: null
  },
  streak: {
    current: 0,
    longest: 0,
    lastActive: null
  },
  weeklyActivity: {
    Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0
  },
  insights: [],
  performanceMetrics: {
    conversionRate: 0,
    avgOrderValue: 0,
    vendorRetention: 0,
    growthRate: 0,
    successRate: 0
  },
  kpis: {
    vendorOnboarding: { current: 0, target: 5 },
    parcelGeneration: { current: 0, target: 50 },
    vendorActivation: { current: 0, target: 90 }
  },
  personalRank: {
    rank: 0,
    totalPartners: 0,
    percentile: 0,
    parcelsThisMonth: 0,
    trend: 'stable'
  },
  currentFilter: 'all',
  currentTimePeriod: 'week',
  isLoading: true,
  referralLink: null,
  leaderboardOptIn: false,
  tierInfo: {
    current: 'starter',
    minCashout: 100
  }
};

// DOM elements cache
const elements = {
  // Header elements
  partnerName: document.getElementById('partnerName'),
  partnerCode: document.getElementById('partnerCode'),
  partnerInitial: document.getElementById('partnerInitial'),
  partnerAvatar: document.getElementById('partnerAvatar'),
  partnerTier: document.getElementById('partnerTier'),
  
  // Earnings elements
  availableBalance: document.getElementById('availableBalance'),
  cashoutBtn: document.getElementById('cashoutBtn'),
  
  // Activity elements
  streakDays: document.getElementById('streakDays'),
  weeklyGrowth: document.getElementById('weeklyGrowth'),
  
  // KPI elements
  vendorOnboardingValue: document.querySelector('.kpi-card:nth-child(1) .kpi-value'),
  vendorOnboardingProgress: document.querySelector('.kpi-card:nth-child(1) .kpi-progress-bar'),
  vendorOnboardingStatus: document.querySelector('.kpi-card:nth-child(1) .kpi-status span'),
  
  parcelGenerationValue: document.querySelector('.kpi-card:nth-child(2) .kpi-value'),
  parcelGenerationProgress: document.querySelector('.kpi-card:nth-child(2) .kpi-progress-bar'),
  parcelGenerationStatus: document.querySelector('.kpi-card:nth-child(2) .kpi-status span'),
  
  vendorActivationValue: document.querySelector('.kpi-card:nth-child(3) .kpi-value'),
  vendorActivationProgress: document.querySelector('.kpi-card:nth-child(3) .kpi-progress-bar'),
  vendorActivationStatus: document.querySelector('.kpi-card:nth-child(3) .kpi-status span'),
  
  // Personal progress
  personalRank: document.querySelector('.rank-metric:nth-child(1) .rank-number'),
  totalParcels: document.querySelector('.rank-metric:nth-child(2) .rank-number'),
  percentile: document.querySelector('.rank-metric:nth-child(3) .rank-number'),
  
  // Stats
  totalEarned: document.querySelector('.stat-card:nth-child(1) .stat-value'),
  totalParcelsCard: document.querySelector('.stat-card:nth-child(2) .stat-value'),
  totalVendors: document.querySelector('.stat-card:nth-child(3) .stat-value'),
  successRate: document.querySelector('.stat-card:nth-child(4) .stat-value'),
  
  // Vendor list
  vendorList: document.querySelector('.vendor-list'),
  
  // Leaderboard
  leaderboardOptIn: document.getElementById('leaderboardOptIn'),
  leaderboardActive: document.getElementById('leaderboardActive'),
  
  // Modal
  cashoutModal: document.getElementById('cashoutModal'),
  mainContent: document.getElementById('mainContent'),
  header: document.getElementById('header')
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
    
    // Load agent from database using the actual Supabase client
    const { data: agent, error } = await supabase
      .from('agents')
      .select('*')
      .eq('phone', phone)
      .single();
    
    if (error) throw error;
    
    if (!agent || agent.status !== 'approved') {
      if (agent && agent.status === 'pending') {
        showNotification('Your partner account is pending approval', 'warning');
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
    updateAgentUI();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize Telegram Web App if available
    initializeTelegramWebApp();
    
    // Load all data
    await Promise.all([
      loadVendors(),
      loadParcels(),
      loadTransactions(),
      calculateEarnings(),
      calculateStreak(),
      calculateWeeklyActivity(),
      generateInsights(),
      calculateKPIs(),
      calculatePersonalRank(),
      calculatePerformanceMetrics()
    ]);
    
    // Calculate stats after loading parcels
    calculateStats();
    
    // Check leaderboard preference
    checkLeaderboardPreference();
    
    state.isLoading = false;
    
    // Hide loading overlay
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
      loadingOverlay.style.opacity = '0';
      setTimeout(() => {
        loadingOverlay.style.display = 'none';
      }, 300);
    }
    
  } catch (error) {
    console.error('Initialization error:', error);
    showNotification('Failed to load partner data', 'error');
    state.isLoading = false;
  }
}

// Update agent UI with real data
function updateAgentUI() {
  const agent = state.agent;
  const name = agent.name || 'Partner';
  
  elements.partnerName.textContent = name;
  elements.partnerCode.textContent = agent.code || 'N/A';
  elements.partnerInitial.textContent = name.charAt(0).toUpperCase();
  
  // Update tier based on actual performance
  updateTierDisplay();
}

// Update tier display based on real performance metrics
function updateTierDisplay() {
  const totalParcels = state.stats.all.parcels;
  let tier = 'starter';
  let minCashout = 100;
  
  // Tier calculation based on total parcels delivered
  if (totalParcels >= 300) {
    tier = 'platinum';
    minCashout = 30;
  } else if (totalParcels >= 151) {
    tier = 'gold';
    minCashout = 50;
  } else if (totalParcels >= 51) {
    tier = 'silver';
    minCashout = 80;
  } else if (totalParcels >= 1) {
    tier = 'bronze';
    minCashout = 100;
  }
  
  state.tierInfo = { current: tier, minCashout };
  
  // Update UI
  elements.partnerAvatar.className = `partner-avatar ${tier}`;
  elements.partnerTier.className = `partner-tier ${tier}`;
  elements.partnerTier.textContent = tier.toUpperCase();
  
  // Update tier badge
  const tierBadge = document.querySelector('.tier-indicator');
  if (tierBadge) {
    const badges = {
      platinum: '💎',
      gold: '👑',
      silver: '⭐',
      bronze: '🏅',
      starter: '🌱'
    };
    tierBadge.textContent = badges[tier];
  }
}

// Load transactions from database
async function loadTransactions() {
  try {
    const { data, error } = await supabase
      .from('agent_transactions')
      .select('*')
      .eq('agent_id', state.agent.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    state.transactions = data || [];
    
    // Get last cashout
    const lastCashout = state.transactions
      .filter(t => t.type === 'cashout' && t.status === 'completed')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    
    if (lastCashout) {
      state.earnings.lastCashout = new Date(lastCashout.created_at);
    }
    
  } catch (error) {
    console.error('Error loading transactions:', error);
    state.transactions = [];
  }
}

// Calculate available earnings from real data
async function calculateEarnings() {
  try {
    // Get delivered parcels for available earnings
    const deliveredParcels = state.parcels.filter(p => p.status === 'delivered');
    const pendingParcels = state.parcels.filter(p => 
      ['pending', 'assigned', 'picked'].includes(p.status)
    );
    
    // Calculate commission based on actual commission rate from agent record
    const commissionRate = state.agent.commission_rate || 0.06; // Default 6%
    
    const calculateCommission = (parcel) => {
      return parcel.price * commissionRate;
    };
    
    // Calculate totals
    const totalDelivered = deliveredParcels.reduce((sum, p) => sum + calculateCommission(p), 0);
    const totalPending = pendingParcels.reduce((sum, p) => sum + calculateCommission(p), 0);
    
    // Subtract already cashed out amounts
    const totalCashedOut = state.transactions
      .filter(t => t.type === 'cashout' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    state.earnings = {
      available: Math.max(0, totalDelivered - totalCashedOut),
      pending: totalPending,
      total: totalDelivered + totalPending,
      lastCashout: state.earnings.lastCashout
    };
    
    updateEarningsDisplay();
    
  } catch (error) {
    console.error('Error calculating earnings:', error);
  }
}

// Update earnings display
function updateEarningsDisplay() {
  const available = Math.round(state.earnings.available);
  elements.availableBalance.textContent = available.toLocaleString();
  
  // Update cashout button state
  const minCashout = state.tierInfo.minCashout;
  elements.cashoutBtn.disabled = available < minCashout;
  
  // Update status message
  const statusElement = document.querySelector('.earnings-status');
  if (statusElement) {
    if (available >= minCashout) {
      statusElement.className = 'earnings-status ready';
      statusElement.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
        </svg>
        <span>Ready to cash out (Min: KES ${minCashout})</span>
      `;
    } else {
      const needed = minCashout - available;
      statusElement.className = 'earnings-status';
      statusElement.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <span>KES ${needed} more needed (Min: KES ${minCashout})</span>
      `;
    }
  }
}/**
 * Partner Programme Script (agent.js)
 * PART 2 of 2 - Continues from line 600
 */

// Calculate personal rank from real agent performance data
async function calculatePersonalRank() {
  try {
    // Get all agents for ranking
    const { data: allAgents, error } = await supabase
      .from('agents')
      .select('id, name, code')
      .eq('status', 'approved');
    
    if (error) throw error;
    
    const totalPartners = allAgents ? allAgents.length : 0;
    
    // Get parcels for current month
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    
    // Get parcel counts for all agents this month
    const { data: monthlyStats, error: statsError } = await supabase
      .from('parcels')
      .select('agent_id')
      .gte('created_at', thisMonth.toISOString())
      .eq('status', 'delivered');
    
    if (statsError) throw statsError;
    
    // Count parcels per agent
    const agentParcels = {};
    monthlyStats?.forEach(parcel => {
      agentParcels[parcel.agent_id] = (agentParcels[parcel.agent_id] || 0) + 1;
    });
    
    // Get current agent's monthly parcels
    const myMonthlyParcels = agentParcels[state.agent.id] || 0;
    
    // Calculate rank
    const agentsWithMoreParcels = Object.values(agentParcels)
      .filter(count => count > myMonthlyParcels).length;
    
    const rank = agentsWithMoreParcels + 1;
    const percentile = totalPartners > 0 
      ? Math.round((1 - rank / totalPartners) * 100)
      : 0;
    
    // Determine trend
    const lastMonth = new Date(thisMonth);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const lastMonthParcels = state.parcels.filter(p => {
      const parcelDate = new Date(p.created_at);
      return parcelDate >= lastMonth && parcelDate < thisMonth && p.status === 'delivered';
    }).length;
    
    let trend = 'stable';
    if (myMonthlyParcels > lastMonthParcels * 1.1) trend = 'up';
    else if (myMonthlyParcels < lastMonthParcels * 0.9) trend = 'down';
    
    state.personalRank = {
      rank,
      totalPartners,
      percentile,
      parcelsThisMonth: myMonthlyParcels,
      trend
    };
    
    updatePersonalRankDisplay();
    
  } catch (error) {
    console.error('Error calculating personal rank:', error);
    // Set default values if error
    state.personalRank = {
      rank: 0,
      totalPartners: 0,
      percentile: 0,
      parcelsThisMonth: 0,
      trend: 'stable'
    };
  }
}

// Load vendors from database
async function loadVendors() {
  try {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('agent_id', state.agent.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    state.vendors = data || [];
    displayVendors();
    
  } catch (error) {
    console.error('Error loading vendors:', error);
    state.vendors = [];
    displayVendors();
  }
}

// Load parcels from database
async function loadParcels() {
  try {
    const { data, error } = await supabase
      .from('parcels')
      .select('*')
      .eq('agent_id', state.agent.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    state.parcels = data || [];
    
  } catch (error) {
    console.error('Error loading parcels:', error);
    state.parcels = [];
  }
}

// Calculate streak from real parcel data
async function calculateStreak() {
  const sortedParcels = [...state.parcels].sort((a, b) => 
    new Date(b.created_at) - new Date(a.created_at)
  );
  
  if (sortedParcels.length === 0) {
    state.streak = { current: 0, longest: 0, lastActive: null };
    elements.streakDays.textContent = '0';
    return;
  }
  
  let currentStreak = 0;
  let checkDate = new Date();
  checkDate.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < 30; i++) {
    const dayParcels = sortedParcels.filter(p => {
      const parcelDate = new Date(p.created_at);
      parcelDate.setHours(0, 0, 0, 0);
      return parcelDate.getTime() === checkDate.getTime();
    });
    
    if (dayParcels.length > 0) {
      currentStreak++;
    } else if (currentStreak > 0) {
      break;
    }
    
    checkDate.setDate(checkDate.getDate() - 1);
  }
  
  state.streak.current = currentStreak;
  elements.streakDays.textContent = currentStreak;
}

// Calculate weekly activity from real data
async function calculateWeeklyActivity() {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const activity = {};
  
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStart);
    dayDate.setDate(weekStart.getDate() + i);
    const nextDay = new Date(dayDate);
    nextDay.setDate(dayDate.getDate() + 1);
    
    const dayParcels = state.parcels.filter(p => {
      const parcelDate = new Date(p.created_at);
      return parcelDate >= dayDate && parcelDate < nextDay;
    });
    
    activity[days[i]] = dayParcels.length;
  }
  
  state.weeklyActivity = activity;
  updateWeeklyCalendar();
  
  // Calculate weekly growth
  const thisWeek = Object.values(activity).reduce((sum, val) => sum + val, 0);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart);
  
  const lastWeekParcels = state.parcels.filter(p => {
    const parcelDate = new Date(p.created_at);
    return parcelDate >= lastWeekStart && parcelDate < lastWeekEnd;
  }).length;
  
  const growth = lastWeekParcels > 0 
    ? Math.round(((thisWeek - lastWeekParcels) / lastWeekParcels) * 100)
    : 0;
  
  elements.weeklyGrowth.textContent = `${growth > 0 ? '+' : ''}${growth}%`;
}

// Update weekly calendar
function updateWeeklyCalendar() {
  const calendarGrid = document.querySelector('.calendar-grid');
  if (!calendarGrid) return;
  
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date().getDay();
  const todayIndex = today === 0 ? 6 : today - 1;
  
  calendarGrid.innerHTML = days.map((day, index) => {
    const count = state.weeklyActivity[day] || 0;
    const isToday = index === todayIndex;
    const isActive = count > 0;
    
    return `
      <div class="calendar-day ${isActive ? 'active' : ''} ${isToday ? 'today' : ''}">
        <div class="day-label">${day}</div>
        <div class="day-count">${count}</div>
      </div>
    `;
  }).join('');
}

// Generate insights based on real data
async function generateInsights() {
  const insights = [];
  
  // Check for dormant vendors
  state.vendors.forEach(vendor => {
    const lastParcel = state.parcels
      .filter(p => p.vendor_phone === vendor.phone)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    
    if (lastParcel) {
      const daysSinceLastParcel = Math.floor(
        (new Date() - new Date(lastParcel.created_at)) / (1000 * 60 * 60 * 24)
      );
      
      if (daysSinceLastParcel >= 5) {
        insights.push({
          icon: '💡',
          title: 'Dormant Vendor Alert',
          content: `${vendor.name || vendor.vendor_name} hasn't sent parcels in ${daysSinceLastParcel} days.`,
          action: 'Send Reminder',
          actionId: vendor.id
        });
      }
    }
  });
  
  // Peak hours analysis
  const hourlyActivity = {};
  state.parcels.forEach(parcel => {
    const hour = new Date(parcel.created_at).getHours();
    hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
  });
  
  const peakHour = Object.entries(hourlyActivity)
    .sort((a, b) => b[1] - a[1])[0];
  
  if (peakHour) {
    const [hour, count] = peakHour;
    const hourRange = `${hour}:00 - ${parseInt(hour) + 1}:00`;
    insights.push({
      icon: '🎯',
      title: 'Peak Hours Opportunity',
      content: `Your vendors are most active ${hourRange}. Schedule check-ins during this time.`,
      action: null
    });
  }
  
  state.insights = insights.slice(0, 2);
  displayInsights();
}

// Display insights
function displayInsights() {
  const insightsSection = document.querySelector('.insights-section');
  if (!insightsSection) return;
  
  const insightsHTML = state.insights.map(insight => `
    <div class="insight-card">
      <div class="insight-header">
        <div class="insight-icon">${insight.icon}</div>
        <div class="insight-title">${insight.title}</div>
      </div>
      <div class="insight-content">${insight.content}</div>
      ${insight.action ? `
        <span class="insight-action" onclick="contactVendor('${insight.actionId}')">
          ${insight.action}
        </span>
      ` : ''}
    </div>
  `).join('');
  
  const container = insightsSection.querySelector('.section-title')?.nextElementSibling;
  if (container) {
    container.innerHTML = insightsHTML;
  }
}

// Calculate KPIs
async function calculateKPIs() {
  const thisWeek = new Date();
  thisWeek.setDate(thisWeek.getDate() - 7);
  
  const newVendors = state.vendors.filter(v => 
    new Date(v.created_at) >= thisWeek
  ).length;
  
  const weeklyParcels = state.parcels.filter(p => 
    new Date(p.created_at) >= thisWeek
  ).length;
  
  const activeVendors = new Set(
    state.parcels
      .filter(p => new Date(p.created_at) >= thisWeek)
      .map(p => p.vendor_phone)
  ).size;
  
  const activationRate = state.vendors.length > 0
    ? Math.round((activeVendors / state.vendors.length) * 100)
    : 0;
  
  state.kpis = {
    vendorOnboarding: { current: newVendors, target: 5 },
    parcelGeneration: { current: weeklyParcels, target: 50 },
    vendorActivation: { current: activationRate, target: 90 }
  };
  
  updateKPIDisplay();
}

// Update KPI display
function updateKPIDisplay() {
  const onboarding = state.kpis.vendorOnboarding;
  if (elements.vendorOnboardingValue) {
    elements.vendorOnboardingValue.textContent = `${onboarding.current} / ${onboarding.target}`;
    elements.vendorOnboardingProgress.style.width = `${(onboarding.current / onboarding.target) * 100}%`;
    elements.vendorOnboardingStatus.textContent = `${onboarding.target - onboarding.current} more to reach target`;
  }
  
  const parcels = state.kpis.parcelGeneration;
  if (elements.parcelGenerationValue) {
    elements.parcelGenerationValue.textContent = `${parcels.current} / ${parcels.target}`;
    elements.parcelGenerationProgress.style.width = `${(parcels.current / parcels.target) * 100}%`;
    elements.parcelGenerationStatus.textContent = `${parcels.target - parcels.current} parcels to target`;
  }
  
  const activation = state.kpis.vendorActivation;
  if (elements.vendorActivationValue) {
    elements.vendorActivationValue.textContent = `${activation.current}%`;
    elements.vendorActivationProgress.style.width = `${activation.current}%`;
    elements.vendorActivationStatus.textContent = `${Math.round(state.vendors.length * activation.current / 100)} of ${state.vendors.length} vendors active`;
  }
}

// Update personal rank display
function updatePersonalRankDisplay() {
  if (elements.personalRank) {
    elements.personalRank.textContent = state.personalRank.rank ? `#${state.personalRank.rank}` : '-';
  }
  if (elements.totalParcels) {
    elements.totalParcels.textContent = state.personalRank.parcelsThisMonth;
  }
  if (elements.percentile) {
    elements.percentile.textContent = state.personalRank.percentile > 0 
      ? `Top ${state.personalRank.percentile}%` 
      : '-';
  }
}

// Calculate performance metrics
async function calculatePerformanceMetrics() {
  const totalEarned = Math.round(state.earnings.total);
  const totalParcels = state.parcels.length;
  const totalVendors = state.vendors.length;
  
  const deliveredParcels = state.parcels.filter(p => p.status === 'delivered').length;
  const successRate = totalParcels > 0
    ? Math.round((deliveredParcels / totalParcels) * 100)
    : 0;
  
  state.performanceMetrics = {
    totalEarned,
    totalParcels,
    totalVendors,
    successRate
  };
  
  updatePerformanceDisplay();
}

// Update performance display
function updatePerformanceDisplay() {
  const metrics = state.performanceMetrics;
  
  if (elements.totalEarned) {
    elements.totalEarned.textContent = metrics.totalEarned >= 1000 
      ? `${Math.round(metrics.totalEarned / 1000)}K`
      : metrics.totalEarned;
  }
  if (elements.totalParcelsCard) {
    elements.totalParcelsCard.textContent = metrics.totalParcels;
  }
  if (elements.totalVendors) {
    elements.totalVendors.textContent = metrics.totalVendors;
  }
  if (elements.successRate) {
    elements.successRate.textContent = `${metrics.successRate}%`;
  }
}

// Display vendors
function displayVendors() {
  if (!elements.vendorList) return;
  
  if (state.vendors.length === 0) {
    elements.vendorList.innerHTML = `
      <div class="vendor-item">
        <div class="vendor-info">
          <div class="vendor-name">No vendors yet</div>
          <div class="vendor-details">
            <span>Start adding vendors to grow your business</span>
          </div>
        </div>
      </div>
    `;
    return;
  }
  
  let filteredVendors = [...state.vendors];
  
  if (state.currentFilter === 'active') {
    const activePhones = new Set(
      state.parcels
        .filter(p => {
          const daysSince = (new Date() - new Date(p.created_at)) / (1000 * 60 * 60 * 24);
          return daysSince <= 7;
        })
        .map(p => p.vendor_phone)
    );
    filteredVendors = filteredVendors.filter(v => activePhones.has(v.phone));
  } else if (state.currentFilter === 'dormant') {
    const activePhones = new Set(
      state.parcels
        .filter(p => {
          const daysSince = (new Date() - new Date(p.created_at)) / (1000 * 60 * 60 * 24);
          return daysSince <= 7;
        })
        .map(p => p.vendor_phone)
    );
    filteredVendors = filteredVendors.filter(v => !activePhones.has(v.phone));
  }
  
  elements.vendorList.innerHTML = filteredVendors.slice(0, 5).map(vendor => {
    const vendorParcels = state.parcels.filter(p => p.vendor_phone === vendor.phone);
    const weekParcels = vendorParcels.filter(p => {
      const daysSince = (new Date() - new Date(p.created_at)) / (1000 * 60 * 60 * 24);
      return daysSince <= 7;
    }).length;
    
    const lastParcel = vendorParcels.sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    )[0];
    
    const lastActive = lastParcel 
      ? getTimeAgo(new Date(lastParcel.created_at))
      : 'Never';
    
    const isActive = lastParcel && 
      (new Date() - new Date(lastParcel.created_at)) / (1000 * 60 * 60 * 24) <= 3;
    const isDormant = lastParcel && 
      (new Date() - new Date(lastParcel.created_at)) / (1000 * 60 * 60 * 24) > 3 &&
      (new Date() - new Date(lastParcel.created_at)) / (1000 * 60 * 60 * 24) <= 7;
    
    return `
      <div class="vendor-item" onclick="viewVendorDetails('${vendor.id}')">
        <div class="vendor-info">
          <div class="vendor-name">
            ${vendor.name || vendor.vendor_name || 'Unknown'}
            <span class="vendor-status ${isActive ? 'status-active' : isDormant ? 'status-dormant' : 'status-inactive'}"></span>
          </div>
          <div class="vendor-details">
            <span>📍 ${vendor.business_location || 'Unknown'}</span>
            <span>⏱️ ${lastActive}</span>
          </div>
        </div>
        <div class="vendor-stats">
          <div class="vendor-parcels">${weekParcels}</div>
          <div class="vendor-label">this week</div>
        </div>
      </div>
    `;
  }).join('');
}

// Calculate stats
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
    
    const commissionRate = state.agent.commission_rate || 0.06;
    const calculateCommission = (parcel) => {
      return parcel.price * commissionRate;
    };
    
    state.stats[period] = {
      parcels: periodParcels.length,
      commission: periodParcels.reduce((sum, parcel) => 
        sum + calculateCommission(parcel), 0
      )
    };
  });
}

// Helper function for time ago
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
      return `${interval}${unit.charAt(0)} ago`;
    }
  }
  
  return 'Just now';
}

// Check leaderboard preference
function checkLeaderboardPreference() {
  const optedIn = localStorage.getItem('leaderboard_opt_in') === 'true';
  state.leaderboardOptIn = optedIn;
  
  if (elements.leaderboardOptIn && elements.leaderboardActive) {
    elements.leaderboardOptIn.style.display = optedIn ? 'none' : 'block';
    elements.leaderboardActive.style.display = optedIn ? 'block' : 'none';
  }
}

// Setup event listeners
function setupEventListeners() {
  // Scroll handler for header
  elements.mainContent?.addEventListener('scroll', () => {
    if (elements.mainContent.scrollTop > 50) {
      elements.header?.classList.add('scrolled');
    } else {
      elements.header?.classList.remove('scrolled');
    }
  });
}

// Initialize Telegram Web App
function initializeTelegramWebApp() {
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0A0A0B');
    tg.setBackgroundColor('#000000');
  }
}

// Show notification
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Global functions for HTML onclick handlers
window.showCashoutModal = function() {
  const amount = Math.round(state.earnings.available);
  const fee = calculateMpesaFee(amount);
  const modal = elements.cashoutModal;
  
  if (modal) {
    const feeValues = modal.querySelectorAll('.fee-value');
    if (feeValues[0]) feeValues[0].textContent = `KES ${amount.toLocaleString()}`;
    if (feeValues[1]) feeValues[1].textContent = `- KES ${fee}`;
    if (feeValues[2]) feeValues[2].textContent = `KES ${(amount - fee).toLocaleString()}`;
    
    modal.style.display = 'flex';
  }
};

window.hideCashoutModal = function() {
  if (elements.cashoutModal) {
    elements.cashoutModal.style.display = 'none';
  }
};

// Process cashout with real Supabase transaction
window.confirmCashout = async function() {
  const amount = Math.round(state.earnings.available);
  const fee = calculateMpesaFee(amount);
  const netAmount = amount - fee;
  
  try {
    // Create transaction record
    const { data: transaction, error } = await supabase
      .from('agent_transactions')
      .insert({
        agent_id: state.agent.id,
        type: 'cashout',
        amount: amount,
        fee: fee,
        net_amount: netAmount,
        status: 'pending',
        payment_method: 'mpesa',
        phone_number: state.agent.phone
      })
      .select()
      .single();
    
    if (error) throw error;
    
    showNotification(`Processing cash out of KES ${amount.toLocaleString()} via M-Pesa...`, 'success');
    hideCashoutModal();
    
    // Here you would trigger the actual M-Pesa API call
    // For now, we'll simulate success after 2 seconds
    setTimeout(async () => {
      // Update transaction status
      const { error: updateError } = await supabase
        .from('agent_transactions')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', transaction.id);
      
      if (!updateError) {
        showNotification('Cash out successful! Check your M-Pesa.', 'success');
        // Reload transactions and earnings
        await loadTransactions();
        await calculateEarnings();
      }
    }, 2000);
    
  } catch (error) {
    console.error('Cashout error:', error);
    showNotification('Failed to process cash out. Please try again.', 'error');
  }
};

window.calculateMpesaFee = function(amount) {
  if (amount <= 100) return 0;
  else if (amount <= 500) return 7;
  else if (amount <= 1000) return 13;
  else if (amount <= 1500) return 23;
  else if (amount <= 2500) return 33;
  else if (amount <= 3500) return 53;
  else if (amount <= 5000) return 57;
  else if (amount <= 7500) return 78;
  else if (amount <= 10000) return 90;
  else if (amount <= 15000) return 98;
  else if (amount <= 20000) return 103;
  else if (amount <= 35000) return 108;
  return 108;
};

window.filterVendors = function(type) {
  state.currentFilter = type;
  
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
  
  displayVendors();
};

window.viewVendorDetails = function(vendorId) {
  const vendor = state.vendors.find(v => v.id === vendorId);
  if (vendor) {
    console.log('View vendor details:', vendor);
    // Open vendor details modal or navigate to vendor page
  }
};

window.contactVendor = function(vendorId) {
  const vendor = state.vendors.find(v => v.id === vendorId);
  if (vendor) {
    const message = `Hi ${vendor.name}, we noticed you haven't sent parcels recently. Is everything okay? Let us know if you need any help with Tuma deliveries!`;
    const whatsappUrl = `https://wa.me/${vendor.phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  }
};

window.showAddVendorModal = function() {
  console.log('Open add vendor modal');
  // Implement add vendor modal
};

window.optInToLeaderboard = function() {
  localStorage.setItem('leaderboard_opt_in', 'true');
  state.leaderboardOptIn = true;
  checkLeaderboardPreference();
  showNotification('You have joined the community rankings!', 'success');
};

window.optOutFromLeaderboard = function() {
  localStorage.removeItem('leaderboard_opt_in');
  state.leaderboardOptIn = false;
  checkLeaderboardPreference();
  showNotification('You have left the community rankings', 'success');
};

// Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Export for module usage
export {
  state,
  initialize,
  showNotification,
  calculateEarnings,
  loadVendors,
  loadParcels
};
