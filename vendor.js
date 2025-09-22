/**
 * Vendor Dashboard - Tuma Delivery
 * Complete Implementation v1.0.0
 */

console.log('🚀 Loading Vendor Dashboard v1.0.0...');

// ═══════════════════════════════════════════════════════════════════════════
// Configuration & Constants
// ═══════════════════════════════════════════════════════════════════════════

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
            // Authentication
            isAuthenticated: false,
            currentVendor: null,
            vendorId: null,
            
            // Dashboard
            activeTab: 'new-booking',
            activeDeliveries: [],
            deliveryHistory: [],
            
            // Form State
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
            
            // UI State
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
}

const dashboardState = new DashboardState();

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
    
    generateCode: (prefix) => {
        return prefix + Math.random().toString(36).substr(2, 6).toUpperCase();
    },
    
    calculateDistance: (point1, point2) => {
        if (!point1 || !point2) return 0;
        
        const R = 6371; // Earth's radius in km
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
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Tab Management
// ═══════════════════════════════════════════════════════════════════════════

window.switchTab = function(tabName) {
    console.log('Switching to tab:', tabName);
    
    // Update tab buttons
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    // Find tab by checking its onclick attribute
    document.querySelectorAll('.tab-item').forEach(tab => {
        if (tab.getAttribute('onclick')?.includes(tabName)) {
            tab.classList.add('active');
        }
    });
    
    // Activate selected panel
    const selectedPanel = document.getElementById(`${tabName}-panel`);
    if (selectedPanel) {
        selectedPanel.classList.add('active');
    }
    
    dashboardState.set('activeTab', tabName);
    
    // Load tab-specific data
    switch(tabName) {
        case 'active':
            loadActiveDeliveries();
            break;
        case 'history':
            loadDeliveryHistory();
            break;
        case 'track':
            loadRecentTracks();
            break;
    }
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
        
        // Update pricing if distance is known
        const distance = dashboardState.get('distance');
        if (distance > 0) {
            updatePricing(distance);
        }
    }
};

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

