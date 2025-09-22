/**
 * Vendor Dashboard - Complete Implementation
 * Part 1: Configuration, State Management, and Core Setup
 */

// ═══════════════════════════════════════════════════════════════════════════
// Configuration & Constants
// ═══════════════════════════════════════════════════════════════════════════
console.log('vendor.js is loading...');

// Define critical functions immediately
window.switchTab = function(tab) {
    console.log('Switching to tab:', tab);
    // Temporary implementation - will be replaced later
};

window.repeatLastOrder = function() {
    console.log('Repeat last order clicked');
};

window.showSavedRecipients = function() {
    console.log('Show saved recipients clicked');
};

const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

const BUSINESS_CONFIG = {
    packageSizes: {
        small: { label: 'Small', units: 1, maxWeight: 2 },
        medium: { label: 'Medium', units: 2, maxWeight: 5 },
        large: { label: 'Large', units: 4, maxWeight: 10 },
        bulky: { label: 'Bulky', units: 6, maxWeight: 20 }
    },
    vehicleCapacity: {
        motorcycle: 8
    },
    pricing: {
        rates: {
            base: 100,
            perKm: 20
        },
        multipliers: {
            service: {
                express: 1.4,
                smart: 1.0,
                eco: 0.8
            },
            managedVendor: 0.9,
            affiliate: 0.05
        }
    },
    serviceArea: {
        center: { lat: -1.2921, lng: 36.8219 },
        radiusKm: 30,
        expandedRadiusKm: 40
    },
    statuses: {
        submitted: { label: 'Submitted', color: 'primary', icon: '📝' },
        assigned: { label: 'Assigned', color: 'info', icon: '👤' },
        in_transit: { label: 'In Transit', color: 'warning', icon: '🚀' },
        delivered: { label: 'Delivered', color: 'success', icon: '✅' },
        failed: { label: 'Failed', color: 'danger', icon: '❌' },
        cancelled: { label: 'Cancelled', color: 'secondary', icon: '🚫' }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// State Management
// ═══════════════════════════════════════════════════════════════════════════

class DashboardState {
    constructor() {
        this.state = {
            isAuthenticated: false,
            currentVendor: null,
            vendorId: null,
            activeTab: 'new-booking',
            activeDeliveries: [],
            deliveryHistory: [],
            deliveryType: 'single',
            affiliateCode: null,
            affiliateData: null,
            pickupCoords: null,
            deliveryCoords: null,
            bulkDeliveries: [],
            distance: 0,
            duration: 0,
            selectedService: 'smart',
            selectedSize: 'small',
            itemCount: 1,
            packageType: '',
            isLoading: false,
            savedRecipients: [],
            savedLocations: [],
            recentTracks: []
        };
        
        this.subscribers = new Map();
    }
    
    set(key, value) {
        if (typeof key === 'object') {
            Object.assign(this.state, key);
            Object.keys(key).forEach(k => this.notify(k));
        } else {
            this.state[key] = value;
            this.notify(key);
        }
    }
    
    get(key) {
        return this.state[key];
    }
    
    subscribe(keys, callback) {
        if (typeof keys === 'string') keys = [keys];
        keys.forEach(key => {
            if (!this.subscribers.has(key)) {
                this.subscribers.set(key, []);
            }
            this.subscribers.get(key).push(callback);
        });
    }
    
    notify(key) {
        if (this.subscribers.has(key)) {
            this.subscribers.get(key).forEach(callback => {
                try {
                    callback(this.state[key]);
                } catch (error) {
                    console.error('State subscriber error:', error);
                }
            });
        }
    }
    
    reset() {
        const preserveKeys = ['isAuthenticated', 'currentVendor', 'vendorId', 'activeTab'];
        const preserved = {};
        preserveKeys.forEach(key => {
            preserved[key] = this.state[key];
        });
        
        // Create a new instance to get default state
        const defaultState = new DashboardState().state;
        
        this.state = {
            ...defaultState,
            ...preserved
        };
        
        Object.keys(this.state).forEach(key => this.notify(key));
    }
}

const dashboardState = new DashboardState();

// ═══════════════════════════════════════════════════════════════════════════
// Supabase API Service
// ═══════════════════════════════════════════════════════════════════════════

const supabaseAPI = {
    async query(table, options = {}) {
        const { select = '*', filter = '', limit, order } = options;
        
        let url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}`;
        if (filter) url += `&${filter}`;
        if (limit) url += `&limit=${limit}`;
        if (order) url += `&order=${order}`;
        
        try {
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
        } catch (error) {
            console.error('Query error:', error);
            throw error;
        }
    },
    
    async insert(table, data) {
        try {
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
        } catch (error) {
            console.error('Insert error:', error);
            throw error;
        }
    },
    
    async update(table, id, data) {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
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
        } catch (error) {
            console.error('Update error:', error);
            throw error;
        }
    },
    
    async delete(table, id) {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
                method: 'DELETE',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Delete Error: ${response.status} ${error}`);
            }
            
            return true;
        } catch (error) {
            console.error('Delete error:', error);
            throw error;
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

const utils = {
    formatPhone: (phone) => {
        if (!phone) return '';
        return phone.replace(/\D/g, '').slice(0, 10);
    },
    
    validatePhone: (phone) => {
        return /^0[0-9]{9}$/.test(phone);
    },
    
    formatCurrency: (amount) => {
        return `KES ${Math.round(amount).toLocaleString()}`;
    },
    
    formatDate: (date) => {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString('en-KE', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },
    
    formatTime: (date) => {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleTimeString('en-KE', {
            hour: '2-digit',
            minute: '2-digit'
        });
    },
    
    generateCode: (prefix) => {
        return prefix + Math.random().toString(36).substr(2, 6).toUpperCase();
    },
    
    calculateDistance: (point1, point2) => {
        if (!point1 || !point2) return 0;
        
        const R = 6371;
        const dLat = toRad(point2.lat - point1.lat);
        const dLng = toRad(point2.lng - point1.lng);
        const lat1 = toRad(point1.lat);
        const lat2 = toRad(point2.lat);
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.sin(dLng/2) * Math.sin(dLng/2) * Math.cos(lat1) * Math.cos(lat2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        
        return R * c;
        
        function toRad(value) {
            return value * Math.PI / 180;
        }
    },
    
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    showNotification: (message, type = 'info') => {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: calc(20px + var(--safe-area-top));
            right: 20px;
            background: ${type === 'error' ? '#ff3b30' : type === 'warning' ? '#FF9F0A' : '#34c759'};
            color: ${type === 'warning' ? 'black' : 'white'};
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 9999;
            font-weight: 600;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            max-width: 350px;
            animation: slideInRight 0.3s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, type === 'error' ? 5000 : 3000);
    },
    
    showToast: (message) => {
        const toast = document.getElementById('copyToast');
        if (toast) {
            toast.textContent = message;
            toast.style.display = 'block';
            toast.style.transform = 'translateX(-50%) translateY(0)';
            
            setTimeout(() => {
                toast.style.transform = 'translateX(-50%) translateY(100px)';
                setTimeout(() => {
                    toast.style.display = 'none';
                }, 300);
            }, 2000);
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Cache Services
// ═══════════════════════════════════════════════════════════════════════════

class CacheService {
    constructor(prefix) {
        this.prefix = prefix;
        this.cache = new Map();
        this.loadFromStorage();
    }
    
    set(key, value, ttl = 3600000) {
        const item = {
            value: value,
            expires: Date.now() + ttl,
            created: Date.now()
        };
        
        this.cache.set(key, item);
        this.saveToStorage();
    }
    
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() > item.expires) {
            this.cache.delete(key);
            this.saveToStorage();
            return null;
        }
        
        return item.value;
    }
    
    clear() {
        this.cache.clear();
        this.saveToStorage();
    }
    
    saveToStorage() {
        try {
            const data = Array.from(this.cache.entries());
            localStorage.setItem(`${this.prefix}_cache`, JSON.stringify(data));
        } catch (e) {
            console.warn('Cache save failed:', e);
        }
    }
    
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(`${this.prefix}_cache`);
            if (stored) {
                const data = JSON.parse(stored);
                data.forEach(([key, value]) => {
                    if (Date.now() < value.expires) {
                        this.cache.set(key, value);
                    }
                });
            }
        } catch (e) {
            console.warn('Cache load failed:', e);
        }
    }
}

const geocodeCache = new CacheService('tuma_geocode');
const distanceCache = new CacheService('tuma_distance');
// ═══════════════════════════════════════════════════════════════════════════
// Authentication & Session Management
// ═══════════════════════════════════════════════════════════════════════════

const authService = {
    async checkSession() {
        try {
            const session = localStorage.getItem('tuma_vendor_session');
            if (!session) return null;
            
            const { vendorId, phone, expiresAt } = JSON.parse(session);
            
            if (Date.now() > expiresAt) {
                this.clearSession();
                return null;
            }
            
            const vendors = await supabaseAPI.query('vendors', {
                filter: `id=eq.${vendorId}`,
                limit: 1
            });
            
            if (vendors.length === 0 || vendors[0].status !== 'active') {
                this.clearSession();
                return null;
            }
            
            return vendors[0];
        } catch (error) {
            console.error('Session check error:', error);
            return null;
        }
    },
    
    async authenticateVendor(phone, name = null) {
        try {
            const vendors = await supabaseAPI.query('vendors', {
                filter: `phone=eq.${phone}`,
                limit: 1
            });
            
            let vendor;
            
            if (vendors.length > 0) {
                vendor = vendors[0];
                
                await supabaseAPI.update('vendors', vendor.id, {
                    last_active: new Date().toISOString()
                });
            } else if (name) {
                const newVendorData = {
                    vendor_name: name,
                    phone: phone,
                    vendor_type: 'casual',
                    status: 'active',
                    total_bookings: 0,
                    successful_deliveries: 0,
                    created_at: new Date().toISOString()
                };
                
                const result = await supabaseAPI.insert('vendors', newVendorData);
                vendor = result[0];
            } else {
                return null;
            }
            
            this.createSession(vendor);
            return vendor;
        } catch (error) {
            console.error('Authentication error:', error);
            throw error;
        }
    },
    
    createSession(vendor) {
        const session = {
            vendorId: vendor.id,
            phone: vendor.phone,
            name: vendor.vendor_name || vendor.name,
            expiresAt: Date.now() + (24 * 60 * 60 * 1000)
        };
        
        localStorage.setItem('tuma_vendor_session', JSON.stringify(session));
        
        dashboardState.set({
            isAuthenticated: true,
            currentVendor: vendor,
            vendorId: vendor.id
        });
    },
    
    clearSession() {
        localStorage.removeItem('tuma_vendor_session');
        dashboardState.set({
            isAuthenticated: false,
            currentVendor: null,
            vendorId: null
        });
    },
    
    async updateVendorProfile(updates) {
        const vendorId = dashboardState.get('vendorId');
        if (!vendorId) return false;
        
        try {
            const result = await supabaseAPI.update('vendors', vendorId, updates);
            dashboardState.set('currentVendor', result[0]);
            return true;
        } catch (error) {
            console.error('Profile update error:', error);
            return false;
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Vendor Dashboard Functions
// ═══════════════════════════════════════════════════════════════════════════

const vendorDashboard = {
    async initialize() {
        console.log('🚀 Initializing vendor dashboard...');
        
        try {
            // Check for 2ma_user session first
            const user2ma = localStorage.getItem('2ma_user');
            if (user2ma) {
                const userData = JSON.parse(user2ma);
                console.log('✅ Found 2ma_user session:', userData);
                
                const vendor = {
                    id: userData.id,
                    vendor_name: userData.full_name,
                    name: userData.full_name,
                    phone: userData.phone,
                    email: userData.email,
                    role: userData.role
                };
                
                this.displayVendorInfo(vendor);
                await this.loadDashboardData();
            } else {
                // Fallback to old session system
                const vendor = await authService.checkSession();
                if (vendor) {
                    console.log('✅ Vendor authenticated:', vendor.vendor_name || vendor.name);
                    this.displayVendorInfo(vendor);
                    await this.loadDashboardData();
                } else {
                    await this.handleURLParameters();
                }
            }
            
            console.log('✅ Dashboard initialized');
        } catch (error) {
            console.error('Dashboard initialization error:', error);
        }
    },
    
    async handleURLParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const waPhone = urlParams.get('wa');
        
        if (waPhone) {
            console.log('📱 WhatsApp parameter detected:', waPhone);
            
            let cleanedPhone = utils.formatPhone(waPhone);
            if (cleanedPhone.startsWith('254')) {
                cleanedPhone = '0' + cleanedPhone.substring(3);
            } else if (!cleanedPhone.startsWith('0') && cleanedPhone.length === 9) {
                cleanedPhone = '0' + cleanedPhone;
            }
            
            if (utils.validatePhone(cleanedPhone)) {
                const vendor = await authService.authenticateVendor(cleanedPhone);
                if (vendor) {
                    this.displayVendorInfo(vendor);
                    await this.loadDashboardData();
                    utils.showNotification(`Welcome back, ${vendor.vendor_name || vendor.name}!`, 'success');
                }
            }
        }
    },
    
    displayVendorInfo(vendor) {
        const vendorAvatar = document.getElementById('vendorAvatar');
        const vendorDisplayName = document.getElementById('vendorDisplayName');
        const vendorDisplayPhone = document.getElementById('vendorDisplayPhone');
        
        if (vendorAvatar) {
            const initials = (vendor.vendor_name || vendor.name || 'V')
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
            vendorAvatar.textContent = initials;
        }
        
        if (vendorDisplayName) {
            vendorDisplayName.textContent = vendor.vendor_name || vendor.name || 'Vendor';
        }
        
        if (vendorDisplayPhone) {
            vendorDisplayPhone.textContent = vendor.phone || '-';
        }
        
        if (!dashboardState.get('isAuthenticated')) {
            const vendorNameInput = document.getElementById('vendorName');
            const phoneInput = document.getElementById('phoneNumber');
            
            if (vendorNameInput) vendorNameInput.value = vendor.vendor_name || vendor.name || '';
            if (phoneInput) phoneInput.value = vendor.phone || '';
        }
    },
    
    async loadDashboardData() {
        const vendorId = dashboardState.get('vendorId');
        if (!vendorId) return;
        
        try {
            await this.loadActiveDeliveries();
            await this.loadDeliveryHistory();
            await this.loadSavedRecipients();
            await this.loadSavedLocations();
            await this.updateStatistics();
        } catch (error) {
            console.error('Dashboard data load error:', error);
        }
    },
    
    async loadActiveDeliveries() {
        const vendorId = dashboardState.get('vendorId');
        if (!vendorId) return;
        
        try {
            const activeStatuses = ['submitted', 'assigned', 'in_transit'];
            const filter = `vendor_id=eq.${vendorId}&status=in.(${activeStatuses.join(',')})`;
            
            const deliveries = await supabaseAPI.query('parcels', {
                filter: filter,
                order: 'created_at.desc',
                limit: 50
            });
            
            dashboardState.set('activeDeliveries', deliveries);
            this.displayActiveDeliveries(deliveries);
            
            const activeBadge = document.getElementById('activeBadge');
            if (activeBadge) {
                if (deliveries.length > 0) {
                    activeBadge.textContent = deliveries.length;
                    activeBadge.style.display = 'inline-block';
                } else {
                    activeBadge.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('Load active deliveries error:', error);
        }
    },
    
    async loadDeliveryHistory() {
        const vendorId = dashboardState.get('vendorId');
        if (!vendorId) return;
        
        try {
            const completedStatuses = ['delivered', 'failed', 'cancelled'];
            const filter = `vendor_id=eq.${vendorId}&status=in.(${completedStatuses.join(',')})`;
            
            const history = await supabaseAPI.query('parcels', {
                filter: filter,
                order: 'created_at.desc',
                limit: 100
            });
            
            dashboardState.set('deliveryHistory', history);
            this.displayDeliveryHistory(history);
        } catch (error) {
            console.error('Load delivery history error:', error);
        }
    },
    
    async loadSavedRecipients() {
        const vendorId = dashboardState.get('vendorId');
        if (!vendorId) return;
        
        try {
            const recipients = await supabaseAPI.query('saved_recipients', {
                filter: `vendor_id=eq.${vendorId}`,
                order: 'used_count.desc,created_at.desc',
                limit: 10
            });
            
            dashboardState.set('savedRecipients', recipients);
        } catch (error) {
            console.error('Load saved recipients error:', error);
        }
    },
    
    async loadSavedLocations() {
        const vendorId = dashboardState.get('vendorId');
        if (!vendorId) return;
        
        try {
            const locations = await supabaseAPI.query('saved_pickup_locations', {
                filter: `vendor_id=eq.${vendorId}`,
                order: 'used_count.desc,created_at.desc',
                limit: 5
            });
            
            dashboardState.set('savedLocations', locations);
            this.displaySavedPickupLocations(locations);
        } catch (error) {
            console.error('Load saved locations error:', error);
        }
    },
    
    displaySavedPickupLocations(locations) {
        const container = document.getElementById('savedPickupLocations');
        if (!container || locations.length === 0) return;
        
        container.innerHTML = `
            <div style="margin-bottom: 8px; font-size: 12px; color: var(--text-secondary);">
                Quick select saved locations:
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                ${locations.map((loc, index) => `
                    <button type="button" 
                            class="saved-location-chip"
                            onclick="vendorDashboard.useSavedLocation(${index})"
                            style="
                                background: var(--surface-elevated);
                                border: 1px solid var(--border);
                                border-radius: 20px;
                                padding: 8px 14px;
                                font-size: 13px;
                                color: var(--text-secondary);
                                cursor: pointer;
                                transition: all 0.2s;
                                display: flex;
                                align-items: center;
                                gap: 6px;
                            ">
                        <span>📍</span>
                        <span>${loc.name || loc.address.split(',')[0]}</span>
                        ${loc.used_count > 1 ? `<span style="opacity: 0.7;">(${loc.used_count}×)</span>` : ''}
                    </button>
                `).join('')}
            </div>
        `;
    },
    
    async useSavedLocation(index) {
        const locations = dashboardState.get('savedLocations');
        const location = locations[index];
        if (!location) return;
        
        const pickupInput = document.getElementById('pickupLocation');
        if (pickupInput) {
            pickupInput.value = location.address;
            pickupInput.dataset.lat = location.lat;
            pickupInput.dataset.lng = location.lng;
            
            dashboardState.set('pickupCoords', {
                lat: parseFloat(location.lat),
                lng: parseFloat(location.lng),
                display_name: location.address
            });
            
            await supabaseAPI.update('saved_pickup_locations', location.id, {
                used_count: (location.used_count || 0) + 1,
                last_used: new Date().toISOString()
            });
            
            utils.showNotification('Pickup location set!', 'success');
            
            if (dashboardState.get('deliveryCoords')) {
                await locationService.calculateDistance();
            }
        }
    },
    
    async updateStatistics() {
        const vendorId = dashboardState.get('vendorId');
        if (!vendorId) return;
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const todayFilter = `vendor_id=eq.${vendorId}&created_at=gte.${today.toISOString()}`;
            const todayDeliveries = await supabaseAPI.query('parcels', {
                filter: todayFilter,
                select: 'id'
            });
            
            const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const monthFilter = `vendor_id=eq.${vendorId}&created_at=gte.${firstOfMonth.toISOString()}`;
            const monthDeliveries = await supabaseAPI.query('parcels', {
                filter: monthFilter,
                select: 'id,total_price,status'
            });
            
            const totalSpent = monthDeliveries.reduce((sum, d) => sum + (parseFloat(d.total_price) || 0), 0);
            
            const elements = {
                activeCount: document.getElementById('activeCount'),
                todayCount: document.getElementById('todayCount'),
                transitCount: document.getElementById('transitCount'),
                totalDeliveries: document.getElementById('totalDeliveries'),
                monthlyDeliveries: document.getElementById('monthlyDeliveries'),
                totalSpent: document.getElementById('totalSpent')
            };
            
            const activeDeliveries = dashboardState.get('activeDeliveries') || [];
            const inTransit = activeDeliveries.filter(d => d.status === 'in_transit').length;
            
            if (elements.activeCount) elements.activeCount.textContent = activeDeliveries.length;
            if (elements.todayCount) elements.todayCount.textContent = todayDeliveries.length;
            if (elements.transitCount) elements.transitCount.textContent = inTransit;
            if (elements.totalDeliveries) {
                const vendor = dashboardState.get('currentVendor');
                elements.totalDeliveries.textContent = vendor?.total_bookings || 0;
            }
            if (elements.monthlyDeliveries) elements.monthlyDeliveries.textContent = monthDeliveries.length;
            if (elements.totalSpent) elements.totalSpent.textContent = utils.formatCurrency(totalSpent);
        } catch (error) {
            console.error('Update statistics error:', error);
        }
    },
    
    displayActiveDeliveries: function(deliveries) {
        if (typeof uiDisplay !== 'undefined') {
            uiDisplay.displayActiveDeliveries(deliveries);
        }
    },
    
    displayDeliveryHistory: function(deliveries) {
        if (typeof uiDisplay !== 'undefined') {
            uiDisplay.displayDeliveryHistory(deliveries);
        }
    }
};
// ═══════════════════════════════════════════════════════════════════════════
// UI Display Functions
// ═══════════════════════════════════════════════════════════════════════════

const uiDisplay = {
    displayActiveDeliveries(deliveries) {
        const container = document.getElementById('activeDeliveriesList');
        if (!container) return;
        
        if (deliveries.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; text-align: center;">
                    <div class="empty-icon" style="font-size: 64px; margin-bottom: 16px; opacity: 0.5;">📦</div>
                    <div class="empty-title" style="font-size: 20px; font-weight: 600; margin-bottom: 8px;">No Active Deliveries</div>
                    <div class="empty-message" style="font-size: 14px; color: var(--text-secondary);">Your active deliveries will appear here</div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = deliveries.map(delivery => {
            const status = BUSINESS_CONFIG.statuses[delivery.status] || {};
            const timeAgo = this.getTimeAgo(delivery.created_at);
            
            return `
                <div class="delivery-card" style="background: var(--surface-elevated); border-radius: 14px; padding: 16px; margin-bottom: 12px; border: 1px solid var(--border); cursor: pointer;" onclick="uiDisplay.showDeliveryDetails('${delivery.id}')">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                        <div>
                            <div style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">
                                ${delivery.parcel_code}
                            </div>
                            <div style="font-size: 12px; color: var(--text-secondary);">
                                ${timeAgo}
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px; background: var(--${status.color}); color: ${status.color === 'warning' ? 'black' : 'white'}; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                            <span>${status.icon}</span>
                            <span>${status.label}</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 8px; font-size: 14px;">
                        <div style="display: flex; align-items: start; gap: 8px;">
                            <span style="opacity: 0.7;">📍</span>
                            <span style="flex: 1; color: var(--text-secondary);">
                                ${delivery.pickup_location?.address || 'Pickup location'}
                            </span>
                        </div>
                        <div style="display: flex; align-items: start; gap: 8px;">
                            <span style="opacity: 0.7;">📌</span>
                            <span style="flex: 1; color: var(--text-secondary);">
                                ${delivery.delivery_location?.address || 'Delivery location'}
                            </span>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 12px; color: var(--text-secondary);">Recipient:</span>
                            <span style="font-size: 14px; font-weight: 500;">${delivery.recipient_name || '-'}</span>
                        </div>
                        <div style="font-size: 16px; font-weight: 600; color: var(--primary);">
                            ${utils.formatCurrency(delivery.total_price || delivery.price)}
                        </div>
                    </div>
                    
                    ${delivery.rider_id ? `
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px; padding: 8px; background: var(--surface-high); border-radius: 8px;">
                            <span style="font-size: 12px; color: var(--text-secondary);">Rider assigned</span>
                            <button onclick="event.stopPropagation(); trackingService.trackParcel('${delivery.parcel_code}')" style="margin-left: auto; padding: 4px 12px; background: var(--primary); color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
                                Track
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    },
    
    displayDeliveryHistory(history) {
        const container = document.getElementById('historyList');
        if (!container) return;
        
        if (history.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; text-align: center;">
                    <div class="empty-icon" style="font-size: 64px; margin-bottom: 16px; opacity: 0.5;">📜</div>
                    <div class="empty-title" style="font-size: 20px; font-weight: 600; margin-bottom: 8px;">No Delivery History</div>
                    <div class="empty-message" style="font-size: 14px; color: var(--text-secondary);">Your completed deliveries will appear here</div>
                </div>
            `;
            return;
        }
        
        const grouped = this.groupByDate(history);
        
        container.innerHTML = Object.entries(grouped).map(([date, deliveries]) => `
            <div style="margin-bottom: 24px;">
                <div style="font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                    ${date}
                </div>
                ${deliveries.map(delivery => {
                    const status = BUSINESS_CONFIG.statuses[delivery.status] || {};
                    
                    return `
                        <div class="history-item" style="background: var(--surface-elevated); border-radius: 12px; padding: 14px; margin-bottom: 8px; border: 1px solid var(--border); cursor: pointer;" onclick="uiDisplay.showDeliveryDetails('${delivery.id}')">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="flex: 1;">
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                        <span style="font-size: 14px; font-weight: 600;">${delivery.parcel_code}</span>
                                        <span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: var(--${status.color}); color: ${status.color === 'warning' ? 'black' : 'white'}; border-radius: 12px; font-size: 11px; font-weight: 600;">
                                            ${status.icon} ${status.label}
                                        </span>
                                    </div>
                                    <div style="font-size: 12px; color: var(--text-secondary);">
                                        ${delivery.recipient_name} • ${utils.formatTime(delivery.created_at)}
                                    </div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-size: 16px; font-weight: 600; color: var(--primary);">
                                        ${utils.formatCurrency(delivery.total_price || delivery.price)}
                                    </div>
                                    <div style="font-size: 11px; color: var(--text-secondary);">
                                        ${delivery.distance_km ? `${delivery.distance_km.toFixed(1)} km` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `).join('');
    },
    
    showDeliveryDetails(deliveryId) {
        const activeDeliveries = dashboardState.get('activeDeliveries') || [];
        const historyDeliveries = dashboardState.get('deliveryHistory') || [];
        const delivery = [...activeDeliveries, ...historyDeliveries].find(d => d.id === deliveryId);
        
        if (!delivery) return;
        
        const modal = document.createElement('div');
        modal.className = 'delivery-details-modal';
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.9);
            z-index: 5000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;
        
        const status = BUSINESS_CONFIG.statuses[delivery.status] || {};
        
        modal.innerHTML = `
            <div style="background: var(--surface-elevated); border-radius: 20px; max-width: 400px; width: 100%; max-height: 80vh; overflow-y: auto;">
                <div style="padding: 20px; border-bottom: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="font-size: 20px; font-weight: 600;">Delivery Details</h3>
                        <button onclick="this.closest('.delivery-details-modal').remove()" style="width: 32px; height: 32px; border-radius: 50%; background: var(--surface-high); border: none; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div style="padding: 20px;">
                    <div style="background: var(--surface-high); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                        <div style="display: grid; gap: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 14px; color: var(--text-secondary);">Parcel Code</span>
                                <span style="font-size: 16px; font-weight: 700; color: var(--primary); font-family: monospace;">
                                    ${delivery.parcel_code}
                                </span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 14px; color: var(--text-secondary);">Delivery Code</span>
                                <span style="font-size: 16px; font-weight: 700; color: var(--primary); font-family: monospace;">
                                    ${delivery.delivery_code}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; background: var(--${status.color}); color: ${status.color === 'warning' ? 'black' : 'white'}; border-radius: 12px; margin-bottom: 20px;">
                        <span style="font-size: 20px;">${status.icon}</span>
                        <span style="font-size: 16px; font-weight: 600;">${status.label}</span>
                    </div>
                    
                    <div style="display: grid; gap: 16px;">
                        <div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Pickup Location</div>
                            <div style="font-size: 14px;">${delivery.pickup_location?.address || '-'}</div>
                        </div>
                        
                        <div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Delivery Location</div>
                            <div style="font-size: 14px;">${delivery.delivery_location?.address || '-'}</div>
                        </div>
                        
                        <div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Recipient</div>
                            <div style="font-size: 14px;">${delivery.recipient_name} • ${delivery.recipient_phone}</div>
                        </div>
                        
                        <div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Package</div>
                            <div style="font-size: 14px;">${delivery.package_description || '-'}</div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Distance</div>
                                <div style="font-size: 14px; font-weight: 600;">${delivery.distance_km ? `${delivery.distance_km.toFixed(1)} km` : '-'}</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Price</div>
                                <div style="font-size: 14px; font-weight: 600; color: var(--primary);">
                                    ${utils.formatCurrency(delivery.total_price || delivery.price)}
                                </div>
                            </div>
                        </div>
                        
                        ${delivery.special_instructions ? `
                            <div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Special Instructions</div>
                                <div style="font-size: 14px; padding: 8px; background: var(--surface-high); border-radius: 8px;">
                                    ${delivery.special_instructions}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div style="display: flex; gap: 12px; margin-top: 24px;">
                        ${delivery.status === 'in_transit' || delivery.status === 'assigned' ? `
                            <button onclick="trackingService.trackParcel('${delivery.parcel_code}'); this.closest('.delivery-details-modal').remove()" style="flex: 1; padding: 14px; background: var(--primary); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer;">
                                Track Delivery
                            </button>
                        ` : ''}
                        
                        <button onclick="bookingService.repeatOrder('${delivery.id}'); this.closest('.delivery-details-modal').remove()" style="flex: 1; padding: 14px; background: var(--surface-high); color: var(--text-primary); border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer;">
                            Repeat Order
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    },
    
    getTimeAgo(date) {
        if (!date) return '';
        
        const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
        
        return utils.formatDate(date);
    },
    
    groupByDate(items) {
        const grouped = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        items.forEach(item => {
            const itemDate = new Date(item.created_at);
            itemDate.setHours(0, 0, 0, 0);
            
            let dateLabel;
            if (itemDate.getTime() === today.getTime()) {
                dateLabel = 'Today';
            } else if (itemDate.getTime() === yesterday.getTime()) {
                dateLabel = 'Yesterday';
            } else {
                dateLabel = itemDate.toLocaleDateString('en-KE', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short'
                });
            }
            
            if (!grouped[dateLabel]) {
                grouped[dateLabel] = [];
            }
            grouped[dateLabel].push(item);
        });
        
        return grouped;
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Tab Management
// ═══════════════════════════════════════════════════════════════════════════

window.switchTab = function(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    // Find and activate the selected tab
    document.querySelectorAll('.tab-item').forEach(tab => {
        if (tab.getAttribute('onclick')?.includes(tabName)) {
            tab.classList.add('active');
        }
    });
    
    const selectedPanel = document.getElementById(`${tabName}-panel`);
    if (selectedPanel) {
        selectedPanel.classList.add('active');
    }
    
    dashboardState.set('activeTab', tabName);
    
    // Load tab-specific data
    switch(tabName) {
        case 'active':
            vendorDashboard.loadActiveDeliveries();
            break;
        case 'history':
            vendorDashboard.loadDeliveryHistory();
            break;
        case 'track':
            trackingService.loadRecentTracks();
            break;
        case 'new-booking':
            // No specific action needed
            break;
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Booking Form Management
// ═══════════════════════════════════════════════════════════════════════════

const bookingService = {
    async submitBooking(formData) {
        try {
            dashboardState.set('isLoading', true);
            
            const codes = {
                parcel_code: utils.generateCode('TM'),
                pickup_code: utils.generateCode('PK'),
                delivery_code: utils.generateCode('DL')
            };
            
            const distance = dashboardState.get('distance');
            const service = dashboardState.get('selectedService');
            const basePrice = BUSINESS_CONFIG.pricing.rates.base + (distance * BUSINESS_CONFIG.pricing.rates.perKm);
            const serviceMultiplier = BUSINESS_CONFIG.pricing.multipliers.service[service];
            let totalPrice = basePrice * serviceMultiplier;
            
            const affiliateData = dashboardState.get('affiliateData');
            if (affiliateData) {
                totalPrice = totalPrice * 0.95;
            }
            
            let vendor = dashboardState.get('currentVendor');
            let vendorId = dashboardState.get('vendorId');
            
            if (!vendor && formData.vendorPhone) {
                vendor = await authService.authenticateVendor(
                    formData.vendorPhone,
                    formData.vendorName
                );
                vendorId = vendor?.id;
            }
            
            const parcelData = {
                ...codes,
                vendor_id: vendorId,
                vendor_name: formData.vendorName || vendor?.vendor_name || vendor?.name,
                vendor_phone: formData.vendorPhone || vendor?.phone,
                vendor_type: vendor?.vendor_type || 'casual',
                
                agent_id: affiliateData?.id || null,
                agent_code: affiliateData?.agent_code || null,
                agent_name: affiliateData?.agent_name || null,
                referral_code: formData.affiliateCode || null,
                agent_commission: affiliateData ? Math.round(totalPrice * 0.05) : 0,
                
                pickup_location: dashboardState.get('pickupCoords'),
                delivery_location: dashboardState.get('deliveryCoords'),
                pickup_lat: dashboardState.get('pickupCoords').lat,
                pickup_lng: dashboardState.get('pickupCoords').lng,
                delivery_lat: dashboardState.get('deliveryCoords').lat,
                delivery_lng: dashboardState.get('deliveryCoords').lng,
                pickup_coordinates: `${dashboardState.get('pickupCoords').lat},${dashboardState.get('pickupCoords').lng}`,
                delivery_coordinates: `${dashboardState.get('deliveryCoords').lat},${dashboardState.get('deliveryCoords').lng}`,
                
                recipient_name: formData.recipientName,
                recipient_phone: formData.recipientPhone,
                
                package_description: formData.packageDescription,
                package_category: formData.packageCategory,
                package_type: formData.packageCategory,
                package_size: dashboardState.get('selectedSize'),
                item_count: dashboardState.get('itemCount'),
                number_of_items: dashboardState.get('itemCount'),
                special_instructions: formData.specialInstructions || null,
                
                service_type: service,
                customer_choice: service,
                distance_km: distance,
                duration_minutes: dashboardState.get('duration'),
                estimated_duration_minutes: dashboardState.get('duration'),
                
                base_price: basePrice,
                service_multiplier: serviceMultiplier,
                price: totalPrice,
                total_price: totalPrice,
                platform_fee: Math.round(totalPrice * 0.30),
                platform_revenue: Math.round(totalPrice * 0.30),
                rider_payout: Math.round(totalPrice * 0.70),
                vendor_payout: 0,
                
                payment_method: 'cash',
                payment_status: 'pending',
                
                status: 'submitted',
                created_at: new Date().toISOString()
            };
            
            const specialCategories = ['food-fresh', 'food-frozen', 'pharmaceuticals', 'medical-equipment'];
            if (specialCategories.includes(formData.packageCategory)) {
                parcelData.priority_level = 'high';
                parcelData.is_perishable = formData.packageCategory.includes('food');
                parcelData.requires_signature = formData.packageCategory.includes('medical');
            }
            
            const result = await supabaseAPI.insert('parcels', parcelData);
            console.log('✅ Booking created:', result);
            
            if (vendorId && formData.saveRecipient) {
                await this.saveRecipient({
                    vendor_id: vendorId,
                    name: formData.recipientName,
                    phone: formData.recipientPhone,
                    address: dashboardState.get('deliveryCoords').display_name,
                    lat: dashboardState.get('deliveryCoords').lat,
                    lng: dashboardState.get('deliveryCoords').lng
                });
            }
            
            if (vendorId) {
                await this.savePickupLocation({
                    vendor_id: vendorId,
                    address: dashboardState.get('pickupCoords').display_name,
                    lat: dashboardState.get('pickupCoords').lat,
                    lng: dashboardState.get('pickupCoords').lng
                });
            }
            
            this.showBookingSuccess(codes, totalPrice);
            this.resetBookingForm();
            await vendorDashboard.loadActiveDeliveries();
            
            return result[0];
            
        } catch (error) {
            console.error('Booking submission error:', error);
            utils.showNotification('Failed to create booking. Please try again.', 'error');
            throw error;
        } finally {
            dashboardState.set('isLoading', false);
        }
    },
    
    async saveRecipient(recipientData) {
        try {
            const existing = await supabaseAPI.query('saved_recipients', {
                filter: `vendor_id=eq.${recipientData.vendor_id}&phone=eq.${recipientData.phone}`,
                limit: 1
            });
            
            if (existing.length > 0) {
                await supabaseAPI.update('saved_recipients', existing[0].id, {
                    used_count: (existing[0].used_count || 0) + 1,
                    last_used: new Date().toISOString()
                });
            } else {
                await supabaseAPI.insert('saved_recipients', {
                    ...recipientData,
                    used_count: 1,
                    created_at: new Date().toISOString(),
                    last_used: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Save recipient error:', error);
        }
    },
    
    async savePickupLocation(locationData) {
        try {
            const existing = await supabaseAPI.query('saved_pickup_locations', {
                filter: `vendor_id=eq.${locationData.vendor_id}&lat=eq.${locationData.lat}&lng=eq.${locationData.lng}`,
                limit: 1
            });
            
            if (existing.length > 0) {
                await supabaseAPI.update('saved_pickup_locations', existing[0].id, {
                    used_count: (existing[0].used_count || 0) + 1,
                    last_used: new Date().toISOString()
                });
            } else {
                const sessionKey = `pickup_${locationData.lat}_${locationData.lng}`;
                const sessionCount = parseInt(sessionStorage.getItem(sessionKey) || '0') + 1;
                sessionStorage.setItem(sessionKey, sessionCount.toString());
                
                if (sessionCount >= 2) {
                    await supabaseAPI.insert('saved_pickup_locations', {
                        ...locationData,
                        used_count: sessionCount,
                        created_at: new Date().toISOString(),
                        last_used: new Date().toISOString()
                    });
                }
            }
        } catch (error) {
            console.error('Save pickup location error:', error);
        }
    },
    
    showBookingSuccess(codes, price) {
        const overlay = document.getElementById('successOverlay');
        
        document.getElementById('displayParcelCode').textContent = codes.parcel_code;
        document.getElementById('displayPickupCode').textContent = codes.pickup_code;
        document.getElementById('displayDeliveryCode').textContent = codes.delivery_code;
        document.getElementById('displayTotalPrice').textContent = utils.formatCurrency(price);
        
        overlay.style.display = 'flex';
        utils.showNotification('Booking created successfully! 🎉', 'success');
    },
    
    resetBookingForm() {
        document.getElementById('dashboardDeliveryForm').reset();
        
        dashboardState.set({
            pickupCoords: null,
            deliveryCoords: null,
            distance: 0,
            duration: 0,
            selectedService: 'smart',
            selectedSize: 'small',
            itemCount: 1,
            affiliateCode: null,
            affiliateData: null
        });
        
        document.getElementById('itemCount').textContent = '1';
        document.getElementById('distanceInfo').style.display = 'none';
        document.getElementById('affiliateToggle').classList.remove('active');
        document.getElementById('affiliateInputGroup').classList.remove('active');
        
        document.querySelectorAll('.service-card').forEach(card => {
            card.classList.remove('selected');
        });
        document.querySelector('[data-service="smart"]').classList.add('selected');
        
        document.querySelectorAll('.size-option').forEach(option => {
            option.classList.remove('selected');
        });
        document.querySelector('[data-size="small"]').classList.add('selected');
    },
    
    async repeatOrder(deliveryId) {
        try {
            const allDeliveries = [
                ...(dashboardState.get('activeDeliveries') || []),
                ...(dashboardState.get('deliveryHistory') || [])
            ];
            const delivery = allDeliveries.find(d => d.id === deliveryId);
            
            if (!delivery) {
                utils.showNotification('Could not find order details', 'error');
                return;
            }
            
            switchTab('new-booking');
            
            if (delivery.pickup_location) {
                const pickupInput = document.getElementById('pickupLocation');
                pickupInput.value = delivery.pickup_location.address;
                pickupInput.dataset.lat = delivery.pickup_lat;
                pickupInput.dataset.lng = delivery.pickup_lng;
                dashboardState.set('pickupCoords', delivery.pickup_location);
            }
            
            if (delivery.delivery_location) {
                const deliveryInput = document.getElementById('deliveryLocation');
                deliveryInput.value = delivery.delivery_location.address;
                deliveryInput.dataset.lat = delivery.delivery_lat;
                deliveryInput.dataset.lng = delivery.delivery_lng;
                dashboardState.set('deliveryCoords', delivery.delivery_location);   
            }
            
            document.getElementById('recipientName').value = delivery.recipient_name || '';
            document.getElementById('recipientPhone').value = delivery.recipient_phone || '';
            document.getElementById('packageDescription').value = delivery.package_type || '';
            document.getElementById('specialInstructions').value = delivery.special_instructions || '';
            
            if (delivery.package_size) {
                window.selectSize(delivery.package_size);
            }
            if (delivery.item_count) {
                dashboardState.set('itemCount', delivery.item_count);
                document.getElementById('itemCount').textContent = delivery.item_count;
            }
            
            if (delivery.service_type) {
                window.selectService(delivery.service_type);
            }
            
            if (dashboardState.get('pickupCoords') && dashboardState.get('deliveryCoords')) {
                await locationService.calculateDistance();
            }
            
            utils.showNotification('Order details loaded. Review and submit when ready.', 'success');
            
        } catch (error) {
            console.error('Repeat order error:', error);
            utils.showNotification('Failed to load order details', 'error');
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Location Services
// ═══════════════════════════════════════════════════════════════════════════

const locationService = {
    async geocodeAddress(address) {
        const cached = geocodeCache.get(address);
        if (cached) {
            console.log('📦 Using cached geocode');
            return cached;
        }
        
        if (!address.toLowerCase().includes('kenya') && !address.toLowerCase().includes('nairobi')) {
            address = `${address}, Nairobi, Kenya`;
        }
        
        try {
            if (window.google && window.google.maps) {
                const geocoder = new google.maps.Geocoder();
                const result = await new Promise((resolve, reject) => {
                    geocoder.geocode({ 
                        address: address,
                        componentRestrictions: { country: 'KE' }
                    }, (results, status) => {
                        if (status === 'OK' && results[0]) {
                            resolve({
                                lat: results[0].geometry.location.lat(),
                                lng: results[0].geometry.location.lng(),
                                display_name: results[0].formatted_address
                            });
                        } else {
                            reject(new Error('Geocoding failed'));
                        }
                    });
                });
                
                geocodeCache.set(address, result);
                return result;
            }
            
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?` +
                `format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=ke`
            );
            
            const data = await response.json();
            if (data.length === 0) {
                throw new Error('Address not found');
            }
            
            const result = {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                display_name: data[0].display_name
            };
            
            geocodeCache.set(address, result);
            return result;
            
        } catch (error) {
            console.error('Geocoding error:', error);
            throw error;
        }
    },
    
    async reverseGeocode(lat, lng) {
        const cacheKey = `${lat},${lng}`;
        const cached = geocodeCache.get(cacheKey);
        if (cached) {
            return cached;
        }
        
        try {
            if (window.google && window.google.maps) {
                const geocoder = new google.maps.Geocoder();
                const result = await new Promise((resolve, reject) => {
                    geocoder.geocode({ 
                        location: { lat, lng }
                    }, (results, status) => {
                        if (status === 'OK' && results[0]) {
                            resolve({
                                display_name: results[0].formatted_address,
                                address: results[0].formatted_address
                            });
                        } else {
                            reject(new Error('Reverse geocoding failed'));
                        }
                    });
                });
                
                geocodeCache.set(cacheKey, result);
                return result;
            }
            
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?` +
                `format=json&lat=${lat}&lon=${lng}`
            );
            
            const data = await response.json();
            const result = {
                display_name: data.display_name,
                address: data.display_name
            };
            
            geocodeCache.set(cacheKey, result);
            return result;
            
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            throw error;
        }
    },
    
    async calculateDistance() {
        const pickup = dashboardState.get('pickupCoords');
        const delivery = dashboardState.get('deliveryCoords');
        
        if (!pickup || !delivery) return;
        
        const cacheKey = `${pickup.lat},${pickup.lng}-${delivery.lat},${delivery.lng}`;
        const cached = distanceCache.get(cacheKey);
        if (cached) {
            console.log('📦 Using cached distance');
            this.updateDistanceDisplay(cached);
            return cached;
        }
        
        try {
            let result;
            
            if (window.google && window.google.maps) {
                const service = new google.maps.DistanceMatrixService();
                const response = await new Promise((resolve, reject) => {
                    service.getDistanceMatrix({
                        origins: [new google.maps.LatLng(pickup.lat, pickup.lng)],
                        destinations: [new google.maps.LatLng(delivery.lat, delivery.lng)],
                        travelMode: google.maps.TravelMode.DRIVING,
                        unitSystem: google.maps.UnitSystem.METRIC
                    }, (response, status) => {
                        if (status === 'OK') {
                            resolve(response);
                        } else {
                            reject(new Error('Distance calculation failed'));
                        }
                    });
                });
                
                if (response.rows[0].elements[0].status === 'OK') {
                    const element = response.rows[0].elements[0];
                    result = {
                        distance: element.distance.value / 1000,
                        duration: Math.ceil(element.duration.value / 60),
                        distance_text: element.distance.text,
                        duration_text: element.duration.text
                    };
                }
            }
            
            if (!result) {
                const distance = utils.calculateDistance(pickup, delivery);
                result = {
                    distance: distance * 1.4,
                    duration: Math.ceil(distance * 3),
                    distance_text: `~${(distance * 1.4).toFixed(1)} km`,
                    duration_text: `~${Math.ceil(distance * 3)} min`
                };
            }
            
            distanceCache.set(cacheKey, result);
            this.updateDistanceDisplay(result);
            
            dashboardState.set({
                distance: result.distance,
                duration: result.duration
            });
            
            return result;
            
        } catch (error) {
            console.error('Distance calculation error:', error);
            
            const distance = utils.calculateDistance(pickup, delivery);
            const result = {
                distance: distance * 1.4,
                duration: Math.ceil(distance * 3),
                distance_text: `~${(distance * 1.4).toFixed(1)} km`,
                duration_text: `~${Math.ceil(distance * 3)} min`
            };
            
            this.updateDistanceDisplay(result);
            dashboardState.set({
                distance: result.distance,
                duration: result.duration
            });
            
            return result;
        }
    },
    
    updateDistanceDisplay(distanceData) {
        const distanceInfo = document.getElementById('distanceInfo');
        const calculatedDistance = document.getElementById('calculatedDistance');
        const estimatedDuration = document.getElementById('estimatedDuration');
        
        if (distanceInfo) distanceInfo.style.display = 'block';
        if (calculatedDistance) calculatedDistance.textContent = `${distanceData.distance.toFixed(1)} km`;
        if (estimatedDuration) estimatedDuration.textContent = `~${distanceData.duration} min`;
        
        this.updatePricing(distanceData.distance);
        this.checkFormValidity();
    },
    
    updatePricing(distance) {
        const service = dashboardState.get('selectedService');
        const rates = BUSINESS_CONFIG.pricing.rates;
        const multipliers = BUSINESS_CONFIG.pricing.multipliers;
        
        const basePrice = rates.base + (distance * rates.perKm);
        
        const expressEl = document.getElementById('expressPrice');
        const smartEl = document.getElementById('smartPrice');
        const ecoEl = document.getElementById('ecoPrice');
        
        if (expressEl) expressEl.textContent = utils.formatCurrency(basePrice * multipliers.service.express);
        if (smartEl) smartEl.textContent = utils.formatCurrency(basePrice * multipliers.service.smart);
        if (ecoEl) ecoEl.textContent = utils.formatCurrency(basePrice * multipliers.service.eco);
        
        const priceHint = document.getElementById('servicePriceHint');
        if (priceHint) priceHint.style.display = 'none';
    },
    
    checkFormValidity() {
        const submitBtn = document.getElementById('submitBtn');
        const buttonText = document.getElementById('buttonText');
        
        if (!submitBtn || !buttonText) return;
        
        const hasPickup = dashboardState.get('pickupCoords');
        const hasDelivery = dashboardState.get('deliveryCoords');
        const hasDistance = dashboardState.get('distance') > 0;
        
        if (hasPickup && hasDelivery && hasDistance) {
            submitBtn.disabled = false;
            buttonText.textContent = 'Book Delivery';
        } else {
            submitBtn.disabled = true;
            buttonText.textContent = 'Enter locations to see price';
        }
    },
    
    validateServiceArea(coords) {
        const center = BUSINESS_CONFIG.serviceArea.center;
        const distance = utils.calculateDistance(center, coords);
        const maxRadius = BUSINESS_CONFIG.serviceArea.radiusKm;
        
        return {
            isValid: distance <= maxRadius,
            distance: distance,
            maxRadius: maxRadius
        };
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Tracking Service
// ═══════════════════════════════════════════════════════════════════════════

const trackingService = {
    async trackParcel(parcelCode = null) {
        const code = parcelCode || document.getElementById('trackInput')?.value;
        
        if (!code) {
            utils.showNotification('Please enter a parcel code', 'warning');
            return;
        }
        
        try {
            const parcels = await supabaseAPI.query('parcels', {
                filter: `parcel_code=eq.${code}`,
                limit: 1
            });
            
            if (parcels.length === 0) {
                utils.showNotification('Parcel not found', 'error');
                return;
            }
            
            const parcel = parcels[0];
            
            if (parcel.status === 'in_transit' && parcel.rider_id) {
                const tracking = await supabaseAPI.query('live_delivery_tracking', {
                    filter: `parcel_id=eq.${parcel.id}`,
                    order: 'timestamp.desc',
                    limit: 1
                });
                
                if (tracking.length > 0) {
                    parcel.liveTracking = tracking[0];
                }
            }
            
            this.displayTrackingResult(parcel);
            this.saveRecentTrack(parcel);
            
        } catch (error) {
            console.error('Tracking error:', error);
            utils.showNotification('Failed to track parcel', 'error');
        }
    },
    
    displayTrackingResult(parcel) {
        const container = document.getElementById('trackingResult');
        if (!container) return;
        
        const status = BUSINESS_CONFIG.statuses[parcel.status] || {};
        
        container.innerHTML = `
            <div style="background: var(--surface-elevated); border-radius: 14px; padding: 20px; margin-top: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="font-size: 18px; font-weight: 600;">Tracking Details</h3>
                    <div style="display: flex; align-items: center; gap: 6px; background: var(--${status.color}); color: ${status.color === 'warning' ? 'black' : 'white'}; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                        <span>${status.icon}</span>
                        <span>${status.label}</span>
                    </div>
                </div>
                
                <div style="display: grid; gap: 16px;">
                    <div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Parcel Code</div>
                        <div style="font-size: 16px; font-weight: 600; font-family: monospace;">${parcel.parcel_code}</div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">From</div>
                            <div style="font-size: 14px;">${parcel.pickup_location?.address || '-'}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">To</div>
                            <div style="font-size: 14px;">${parcel.delivery_location?.address || '-'}</div>
                        </div>
                    </div>
                    
                    ${parcel.liveTracking ? `
                        <div style="padding: 12px; background: var(--success); color: white; border-radius: 8px;">
                            <div style="font-size: 12px; margin-bottom: 4px;">Live Location</div>
                            <div style="font-size: 14px; font-weight: 600;">
                                Rider is ${parcel.liveTracking.distance_to_delivery || '0'} km away
                            </div>
                            <div style="font-size: 11px; margin-top: 4px; opacity: 0.9;">
                                Last updated: ${utils.formatTime(parcel.liveTracking.timestamp)}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },
    
    async saveRecentTrack(parcel) {
        let recentTracks = dashboardState.get('recentTracks') || [];
        
        recentTracks = recentTracks.filter(t => t.parcel_code !== parcel.parcel_code);
        recentTracks.unshift({
            parcel_code: parcel.parcel_code,
            status: parcel.status,
            tracked_at: new Date().toISOString()
        });
        
        recentTracks = recentTracks.slice(0, 5);
        dashboardState.set('recentTracks', recentTracks);
        localStorage.setItem('tuma_recent_tracks', JSON.stringify(recentTracks));
        
        this.displayRecentTracks();
    },
    
    loadRecentTracks() {
        const stored = localStorage.getItem('tuma_recent_tracks');
        if (stored) {
            const tracks = JSON.parse(stored);
            dashboardState.set('recentTracks', tracks);
            this.displayRecentTracks();
        }
    },
    
    displayRecentTracks() {
        const container = document.getElementById('recentTracksList');
        const tracks = dashboardState.get('recentTracks') || [];
        
        if (!container) return;
        
        if (tracks.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; text-align: center;">
                    <div class="empty-icon" style="font-size: 48px; margin-bottom: 12px; opacity: 0.5;">📍</div>
                    <div class="empty-title" style="font-size: 16px; font-weight: 600; margin-bottom: 6px;">No Recent Tracks</div>
                    <div class="empty-message" style="font-size: 12px; color: var(--text-secondary);">Your tracked parcels will appear here</div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = tracks.map(track => {
            const status = BUSINESS_CONFIG.statuses[track.status] || {};
            
            return `
                <div onclick="trackingService.trackParcel('${track.parcel_code}')" style="padding: 12px; background: var(--surface-elevated); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 14px; font-weight: 600; margin-bottom: 2px;">${track.parcel_code}</div>
                        <div style="font-size: 11px; color: var(--text-secondary);">
                            ${utils.formatDate(track.tracked_at)}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: var(--${status.color}); color: ${status.color === 'warning' ? 'black' : 'white'}; border-radius: 12px; font-size: 11px; font-weight: 600;">
                        ${status.icon} ${status.label}
                    </div>
                </div>
            `;
        }).join('');
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Event Handler Functions
// ═══════════════════════════════════════════════════════════════════════════

window.toggleAffiliateCode = function() {
    const toggle = document.getElementById('affiliateToggle');
    const inputGroup = document.getElementById('affiliateInputGroup');
    
    toggle.classList.toggle('active');
    inputGroup.classList.toggle('active');
    
    if (toggle.classList.contains('active')) {
        document.getElementById('affiliateCode').focus();
    } else {
        document.getElementById('affiliateCode').value = '';
        document.getElementById('affiliateStatus').style.display = 'none';
        dashboardState.set({
            affiliateCode: null,
            affiliateData: null
        });
    }
};

window.validateAffiliateCode = async function() {
    const codeInput = document.getElementById('affiliateCode');
    const statusDiv = document.getElementById('affiliateStatus');
    const code = codeInput.value.trim().toUpperCase();
    
    if (!code) {
        statusDiv.style.display = 'none';
        dashboardState.set({
            affiliateCode: null,
            affiliateData: null
        });
        return;
    }
    
    try {
        const agents = await supabaseAPI.query('agents', {
            filter: `agent_code=eq.${code}&status=eq.active`,
            limit: 1
        });
        
        if (agents.length > 0) {
            const agent = agents[0];
            statusDiv.className = 'affiliate-status valid';
            statusDiv.textContent = `✅ Valid code - ${agent.agent_name || 'Agent'}`;
            statusDiv.style.display = 'block';
            
            dashboardState.set({
                affiliateCode: code,
                affiliateData: agent
            });
            
            utils.showNotification('Affiliate code applied! You get 5% discount.', 'success');
        } else {
            statusDiv.className = 'affiliate-status invalid';
            statusDiv.textContent = '❌ Invalid or inactive code';
            statusDiv.style.display = 'block';
            
            dashboardState.set({
                affiliateCode: null,
                affiliateData: null
            });
        }
    } catch (error) {
        console.error('Affiliate validation error:', error);
        statusDiv.className = 'affiliate-status invalid';
        statusDiv.textContent = '❌ Could not validate code';
        statusDiv.style.display = 'block';
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Quick Actions
// ═══════════════════════════════════════════════════════════════════════════

window.repeatLastOrder = async function() {
    try {
        const vendorId = dashboardState.get('vendorId');
        
        const filter = vendorId 
            ? `vendor_id=eq.${vendorId}` 
            : `vendor_phone=eq.${document.getElementById('phoneNumber')?.value}`;
            
        const lastOrders = await supabaseAPI.query('parcels', {
            filter: filter,
            order: 'created_at.desc',
            limit: 1
        });
        
        if (lastOrders.length === 0) {
            utils.showNotification('No previous orders found', 'warning');
            return;
        }
        
        await bookingService.repeatOrder(lastOrders[0].id);
        
    } catch (error) {
        console.error('Repeat last order error:', error);
        utils.showNotification('Failed to load last order', 'error');
    }
};

window.showSavedRecipients = async function() {
    const dropdown = document.getElementById('savedRecipientsDropdown');
    const recipients = dashboardState.get('savedRecipients') || [];
    
    if (recipients.length === 0) {
        const vendorId = dashboardState.get('vendorId');
        if (vendorId) {
            await vendorDashboard.loadSavedRecipients();
            const loaded = dashboardState.get('savedRecipients') || [];
            if (loaded.length === 0) {
                utils.showNotification('No saved recipients yet', 'info');
                return;
            }
        } else {
            utils.showNotification('Login to see saved recipients', 'info');
            return;
        }
    }
    
    dropdown.classList.toggle('active');
    
    if (dropdown.classList.contains('active')) {
        dropdown.innerHTML = recipients.map((recipient, index) => `
            <div class="saved-recipient-item" onclick="useSavedRecipient(${index})">
                <div class="recipient-name">${recipient.name}</div>
                <div class="recipient-details">
                    ${recipient.phone} • ${recipient.address ? recipient.address.split(',')[0] : 'No address'}
                </div>
            </div>
        `).join('');
    }
};

window.useSavedRecipient = function(index) {
    const recipients = dashboardState.get('savedRecipients') || [];
    const recipient = recipients[index];
    
    if (!recipient) return;
    
    document.getElementById('recipientName').value = recipient.name;
    document.getElementById('recipientPhone').value = recipient.phone;
    
    if (recipient.address && recipient.lat && recipient.lng) {
        const deliveryInput = document.getElementById('deliveryLocation');
        deliveryInput.value = recipient.address;
        deliveryInput.dataset.lat = recipient.lat;
        deliveryInput.dataset.lng = recipient.lng;
        
        dashboardState.set('deliveryCoords', {
            lat: parseFloat(recipient.lat),
            lng: parseFloat(recipient.lng),
            display_name: recipient.address
        });
        
        if (dashboardState.get('pickupCoords')) {
            locationService.calculateDistance();
        }
    }
    
    document.getElementById('savedRecipientsDropdown').classList.remove('active');
    utils.showNotification('Recipient details loaded', 'success');
};

// ═══════════════════════════════════════════════════════════════════════════
// Form Control Functions
// ═══════════════════════════════════════════════════════════════════════════

window.updateItemCount = function(change) {
    const currentCount = dashboardState.get('itemCount');
    const newCount = currentCount + change;
    
    if (newCount >= 1 && newCount <= 20) {
        dashboardState.set('itemCount', newCount);
        document.getElementById('itemCount').textContent = newCount;
        
        document.getElementById('decreaseBtn').disabled = newCount === 1;
        document.getElementById('increaseBtn').disabled = newCount === 20;
        
        updateCapacityDisplay();
    }
};

window.selectSize = function(size) {
    document.querySelectorAll('.size-option').forEach(el => el.classList.remove('selected'));
    const selected = document.querySelector(`[data-size="${size}"]`);
    if (selected) {
        selected.classList.add('selected');
        dashboardState.set('selectedSize', size);
        updateCapacityDisplay();
    }
};

window.selectService = function(service) {
    document.querySelectorAll('.service-card').forEach(el => el.classList.remove('selected'));
    const selected = document.querySelector(`[data-service="${service}"]`);
    if (selected) {
        selected.classList.add('selected');
        dashboardState.set('selectedService', service);
        
        const distance = dashboardState.get('distance');
        if (distance > 0) {
            locationService.updatePricing(distance);
        }
    }
};

window.copyCode = async function(type) {
    let code = '';
    let label = '';
    
    switch(type) {
        case 'parcel':
            code = document.getElementById('displayParcelCode').textContent;
            label = 'Parcel code';
            break;
        case 'pickup':
            code = document.getElementById('displayPickupCode').textContent;
            label = 'Pickup code';
            break;
        case 'delivery':
            code = document.getElementById('displayDeliveryCode').textContent;
            label = 'Delivery code';
            break;
    }
    
    try {
        await navigator.clipboard.writeText(code);
        utils.showToast(`${label} copied!`);
    } catch (error) {
        utils.showNotification('Failed to copy code', 'error');
    }
};

window.shareDeliveryDetails = async function() {
    const parcelCode = document.getElementById('displayParcelCode').textContent;
    const deliveryCode = document.getElementById('displayDeliveryCode').textContent;
    const recipientName = document.getElementById('recipientName').value;
    
    const message = `Hi ${recipientName}, your Tuma delivery ${parcelCode} is confirmed! 
Your delivery code is: ${deliveryCode}
Track at: ${window.location.origin}/track?code=${parcelCode}`;
    
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Tuma Delivery Details',
                text: message
            });
        } catch (error) {
            await navigator.clipboard.writeText(message);
            utils.showToast('Details copied to clipboard!');
        }
    } else {
        await navigator.clipboard.writeText(message);
        utils.showToast('Details copied to clipboard!');
    }
};

window.trackDelivery = function() {
    const parcelCode = document.getElementById('displayParcelCode').textContent;
    switchTab('track');
    document.getElementById('trackInput').value = parcelCode;
    trackingService.trackParcel(parcelCode);
    document.getElementById('successOverlay').style.display = 'none';
};

window.bookAnother = function() {
    document.getElementById('successOverlay').style.display = 'none';
    bookingService.resetBookingForm();
    window.scrollTo(0, 0);
};

window.getLocation = async function(type) {
    try {
        if (!navigator.geolocation) {
            throw new Error('Geolocation not supported');
        }
        
        utils.showNotification('Getting your location...', 'info');
        
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000
            });
        });
        
        const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };
        
        const serviceCheck = locationService.validateServiceArea(coords);
        if (!serviceCheck.isValid) {
            utils.showNotification(
                `Location is ${serviceCheck.distance.toFixed(1)}km from service area (max ${serviceCheck.maxRadius}km)`,
                'error'
            );
            return;
        }
        
        const address = await locationService.reverseGeocode(coords.lat, coords.lng);
        
        let input;
        if (type === 'pickup') {
            input = document.getElementById('pickupLocation');
            dashboardState.set('pickupCoords', { ...coords, display_name: address.display_name });
        } else if (type === 'delivery') {
            input = document.getElementById('deliveryLocation');
            dashboardState.set('deliveryCoords', { ...coords, display_name: address.display_name });
        }
        
        if (input) {
            input.value = address.display_name;
            input.dataset.lat = coords.lat;
            input.dataset.lng = coords.lng;
        }
        
        if (dashboardState.get('pickupCoords') && dashboardState.get('deliveryCoords')) {
            await locationService.calculateDistance();
        }
        
        utils.showNotification('Location updated!', 'success');
        
    } catch (error) {
        console.error('Location error:', error);
        utils.showNotification('Could not get location. Please type the address.', 'error');
    }
};

// Alias for backward compatibility
window.useGPS = window.getLocation;

window.logout = function() {
    if (confirm('Are you sure you want to logout?')) {
        authService.clearSession();
        window.location.href = '/';
    }
};

function updateCapacityDisplay() {
    const itemCount = dashboardState.get('itemCount');
    const selectedSize = dashboardState.get('selectedSize');
    const sizeConfig = BUSINESS_CONFIG.packageSizes[selectedSize];
    
    if (!sizeConfig) return;
    
    const totalUnits = itemCount * sizeConfig.units;
    const vehiclesNeeded = Math.ceil(totalUnits / BUSINESS_CONFIG.vehicleCapacity.motorcycle);
    
    const capacityText = document.getElementById('capacityText');
    const capacityFill = document.getElementById('capacityFill');
    const capacityIcon = document.getElementById('capacityIcon');
    
    if (!capacityText || !capacityFill || !capacityIcon) return;
    
    if (vehiclesNeeded === 1) {
        capacityText.textContent = `${itemCount} ${sizeConfig.label.toLowerCase()} item${itemCount > 1 ? 's' : ''} • Fits on one motorcycle`;
        capacityIcon.textContent = '✓';
        capacityIcon.className = 'capacity-icon';
        capacityFill.className = 'capacity-fill';
    } else if (vehiclesNeeded === 2) {
        capacityText.textContent = `${itemCount} ${sizeConfig.label.toLowerCase()} items • Needs 2 motorcycles`;
        capacityIcon.textContent = '!';
        capacityIcon.className = 'capacity-icon warning';
        capacityFill.className = 'capacity-fill warning';
    } else {
        capacityText.textContent = `${itemCount} ${sizeConfig.label.toLowerCase()} items • Too large (${vehiclesNeeded} motorcycles)`;
        capacityIcon.textContent = '✕';
        capacityIcon.className = 'capacity-icon danger';
        capacityFill.className = 'capacity-fill danger';
    }
    
    const percentage = Math.min((totalUnits / BUSINESS_CONFIG.vehicleCapacity.motorcycle) * 100, 100);
    capacityFill.style.width = `${percentage}%`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Submission Handler
// ═══════════════════════════════════════════════════════════════════════════

async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (dashboardState.get('isLoading')) return;
    
    const packageDescriptionSelect = document.getElementById('packageDescription');
    const formData = {
        vendorName: document.getElementById('vendorName')?.value,
        vendorPhone: document.getElementById('phoneNumber')?.value,
        recipientName: document.getElementById('recipientName').value,
        recipientPhone: document.getElementById('recipientPhone').value,
        packageDescription: packageDescriptionSelect.options[packageDescriptionSelect.selectedIndex].text,
        packageCategory: packageDescriptionSelect.value,
        specialInstructions: document.getElementById('specialInstructions').value,
        affiliateCode: document.getElementById('affiliateCode').value,
        saveRecipient: true
    };
    
    if (!dashboardState.get('isAuthenticated')) {
        if (!formData.vendorName || !formData.vendorPhone) {
            utils.showNotification('Please enter your name and phone number', 'error');
            return;
        }
        
        if (!utils.validatePhone(formData.vendorPhone)) {
            utils.showNotification('Please enter a valid phone number', 'error');
            return;
        }
    }
    
    if (!formData.recipientName || !formData.recipientPhone) {
        utils.showNotification('Please enter recipient details', 'error');
        return;
    }
    
    if (!utils.validatePhone(formData.recipientPhone)) {
        utils.showNotification('Please enter a valid recipient phone number', 'error');
        return;
    }
    
    if (!formData.packageCategory) {
        utils.showNotification('Please select what you are sending', 'error');
        return;
    }
    
    if (!dashboardState.get('pickupCoords') || !dashboardState.get('deliveryCoords')) {
        utils.showNotification('Please enter pickup and delivery locations', 'error');
        return;
    }
    
    if (dashboardState.get('distance') <= 0) {
        utils.showNotification('Please wait for distance calculation', 'warning');
        await locationService.calculateDistance();
        return;
    }
    
    const submitBtn = document.getElementById('submitBtn');
    const buttonText = document.getElementById('buttonText');
    submitBtn.disabled = true;
    buttonText.textContent = 'Processing...';
    
    try {
        await bookingService.submitBooking(formData);
    } catch (error) {
        console.error('Form submission error:', error);
        submitBtn.disabled = false;
        buttonText.textContent = 'Book Delivery';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// History Search & Filters
// ═══════════════════════════════════════════════════════════════════════════

window.filterHistory = function(filter, event) {
    // Handle both inline onclick and programmatic calls
    const evt = event || window.event;
    
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.classList.remove('active');
        pill.style.background = 'var(--surface-high)';
        pill.style.color = 'var(--text-secondary)';
        pill.style.borderColor = 'var(--border)';
    });
    
    // If we have an event, use its target, otherwise find the pill by filter value
    if (evt && evt.target) {
        evt.target.classList.add('active');
        evt.target.style.background = 'var(--primary)';
        evt.target.style.color = 'white';
        evt.target.style.borderColor = 'var(--primary)';
    }
    
    const allHistory = dashboardState.get('deliveryHistory') || [];
    let filtered;
    
    if (filter === 'all') {
        filtered = allHistory;
    } else {
        filtered = allHistory.filter(d => d.status === filter);
    }
    
    uiDisplay.displayDeliveryHistory(filtered);
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Initialization
// ═══════════════════════════════════════════════════════════════════════════

async function initializeDashboard() {
    console.log('🚀 Starting Vendor Dashboard initialization...');
    
    try {
        await vendorDashboard.initialize();
        
        // Setup form submission
        const form = document.getElementById('dashboardDeliveryForm');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }
        
        // Setup special instructions character counter
        const specialInstructions = document.getElementById('specialInstructions');
        if (specialInstructions) {
            specialInstructions.addEventListener('input', (e) => {
                const charCount = document.getElementById('charCount');
                if (charCount) {
                    charCount.textContent = e.target.value.length;
                }
            });
        }
        
        // Setup location inputs
        const pickupInput = document.getElementById('pickupLocation');
        const deliveryInput = document.getElementById('deliveryLocation');
        
        if (pickupInput) {
            pickupInput.addEventListener('change', async () => {
                if (pickupInput.value && !pickupInput.dataset.lat) {
                    try {
                        const coords = await locationService.geocodeAddress(pickupInput.value);
                        pickupInput.dataset.lat = coords.lat;
                        pickupInput.dataset.lng = coords.lng;
                        dashboardState.set('pickupCoords', coords);
                        
                        if (dashboardState.get('deliveryCoords')) {
                            await locationService.calculateDistance();
                        }
                    } catch (error) {
                        utils.showNotification('Could not find pickup address', 'error');
                    }
                }
            });
        }
        
        if (deliveryInput) {
            deliveryInput.addEventListener('change', async () => {
                if (deliveryInput.value && !deliveryInput.dataset.lat) {
                    try {
                        const coords = await locationService.geocodeAddress(deliveryInput.value);
                        deliveryInput.dataset.lat = coords.lat;
                        deliveryInput.dataset.lng = coords.lng;
                        dashboardState.set('deliveryCoords', coords);
                        
                        if (dashboardState.get('pickupCoords')) {
                            await locationService.calculateDistance();
                        }
                    } catch (error) {
                        utils.showNotification('Could not find delivery address', 'error');
                    }
                }
            });
        }
        
        // Setup track input enter key
        const trackInput = document.getElementById('trackInput');
        if (trackInput) {
            trackInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    trackingService.trackParcel();
                }
            });
        }
        
        // Setup history search
        const historySearchInput = document.getElementById('historySearch');
        if (historySearchInput) {
            historySearchInput.addEventListener('input', utils.debounce(function(e) {
                const searchTerm = e.target.value.toLowerCase();
                const allHistory = dashboardState.get('deliveryHistory') || [];
                
                if (!searchTerm) {
                    uiDisplay.displayDeliveryHistory(allHistory);
                    return;
                }
                
                const filtered = allHistory.filter(delivery => {
                    return delivery.parcel_code?.toLowerCase().includes(searchTerm) ||
                           delivery.recipient_name?.toLowerCase().includes(searchTerm) ||
                           delivery.pickup_location?.address?.toLowerCase().includes(searchTerm) ||
                           delivery.delivery_location?.address?.toLowerCase().includes(searchTerm);
                });
                
                uiDisplay.displayDeliveryHistory(filtered);
            }, 300));
        }
        
        // Setup affiliate code input
        const affiliateCodeInput = document.getElementById('affiliateCode');
        if (affiliateCodeInput) {
            affiliateCodeInput.addEventListener('input', utils.debounce(window.validateAffiliateCode, 500));
        }
        
        // Load recent tracks
        trackingService.loadRecentTracks();
        
        // Initialize UI
        updateCapacityDisplay();
        
        // Setup real-time updates
        setInterval(() => {
            if (dashboardState.get('activeTab') === 'active') {
                vendorDashboard.loadActiveDeliveries();
            }
        }, 30000);
        
        // Setup offline/online handling
        window.addEventListener('online', () => {
            const offlineBanner = document.getElementById('offlineBanner');
            if (offlineBanner) {
                offlineBanner.style.transform = 'translateY(-100%)';
            }
            utils.showNotification('You\'re back online!', 'success');
        });
        
        window.addEventListener('offline', () => {
            const offlineBanner = document.getElementById('offlineBanner');
            if (offlineBanner) {
                offlineBanner.style.transform = 'translateY(0)';
            }
        });
        
        // Check initial online status
        if (!navigator.onLine) {
            const offlineBanner = document.getElementById('offlineBanner');
            if (offlineBanner) {
                offlineBanner.style.transform = 'translateY(0)';
            }
        }
        
        // Initialize Google Places if available
        if (window.google && window.google.maps && window.google.maps.places) {
            initializeGooglePlaces();
        }
        
        console.log('✅ Vendor Dashboard fully initialized');
        
    } catch (error) {
        console.error('❌ Dashboard initialization error:', error);
        utils.showNotification('Failed to initialize dashboard. Please refresh.', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Google Maps Integration
// ═══════════════════════════════════════════════════════════════════════════

function initializeGooglePlaces() {
    if (!window.google || !window.google.maps || !window.google.maps.places) {
        setTimeout(initializeGooglePlaces, 500);
        return;
    }
    
    const pickupInput = document.getElementById('pickupLocation');
    const deliveryInput = document.getElementById('deliveryLocation');
    
    const options = {
        componentRestrictions: { country: 'KE' },
        fields: ['formatted_address', 'geometry', 'name'],
        bounds: new google.maps.LatLngBounds(
            new google.maps.LatLng(-1.5, 36.6),
            new google.maps.LatLng(-1.0, 37.1)
        )
    };
    
    if (pickupInput) {
        const pickupAutocomplete = new google.maps.places.Autocomplete(pickupInput, options);
        pickupAutocomplete.addListener('place_changed', () => {
            const place = pickupAutocomplete.getPlace();
            if (place.geometry) {
                pickupInput.dataset.lat = place.geometry.location.lat();
                pickupInput.dataset.lng = place.geometry.location.lng();
                dashboardState.set('pickupCoords', {
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                    display_name: place.formatted_address
                });
                
                if (dashboardState.get('deliveryCoords')) {
                    locationService.calculateDistance();
                }
            }
        });
    }
    
    if (deliveryInput) {
        const deliveryAutocomplete = new google.maps.places.Autocomplete(deliveryInput, options);
        deliveryAutocomplete.addListener('place_changed', () => {
            const place = deliveryAutocomplete.getPlace();
            if (place.geometry) {
                deliveryInput.dataset.lat = place.geometry.location.lat();
                deliveryInput.dataset.lng = place.geometry.location.lng();
                
                dashboardState.set('deliveryCoords', {
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                    display_name: place.formatted_address
                });
                
                if (dashboardState.get('pickupCoords')) {
                    locationService.calculateDistance();
                }
            }
        });
    }
}

// Make initMap globally available for Google Maps callback
window.initMap = function() {
    console.log('Google Maps loaded via callback');
    initializeGooglePlaces();
};

// ═══════════════════════════════════════════════════════════════════════════
// DOM Content Loaded Event
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded - Starting initialization...');
    await initializeDashboard();
    console.log('🎉 Vendor Dashboard ready!');
});

// ═══════════════════════════════════════════════════════════════════════════
// Export for external use
// ═══════════════════════════════════════════════════════════════════════════

window.TumaVendorDashboard = {
    version: '1.0.0',
    state: dashboardState,
    services: {
        auth: authService,
        booking: bookingService,
        location: locationService,
        tracking: trackingService
    },
    utils: utils,
    initialize: initializeDashboard,
    switchTab: window.switchTab,
    trackParcel: (code) => trackingService.trackParcel(code),
    logout: window.logout
};

console.log('✅ Vendor Dashboard v1.0.0 loaded successfully');
// This continues directly from where Part 4 left off at the initializeGooglePlaces function
// This should be around line 2300+ in your complete file

// ═══════════════════════════════════════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    
    // Don't show errors for external scripts
    if (event.filename && !event.filename.includes(window.location.hostname)) {
        return;
    }
    
    // Show user-friendly error for critical errors
    if (event.error && event.error.stack && event.error.stack.includes('vendor')) {
        utils.showNotification('Something went wrong. Please refresh the page.', 'error');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    // Show notification for API errors
    if (event.reason && event.reason.message && event.reason.message.includes('API')) {
        utils.showNotification('Connection error. Please check your internet.', 'error');
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CSS Injection for Dynamic Styles
// ═══════════════════════════════════════════════════════════════════════════

function injectStyles() {
    if (document.getElementById('vendor-dashboard-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'vendor-dashboard-styles';
    styles.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
        
        .notification {
            animation: slideInRight 0.3s ease-out;
        }
        
        .saved-location-chip:hover {
            background: var(--primary) !important;
            color: white !important;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 102, 255, 0.2);
        }
        
        .delivery-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        
        .history-item:hover {
            background: var(--surface-high) !important;
            transform: translateX(4px);
        }
        
        .service-card {
            transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        
        .service-card:hover:not(.selected) {
            transform: translateY(-4px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        }
        
        .size-option {
            transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        
        .size-option:hover:not(.selected) {
            transform: scale(1.05);
            border-color: var(--primary);
        }
    `;
    
    document.head.appendChild(styles);
}

// ═══════════════════════════════════════════════════════════════════════════
// Service Worker Registration (for offline support)
// ═══════════════════════════════════════════════════════════════════════════

async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered:', registration);
        } catch (error) {
            console.log('Service Worker registration failed:', error);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Performance Monitoring
// ═══════════════════════════════════════════════════════════════════════════

function monitorPerformance() {
    if (window.performance && window.performance.timing) {
        window.addEventListener('load', () => {
            setTimeout(() => {
                const timing = window.performance.timing;
                const loadTime = timing.loadEventEnd - timing.navigationStart;
                console.log(`Page load time: ${loadTime}ms`);
                
                // Report slow loads
                if (loadTime > 5000) {
                    console.warn('Slow page load detected:', loadTime);
                }
            }, 0);
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Telegram WebApp Integration
// ═══════════════════════════════════════════════════════════════════════════

function initializeTelegramWebApp() {
    if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        
        // Use Telegram user data if available
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            const user = tg.initDataUnsafe.user;
            console.log('Telegram user detected:', user.first_name);
            
            // Pre-fill vendor name if not set
            const vendorNameInput = document.getElementById('vendorName');
            if (vendorNameInput && !vendorNameInput.value) {
                vendorNameInput.value = `${user.first_name} ${user.last_name || ''}`.trim();
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Debug Utilities (Development Only)
// ═══════════════════════════════════════════════════════════════════════════

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.debug = {
        state: dashboardState,
        services: {
            auth: authService,
            booking: bookingService,
            location: locationService,
            tracking: trackingService,
            vendor: vendorDashboard
        },
        utils: utils,
        
        // Debug functions
        simulateBooking: async function() {
            dashboardState.set({
                pickupCoords: { lat: -1.2921, lng: 36.8219, display_name: 'Nairobi CBD' },
                deliveryCoords: { lat: -1.2821, lng: 36.8319, display_name: 'Westlands' },
                distance: 5,
                duration: 15,
                selectedService: 'smart',
                selectedSize: 'small',
                itemCount: 1
            });
            
            const formData = {
                vendorName: 'Test Vendor',
                vendorPhone: '0700000000',
                recipientName: 'Test Recipient',
                recipientPhone: '0700000001',
                packageDescription: 'Test Package',
                packageCategory: 'documents',
                specialInstructions: 'Test delivery'
            };
            
            return await bookingService.submitBooking(formData);
        },
        
        clearCache: function() {
            geocodeCache.clear();
            distanceCache.clear();
            localStorage.clear();
            sessionStorage.clear();
            console.log('All caches cleared');
        },
        
        showState: function() {
            console.table(dashboardState.state);
        }
    };
    
    console.log('🛠️ Debug mode enabled. Access debug utilities via window.debug');
}

// ═══════════════════════════════════════════════════════════════════════════
// Additional Window Functions
// ═══════════════════════════════════════════════════════════════════════════

// Toggle delivery type (single vs bulk)
window.toggleDeliveryType = function(type) {
    const singleBtn = document.getElementById('singleBtn');
    const bulkBtn = document.getElementById('bulkBtn');
    const singleSection = document.getElementById('singleDeliverySection');
    const singleLocation = document.getElementById('singleDeliveryLocation');
    const bulkSection = document.getElementById('bulkDeliverySection');
    
    if (type === 'single') {
        singleBtn.classList.add('active');
        bulkBtn.classList.remove('active');
        singleSection.style.display = 'block';
        singleLocation.style.display = 'block';
        bulkSection.style.display = 'none';
        dashboardState.set('deliveryType', 'single');
    } else {
        singleBtn.classList.remove('active');
        bulkBtn.classList.add('active');
        singleSection.style.display = 'none';
        singleLocation.style.display = 'none';
        bulkSection.style.display = 'block';
        dashboardState.set('deliveryType', 'bulk');
        utils.showNotification('Bulk delivery saves you more! Add multiple drop-off points.', 'info');
    }
};

// Add bulk delivery
window.addBulkDelivery = function() {
    const bulkDeliveries = dashboardState.get('bulkDeliveries') || [];
    const newIndex = bulkDeliveries.length;
    
    const container = document.getElementById('bulkDeliveries');
    const deliveryItem = document.createElement('div');
    deliveryItem.className = 'bulk-delivery-item';
    deliveryItem.style.cssText = 'margin-bottom: 16px; padding: 16px; background: var(--surface-elevated); border-radius: 12px; border: 1px solid var(--border);';
    
    deliveryItem.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h4 style="font-size: 14px; font-weight: 600;">Delivery ${newIndex + 1}</h4>
            <button type="button" onclick="removeBulkDelivery(${newIndex})" style="width: 28px; height: 28px; border-radius: 50%; background: var(--danger); border: none; color: white; cursor: pointer;">×</button>
        </div>
        <div style="display: grid; gap: 12px;">
            <input type="text" class="input-field" placeholder="Recipient name" id="bulkRecipient${newIndex}">
            <input type="tel" class="input-field" placeholder="Recipient phone" id="bulkPhone${newIndex}">
            <div class="input-container">
                <input type="text" class="input-field" placeholder="Delivery address" id="bulkAddress${newIndex}">
                <button type="button" class="input-action" onclick="getLocation('bulk${newIndex}')">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5Z"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
    
    container.appendChild(deliveryItem);
    bulkDeliveries.push({ index: newIndex });
    dashboardState.set('bulkDeliveries', bulkDeliveries);
};

// Remove bulk delivery
window.removeBulkDelivery = function(index) {
    const bulkDeliveries = dashboardState.get('bulkDeliveries') || [];
    bulkDeliveries.splice(index, 1);
    dashboardState.set('bulkDeliveries', bulkDeliveries);
    
    // Rebuild UI
    const container = document.getElementById('bulkDeliveries');
    container.innerHTML = '';
    bulkDeliveries.forEach((_, i) => addBulkDelivery());
};

// Open simple location modal (if using Leaflet map)
window.openSimpleLocationModal = function(inputId) {
    console.log('Opening location modal for:', inputId);
    // Implementation would go here if using Leaflet
    utils.showNotification('Map selection coming soon!', 'info');
};

// Confirm location from modal
window.confirmSimpleLocation = function() {
    console.log('Confirming location selection');
    // Implementation would go here
};

// Close location modal
window.closeLocationModal = function() {
    const modal = document.getElementById('simpleLocationModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Final Initialization Call
// ═══════════════════════════════════════════════════════════════════════════

// Inject styles on load
document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    registerServiceWorker();
    monitorPerformance();
    initializeTelegramWebApp();
});

// ═══════════════════════════════════════════════════════════════════════════
// END OF vendor.js
// ═══════════════════════════════════════════════════════════════════════════

console.log('✅ vendor.js fully loaded - all systems ready!');
