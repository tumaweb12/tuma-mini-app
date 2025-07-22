/**
 * Complete Rider Dashboard with Multi-Pickup/Delivery Support
 * Includes commission tracking, route optimization, and enhanced features
 */

// ─── Configuration ─────────────────────────────────────────────────────────

const BUSINESS_CONFIG = {
    commission: {
        rider: 0.70,      // 70% of delivery fee goes to rider
        platform: 0.30,   // 30% platform fee
        maxUnpaid: 300,   // Max unpaid commission before blocking
        warningThreshold: 250  // Show warning at this amount
    },
    routeTypes: {
        express: { label: 'Express', multiplier: 1.4 },
        smart: { label: 'Smart', multiplier: 1.0 },
        eco: { label: 'Eco', multiplier: 0.8 }
    },
    incentives: {
        daily_targets: [
            { deliveries: 5, bonus: 100, label: "Starter" },
            { deliveries: 10, bonus: 200, label: "Active" },
            { deliveries: 15, bonus: 400, label: "Champion" },
            { deliveries: 20, bonus: 700, label: "Legend" }
        ],
        peak_hours: {
            morning: { start: 7, end: 10, multiplier: 1.2 },
            evening: { start: 17, end: 20, multiplier: 1.3 }
        }
    }
};

// Supabase Configuration
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

// ─── Enhanced Route Manager ────────────────────────────────────────────────

