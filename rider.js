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
        peak_hours: {
            morning: { start: 7, end: 10, multiplier: 1.2 },
            evening: { start: 17, end: 20, multiplier: 1.3 }
        }
    }
};

// Supabase Configuration
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

// ─── Initialize Route Clustering ───────────────────────────────────────────

// Initialize clustering instance (TumaRouteClustering should be available from clustering.js)
const routeClusterer = new TumaRouteClustering({
    maxRouteDistance: 25,
    minClusterScore: 50,
    maxPickupRadius: {
        express: 2,
        smart: 3,
        eco: 4
    }
});

// ─── Enhanced Route Manager ────────────────────────────────────────────────

const EnhancedRouteManager = {
    // Group and sequence stops by type
    sequenceStops(parcels) {
        const pickups = [];
        const deliveries = [];
        
        parcels.forEach(parcel => {
            // Handle location data - could be JSONB or separate columns
            let pickupLocation, deliveryLocation;
            
            // Check if using JSONB format
            if (parcel.pickup_location && typeof parcel.pickup_location === 'object') {
                pickupLocation = parcel.pickup_location;
                deliveryLocation = parcel.delivery_location;
            } else if (parcel.pickup_location && typeof parcel.pickup_location === 'string') {
                // Parse string JSONB
                try {
                    pickupLocation = JSON.parse(parcel.pickup_location);
                    deliveryLocation = JSON.parse(parcel.delivery_location);
                } catch (e) {
                    console.error('Error parsing location:', e);
                }
            } else if (parcel.pickup_lat && parcel.pickup_lng) {
                // Use separate lat/lng columns
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
                // Fallback to default locations
                pickupLocation = { lat: -1.2921, lng: 36.8219, address: 'Pickup location' };
                deliveryLocation = { lat: -1.2921, lng: 36.8219, address: 'Delivery location' };
            }
            
            // Create pickup stop
            pickups.push({
                id: `${parcel.id}-pickup`,
                parcelId: parcel.id,
                type: 'pickup',
                address: pickupLocation.address || 'Pickup location',
                location: {
                    lat: pickupLocation.lat || -1.2921,
                    lng: pickupLocation.lng || 36.8219
                },
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
                address: deliveryLocation.address || 'Delivery location',
                location: {
                    lat: deliveryLocation.lat || -1.2921,
                    lng: deliveryLocation.lng || 36.8219
                },
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

        if (this.state.unpaidCommission >= this.config.maxUnpaid) {
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
            percentageUsed: Math.round((this.state.unpaidCommission / this.config.maxUnpaid) * 100)
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
                        <span class="commission-amount">KES ${summary.unpaid} / ${this.config.maxUnpaid}</span>
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
                        <p>You've reached the maximum unpaid commission limit of KES ${this.config.maxUnpaid}.</p>
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
            
            /* Make route cards clickable */
            .route-card:not(.claimed) {
                transition: all 0.3s ease;
            }
            
            .route-card:not(.claimed):hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
                border-color: var(--primary);
            }
            
            .route-card:not(.claimed):active {
                transform: translateY(0);
            }
            
            .route-card.claimed {
                opacity: 0.6;
                background: var(--surface-dim);
            }
            
            /* Prevent button from triggering card click */
            .claim-button {
                position: relative;
                z-index: 2;
            }
            
            /* Urgent payment warning */
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
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
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
    parcelsInPossession: [],
    activeBonuses: [] // Admin-triggered bonuses
};

// ─── DOM Elements ──────────────────────────────────────────────────────────

let elements = {};

function initializeElements() {
    elements = {
        statusBadge: document.getElementById('statusBadge'),
        dailyEarnings: document.getElementById('dailyEarnings'),
        weeklyEarnings: document.getElementById('weeklyEarnings'),
        monthlyEarnings: document.getElementById('monthlyEarnings'),
        totalDeliveries: document.getElementById('totalDeliveries'),
        totalDistance: document.getElementById('totalDistance'),
        riderRating: document.getElementById('riderRating'),
        riderName: document.getElementById('riderName'),
        activeDeliverySection: document.getElementById('activeDeliverySection'),
        currentAddress: document.getElementById('currentAddress'),
        currentParcel: document.getElementById('currentParcel'),
        currentETA: document.getElementById('currentETA'),
        codeInput: document.getElementById('codeInput'),
        routeList: document.getElementById('routeList'),
        mainContent: document.getElementById('mainContent')
    };
}

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

async function loadActiveBonuses() {
    try {
        // Skip for temporary riders
        if (!state.rider || state.rider.id.startsWith('temp-')) {
            state.activeBonuses = [];
            return;
        }
        
        // Load active bonuses from database
        const bonuses = await supabaseAPI.query('rider_bonuses', {
            filter: `rider_id=eq.${state.rider.id}&is_active=eq.true&expires_at=gt.${new Date().toISOString()}`,
            order: 'created_at.desc'
        });
        
        state.activeBonuses = bonuses;
        
        // Also check for global bonuses
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
    
    // Check each active bonus
    state.activeBonuses.forEach(bonus => {
        if (bonus.type === 'delivery_target' && deliveries >= bonus.target_deliveries) {
            applicableBonuses.push(bonus);
        }
    });
    
    // Sort by bonus amount descending and take the highest
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
    
    // Only show if there are active bonuses
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

// ─── Route Completion Handling ─────────────────────────────────────────────

async function checkRouteCompletionStatus() {
    const completionData = localStorage.getItem('tuma_route_completion');
    if (!completionData) return;
    
    try {
        const data = JSON.parse(completionData);
        localStorage.removeItem('tuma_route_completion');
        
        if (data.completed && state.commissionTracker) {
            // Add the commission from the completed route
            const commissionResult = await state.commissionTracker.addDeliveryCommission(
                'route-' + Date.now(),
                data.earnings / 0.7 // Convert rider earnings back to total price
            );
            
            // Update display
            displayCommissionStatus();
            
            // Show appropriate notification based on commission status
            if (commissionResult.isBlocked) {
                showBlockedOverlay();
            } else if (commissionResult.totalUnpaid >= 300) {
                // Show urgent payment warning with timer
                showUrgentPaymentWarning();
            } else if (commissionResult.warningShown) {
                showNotification(
                    `Commission balance: KES ${commissionResult.totalUnpaid}. Please pay soon to avoid restrictions.`,
                    'warning'
                );
            }
            
            // Update earnings display
            await loadEarnings();
            updateEarningsDisplay();
        }
    } catch (error) {
        console.error('Error processing route completion:', error);
    }
}

// Show urgent payment warning
function showUrgentPaymentWarning() {
    const warning = document.createElement('div');
    warning.className = 'urgent-payment-warning';
    warning.innerHTML = `
        <div class="warning-content">
            <div class="warning-icon">⚠️</div>
            <h2>Payment Required</h2>
            <p class="warning-amount">Unpaid Commission: KES ${state.commissionTracker.state.unpaidCommission}</p>
            <p class="warning-message">You have <span class="timer">60:00</span> to pay or your account will be restricted</p>
            <div class="warning-actions">
                <button class="pay-now-btn" onclick="openPaymentModal()">
                    Pay Now
                </button>
                <button class="later-btn" onclick="dismissWarning()">
                    Later
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(warning);
    
    // Start countdown timer
    let timeLeft = 3600; // 60 minutes in seconds
    const timerElement = warning.querySelector('.timer');
    
    const countdown = setInterval(() => {
        timeLeft--;
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(countdown);
            warning.remove();
            showBlockedOverlay();
        }
    }, 1000);
    
    // Store countdown reference
    window.commissionCountdown = countdown;
}

window.dismissWarning = function() {
    document.querySelector('.urgent-payment-warning')?.remove();
    // Countdown continues in background
};

// ─── Display Functions ─────────────────────────────────────────────────────

function updateEarningsDisplay() {
    if (elements.dailyEarnings) elements.dailyEarnings.textContent = Math.round(state.earnings.daily).toLocaleString();
    if (elements.weeklyEarnings) elements.weeklyEarnings.textContent = Math.round(state.earnings.weekly).toLocaleString();
    if (elements.monthlyEarnings) elements.monthlyEarnings.textContent = Math.round(state.earnings.monthly).toLocaleString();
}

function updateStatsDisplay() {
    if (elements.totalDeliveries) elements.totalDeliveries.textContent = state.stats.deliveries;
    if (elements.totalDistance) elements.totalDistance.textContent = state.stats.distance;
    if (elements.riderRating) elements.riderRating.textContent = state.stats.rating;
}

function displayRoutes() {
    const filteredRoutes = state.currentFilter === 'all' 
        ? state.availableRoutes 
        : state.availableRoutes.filter(r => r.type === state.currentFilter);
    
    if (!elements.routeList) return;
    
    // Check if rider already has an active route
    const hasActiveRoute = state.claimedRoute !== null;
    
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
    
    elements.routeList.innerHTML = filteredRoutes.map(route => {
        // Calculate rider earnings (70% of total)
        const riderEarnings = Math.round(route.total_earnings * BUSINESS_CONFIG.commission.rider);
        
        return `
            <div class="route-card ${route.status !== 'available' || hasActiveRoute ? 'claimed' : ''}" 
                 onclick="${route.status === 'available' && !hasActiveRoute ? `claimRoute('${route.id}')` : ''}"
                 style="cursor: ${route.status === 'available' && !hasActiveRoute ? 'pointer' : 'not-allowed'}">
                <div class="route-header">
                    <div class="route-name">${route.name}</div>
                    <div class="route-type ${route.type}">${route.type.toUpperCase()}</div>
                </div>
                
                <div class="route-stats">
                    <div>${route.pickups} parcels</div>
                    <div>${route.distance} km</div>
                    <div>KES ${riderEarnings.toLocaleString()}</div>
                </div>
                
                <div class="route-meta">
                    <span class="time-estimate">~${route.estimatedTime} min</span>
                </div>
                
                <button class="claim-button" type="button" 
                        ${route.status !== 'available' || hasActiveRoute ? 'disabled' : ''}
                        onclick="event.stopPropagation()">
                    ${hasActiveRoute ? 'Route Active' : 
                      route.status === 'available' ? 'Claim Route' : 'Already Claimed'}
                </button>
            </div>
        `;
    }).join('');
}

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

// ─── Core Functions ────────────────────────────────────────────────────────

async function initialize() {
    console.log('Initializing rider dashboard...');
    
    // Initialize DOM elements
    initializeElements();
    
    // Update state reference for menu
    window.state = state;
    
    // Initialize commission tracker
    state.commissionTracker = new CommissionTracker(BUSINESS_CONFIG.commission);
    
    // Check if user is authenticated (optional for now)
    const authenticated = await checkAuthAndLoadRider();
    
    if (!authenticated) {
        // Create a temporary rider for testing
        await createTemporaryRider();
    }
    
    // Update rider name
    if (elements.riderName && state.rider) {
        elements.riderName.textContent = state.rider.rider_name || 'Rider';
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
    
    // Check for route completion
    await checkRouteCompletionStatus();
    
    // Get current location
    getCurrentLocation();
    
    setupEventListeners();
    await loadEarnings();
    await loadStats();
    await loadActiveBonuses();
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

async function createTemporaryRider() {
    // Create a temporary rider ID
    const tempId = 'temp-' + Date.now();
    
    state.rider = {
        id: tempId,
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

async function loadEarnings() {
    try {
        if (!state.rider) return;
        
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
        console.error('Error loading earnings:', error);
        state.earnings = { daily: 0, weekly: 0, monthly: 0 };
        updateEarningsDisplay();
    }
}

async function loadStats() {
    try {
        if (!state.rider) {
            state.stats = { deliveries: 0, distance: 0, rating: 5.0 };
            updateStatsDisplay();
            return;
        }
        
        // For temporary riders, show default stats
        if (state.rider.id.startsWith('temp-')) {
            state.stats = { deliveries: 0, distance: 0, rating: 5.0 };
            updateStatsDisplay();
            return;
        }
        
        state.stats = {
            deliveries: state.rider.completed_deliveries || 0,
            distance: Math.round(state.rider.total_distance || 0),
            rating: state.rider.rating || 5.0
        };
        
        updateStatsDisplay();
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ─── UPDATED ROUTE CREATION WITH CLUSTERING ───────────────────────────────

function createRoutes(parcels) {
    console.log(`Creating routes from ${parcels.length} parcels using advanced clustering...`);
    
    try {
        // Use the clustering algorithm
        const routes = routeClusterer.createOptimizedRoutes(parcels);
        
        // Log results for debugging
        console.log(`Created ${routes.length} optimized routes:`);
        routes.forEach(route => {
            console.log(`- ${route.name}: ${route.pickups} parcels, ${route.distance}km, ` +
                       `KES ${route.total_earnings} (Score: ${route.qualityScore})`);
        });
        
        // Return routes or demo routes if none created
        return routes.length > 0 ? routes : createDemoRoutes();
        
    } catch (error) {
        console.error('Error creating routes:', error);
        return createDemoRoutes();
    }
}

async function loadAvailableRoutes() {
    try {
        console.log('Loading available routes...');
        
        // Show loading state
        if (elements.routeList) {
            elements.routeList.innerHTML = `
                <div class="loading-routes">
                    <div class="loading-spinner"></div>
                    <p>Finding best routes for you...</p>
                </div>
            `;
        }
        
        // Fetch unclaimed parcels
        const unclaimedParcels = await supabaseAPI.query('parcels', {
            filter: 'status=eq.submitted&rider_id=is.null',
            limit: 100,
            order: 'created_at.asc'
        });
        
        console.log('Unclaimed parcels found:', unclaimedParcels.length);
        
        if (unclaimedParcels.length === 0) {
            console.log('No unclaimed parcels found');
            state.availableRoutes = createDemoRoutes();
        } else {
            // Create optimized routes using clustering
            state.availableRoutes = createRoutes(unclaimedParcels);
        }
        
        displayRoutes();
        
    } catch (error) {
        console.error('Error loading routes:', error);
        state.availableRoutes = createDemoRoutes();
        displayRoutes();
    }
}

function createDemoRoutes() {
    console.log('Creating demo routes for testing...');
    const demoTotalEarnings = [2500, 1714, 3429]; // These are total earnings
    
    return [
        {
            id: 'demo-route-001',
            name: 'Westlands → North',
            type: 'smart',
            deliveries: 5,
            pickups: 5,
            distance: 12,
            total_earnings: demoTotalEarnings[0], // Will show as KES 1,750 (70%)
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
            name: 'CBD → Eastlands',
            type: 'express',
            deliveries: 3,
            pickups: 3,
            distance: 8,
            total_earnings: demoTotalEarnings[1], // Will show as KES 1,200 (70%)
            status: 'available',
            parcels: [],
            qualityScore: 82,
            estimatedTime: 35,
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
            total_earnings: demoTotalEarnings[2], // Will show as KES 2,400 (70%)
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

async function checkActiveDeliveries() {
    try {
        // First check if there's a stored active route
        const storedRoute = localStorage.getItem('tuma_active_route');
        if (storedRoute) {
            try {
                state.claimedRoute = JSON.parse(storedRoute);
                
                // Disable all routes if there's an active route
                if (state.availableRoutes) {
                    state.availableRoutes.forEach(r => {
                        r.status = 'claimed';
                    });
                }
                
                showActiveRoute();
                displayRoutes(); // Re-display routes with disabled state
                
                // Show navigation button
                const navButton = document.getElementById('navButton');
                if (navButton) {
                    navButton.style.display = 'flex';
                }
                return;
            } catch (error) {
                console.error('Error parsing stored route:', error);
                localStorage.removeItem('tuma_active_route');
            }
        }
        
        // Skip database check for temporary riders
        if (!state.rider || state.rider.id.startsWith('temp-')) return;
        
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
            
            // Show navigation button
            const navButton = document.getElementById('navButton');
            if (navButton) {
                navButton.style.display = 'flex';
            }
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
    
    // Show the active delivery section
    if (elements.activeDeliverySection) {
        elements.activeDeliverySection.style.display = 'block';
    }
    
    // Show navigation button
    const navButton = document.getElementById('navButton');
    if (navButton) {
        navButton.style.display = 'flex';
        console.log('Navigation button shown');
    }
    
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
    const activeDeliveryCard = elements.activeDeliverySection?.querySelector('.active-delivery');
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

// ─── Event Listeners ───────────────────────────────────────────────────────

function setupEventListeners() {
    if (elements.codeInput) {
        elements.codeInput.addEventListener('input', (e) => {
            let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            e.target.value = value;
        });
    }
    
    if (elements.statusBadge) {
        elements.statusBadge.addEventListener('click', toggleStatus);
    }
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
    
    // Only update database for non-temporary riders
    if (state.rider && !state.rider.id.startsWith('temp-')) {
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
    // Prevent any default form submission
    if (window.event) {
        window.event.preventDefault();
        window.event.stopPropagation();
    }
    
    // Check if already has an active route
    if (state.claimedRoute) {
        showNotification('You already have an active route!', 'warning');
        return;
    }
    
    const route = state.availableRoutes.find(r => r.id === routeId);
    if (!route || route.status !== 'available') return;
    
    if (state.isLoading) return;
    state.isLoading = true;
    
    try {
        // The route now includes parcelDetails with full parcel data
        if (route.parcelDetails && route.parcelDetails.length > 0) {
            // Update parcels in database (skip for temporary riders)
            if (!state.rider.id.startsWith('temp-')) {
                for (const parcel of route.parcelDetails) {
                    await supabaseAPI.update('parcels', 
                        `id=eq.${parcel.id}`,
                        { 
                            rider_id: state.rider.id,
                            status: 'assigned',
                            assigned_at: new Date().toISOString()
                        }
                    );
                }
            }
            
            // Create route with sequenced stops
            state.claimedRoute = {
                ...route,
                parcels: route.parcelDetails,
                stops: EnhancedRouteManager.sequenceStops(route.parcelDetails)
            };
            
            // Use the optimized pickup sequence from metadata
            if (route.metadata?.pickupSequence) {
                // Reorder stops according to optimized sequence
                const optimizedStops = [];
                const deliveryStops = [];
                
                // First add pickups in optimized order
                route.metadata.pickupSequence.forEach(parcelId => {
                    const pickupStop = state.claimedRoute.stops.find(s => 
                        s.parcelId === parcelId && s.type === 'pickup'
                    );
                    if (pickupStop) optimizedStops.push(pickupStop);
                });
                
                // Then add all deliveries
                state.claimedRoute.stops.forEach(stop => {
                    if (stop.type === 'delivery') {
                        deliveryStops.push(stop);
                    }
                });
                
                // Optimize delivery order
                state.claimedRoute.stops = [...optimizedStops, ...deliveryStops];
            }
            
            localStorage.setItem('tuma_active_route', JSON.stringify(state.claimedRoute));
            showActiveRoute();
            
            // Show navigation button
            const navButton = document.getElementById('navButton');
            if (navButton) navButton.style.display = 'flex';
        } else if (route.parcels && route.parcels.length > 0) {
            // Fallback for routes without parcelDetails
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
            if (!state.rider.id.startsWith('temp-')) {
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
            }
            
            state.claimedRoute = {
                ...route,
                parcels: flatParcels,
                stops: EnhancedRouteManager.sequenceStops(flatParcels)
            };
            
            localStorage.setItem('tuma_active_route', JSON.stringify(state.claimedRoute));
            showActiveRoute();
            
            const navButton = document.getElementById('navButton');
            if (navButton) navButton.style.display = 'flex';
        }
        
        // Mark all routes as unavailable
        state.availableRoutes.forEach(r => r.status = 'claimed');
        displayRoutes();
        
        const pickupAreas = route.metadata?.pickupAreas?.join(', ') || 'Multiple areas';
        showNotification(
            `Route claimed! ${route.pickups} pickups in ${pickupAreas}`, 
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
            
            // Update parcel status in database (skip for temporary riders)
            if (!state.rider.id.startsWith('temp-')) {
                await supabaseAPI.update('parcels',
                    `id=eq.${activeStop.parcelId}`,
                    {
                        status: type === 'pickup' ? 'picked' : 'delivered',
                        [`${type}_timestamp`]: activeStop.timestamp.toISOString()
                    }
                );
            }
            
            // Handle commission for deliveries
            if (type === 'delivery') {
                // Find the parcel
                let deliveryPrice = 0;
                
                if (state.claimedRoute.parcels && state.claimedRoute.parcels.length > 0) {
                    const parcel = state.claimedRoute.parcels.find(p => p.id === activeStop.parcelId);
                    deliveryPrice = parcel?.price || 500; // Default price if not found
                } else {
                    // Default price for routes without parcel data
                    deliveryPrice = 500;
                }
                
                // Always update commission tracker
                if (state.commissionTracker) {
                    const commissionResult = await state.commissionTracker.addDeliveryCommission(
                        activeStop.parcelId,
                        deliveryPrice
                    );
                    
                    // Update database (skip for temporary riders)
                    if (!state.rider.id.startsWith('temp-')) {
                        await supabaseAPI.update('riders',
                            `id=eq.${state.rider.id}`,
                            {
                                unpaid_commission: commissionResult.totalUnpaid,
                                is_commission_blocked: commissionResult.isBlocked
                            }
                        );
                    }
                    
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
                const riderPayout = deliveryPrice * BUSINESS_CONFIG.commission.rider;
                state.earnings.daily += riderPayout;
                state.stats.deliveries++;
                
                updateEarningsDisplay();
                updateStatsDisplay();
                displayIncentiveProgress();
            }
            
            // Update stored route
            localStorage.setItem('tuma_active_route', JSON.stringify(state.claimedRoute));
            
            elements.codeInput.value = '';
            showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} verified successfully!`, 'success');
            
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
                
                // Hide navigation button
                const navButton = document.getElementById('navButton');
                if (navButton) navButton.style.display = 'none';
                
                // Clear stored route
                localStorage.removeItem('tuma_active_route');
                
                showNotification('🎉 Route completed! Great work!', 'success');
                await loadAvailableRoutes();
            }
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
    
    // Add payment modal styles if not already present
    const existingStyle = document.getElementById('payment-modal-styles');
    if (!existingStyle) {
        const style = document.createElement('style');
        style.id = 'payment-modal-styles';
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
        `;
        document.head.appendChild(style);
    }
    
    haptic('light');
};

window.viewCommissionDetails = function() {
    const summary = state.commissionTracker.getSummary();
    
    showNotification(
        `Commission Details: KES ${summary.unpaid} unpaid from ${summary.pendingCount} deliveries`,
        'info'
    );
    
    console.log('Commission details:', {
        unpaid: summary.unpaid,
        totalPaid: summary.totalPaid,
        pendingCount: summary.pendingCount,
        percentageUsed: summary.percentageUsed,
        isBlocked: summary.isBlocked
    });
    
    haptic('light');
};

window.closePaymentModal = function() {
    const modal = document.querySelector('.payment-modal');
    if (modal) {
        modal.remove();
    }
};

window.goBack = function() {
    // Clear any active route data if needed
    if (window.location.pathname.includes('route.html')) {
        // Navigate back to rider dashboard
        window.location.href = './rider.html';
    } else {
        // General back navigation
        window.history.back();
    }
};

// ─── Custom Styles Function ────────────────────────────────────────────────

function addCustomStyles() {
    const existingStyle = document.getElementById('custom-styles');
    if (!existingStyle && state.commissionTracker) {
        const style = document.createElement('style');
        style.id = 'custom-styles';
        style.textContent = state.commissionTracker.getCommissionStyles() + `
            /* Additional styles for route cards */
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
        `;
        document.head.appendChild(style);
    }
}

// ─── Debug and Testing Functions ───────────────────────────────────────────

window.testClustering = async function() {
    // Fetch some parcels
    const parcels = await supabaseAPI.query('parcels', {
        filter: 'status=eq.submitted&rider_id=is.null',
        limit: 20
    });
    
    console.log('Test parcels:', parcels);
    
    // Test clustering
    const routes = routeClusterer.createOptimizedRoutes(parcels);
    
    console.log('Generated routes:', routes);
    
    // Analyze quality
    routes.forEach(route => {
        console.log(`\nRoute: ${route.name}`);
        console.log(`Quality Score: ${route.qualityScore}`);
        console.log(`Pickup Areas: ${route.metadata.pickupAreas.join(', ')}`);
        console.log(`Delivery Corridors: ${route.metadata.deliveryCorridors.join(', ')}`);
        console.log(`Distance: ${route.distance}km`);
        console.log(`Earnings: KES ${route.total_earnings}`);
        console.log(`Has Return Trip: ${route.metadata.hasReturnTrip}`);
    });
};

// ─── Initialize on DOM Ready ───────────────────────────────────────────────

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// ─── Export for Debugging ──────────────────────────────────────────────────

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
        console.log('Statuses:', parcels.map(p => ({ id: p.id, status: p.status, rider_id: p.rider_id })));
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
    testBonus: (deliveries, amount) => {
        // Add a test bonus
        state.activeBonuses.push({
            id: 'test-bonus',
            type: 'delivery_target',
            title: 'Test Bonus',
            target_deliveries: deliveries,
            bonus_amount: amount,
            is_active: true,
            expires_at: new Date(Date.now() + 86400000).toISOString()
        });
        displayIncentiveProgress();
    },
    testClustering
};

// Override window.haptic if not already defined
if (!window.haptic) {
    window.haptic = haptic;
}

// Make showNotification globally available
window.showNotification = showNotification;

console.log('✅ rider.js loaded successfully with clustering integration!');
