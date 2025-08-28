/**
 * Complete Rider Dashboard with Bottom Navigation Support
 * Part 1: Configuration and State Management
 */

// Development Configuration
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
    ignoreRiderNotFound: true,
    
    // Development-only commission settings
    bypassCommissionBlock: true, // Set to false in production
    commissionWarningsOnly: true // Show warnings but don't block
};

// Business Configuration
const BUSINESS_CONFIG = {
    commission: {
        rider: 0.70,
        platform: 0.30,
        maxUnpaid: 300,
        warningThreshold: 250
    },
    routeTypes: {
        express: { label: 'Express', multiplier: 1.4 },
        smart: { label: 'Smart', multiplier: 1.0 },
        eco: { label: 'Eco', multiplier: 0.8 }
    },
    incentives: {
        peak_hours: {
            morning: { start: 7, end: 10, multiplier: 1.2 },
            evening: { start: 17, end: 20, multiplier: 1.3 }
        }
    }
};

// Supabase Configuration
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

// Initialize clustering instance
const routeClusterer = typeof TumaRouteClustering !== 'undefined' ? new TumaRouteClustering({
    maxRouteDistance: 25,
    minClusterScore: 50,
    maxPickupRadius: {
        express: 2,
        smart: 3,
        eco: 4
    }
}) : null;

// Global State Management
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
        rating: 5.0,
        acceptRate: 95
    },
    activeDelivery: null,
    claimedRoute: null,
    availableRoutes: [],
    currentFilter: 'all',
    isLoading: false,
    commissionTracker: null,
    currentLocation: null,
    mapInitialized: false,
    parcelsInPossession: [],
    activeBonuses: [],
    transactions: [],
    notifications: []
};

// DOM Elements Cache
let elements = {};

function initializeElements() {
    elements = {
        // Status elements
        statusBadge: document.getElementById('statusBadge'),
        statusText: document.getElementById('statusText'),
        
        // Dashboard stats
        todayEarnings: document.getElementById('todayEarnings'),
        todayDeliveries: document.getElementById('todayDeliveries'),
        todayDistance: document.getElementById('todayDistance'),
        earningsTrend: document.getElementById('earningsTrend'),
        
        // Earnings elements
        dailyEarnings: document.getElementById('dailyEarnings'),
        weeklyEarnings: document.getElementById('weeklyEarnings'),
        monthlyEarnings: document.getElementById('monthlyEarnings'),
        weeklyTotal: document.getElementById('weeklyTotal'),
        
        // Stats elements
        totalDeliveries: document.getElementById('totalDeliveries'),
        totalDistance: document.getElementById('totalDistance'),
        riderRating: document.getElementById('riderRating'),
        acceptRate: document.getElementById('acceptRate'),
        
        // Rider info
        riderName: document.getElementById('riderName'),
        profileName: document.getElementById('profileName'),
        profilePhone: document.getElementById('profilePhone'),
        profileInitial: document.getElementById('profileInitial'),
        profileRating: document.getElementById('profileRating'),
        
        // Active route elements
        activeRouteSection: document.getElementById('activeRouteSection'),
        completedStops: document.getElementById('completedStops'),
        totalStops: document.getElementById('totalStops'),
        routeProgress: document.getElementById('routeProgress'),
        stopType: document.getElementById('stopType'),
        stopAddress: document.getElementById('stopAddress'),
        stopCode: document.getElementById('stopCode'),
        stopCustomer: document.getElementById('stopCustomer'),
        
        // Route list
        routeList: document.getElementById('routeList'),
        noRoutesState: document.getElementById('noRoutesState'),
        
        // Navigation badges
        routesBadge: document.getElementById('routesBadge'),
        walletBadge: document.getElementById('walletBadge'),
        notificationBadge: document.getElementById('notificationBadge'),
        
        // Commission elements
        commissionAlert: document.getElementById('commissionAlert'),
        commissionDebt: document.getElementById('commissionDebt'),
        walletCommissionDebt: document.getElementById('walletCommissionDebt'),
        commissionDebtCard: document.getElementById('commissionDebtCard'),
        
        // Wallet elements
        mpesaBalance: document.getElementById('mpesaBalance'),
        cashBalance: document.getElementById('cashBalance'),
        cashCard: document.getElementById('cashCard'),
        transactionList: document.getElementById('transactionList'),
        
        // Earnings page elements
        earningsDailyPage: document.getElementById('earningsDailyPage'),
        earningsWeeklyPage: document.getElementById('earningsWeeklyPage'),
        earningsMonthlyPage: document.getElementById('earningsMonthlyPage'),
        earningsBreakdown: document.getElementById('earningsBreakdown'),
        
        // Profile elements
        infoName: document.getElementById('infoName'),
        infoPhone: document.getElementById('infoPhone'),
        infoEmail: document.getElementById('infoEmail'),
        infoID: document.getElementById('infoID'),
        vehicleType: document.getElementById('vehicleType'),
        vehicleReg: document.getElementById('vehicleReg'),
        vehicleModel: document.getElementById('vehicleModel'),
        statDeliveries: document.getElementById('statDeliveries'),
        statDistance: document.getElementById('statDistance'),
        statJoined: document.getElementById('statJoined'),
        
        // FAB
        fab: document.getElementById('fab'),
        fabIcon: document.getElementById('fabIcon'),
        
        // Main content
        mainContent: document.getElementById('mainContent')
    };
}

// Commission Tracking Class
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
            if (riderId.startsWith('temp-')) {
                console.log('Using default commission values for temporary rider');
                return;
            }
            
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
            if (error.message.includes('400') && DEV_CONFIG.ignoreRiderNotFound) {
                console.log('Commission tracker API error (expected in dev mode)');
            } else {
                console.error('Error initializing commission tracker:', error);
            }
        }
    }

    async addDeliveryCommission(parcelId, deliveryPrice) {
        const commission = deliveryPrice * this.config.platform;
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

        const shouldBlock = this.state.unpaidCommission >= this.config.maxUnpaid;
        const devBypass = DEV_CONFIG.isDevelopment && DEV_CONFIG.bypassCommissionBlock;

        if (shouldBlock && !devBypass) {
            this.state.isBlocked = true;
            result.isBlocked = true;
        } else if (shouldBlock && devBypass) {
            console.warn(`[DEV MODE] Commission block bypassed. Amount: KES ${Math.round(this.state.unpaidCommission)}`);
            result.warningShown = true;
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
            percentageUsed: Math.round((this.state.unpaidCommission / this.config.maxUnpaid) * 100)
        };
    }

    createCommissionUI() {
        const summary = this.getSummary();
        const percentage = Math.min(summary.percentageUsed, 100);
        const isWarning = percentage >= 83;
        const isBlocked = percentage >= 100 && !(DEV_CONFIG.isDevelopment && DEV_CONFIG.bypassCommissionBlock);
        
        const devModeIndicator = (DEV_CONFIG.isDevelopment && DEV_CONFIG.bypassCommissionBlock && percentage >= 100) ? 
            '<span class="dev-mode-badge">DEV MODE</span>' : '';

        return {
            statusBar: `
                <div class="commission-status ${isWarning ? 'warning' : ''} ${isBlocked ? 'blocked' : ''}">
                    <div class="commission-header">
                        <span class="commission-title">Account Balance ${devModeIndicator}</span>
                        <span class="commission-amount">KES ${summary.unpaid} due</span>
                    </div>
                    <div class="commission-progress">
                        <div class="commission-progress-bar" style="width: ${percentage}%"></div>
                    </div>
                    <div class="commission-actions">
                        <button type="button" class="commission-pay-button" onclick="openWalletModal()">
                            Deposit Funds
                        </button>
                        <button type="button" class="commission-details-button" onclick="viewAccountDetails()">
                            View Details
                        </button>
                    </div>
                </div>
            `,
            warningMessage: isWarning && !isBlocked ? `
                <div class="commission-warning">
                    <span class="warning-icon">⚠️</span>
                    <span>Account balance low. Please deposit funds to continue accepting deliveries.</span>
                </div>
            ` : null,
            blockedMessage: isBlocked ? `
                <div class="commission-blocked-overlay">
                    <div class="blocked-content">
                        <div class="blocked-icon">⏸️</div>
                        <h2>Account Paused</h2>
                        <p>Please deposit funds to continue accepting deliveries</p>
                        <p class="blocked-amount">Minimum Deposit: KES ${summary.unpaid}</p>
                        <button class="pay-now-button" onclick="openWalletModal()">
                            Deposit Now
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
        `;
    }
}

