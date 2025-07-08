/**
 * Vendor Page Entry Script - Fixed Database Integration
 * Handles vendor dashboard functionality with direct Supabase REST API calls
 */

// Import configuration
import { BUSINESS_CONFIG } from './config.js';

// Simple form state management
class FormState {
    constructor() {
        this.state = {
            vendorType: 'casual',
            agentCode: null,
            agentName: null,
            pickupCoords: null,
            deliveryCoords: null,
            distance: 0,
            selectedService: 'smart',
            selectedSize: 'small',
            itemCount: 1,
            isLoading: false
        };
        this.subscribers = {};
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
            if (!this.subscribers[key]) this.subscribers[key] = [];
            this.subscribers[key].push(callback);
        });
    }

    notify(key) {
        if (this.subscribers[key]) {
            this.subscribers[key].forEach(callback => callback(this.state[key]));
        }
    }

    reset() {
        this.state = {
            vendorType: 'casual',
            agentCode: null,
            agentName: null,
            pickupCoords: null,
            deliveryCoords: null,
            distance: 0,
            selectedService: 'smart',
            selectedSize: 'small',
            itemCount: 1,
            isLoading: false
        };
    }
}

// Initialize form state
const formState = new FormState();

// Configuration from config.js
const SUPABASE_URL = window.CONFIG?.supabase?.url || 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = window.CONFIG?.supabase?.anonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZmZ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY4MjkxOTgsImV4cCI6MjA1MjQwNTE5OH0.kQKpukFGx-cB11zZRuXmex02ifkZ751WCUfQPogYutk';

// DOM elements
const elements = {
    vendorName: document.getElementById('vendorName'),
    phoneNumber: document.getElementById('phoneNumber'),
    pickupLocation: document.getElementById('pickupLocation'),
    deliveryLocation: document.getElementById('deliveryLocation'),
    recipientName: document.getElementById('recipientName'),
    recipientPhone: document.getElementById('recipientPhone'),
    packageDescription: document.getElementById('packageDescription'),
    specialInstructions: document.getElementById('specialInstructions'),
    submitBtn: document.getElementById('submitBtn'),
    buttonText: document.getElementById('buttonText'),
    itemCount: document.getElementById('itemCount'),
    capacityText: document.getElementById('capacityText'),
    capacityFill: document.getElementById('capacityFill'),
    capacityIcon: document.getElementById('capacityIcon'),
    calculatedDistance: document.getElementById('calculatedDistance'),
    distanceInfo: document.getElementById('distanceInfo'),
    vendorBadge: document.getElementById('vendorBadge'),
    vendorBadgeContent: document.getElementById('vendorBadgeContent'),
    expressPrice: document.getElementById('expressPrice'),
    smartPrice: document.getElementById('smartPrice'),
    ecoPrice: document.getElementById('ecoPrice'),
    servicePriceHint: document.getElementById('servicePriceHint'),
    successOverlay: document.getElementById('successOverlay'),
    displayParcelCode: document.getElementById('displayParcelCode'),
    displayPickupCode: document.getElementById('displayPickupCode'),
    displayDeliveryCode: document.getElementById('displayDeliveryCode')
};

// Utility functions
const validation = {
    formatPhone: (phone) => {
        return phone.replace(/\D/g, '').slice(0, 10);
    },
    
    validatePhone: (phone) => {
        return /^0[0-9]{9}$/.test(phone);
    },
    
    validateRequired: (fields) => {
        const missing = Object.entries(fields).filter(([key, value]) => !value || value.trim() === '');
        return {
            isValid: missing.length === 0,
            missing: missing.map(([key]) => key)
        };
    },
    
    validateCapacity: (itemCount, selectedSize) => {
        const sizeConfig = BUSINESS_CONFIG.packageSizes[selectedSize];
        const totalUnits = itemCount * sizeConfig.units;
        const vehiclesNeeded = Math.ceil(totalUnits / BUSINESS_CONFIG.vehicleCapacity.motorcycle);
        
        return {
            isValid: vehiclesNeeded <= 2,
            totalUnits,
            vehiclesNeeded
        };
    }
};