const EnhancedRouteManager = {
    // Group and sequence stops by type
    sequenceStops(parcels) {
        const pickups = [];
        const deliveries = [];
        
        parcels.forEach(parcel => {
            // Create pickup stop
            pickups.push({
                id: `${parcel.id}-pickup`,
                parcelId: parcel.id,
                type: 'pickup',
                address: parcel.pickup_location?.address || 'Pickup location',
                location: parcel.pickup_location || { lat: -1.2921, lng: 36.8219 },
                parcelCode: parcel.parcel_code,
                verificationCode: parcel.pickup_code,
                customerName: parcel.sender_name || 'Sender',
                customerPhone: parcel.sender_phone || '',
                specialInstructions: parcel.pickup_instructions,
                completed: false,
                timestamp: null
            });
            
            // Create delivery stop
            deliveries.push({
                id: `${parcel.id}-delivery`,
                parcelId: parcel.id,
                type: 'delivery',
                address: parcel.delivery_location?.address || 'Delivery location',
                location: parcel.delivery_location || { lat: -1.2921, lng: 36.8219 },
                parcelCode: parcel.parcel_code,
                verificationCode: parcel.delivery_code,
                customerName: parcel.recipient_name || 'Recipient',
                customerPhone: parcel.recipient_phone || '',
                specialInstructions: parcel.delivery_instructions,
                completed: false,
                timestamp: null,
                dependsOn: `${parcel.id}-pickup`
            });
        });
        
        // Optimize order
        const optimizedPickups = this.optimizeStopOrder(pickups);
        const optimizedDeliveries = this.optimizeStopOrder(deliveries);
        
        return [...optimizedPickups, ...optimizedDeliveries];
    },
    
    optimizeStopOrder(stops) {
        if (stops.length <= 1) return stops;
        
        // Simple nearest neighbor optimization
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
    },
    
    canCompleteStop(stop, allStops) {
        if (stop.type === 'delivery' && stop.dependsOn) {
            const pickupStop = allStops.find(s => s.id === stop.dependsOn);
            return pickupStop && pickupStop.completed;
        }
        return true;
    },
    
    getParcelsInPossession(stops) {
        const inPossession = [];
        
        stops.forEach(stop => {
            if (stop.type === 'pickup' && stop.completed) {
                const deliveryStop = stops.find(s => 
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
};

// ─── Commission Tracking Class ─────────────────────────────────────────────

class CommissionTracker {
    constructor(config) {
        this.config = config;
        this.state = {
            unpaidCommission: 0,
            totalPaid: 0,
            pendingDeliveries: [],
            isBlocked: false,
            lastPayment: null
        };
    }

    async initialize(riderId, api) {
        try {
            const riders = await api.query('riders', {
                filter: `id=eq.${riderId}`,
                limit: 1
            });
            
            if (riders.length > 0) {
                const rider = riders[0];
                this.state.unpaidCommission = rider.unpaid_commission || 0;
                this.state.totalPaid = rider.total_commission_paid || 0;
                this.state.isBlocked = rider.is_commission_blocked || false;
                this.state.lastPayment = rider.last_commission_payment;
            }
        } catch (error) {
            console.error('Error initializing commission tracker:', error);
        }
    }

    async addDeliveryCommission(parcelId, deliveryPrice) {
        const commission = deliveryPrice * this.config.platformFeeRate;
        this.state.unpaidCommission += commission;
        this.state.pendingDeliveries.push({
            parcelId,
            commission,
            timestamp: new Date()
        });

        const result = {
            totalUnpaid: Math.round(this.state.unpaidCommission),
            warningShown: false,
            isBlocked: false
        };

        if (this.state.unpaidCommission >= this.config.maxUnpaidCommission) {
            this.state.isBlocked = true;
            result.isBlocked = true;
        } else if (this.state.unpaidCommission >= this.config.warningThreshold) {
            result.warningShown = true;
        }

        return result;
    }

    getSummary() {
        return {
            unpaid: Math.round(this.state.unpaidCommission),
            totalPaid: Math.round(this.state.totalPaid),
            pendingCount: this.state.pendingDeliveries.length,
            isBlocked: this.state.isBlocked,
            percentageUsed: Math.round((this.state.unpaidCommission / this.config.maxUnpaidCommission) * 100)
        };
    }

    createCommissionUI() {
        const summary = this.getSummary();
        const percentage = Math.min(summary.percentageUsed, 100);
        const isWarning = percentage >= 83;
        const isBlocked = percentage >= 100;

        return {
            statusBar: `
                <div class="commission-status ${isWarning ? 'warning' : ''} ${isBlocked ? 'blocked' : ''}">
                    <div class="commission-header">
                        <span class="commission-title">Platform Commission</span>
                        <span class="commission-amount">KES ${summary.unpaid} / ${this.config.maxUnpaidCommission}</span>
                    </div>
                    <div class="commission-progress">
                        <div class="commission-progress-bar" style="width: ${percentage}%"></div>
                    </div>
                    <div class="commission-actions">
                        <button class="commission-pay-button" onclick="openPaymentModal()">
                            Pay Commission
                        </button>
                        <button class="commission-details-button" onclick="viewCommissionDetails()">
                            View Details
                        </button>
                    </div>
                </div>
            `,
            warningMessage: isWarning && !isBlocked ? `
                <div class="commission-warning">
                    <span class="warning-icon">⚠️</span>
                    <span>Your unpaid commission is KES ${summary.unpaid}. Please pay soon to avoid account restrictions.</span>
                </div>
            ` : null,
            blockedMessage: isBlocked ? `
                <div class="commission-blocked-overlay">
                    <div class="blocked-content">
                        <div class="blocked-icon">🚫</div>
                        <h2>Account Temporarily Restricted</h2>
                        <p>You've reached the maximum unpaid commission limit of KES ${this.config.maxUnpaidCommission}.</p>
                        <p class="blocked-amount">Amount Due: KES ${summary.unpaid}</p>
                        <button class="pay-now-button" onclick="openPaymentModal()">
                            Pay Now to Continue
                        </button>
                        <p class="blocked-help">Need help? Contact support at 0700123456</p>
                    </div>
                </div>
            ` : null
        };
    }

    getCommissionStyles() {
        return `
            .commission-status {
                background: var(--surface-elevated);
                border-radius: 14px;
                padding: 16px;
                margin: 0 20px 20px;
                border: 1px solid var(--border);
                transition: all 0.3s;
            }
            
            .commission-status.warning {
                border-color: var(--warning);
                background: rgba(255, 159, 10, 0.1);
            }
            
            .commission-status.blocked {
                border-color: var(--danger);
                background: rgba(255, 59, 48, 0.1);
            }
            
            .commission-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }
            
            .commission-title {
                font-size: 14px;
                font-weight: 600;
                color: var(--text-secondary);
            }
            
            .commission-amount {
                font-size: 16px;
                font-weight: 700;
                color: var(--text-primary);
            }
            
            .commission-progress {
                height: 8px;
                background: var(--surface-high);
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 12px;
            }
            
            .commission-progress-bar {
                height: 100%;
                background: var(--primary);
                border-radius: 4px;
                transition: width 0.3s ease;
            }
            
            .commission-status.warning .commission-progress-bar {
                background: var(--warning);
            }
            
            .commission-status.blocked .commission-progress-bar {
                background: var(--danger);
            }
            
            .commission-actions {
                display: flex;
                gap: 8px;
            }
            
            .commission-pay-button,
            .commission-details-button {
                flex: 1;
                padding: 10px;
                border-radius: 8px;
                border: none;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .commission-pay-button {
                background: var(--primary);
                color: white;
            }
            
            .commission-details-button {
                background: var(--surface-high);
                color: var(--text-secondary);
            }
            
            .commission-warning {
                background: rgba(255, 159, 10, 0.1);
                border: 1px solid var(--warning);
                border-radius: 12px;
                padding: 12px;
                margin: 0 20px 20px;
                display: flex;
                align-items: center;
                gap: 12px;
                font-size: 14px;
            }
            
            .commission-blocked-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.9);
                backdrop-filter: blur(10px);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            
            .blocked-content {
                background: var(--surface-elevated);
                border-radius: 20px;
                padding: 32px 24px;
                max-width: 360px;
                width: 100%;
                text-align: center;
            }
            
            .blocked-icon {
                font-size: 64px;
                margin-bottom: 20px;
            }
            
            .blocked-content h2 {
                font-size: 24px;
                font-weight: 700;
                margin-bottom: 12px;
            }
            
            .blocked-content p {
                color: var(--text-secondary);
                margin-bottom: 16px;
                line-height: 1.5;
            }
            
            .blocked-amount {
                font-size: 32px;
                font-weight: 700;
                color: var(--danger);
                margin: 24px 0;
            }
            
            .pay-now-button {
                width: 100%;
                background: var(--success);
                color: white;
                border: none;
                border-radius: 12px;
                padding: 16px;
                font-size: 18px;
                font-weight: 700;
                cursor: pointer;
                margin-bottom: 16px;
            }
            
            .blocked-help {
                font-size: 14px;
                color: var(--text-tertiary);
            }
        `;
    }
}

// ─── State Management ──────────────────────────────────────────────────────

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
        distance: 0,
        rating: 5.0
    },
    activeDelivery: null,
    claimedRoute: null,
    availableRoutes: [],
    currentFilter: 'all',
    isLoading: false,
    commissionTracker: null,
    currentLocation: null,
    mapInitialized: false,
    parcelsInPossession: []
};

// ─── DOM Elements ──────────────────────────────────────────────────────────

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
    routeList: document.getElementById('routeList'),
    mainContent: document.getElementById('mainContent')
};

// ─── Database Functions ────────────────────────────────────────────────────

const supabaseAPI = {
    async query(table, options = {}) {
        const { select = '*', filter = '', order = '', limit } = options;
        
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
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    },
    
    async insert(table, data) {
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

// ─── Notification Functions ────────────────────────────────────────────────

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#ff3b30' : type === 'warning' ? '#FF9F0A' : '#34c759'};
        color: ${type === 'warning' ? 'black' : 'white'};
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 3000;
        font-weight: 600;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        max-width: 350px;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, type === 'error' ? 5000 : 3000);
}

// ─── Helper Functions ──────────────────────────────────────────────────────

function formatPhone(phone) {
    return phone.replace(/\D/g, '').slice(0, 10);
}

function haptic(type = 'light') {
    if (window.navigator && window.navigator.vibrate) {
        switch(type) {
            case 'light': window.navigator.vibrate(10); break;
            case 'medium': window.navigator.vibrate(30); break;
            case 'heavy': window.navigator.vibrate(50); break;
            case 'success': window.navigator.vibrate([10, 50, 10]); break;
            default: window.navigator.vibrate(10);
        }
    }
}

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

function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const minutes = Math.floor((Date.now() - new Date(timestamp)) / 60000);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
}

// ─── Enhanced Features ─────────────────────────────────────────────────────

function isPeakHour() {
    const hour = new Date().getHours();
    const { morning, evening } = BUSINESS_CONFIG.incentives.peak_hours;
    
    if (hour >= morning.start && hour < morning.end) {
        return { isPeak: true, multiplier: morning.multiplier, type: 'morning' };
    } else if (hour >= evening.start && hour < evening.end) {
        return { isPeak: true, multiplier: evening.multiplier, type: 'evening' };
    }
    
    return { isPeak: false, multiplier: 1, type: 'normal' };
}

function calculateDailyBonus() {
    const deliveries = state.stats.deliveries;
    let currentTarget = null;
    let nextTarget = null;
    
    for (let i = 0; i < BUSINESS_CONFIG.incentives.daily_targets.length; i++) {
        const target = BUSINESS_CONFIG.incentives.daily_targets[i];
        if (deliveries >= target.deliveries) {
            currentTarget = target;
        } else if (!nextTarget) {
            nextTarget = target;
        }
    }
    
    return { currentTarget, nextTarget, deliveries };
}

function displayIncentiveProgress() {
    const { currentTarget, nextTarget, deliveries } = calculateDailyBonus();
    const peakStatus = isPeakHour();
    
    const incentiveHTML = `
        <div class="incentive-widget">
            ${peakStatus.isPeak ? `
                <div class="peak-hour-banner">
                    <span class="peak-icon">🔥</span>
                    <span>Peak Hours Active! ${((peakStatus.multiplier - 1) * 100).toFixed(0)}% bonus on all deliveries</span>
                </div>
            ` : ''}
            
            <div class="daily-bonus-progress">
                <h3 class="bonus-title">Daily Bonus Progress</h3>
                ${nextTarget ? `
                    <div class="progress-container">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${(deliveries / nextTarget.deliveries * 100)}%"></div>
                        </div>
                        <div class="progress-text">
                            <span>${deliveries}/${nextTarget.deliveries} deliveries</span>
                            <span class="bonus-amount">KES ${nextTarget.bonus}</span>
                        </div>
                    </div>
                    <p class="progress-message">Complete ${nextTarget.deliveries - deliveries} more for ${nextTarget.label} bonus!</p>
                ` : `
                    <p class="max-bonus-reached">🎉 Maximum daily bonus achieved! KES ${currentTarget?.bonus || 0}</p>
                `}
            </div>
        </div>
    `;
    
    const earningsSection = document.querySelector('.earnings-grid')?.parentElement;
    if (earningsSection && !document.querySelector('.incentive-widget')) {
        earningsSection.insertAdjacentHTML('afterend', `<div class="form-section">${incentiveHTML}</div>`);
    }
}

function calculatePerformanceMetrics() {
    const today = new Date();
    const startTime = new Date(today.setHours(6, 0, 0, 0));
    const hoursWorked = (Date.now() - startTime) / (1000 * 60 * 60);
    
    return {
        deliveriesPerHour: (state.stats.deliveries / hoursWorked).toFixed(1),
        earningsPerKm: state.stats.distance > 0 ? (state.earnings.daily / state.stats.distance).toFixed(0) : 0,
        averageDeliveryTime: 23,
        acceptanceRate: 85
    };
}

function displayPerformanceMetrics() {
    const metrics = calculatePerformanceMetrics();
    
    const metricsHTML = `
        <div class="performance-metrics">
            <h2 class="section-title">Today's Performance</h2>
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-icon">⚡</div>
                    <div class="metric-value">${metrics.deliveriesPerHour}</div>
                    <div class="metric-label">Deliveries/Hour</div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon">💰</div>
                    <div class="metric-value">KES ${metrics.earningsPerKm}</div>
                    <div class="metric-label">Per KM</div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon">⏱️</div>
                    <div class="metric-value">${metrics.averageDeliveryTime} min</div>
                    <div class="metric-label">Avg Time</div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon">✅</div>
                    <div class="metric-value">${metrics.acceptanceRate}%</div>
                    <div class="metric-label">Accept Rate</div>
                </div>
            </div>
        </div>
    `;
    
    const statsRow = document.querySelector('.stats-row')?.parentElement;
    if (statsRow && !document.querySelector('.performance-metrics')) {
        statsRow.insertAdjacentHTML('afterend', metricsHTML);
    }
}

function addQuickActions() {
    const quickActionsHTML = `
        <div class="quick-actions">
            <button class="quick-action" onclick="toggleBreakMode()">
                <span class="action-icon">☕</span>
                <span class="action-label">Break</span>
            </button>
            <button class="quick-action" onclick="viewEarningsDetails()">
                <span class="action-icon">📊</span>
                <span class="action-label">Analytics</span>
            </button>
            <button class="quick-action" onclick="showHotZones()">
                <span class="action-icon">🔥</span>
                <span class="action-label">Hot Zones</span>
            </button>
            <button class="quick-action" onclick="callSupport()">
                <span class="action-icon">📞</span>
                <span class="action-label">Support</span>
            </button>
        </div>
    `;
    
    const header = document.querySelector('.header');
    if (header && !document.querySelector('.quick-actions')) {
        header.insertAdjacentHTML('afterend', quickActionsHTML);
    }
}

// ─── Core Functions ────────────────────────────────────────────────────────

async function initialize() {
    console.log('Initializing rider dashboard...');
    
    // Initialize commission tracker
    state.commissionTracker = new CommissionTracker({
        maxUnpaidCommission: BUSINESS_CONFIG.commission.maxUnpaid,
        platformFeeRate: BUSINESS_CONFIG.commission.platform,
        warningThreshold: BUSINESS_CONFIG.commission.warningThreshold
    });
    
    // Check if user is authenticated
    const authenticated = await checkAuthAndLoadRider();
    
    if (!authenticated) {
        await loadDemoRider();
    }
    
    // Initialize commission tracker
    if (state.rider) {
        try {
            await state.commissionTracker.initialize(state.rider.id, supabaseAPI);
            displayCommissionStatus();
            
            if (state.commissionTracker.state.isBlocked) {
                showBlockedOverlay();
                return;
            }
        } catch (error) {
            console.error('Error initializing commission tracker:', error);
        }
    }
    
    // Get current location
    getCurrentLocation();
    
    setupEventListeners();
    await loadEarnings();
    await loadStats();
    await loadAvailableRoutes();
    await checkActiveDeliveries();
    
    // Add styles for notifications and commission UI
    addCustomStyles();
    
    // Add enhanced features
    displayIncentiveProgress();
    displayPerformanceMetrics();
    addQuickActions();
    
    // Start location updates if rider is online
    if (state.status === 'online') {
        startLocationUpdates();
    }
    
    console.log('Rider dashboard initialized successfully');
}

async function checkAuthAndLoadRider() {
    // Check for Telegram Web App
    if (window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        
        const user = tg.initDataUnsafe.user;
        if (user?.phone_number) {
            const phone = formatPhone(user.phone_number);
            return await loadRiderByPhone(phone);
        }
    }
    
    // Check for stored phone
    const storedPhone = localStorage.getItem('tuma_rider_phone');
    if (storedPhone) {
        return await loadRiderByPhone(storedPhone);
    }
    
    return false;
}

async function loadRiderByPhone(phone) {
    try {
        const riders = await supabaseAPI.query('riders', {
            filter: `phone=eq.${phone}`,
            limit: 1
        });
        
        if (riders.length > 0) {
            state.rider = riders[0];
            
            if (state.rider.verification_status !== 'verified') {
                showNotification('Your account is pending verification. Please contact support.', 'warning');
            }
            
            if (state.rider.status === 'suspended' || state.rider.status === 'terminated') {
                showNotification('Your account has been suspended. Please contact support.', 'error');
                return false;
            }
            
            return true;
        }
    } catch (error) {
        console.error('Error loading rider:', error);
    }
    
    return false;
}

async function loadDemoRider() {
    state.rider = {
        id: 'demo-rider-001',
        rider_name: 'Demo Rider',
        phone: '0700000000',
        status: 'active',
        total_deliveries: 0,
        completed_deliveries: 0,
        total_distance: 0,
        rating: 5.0,
        unpaid_commission: 0,
        verification_status: 'verified'
    };
}

async function loadEarnings() {
    try {
        if (!state.rider || state.rider.id === 'demo-rider-001') {
            state.earnings = {
                daily: 2340,
                weekly: 14520,
                monthly: 58000
            };
        } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const weekStart = new Date(today);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            
            const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
            
            const dailyParcels = await supabaseAPI.query('parcels', {
                filter: `rider_id=eq.${state.rider.id}&status=eq.delivered&delivery_timestamp=gte.${today.toISOString()}`,
                select: 'rider_payout'
            });
            
            const weeklyParcels = await supabaseAPI.query('parcels', {
                filter: `rider_id=eq.${state.rider.id}&status=eq.delivered&delivery_timestamp=gte.${weekStart.toISOString()}`,
                select: 'rider_payout'
            });
            
            const monthlyParcels = await supabaseAPI.query('parcels', {
                filter: `rider_id=eq.${state.rider.id}&status=eq.delivered&delivery_timestamp=gte.${monthStart.toISOString()}`,
                select: 'rider_payout'
            });
            
            state.earnings = {
                daily: dailyParcels.reduce((sum, p) => sum + (p.rider_payout || 0), 0),
                weekly: weeklyParcels.reduce((sum, p) => sum + (p.rider_payout || 0), 0),
                monthly: monthlyParcels.reduce((sum, p) => sum + (p.rider_payout || 0), 0)
            };
        }
        
        updateEarningsDisplay();
        
    } catch (error) {
        console.error('Error loading earnings:', error);
        state.earnings = { daily: 0, weekly: 0, monthly: 0 };
        updateEarningsDisplay();
    }
}