window.toggleAffiliateCode = function() {
    const toggle = document.getElementById('affiliateToggle');
    const inputGroup = document.getElementById('affiliateInputGroup');
    
    toggle.classList.toggle('active');
    inputGroup.classList.toggle('active');
    
    if (toggle.classList.contains('active')) {
        document.getElementById('affiliateCode').focus();
    } else {
        // Clear affiliate code
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
        // Query agents table
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

window.repeatLastOrder = function() {
    console.log('Repeat last order clicked');
    utils.showNotification('Feature coming soon!', 'info');
};

window.showSavedRecipients = function() {
    console.log('Show saved recipients clicked');
    utils.showNotification('Feature coming soon!', 'info');
};

window.addBulkDelivery = function() {
    console.log('Add bulk delivery clicked');
    utils.showNotification('Bulk delivery feature coming soon!', 'info');
};

function updateCapacityDisplay() {
    const itemCount = dashboardState.get('itemCount');
    const selectedSize = dashboardState.get('selectedSize');
    const sizeConfig = BUSINESS_CONFIG.packageSizes[selectedSize];
    
    const totalUnits = itemCount * sizeConfig.units;
    const vehiclesNeeded = Math.ceil(totalUnits / BUSINESS_CONFIG.vehicleCapacity.motorcycle);
    
    const capacityText = document.getElementById('capacityText');
    const capacityFill = document.getElementById('capacityFill');
    const capacityIcon = document.getElementById('capacityIcon');
    
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

function updatePricing(distance) {
    const service = dashboardState.get('selectedService');
    const rates = BUSINESS_CONFIG.pricing.rates;
    const multipliers = BUSINESS_CONFIG.pricing.multipliers;
    
    const basePrice = rates.base + (distance * rates.perKm);
    
    // Update service prices
    document.getElementById('expressPrice').textContent = 
        utils.formatCurrency(basePrice * multipliers.service.express);
    document.getElementById('smartPrice').textContent = 
        utils.formatCurrency(basePrice * multipliers.service.smart);
    document.getElementById('ecoPrice').textContent = 
        utils.formatCurrency(basePrice * multipliers.service.eco);
    
    // Hide hint
    document.getElementById('servicePriceHint').style.display = 'none';
    
    // Enable submit button
    checkFormValidity();
}

function checkFormValidity() {
    const submitBtn = document.getElementById('submitBtn');
    const buttonText = document.getElementById('buttonText');
    
    const hasPickup = dashboardState.get('pickupCoords');
    const hasDelivery = dashboardState.get('deliveryCoords');
    const hasDistance = dashboardState.get('distance') > 0;
    
    if (hasPickup && hasDelivery && hasDistance) {
        const service = dashboardState.get('selectedService');
        const distance = dashboardState.get('distance');
        const basePrice = BUSINESS_CONFIG.pricing.rates.base + (distance * BUSINESS_CONFIG.pricing.rates.perKm);
        const totalPrice = basePrice * BUSINESS_CONFIG.pricing.multipliers.service[service];
        
        submitBtn.disabled = false;
        submitBtn.style.background = 'var(--primary)';
        buttonText.textContent = `Book Delivery - ${utils.formatCurrency(totalPrice)}`;
    } else {
        submitBtn.disabled = true;
        submitBtn.style.background = 'var(--surface-high)';
        buttonText.textContent = 'Enter locations to see price';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Location Services
// ═══════════════════════════════════════════════════════════════════════════

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
        
        // Simple reverse geocoding with OpenStreetMap Nominatim
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}`
        );
        const data = await response.json();
        const address = data.display_name || `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
        
        // Update appropriate input
        let input;
        if (type === 'pickup') {
            input = document.getElementById('pickupLocation');
            dashboardState.set('pickupCoords', { ...coords, display_name: address });
        } else if (type === 'delivery') {
            input = document.getElementById('deliveryLocation');
            dashboardState.set('deliveryCoords', { ...coords, display_name: address });
        }
        
        if (input) {
            input.value = address;
            input.dataset.lat = coords.lat;
            input.dataset.lng = coords.lng;
            input.classList.add('location-confirmed');
        }
        
        // Calculate distance if both locations set
        if (dashboardState.get('pickupCoords') && dashboardState.get('deliveryCoords')) {
            calculateDistance();
        }
        
        utils.showNotification('Location updated!', 'success');
        
    } catch (error) {
        console.error('Location error:', error);
        utils.showNotification('Could not get location. Please type the address.', 'error');
    }
};

window.useGPS = window.getLocation;

function calculateDistance() {
    const pickup = dashboardState.get('pickupCoords');
    const delivery = dashboardState.get('deliveryCoords');
    
    if (!pickup || !delivery) return;
    
    const distance = utils.calculateDistance(pickup, delivery);
    const duration = Math.ceil(distance * 3); // Estimate 3 min per km
    
    dashboardState.set({
        distance: distance,
        duration: duration
    });
    
    // Update UI
    const distanceInfo = document.getElementById('distanceInfo');
    const calculatedDistance = document.getElementById('calculatedDistance');
    const estimatedDuration = document.getElementById('estimatedDuration');
    
    if (distanceInfo) distanceInfo.style.display = 'block';
    if (calculatedDistance) calculatedDistance.textContent = `${distance.toFixed(1)} km`;
    if (estimatedDuration) estimatedDuration.textContent = `~${duration} min`;
    
    // Update pricing
    updatePricing(distance);
}

// ═══════════════════════════════════════════════════════════════════════════
// Success Modal Functions
// ═══════════════════════════════════════════════════════════════════════════

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
    document.getElementById('successOverlay').style.display = 'none';
};

window.bookAnother = function() {
    document.getElementById('successOverlay').style.display = 'none';
    resetBookingForm();
    window.scrollTo(0, 0);
};

window.logout = function() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/';
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Form Submission
// ═══════════════════════════════════════════════════════════════════════════

async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (dashboardState.get('isLoading')) return;
    
    // Gather form data
    const formData = {
        vendorName: document.getElementById('vendorName')?.value,
        vendorPhone: document.getElementById('phoneNumber')?.value,
        recipientName: document.getElementById('recipientName').value,
        recipientPhone: document.getElementById('recipientPhone').value,
        packageDescription: document.getElementById('packageDescription').options[
            document.getElementById('packageDescription').selectedIndex
        ].text,
        packageCategory: document.getElementById('packageDescription').value,
        specialInstructions: document.getElementById('specialInstructions').value,
        affiliateCode: document.getElementById('affiliateCode').value
    };
    
    // Validate required fields
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
    
    // Update button state
    const submitBtn = document.getElementById('submitBtn');
    const buttonText = document.getElementById('buttonText');
    submitBtn.disabled = true;
    buttonText.textContent = 'Processing...';
    dashboardState.set('isLoading', true);
    
    try {
        // Generate codes
        const codes = {
            parcel_code: utils.generateCode('TM'),
            pickup_code: utils.generateCode('PK'),
            delivery_code: utils.generateCode('DL')
        };
        
        // Calculate price
        const distance = dashboardState.get('distance');
        const service = dashboardState.get('selectedService');
        const basePrice = BUSINESS_CONFIG.pricing.rates.base + (distance * BUSINESS_CONFIG.pricing.rates.perKm);
        const serviceMultiplier = BUSINESS_CONFIG.pricing.multipliers.service[service];
        let totalPrice = basePrice * serviceMultiplier;
        
        // Apply affiliate discount if applicable
        const affiliateData = dashboardState.get('affiliateData');
        if (affiliateData) {
            totalPrice = totalPrice * 0.95; // 5% discount
        }
        
        // Prepare parcel data
        const parcelData = {
            ...codes,
            vendor_name: formData.vendorName || 'Anonymous Vendor',
            vendor_phone: formData.vendorPhone || '0700000000',
            vendor_type: 'casual',
            
            // Agent/Affiliate info
            agent_id: affiliateData?.id || null,
            agent_code: affiliateData?.agent_code || null,
            agent_name: affiliateData?.agent_name || null,
            referral_code: formData.affiliateCode || null,
            agent_commission: affiliateData ? Math.round(totalPrice * 0.05) : 0,
            
            // Locations
            pickup_location: dashboardState.get('pickupCoords'),
            delivery_location: dashboardState.get('deliveryCoords'),
            pickup_lat: dashboardState.get('pickupCoords').lat,
            pickup_lng: dashboardState.get('pickupCoords').lng,
            delivery_lat: dashboardState.get('deliveryCoords').lat,
            delivery_lng: dashboardState.get('deliveryCoords').lng,
            
            // Recipient
            recipient_name: formData.recipientName,
            recipient_phone: formData.recipientPhone,
            
            // Package details
            package_description: formData.packageDescription,
            package_category: formData.packageCategory,
            package_type: formData.packageCategory,
            package_size: dashboardState.get('selectedSize'),
            item_count: dashboardState.get('itemCount'),
            special_instructions: formData.specialInstructions || null,
            
            // Service details
            service_type: service,
            customer_choice: service,
            distance_km: distance,
            duration_minutes: dashboardState.get('duration'),
            
            // Pricing
            base_price: basePrice,
            service_multiplier: serviceMultiplier,
            price: totalPrice,
            total_price: totalPrice,
            platform_fee: Math.round(totalPrice * 0.30),
            rider_payout: Math.round(totalPrice * 0.70),
            
            // Payment
            payment_method: 'cash',
            payment_status: 'pending',
            
            // Status
            status: 'submitted',
            created_at: new Date().toISOString()
        };
        
        // Save to database
        const result = await supabaseAPI.insert('parcels', parcelData);
        console.log('✅ Booking created:', result);
        
        // Show success
        showBookingSuccess(codes, totalPrice);
        
        // Reset form
        resetBookingForm();
        
        utils.showNotification('Booking created successfully! 🎉', 'success');
        
    } catch (error) {
        console.error('Booking submission error:', error);
        utils.showNotification('Failed to create booking. Please try again.', 'error');
    } finally {
        dashboardState.set('isLoading', false);
        submitBtn.disabled = false;
        buttonText.textContent = 'Book Delivery';
    }
}