const pricing = {
    calculate: (distance, serviceType, options = {}) => {
        if (distance <= 0) return 0;
        
        const rates = BUSINESS_CONFIG.pricing.rates;
        const multipliers = BUSINESS_CONFIG.pricing.multipliers;
        
        let basePrice = rates.base + (distance * rates.perKm);
        
        // Apply service multiplier
        if (multipliers.service[serviceType]) {
            basePrice *= multipliers.service[serviceType];
        }
        
        // Apply managed vendor discount
        if (options.isManaged) {
            basePrice *= multipliers.managedVendor;
        }
        
        return Math.round(basePrice);
    },
    
    formatPrice: (price) => {
        return `KES ${price.toLocaleString()}`;
    }
};

const codes = {
    generateParcelCode: () => {
        return 'TM' + Math.random().toString(36).substr(2, 6).toUpperCase();
    },
    
    generatePickupCode: () => {
        return 'PK' + Math.random().toString(36).substr(2, 6).toUpperCase();
    },
    
    generateDeliveryCode: () => {
        return 'DL' + Math.random().toString(36).substr(2, 6).toUpperCase();
    }
};

// Database functions using direct REST API calls
const supabaseAPI = {
    async query(table, options = {}) {
        const { select = '*', filter = '', limit } = options;
        
        let url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}`;
        if (filter) url += `&${filter}`;
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
    }
};

// Geocoding functions
async function geocodeAddress(address) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.length === 0) {
        throw new Error('Address not found');
    }
    
    return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
    };
}

function calculateStraightDistance(pickup, delivery) {
    const R = 6371; // Earth's radius in km
    const dLat = (delivery.lat - pickup.lat) * Math.PI / 180;
    const dLng = (delivery.lng - pickup.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(pickup.lat * Math.PI / 180) * Math.cos(delivery.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Notification functions
function showNotification(message, type = 'info') {
    // Simple notification implementation
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#ff3b30' : '#34c759'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 3000;
        font-weight: 600;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Initialize page
async function initialize() {
    setupEventListeners();
    setupStateSubscriptions();
    updateCapacityDisplay();
    
    // Set default service selection
    formState.set('selectedService', 'smart');
    formState.set('selectedSize', 'small');
}

// Setup event listeners
function setupEventListeners() {
    // Phone number input
    elements.phoneNumber?.addEventListener('input', handlePhoneInput);
    elements.recipientPhone?.addEventListener('input', handleRecipientPhoneInput);
    
    // Location inputs
    elements.pickupLocation?.addEventListener('change', () => handleLocationChange('pickup'));
    elements.deliveryLocation?.addEventListener('change', () => handleLocationChange('delivery'));
    
    // Character counter
    elements.specialInstructions?.addEventListener('input', (e) => {
        document.getElementById('charCount').textContent = e.target.value.length;
    });
    
    // Form submission
    document.getElementById('deliveryForm')?.addEventListener('submit', handleFormSubmit);
}

// Setup state subscriptions
function setupStateSubscriptions() {
    formState.subscribe(['pickupCoords', 'deliveryCoords'], () => {
        checkFormValidity();
    });
    
    formState.subscribe(['itemCount', 'selectedSize'], () => {
        updateCapacityDisplay();
    });
    
    formState.subscribe('distance', (distance) => {
        if (distance > 0) {
            updatePricing();
        }
    });
}

// Handle phone input
async function handlePhoneInput(e) {
    let value = validation.formatPhone(e.target.value);
    e.target.value = value;
    
    if (value.length === 10) {
        try {
            // Check if vendor exists and is managed
            const vendors = await supabaseAPI.query('vendors', {
                filter: `phone=eq.${value}`,
                limit: 1
            });
            
            if (vendors.length > 0 && vendors[0].is_managed) {
                // Get agent info
                const managedVendors = await supabaseAPI.query('managed_vendors', {
                    select: 'agent_id,agents(name)',
                    filter: `vendor_id=eq.${vendors[0].id}`,
                    limit: 1
                });
                
                if (managedVendors.length > 0) {
                    formState.set({
                        vendorType: 'managed',
                        agentCode: managedVendors[0].agent_id,
                        agentName: managedVendors[0].agents.name
                    });
                    
                    displayVendorBadge({
                        isManaged: true,
                        agentName: managedVendors[0].agents.name
                    });
                }
            } else {
                formState.set({
                    vendorType: 'casual',
                    agentCode: null,
                    agentName: null
                });
                elements.vendorBadge.style.display = 'none';
            }
        } catch (error) {
            console.error('Error checking vendor type:', error);
        }
    }
}

// Handle recipient phone input
function handleRecipientPhoneInput(e) {
    e.target.value = validation.formatPhone(e.target.value);
}

// Display vendor badge
function displayVendorBadge(vendorInfo) {
    if (vendorInfo.isManaged && vendorInfo.agentName) {
        elements.vendorBadge.style.display = 'block';
        elements.vendorBadgeContent.className = 'vendor-badge managed';
        elements.vendorBadgeContent.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
            </svg>
            <span>Managed by ${vendorInfo.agentName}</span>
        `;
    } else {
        elements.vendorBadge.style.display = 'none';
    }
}