async function loadStats() {
    try {
        if (!state.rider || state.rider.id === 'demo-rider-001') {
            state.stats = {
                deliveries: 156,
                distance: 342,
                rating: 4.8
            };
        } else {
            state.stats = {
                deliveries: state.rider.completed_deliveries || 0,
                distance: Math.round(state.rider.total_distance || 0),
                rating: state.rider.rating || 5.0
            };
        }
        
        updateStatsDisplay();
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadAvailableRoutes() {
    try {
        const unclaimedParcels = await supabaseAPI.query('parcels', {
            filter: 'status=eq.submitted&rider_id=is.null',
            limit: 50,
            order: 'created_at.asc'
        });
        
        if (unclaimedParcels.length === 0) {
            state.availableRoutes = getDemoRoutes();
        } else {
            state.availableRoutes = createRoutes(unclaimedParcels);
        }
        
        displayRoutes();
        
    } catch (error) {
        console.error('Error loading routes:', error);
        state.availableRoutes = getDemoRoutes();
        displayRoutes();
    }
}

function getDemoRoutes() {
    return [
        {
            id: 'demo-route-001',
            name: 'Westlands Morning Cluster',
            type: 'smart',
            deliveries: 5,
            pickups: 5,
            distance: 12,
            total_earnings: 1750,
            status: 'available',
            parcels: []
        },
        {
            id: 'demo-route-002',
            name: 'CBD Express Route',
            type: 'express',
            deliveries: 3,
            pickups: 3,
            distance: 8,
            total_earnings: 1200,
            status: 'available',
            parcels: []
        },
        {
            id: 'demo-route-003',
            name: 'Karen Eco Route',
            type: 'eco',
            deliveries: 8,
            pickups: 8,
            distance: 25,
            total_earnings: 2400,
            status: 'available',
            parcels: []
        }
    ];
}

function createRoutes(parcels) {
    const groups = {};
    
    parcels.forEach(parcel => {
        const area = getAreaFromAddress(parcel.pickup_location?.address || 'General');
        if (!groups[area]) groups[area] = [];
        groups[area].push(parcel);
    });
    
    return Object.entries(groups).map(([area, parcels]) => ({
        id: `route-${area.toLowerCase().replace(/\s+/g, '-')}`,
        name: `${area} Route`,
        type: determineRouteType(parcels),
        deliveries: parcels.length,
        pickups: parcels.length,
        distance: parcels.reduce((sum, p) => sum + (p.distance_km || 0), 0),
        total_earnings: calculateRouteEarnings(parcels),
        status: 'available',
        parcels: parcels.map(p => p.id)
    }));
}

function determineRouteType(parcels) {
    if (parcels.length <= 3) return 'express';
    if (parcels.length <= 6) return 'smart';
    return 'eco';
}

function getAreaFromAddress(address) {
    const areas = ['Westlands', 'CBD', 'Karen', 'Kilimani', 'Parklands', 'Lavington', 'Kileleshwa'];
    const lowerAddr = address.toLowerCase();
    
    for (const area of areas) {
        if (lowerAddr.includes(area.toLowerCase())) {
            return area;
        }
    }
    
    return 'General';
}

function calculateRouteEarnings(parcels) {
    return parcels.reduce((sum, parcel) => {
        const riderPayout = parcel.rider_payout || (parcel.price * BUSINESS_CONFIG.commission.rider);
        return sum + riderPayout;
    }, 0);
}

async function checkActiveDeliveries() {
    try {
        if (!state.rider || state.rider.id === 'demo-rider-001') return;
        
        const activeParcels = await supabaseAPI.query('parcels', {
            filter: `rider_id=eq.${state.rider.id}&status=in.(assigned,picked_up)`,
            order: 'created_at.asc'
        });
        
        if (activeParcels.length > 0) {
            state.claimedRoute = {
                parcels: activeParcels,
                stops: EnhancedRouteManager.sequenceStops(activeParcels)
            };
            
            showActiveRoute();
        }
        
    } catch (error) {
        console.error('Error checking active deliveries:', error);
    }
}

function showActiveRoute() {
    if (!state.claimedRoute) return;
    
    const activeStops = state.claimedRoute.stops.filter(s => !s.completed);
    if (activeStops.length === 0) return;
    
    const nextStop = activeStops[0];
    const parcelsInPossession = EnhancedRouteManager.getParcelsInPossession(state.claimedRoute.stops);
    
    elements.activeDeliverySection.style.display = 'block';
    
    // Update active delivery display with more info
    const deliveryHTML = `
        <div class="active-route-info">
            <div class="route-progress-header">
                <span class="progress-label">Route Progress</span>
                <span class="progress-stats">${state.claimedRoute.stops.filter(s => s.completed).length}/${state.claimedRoute.stops.length} stops</span>
            </div>
            <div class="route-progress-bar">
                <div class="progress-fill" style="width: ${(state.claimedRoute.stops.filter(s => s.completed).length / state.claimedRoute.stops.length * 100)}%"></div>
            </div>
        </div>
        
        ${parcelsInPossession.length > 0 ? `
            <div class="carrying-indicator">
                <span class="carrying-icon">📦</span>
                <span>Carrying ${parcelsInPossession.length} parcel${parcelsInPossession.length > 1 ? 's' : ''}</span>
            </div>
        ` : ''}
        
        <div class="next-stop-info">
            <div class="stop-type-badge ${nextStop.type}">
                ${nextStop.type === 'pickup' ? '📦 PICKUP' : '📍 DELIVERY'}
            </div>
            <div class="stop-address">${nextStop.address}</div>
            <div class="stop-details">
                <span>Code: ${nextStop.parcelCode}</span>
                <span>Customer: ${nextStop.customerName}</span>
            </div>
        </div>
    `;
    
    // Replace the inner content of active delivery section
    const activeDeliveryCard = elements.activeDeliverySection.querySelector('.active-delivery');
    if (activeDeliveryCard) {
        activeDeliveryCard.innerHTML = deliveryHTML;
    }
}

// ─── Location Functions ────────────────────────────────────────────────────

function getCurrentLocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            position => {
                state.currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                console.log('Current location:', state.currentLocation);
            },
            error => {
                console.error('Error getting location:', error);
                showNotification('Location access needed for navigation', 'warning');
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    }
}

function startLocationUpdates() {
    setInterval(() => {
        if (state.status === 'online' && state.rider && state.rider.id !== 'demo-rider-001') {
            getCurrentLocation();
            
            if (state.currentLocation) {
                supabaseAPI.update('riders', 
                    `id=eq.${state.rider.id}`,
                    {
                        last_location_lat: state.currentLocation.lat,
                        last_location_lng: state.currentLocation.lng,
                        last_location_update: new Date().toISOString()
                    }
                ).catch(error => console.error('Error updating location:', error));
            }
        }
    }, 30000);
}

// ─── Display Functions ─────────────────────────────────────────────────────

function updateEarningsDisplay() {
    elements.dailyEarnings.textContent = Math.round(state.earnings.daily).toLocaleString();
    elements.weeklyEarnings.textContent = Math.round(state.earnings.weekly).toLocaleString();
    elements.monthlyEarnings.textContent = Math.round(state.earnings.monthly).toLocaleString();
}

function updateStatsDisplay() {
    elements.totalDeliveries.textContent = state.stats.deliveries;
    elements.totalDistance.textContent = state.stats.distance;
}

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
                    <div class="route-detail-value">${route.pickups}</div>
                    <div class="route-detail-label">Pickups</div>
                </div>
                <div class="route-detail">
                    <div class="route-detail-value">${route.deliveries}</div>
                    <div class="route-detail-label">Deliveries</div>
                </div>
                <div class="route-detail">
                    <div class="route-detail-value">KES ${Math.round(route.total_earnings)}</div>
                    <div class="route-detail-label">Earnings</div>
                </div>
            </div>
            <div class="route-info-bar">
                <span class="route-distance">📍 ${Math.round(route.distance)} km total</span>
                <span class="route-time">⏱️ ~${Math.round(route.distance * 2 + route.deliveries * 5)} min</span>
            </div>
            <button class="claim-button" ${route.status !== 'available' ? 'disabled' : ''}>
                ${route.status === 'available' ? 'Claim Route' : 'Already Claimed'}
            </button>
        </div>
    `).join('');
}

function displayCommissionStatus() {
    if (!state.commissionTracker) return;
    
    const ui = state.commissionTracker.createCommissionUI();
    
    const commissionContainer = document.createElement('div');
    commissionContainer.id = 'commissionContainer';
    commissionContainer.innerHTML = ui.statusBar;
    
    const heroSection = document.querySelector('.hero-section');
    if (heroSection && heroSection.parentNode) {
        heroSection.parentNode.insertBefore(commissionContainer, heroSection.nextSibling);
    }
    
    if (ui.warningMessage) {
        const warningDiv = document.createElement('div');
        warningDiv.innerHTML = ui.warningMessage;
        commissionContainer.appendChild(warningDiv.firstChild);
    }
}

function showBlockedOverlay() {
    if (!state.commissionTracker) return;
    
    const ui = state.commissionTracker.createCommissionUI();
    
    const overlay = document.createElement('div');
    overlay.id = 'commissionBlockedOverlay';
    overlay.innerHTML = ui.blockedMessage;
    document.body.appendChild(overlay);
}

// ─── Event Listeners ───────────────────────────────────────────────────────

function setupEventListeners() {
    elements.codeInput?.addEventListener('input', (e) => {
        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        e.target.value = value;
    });
    
    elements.statusBadge?.addEventListener('click', toggleStatus);
}

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
        startLocationUpdates();
    } else {
        elements.statusBadge.classList.add('offline');
        elements.statusBadge.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="4"/>
            </svg>
            <span>Offline</span>
        `;
    }
    
    if (state.rider && state.rider.id !== 'demo-rider-001') {
        try {
            await supabaseAPI.update('riders', 
                `id=eq.${state.rider.id}`, 
                { 
                    status: state.status === 'online' ? 'available' : 'offline',
                    is_online: state.status === 'online'
                }
            );
        } catch (error) {
            console.error('Error updating status:', error);
        }
    }
    
    haptic('light');
}