function showBookingSuccess(codes, price) {
    const overlay = document.getElementById('successOverlay');
    
    // Update codes
    document.getElementById('displayParcelCode').textContent = codes.parcel_code;
    document.getElementById('displayPickupCode').textContent = codes.pickup_code;
    document.getElementById('displayDeliveryCode').textContent = codes.delivery_code;
    document.getElementById('displayTotalPrice').textContent = utils.formatCurrency(price);
    
    // Show overlay
    overlay.style.display = 'flex';
}

function resetBookingForm() {
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
    
    // Reset UI elements
    document.getElementById('itemCount').textContent = '1';
    document.getElementById('distanceInfo').style.display = 'none';
    document.getElementById('affiliateToggle').classList.remove('active');
    document.getElementById('affiliateInputGroup').classList.remove('active');
    
    // Reset service selection
    document.querySelectorAll('.service-card').forEach(card => {
        card.classList.remove('selected');
    });
    document.querySelector('[data-service="smart"]').classList.add('selected');
    
    // Reset size selection
    document.querySelectorAll('.size-option').forEach(option => {
        option.classList.remove('selected');
    });
    document.querySelector('[data-size="small"]').classList.add('selected');
    
    updateCapacityDisplay();
}

// ═══════════════════════════════════════════════════════════════════════════
// Data Loading Functions (Placeholders)
// ═══════════════════════════════════════════════════════════════════════════

function loadActiveDeliveries() {
    console.log('Loading active deliveries...');
    // Placeholder - implement actual loading
}

function loadDeliveryHistory() {
    console.log('Loading delivery history...');
    // Placeholder - implement actual loading
}

function loadRecentTracks() {
    console.log('Loading recent tracks...');
    // Placeholder - implement actual loading
}

// ═══════════════════════════════════════════════════════════════════════════
// Event Listeners & Initialization
// ═══════════════════════════════════════════════════════════════════════════

