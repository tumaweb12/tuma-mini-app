/**
 * Complete Rider Dashboard with Multi-Pickup/Delivery Support
 * Includes commission tracking, route optimization, and enhanced features
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
            
            // Create delivery stop
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
                // Payment information
                paymentMethod: parcel.payment_method || 'cash',
                paymentStatus: parcel.payment_status || 'pending',
                amountToCollect: parcel.payment_status === 'pending' ? (parcel.price || 500) : 0
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
            // Skip database initialization for temporary riders
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

        // Check if should block (but respect dev bypass)
        const shouldBlock = this.state.unpaidCommission >= this.config.maxUnpaid;
        const devBypass = DEV_CONFIG.isDevelopment && DEV_CONFIG.bypassCommissionBlock;

        if (shouldBlock && !devBypass) {
            this.state.isBlocked = true;
            result.isBlocked = true;
        } else if (shouldBlock && devBypass) {
            // In dev mode with bypass, show warning but don't block
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
        
        // Show dev mode indicator if bypassing
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
            
            .dev-mode-badge {
                background: #FF9F0A;
                color: black;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 700;
                margin-left: 8px;
                vertical-align: middle;
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
        
        // Don't make API calls for temporary riders
        if (filter && filter.includes('temp-')) {
            console.log('Skipping API call for temporary rider');
            return [];
        }
        
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
            // Log error but don't throw for development
            if (DEV_CONFIG.isDevelopment && DEV_CONFIG.ignoreRiderNotFound) {
                console.log(`API Error (ignored in dev): ${response.status}`);
                return [];
            }
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    },
    
    async insert(table, data) {
        // Skip for temporary riders
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
        // Skip for temporary riders
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
        
        console.log('Processing route completion:', data);
        
        // Wait for page to fully load
        if (document.readyState !== 'complete') {
            await new Promise(resolve => {
                window.addEventListener('load', resolve);
            });
        }
        
        if (data.completed && state.commissionTracker) {
            // Calculate total cash collected from parcels
            let totalCashCollected = 0;
            
            if (data.parcels && data.parcels.length > 0) {
                // Sum up cash from all parcels where payment was pending
                data.parcels.forEach(parcel => {
                    if (parcel.payment_status === 'pending' || !parcel.payment_status) {
                        totalCashCollected += parsePrice(parcel.price || parcel.total_price || 500);
                    }
                });
            } else {
                // Fallback: assume all deliveries were cash on delivery
                totalCashCollected = data.deliveries * 500;
            }
            
            // Show route completion summary if cash was collected
            if (totalCashCollected > 0) {
                // Show the completion summary first
                showRouteCompletionSummary(totalCashCollected, data.earnings, data.deliveries);
                
                // Also show a persistent reminder in the UI after a delay
                setTimeout(() => {
                    showCashCollectionReminder(totalCashCollected);
                }, 1000);
            }
            
            // Calculate commission from the total earnings
            const totalPrice = data.earnings / BUSINESS_CONFIG.commission.rider; // Convert rider earnings to total price
            
            // Add the commission from the completed route
            const commissionResult = await state.commissionTracker.addDeliveryCommission(
                'route-' + Date.now(),
                totalPrice
            );
            
            // Update display
            displayCommissionStatus();
            
            // Show appropriate notification based on commission status
            if (commissionResult.isBlocked && !(DEV_CONFIG.isDevelopment && DEV_CONFIG.bypassCommissionBlock)) {
                showBlockedOverlay();
            } else if (commissionResult.isBlocked && DEV_CONFIG.isDevelopment && DEV_CONFIG.bypassCommissionBlock) {
                // Dev mode - show urgent warning but don't block
                console.warn(`[DEV MODE] Would be blocked. Commission: KES ${commissionResult.totalUnpaid}`);
                showNotification(
                    `DEV MODE: Commission limit exceeded (KES ${commissionResult.totalUnpaid})`,
                    'warning'
                );
            } else if (commissionResult.totalUnpaid >= 300) {
                // Show urgent payment warning with timer
                showUrgentPaymentWarning();
            } else if (commissionResult.warningShown) {
                showNotification(
                    `Account balance: KES ${commissionResult.totalUnpaid}. Please deposit funds soon.`,
                    'warning'
                );
            }
            
            // Update earnings - add the route earnings to daily total
            state.earnings.daily += data.earnings;
            state.stats.deliveries += data.deliveries;
            
            // Update displays
            updateEarningsDisplay();
            updateStatsDisplay();
            
            // Clear any active route state
            state.claimedRoute = null;
            localStorage.removeItem('tuma_active_route');
            
            showNotification(`Route completed! Earned KES ${data.earnings}`, 'success');
        }
    } catch (error) {
        console.error('Error processing route completion:', error);
    }
}

// Helper function to parse price
function parsePrice(priceValue) {
    if (typeof priceValue === 'number') return priceValue;
    if (typeof priceValue === 'string') {
        const cleaned = priceValue.replace(/[^0-9.-]+/g, '');
        return parseFloat(cleaned) || 0;
    }
    return 0;
}

// Show persistent cash collection reminder (REFINED VERSION)
function showCashCollectionReminder(totalCashCollected) {
    // Check if reminder already exists
    if (document.getElementById('cashCollectionReminder')) {
        return;
    }
    
    // Create a persistent reminder banner
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
    
    // Insert at the top of body instead
    document.body.insertBefore(reminderBanner, document.body.firstChild);
    
    // Animate in after a short delay
    setTimeout(() => {
        reminderBanner.style.opacity = '1';
        reminderBanner.style.transition = 'opacity 0.3s ease-in';
    }, 100);
    
    // Add padding to body
    document.body.classList.add('has-cash-reminder');
    
    // Add styles if not present
    if (!document.getElementById('cash-reminder-styles')) {
        const style = document.createElement('style');
        style.id = 'cash-reminder-styles';
        style.textContent = `
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
        `;
        document.head.appendChild(style);
    }
}

window.dismissCashReminder = function() {
    const reminder = document.getElementById('cashCollectionReminder');
    if (reminder) {
        reminder.style.transform = 'translateY(-100%)';
        document.body.classList.remove('has-cash-reminder');
        setTimeout(() => reminder.remove(), 300);
    }
};

// Show urgent payment warning (REFINED VERSION)
function showUrgentPaymentWarning() {
    const warning = document.createElement('div');
    warning.className = 'urgent-payment-warning';
    warning.innerHTML = `
        <div class="warning-content">
            <div class="warning-icon">⚠️</div>
            <h2>Deposit Required</h2>
            <p class="warning-amount">Account Balance: -KES ${state.commissionTracker.state.unpaidCommission}</p>
            <p class="warning-message">You have <span class="timer">60:00</span> to deposit funds or your account will be paused</p>
            <div class="warning-actions">
                <button class="pay-now-btn" onclick="openWalletModal()">
                    Deposit Now
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
            
            // Only show blocked overlay if not in dev bypass mode
            if (!(DEV_CONFIG.isDevelopment && DEV_CONFIG.bypassCommissionBlock)) {
                showBlockedOverlay();
            } else {
                console.warn('[DEV MODE] Timer expired but blocking bypassed');
                showNotification('DEV MODE: Would be blocked now', 'warning');
            }
        }
    }, 1000);
    
    // Store countdown reference
    window.commissionCountdown = countdown;
}

window.dismissWarning = function() {
    document.querySelector('.urgent-payment-warning')?.remove();
    // Countdown continues in background
};

// Show route completion summary (REFINED VERSION)
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
    
    // Add styles if not present
    if (!document.getElementById('completion-summary-styles')) {
        const style = document.createElement('style');
        style.id = 'completion-summary-styles';
        style.textContent = `
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
        `;
        document.head.appendChild(style);
    }
}

window.closeCompletionSummary = function() {
    const summary = document.querySelector('.route-completion-summary');
    if (summary) {
        summary.remove();
    }
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
        
        // Generate a unique function name for each route to avoid conflicts
        const claimFunctionName = `claimRoute_${route.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        // Store the claim function on window
        window[claimFunctionName] = function() {
            claimRoute(route.id);
        };
        
        // Determine route icon based on type
        const routeIcon = route.type === 'express' ? '⚡' : route.type === 'eco' ? '🌿' : '📦';
        
        return `
            <div class="route-card ${route.status !== 'available' || hasActiveRoute ? 'claimed' : ''}">
                <div class="route-header">
                    <div class="route-name">${routeIcon} ${route.name}</div>
                    <div class="route-type ${route.type}">${route.type.toUpperCase()}</div>
                </div>
                
                <div class="route-stats">
                    <div>${route.pickups} parcel${route.pickups > 1 ? 's' : ''}</div>
                    <div>${route.distance} km</div>
                    <div>KES ${riderEarnings.toLocaleString()}</div>
                </div>
                
                <div class="route-meta">
                    <span class="time-estimate">~${route.estimatedTime} min</span>
                    ${route.metadata?.hasReturnTrip ? '<span class="return-trip">↩️ Return trip</span>' : ''}
                </div>
                
                <button type="button" class="claim-button" 
                        ${route.status !== 'available' || hasActiveRoute ? 'disabled' : ''}
                        onclick="${claimFunctionName}()">
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
    
    // Clear any stale route data if page was refreshed
    const storedRoute = localStorage.getItem('tuma_active_route');
    if (storedRoute) {
        try {
            const route = JSON.parse(storedRoute);
            // Check if route is older than 24 hours
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
            
            // Check if blocked (but respect dev bypass)
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
    // Use the test rider configuration if in development
    const tempId = DEV_CONFIG.isDevelopment && DEV_CONFIG.testRider ? 
        DEV_CONFIG.testRider.id : 
        'temp-' + Date.now();
    
    state.rider = {
        id: tempId,
        rider_name: DEV_CONFIG.isDevelopment && DEV_CONFIG.testRider ? 
            DEV_CONFIG.testRider.name : 
            'Test Rider',
        phone: DEV_CONFIG.isDevelopment && DEV_CONFIG.testRider ? 
            DEV_CONFIG.testRider.phone : 
            '0700000000',
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
        
        // Use default values for temporary riders
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
            // Use default values
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
        
        // Fetch ALL unclaimed parcels (increased limit)
        const unclaimedParcels = await supabaseAPI.query('parcels', {
            filter: 'status=eq.submitted&rider_id=is.null',
            limit: 1000, // Increased limit to get all parcels
            order: 'created_at.asc'
        });
        
        console.log(`Found ${unclaimedParcels.length} unclaimed parcels`);
        
        if (unclaimedParcels.length === 0) {
            // If no unclaimed parcels, check if there are any parcels at all
            const allParcels = await supabaseAPI.query('parcels', {
                limit: 100
            });
            
            console.log('Total parcels in database:', allParcels.length);
            
            if (allParcels.length > 0) {
                // Show why parcels aren't available
                const statuses = {};
                allParcels.forEach(p => {
                    statuses[p.status] = (statuses[p.status] || 0) + 1;
                });
                console.log('Parcel statuses:', statuses);
                
                // Check service types
                const serviceTypes = {};
                allParcels.forEach(p => {
                    const type = p.customer_choice || 'unknown';
                    serviceTypes[type] = (serviceTypes[type] || 0) + 1;
                });
                console.log('Service types:', serviceTypes);
            }
            
            state.availableRoutes = createDemoRoutes();
        } else {
            // Log service type distribution
            const typeDistribution = {};
            unclaimedParcels.forEach(p => {
                const type = p.customer_choice || 'smart';
                typeDistribution[type] = (typeDistribution[type] || 0) + 1;
            });
            console.log('Unclaimed parcels by type:', typeDistribution);
            
            // Create optimized routes using clustering
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

function createDemoRoutes() {
    console.log('Creating demo routes for testing...');
    const demoTotalEarnings = [2500, 1714, 3429]; // These are total earnings
    
    // Demo routes with specific Nairobi landmarks
    return [
        {
            id: 'demo-route-001',
            name: 'Sarit Centre → Village Market',
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
            name: 'CBD → Eastlands Express',
            type: 'express',
            deliveries: 1,
            pickups: 1,
            distance: 8,
            total_earnings: demoTotalEarnings[1], // Will show as KES 1,200 (70%)
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
                const route = JSON.parse(storedRoute);
                console.log('Found stored route:', route);
                
                // Check if all stops are completed
                const allStopsCompleted = route.stops && route.stops.every(s => s.completed);
                
                if (allStopsCompleted) {
                    console.log('All stops completed - clearing route');
                    localStorage.removeItem('tuma_active_route');
                    state.claimedRoute = null;
                    
                    // Hide navigation button
                    const navButton = document.getElementById('navButton');
                    if (navButton) navButton.style.display = 'none';
                    
                    // Hide active delivery section
                    if (elements.activeDeliverySection) {
                        elements.activeDeliverySection.style.display = 'none';
                    }
                    
                    return; // No active route
                }
                
                state.claimedRoute = route;
                
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
                state.claimedRoute = null;
            }
        }
        
        // Skip database check for temporary riders
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
            
            // Show navigation button
            const navButton = document.getElementById('navButton');
            if (navButton) {
                navButton.style.display = 'flex';
            }
        } else {
            console.log('No active parcels found');
            state.claimedRoute = null;
        }
        
    } catch (error) {
        console.error('Error checking active deliveries:', error);
        state.claimedRoute = null;
    }
}

function showActiveRoute() {
    if (!state.claimedRoute) return;
    
    // Check if all stops are completed
    const allComplete = state.claimedRoute.stops && state.claimedRoute.stops.every(s => s.completed);
    if (allComplete) {
        console.log('All stops completed - route should be cleared');
        // Clear the route if all stops are complete
        state.claimedRoute = null;
        localStorage.removeItem('tuma_active_route');
        
        // Hide active delivery section
        if (elements.activeDeliverySection) {
            elements.activeDeliverySection.style.display = 'none';
        }
        
        // Hide navigation button
        const navButton = document.getElementById('navButton');
        if (navButton) {
            navButton.style.display = 'none';
        }
        
        return;
    }
    
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
    
    // Extract meaningful location name from address
    const getLocationName = (address) => {
        if (!address || address === 'Pickup location' || address === 'Delivery location') {
            return address;
        }
        
        // Try to extract the most meaningful part
        const patterns = [
            /^([^,]+),/, // First part before comma
            /^(.+?)(?:\s+Road|\s+Street|\s+Avenue|\s+Drive)/i, // Before road/street
            /^(.+?)(?:\s+Mall|\s+Centre|\s+Center|\s+Plaza)/i // Landmarks
        ];
        
        for (const pattern of patterns) {
            const match = address.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        
        return address.split(',')[0].trim();
    };
    
    const stopLocationName = getLocationName(nextStop.address);
    
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
            <div class="stop-address">${stopLocationName}</div>
            <div class="stop-details">
                <span>Code: ${nextStop.parcelCode}</span>
                <span>Customer: ${nextStop.customerName}</span>
            </div>
            
            ${nextStop.type === 'delivery' && nextStop.amountToCollect > 0 ? `
                <div class="payment-info">
                    <div class="collect-amount">
                        <span class="collect-label">Collect Cash:</span>
                        <span class="collect-value">KES ${nextStop.amountToCollect.toLocaleString()}</span>
                    </div>
                    <div class="payment-note">
                        <span class="note-icon">💵</span>
                        <span>Customer pays on delivery</span>
                    </div>
                </div>
            ` : nextStop.type === 'delivery' && nextStop.paymentStatus === 'paid' ? `
                <div class="payment-info paid">
                    <div class="paid-indicator">
                        <span class="paid-icon">✅</span>
                        <span>Already paid - No collection needed</span>
                    </div>
                </div>
            ` : ''}
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
    // Code input formatting
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
    console.log('claimRoute called with ID:', routeId);
    
    // Prevent any default behavior
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
    console.log('Found route:', route);
    
    if (!route || route.status !== 'available') {
        showNotification('This route is not available', 'warning');
        return;
    }
    
    if (state.isLoading) return;
    state.isLoading = true;
    
    // Show loading notification
    showNotification('Claiming route...', 'info');
    
    try {
        // Debug log
        console.log('Claiming route:', route);
        console.log('Route has parcelDetails:', route.parcelDetails);
        
        // The route now includes parcelDetails with full parcel data
        if (route.parcelDetails && route.parcelDetails.length > 0) {
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
            
            // Store in localStorage
            localStorage.setItem('tuma_active_route', JSON.stringify(state.claimedRoute));
            
            // Update UI
            showActiveRoute();
            
            // Show navigation button
            const navButton = document.getElementById('navButton');
            if (navButton) navButton.style.display = 'flex';
            
            // Mark all routes as unavailable
            state.availableRoutes.forEach(r => r.status = 'claimed');
            displayRoutes();
            
            const pickupAreas = route.metadata?.pickupAreas?.join(', ') || 'Multiple areas';
            showNotification(
                `Route claimed successfully! ${route.pickups} pickup${route.pickups > 1 ? 's' : ''} in ${pickupAreas}`, 
                'success'
            );
            
            // Update database for non-demo routes
            if (!route.id.startsWith('demo-') && !state.rider.id.startsWith('temp-')) {
                try {
                    for (const parcel of route.parcelDetails) {
                        await supabaseAPI.update('parcels', 
                            `id=eq.${parcel.id}`,
                            { 
                                rider_id: state.rider.id,
                                status: 'route_assigned', // Changed from 'assigned' to 'route_assigned'
                                assigned_at: new Date().toISOString()
                            }
                        );
                    }
                } catch (dbError) {
                    console.error('Error updating database:', dbError);
                    // Continue anyway - route is already claimed locally
                }
            }
            
            haptic('success');
        } else {
            throw new Error('Route has no parcel details');
        }
        
    } catch (error) {
        console.error('Error claiming route:', error);
        showNotification('Failed to claim route. Please try again.', 'error');
        
        // Clear any partially saved state
        localStorage.removeItem('tuma_active_route');
        state.claimedRoute = null;
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
            let dbError = null; // Define dbError in outer scope
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
                    dbError = error; // Store the error
                    console.error('Database update error:', error);
                    
                    // If it's the agent_notifications trigger error, continue anyway
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
                        // Don't throw - continue with local state update
                    } else {
                        // For other errors, still continue but warn
                        console.error('Unexpected database error:', error);
                        showNotification(
                            `${type.charAt(0).toUpperCase() + type.slice(1)} recorded locally. Sync pending.`, 
                            'warning'
                        );
                    }
                }
            }
            
            // Handle commission for deliveries
            if (type === 'delivery') {
                // Check if rider needs to collect payment
                if (activeStop.amountToCollect > 0) {
                    // Show payment collection reminder
                    showNotification(
                        `Remember to collect KES ${activeStop.amountToCollect.toLocaleString()} from ${activeStop.customerName}`,
                        'warning'
                    );
                }
                
                // Find the parcel
                let deliveryPrice = 0;
                
                if (state.claimedRoute.parcels && state.claimedRoute.parcels.length > 0) {
                    const parcel = state.claimedRoute.parcels.find(p => p.id === activeStop.parcelId);
                    deliveryPrice = parcel?.price || 500; // Default price if not found
                } else {
                    // Default price for routes without parcel data
                    deliveryPrice = 500;
                }
                
                // Update commission tracker
                if (state.commissionTracker) {
                    const commissionResult = await state.commissionTracker.addDeliveryCommission(
                        activeStop.parcelId,
                        deliveryPrice
                    );
                    
                    // Update database (skip for temporary riders)
                    if (!state.rider.id.startsWith('temp-')) {
                        try {
                            await supabaseAPI.update('riders',
                                `id=eq.${state.rider.id}`,
                                {
                                    unpaid_commission: commissionResult.totalUnpaid,
                                    is_commission_blocked: commissionResult.isBlocked
                                }
                            );
                        } catch (riderUpdateError) {
                            console.error('Error updating rider commission:', riderUpdateError);
                            // Continue anyway - commission is tracked locally
                        }
                    }
                    
                    displayCommissionStatus();
                    
                    // Check blocking with dev bypass
                    const devBypass = DEV_CONFIG.isDevelopment && DEV_CONFIG.bypassCommissionBlock;
                    
                    if (commissionResult.isBlocked && !devBypass) {
                        showBlockedOverlay();
                        return;
                    } else if (commissionResult.isBlocked && devBypass) {
                        console.warn('[DEV MODE] Commission block bypassed after delivery');
                        showNotification(
                            `DEV MODE: Would be blocked (KES ${commissionResult.totalUnpaid})`,
                            'warning'
                        );
                    } else if (commissionResult.warningShown) {
                        showNotification(
                            `Account balance: KES ${commissionResult.totalUnpaid}. Please deposit funds soon.`,
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
            
            // Show success notification if not already shown
            if (!dbError || !dbError.message?.includes('agent_notifications')) {
                showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} verified successfully!`, 'success');
            }
            
            // Check if route is complete BEFORE updating UI
            const allComplete = state.claimedRoute.stops.every(s => s.completed);
            if (allComplete) {
                // Calculate total collected and earnings
                const deliveryStops = state.claimedRoute.stops.filter(s => s.type === 'delivery');
                const totalCollected = deliveryStops.reduce((sum, stop) => sum + (stop.amountToCollect || 0), 0);
                
                // Calculate total earnings for the route
                let totalEarnings = 0;
                if (state.claimedRoute.total_earnings) {
                    totalEarnings = state.claimedRoute.total_earnings * BUSINESS_CONFIG.commission.rider;
                } else if (state.claimedRoute.parcels) {
                    // Calculate from parcels
                    totalEarnings = state.claimedRoute.parcels.reduce((sum, p) => 
                        sum + ((p.price || 500) * BUSINESS_CONFIG.commission.rider), 0
                    );
                } else {
                    // Default earnings
                    totalEarnings = state.claimedRoute.stops.filter(s => s.type === 'delivery').length * 350;
                }
                
                // Show route completion summary if cash was collected
                if (totalCollected > 0) {
                    showRouteCompletionSummary(totalCollected, totalEarnings, deliveryStops.length);
                }
                
                // Store completion data for commission tracking
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
                
                // Clear active route state
                elements.activeDeliverySection.style.display = 'none';
                state.claimedRoute = null;
                
                // Hide navigation button
                const navButton = document.getElementById('navButton');
                if (navButton) navButton.style.display = 'none';
                
                // Clear stored route
                localStorage.removeItem('tuma_active_route');
                
                // Force update available routes to re-enable them
                state.availableRoutes.forEach(route => {
                    route.status = 'available';
                });
                
                showNotification('🎉 Route completed! Great work!', 'success');
                
                // Reload available routes
                await loadAvailableRoutes();
                
                // Process the completion data
                await checkRouteCompletionStatus();
            } else {
                // Only update UI if route is not complete
                showActiveRoute();
                
                // Check if entering delivery phase
                const pickups = state.claimedRoute.stops.filter(s => s.type === 'pickup');
                const allPickupsComplete = pickups.every(p => p.completed);
                
                if (allPickupsComplete && type === 'pickup') {
                    showNotification('All pickups complete! Starting delivery phase 🚀', 'success');
                }
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

// New wallet modal (replaces payment modal) - REFINED VERSION
window.openWalletModal = function() {
    const summary = state.commissionTracker.getSummary();
    
    const modal = document.createElement('div');
    modal.className = 'payment-modal';
    modal.innerHTML = `
        <div class="payment-content">
            <h2>Deposit to Wallet</h2>
            <div class="wallet-balance">
                <span class="balance-label">Current Balance</span>
                <span class="balance-amount ${summary.unpaid > 0 ? 'negative' : ''}">
                    ${summary.unpaid > 0 ? '-' : ''}KES ${Math.abs(summary.unpaid)}
                </span>
            </div>
            
            <div class="deposit-options">
                <h3>Deposit Options:</h3>
                
                <div class="deposit-method">
                    <div class="method-header">
                        <span class="method-icon">💵</span>
                        <span class="method-name">Cash Deposit</span>
                    </div>
                    <p class="method-description">
                        Deposit collected cash at any Tuma agent location
                    </p>
                    <button class="method-button" onclick="showAgentLocations()">
                        Find Agents Near You
                    </button>
                </div>
                
                <div class="deposit-method">
                    <div class="method-header">
                        <span class="method-icon">📱</span>
                        <span class="method-name">M-Pesa</span>
                    </div>
                    <div class="mpesa-instructions">
                        <ol>
                            <li>Go to M-Pesa</li>
                            <li>Select "Lipa na M-Pesa" > "Pay Bill"</li>
                            <li>Business Number: <strong>247247</strong></li>
                            <li>Account: <strong>${state.rider.phone}</strong></li>
                            <li>Amount: <strong>${summary.unpaid}</strong></li>
                        </ol>
                    </div>
                </div>
            </div>
            
            <button class="modal-close" onclick="closeWalletModal()">Close</button>
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
            
            .deposit-options {
                margin-bottom: 24px;
            }
            
            .deposit-options h3 {
                font-size: 16px;
                margin-bottom: 16px;
                color: var(--text-secondary);
            }
            
            .deposit-method {
                background: var(--surface-high);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 12px;
            }
            
            .method-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 8px;
            }
            
            .method-icon {
                font-size: 24px;
            }
            
            .method-name {
                font-size: 18px;
                font-weight: 600;
            }
            
            .method-description {
                color: var(--text-secondary);
                font-size: 14px;
                margin-bottom: 12px;
                line-height: 1.5;
            }
            
            .method-button {
                width: 100%;
                background: var(--primary);
                color: white;
                border: none;
                border-radius: 8px;
                padding: 10px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            }
            
            .mpesa-instructions {
                background: var(--surface);
                border-radius: 8px;
                padding: 12px;
                margin-top: 12px;
            }
            
            .mpesa-instructions ol {
                margin: 0;
                padding-left: 20px;
                color: var(--text-secondary);
                font-size: 14px;
            }
            
            .mpesa-instructions li {
                margin-bottom: 6px;
            }
            
            .mpesa-instructions strong {
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

window.viewAccountDetails = function() {
    const summary = state.commissionTracker.getSummary();
    
    showNotification(
        `Wallet Balance: ${summary.unpaid > 0 ? '-' : ''}KES ${Math.abs(summary.unpaid)}`,
        'info'
    );
    
    console.log('Account details:', {
        unpaid: summary.unpaid,
        totalPaid: summary.totalPaid,
        pendingCount: summary.pendingCount,
        percentageUsed: summary.percentageUsed,
        isBlocked: summary.isBlocked
    });
    
    haptic('light');
};

window.closeWalletModal = function() {
    const modal = document.querySelector('.payment-modal');
    if (modal) {
        modal.remove();
    }
};

window.showAgentLocations = function() {
    showNotification('Opening agent locations...', 'info');
    // In production, this would show a map or list of nearby agents
    haptic('light');
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
            
            /* Active route info styles */
            .active-route-info {
                margin-bottom: 16px;
            }
            
            .route-progress-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
                font-size: 14px;
            }
            
            .progress-label {
                color: var(--text-secondary);
                font-weight: 600;
            }
            
            .progress-stats {
                color: var(--text-primary);
                font-weight: 700;
            }
            
            .route-progress-bar {
                height: 6px;
                background: var(--surface-high);
                border-radius: 3px;
                overflow: hidden;
            }
            
            .progress-fill {
                height: 100%;
                background: var(--primary);
                border-radius: 3px;
                transition: width 0.3s ease;
            }
            
            .carrying-indicator {
                background: var(--primary-light, rgba(0, 122, 255, 0.1));
                border: 1px solid var(--primary);
                border-radius: 8px;
                padding: 8px 12px;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                font-weight: 600;
                color: var(--primary);
                margin-bottom: 16px;
            }
            
            .carrying-icon {
                font-size: 18px;
            }
            
            .next-stop-info {
                background: var(--surface-high);
                border-radius: 12px;
                padding: 16px;
            }
            
            .stop-type-badge {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 700;
                text-transform: uppercase;
                margin-bottom: 12px;
            }
            
            .stop-type-badge.pickup {
                background: var(--primary-light, rgba(0, 122, 255, 0.1));
                color: var(--primary);
            }
            
            .stop-type-badge.delivery {
                background: var(--success-light, rgba(52, 199, 89, 0.1));
                color: var(--success);
            }
            
            .stop-address {
                font-size: 18px;
                font-weight: 700;
                color: var(--text-primary);
                margin-bottom: 8px;
                line-height: 1.3;
            }
            
            .stop-details {
                display: flex;
                gap: 16px;
                font-size: 14px;
                color: var(--text-secondary);
            }
            
            .stop-details span {
                display: flex;
                align-items: center;
                gap: 4px;
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

document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ rider.js loaded successfully with clustering integration!');
    
    // Initialize Telegram WebApp
    const tg = window.Telegram?.WebApp;
    const telegramUser = tg?.initDataUnsafe?.user;
    
    // Determine rider ID based on environment
    let riderId;
    let riderName;
    
    if (telegramUser?.id) {
        // Running in Telegram - use real user
        riderId = telegramUser.id;
        riderName = telegramUser.first_name || 'Rider';
        if (DEV_CONFIG.verboseLogging) {
            console.log('Using Telegram user:', riderId);
        }
    } else if (DEV_CONFIG.isDevelopment && DEV_CONFIG.testRider) {
        // Development mode - use test rider
        riderId = DEV_CONFIG.testRider.id;
        riderName = DEV_CONFIG.testRider.name;
        if (DEV_CONFIG.verboseLogging) {
            console.log('Development mode: Using test rider', riderId);
        }
    } else {
        // Fallback - generate temporary ID
        riderId = `temp-${Date.now()}`;
        riderName = 'Guest Rider';
        if (DEV_CONFIG.verboseLogging) {
            console.log('Generated temporary rider:', riderId);
        }
    }
    
    // Store the rider ID for use in other functions
    window.currentRiderId = riderId;
    
    // Continue with initialization...
    await initialize();
});

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
    testClustering,
    checkParcelStatus: async () => {
        const allParcels = await supabaseAPI.query('parcels', {
            limit: 100
        });
        
        const summary = {
            total: allParcels.length,
            byStatus: {},
            byType: {},
            withRider: 0,
            withoutRider: 0
        };
        
        allParcels.forEach(p => {
            summary.byStatus[p.status] = (summary.byStatus[p.status] || 0) + 1;
            summary.byType[p.customer_choice || 'unknown'] = (summary.byType[p.customer_choice || 'unknown'] || 0) + 1;
            if (p.rider_id) summary.withRider++;
            else summary.withoutRider++;
        });
        
        console.log('Parcel Summary:', summary);
        console.log('Available for clustering:', allParcels.filter(p => 
            p.status === 'submitted' && !p.rider_id
        ));
        
        return summary;
    },
    
    resetParcels: async () => {
        // Reset some parcels to submitted status for testing
        const parcels = await supabaseAPI.query('parcels', {
            filter: 'status=eq.delivered',
            limit: 10
        });
        
        for (const parcel of parcels) {
            await supabaseAPI.update('parcels', 
                `id=eq.${parcel.id}`,
                { 
                    status: 'submitted',
                    rider_id: null,
                    assigned_at: null,
                    pickup_timestamp: null,
                    delivery_timestamp: null
                }
            );
        }
        
        console.log(`Reset ${parcels.length} parcels to submitted status`);
        window.location.reload();
    },
    
    clearStaleRoute: () => {
        localStorage.removeItem('tuma_active_route');
        localStorage.removeItem('tuma_route_completion');
        state.claimedRoute = null;
        console.log('Cleared stored route and completion data');
        window.location.reload();
    },
    
    syncRouteCompletion: async () => {
        // Force process any pending route completion
        await checkRouteCompletionStatus();
        
        // Check if current route is actually complete
        if (state.claimedRoute && state.claimedRoute.stops) {
            const allComplete = state.claimedRoute.stops.every(s => s.completed);
            if (allComplete) {
                console.log('Current route is complete - clearing');
                
                // Calculate earnings
                let totalEarnings = 0;
                if (state.claimedRoute.total_earnings) {
                    totalEarnings = state.claimedRoute.total_earnings * BUSINESS_CONFIG.commission.rider;
                } else if (state.claimedRoute.parcels) {
                    totalEarnings = state.claimedRoute.parcels.reduce((sum, p) => 
                        sum + ((p.price || 500) * BUSINESS_CONFIG.commission.rider), 0
                    );
                }
                
                // Store completion
                const completionData = {
                    completed: true,
                    earnings: Math.round(totalEarnings),
                    deliveries: state.claimedRoute.stops.filter(s => s.type === 'delivery').length,
                    timestamp: new Date().toISOString()
                };
                
                localStorage.setItem('tuma_route_completion', JSON.stringify(completionData));
                localStorage.removeItem('tuma_active_route');
                state.claimedRoute = null;
                
                // Process completion
                await checkRouteCompletionStatus();
                
                // Reload routes
                await loadAvailableRoutes();
            }
        }
    },
    
    resetCommission: async () => {
        // Dev-only function to reset commission
        if (!DEV_CONFIG.isDevelopment) {
            console.error('This function is only available in development mode');
            return;
        }
        
        if (state.commissionTracker) {
            state.commissionTracker.state.unpaidCommission = 0;
            state.commissionTracker.state.isBlocked = false;
            state.commissionTracker.state.pendingDeliveries = [];
            
            displayCommissionStatus();
            
            // Remove any blocked overlay
            const blockedOverlay = document.getElementById('commissionBlockedOverlay');
            if (blockedOverlay) {
                blockedOverlay.remove();
            }
            
            console.log('Commission reset to 0');
            showNotification('DEV: Commission reset', 'success');
        }
    },
    
    setCommission: (amount) => {
        // Dev-only function to set commission to specific amount
        if (!DEV_CONFIG.isDevelopment) {
            console.error('This function is only available in development mode');
            return;
        }
        
        if (state.commissionTracker) {
            state.commissionTracker.state.unpaidCommission = amount;
            state.commissionTracker.state.isBlocked = amount >= BUSINESS_CONFIG.commission.maxUnpaid;
            
            displayCommissionStatus();
            
            console.log(`Commission set to KES ${amount}`);
            showNotification(`DEV: Commission set to KES ${amount}`, 'info');
        }
    },
    
    analyzeRoutes: () => {
        if (!state.availableRoutes || state.availableRoutes.length === 0) {
            console.log('No routes available');
            return;
        }
        
        console.log('Available Routes Analysis:');
        state.availableRoutes.forEach((route, index) => {
            console.log(`\n${index + 1}. ${route.name}`);
            console.log(`   Type: ${route.type}`);
            console.log(`   Parcels: ${route.pickups}`);
            console.log(`   Distance: ${route.distance}km`);
            console.log(`   Earnings: KES ${Math.round(route.total_earnings * 0.7)}`);
            console.log(`   Quality: ${route.qualityScore}`);
            console.log(`   Areas: ${route.metadata?.pickupAreas?.join(', ') || 'N/A'}`);
        });
    },
    
    getDevConfig: () => {
        console.log('Development Configuration:', DEV_CONFIG);
        console.log(`Commission bypass active: ${DEV_CONFIG.isDevelopment && DEV_CONFIG.bypassCommissionBlock}`);
        return DEV_CONFIG;
    }
};

// Override window.haptic if not already defined
if (!window.haptic) {
    window.haptic = haptic;
}

// Make showNotification globally available
window.showNotification = showNotification;

console.log('✅ rider.js loaded successfully with enhanced clustering support and dev bypass!');
console.log('Debug commands available: window.tumaDebug');
console.log(`Commission bypass: ${DEV_CONFIG.isDevelopment && DEV_CONFIG.bypassCommissionBlock ? 'ACTIVE' : 'INACTIVE'}`);