// ─── Global Functions (called from HTML) ───────────────────────────────────

window.toggleBreakMode = function() {
    const isOnBreak = state.status === 'break';
    state.status = isOnBreak ? 'online' : 'break';
    
    elements.statusBadge.className = `status-badge ${state.status === 'break' ? 'offline' : ''}`;
    elements.statusBadge.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="4"/>
        </svg>
        <span>${state.status === 'break' ? 'On Break' : 'Online'}</span>
    `;
    
    showNotification(
        state.status === 'break' ? 'Break started. Take your time!' : 'Welcome back! You\'re online again.',
        'info'
    );
    
    haptic('medium');
};

window.viewEarningsDetails = function() {
    showNotification('Detailed analytics coming soon!', 'info');
    console.log('Earnings breakdown:', {
        daily: state.earnings,
        performance: calculatePerformanceMetrics(),
        bonus: calculateDailyBonus()
    });
    haptic('light');
};

window.showHotZones = function() {
    showNotification('High demand in Westlands and CBD areas!', 'info');
    haptic('light');
};

window.callSupport = function() {
    window.location.href = 'tel:+254700123456';
    haptic('medium');
};

window.filterRoutes = function(type) {
    state.currentFilter = type;
    
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
    
    if (state.isLoading) return;
    state.isLoading = true;
    
    try {
        if (route.parcels && route.parcels.length > 0) {
            // Load full parcel details
            const parcels = await Promise.all(
                route.parcels.map(parcelId => 
                    supabaseAPI.query('parcels', {
                        filter: `id=eq.${parcelId}`,
                        limit: 1
                    })
                )
            );
            
            const flatParcels = parcels.flat();
            
            // Update parcels to assign to this rider
            for (const parcel of flatParcels) {
                await supabaseAPI.update('parcels', 
                    `id=eq.${parcel.id}`,
                    { 
                        rider_id: state.rider.id,
                        status: 'assigned',
                        assigned_at: new Date().toISOString()
                    }
                );
            }
            
            // Create route with sequenced stops
            state.claimedRoute = {
                ...route,
                parcels: flatParcels,
                stops: EnhancedRouteManager.sequenceStops(flatParcels)
            };
            
            showActiveRoute();
        } else {
            // Demo route
            showNotification('Demo route claimed!', 'success');
        }
        
        route.status = 'claimed';
        displayRoutes();
        
        showNotification(
            `Route claimed! ${route.pickups} pickups, then ${route.deliveries} deliveries to complete.`, 
            'success'
        );
        haptic('success');
        
    } catch (error) {
        console.error('Error claiming route:', error);
        showNotification('Failed to claim route. Please try again.', 'error');
    } finally {
        state.isLoading = false;
    }
};

window.verifyCode = async function(type) {
    const code = elements.codeInput.value.toUpperCase();
    
    if (!code || code.length < 6) {
        showNotification('Please enter a valid code', 'error');
        return;
    }
    
    if (state.isLoading) return;
    state.isLoading = true;
    
    try {
        // Find the active stop
        if (state.claimedRoute && state.claimedRoute.stops) {
            const activeStop = state.claimedRoute.stops.find(s => 
                !s.completed && 
                s.type === type && 
                s.verificationCode.toUpperCase() === code
            );
            
            if (!activeStop) {
                showNotification('Invalid code or wrong stop type', 'error');
                return;
            }
            
            // Check if can complete (for deliveries)
            if (!EnhancedRouteManager.canCompleteStop(activeStop, state.claimedRoute.stops)) {
                showNotification('Please complete the pickup first', 'warning');
                return;
            }
            
            // Mark stop as completed
            activeStop.completed = true;
            activeStop.timestamp = new Date();
            
            // Update parcel status in database
            await supabaseAPI.update('parcels',
                `id=eq.${activeStop.parcelId}`,
                {
                    status: type === 'pickup' ? 'picked_up' : 'delivered',
                    [`${type}_timestamp`]: activeStop.timestamp.toISOString()
                }
            );
            
            // Handle commission for deliveries
            if (type === 'delivery') {
                const parcel = state.claimedRoute.parcels.find(p => p.id === activeStop.parcelId);
                if (parcel && state.commissionTracker) {
                    const commissionResult = await state.commissionTracker.addDeliveryCommission(
                        parcel.id,
                        parcel.price
                    );
                    
                    await supabaseAPI.update('riders',
                        `id=eq.${state.rider.id}`,
                        {
                            unpaid_commission: commissionResult.totalUnpaid,
                            is_commission_blocked: commissionResult.isBlocked
                        }
                    );
                    
                    displayCommissionStatus();
                    
                    if (commissionResult.isBlocked) {
                        showBlockedOverlay();
                        return;
                    } else if (commissionResult.warningShown) {
                        showNotification(
                            `Commission balance: KES ${commissionResult.totalUnpaid}. Please pay soon.`,
                            'warning'
                        );
                    }
                }
                
                // Update earnings
                const riderPayout = parcel.rider_payout || (parcel.price * BUSINESS_CONFIG.commission.rider);
                state.earnings.daily += riderPayout;
                state.stats.deliveries++;
                
                updateEarningsDisplay();
                updateStatsDisplay();
                displayIncentiveProgress();
            }
            
            elements.codeInput.value = '';
            showNotification(`${type} verified successfully!`, 'success');
            
            // Update UI
            showActiveRoute();
            
            // Check if entering delivery phase
            const pickups = state.claimedRoute.stops.filter(s => s.type === 'pickup');
            const allPickupsComplete = pickups.every(p => p.completed);
            
            if (allPickupsComplete && type === 'pickup') {
                showNotification('All pickups complete! Starting delivery phase 🚀', 'success');
            }
            
            // Check if route is complete
            const allComplete = state.claimedRoute.stops.every(s => s.completed);
            if (allComplete) {
                elements.activeDeliverySection.style.display = 'none';
                state.claimedRoute = null;
                showNotification('🎉 Route completed! Great work!', 'success');
                await loadAvailableRoutes();
            }
            
        } else {
            // Fallback to old single parcel logic
            let searchFilter = '';
            if (type === 'pickup') {
                searchFilter = `pickup_code=eq.${code}`;
            } else {
                searchFilter = `delivery_code=eq.${code}`;
            }
            
            const parcels = await supabaseAPI.query('parcels', {
                filter: searchFilter,
                limit: 1
            });
            
            if (parcels.length === 0) {
                showNotification('Invalid code. Please check and try again.', 'error');
                return;
            }
            
            // Continue with old logic...
        }
        
        haptic('success');
        
    } catch (error) {
        console.error('Error verifying code:', error);
        showNotification('Verification failed. Please try again.', 'error');
    } finally {
        state.isLoading = false;
    }
};

window.navigateToRoute = function() {
    if (!state.claimedRoute) {
        showNotification('Claim a route first to see navigation', 'warning');
        return;
    }
    
    // Store route data for map page
    localStorage.setItem('tuma_active_route', JSON.stringify(state.claimedRoute));
    
    // Navigate to existing route.html with active flag
    window.location.href = './route.html?active=true';
    
    haptic('light');
};

window.openPaymentModal = function() {
    const summary = state.commissionTracker.getSummary();
    
    const modal = document.createElement('div');
    modal.className = 'payment-modal';
    modal.innerHTML = `
        <div class="payment-content">
            <h2>Pay Commission</h2>
            <p class="payment-amount">Amount Due: KES ${summary.unpaid}</p>
            <div class="payment-instructions">
                <h3>M-Pesa Payment Instructions:</h3>
                <ol>
                    <li>Go to M-Pesa on your phone</li>
                    <li>Select "Lipa na M-Pesa"</li>
                    <li>Select "Pay Bill"</li>
                    <li>Enter Business Number: <strong>247247</strong></li>
                    <li>Enter Account Number: <strong>${state.rider.phone}</strong></li>
                    <li>Enter Amount: <strong>${summary.unpaid}</strong></li>
                    <li>Enter your M-Pesa PIN</li>
                    <li>Wait for confirmation SMS</li>
                </ol>
            </div>
            <button class="modal-close" onclick="closePaymentModal()">Close</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const style = document.createElement('style');
    style.textContent = `
        .payment-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            backdrop-filter: blur(10px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .payment-content {
            background: var(--surface-elevated);
            border-radius: 20px;
            padding: 32px 24px;
            max-width: 400px;
            width: 100%;
        }
        
        .payment-content h2 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 16px;
        }
        
        .payment-amount {
            font-size: 32px;
            font-weight: 700;
            color: var(--warning);
            text-align: center;
            margin: 24px 0;
        }
        
        .payment-instructions {
            background: var(--surface-high);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 24px;
        }
        
        .payment-instructions h3 {
            font-size: 16px;
            margin-bottom: 12px;
        }
        
        .payment-instructions ol {
            margin-left: 20px;
            color: var(--text-secondary);
        }
        
        .payment-instructions li {
            margin-bottom: 8px;
            line-height: 1.5;
        }
        
        .payment-instructions strong {
            color: var(--text-primary);
            font-weight: 600;
        }
        
        .modal-close {
            width: 100%;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 12px;
            padding: 16px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
        }