function setupEventListeners() {
    // Form submission
    const form = document.getElementById('dashboardDeliveryForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
    
    // Character counter for special instructions
    const specialInstructions = document.getElementById('specialInstructions');
    if (specialInstructions) {
        specialInstructions.addEventListener('input', (e) => {
            document.getElementById('charCount').textContent = e.target.value.length;
        });
    }
    
    // Location inputs with debounced geocoding
    const pickupInput = document.getElementById('pickupLocation');
    const deliveryInput = document.getElementById('deliveryLocation');
    
    if (pickupInput) {
        pickupInput.addEventListener('change', utils.debounce(async () => {
            if (pickupInput.value && !pickupInput.dataset.lat) {
                try {
                    // Simple geocoding - in production, use a proper geocoding service
                    const coords = { 
                        lat: -1.2921, 
                        lng: 36.8219, 
                        display_name: pickupInput.value 
                    };
                    dashboardState.set('pickupCoords', coords);
                    pickupInput.dataset.lat = coords.lat;
                    pickupInput.dataset.lng = coords.lng;
                    
                    if (dashboardState.get('deliveryCoords')) {
                        calculateDistance();
                    }
                } catch (error) {
                    console.error('Geocoding error:', error);
                }
            }
        }, 1000));
    }
    
    if (deliveryInput) {
        deliveryInput.addEventListener('change', utils.debounce(async () => {
            if (deliveryInput.value && !deliveryInput.dataset.lat) {
                try {
                    // Simple geocoding - in production, use a proper geocoding service
                    const coords = { 
                        lat: -1.2821, 
                        lng: 36.8319, 
                        display_name: deliveryInput.value 
                    };
                    dashboardState.set('deliveryCoords', coords);
                    deliveryInput.dataset.lat = coords.lat;
                    deliveryInput.dataset.lng = coords.lng;
                    
                    if (dashboardState.get('pickupCoords')) {
                        calculateDistance();
                    }
                } catch (error) {
                    console.error('Geocoding error:', error);
                }
            }
        }, 1000));
    }
    
    // Offline/Online handling
    window.addEventListener('online', () => {
        document.getElementById('offlineBanner').style.transform = 'translateY(-100%)';
        utils.showNotification('You\'re back online!', 'success');
    });
    
    window.addEventListener('offline', () => {
        document.getElementById('offlineBanner').style.transform = 'translateY(0)';
    });
}

function initializeUI() {
    // Set initial values
    document.getElementById('itemCount').textContent = '1';
    
    // Initialize capacity display
    updateCapacityDisplay();
    
    // Initialize service selection
    document.querySelector('[data-service="smart"]')?.classList.add('selected');
    
    // Initialize size selection
    document.querySelector('[data-size="small"]')?.classList.add('selected');
    
    // Check online status
    if (!navigator.onLine) {
        document.getElementById('offlineBanner').style.transform = 'translateY(0)';
    }
    
    console.log('✅ UI initialized');
}

async function initializeDashboard() {
    console.log('🚀 Initializing vendor dashboard...');
    
    try {
        // Setup event listeners
        setupEventListeners();
        
        // Initialize UI
        initializeUI();
        
        // Initialize vendor info
        const vendorAvatar = document.getElementById('vendorAvatar');
        const vendorDisplayName = document.getElementById('vendorDisplayName');
        const vendorDisplayPhone = document.getElementById('vendorDisplayPhone');
        
        if (vendorAvatar) vendorAvatar.textContent = 'V';
        if (vendorDisplayName) vendorDisplayName.textContent = 'Vendor Dashboard';
        if (vendorDisplayPhone) vendorDisplayPhone.textContent = 'Ready to book';
        
        console.log('✅ Dashboard initialized successfully');
        
    } catch (error) {
        console.error('❌ Dashboard initialization error:', error);
        utils.showNotification('Failed to initialize dashboard. Please refresh.', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CSS Animations & Styles
// ═══════════════════════════════════════════════════════════════════════════

function injectStyles() {
    if (document.getElementById('vendor-dashboard-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'vendor-dashboard-styles';
    styles.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        
        @keyframes modalBounce {
            0% { transform: scale(0.8); opacity: 0; }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); opacity: 1; }
        }
        
        @keyframes successBounce {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
        }
        
        .notification {
            animation: slideInRight 0.3s ease-out;
        }
        
        .tab-panel {
            animation: fadeIn 0.3s ease-out;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    
    document.head.appendChild(styles);
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded - Starting initialization...');
    
    // Inject required styles
    injectStyles();
    
    // Initialize dashboard
    await initializeDashboard();
    
    // Telegram WebApp integration (if applicable)
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
    
    console.log('🎉 Vendor Dashboard ready!');
});

// ═══════════════════════════════════════════════════════════════════════════
// Export for external use
// ═══════════════════════════════════════════════════════════════════════════

window.TumaVendorDashboard = {
    version: '1.0.0',
    state: dashboardState,
    utils: utils,
    initialize: initializeDashboard,
    switchTab: window.switchTab
};

console.log('✅ Vendor Dashboard v1.0.0 loaded successfully');
