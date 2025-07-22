/**
 * Rider Page Entry Script - Complete with Clustering and Commission Tracking
 * Handles rider dashboard functionality with advanced features
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
    clustering: {
        maxDeliveriesPerCluster: 8,
        maxClusterRadius: 5, // km
        minClusterSize: 3,
        pickupWeight: 0.7,
        deliveryWeight: 0.3
    }
};

// Supabase Configuration
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

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
    clusteredRoutes: [],
    currentFilter: 'all',
    isLoading: false,
    commissionTracker: null,
    clusteringEngine: null
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

// ─── Core Functions ────────────────────────────────────────────────────────

async function initialize() {
    console.log('Initializing rider dashboard...');
    
    // Initialize clustering engine
    if (window.DeliveryClusteringEngine) {
        state.clusteringEngine = new window.DeliveryClusteringEngine(BUSINESS_CONFIG.clustering);
    }
    
    // Initialize commission tracker
    if (window.CommissionTracker) {
        state.commissionTracker = new window.CommissionTracker({
            maxUnpaidCommission: BUSINESS_CONFIG.commission.maxUnpaid,
            platformFeeRate: BUSINESS_CONFIG.commission.platform,
            warningThreshold: BUSINESS_CONFIG.commission.warningThreshold
        });
    }
    
    // Check if user is authenticated
    const authenticated = await checkAuthAndLoadRider();
    
    if (!authenticated) {
        // For now, use demo rider
        await loadDemoRider();
    }
    
    // Initialize commission tracker
    if (state.commissionTracker && state.rider) {
        try {
            await state.commissionTracker.initialize(state.rider.id, supabaseAPI);
            displayCommissionStatus();
            
            // Check if rider is blocked
            if (state.commissionTracker.state.isBlocked) {
                showBlockedOverlay();
                return; // Don't load rest of the data if blocked
            }
        } catch (error) {
            console.error('Error initializing commission tracker:', error);
        }
    }
    
    setupEventListeners();
    await loadEarnings();
    await loadStats();
    await loadAvailableRoutes();
    await checkActiveDeliveries();
    
    // Add styles for notifications and commission UI
    addCustomStyles();
    
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
            
            // Check if rider is verified and active
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
    // Create or load demo rider
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
            // Show demo earnings
            state.earnings = {
                daily: 2340,
                weekly: 14520,
                monthly: 58000
            };
        } else {
            // Load actual earnings from completed parcels
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const weekStart = new Date(today);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            
            const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
            
            // Get daily earnings
            const dailyParcels = await supabaseAPI.query('parcels', {
                filter: `rider_id=eq.${state.rider.id}&status=eq.delivered&delivery_timestamp=gte.${today.toISOString()}`,
                select: 'rider_payout'
            });
            
            // Get weekly earnings
            const weeklyParcels = await supabaseAPI.query('parcels', {
                filter: `rider_id=eq.${state.rider.id}&status=eq.delivered&delivery_timestamp=gte.${weekStart.toISOString()}`,
                select: 'rider_payout'
            });
            
            // Get monthly earnings
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
        // Show default values on error
        state.earnings = { daily: 0, weekly: 0, monthly: 0 };
        updateEarningsDisplay();
    }
}

async function loadStats() {
    try {
        if (!state.rider || state.rider.id === 'demo-rider-001') {
            // Show demo stats
            state.stats = {
                deliveries: 156,
                distance: 342,
                rating: 4.8
            };
        } else {
            // Use stats from rider record
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
        // Load unclaimed parcels
        const unclaimedParcels = await supabaseAPI.query('parcels', {
            filter: 'status=eq.submitted&rider_id=is.null',
            limit: 50,
            order: 'created_at.asc'
        });
        
        if (unclaimedParcels.length === 0) {
            // Show demo routes if no real parcels
            state.availableRoutes = getDemoRoutes();
        } else if (state.clusteringEngine) {
            // Use clustering algorithm to create optimized routes
            const clusters = await state.clusteringEngine.clusterParcels(unclaimedParcels);
            
            state.availableRoutes = clusters.map((cluster, index) => ({
                id: cluster.id || `cluster-${index}`,
                name: getClusterName(cluster),
                type: determineRouteType(cluster),
                deliveries: cluster.parcels.length,
                distance: cluster.metrics.totalDistance,
                total_earnings: calculateRouteEarnings(cluster.parcels),
                status: 'available',
                parcels: cluster.parcels.map(p => p.id),
                optimizedRoute: cluster.optimizedRoute,
                metrics: cluster.metrics
            }));
        } else {
            // Fallback to simple grouping if clustering engine not available
            state.availableRoutes = createSimpleRoutes(unclaimedParcels);
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
            distance: 25,
            total_earnings: 2400,
            status: 'available',
            parcels: []
        }
    ];
}

function getClusterName(cluster) {
    // Try to determine area name from parcels
    const addresses = cluster.parcels.map(p => p.pickup_location?.address || '').filter(a => a);
    
    // Common areas in Nairobi
    const areas = ['Westlands', 'CBD', 'Karen', 'Kilimani', 'Parklands', 'Lavington', 'Kileleshwa', 'Eastlands'];
    
    for (const area of areas) {
        if (addresses.some(addr => addr.toLowerCase().includes(area.toLowerCase()))) {
            return `${area} Cluster`;
        }
    }
    
    return `Route ${cluster.id.slice(-4)}`;
}

function determineRouteType(cluster) {
    // Determine route type based on metrics
    if (cluster.metrics.efficiency > 85 && cluster.parcels.length <= 4) {
        return 'express';
    } else if (cluster.metrics.efficiency > 70) {
        return 'smart';
    } else {
        return 'eco';
    }
}

function calculateRouteEarnings(parcels) {
    return parcels.reduce((sum, parcel) => {
        const riderPayout = parcel.rider_payout || (parcel.price * BUSINESS_CONFIG.commission.rider);
        return sum + riderPayout;
    }, 0);
}

function createSimpleRoutes(parcels) {
    // Simple grouping by area
    const groups = {};
    
    parcels.forEach(parcel => {
        const area = getAreaFromAddress(parcel.pickup_location?.address || 'General');
        if (!groups[area]) groups[area] = [];
        groups[area].push(parcel);
    });
    
    return Object.entries(groups).map(([area, parcels]) => ({
        id: `route-${area.toLowerCase().replace(/\s+/g, '-')}`,
        name: `${area} Route`,
        type: 'smart',
        deliveries: parcels.length,
        distance: parcels.reduce((sum, p) => sum + (p.distance_km || 0), 0),
        total_earnings: calculateRouteEarnings(parcels),
        status: 'available',
        parcels: parcels.map(p => p.id)
    }));
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

async function checkActiveDeliveries() {
    try {
        if (!state.rider || state.rider.id === 'demo-rider-001') return;
        
        // Check for parcels assigned to this rider that aren't delivered
        const activeParcels = await supabaseAPI.query('parcels', {
            filter: `rider_id=eq.${state.rider.id}&status=in.(assigned,picked_up)`,
            order: 'created_at.asc',
            limit: 1
        });
        
        if (activeParcels.length > 0) {
            const parcel = activeParcels[0];
            state.activeDelivery = {
                parcelId: parcel.id,
                parcelCode: parcel.parcel_code,
                status: parcel.status,
                pickupAddress: parcel.pickup_location?.address || 'Pickup location',
                deliveryAddress: parcel.delivery_location?.address || 'Delivery location',
                pickupCode: parcel.pickup_code,
                deliveryCode: parcel.delivery_code
            };
            
            showActiveDelivery();
        }
        
    } catch (error) {
        console.error('Error checking active deliveries:', error);
    }
}

function showActiveDelivery() {
    if (!state.activeDelivery) return;
    
    elements.activeDeliverySection.style.display = 'block';
    
    if (state.activeDelivery.status === 'assigned') {
        document.querySelector('.delivery-status').textContent = 'En route to pickup';
        elements.currentAddress.textContent = state.activeDelivery.pickupAddress;
    } else if (state.activeDelivery.status === 'picked_up') {
        document.querySelector('.delivery-status').textContent = 'En route to delivery';
        elements.currentAddress.textContent = state.activeDelivery.deliveryAddress;
    }
    
    elements.currentParcel.textContent = state.activeDelivery.parcelCode;
    elements.currentETA.textContent = '15 min'; // Could calculate actual ETA
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
    // Rating is displayed in HTML
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
                    <div class="route-detail-value">${route.deliveries}</div>
                    <div class="route-detail-label">Deliveries</div>
                </div>
                <div class="route-detail">
                    <div class="route-detail-value">${Math.round(route.distance)} km</div>
                    <div class="route-detail-label">Distance</div>
                </div>
                <div class="route-detail">
                    <div class="route-detail-value">KES ${Math.round(route.total_earnings)}</div>
                    <div class="route-detail-label">Earnings</div>
                </div>
            </div>
            ${route.metrics ? `
                <div class="route-metrics">
                    <span class="metric">⚡ ${route.metrics.efficiency}% efficient</span>
                    <span class="metric">⏱️ ~${route.metrics.estimatedDuration} min</span>
                </div>
            ` : ''}
            <button class="claim-button" ${route.status !== 'available' ? 'disabled' : ''}>
                ${route.status === 'available' ? 'Claim Route' : 'Already Claimed'}
            </button>
        </div>
    `).join('');
}

function displayCommissionStatus() {
    if (!state.commissionTracker) return;
    
    const ui = state.commissionTracker.createCommissionUI();
    
    // Add commission status to the page
    const commissionContainer = document.createElement('div');
    commissionContainer.id = 'commissionContainer';
    commissionContainer.innerHTML = ui.statusBar;
    
    // Insert after hero section
    const heroSection = document.querySelector('.hero-section');
    if (heroSection && heroSection.parentNode) {
        heroSection.parentNode.insertBefore(commissionContainer, heroSection.nextSibling);
    }
    
    // Show warning if needed
    if (ui.warningMessage) {
        const warningDiv = document.createElement('div');
        warningDiv.innerHTML = ui.warningMessage;
        commissionContainer.appendChild(warningDiv.firstChild);
    }
}

function showBlockedOverlay() {
    if (!state.commissionTracker) return;
    
    const ui = state.commissionTracker.createCommissionUI();
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'commissionBlockedOverlay';
    overlay.innerHTML = ui.blockedMessage;
    document.body.appendChild(overlay);
}

// ─── Event Listeners ───────────────────────────────────────────────────────

function setupEventListeners() {
    // Code input formatting
    elements.codeInput?.addEventListener('input', (e) => {
        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        e.target.value = value;
    });
    
    // Status badge click
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
    } else {
        elements.statusBadge.classList.add('offline');
        elements.statusBadge.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="4"/>
            </svg>
            <span>Offline</span>
        `;
    }
    
    // Update status in database if real rider
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
    
    if (state.isLoading) return;
    state.isLoading = true;
    
    try {
        // If route has real parcels, claim them
        if (route.parcels && route.parcels.length > 0) {
            // Update parcels to assign to this rider
            for (const parcelId of route.parcels) {
                await supabaseAPI.update('parcels', 
                    `id=eq.${parcelId}`,
                    { 
                        rider_id: state.rider.id,
                        status: 'assigned',
                        assigned_at: new Date().toISOString()
                    }
                );
            }
            
            // Load first parcel details
            const firstParcel = await supabaseAPI.query('parcels', {
                filter: `id=eq.${route.parcels[0]}`,
                limit: 1
            });
            
            if (firstParcel.length > 0) {
                state.activeDelivery = {
                    parcelId: firstParcel[0].id,
                    parcelCode: firstParcel[0].parcel_code,
                    status: 'assigned',
                    pickupAddress: firstParcel[0].pickup_location?.address || 'Pickup location',
                    deliveryAddress: firstParcel[0].delivery_location?.address || 'Delivery location',
                    pickupCode: firstParcel[0].pickup_code,
                    deliveryCode: firstParcel[0].delivery_code
                };
                
                showActiveDelivery();
            }
            
            // Store the full route for navigation
            state.claimedRoute = {
                ...route,
                currentIndex: 0
            };
        } else {
            // Demo route claimed
            state.activeDelivery = {
                routeId: routeId,
                parcelCode: 'TM' + Math.random().toString(36).substr(2, 6).toUpperCase(),
                status: 'assigned',
                pickupAddress: 'Demo pickup location',
                deliveryAddress: 'Demo delivery location'
            };
            
            showActiveDelivery();
        }
        
        // Update route status
        route.status = 'claimed';
        
        // Update display
        displayRoutes();
        
        showNotification(`Route claimed! You have ${route.deliveries} deliveries to complete.`, 'success');
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
        // Search for parcel by pickup or delivery code
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
        
        const parcel = parcels[0];
        
        if (type === 'pickup') {
            // Verify pickup code
            if (parcel.status !== 'assigned' && parcel.status !== 'submitted') {
                showNotification('This parcel has already been picked up.', 'warning');
                return;
            }
            
            // Update parcel status to picked up
            await supabaseAPI.update('parcels', 
                `id=eq.${parcel.id}`,
                { 
                    status: 'picked_up',
                    pickup_timestamp: new Date().toISOString()
                }
            );
            
            showNotification('Pickup verified! Package collected successfully.', 'success');
            elements.codeInput.value = '';
            
            // Update active delivery status
            if (state.activeDelivery && state.activeDelivery.parcelId === parcel.id) {
                state.activeDelivery.status = 'picked_up';
                document.querySelector('.delivery-status').textContent = 'En route to delivery';
                elements.currentAddress.textContent = state.activeDelivery.deliveryAddress;
            }
            
        } else if (type === 'delivery') {
            // Verify delivery code
            if (parcel.status !== 'picked_up') {
                showNotification('Please pick up the parcel first.', 'warning');
                return;
            }
            
            // Update parcel status to delivered
            await supabaseAPI.update('parcels', 
                `id=eq.${parcel.id}`,
                { 
                    status: 'delivered',
                    delivery_timestamp: new Date().toISOString()
                }
            );
            
            // Add commission for this delivery
            if (state.commissionTracker) {
                const commissionResult = await state.commissionTracker.addDeliveryCommission(
                    parcel.id,
                    parcel.price
                );
                
                // Update commission display
                displayCommissionStatus();
                
                // Show warning or block if needed
                if (commissionResult.isBlocked) {
                    showBlockedOverlay();
                    return;
                } else if (commissionResult.warningShown) {
                    showNotification(
                        `Commission balance: KES ${commissionResult.totalUnpaid}. Please pay soon to avoid restrictions.`,
                        'warning'
                    );
                }
            }
            
            showNotification('Delivery confirmed! Payment processed.', 'success');
            elements.codeInput.value = '';
            
            // Update earnings and stats
            const riderPayout = parcel.rider_payout || (parcel.price * BUSINESS_CONFIG.commission.rider);
            state.earnings.daily += riderPayout;
            state.stats.deliveries++;
            state.stats.distance += parcel.distance_km || 0;
            
            // Update rider stats in database
            if (state.rider && state.rider.id !== 'demo-rider-001') {
                await supabaseAPI.update('riders',
                    `id=eq.${state.rider.id}`,
                    {
                        completed_deliveries: state.stats.deliveries,
                        total_distance: state.stats.distance,
                        total_earnings: (state.rider.total_earnings || 0) + riderPayout
                    }
                );
            }
            
            updateEarningsDisplay();
            updateStatsDisplay();
            
            // Check if there are more parcels in the route
            if (state.claimedRoute && state.claimedRoute.parcels) {
                state.claimedRoute.currentIndex = (state.claimedRoute.currentIndex || 0) + 1;
                
                if (state.claimedRoute.currentIndex < state.claimedRoute.parcels.length) {
                    // Load next parcel
                    const nextParcelId = state.claimedRoute.parcels[state.claimedRoute.currentIndex];
                    const nextParcel = await supabaseAPI.query('parcels', {
                        filter: `id=eq.${nextParcelId}`,
                        limit: 1
                    });
                    
                    if (nextParcel.length > 0) {
                        state.activeDelivery = {
                            parcelId: nextParcel[0].id,
                            parcelCode: nextParcel[0].parcel_code,
                            status: 'assigned',
                            pickupAddress: nextParcel[0].pickup_location?.address || 'Pickup location',
                            deliveryAddress: nextParcel[0].delivery_location?.address || 'Delivery location',
                            pickupCode: nextParcel[0].pickup_code,
                            deliveryCode: nextParcel[0].delivery_code
                        };
                        
                        showActiveDelivery();
                        showNotification(
                            `Moving to delivery ${state.claimedRoute.currentIndex + 1} of ${state.claimedRoute.parcels.length}`,
                            'info'
                        );
                    }
                } else {
                    // Route completed
                    elements.activeDeliverySection.style.display = 'none';
                    state.activeDelivery = null;
                    state.claimedRoute = null;
                    showNotification('🎉 Route completed! Great work!', 'success');
                    await loadAvailableRoutes(); // Refresh available routes
                }
            } else {
                // Single delivery completed
                elements.activeDeliverySection.style.display = 'none';
                state.activeDelivery = null;
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
    if (state.activeDelivery) {
        // In a real app, this would open a map view
        showNotification('Map navigation coming soon!', 'info');
        
        // Could show route details
        if (state.claimedRoute && state.claimedRoute.optimizedRoute) {
            console.log('Optimized route:', state.claimedRoute.optimizedRoute);
            console.log('Current stop:', state.claimedRoute.currentIndex + 1, 'of', state.claimedRoute.parcels.length);
        }
    } else {
        showNotification('Claim a route first to see navigation', 'warning');
    }
    haptic('light');
};

window.openPaymentModal = function() {
    // Show payment modal
    showNotification('Payment integration coming soon. Contact support to pay commission.', 'info');
    
    // In production, this would open a payment modal with M-Pesa integration
    console.log('Commission details:', state.commissionTracker.getDetailedBreakdown());
};

window.viewCommissionDetails = function() {
    const details = state.commissionTracker.getDetailedBreakdown();
    console.log('Commission breakdown:', details);
    
    // Could show a detailed modal
    showNotification(`You have ${details.pendingCount} deliveries with unpaid commission`, 'info');
};

// ─── Custom Styles ─────────────────────────────────────────────────────────

function addCustomStyles() {
    if (!document.getElementById('rider-custom-styles')) {
        const style = document.createElement('style');
        style.id = 'rider-custom-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            
            .route-metrics {
                display: flex;
                gap: 12px;
                margin-top: 8px;
                font-size: 12px;
                color: var(--text-secondary);
            }
            
            .route-metrics .metric {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            
            ${state.commissionTracker ? state.commissionTracker.getCommissionStyles() : ''}
        `;
        document.head.appendChild(style);
    }
}

// ─── Test Functions ────────────────────────────────────────────────────────

window.testRiderDashboard = async function() {
    console.log('🧪 Testing rider dashboard...');
    
    // Test database connection
    try {
        const testQuery = await supabaseAPI.query('parcels', { limit: 1 });
        console.log('✅ Database connection successful');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
    }
    
    // Show current state
    console.log('Current state:', {
        rider: state.rider,
        earnings: state.earnings,
        stats: state.stats,
        activeDelivery: state.activeDelivery,
        availableRoutes: state.availableRoutes.length,
        commission: state.commissionTracker?.getSummary()
    });
    
    return state;
};

window.testClustering = async function() {
    if (!state.clusteringEngine) {
        console.error('❌ Clustering engine not initialized');
        return;
    }
    
    // Get sample parcels
    const parcels = await supabaseAPI.query('parcels', {
        filter: 'status=eq.submitted',
        limit: 20
    });
    
    if (parcels.length === 0) {
        console.log('No parcels to cluster');
        return;
    }
    
    // Run clustering
    const clusters = await state.clusteringEngine.clusterParcels(parcels);
    console.log('📍 Clustering results:', clusters);
    
    return clusters;
};

// ─── Initialize on Load ────────────────────────────────────────────────────

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

console.log('✅ Rider dashboard script loaded');
console.log('💡 Test functions available:');
console.log('   - testRiderDashboard() : Check system state');
console.log('   - testClustering() : Test route clustering algorithm');