// Enhanced Route Manager
const EnhancedRouteManager = {
    sequenceStops(parcels) {
        const pickups = [];
        const deliveries = [];
        
        parcels.forEach(parcel => {
            let pickupLocation, deliveryLocation;
            
            if (parcel.pickup_location && typeof parcel.pickup_location === 'object') {
                pickupLocation = parcel.pickup_location;
                deliveryLocation = parcel.delivery_location;
            } else if (parcel.pickup_location && typeof parcel.pickup_location === 'string') {
                try {
                    pickupLocation = JSON.parse(parcel.pickup_location);
                    deliveryLocation = JSON.parse(parcel.delivery_location);
                } catch (e) {
                    console.error('Error parsing location:', e);
                }
            } else if (parcel.pickup_lat && parcel.pickup_lng) {
                pickupLocation = {
                    lat: parcel.pickup_lat,
                    lng: parcel.pickup_lng,
                    address: parcel.pickup_address || 'Pickup location'
                };
                deliveryLocation = {
                    lat: parcel.delivery_lat,
                    lng: parcel.delivery_lng,
                    address: parcel.delivery_address || 'Delivery location'
                };
            } else {
                pickupLocation = { lat: -1.2921, lng: 36.8219, address: 'Pickup location' };
                deliveryLocation = { lat: -1.2921, lng: 36.8219, address: 'Delivery location' };
            }
            
            pickups.push({
                id: `${parcel.id}-pickup`,
                parcelId: parcel.id,
                type: 'pickup',
                address: pickupLocation.address || parcel.pickup_address || 'Pickup location',
                location: {
                    lat: parseFloat(pickupLocation.lat) || -1.2921,
                    lng: parseFloat(pickupLocation.lng) || 36.8219
                },
                parcelCode: parcel.parcel_code,
                verificationCode: parcel.pickup_code,
                customerName: parcel.sender_name || 'Sender',
                customerPhone: parcel.sender_phone || '',
                specialInstructions: parcel.pickup_instructions,
                completed: false,
                timestamp: null
            });
            
            deliveries.push({
                id: `${parcel.id}-delivery`,
                parcelId: parcel.id,
                type: 'delivery',
                address: deliveryLocation.address || parcel.delivery_address || 'Delivery location',
                location: {
                    lat: parseFloat(deliveryLocation.lat) || -1.2921,
                    lng: parseFloat(deliveryLocation.lng) || 36.8219
                },
                parcelCode: parcel.parcel_code,
                verificationCode: parcel.delivery_code,
                customerName: parcel.recipient_name || 'Recipient',
                customerPhone: parcel.recipient_phone || '',
                specialInstructions: parcel.delivery_instructions,
                completed: false,
                timestamp: null,
                dependsOn: `${parcel.id}-pickup`,
                paymentMethod: parcel.payment_method || 'cash',
                paymentStatus: parcel.payment_status || 'pending',
                amountToCollect: parcel.payment_status === 'pending' ? (parcel.price || 500) : 0
            });
        });
        
        const optimizedPickups = this.optimizeStopOrder(pickups);
        const optimizedDeliveries = this.optimizeStopOrder(deliveries);
        
        return [...optimizedPickups, ...optimizedDeliveries];
    },
    
    optimizeStopOrder(stops) {
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
/**
 * Part 2: API Functions, Display Functions, and UI Management
 */

// Supabase API Functions
const supabaseAPI = {
    async query(table, options = {}) {
        const { select = '*', filter = '', order = '', limit } = options;
        
        // Only skip API calls for temp- IDs, not for Bobby G's real ID
        if (filter && filter.includes('temp-')) {
            console.log('Skipping API call for temporary rider');
            return [];
        }
        // Bobby G's ID (ef5438ef-0cc0-4e35-8d1b-be18dbce7fe4) will pass through
        
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
            if (DEV_CONFIG.isDevelopment && DEV_CONFIG.ignoreRiderNotFound) {
                console.log(`API Error (ignored in dev): ${response.status}`);
                return [];
            }
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    },
    
    async insert(table, data) {
        if (data.rider_id && data.rider_id.includes('temp-')) {
            console.log('Skipping insert for temporary rider');
            return [data];
        }
        
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
        if (filter && filter.includes('temp-')) {
            console.log('Skipping update for temporary rider');
            return [data];
        }
        
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

// Notification System
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

// Helper Functions
function formatPhone(phone) {
    return phone.replace(/\D/g, '').slice(0, 10);
}

function calculateDistance(point1, point2) {
    const R = 6371;
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

function parsePrice(priceValue) {
    if (typeof priceValue === 'number') return priceValue;
    if (typeof priceValue === 'string') {
        const cleaned = priceValue.replace(/[^0-9.-]+/g, '');
        return parseFloat(cleaned) || 0;
    }
    return 0;
}

// Enhanced Features Functions
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

async function loadActiveBonuses() {
    try {
        if (!state.rider || state.rider.id.startsWith('temp-')) {
            state.activeBonuses = [];
            return;
        }
        
        const bonuses = await supabaseAPI.query('rider_bonuses', {
            filter: `rider_id=eq.${state.rider.id}&is_active=eq.true&expires_at=gt.${new Date().toISOString()}`,
            order: 'created_at.desc'
        });
        
        state.activeBonuses = bonuses;
        
        const globalBonuses = await supabaseAPI.query('global_bonuses', {
            filter: `is_active=eq.true&expires_at=gt.${new Date().toISOString()}`,
            order: 'created_at.desc'
        });
        
        state.activeBonuses = [...state.activeBonuses, ...globalBonuses];
        
    } catch (error) {
        console.error('Error loading bonuses:', error);
        state.activeBonuses = [];
    }
}

function calculateDailyBonus() {
    const deliveries = state.stats.deliveries;
    let applicableBonuses = [];
    
    state.activeBonuses.forEach(bonus => {
        if (bonus.type === 'delivery_target' && deliveries >= bonus.target_deliveries) {
            applicableBonuses.push(bonus);
        }
    });
    
    applicableBonuses.sort((a, b) => b.bonus_amount - a.bonus_amount);
    
    return {
        currentBonus: applicableBonuses[0] || null,
        nextBonus: state.activeBonuses.find(b => 
            b.type === 'delivery_target' && 
            b.target_deliveries > deliveries
        ) || null,
        deliveries
    };
}

function displayIncentiveProgress() {
    const { currentBonus, nextBonus, deliveries } = calculateDailyBonus();
    const peakStatus = isPeakHour();
    
    if (state.activeBonuses.length === 0 && !peakStatus.isPeak) {
        return;
    }
    
    const incentiveHTML = `
        <div class="incentive-widget">
            ${peakStatus.isPeak ? `
                <div class="peak-hour-banner">
                    <span class="peak-icon">🔥</span>
                    <span>Peak Hours Active! ${((peakStatus.multiplier - 1) * 100).toFixed(0)}% bonus on all deliveries</span>
                </div>
            ` : ''}
            
            ${nextBonus ? `
                <div class="daily-bonus-progress">
                    <h3 class="bonus-title">${nextBonus.title || 'Daily Bonus Progress'}</h3>
                    <div class="progress-container">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${(deliveries / nextBonus.target_deliveries * 100)}%"></div>
                        </div>
                        <div class="progress-text">
                            <span>${deliveries}/${nextBonus.target_deliveries} deliveries</span>
                            <span class="bonus-amount">KES ${nextBonus.bonus_amount}</span>
                        </div>
                    </div>
                    <p class="progress-message">Complete ${nextBonus.target_deliveries - deliveries} more for bonus!</p>
                </div>
            ` : currentBonus ? `
                <div class="daily-bonus-progress">
                    <p class="max-bonus-reached">🎉 Bonus achieved! KES ${currentBonus.bonus_amount}</p>
                </div>
            ` : ''}
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
    const hoursWorked = Math.max((Date.now() - startTime) / (1000 * 60 * 60), 1);
    
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

// Display Update Functions
function updateEarningsDisplay() {
    // Dashboard page elements
    if (elements.todayEarnings) elements.todayEarnings.textContent = Math.round(state.earnings.daily).toLocaleString();
    if (elements.dailyEarnings) elements.dailyEarnings.textContent = Math.round(state.earnings.daily).toLocaleString();
    if (elements.weeklyEarnings) elements.weeklyEarnings.textContent = Math.round(state.earnings.weekly).toLocaleString();
    if (elements.monthlyEarnings) elements.monthlyEarnings.textContent = Math.round(state.earnings.monthly).toLocaleString();
    if (elements.weeklyTotal) elements.weeklyTotal.textContent = Math.round(state.earnings.weekly).toLocaleString();
    
    // Earnings page elements
    if (elements.earningsDailyPage) elements.earningsDailyPage.textContent = Math.round(state.earnings.daily).toLocaleString();
    if (elements.earningsWeeklyPage) elements.earningsWeeklyPage.textContent = Math.round(state.earnings.weekly).toLocaleString();
    if (elements.earningsMonthlyPage) elements.earningsMonthlyPage.textContent = Math.round(state.earnings.monthly).toLocaleString();
    
    // Update earnings trend
    if (elements.earningsTrend) {
        const trend = Math.random() > 0.5 ? '↑' : '↓';
        const percentage = Math.floor(Math.random() * 20) + 1;
        elements.earningsTrend.textContent = `${trend} ${percentage}%`;
        elements.earningsTrend.className = trend === '↑' ? 'stat-trend up' : 'stat-trend down';
    }
}

function updateStatsDisplay() {
    // Dashboard stats
    if (elements.todayDeliveries) elements.todayDeliveries.textContent = state.stats.deliveries;
    if (elements.todayDistance) elements.todayDistance.textContent = state.stats.distance;
    
    // General stats
    if (elements.totalDeliveries) elements.totalDeliveries.textContent = state.stats.deliveries;
    if (elements.totalDistance) elements.totalDistance.textContent = state.stats.distance;
    if (elements.riderRating) elements.riderRating.textContent = state.stats.rating.toFixed(1);
    if (elements.acceptRate) elements.acceptRate.textContent = state.stats.acceptRate;
    
    // Profile stats
    if (elements.statDeliveries) elements.statDeliveries.textContent = state.stats.deliveries;
    if (elements.statDistance) elements.statDistance.textContent = `${state.stats.distance} km`;
    if (elements.profileRating) elements.profileRating.textContent = state.stats.rating.toFixed(1);
}

function updateProfileDisplay() {
    if (!state.rider) return;
    
    // Update profile name and phone
    if (elements.profileName) elements.profileName.textContent = state.rider.rider_name || 'Rider Name';
    if (elements.profilePhone) elements.profilePhone.textContent = state.rider.phone || '+254700000000';
    if (elements.profileInitial) elements.profileInitial.textContent = (state.rider.rider_name || 'R')[0].toUpperCase();
    
    // Update info fields
    if (elements.infoName) elements.infoName.textContent = state.rider.rider_name || '-';
    if (elements.infoPhone) elements.infoPhone.textContent = state.rider.phone || '-';
    if (elements.infoEmail) elements.infoEmail.textContent = state.rider.email || '-';
    if (elements.infoID) elements.infoID.textContent = state.rider.national_id || '-';
    
    // Update vehicle details
    if (elements.vehicleType) elements.vehicleType.textContent = state.rider.vehicle_type || state.rider.vehicle_make || 'Motorcycle';
    if (elements.vehicleReg) elements.vehicleReg.textContent = state.rider.motorcycle_plate || state.rider.vehicle_registration || 'KXX 123X';
    if (elements.vehicleModel) elements.vehicleModel.textContent = state.rider.vehicle_model || '-';
    
    // Update join date
    if (elements.statJoined) {
        const joinDate = state.rider.created_at ? new Date(state.rider.created_at).toLocaleDateString() : '-';
        elements.statJoined.textContent = joinDate;
    }
}

function updateWalletDisplay() {
    // Update M-Pesa balance
    if (elements.mpesaBalance) {
        const balance = state.rider?.mpesa_balance || 0;
        elements.mpesaBalance.textContent = Math.round(balance).toLocaleString();
    }
    
    // Update cash balance
    if (elements.cashBalance) {
        const cashBalance = state.rider?.cash_balance || 0;
        elements.cashBalance.textContent = Math.round(cashBalance).toLocaleString();
    }
    
    // Update commission debt card
    if (window.commissionOffsetManager) {
        const debt = window.commissionOffsetManager.commissionDebt;
        if (debt > 0) {
            if (elements.commissionDebtCard) elements.commissionDebtCard.style.display = 'block';
            if (elements.walletCommissionDebt) elements.walletCommissionDebt.textContent = Math.round(debt).toLocaleString();
            if (elements.walletBadge) elements.walletBadge.style.display = 'block';
        } else {
            if (elements.commissionDebtCard) elements.commissionDebtCard.style.display = 'none';
            if (elements.walletBadge) elements.walletBadge.style.display = 'none';
        }
    }
    
    // Load recent transactions
    loadTransactions();
}

async function loadTransactions() {
    try {
        // Create sample transactions for display
        const transactions = [
            {
                type: 'earnings',
                description: 'Delivery completed',
                amount: 350,
                timestamp: new Date(Date.now() - 3600000),
                icon: '💰'
            },
            {
                type: 'withdrawal',
                description: 'M-Pesa withdrawal',
                amount: -1000,
                timestamp: new Date(Date.now() - 7200000),
                icon: '📱'
            },
            {
                type: 'commission',
                description: 'Commission deducted',
                amount: -150,
                timestamp: new Date(Date.now() - 10800000),
                icon: '💳'
            }
        ];
        
        // Add commission offset transactions if any
        if (window.commissionOffsetManager) {
            const offsetTransactions = window.commissionOffsetManager.getOffsetTransactions();
            transactions.push(...offsetTransactions);
        }
        
        // Sort by timestamp
        transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Display transactions
        if (elements.transactionList) {
            elements.transactionList.innerHTML = transactions.slice(0, 10).map(tx => `
                <div class="transaction-item">
                    <span class="transaction-icon">${tx.icon}</span>
                    <div class="transaction-info">
                        <div class="transaction-desc">${tx.description}</div>
                        <div class="transaction-time">${formatTimeAgo(tx.timestamp)}</div>
                    </div>
                    <div class="transaction-amount ${tx.amount > 0 ? 'positive' : tx.type === 'commission' ? 'offset' : 'negative'}">
                        ${tx.amount > 0 ? '+' : ''}KES ${Math.abs(tx.amount).toLocaleString()}
                    </div>
                </div>
            `).join('');
        }
        
        // Display in earnings breakdown
        if (elements.earningsBreakdown) {
            const todayTransactions = transactions.filter(tx => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return new Date(tx.timestamp) >= today;
            });
            
            if (todayTransactions.length > 0) {
                elements.earningsBreakdown.innerHTML = todayTransactions.map(tx => `
                    <div class="transaction-item">
                        <span class="transaction-icon">${tx.icon}</span>
                        <div class="transaction-info">
                            <div class="transaction-desc">${tx.description}</div>
                            <div class="transaction-time">${formatTimeAgo(tx.timestamp)}</div>
                        </div>
                        <div class="transaction-amount ${tx.amount > 0 ? 'positive' : 'negative'}">
                            ${tx.amount > 0 ? '+' : ''}KES ${Math.abs(tx.amount).toLocaleString()}
                        </div>
                    </div>
                `).join('');
            } else {
                elements.earningsBreakdown.innerHTML = `
                    <div class="empty-state">
                        <p>No transactions today yet</p>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

// Route Display Function
function displayRoutes() {
    const filteredRoutes = state.currentFilter === 'all' 
        ? state.availableRoutes 
        : state.availableRoutes.filter(r => r.type === state.currentFilter);
    
    if (!elements.routeList) return;
    
    const hasActiveRoute = state.claimedRoute !== null;
    
    // Update routes badge
    if (elements.routesBadge) {
        const availableCount = filteredRoutes.filter(r => r.status === 'available').length;
        if (availableCount > 0 && !hasActiveRoute) {
            elements.routesBadge.textContent = availableCount;
            elements.routesBadge.style.display = 'block';
        } else {
            elements.routesBadge.style.display = 'none';
        }
    }
    
    if (filteredRoutes.length === 0) {
        elements.routeList.innerHTML = '';
        if (elements.noRoutesState) elements.noRoutesState.style.display = 'block';
        return;
    }
    
    if (elements.noRoutesState) elements.noRoutesState.style.display = 'none';
    
    elements.routeList.innerHTML = filteredRoutes.map(route => {
        const riderEarnings = Math.round(route.total_earnings * BUSINESS_CONFIG.commission.rider);
        const routeIcon = route.type === 'express' ? '⚡' : route.type === 'eco' ? '🌿' : '📦';
        
        // Check if commission offset applies
        let offsetMessage = '';
        if (window.commissionOffsetManager && window.commissionOffsetManager.commissionDebt > 0) {
            const offsetResult = window.commissionOffsetManager.calculateOffset(riderEarnings);
            if (offsetResult.offset > 0) {
                offsetMessage = `
                    <div class="route-commission-offset">
                        <span class="offset-icon">💳</span>
                        <span>KES ${offsetResult.offset} commission will be deducted</span>
                    </div>
                `;
            }
        }
        
        return `
            <div class="route-card ${route.status !== 'available' || hasActiveRoute ? 'claimed' : ''}" 
                 ${route.status === 'available' && !hasActiveRoute ? `onclick="claimRoute('${route.id}')"` : ''}>
                <div class="route-header">
                    <div class="route-name">${route.name}</div>
                    <div class="route-type ${route.type}">${route.type.toUpperCase()}</div>
                </div>
                
                <div class="route-stats">
                    <div class="route-stat">
                        <div class="route-stat-value">${route.pickups}</div>
                        <div class="route-stat-label">Stops</div>
                    </div>
                    <div class="route-stat">
                        <div class="route-stat-value">${route.distance}</div>
                        <div class="route-stat-label">KM</div>
                    </div>
                    <div class="route-stat">
                        <div class="route-stat-value">KES ${riderEarnings.toLocaleString()}</div>
                        <div class="route-stat-label">Earnings</div>
                    </div>
                </div>
                
                ${offsetMessage}
                
                <button type="button" class="claim-button" 
                        ${route.status !== 'available' || hasActiveRoute ? 'disabled' : ''}
                        onclick="event.stopPropagation(); ${route.status === 'available' && !hasActiveRoute ? `claimRoute('${route.id}')` : ''}">
                    ${hasActiveRoute ? 'Route Active' : 
                      route.status === 'available' ? 'Claim Route' : 'Already Claimed'}
                </button>
            </div>
        `;
    }).join('');
}
/**
 * Part 3: Route Management, Active Delivery, Location Functions, and Authentication
 */

// Show Active Route
function showActiveRoute() {
    if (!state.claimedRoute) return;
    
    const allComplete = state.claimedRoute.stops && state.claimedRoute.stops.every(s => s.completed);
    if (allComplete) {
        console.log('All stops completed - route should be cleared');
        state.claimedRoute = null;
        localStorage.removeItem('tuma_active_route');
        
        if (elements.activeRouteSection) {
            elements.activeRouteSection.style.display = 'none';
        }
        return;
    }
    
    const activeStops = state.claimedRoute.stops.filter(s => !s.completed);
    if (activeStops.length === 0) return;
    
    const nextStop = activeStops[0];
    const completedCount = state.claimedRoute.stops.filter(s => s.completed).length;
    const totalCount = state.claimedRoute.stops.length;
    
    // Show the active route section
    if (elements.activeRouteSection) {
        elements.activeRouteSection.style.display = 'block';
    }
    
    // Update progress
    if (elements.completedStops) elements.completedStops.textContent = completedCount;
    if (elements.totalStops) elements.totalStops.textContent = totalCount;
    if (elements.routeProgress) {
        elements.routeProgress.style.width = `${(completedCount / totalCount * 100)}%`;
    }
    
    // Update stop info
    if (elements.stopType) {
        elements.stopType.textContent = nextStop.type === 'pickup' ? '📦 PICKUP' : '📍 DELIVERY';
        elements.stopType.className = `stop-type ${nextStop.type}`;
    }
    if (elements.stopAddress) elements.stopAddress.textContent = getLocationName(nextStop.address);
    if (elements.stopCode) elements.stopCode.textContent = nextStop.parcelCode;
    if (elements.stopCustomer) elements.stopCustomer.textContent = nextStop.customerName;
}

function getLocationName(address) {
    if (!address || address === 'Pickup location' || address === 'Delivery location') {
        return address;
    }
    
    const patterns = [
        /^([^,]+),/,
        /^(.+?)(?:\s+Road|\s+Street|\s+Avenue|\s+Drive)/i,
        /^(.+?)(?:\s+Mall|\s+Centre|\s+Center|\s+Plaza)/i
    ];
    
    for (const pattern of patterns) {
        const match = address.match(pattern);
        if (match) {
            return match[1].trim();
        }
    }
    
    return address.split(',')[0].trim();
}

// Create Routes Functions
function createRoutes(parcels) {
    console.log(`Creating routes from ${parcels.length} parcels using advanced clustering...`);
    
    try {
        if (routeClusterer) {
            const routes = routeClusterer.createOptimizedRoutes(parcels);
            
            console.log(`Created ${routes.length} optimized routes:`);
            routes.forEach(route => {
                console.log(`- ${route.name}: ${route.pickups} parcels, ${route.distance}km, ` +
                           `KES ${route.total_earnings} (Score: ${route.qualityScore})`);
            });
            
            return routes.length > 0 ? routes : createDemoRoutes();
        } else {
            return createDemoRoutes();
        }
    } catch (error) {
        console.error('Error creating routes:', error);
        return createDemoRoutes();
    }
}

function createDemoRoutes() {
    console.log('Creating demo routes for testing...');
    const demoTotalEarnings = [2500, 1714, 3429];
    
    return [
        {
            id: 'demo-route-001',
            name: 'Sarit Centre → Village Market',
            type: 'smart',
            deliveries: 5,
            pickups: 5,
            distance: 12,
            total_earnings: demoTotalEarnings[0],
            status: 'available',
            parcels: [],
            qualityScore: 75,
            estimatedTime: 45,
            metadata: {
                pickupAreas: ['Westlands'],
                deliveryCorridors: ['north'],
                hasReturnTrip: false
            }
        },
        {
            id: 'demo-route-002',
            name: 'CBD → Eastlands Express',
            type: 'express',
            deliveries: 1,
            pickups: 1,
            distance: 8,
            total_earnings: demoTotalEarnings[1],
            status: 'available',
            parcels: [],
            qualityScore: 82,
            estimatedTime: 25,
            metadata: {
                pickupAreas: ['CBD'],
                deliveryCorridors: ['east'],
                hasReturnTrip: false
            }
        },
        {
            id: 'demo-route-003',
            name: 'Karen Local',
            type: 'eco',
            deliveries: 8,
            pickups: 8,
            distance: 25,
            total_earnings: demoTotalEarnings[2],
            status: 'available',
            parcels: [],
            qualityScore: 68,
            estimatedTime: 90,
            metadata: {
                pickupAreas: ['Karen'],
                deliveryCorridors: ['south'],
                hasReturnTrip: true
            }
        }
    ];
}

// Load Available Routes
async function loadAvailableRoutes() {
    try {
        console.log('Loading available routes...');
        
        if (elements.routeList) {
            elements.routeList.innerHTML = `
                <div class="skeleton skeleton-card"></div>
                <div class="skeleton skeleton-card"></div>
                <div class="skeleton skeleton-card"></div>
            `;
        }
        
        const unclaimedParcels = await supabaseAPI.query('parcels', {
            filter: 'status=eq.submitted&rider_id=is.null',
            limit: 1000,
            order: 'created_at.asc'
        });
        
        console.log(`Found ${unclaimedParcels.length} unclaimed parcels`);
        
        if (unclaimedParcels.length === 0) {
            state.availableRoutes = createDemoRoutes();
        } else {
            state.availableRoutes = createRoutes(unclaimedParcels);
            console.log(`Created ${state.availableRoutes.length} routes from ${unclaimedParcels.length} parcels`);
        }
        
        displayRoutes();
        
    } catch (error) {
        console.error('Error loading routes:', error);
        state.availableRoutes = createDemoRoutes();
        displayRoutes();
    }
}

// Check Active Deliveries
async function checkActiveDeliveries() {
    try {
        const storedRoute = localStorage.getItem('tuma_active_route');
        if (storedRoute) {
            try {
                const route = JSON.parse(storedRoute);
                console.log('Found stored route:', route);
                
                const allStopsCompleted = route.stops && route.stops.every(s => s.completed);
                
                if (allStopsCompleted) {
                    console.log('All stops completed - clearing route');
                    localStorage.removeItem('tuma_active_route');
                    state.claimedRoute = null;
                    
                    if (elements.activeRouteSection) {
                        elements.activeRouteSection.style.display = 'none';
                    }
                    return;
                }
                
                state.claimedRoute = route;
                
                if (state.availableRoutes) {
                    state.availableRoutes.forEach(r => {
                        r.status = 'claimed';
                    });
                }
                
                showActiveRoute();
                displayRoutes();
                return;
            } catch (error) {
                console.error('Error parsing stored route:', error);
                localStorage.removeItem('tuma_active_route');
                state.claimedRoute = null;
            }
        }
        
        if (!state.rider || state.rider.id.startsWith('temp-')) {
            console.log('No active route for temporary rider');
            state.claimedRoute = null;
            return;
        }
        
        const activeParcels = await supabaseAPI.query('parcels', {
            filter: `rider_id=eq.${state.rider.id}&status=in.(route_assigned,picked,in_transit)`,
            order: 'created_at.asc'
        });
        
        if (activeParcels.length > 0) {
            state.claimedRoute = {
                parcels: activeParcels,
                stops: EnhancedRouteManager.sequenceStops(activeParcels)
            };
            
            showActiveRoute();
        } else {
            console.log('No active parcels found');
            state.claimedRoute = null;
        }
        
    } catch (error) {
        console.error('Error checking active deliveries:', error);
        state.claimedRoute = null;
    }
}

// Claim Route Function - COMPLETE VERSION
window.claimRoute = async function(routeId) {
    console.log('claimRoute called with ID:', routeId);
    
    if (window.event) {
        window.event.preventDefault();
        window.event.stopPropagation();
    }
    
    if (state.claimedRoute) {
        showNotification('You already have an active route!', 'warning');
        return;
    }
    
    const route = state.availableRoutes.find(r => r.id === routeId);
    console.log('Found route:', route);
    
    if (!route || route.status !== 'available') {
        showNotification('This route is not available', 'warning');
        return;
    }
    
    if (state.isLoading) return;
    state.isLoading = true;
    
    showNotification('Claiming route...', 'info');
    
    try {
        if (route.parcelDetails && route.parcelDetails.length > 0) {
            state.claimedRoute = {
                ...route,
                parcels: route.parcelDetails,
                stops: EnhancedRouteManager.sequenceStops(route.parcelDetails)
            };
            
            if (route.metadata?.pickupSequence) {
                const optimizedStops = [];
                const deliveryStops = [];
                
                route.metadata.pickupSequence.forEach(parcelId => {
                    const pickupStop = state.claimedRoute.stops.find(s => 
                        s.parcelId === parcelId && s.type === 'pickup'
                    );
                    if (pickupStop) optimizedStops.push(pickupStop);
                });
                
                state.claimedRoute.stops.forEach(stop => {
                    if (stop.type === 'delivery') {
                        deliveryStops.push(stop);
                    }
                });
                
                state.claimedRoute.stops = [...optimizedStops, ...deliveryStops];
            }
            
            localStorage.setItem('tuma_active_route', JSON.stringify(state.claimedRoute));
            
            showActiveRoute();
            
            state.availableRoutes.forEach(r => r.status = 'claimed');
            displayRoutes();
            
            const pickupAreas = route.metadata?.pickupAreas?.join(', ') || 'Multiple areas';
            showNotification(
                `Route claimed successfully! ${route.pickups} pickup${route.pickups > 1 ? 's' : ''} in ${pickupAreas}`, 
                'success'
            );
            
            if (!route.id.startsWith('demo-') && !state.rider.id.startsWith('temp-')) {
                try {
                    for (const parcel of route.parcelDetails) {
                        await supabaseAPI.update('parcels', 
                            `id=eq.${parcel.id}`,
                            { 
                                rider_id: state.rider.id,
                                status: 'route_assigned',
                                assigned_at: new Date().toISOString()
                            }
                        );
                    }
                } catch (dbError) {
                    console.error('Error updating database:', dbError);
                }
            }
            
            if (window.haptic) window.haptic('success');
        } else {
            // For demo routes without parcel details
            state.claimedRoute = {
                ...route,
                parcels: [],
                stops: []
            };
            
            localStorage.setItem('tuma_active_route', JSON.stringify(state.claimedRoute));
            showActiveRoute();
            
            state.availableRoutes.forEach(r => r.status = 'claimed');
            displayRoutes();
            
            showNotification('Demo route claimed successfully!', 'success');
            if (window.haptic) window.haptic('success');
        }
        
    } catch (error) {
        console.error('Error claiming route:', error);
        showNotification('Failed to claim route. Please try again.', 'error');
        
        localStorage.removeItem('tuma_active_route');
        state.claimedRoute = null;
    } finally {
        state.isLoading = false;
    }
};

// Navigate to Route
window.navigateToRoute = function() {
    if (!state.claimedRoute) {
        showNotification('Claim a route first to see navigation', 'warning');
        return;
    }
    
    localStorage.setItem('tuma_active_route', JSON.stringify(state.claimedRoute));
    window.location.href = './route.html?active=true';
    
    if (window.haptic) window.haptic('light');
};

// Location Functions
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
        if (state.status === 'online' && state.rider && !state.rider.id.startsWith('temp-')) {
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

// Quick Verify Function
window.quickVerify = function() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Quick Verify</h2>
                <button class="modal-close" onclick="closeModal(this)">×</button>
            </div>
            <div style="padding: 20px 0;">
                <input type="text" id="quickCode" placeholder="Enter code (XXX-XXXX)" 
                       style="width: 100%; padding: 16px; background: var(--surface-high); 
                              border: 2px solid var(--border); border-radius: 12px; 
                              color: white; font-size: 20px; text-align: center; 
                              letter-spacing: 2px; text-transform: uppercase;">
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px;">
                    <button class="claim-button" style="background: var(--warning); color: black;" 
                            onclick="quickVerifyCode('pickup')">
                        📦 Pickup
                    </button>
                    <button class="claim-button" style="background: var(--success);" 
                            onclick="quickVerifyCode('delivery')">
                        📍 Delivery
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    setTimeout(() => {
        document.getElementById('quickCode').focus();
    }, 100);
};

window.quickVerifyCode = async function(type) {
    const code = document.getElementById('quickCode').value;
    if (!code) {
        showNotification('Please enter a code', 'error');
        return;
    }
    
    closeModal(document.querySelector('.modal-overlay'));
    
    // Process verification using the main verify function
    await verifyStopCode(type, code);
};

// Close Modal Helper
window.closeModal = function(element) {
    const modal = element.closest('.modal-overlay');
    if (modal) {
        modal.remove();
    }
};

// Verify Stop Code Function - COMPLETE VERSION
async function verifyStopCode(type, code) {
    if (!code || code.length < 6) {
        showNotification('Please enter a valid code', 'error');
        return;
    }
    
    if (state.isLoading) return;
    state.isLoading = true;
    
    try {
        if (state.claimedRoute && state.claimedRoute.stops) {
            const activeStop = state.claimedRoute.stops.find(s => 
                !s.completed && 
                s.type === type && 
                s.verificationCode && s.verificationCode.toUpperCase() === code.toUpperCase()
            );
            
            if (!activeStop) {
                showNotification('Invalid code or wrong stop type', 'error');
                return;
            }
            
            if (!EnhancedRouteManager.canCompleteStop(activeStop, state.claimedRoute.stops)) {
                showNotification('Please complete the pickup first', 'warning');
                return;
            }
            
            activeStop.completed = true;
            activeStop.timestamp = new Date();
            
            let dbError = null;
            if (!state.rider.id.startsWith('temp-')) {
                try {
                    await supabaseAPI.update('parcels',
                        `id=eq.${activeStop.parcelId}`,
                        {
                            status: type === 'pickup' ? 'picked' : 'delivered',
                            [`${type}_timestamp`]: activeStop.timestamp.toISOString()
                        }
                    );
                } catch (error) {
                    dbError = error;
                    console.error('Database update error:', error);
                    
                    if (error.message && (
                        error.message.includes('agent_notifications') ||
                        error.message.includes('column "title"')
                    )) {
                        console.log('Continuing despite agent_notifications error');
                        showNotification(
                            type === 'delivery' ? 
                            'Delivery completed! Database sync pending.' : 
                            'Pickup completed!', 
                            'success'
                        );
                    } else {
                        console.error('Unexpected database error:', error);
                        showNotification(
                            `${type.charAt(0).toUpperCase() + type.slice(1)} recorded locally. Sync pending.`, 
                            'warning'
                        );
                    }
                }
            }
            
            if (type === 'delivery') {
                if (activeStop.amountToCollect > 0) {
                    showNotification(
                        `Remember to collect KES ${activeStop.amountToCollect.toLocaleString()} from ${activeStop.customerName}`,
                        'warning'
                    );
                }
                
                let deliveryPrice = 0;
                if (state.claimedRoute.parcels && state.claimedRoute.parcels.length > 0) {
                    const parcel = state.claimedRoute.parcels.find(p => p.id === activeStop.parcelId);
                    deliveryPrice = parcel?.price || 500;
                } else {
                    deliveryPrice = 500;
                }
                
                // Update commission if commission offset manager exists
                if (window.commissionOffsetManager) {
                    const offsetResult = window.commissionOffsetManager.applyOffset(
                        activeStop.parcelId,
                        deliveryPrice * BUSINESS_CONFIG.commission.rider
                    );
                }
                
                const riderPayout = deliveryPrice * BUSINESS_CONFIG.commission.rider;
                state.earnings.daily += riderPayout;
                state.stats.deliveries++;
                
                updateEarningsDisplay();
                updateStatsDisplay();
            }
            
            localStorage.setItem('tuma_active_route', JSON.stringify(state.claimedRoute));
            
            if (!dbError || !dbError.message?.includes('agent_notifications')) {
                showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} verified successfully!`, 'success');
            }
            
            const allComplete = state.claimedRoute.stops.every(s => s.completed);
            if (allComplete) {
                const deliveryStops = state.claimedRoute.stops.filter(s => s.type === 'delivery');
                const totalCollected = deliveryStops.reduce((sum, stop) => sum + (stop.amountToCollect || 0), 0);
                
                let totalEarnings = 0;
                if (state.claimedRoute.total_earnings) {
                    totalEarnings = state.claimedRoute.total_earnings * BUSINESS_CONFIG.commission.rider;
                } else if (state.claimedRoute.parcels) {
                    totalEarnings = state.claimedRoute.parcels.reduce((sum, p) => 
                        sum + ((p.price || 500) * BUSINESS_CONFIG.commission.rider), 0
                    );
                } else {
                    totalEarnings = state.claimedRoute.stops.filter(s => s.type === 'delivery').length * 350;
                }
                
                if (totalCollected > 0) {
                    showRouteCompletionSummary(totalCollected, totalEarnings, deliveryStops.length);
                }
                
                const completionData = {
                    completed: true,
                    earnings: Math.round(totalEarnings),
                    deliveries: deliveryStops.length,
                    totalCollected: totalCollected,
                    timestamp: new Date().toISOString(),
                    parcels: state.claimedRoute.parcels || []
                };
                
                console.log('Storing route completion data:', completionData);
                localStorage.setItem('tuma_route_completion', JSON.stringify(completionData));
                
                if (elements.activeRouteSection) elements.activeRouteSection.style.display = 'none';
                state.claimedRoute = null;
                
                localStorage.removeItem('tuma_active_route');
                
                state.availableRoutes.forEach(route => {
                    route.status = 'available';
                });
                
                showNotification('Route completed! Great work!', 'success');
                
                await loadAvailableRoutes();
                await checkRouteCompletionStatus();
            } else {
                showActiveRoute();
                
                const pickups = state.claimedRoute.stops.filter(s => s.type === 'pickup');
                const allPickupsComplete = pickups.every(p => p.completed);
                
                if (allPickupsComplete && type === 'pickup') {
                    showNotification('All pickups complete! Starting delivery phase', 'success');
                }
            }
        }
        
        if (window.haptic) window.haptic('success');
        
    } catch (error) {
        console.error('Error verifying code:', error);
        showNotification('Verification failed. Please try again.', 'error');
    } finally {
        state.isLoading = false;
    }
}

// Load Earnings
async function loadEarnings() {
    try {
        if (!state.rider) return;
        
        if (state.rider.id.startsWith('temp-')) {
            console.log('Using default earnings for temporary rider');
            state.earnings = {
                daily: 0,
                weekly: 0,
                monthly: 0
            };
            updateEarningsDisplay();
            return;
        }
        
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
        
        updateEarningsDisplay();
        
    } catch (error) {
        if (error.message.includes('400') && DEV_CONFIG.ignoreRiderNotFound) {
            console.log('Earnings API error (expected in dev mode)');
            state.earnings = {
                daily: 0,
                weekly: 0,
                monthly: 0
            };
            updateEarningsDisplay();
        } else {
            console.error('Error loading earnings:', error);
        }
    }
}

// Load Stats
async function loadStats() {
    try {
        if (!state.rider) {
            state.stats = { deliveries: 0, distance: 0, rating: 5.0, acceptRate: 95 };
            updateStatsDisplay();
            return;
        }
        
        if (state.rider.id.startsWith('temp-')) {
            state.stats = { deliveries: 0, distance: 0, rating: 5.0, acceptRate: 95 };
            updateStatsDisplay();
            return;
        }
        
        state.stats = {
            deliveries: state.rider.completed_deliveries || 0,
            distance: Math.round(state.rider.total_distance || 0),
            rating: parseFloat(state.rider.rating) || 5.0,
            acceptRate: state.rider.acceptance_rate || 95
        };
        
        updateStatsDisplay();
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Check Route Completion Status
async function checkRouteCompletionStatus() {
    const completionData = localStorage.getItem('tuma_route_completion');
    if (!completionData) return;
    
    try {
        const data = JSON.parse(completionData);
        localStorage.removeItem('tuma_route_completion');
        
        console.log('Processing route completion:', data);
        
        if (document.readyState !== 'complete') {
            await new Promise(resolve => {
                window.addEventListener('load', resolve);
            });
        }
        
        if (data.completed) {
            let totalCashCollected = 0;
            
            if (data.parcels && data.parcels.length > 0) {
                data.parcels.forEach(parcel => {
                    if (parcel.payment_status === 'pending' || !parcel.payment_status) {
                        totalCashCollected += parsePrice(parcel.price || parcel.total_price || 500);
                    }
                });
            } else {
                totalCashCollected = data.deliveries * 500;
            }
            
            if (totalCashCollected > 0) {
                showRouteCompletionSummary(totalCashCollected, data.earnings, data.deliveries);
                setTimeout(() => {
                    showCashCollectionReminder(totalCashCollected);
                }, 1000);
            }
            
            state.earnings.daily += data.earnings;
            state.stats.deliveries += data.deliveries;
            
            updateEarningsDisplay();
            updateStatsDisplay();
            
            state.claimedRoute = null;
            localStorage.removeItem('tuma_active_route');
            
            showNotification(`Route completed! Earned KES ${data.earnings}`, 'success');
        }
    } catch (error) {
        console.error('Error processing route completion:', error);
    }
}

// Show Route Completion Summary
function showRouteCompletionSummary(totalCollected, riderEarnings, deliveryCount) {
    const summary = document.createElement('div');
    summary.className = 'route-completion-summary';
    summary.innerHTML = `
        <div class="summary-content">
            <div class="summary-icon">🎉</div>
            <h2>Route Completed!</h2>
            
            <div class="summary-stats">
                <div class="stat-item">
                    <span class="stat-label">Deliveries Completed</span>
                    <span class="stat-value">${deliveryCount}</span>
                </div>
                
                <div class="stat-item highlight-green">
                    <span class="stat-label">Total Cash Collected</span>
                    <span class="stat-value cash">KES ${totalCollected.toLocaleString()}</span>
                </div>
                
                <div class="stat-item earnings">
                    <span class="stat-label">Your Earnings</span>
                    <span class="stat-value">KES ${Math.round(totalCollected * 0.7).toLocaleString()}</span>
                </div>
            </div>
            
            <div class="cash-instruction">
                <div class="instruction-icon">💳</div>
                <div class="instruction-text">
                    <p>Please deposit the collected cash to your Tuma wallet within 24 hours</p>
                </div>
            </div>
            
            <button class="continue-btn" onclick="closeCompletionSummary()">
                Continue
            </button>
        </div>
    `;
    
    document.body.appendChild(summary);
}

window.closeCompletionSummary = function() {
    const summary = document.querySelector('.route-completion-summary');
    if (summary) {
        summary.remove();
    }
};

// Show Cash Collection Reminder
function showCashCollectionReminder(totalCashCollected) {
    if (document.getElementById('cashCollectionReminder')) {
        return;
    }
    
    const reminderBanner = document.createElement('div');
    reminderBanner.id = 'cashCollectionReminder';
    reminderBanner.className = 'cash-collection-reminder';
    reminderBanner.style.opacity = '0';
    reminderBanner.innerHTML = `
        <div class="reminder-content">
            <div class="reminder-icon">💰</div>
            <div class="reminder-text">
                <div class="reminder-title">Cash Collection Active</div>
                <div class="reminder-details">
                    <span>Collected: <strong>KES ${totalCashCollected.toLocaleString()}</strong></span>
                    <span class="separator">•</span>
                    <span>Deposit to wallet within 24 hours</span>
                </div>
            </div>
            <button class="reminder-close" onclick="dismissCashReminder()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
            </button>
        </div>
    `;
    
    document.body.insertBefore(reminderBanner, document.body.firstChild);
    
    setTimeout(() => {
        reminderBanner.style.opacity = '1';
        reminderBanner.style.transition = 'opacity 0.3s ease-in';
    }, 100);
    
    document.body.classList.add('has-cash-reminder');
}

window.dismissCashReminder = function() {
    const reminder = document.getElementById('cashCollectionReminder');
    if (reminder) {
        reminder.style.transform = 'translateY(-100%)';
        document.body.classList.remove('has-cash-reminder');
        setTimeout(() => reminder.remove(), 300);
    }
};

// FIXED AUTHENTICATION FUNCTIONS WITH BOBBY G OVERRIDE

// Check Auth and Load Rider - FIXED TO USE BOBBY G IN DEV
async function checkAuthAndLoadRider() {
    // Development override - always load Bobby G
    if (DEV_CONFIG.isDevelopment && DEV_CONFIG.testRider) {
        console.log('Development mode: Loading Bobby G directly');
        return await loadRiderByPhone(DEV_CONFIG.testRider.phone);
    }
    
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
    
    const storedPhone = localStorage.getItem('tuma_rider_phone');
    if (storedPhone) {
        return await loadRiderByPhone(storedPhone);
    }
    
    return false;
}

// Load Rider By Phone - FIXED TO USE BOBBY G'S PHONE IN DEV
async function loadRiderByPhone(phone) {
    try {
        // In development, always use Bobby G's phone
        const phoneToUse = DEV_CONFIG.isDevelopment && DEV_CONFIG.testRider ? 
            DEV_CONFIG.testRider.phone : phone;
        
        const riders = await supabaseAPI.query('riders', {
            filter: `phone=eq.${phoneToUse}`,
            limit: 1
        });
        
        if (riders.length > 0) {
            state.rider = riders[0];
            console.log('Loaded rider:', state.rider.rider_name, 'ID:', state.rider.id);
            
            if (state.rider.verification_status !== 'verified') {
                console.warn('Account pending verification');
                // Don't block Bobby G in dev mode
                if (!DEV_CONFIG.isDevelopment) {
                    showNotification('Your account is pending verification. Please contact support.', 'warning');
                }
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

// Create Temporary Rider - SIMPLIFIED
async function createTemporaryRider() {
    // Always use temp ID since Bobby G is loaded through loadRiderByPhone
    state.rider = {
        id: 'temp-' + Date.now(),
        rider_name: 'Test Rider',
        phone: '0700000000',
        status: 'active',
        total_deliveries: 0,
        completed_deliveries: 0,
        total_distance: 0,
        rating: 5.0,
        unpaid_commission: 0,
        verification_status: 'verified'
    };
    
    console.log('Created temporary rider:', state.rider.id);
}
/**
 * Part 4: Main Initialization, Event Handlers, Global Functions, and Utilities
 */

// Main Initialization
async function initialize() {
    console.log('Initializing rider dashboard...');
    
    const storedRoute = localStorage.getItem('tuma_active_route');
    if (storedRoute) {
        try {
            const route = JSON.parse(storedRoute);
            const routeAge = Date.now() - new Date(route.created_at || 0).getTime();
            if (routeAge > 24 * 60 * 60 * 1000) {
                console.log('Clearing stale route data');
                localStorage.removeItem('tuma_active_route');
            }
        } catch (e) {
            console.error('Error parsing stored route:', e);
            localStorage.removeItem('tuma_active_route');
        }
    }
    
    initializeElements();
    
    window.state = state;
    
    // Initialize commission tracker
    state.commissionTracker = new CommissionTracker(BUSINESS_CONFIG.commission);
    
    const authenticated = await checkAuthAndLoadRider();
    
    if (!authenticated) {
        console.log('Authentication failed, creating temporary rider');
        await createTemporaryRider();
    }
    
    if (elements.riderName && state.rider) {
        elements.riderName.textContent = state.rider.rider_name || 'Rider';
    }
    
    // Initialize commission tracker with rider data
    if (state.rider && state.commissionTracker) {
        try {
            await state.commissionTracker.initialize(state.rider.id, supabaseAPI);
            displayCommissionStatus();
            
            const devBypass = DEV_CONFIG.isDevelopment && DEV_CONFIG.bypassCommissionBlock;
            
            if (state.commissionTracker.state.isBlocked && !devBypass) {
                showBlockedOverlay();
                return;
            } else if (state.commissionTracker.state.isBlocked && devBypass) {
                console.warn('[DEV MODE] Commission block bypassed on initialization');
                showNotification('DEV MODE: Commission block bypassed', 'warning');
            }
        } catch (error) {
            console.error('Error initializing commission tracker:', error);
        }
    }
    
    // Initialize commission offset manager if exists
    if (window.commissionOffsetManager && state.rider) {
        await window.commissionOffsetManager.load();
    }
    
    await checkRouteCompletionStatus();
    
    getCurrentLocation();
    
    setupEventListeners();
    await loadEarnings();
    await loadStats();
    await loadActiveBonuses();
    await loadAvailableRoutes();
    await checkActiveDeliveries();
    
    // Add custom styles
    addCustomStyles();
    
    // Add enhanced features
    displayIncentiveProgress();
    displayPerformanceMetrics();
    addQuickActions();
    
    updateProfileDisplay();
    updateWalletDisplay();
    
    if (state.status === 'online') {
        startLocationUpdates();
    }
    
    console.log('Rider dashboard initialized successfully');
}

// Event Listeners
function setupEventListeners() {
    // Status toggle is handled by inline onclick
    
    // No additional event listeners needed as most are handled inline
}

// Global Functions (called from HTML)
window.toggleStatus = function() {
    const statusBadge = document.getElementById('statusBadge');
    const statusText = document.getElementById('statusText');
    
    if (statusText.textContent === 'Online') {
        statusText.textContent = 'Offline';
        statusBadge.classList.add('offline');
        state.status = 'offline';
    } else if (statusText.textContent === 'Offline') {
        statusText.textContent = 'Online';
        statusBadge.classList.remove('offline');
        statusBadge.classList.remove('busy');
        state.status = 'online';
    }
    
    if (window.haptic) window.haptic('light');
};

window.scanQRCode = function() {
    showNotification('QR Scanner will open camera (coming soon)', 'info');
};

window.callSupport = function() {
    window.location.href = 'tel:+254700123456';
};

window.viewHotspots = function() {
    showNotification('High demand areas: Westlands, CBD, Kilimani', 'info');
};

window.toggleBreak = function() {
    const statusBadge = document.getElementById('statusBadge');
    const statusText = document.getElementById('statusText');
    
    if (statusText.textContent === 'Online') {
        statusText.textContent = 'On Break';
        statusBadge.classList.add('busy');
        showNotification('Break started. Take your time!', 'info');
    } else {
        statusText.textContent = 'Online';
        statusBadge.classList.remove('busy');
        showNotification('Welcome back! You\'re online again.', 'info');
    }
};

window.showNotifications = function() {
    showNotification('No new notifications', 'info');
};

window.showSettings = function() {
    window.switchPage('profile');
};

window.showSupport = function() {
    window.location.href = 'tel:+254700123456';
};

window.logout = function() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.clear();
        window.location.href = './index.html';
    }
};

window.showCommissionDetails = function() {
    if (window.commissionOffsetManager) {
        const debt = window.commissionOffsetManager.commissionDebt;
        showNotification(`Commission balance: KES ${Math.round(debt)}`, 'info');
    }
};

window.showWithdrawalModal = function() {
    // Implemented in bottom nav version
    showNotification('Withdrawal feature coming soon', 'info');
};

window.showPaymentInstructions = function() {
    const cashBalance = elements.cashBalance?.textContent || '0';
    showNotification(`Deposit KES ${cashBalance} via M-Pesa to 247247`, 'info');
};

window.processWithdrawal = function() {
    showNotification('Withdrawal processing...', 'info');
};

window.showEarningsDetails = function() {
    window.switchPage('earnings');
};

window.searchRoutes = function() {
    showNotification('Search feature coming soon', 'info');
};

window.handleFAB = function() {
    const page = window.appState?.currentPage || 'dashboard';
    
    switch(page) {
        case 'dashboard':
            if (state.claimedRoute) {
                window.navigateToRoute();
            } else {
                window.switchPage('routes');
            }
            break;
        case 'routes':
            window.searchRoutes();
            break;
        case 'earnings':
            window.showEarningsDetails();
            break;
        case 'wallet':
            window.showPaymentInstructions();
            break;
        default:
            break;
    }
};

// Haptic feedback
window.haptic = function(type = 'light') {
    if (window.navigator && window.navigator.vibrate) {
        switch(type) {
            case 'light': window.navigator.vibrate(10); break;
            case 'medium': window.navigator.vibrate(30); break;
            case 'heavy': window.navigator.vibrate(50); break;
            case 'success': window.navigator.vibrate([10, 50, 10]); break;
            default: window.navigator.vibrate(10);
        }
    }
};

// Additional Global Functions
window.toggleBreakMode = function() {
    const isOnBreak = state.status === 'break';
    state.status = isOnBreak ? 'online' : 'break';
    
    if (elements.statusBadge) {
        elements.statusBadge.className = `status-badge ${state.status === 'break' ? 'offline' : ''}`;
        elements.statusBadge.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="4"/>
            </svg>
            <span>${state.status === 'break' ? 'On Break' : 'Online'}</span>
        `;
    }
    
    showNotification(
        state.status === 'break' ? 'Break started. Take your time!' : 'Welcome back! You\'re online again.',
        'info'
    );
    
    if (window.haptic) window.haptic('medium');
};

window.viewEarningsDetails = function() {
    showNotification('Detailed analytics coming soon!', 'info');
    console.log('Earnings breakdown:', {
        daily: state.earnings,
        performance: calculatePerformanceMetrics(),
        bonus: calculateDailyBonus()
    });
    if (window.haptic) window.haptic('light');
};

window.showHotZones = function() {
    showNotification('High demand in Westlands and CBD areas!', 'info');
    if (window.haptic) window.haptic('light');
};

window.filterRoutes = function(type) {
    state.currentFilter = type;
    
    document.querySelectorAll('.route-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    displayRoutes();
    if (window.haptic) window.haptic('light');
};

window.verifyCode = async function(type) {
    const codeInput = document.getElementById('codeInput');
    if (!codeInput) {
        console.error('Code input element not found');
        return;
    }
    
    const code = codeInput.value.toUpperCase();
    await verifyStopCode(type, code);
    codeInput.value = '';
};

// Display Commission Status
function displayCommissionStatus() {
    if (!state.commissionTracker) return;
    
    const ui = state.commissionTracker.createCommissionUI();
    
    const existingContainer = document.getElementById('commissionContainer');
    if (existingContainer) {
        existingContainer.remove();
    }
    
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
    
    const existingOverlay = document.getElementById('commissionBlockedOverlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }
    
    const overlay = document.createElement('div');
    overlay.id = 'commissionBlockedOverlay';
    overlay.innerHTML = ui.blockedMessage;
    document.body.appendChild(overlay);
}

// Add Custom Styles
function addCustomStyles() {
    const existingStyle = document.getElementById('custom-styles');
    if (!existingStyle && state.commissionTracker) {
        const style = document.createElement('style');
        style.id = 'custom-styles';
        style.textContent = state.commissionTracker.getCommissionStyles() + `
            /* Additional custom styles */
            .route-stats {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 12px;
                margin-bottom: 12px;
                padding: 12px;
                background: var(--surface-high);
                border-radius: 10px;
                text-align: center;
            }
            
            .route-stats > div {
                font-size: 14px;
                font-weight: 600;
            }
            
            .route-meta {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
                font-size: 13px;
                color: var(--text-secondary);
            }
            
            .route-meta .return-trip {
                color: var(--success);
                font-weight: 600;
            }
            
            .loading-routes {
                text-align: center;
                padding: 60px 20px;
            }
            
            .loading-spinner {
                width: 40px;
                height: 40px;
                border: 3px solid var(--surface-high);
                border-top-color: var(--primary);
                border-radius: 50%;
                margin: 0 auto 20px;
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            
            /* Payment collection styles */
            .payment-info {
                background: var(--warning-light, rgba(255, 159, 10, 0.1));
                border: 2px solid var(--warning);
                border-radius: 12px;
                padding: 16px;
                margin-top: 16px;
            }
            
            .payment-info.paid {
                background: var(--success-light, rgba(52, 199, 89, 0.1));
                border-color: var(--success);
            }
            
            .collect-amount {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            
            .collect-label {
                font-size: 16px;
                font-weight: 600;
                color: var(--text-secondary);
            }
            
            .collect-value {
                font-size: 28px;
                font-weight: 700;
                color: var(--warning);
            }
            
            .payment-note,
            .paid-indicator {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                color: var(--text-secondary);
            }
            
            .note-icon,
            .paid-icon {
                font-size: 18px;
            }
            
            .paid-indicator {
                color: var(--success);
                font-weight: 600;
            }
            
            /* Completion summary styles */
            .route-completion-summary {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.95);
                backdrop-filter: blur(20px);
                z-index: 10001;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                animation: fadeIn 0.3s ease-out;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            .summary-content {
                background: var(--surface-elevated);
                border-radius: 24px;
                padding: 32px;
                max-width: 400px;
                width: 100%;
                text-align: center;
            }
            
            .summary-icon {
                font-size: 64px;
                margin-bottom: 20px;
            }
            
            .summary-content h2 {
                font-size: 28px;
                font-weight: 700;
                margin-bottom: 24px;
                color: var(--text-primary);
            }
            
            .summary-stats {
                display: grid;
                gap: 12px;
                margin-bottom: 24px;
            }
            
            .stat-item {
                background: var(--surface-high);
                border-radius: 12px;
                padding: 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .stat-item.highlight-green {
                background: rgba(52, 199, 89, 0.1);
                border: 2px solid var(--success);
            }
            
            .stat-item.earnings {
                background: rgba(0, 122, 255, 0.1);
                border: 1px solid var(--primary);
            }
            
            .stat-label {
                font-size: 16px;
                color: var(--text-secondary);
            }
            
            .stat-value {
                font-size: 24px;
                font-weight: 700;
                color: var(--text-primary);
            }
            
            .stat-value.cash {
                color: var(--success);
            }
            
            .cash-instruction {
                background: var(--surface-high);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 24px;
                display: flex;
                gap: 12px;
                align-items: center;
            }
            
            .instruction-icon {
                font-size: 24px;
                flex-shrink: 0;
            }
            
            .instruction-text p {
                font-size: 14px;
                color: var(--text-secondary);
                margin: 0;
                text-align: left;
                line-height: 1.5;
            }
            
            .continue-btn {
                width: 100%;
                background: var(--primary);
                color: white;
                border: none;
                border-radius: 12px;
                padding: 16px;
                font-size: 18px;
                font-weight: 700;
                cursor: pointer;
                transition: opacity 0.2s;
            }
            
            .continue-btn:hover {
                opacity: 0.9;
            }
            
            /* Cash reminder styles */
            .cash-collection-reminder {
                background: linear-gradient(135deg, #007AFF, #0051D5);
                padding: 16px 20px;
                margin: 0;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                z-index: 1000;
                transform: translateY(0);
                transition: transform 0.3s ease-out;
            }
            
            body.has-cash-reminder {
                padding-top: 72px;
                transition: padding-top 0.3s ease-out;
            }
            
            .reminder-content {
                display: flex;
                align-items: center;
                gap: 16px;
                max-width: 1200px;
                margin: 0 auto;
            }
            
            .reminder-icon {
                font-size: 28px;
                flex-shrink: 0;
            }
            
            .reminder-text {
                flex: 1;
                color: white;
            }
            
            .reminder-title {
                font-size: 16px;
                font-weight: 700;
                margin-bottom: 4px;
            }
            
            .reminder-details {
                font-size: 14px;
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 8px;
                opacity: 0.95;
            }
            
            .reminder-details strong {
                font-weight: 700;
            }
            
            .separator {
                opacity: 0.6;
            }
            
            .reminder-close {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                border-radius: 50%;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                color: white;
                transition: all 0.2s;
            }
            
            .reminder-close:hover {
                background: rgba(255, 255, 255, 0.3);
            }
            
            /* Payment modal styles */
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
            
            .wallet-balance {
                background: var(--surface-high);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 24px;
                text-align: center;
            }
            
            .balance-label {
                display: block;
                font-size: 14px;
                color: var(--text-secondary);
                margin-bottom: 8px;
            }
            
            .balance-amount {
                font-size: 32px;
                font-weight: 700;
                color: var(--success);
            }
            
            .balance-amount.negative {
                color: var(--danger);
            }
            
            /* Urgent warning styles */
            .urgent-payment-warning {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.95);
                backdrop-filter: blur(20px);
                z-index: 9998;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                animation: fadeIn 0.3s ease-out;
            }
            
            .warning-content {
                background: var(--surface-elevated);
                border-radius: 24px;
                padding: 32px;
                max-width: 400px;
                width: 100%;
                text-align: center;
                border: 2px solid var(--warning);
            }
            
            .warning-icon {
                font-size: 64px;
                margin-bottom: 20px;
            }
            
            .warning-content h2 {
                font-size: 28px;
                margin-bottom: 16px;
            }
            
            .warning-amount {
                font-size: 24px;
                font-weight: 700;
                color: var(--warning);
                margin-bottom: 12px;
            }
            
            .warning-message {
                font-size: 16px;
                color: var(--text-secondary);
                margin-bottom: 24px;
            }
            
            .timer {
                font-size: 20px;
                font-weight: 700;
                color: var(--danger);
                font-family: monospace;
            }
            
            .warning-actions {
                display: grid;
                gap: 12px;
            }
            
            .pay-now-btn {
                width: 100%;
                padding: 16px;
                background: var(--success);
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 18px;
                font-weight: 700;
                cursor: pointer;
            }
            
            .later-btn {
                width: 100%;
                padding: 16px;
                background: var(--surface-high);
                color: var(--text-primary);
                border: none;
                border-radius: 12px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
            }
            
            /* Dev mode badge */
            .dev-mode-badge {
                background: var(--warning);
                color: black;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 700;
                margin-left: 8px;
            }
            
            /* Commission blocked overlay */
            .commission-blocked-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.95);
                backdrop-filter: blur(20px);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            
            .blocked-content {
                background: var(--surface-elevated);
                border-radius: 24px;
                padding: 40px;
                max-width: 400px;
                width: 100%;
                text-align: center;
            }
            
            .blocked-icon {
                font-size: 64px;
                margin-bottom: 20px;
            }
            
            .blocked-content h2 {
                font-size: 28px;
                font-weight: 700;
                margin-bottom: 16px;
            }
            
            .blocked-content p {
                font-size: 16px;
                color: var(--text-secondary);
                margin-bottom: 20px;
            }
            
            .blocked-amount {
                font-size: 20px;
                font-weight: 700;
                color: var(--warning);
                margin-bottom: 24px;
            }
            
            .pay-now-button {
                width: 100%;
                padding: 16px;
                background: var(--primary);
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 18px;
                font-weight: 700;
                cursor: pointer;
                transition: opacity 0.2s;
            }
            
            .pay-now-button:hover {
                opacity: 0.9;
            }
            
            .blocked-help {
                margin-top: 20px;
                font-size: 14px;
                color: var(--text-secondary);
            }
            
            /* Skeleton loading styles */
            .skeleton {
                background: linear-gradient(90deg, var(--surface-elevated) 25%, var(--surface-high) 50%, var(--surface-elevated) 75%);
                background-size: 200% 100%;
                animation: loading 1.5s infinite;
                border-radius: 8px;
            }
            
            @keyframes loading {
                0% {
                    background-position: 200% 0;
                }
                100% {
                    background-position: -200% 0;
                }
            }
            
            .skeleton-card {
                height: 120px;
                margin-bottom: 12px;
            }
        `;
        document.head.appendChild(style);
    }
}

// Debug and Testing Object
window.tumaDebug = {
    state,
    supabaseAPI,
    routeClusterer,
    checkParcels: async () => {
        const parcels = await supabaseAPI.query('parcels', {
            filter: 'status=eq.submitted&rider_id=is.null',
            limit: 10
        });
        console.log('Available parcels:', parcels);
        return parcels;
    },
    checkAllParcels: async () => {
        const parcels = await supabaseAPI.query('parcels', {
            limit: 20
        });
        console.log('All parcels:', parcels);
        console.log('Statuses:', parcels.map(p => ({ id: p.id, status: p.status, rider_id: p.rider_id, customer_choice: p.customer_choice })));
        return parcels;
    },
    resetAuth: () => {
        localStorage.removeItem('tuma_rider_phone');
        localStorage.removeItem('tuma_active_route');
        window.location.reload();
    },
    loadBonuses: async () => {
        await loadActiveBonuses();
        console.log('Active bonuses:', state.activeBonuses);
        displayIncentiveProgress();
    },
    checkRider: () => {
        console.log('Current rider:', state.rider);
        console.log('Rider ID:', state.rider?.id);
        console.log('Rider Name:', state.rider?.rider_name);
        console.log('Is Bobby G:', state.rider?.id === DEV_CONFIG.testRider.id);
    },
    forceLoadBobbyG: async () => {
        console.log('Force loading Bobby G...');
        const success = await loadRiderByPhone(DEV_CONFIG.testRider.phone);
        if (success) {
            console.log('Bobby G loaded successfully:', state.rider);
            await loadEarnings();
            await loadStats();
            await loadAvailableRoutes();
            updateProfileDisplay();
            updateWalletDisplay();
        } else {
            console.log('Failed to load Bobby G');
        }
    },
    getDevConfig: () => {
        console.log('Development Configuration:', DEV_CONFIG);
        console.log(`Commission bypass active: ${DEV_CONFIG.isDevelopment && DEV_CONFIG.bypassCommissionBlock}`);
        return DEV_CONFIG;
    }
};

// Make showNotification globally available
window.showNotification = showNotification;

// DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ Enhanced rider.js loaded successfully!');
    console.log('🔧 Development mode:', DEV_CONFIG.isDevelopment);
    
    if (DEV_CONFIG.isDevelopment) {
        console.log('📱 Loading Bobby G test account...');
    }
    
    const tg = window.Telegram?.WebApp;
    const telegramUser = tg?.initDataUnsafe?.user;
    
    let riderId;
    let riderName;
    
    if (telegramUser?.id) {
        riderId = telegramUser.id;
        riderName = telegramUser.first_name || 'Rider';
        if (DEV_CONFIG.verboseLogging) {
            console.log('Using Telegram user:', riderId);
        }
    } else if (DEV_CONFIG.isDevelopment && DEV_CONFIG.testRider) {
        riderId = DEV_CONFIG.testRider.id;
        riderName = DEV_CONFIG.testRider.name;
        if (DEV_CONFIG.verboseLogging) {
            console.log('Development mode: Will load Bobby G from database');
        }
    } else {
        riderId = `temp-${Date.now()}`;
        riderName = 'Guest Rider';
        if (DEV_CONFIG.verboseLogging) {
            console.log('Generated temporary rider:', riderId);
        }
    }
    
    window.currentRiderId = riderId;
    
    await initialize();
    
    // Log final rider state
    if (DEV_CONFIG.isDevelopment && DEV_CONFIG.verboseLogging) {
        console.log('Final rider state:', {
            id: state.rider?.id,
            name: state.rider?.rider_name,
            phone: state.rider?.phone,
            isBobbyG: state.rider?.id === DEV_CONFIG.testRider.id
        });
    }
});

console.log('✅ rider.js loaded successfully with bottom navigation support!');
console.log('Debug commands available: window.tumaDebug');
console.log('To check Bobby G status: window.tumaDebug.checkRider()');
console.log(`Commission bypass: ${DEV_CONFIG.isDevelopment && DEV_CONFIG.bypassCommissionBlock ? 'ACTIVE' : 'INACTIVE'}`);