// Handle location change
async function handleLocationChange(type) {
    const input = type === 'pickup' ? elements.pickupLocation : elements.deliveryLocation;
    const address = input.value;
    
    if (!address) return;
    
    try {
        const coords = await geocodeAddress(address);
        formState.set(`${type}Coords`, coords);
        
        // Check if both locations are set
        if (formState.get('pickupCoords') && formState.get('deliveryCoords')) {
            await calculateDistance();
        }
    } catch (error) {
        console.error('Geocoding error:', error);
        showNotification('Could not find the address. Please try again.', 'error');
    }
}

// Calculate distance between pickup and delivery
async function calculateDistance() {
    const pickup = formState.get('pickupCoords');
    const delivery = formState.get('deliveryCoords');
    
    if (!pickup || !delivery) return;
    
    const distance = calculateStraightDistance(pickup, delivery) * 1.3; // Add 30% for road distance
    formState.set('distance', distance);
    
    // Update UI
    elements.calculatedDistance.textContent = `${distance.toFixed(2)} km`;
    elements.distanceInfo.style.display = 'block';
    
    updateProgress(2);
}

// Update pricing display
function updatePricing() {
    const distance = formState.get('distance');
    if (distance <= 0) return;
    
    const options = {
        isManaged: formState.get('vendorType') === 'managed'
    };
    
    elements.expressPrice.textContent = pricing.formatPrice(
        pricing.calculate(distance, 'express', options)
    );
    elements.smartPrice.textContent = pricing.formatPrice(
        pricing.calculate(distance, 'smart', options)
    );
    elements.ecoPrice.textContent = pricing.formatPrice(
        pricing.calculate(distance, 'eco', options)
    );
    
    elements.servicePriceHint.style.display = 'none';
}

// Update capacity display
function updateCapacityDisplay() {
    const itemCount = formState.get('itemCount');
    const selectedSize = formState.get('selectedSize');
    
    const result = validation.validateCapacity(itemCount, selectedSize);
    const sizeConfig = BUSINESS_CONFIG.packageSizes[selectedSize];
    
    if (result.isValid) {
        const itemText = itemCount === 1 ? 'item' : 'items';
        elements.capacityText.textContent = `${itemCount} ${sizeConfig.label.toLowerCase()} ${itemText} • Fits on one motorcycle`;
        elements.capacityIcon.textContent = '✓';
        elements.capacityIcon.className = 'capacity-icon';
    } else {
        elements.capacityText.textContent = `${itemCount} ${sizeConfig.label.toLowerCase()} items • Needs ${result.vehiclesNeeded} motorcycles`;
        elements.capacityIcon.textContent = result.vehiclesNeeded > 2 ? '✕' : '!';
        elements.capacityIcon.className = `capacity-icon ${result.vehiclesNeeded > 2 ? 'danger' : 'warning'}`;
    }
    
    const capacityPercentage = Math.min((result.totalUnits / BUSINESS_CONFIG.vehicleCapacity.motorcycle) * 100, 100);
    elements.capacityFill.style.width = `${capacityPercentage}%`;
    elements.capacityFill.className = `capacity-fill ${result.vehiclesNeeded > 2 ? 'danger' : result.vehiclesNeeded > 1 ? 'warning' : ''}`;
}

// Check form validity
function checkFormValidity() {
    const pickup = formState.get('pickupCoords');
    const delivery = formState.get('deliveryCoords');
    const distance = formState.get('distance');
    
    if (pickup && delivery && distance > 0) {
        elements.submitBtn.disabled = false;
        elements.buttonText.textContent = 'Book Delivery';
    } else {
        elements.submitBtn.disabled = true;
        elements.buttonText.textContent = 'Enter locations to see price';
    }
}

// Handle form submission
async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (formState.get('isLoading')) return;
    
    // Validate form
    const validationResult = validation.validateRequired({
        vendorName: elements.vendorName.value,
        phoneNumber: elements.phoneNumber.value,
        pickupLocation: elements.pickupLocation.value,
        deliveryLocation: elements.deliveryLocation.value,
        recipientName: elements.recipientName.value,
        recipientPhone: elements.recipientPhone.value
    });
    
    if (!validationResult.isValid) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    // Validate phone numbers
    if (!validation.validatePhone(elements.phoneNumber.value)) {
        showNotification('Please enter a valid vendor phone number', 'error');
        return;
    }
    
    if (!validation.validatePhone(elements.recipientPhone.value)) {
        showNotification('Please enter a valid recipient phone number', 'error');
        return;
    }
    
    // Show loading state
    formState.set('isLoading', true);
    elements.submitBtn.classList.add('loading');
    elements.buttonText.textContent = 'Processing...';
    
    try {
        // Generate codes
        const deliveryCodes = {
            parcel_code: codes.generateParcelCode(),
            tracking_code: codes.generatePickupCode() + codes.generateDeliveryCode()
        };
        
        // Calculate final price
        const finalPrice = pricing.calculate(
            formState.get('distance'),
            formState.get('selectedService'),
            {
                isManaged: formState.get('vendorType') === 'managed'
            }
        );
        
        // Prepare parcel data for database
        const parcelData = {
            ...deliveryCodes,
            sender_name: elements.vendorName.value,
            sender_phone: elements.phoneNumber.value,
            pickup_address: elements.pickupLocation.value,
            delivery_address: elements.deliveryLocation.value,
            pickup_lat: formState.get('pickupCoords').lat,
            pickup_lng: formState.get('pickupCoords').lng,
            delivery_lat: formState.get('deliveryCoords').lat,
            delivery_lng: formState.get('deliveryCoords').lng,
            recipient_name: elements.recipientName.value,
            recipient_phone: elements.recipientPhone.value,
            service_type: formState.get('selectedService'),
            distance_km: formState.get('distance'),
            price_kes: finalPrice,
            package_description: elements.packageDescription.value,
            special_instructions: elements.specialInstructions.value,
            status: 'pending',
            created_at: new Date().toISOString()
        };
        
        // Save to database
        const result = await supabaseAPI.insert('parcels', parcelData);
        
        // Create vendor record if new
        try {
            const vendorData = {
                phone: elements.phoneNumber.value,
                name: elements.vendorName.value,
                is_managed: formState.get('vendorType') === 'managed',
                created_at: new Date().toISOString()
            };
            
            await supabaseAPI.insert('vendors', vendorData);
        } catch (vendorError) {
            // Vendor might already exist, that's OK
            console.log('Vendor already exists or error creating vendor:', vendorError);
        }
        
        // Show success
        showSuccess({
            parcelCode: deliveryCodes.parcel_code,
            pickupCode: deliveryCodes.tracking_code.slice(0, 8),
            deliveryCode: deliveryCodes.tracking_code.slice(8)
        }, finalPrice);
        
        updateProgress(4);
        showNotification('Booking created successfully!', 'success');
        
    } catch (error) {
        console.error('Booking error:', error);
        showNotification('Failed to create booking. Please try again.', 'error');
    } finally {
        formState.set('isLoading', false);
        elements.submitBtn.classList.remove('loading');
        elements.buttonText.textContent = 'Book Delivery';
    }
}

// Show success modal
function showSuccess(codes, price) {
    elements.displayParcelCode.textContent = codes.parcelCode;
    elements.displayPickupCode.textContent = codes.pickupCode;
    elements.displayDeliveryCode.textContent = codes.deliveryCode;
    
    elements.successOverlay.style.display = 'flex';
}

// Update progress indicator
function updateProgress(step) {
    const steps = document.querySelectorAll('.step');
    const progressFill = document.getElementById('progressFill');
    
    steps.forEach((s, index) => {
        s.classList.remove('active', 'completed');
        if (index < step - 1) {
            s.classList.add('completed');
        } else if (index === step - 1) {
            s.classList.add('active');
        }
    });
    
    progressFill.style.width = `${(step / 4) * 100}%`;
}

// Global functions (called from HTML)
window.updateItemCount = function(change) {
    const currentCount = formState.get('itemCount');
    const newCount = currentCount + change;
    
    if (newCount >= 1 && newCount <= 20) {
        formState.set('itemCount', newCount);
        elements.itemCount.textContent = newCount;
        
        document.getElementById('decreaseBtn').disabled = newCount === 1;
        document.getElementById('increaseBtn').disabled = newCount === 20;
    }
};

window.selectSize = function(size) {
    document.querySelectorAll('.size-option').forEach(el => el.classList.remove('selected'));
    const selected = document.querySelector(`[data-size="${size}"]`);
    if (selected) {
        selected.classList.add('selected');
        formState.set('selectedSize', size);
    }
};

window.selectService = function(service) {
    document.querySelectorAll('.service-card').forEach(el => el.classList.remove('selected'));
    const selected = document.querySelector(`[data-service="${service}"]`);
    if (selected) {
        selected.classList.add('selected');
        formState.set('selectedService', service);
        updateProgress(3);
    }
};

window.getLocation = async function(type) {
    try {
        if (!navigator.geolocation) {
            throw new Error('Geolocation not supported');
        }
        
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        
        const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };
        
        // Reverse geocode to get address
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}`);
        const data = await response.json();
        
        const input = type === 'pickup' ? elements.pickupLocation : elements.deliveryLocation;
        input.value = data.display_name;
        
        formState.set(`${type}Coords`, coords);
        
        if (formState.get('pickupCoords') && formState.get('deliveryCoords')) {
            await calculateDistance();
        }
    } catch (error) {
        showNotification('Could not get your location. Please enable GPS or type the address.', 'error');
    }
};

window.shareDeliveryDetails = async function() {
    const parcelCode = elements.displayParcelCode.textContent;
    const deliveryCode = elements.displayDeliveryCode.textContent;
    
    const shareData = {
        title: 'Tuma Delivery Details',
        text: `Your parcel ${parcelCode} is on the way! Delivery code: ${deliveryCode}`,
        url: window.location.origin
    };
    
    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (error) {
            // Fallback to clipboard
            await navigator.clipboard.writeText(shareData.text);
            showNotification('Details copied to clipboard!', 'success');
        }
    } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(shareData.text);
        showNotification('Details copied to clipboard!', 'success');
    }
};

window.bookAnother = function() {
    elements.successOverlay.style.display = 'none';
    document.getElementById('deliveryForm').reset();
    formState.reset();
    updateCapacityDisplay();
    updateProgress(1);
    elements.distanceInfo.style.display = 'none';
    elements.vendorBadge.style.display = 'none';
    document.getElementById('mainContent').scrollTop = 0;
    
    // Reset form state visually
    elements.itemCount.textContent = '1';
    document.querySelectorAll('.size-option').forEach(el => el.classList.remove('selected'));
    document.querySelector('[data-size="small"]').classList.add('selected');
    document.querySelectorAll('.service-card').forEach(el => el.classList.remove('selected'));
    document.querySelector('[data-service="smart"]').classList.add('selected');
};

// Initialize on load
window.addEventListener('DOMContentLoaded', initialize);
