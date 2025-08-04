/**
 * Vendor Page Entry Script - Complete Working Version
 * Handles vendor dashboard functionality with direct Supabase REST API calls
 */

// ─── Configuration ─────────────────────────────────────────────────────────

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
            base: 100, // KES base price
            perKm: 20  // KES per km
        },
        multipliers: {
            service: {
                express: 1.4,
                smart: 1.0,
                eco: 0.8
            },
            managedVendor: 0.9
        }
    },
    serviceArea: {
        center: { lat: -1.2921, lng: 36.8219 }, // Nairobi CBD
        radiusKm: 30, // Increased to 30km service radius
        expandedRadiusKm: 40 // Future expansion radius
    },
    packageCompatibility: {
        incompatibleGroups: [
            ['food-dry', 'food-fresh', 'food-frozen', 'beverages'],
            ['pharmaceuticals', 'medical-equipment', 'supplements'],
            ['cleaning', 'liquids-sealed', 'paint'],
            ['perfumes', 'cosmetics'],
        ],
        specialHandling: {
            'food-fresh': { maxDelay: 60, priority: 'high' },
            'food-frozen': { maxDelay: 45, priority: 'urgent' },
            'pharmaceuticals': { secure: true, priority: 'high' },
            'medical-equipment': { secure: true, fragile: true },
            'glassware': { fragile: true, padding: 'extra' },
            'artwork': { fragile: true, padding: 'extra' },
            'fragile-general': { fragile: true },
            'electronics-fragile': { fragile: true, waterproof: true },
            'laptop': { fragile: true, secure: true },
            'phone': { secure: true }
        }
    }
};

// Supabase Configuration
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

// ─── State Management ──────────────────────────────────────────────────────

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
            selectedPaymentMethod: 'cash',
            itemCount: 1,
            packageType: '',
            isLoading: false,
            isAuthenticated: false,
            authenticatedVendor: null
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
        
        // Auto-trigger form validation on relevant changes
        if (key === 'distance' || key === 'pickupCoords' || key === 'deliveryCoords') {
            setTimeout(() => checkFormValidity(), 100);
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
        const defaultState = {
            vendorType: 'casual',
            agentCode: null,
            agentName: null,
            pickupCoords: null,
            deliveryCoords: null,
            distance: 0,
            selectedService: 'smart',
            selectedSize: 'small',
            selectedPaymentMethod: 'cash',
            itemCount: 1,
            packageType: '',
            isLoading: false,
            isAuthenticated: false,
            authenticatedVendor: null
        };
        this.state = { ...defaultState };
        Object.keys(defaultState).forEach(key => this.notify(key));
    }
}

// Initialize form state
const formState = new FormState();

// ─── DOM Elements ──────────────────────────────────────────────────────────

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
    displayDeliveryCode: document.getElementById('displayDeliveryCode'),
    displayTotalPrice: document.getElementById('displayTotalPrice')
};

// ─── Utility Functions ─────────────────────────────────────────────────────

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
    },
    
    validateServiceArea: (coords) => {
        const lat = parseFloat(coords.lat);
        const lng = parseFloat(coords.lng);
        
        if (isNaN(lat) || isNaN(lng)) {
            console.error('Invalid coordinates for service area validation:', coords);
            return {
                isValid: false,
                distance: 999,
                maxRadius: BUSINESS_CONFIG.serviceArea.radiusKm
            };
        }
        
        const validCoords = { lat: lat, lng: lng };
        const center = BUSINESS_CONFIG.serviceArea.center;
        const distance = calculateStraightDistance(center, validCoords);
        const maxRadius = BUSINESS_CONFIG.serviceArea.radiusKm;
        
        console.log('Service area validation:', {
            location: validCoords,
            locationAddress: coords.display_name || coords.formatted_address || 'Unknown',
            center: center,
            distance: distance.toFixed(2) + 'km',
            maxRadius: maxRadius + 'km',
            isValid: distance <= maxRadius
        });
        
        return {
            isValid: distance <= maxRadius,
            distance: distance,
            maxRadius: maxRadius
        };
    }
};

const pricing = {
    calculate: (distance, serviceType, options = {}) => {
        if (distance <= 0) return 0;
        
        const rates = BUSINESS_CONFIG.pricing.rates;
        const multipliers = BUSINESS_CONFIG.pricing.multipliers;
        
        let basePrice = rates.base + (distance * rates.perKm);
        
        if (multipliers.service[serviceType]) {
            basePrice *= multipliers.service[serviceType];
        }
        
        if (options.isManaged) {
            basePrice *= multipliers.managedVendor;
        }
        
        return Math.round(basePrice);
    },
    
    formatPrice: (price) => {
        return `KES ${price.toLocaleString()}`;
    },
    
    calculateBreakdown: (totalPrice, serviceType) => {
        // Correct commission splits - vendor pays, doesn't receive
        const platformRate = 0.30; // 30% platform fee
        const riderRate = 0.70;    // 70% of total goes to rider
        
        const platformFee = Math.round(totalPrice * platformRate);
        const riderPayout = Math.round(totalPrice * riderRate);
        
        // Ensure exact split
        const calculated = platformFee + riderPayout;
        const difference = totalPrice - calculated;
        
        // Add any rounding difference to platform fee
        const adjustedPlatformFee = platformFee + difference;
        
        console.log('💰 Pricing breakdown:', {
            total: totalPrice,
            platform: adjustedPlatformFee,
            rider: riderPayout,
            sum: adjustedPlatformFee + riderPayout
        });
        
        return {
            platform_fee: adjustedPlatformFee,
            platform_revenue: adjustedPlatformFee,
            rider_payout: riderPayout,
            vendor_payout: 0 // Vendors pay, they don't receive payout
        };
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

// ─── Database Functions ────────────────────────────────────────────────────

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
        // Fix status before submission for parcels
        if (table === 'parcels') {
            console.log('📦 Processing parcel insert...');
            data.status = 'submitted'; // Ensure correct status
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
    
    async update(table, id, data) {
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
    }
};

// ─── Geocoding Cache Service ───────────────────────────────────────────────

const geocodingCache = {
    async search(query, type = 'address') {
        if (!query || query.length < 3) return null;
        
        try {
            const normalizedQuery = query.toLowerCase().trim();
            
            // Check popular places cache first
            const popularPlace = await supabaseAPI.query('popular_places_cache', {
                filter: `place_name_normalized=eq.${encodeURIComponent(normalizedQuery)}`,
                limit: 1
            });
            
            if (popularPlace.length > 0) {
                console.log('📍 Found in popular places:', popularPlace[0].place_name);
                return {
                    lat: parseFloat(popularPlace[0].lat),
                    lng: parseFloat(popularPlace[0].lng),
                    display_name: popularPlace[0].formatted_address,
                    place_name: popularPlace[0].place_name,
                    cached: true,
                    cache_type: 'popular'
                };
            }
            
            // Then check general geocoding cache
            const cached = await supabaseAPI.query('geocoding_cache', {
                filter: `search_query_normalized=eq.${encodeURIComponent(normalizedQuery)}`,
                limit: 1
            });
            
            if (cached.length > 0 && cached[0].expires_at > new Date().toISOString()) {
                await supabaseAPI.update('geocoding_cache', cached[0].id, {
                    usage_count: cached[0].usage_count + 1,
                    last_used: new Date().toISOString()
                });
                
                console.log('📦 Geocoding from cache:', query);
                return {
                    lat: parseFloat(cached[0].lat),
                    lng: parseFloat(cached[0].lng),
                    display_name: cached[0].formatted_address,
                    place_name: cached[0].place_name,
                    cached: true,
                    cache_type: 'geocoding'
                };
            }
        } catch (error) {
            console.error('Cache lookup error:', error);
        }
        
        return null;
    },
    
    async searchReverse(lat, lng) {
        try {
            const latRounded = Math.round(lat * 10000) / 10000;
            const lngRounded = Math.round(lng * 10000) / 10000;
            
            const cached = await supabaseAPI.query('reverse_geocoding_cache', {
                filter: `lat_rounded=eq.${latRounded}&lng_rounded=eq.${lngRounded}`,
                limit: 1
            });
            
            if (cached.length > 0 && cached[0].expires_at > new Date().toISOString()) {
                await supabaseAPI.update('reverse_geocoding_cache', cached[0].id, {
                    usage_count: cached[0].usage_count + 1,
                    last_used: new Date().toISOString()
                });
                
                console.log('📦 Reverse geocoding from cache:', latRounded, lngRounded);
                return {
                    display_name: cached[0].formatted_address,
                    place_name: cached[0].place_name,
                    cached: true
                };
            }
        } catch (error) {
            console.error('Reverse cache lookup error:', error);
        }
        
        return null;
    },
    
    async store(query, result, provider = 'google') {
        try {
            const cacheData = {
                search_query: query,
                search_query_normalized: query.toLowerCase().trim(),
                search_type: 'address',
                formatted_address: result.display_name || result.formatted_address,
                place_name: result.place_name || null,
                lat: result.lat,
                lng: result.lng,
                geocoding_provider: provider,
                provider_confidence: result.confidence || 0.9,
                raw_response: result.raw || {}
            };
            
            if (result.address_components) {
                result.address_components.forEach(component => {
                    const types = component.types;
                    if (types.includes('street_number')) {
                        cacheData.street_number = component.long_name;
                    }
                    if (types.includes('route')) {
                        cacheData.route = component.long_name;
                    }
                    if (types.includes('neighborhood')) {
                        cacheData.neighborhood = component.long_name;
                    }
                    if (types.includes('sublocality')) {
                        cacheData.sublocality = component.long_name;
                    }
                    if (types.includes('locality')) {
                        cacheData.locality = component.long_name;
                    }
                    if (types.includes('administrative_area_level_1')) {
                        cacheData.administrative_area_level_1 = component.long_name;
                    }
                    if (types.includes('postal_code')) {
                        cacheData.postal_code = component.long_name;
                    }
                });
            }
            
            if (result.place_id) {
                cacheData.place_id = result.place_id;
            }
            
            await supabaseAPI.insert('geocoding_cache', cacheData);
            console.log('💾 Geocoding cached:', query);
        } catch (error) {
            console.error('Cache store error:', error);
        }
    },
    
    async storeReverse(lat, lng, result, provider = 'google') {
        try {
            const cacheData = {
                lat_rounded: Math.round(lat * 10000) / 10000,
                lng_rounded: Math.round(lng * 10000) / 10000,
                lat: lat,
                lng: lng,
                formatted_address: result.display_name || result.formatted_address,
                place_name: result.place_name || null,
                geocoding_provider: provider,
                provider_confidence: result.confidence || 0.9,
                raw_response: result.raw || {}
            };
            
            await supabaseAPI.insert('reverse_geocoding_cache', cacheData);
            console.log('💾 Reverse geocoding cached');
        } catch (error) {
            console.error('Reverse cache store error:', error);
        }
    }
};

// ─── Distance Cache Service ────────────────────────────────────────────────

const distanceCache = {
    cache: new Map(),
    
    async searchDB(pickup, delivery, travelMode = 'driving') {
        try {
            const originLat = Math.round(pickup.lat * 100000) / 100000;
            const originLng = Math.round(pickup.lng * 100000) / 100000;
            const destLat = Math.round(delivery.lat * 100000) / 100000;
            const destLng = Math.round(delivery.lng * 100000) / 100000;
            
            const cached = await supabaseAPI.query('distance_matrix_cache', {
                filter: `origin_lat=eq.${originLat}&origin_lng=eq.${originLng}&destination_lat=eq.${destLat}&destination_lng=eq.${destLng}&travel_mode=eq.${travelMode}`,
                limit: 1
            });
            
            if (cached.length > 0 && cached[0].expires_at > new Date().toISOString()) {
                await supabaseAPI.update('distance_matrix_cache', cached[0].id, {
                    usage_count: cached[0].usage_count + 1,
                    last_used: new Date().toISOString()
                });
                
                console.log('📦 Distance from DB cache');
                return {
                    distance: cached[0].distance_meters / 1000,
                    duration: Math.ceil(cached[0].duration_seconds / 60),
                    distance_text: cached[0].distance_text,
                    duration_text: cached[0].duration_text,
                    cached: true,
                    cache_type: 'database'
                };
            }
        } catch (error) {
            console.error('Distance cache lookup error:', error);
        }
        
        return null;
    },
    
    async storeDB(pickup, delivery, result, travelMode = 'driving', provider = 'google') {
        try {
            const cacheData = {
                origin_lat: Math.round(pickup.lat * 100000) / 100000,
                origin_lng: Math.round(pickup.lng * 100000) / 100000,
                destination_lat: Math.round(delivery.lat * 100000) / 100000,
                destination_lng: Math.round(delivery.lng * 100000) / 100000,
                distance_meters: Math.round(result.distance * 1000),
                distance_text: result.distance_text || `${result.distance.toFixed(1)} km`,
                duration_seconds: result.duration * 60,
                duration_text: result.duration_text || `${result.duration} min`,
                travel_mode: travelMode,
                provider: provider,
                route_polyline: result.polyline || null,
                raw_response: result.raw || {},
                expires_at: new Date(Date.now() + (isRushHour() ? 30 * 60000 : 120 * 60000)).toISOString()
            };
            
            await supabaseAPI.insert('distance_matrix_cache', cacheData);
            console.log('💾 Distance cached to DB');
        } catch (error) {
            console.error('Distance cache store error:', error);
        }
    },
    
    get: async function(pickup, delivery) {
        const key = this.getKey(pickup, delivery);
        const memCached = this.cache.get(key);
        
        if (memCached) {
            console.log('📦 Distance from memory cache:', key);
            memCached.lastUsed = Date.now();
            return memCached.data;
        }
        
        const dbCached = await this.searchDB(pickup, delivery);
        if (dbCached) {
            this.cache.set(key, {
                data: dbCached,
                created: Date.now(),
                lastUsed: Date.now()
            });
            return dbCached;
        }
        
        return null;
    },
    
    set: async function(pickup, delivery, data) {
        const key = this.getKey(pickup, delivery);
        
        this.cache.set(key, {
            data: data,
            created: Date.now(),
            lastUsed: Date.now()
        });
        
        const reverseKey = this.getKey(delivery, pickup);
        this.cache.set(reverseKey, {
            data: { ...data, distance: data.distance },
            created: Date.now(),
            lastUsed: Date.now()
        });
        
        await this.storeDB(pickup, delivery, data);
        
        this.persist();
    },
    
    getKey: (pickup, delivery) => {
        const p = `${pickup.lat.toFixed(3)},${pickup.lng.toFixed(3)}`;
        const d = `${delivery.lat.toFixed(3)},${delivery.lng.toFixed(3)}`;
        return `${p}→${d}`;
    },
    
    persist: function() {
        try {
            const cacheData = Array.from(this.cache.entries()).slice(-1000);
            localStorage.setItem('tuma_distance_cache', JSON.stringify(cacheData));
        } catch (e) {
            console.warn('Failed to persist cache:', e);
        }
    },
    
    load: function() {
        try {
            const stored = localStorage.getItem('tuma_distance_cache');
            if (stored) {
                const cacheData = JSON.parse(stored);
                cacheData.forEach(([key, value]) => {
                    this.cache.set(key, value);
                });
                console.log(`📦 Loaded ${cacheData.length} cached routes`);
            }
        } catch (e) {
            console.warn('Failed to load cache:', e);
        }
    },
    
    getStats: function() {
        let totalHits = 0;
        let totalSize = this.cache.size;
        
        this.cache.forEach(entry => {
            totalHits += entry.hitCount || 0;
        });
        
        return {
            size: totalSize,
            hits: totalHits,
            hitRate: totalSize > 0 ? (totalHits / (totalHits + totalSize)) * 100 : 0
        };
    }
};

// ─── Helper Functions ──────────────────────────────────────────────────────

function isRushHour() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    if (day >= 1 && day <= 5) {
        return (hour >= 6 && hour < 10) || (hour >= 16 && hour < 20);
    }
    
    return false;
}

async function geocodeAddress(address) {
    const cached = await geocodingCache.search(address);
    if (cached) {
        return cached;
    }
    
    let searchAddress = address;
    if (!address.toLowerCase().includes('nairobi') && !address.toLowerCase().includes('kenya')) {
        searchAddress = `${address}, Nairobi, Kenya`;
    }
    
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}&limit=5&countrycodes=ke`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.length === 0) {
            throw new Error('Address not found');
        }
        
        const nairobiResult = data.find(result => 
            result.display_name.toLowerCase().includes('nairobi')
        ) || data[0];
        
        const result = {
            lat: parseFloat(nairobiResult.lat),
            lng: parseFloat(nairobiResult.lon),
            display_name: nairobiResult.display_name
        };
        
        await geocodingCache.store(address, result, 'nominatim');
        
        return result;
    } catch (error) {
        console.error('Geocoding error:', error);
        throw new Error('Could not find address. Please be more specific.');
    }
}

function calculateStraightDistance(point1, point2) {
    if (!point1 || !point2 || typeof point1.lat !== 'number' || typeof point1.lng !== 'number' || 
        typeof point2.lat !== 'number' || typeof point2.lng !== 'number') {
        console.error('Invalid coordinates for distance calculation:', point1, point2);
        return 0;
    }
    
    const R = 6371; // Earth's radius in km
    const dLat = toRad(point2.lat - point1.lat);
    const dLng = toRad(point2.lng - point1.lng);
    const lat1 = toRad(point1.lat);
    const lat2 = toRad(point2.lat);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.sin(dLng/2) * Math.sin(dLng/2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    console.log('Distance calculation:', {
        from: point1,
        to: point2,
        distance: distance.toFixed(2) + 'km'
    });
    
    return distance;
}

function toRad(value) {
    return value * Math.PI / 180;
}

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
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, type === 'error' ? 5000 : 3000);
}

// Export showNotification globally
window.showNotification = showNotification;

// ─── URL Parameter Handling ────────────────────────────────────────────────

async function handleURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const waPhone = urlParams.get('wa');
    
    if (waPhone) {
        console.log('📱 WhatsApp parameter detected:', waPhone);
        
        // Clean the phone number
        let cleanedPhone = waPhone.replace(/\D/g, '');
        if (cleanedPhone.startsWith('254')) {
            cleanedPhone = '0' + cleanedPhone.substring(3);
        } else if (!cleanedPhone.startsWith('0') && cleanedPhone.length === 9) {
            cleanedPhone = '0' + cleanedPhone;
        }
        
        // Validate and set phone
        if (validation.validatePhone(cleanedPhone)) {
            if (elements.phoneNumber) {
                elements.phoneNumber.value = cleanedPhone;
                
                // Check if vendor exists and load their data
                await loadVendorData(cleanedPhone);
            }
        }
    }
}

// ─── Load Vendor Data ──────────────────────────────────────────────────────

async function loadVendorData(phone) {
    try {
        // Check if vendor exists
        const vendors = await supabaseAPI.query('vendors', {
            filter: `phone=eq.${phone}`,
            limit: 1
        });
        
        if (vendors.length > 0) {
            const vendor = vendors[0];
            console.log('✅ Vendor found:', vendor.name);
            
            // Fill vendor name
            if (elements.vendorName && vendor.name) {
                elements.vendorName.value = vendor.name;
            }
            
            // Set vendor type
            if (vendor.is_managed) {
                formState.set({
                    vendorType: 'managed',
                    agentCode: vendor.agent_code,
                    agentName: vendor.agent_name
                });
                
                displayVendorBadge({
                    isManaged: true,
                    agentName: vendor.agent_name
                });
            }
            
            // Load saved locations
            await loadRecentPickupLocations(vendor.id, phone);
            
            // Show welcome back message
            if (vendor.total_bookings > 0) {
                showNotification(
                    `Welcome back${vendor.name ? ', ' + vendor.name : ''}! ${vendor.total_bookings} deliveries completed`,
                    'success'
                );
            } else {
                showNotification(`Welcome back${vendor.name ? ', ' + vendor.name : ''}!`, 'success');
            }
        }
    } catch (error) {
        console.error('Error loading vendor data:', error);
    }
}

// ─── Load Recent Pickup Locations ──────────────────────────────────────────

async function loadRecentPickupLocations(vendorId, vendorPhone) {
    try {
        // Query recent successful bookings
        let recentBookings;
        
        if (vendorId) {
            // If we have vendor_id, use it
            recentBookings = await supabaseAPI.query('parcels', {
                filter: `vendor_id=eq.${vendorId}`,
                select: 'pickup_location,created_at',
                limit: 10
            });
        } else {
            // Fallback to phone number
            recentBookings = await supabaseAPI.query('parcels', {
                filter: `vendor_phone=eq.${vendorPhone}`,
                select: 'pickup_location,created_at',
                limit: 10
            });
        }
        
        if (recentBookings.length > 0) {
            // Get unique pickup locations
            const locationMap = new Map();
            
            recentBookings.forEach(booking => {
                if (booking.pickup_location) {
                    const loc = booking.pickup_location;
                    const key = `${loc.lat},${loc.lng}`;
                    
                    if (!locationMap.has(key)) {
                        locationMap.set(key, {
                            address: loc.address,
                            lat: loc.lat,
                            lng: loc.lng,
                            count: 1,
                            lastUsed: booking.created_at
                        });
                    } else {
                        const existing = locationMap.get(key);
                        existing.count++;
                        if (booking.created_at > existing.lastUsed) {
                            existing.lastUsed = booking.created_at;
                        }
                    }
                }
            });
            
            // Sort by frequency and recency
            const sortedLocations = Array.from(locationMap.values())
                .sort((a, b) => {
                    // First by count, then by recency
                    if (b.count !== a.count) return b.count - a.count;
                    return new Date(b.lastUsed) - new Date(a.lastUsed);
                })
                .slice(0, 3); // Show top 3
            
            if (sortedLocations.length > 0) {
                displaySavedLocations(sortedLocations);
            }
        }
    } catch (error) {
        console.error('Error loading saved locations:', error);
    }
}

// ─── Display Saved Locations ───────────────────────────────────────────────

function displaySavedLocations(locations) {
    // Remove existing saved locations if any
    const existing = document.getElementById('savedLocationsContainer');
    if (existing) existing.remove();
    
    // Find pickup section
    const pickupSection = elements.pickupLocation?.closest('.form-section');
    if (!pickupSection) return;
    
    // Create saved locations UI
    const container = document.createElement('div');
    container.id = 'savedLocationsContainer';
    container.style.cssText = 'margin-top: 12px; animation: fadeIn 0.3s ease-out;';
    
    container.innerHTML = `
        <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
            Quick select recent locations:
        </p>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${locations.map((loc, index) => {
                const shortAddress = loc.address.split(',')[0];
                const timesUsed = loc.count > 1 ? ` (${loc.count}×)` : '';
                return `
                    <button type="button" 
                            class="saved-location-btn" 
                            onclick="useSavedLocation(${index})"
                            style="
                                background: var(--surface-elevated);
                                border: 1px solid var(--border);
                                border-radius: 20px;
                                padding: 8px 16px;
                                font-size: 13px;
                                color: var(--text-secondary);
                                cursor: pointer;
                                transition: all 0.2s;
                                display: flex;
                                align-items: center;
                                gap: 6px;
                            ">
                        <span style="font-size: 16px;">📍</span>
                        ${shortAddress}${timesUsed}
                    </button>
                `;
            }).join('')}
        </div>
    `;
    
    // Add after location options
    const locationOptions = pickupSection.querySelector('.location-options');
    if (locationOptions) {
        locationOptions.insertAdjacentElement('afterend', container);
    }
    
    // Store locations for use
    window.savedPickupLocations = locations;
}

// ─── Use Saved Location ────────────────────────────────────────────────────

window.useSavedLocation = function(index) {
    const location = window.savedPickupLocations?.[index];
    if (!location) return;
    
    // Fill pickup field
    elements.pickupLocation.value = location.address;
    elements.pickupLocation.dataset.lat = location.lat;
    elements.pickupLocation.dataset.lng = location.lng;
    
    // Update form state
    formState.set('pickupCoords', {
        lat: parseFloat(location.lat),
        lng: parseFloat(location.lng),
        display_name: location.address
    });
    
    // Visual feedback
    updateLocationStatus(elements.pickupLocation, true);
    
    // Calculate distance if delivery exists
    if (formState.get('deliveryCoords')) {
        calculateDistance();
    }
    
    // Highlight selected button
    document.querySelectorAll('.saved-location-btn').forEach((btn, i) => {
        if (i === index) {
            btn.style.background = 'var(--primary)';
            btn.style.color = 'white';
            btn.style.borderColor = 'var(--primary)';
        } else {
            btn.style.background = 'var(--surface-elevated)';
            btn.style.color = 'var(--text-secondary)';
            btn.style.borderColor = 'var(--border)';
        }
    });
    
    showNotification('Pickup location set!', 'success');
    
    // Auto-focus next field
    if (elements.deliveryLocation && !elements.deliveryLocation.value) {
        elements.deliveryLocation.focus();
    }
};

// ─── Global Functions ──────────────────────────────────────────────────────

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

window.selectPaymentMethod = function(method) {
    document.querySelectorAll('.payment-button').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    if (method === 'online') {
        document.querySelector('.payment-button.pay-now').classList.add('selected');
    } else {
        document.querySelector('.payment-button.cash-delivery').classList.add('selected');
    }
    
    formState.set('selectedPaymentMethod', method);
};

window.trackDelivery = function() {
    const parcelCode = elements.displayParcelCode.textContent;
    window.location.href = `tracking.html?parcel=${parcelCode}`;
};

window.getLocation = async function(type) {
    try {
        if (!navigator.geolocation) {
            throw new Error('Geolocation not supported');
        }
        
        showNotification('Getting your location...', 'info');
        
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
        
        const serviceAreaCheck = validation.validateServiceArea(coords);
        if (!serviceAreaCheck.isValid) {
            showNotification(
                `Your location is outside our current service area (${serviceAreaCheck.distance.toFixed(1)}km from CBD). We serve areas within ${serviceAreaCheck.maxRadius}km of Nairobi CBD.`,
                'error'
            );
            return;
        }
        
        const cached = await geocodingCache.searchReverse(coords.lat, coords.lng);
        
        if (cached) {
            const input = type === 'pickup' ? elements.pickupLocation : elements.deliveryLocation;
            input.value = cached.display_name;
            input.dataset.lat = coords.lat;
            input.dataset.lng = coords.lng;
            
            formState.set(`${type}Coords`, coords);
            
            if (formState.get('pickupCoords') && formState.get('deliveryCoords')) {
                await calculateDistance();
            }
            
            showNotification('Location updated!', 'success');
        } else {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}`);
            const data = await response.json();
            
            const input = type === 'pickup' ? elements.pickupLocation : elements.deliveryLocation;
            input.value = data.display_name || `${coords.lat}, ${coords.lng}`;
            
            input.dataset.lat = coords.lat;
            input.dataset.lng = coords.lng;
            
            formState.set(`${type}Coords`, coords);
            
            await geocodingCache.storeReverse(coords.lat, coords.lng, data, 'nominatim');
            
            if (formState.get('pickupCoords') && formState.get('deliveryCoords')) {
                await calculateDistance();
            }
            
            showNotification('Location updated!', 'success');
        }
    } catch (error) {
        console.error('Location error:', error);
        showNotification('Could not get your location. Please type the address manually.', 'error');
    }
};

window.useGPS = window.getLocation;

window.typeAddress = function(type) {
    const input = type === 'pickup' ? elements.pickupLocation : elements.deliveryLocation;
    input.focus();
    showNotification('Type your address in the field above', 'info');
};

window.toggleDeliveryType = function(type) {
    console.log('Delivery type:', type);
};

window.addBulkDelivery = function() {
    showNotification('Bulk delivery feature coming soon!', 'info');
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
            await navigator.clipboard.writeText(shareData.text);
            showNotification('Details copied to clipboard!', 'success');
        }
    } else {
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
    
    elements.itemCount.textContent = '1';
    document.querySelectorAll('.size-option').forEach(el => el.classList.remove('selected'));
    document.querySelector('[data-size="small"]')?.classList.add('selected');
    document.querySelectorAll('.service-card').forEach(el => el.classList.remove('selected'));
    document.querySelector('[data-service="smart"]')?.classList.add('selected');
    
    if (elements.pickupLocation) {
        delete elements.pickupLocation.dataset.lat;
        delete elements.pickupLocation.dataset.lng;
    }
    if (elements.deliveryLocation) {
        delete elements.deliveryLocation.dataset.lat;
        delete elements.deliveryLocation.dataset.lng;
    }
};

// ─── Map Modal Functions ───────────────────────────────────────────────────

let simpleMap = null;
let currentInputField = null;
let selectedSimpleLocation = null;

window.openSimpleLocationModal = function(inputId) {
    currentInputField = inputId;
    document.getElementById('simpleLocationModal').style.display = 'block';

    if (!simpleMap) {
        simpleMap = L.map('simpleMap').setView([-1.2921, 36.8219], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(simpleMap);

        simpleMap.on('moveend', updateSelectedLocation);

        const searchBtn = document.getElementById('simpleSearchBtn');
        const searchInput = document.getElementById('simpleSearch');
        if (searchBtn && searchInput) {
            searchBtn.addEventListener('click', async () => {
                const q = searchInput.value.trim();
                if (!q) return;
                try {
                    const result = await geocodeAddress(q);
                    simpleMap.setView([result.lat, result.lng], 16);
                    selectedSimpleLocation = {
                        lat: result.lat,
                        lng: result.lng,
                        address: result.display_name
                    };
                    updateLocationDisplay();
                } catch {
                    alert('Could not find that address.');
                }
            });
            searchInput.addEventListener('keypress', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    searchBtn.click();
                }
            });
        }
    }

    setTimeout(() => simpleMap.invalidateSize(), 100);
};

async function updateSelectedLocation() {
    const c = simpleMap.getCenter();
    try {
        const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${c.lat}&lon=${c.lng}`
        );
        const data = await resp.json();
        selectedSimpleLocation = {
            lat: c.lat,
            lng: c.lng,
            address: data.display_name
        };
        updateLocationDisplay();
    } catch (err) {
        console.error('Reverse-geocode failed', err);
    }
}

function updateLocationDisplay() {
    if (!selectedSimpleLocation) return;
    const name = selectedSimpleLocation.address.split(',')[0] || 'Selected Location';
    document.getElementById('selectedLocationName').textContent = name;
    document.getElementById('selectedLocationAddress').textContent = selectedSimpleLocation.address;
}

window.confirmSimpleLocation = function() {
    if (!selectedSimpleLocation || !currentInputField) return;
    
    const serviceAreaCheck = validation.validateServiceArea(selectedSimpleLocation);
    if (!serviceAreaCheck.isValid) {
        showNotification(
            `This location is ${serviceAreaCheck.distance.toFixed(1)}km from our service center. We currently serve areas within ${serviceAreaCheck.maxRadius}km of Nairobi CBD.`,
            'error'
        );
        return;
    }
    
    const inp = document.getElementById(currentInputField);
    inp.value = selectedSimpleLocation.address;
    inp.dataset.lat = selectedSimpleLocation.lat;
    inp.dataset.lng = selectedSimpleLocation.lng;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    
    const type = currentInputField.includes('pickup') ? 'pickup' : 'delivery';
    handleLocationChange(type);
    
    closeLocationModal();
};

window.closeLocationModal = function() {
    document.getElementById('simpleLocationModal').style.display = 'none';
    currentInputField = null;
    selectedSimpleLocation = null;
};

// ─── Core Functions ────────────────────────────────────────────────────────

async function checkAuthAndLoadVendor() {
    return null; // Future implementation will check for authenticated user
}

async function initialize() {
    console.log('Initializing vendor dashboard...');
    
    const authenticatedVendor = await checkAuthAndLoadVendor();
    
    if (authenticatedVendor) {
        const vendorInfoSection = document.querySelector('.form-section:has(#vendorName)');
        if (vendorInfoSection) {
            vendorInfoSection.style.display = 'none';
        }
        
        formState.set('authenticatedVendor', authenticatedVendor);
        formState.set('vendorType', authenticatedVendor.vendor_type);
        formState.set('isAuthenticated', true);
        
        displayVendorBadge({
            isManaged: authenticatedVendor.is_managed,
            agentName: authenticatedVendor.agent_name
        });
    } else {
        formState.set('isAuthenticated', false);
    }
    
    // Handle URL parameters
    await handleURLParameters();
    
    setupEventListeners();
    setupStateSubscriptions();
    updateCapacityDisplay();
    
    formState.set('selectedService', 'smart');
    formState.set('selectedSize', 'small');
    
    initializeGooglePlacesAutocomplete();
    testSupabaseConnection();
    distanceCache.load();
    
    // Setup form validation monitoring
    setupFormValidationMonitoring();
    
    console.log('Vendor dashboard initialized successfully');
}

async function testSupabaseConnection() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/vendors?select=*&limit=1`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            console.log('✅ Supabase connection successful');
        } else {
            console.error('❌ Supabase connection failed:', response.status, response.statusText);
        }
    } catch (error) {
        console.error('❌ Supabase connection error:', error);
    }
}

function initializeGooglePlacesAutocomplete() {
    if (window.google && window.google.maps && window.google.maps.places) {
        console.log('✅ Google Maps API loaded, setting up autocomplete');
        setupAutocomplete();
    } else {
        console.log('⏳ Waiting for Google Maps API...');
        setTimeout(initializeGooglePlacesAutocomplete, 500);
    }
}

window.initMap = function() {
    console.log('✅ Google Maps initialized via callback');
    initializeGooglePlacesAutocomplete();
};

function setupAutocomplete() {
    const setupField = (inputElement, type) => {
        if (!inputElement) return;
        
        const autocomplete = new google.maps.places.Autocomplete(inputElement, {
            componentRestrictions: { country: 'KE' },
            fields: ['formatted_address', 'geometry', 'name', 'place_id', 'types', 'address_components'],
            bounds: new google.maps.LatLngBounds(
                new google.maps.LatLng(-1.5, 36.6),
                new google.maps.LatLng(-1.0, 37.1)
            ),
            strictBounds: false
        });
        
        autocomplete.addListener('place_changed', async () => {
            const place = autocomplete.getPlace();
            
            if (place.geometry && place.geometry.location) {
                const coords = {
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                    display_name: place.formatted_address,
                    formatted_address: place.formatted_address,
                    place_name: place.name,
                    place_id: place.place_id,
                    address_components: place.address_components,
                    raw: place
                };
                
                console.log(`Google Places selected for ${type}:`, {
                    name: place.name,
                    address: place.formatted_address,
                    lat: coords.lat,
                    lng: coords.lng
                });
                
                inputElement.dataset.lat = coords.lat;
                inputElement.dataset.lng = coords.lng;
                
                await geocodingCache.store(inputElement.value, coords, 'google');
                
                formState.set(`${type}Coords`, coords);
                
                updateLocationStatus(inputElement, true);
                showNotification('✅ Location selected', 'success');
                
                if (formState.get('pickupCoords') && formState.get('deliveryCoords')) {
                    await calculateDistance();
                }
            } else if (place.name || place.formatted_address) {
                console.log('Place selected without geometry, using Google Geocoder');
                const geocoder = new google.maps.Geocoder();
                const addressToGeocode = place.formatted_address || place.name;
                
                geocoder.geocode({ 
                    address: addressToGeocode,
                    componentRestrictions: { country: 'KE' }
                }, async (results, status) => {
                    if (status === 'OK' && results[0]) {
                        const location = results[0].geometry.location;
                        const coords = {
                            lat: location.lat(),
                            lng: location.lng(),
                            display_name: results[0].formatted_address,
                            formatted_address: results[0].formatted_address,
                            place_id: results[0].place_id,
                            address_components: results[0].address_components,
                            raw: results[0]
                        };
                        
                        inputElement.dataset.lat = coords.lat;
                        inputElement.dataset.lng = coords.lng;
                        inputElement.value = results[0].formatted_address;
                        
                        await geocodingCache.store(addressToGeocode, coords, 'google');
                        
                        handleLocationChange(type);
                    } else {
                        console.error('Google Geocoding failed:', status);
                        showNotification('Could not find exact location. Please try a different address.', 'error');
                    }
                });
            } else {
                showNotification('Please select a valid address from the dropdown', 'warning');
            }
        });
        
        inputElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
            }
        });
    };
    
    setupField(elements.pickupLocation, 'pickup');
    setupField(elements.deliveryLocation, 'delivery');
}

function setupEventListeners() {
    elements.phoneNumber?.addEventListener('input', handlePhoneInput);
    elements.recipientPhone?.addEventListener('input', handleRecipientPhoneInput);
    
    elements.packageDescription?.addEventListener('change', (e) => {
        handlePackageTypeChange(e.target.value);
    });
    
    elements.specialInstructions?.addEventListener('input', (e) => {
        const charCountEl = document.getElementById('charCount');
        if (charCountEl) {
            charCountEl.textContent = e.target.value.length;
        }
    });
    
    document.getElementById('deliveryForm')?.addEventListener('submit', handleFormSubmit);
}

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

async function handlePhoneInput(e) {
    let value = validation.formatPhone(e.target.value);
    e.target.value = value;
    
    if (value.length === 10 && validation.validatePhone(value)) {
        try {
            const vendors = await supabaseAPI.query('vendors', {
                filter: `phone=eq.${value}`,
                limit: 1
            });
            
            if (vendors.length > 0) {
                const vendor = vendors[0];
                
                // Auto-fill vendor name
                if (elements.vendorName && vendor.name) {
                    elements.vendorName.value = vendor.name;
                }
                
                // Check if managed vendor
                if (vendor.is_managed && vendor.agent_name) {
                    formState.set({
                        vendorType: 'managed',
                        agentCode: vendor.agent_code,
                        agentName: vendor.agent_name
                    });
                    
                    displayVendorBadge({
                        isManaged: true,
                        agentName: vendor.agent_name
                    });
                }
                
                // Load saved locations
                await loadRecentPickupLocations(vendor.id, value);
                
                // Show welcome back message
                if (vendor.total_bookings > 0) {
                    showNotification(
                        `Welcome back${vendor.name ? ', ' + vendor.name : ''}! ${vendor.total_bookings} deliveries completed`,
                        'success'
                    );
                } else {
                    showNotification(`Welcome back${vendor.name ? ', ' + vendor.name : ''}!`, 'success');
                }
            } else {
                // New vendor
                formState.set({
                    vendorType: 'casual',
                    agentCode: null,
                    agentName: null
                });
                elements.vendorBadge.style.display = 'none';
                
                // Clear saved locations
                const savedLocContainer = document.getElementById('savedLocationsContainer');
                if (savedLocContainer) {
                    savedLocContainer.remove();
                }
            }
        } catch (error) {
            console.error('Error checking vendor status:', error);
            formState.set({
                vendorType: 'casual',
                agentCode: null,
                agentName: null
            });
        }
    } else {
        // Clear saved locations if phone is invalid
        const savedLocContainer = document.getElementById('savedLocationsContainer');
        if (savedLocContainer) {
            savedLocContainer.remove();
        }
    }
}

function handleRecipientPhoneInput(e) {
    e.target.value = validation.formatPhone(e.target.value);
}

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

function handlePackageTypeChange(packageType) {
    if (!packageType) return;
    
    const specialHandling = BUSINESS_CONFIG.packageCompatibility.specialHandling[packageType];
    
    if (specialHandling) {
        if (specialHandling.priority === 'urgent' || specialHandling.maxDelay <= 60) {
            showNotification('⚡ Express delivery recommended for this item type', 'info');
            
            if (specialHandling.priority === 'urgent') {
                selectService('express');
            }
        }
        
        if (specialHandling.fragile) {
            showNotification('📦 This item will be handled with extra care', 'info');
        }
        
        if (specialHandling.secure) {
            showNotification('🔒 This item will be transported securely', 'info');
        }
    }
    
    formState.set('packageType', packageType);
}

async function handleLocationChange(type) {
    const input = type === 'pickup' ? elements.pickupLocation : elements.deliveryLocation;
    const address = input.value.trim();
    const dsLat = input.dataset.lat;
    const dsLng = input.dataset.lng;
    
    console.log(`handleLocationChange called for ${type}:`, {
        address: address,
        datasetLat: dsLat,
        datasetLng: dsLng
    });
    
    if (dsLat && dsLng) {
        const coords = {
            lat: parseFloat(dsLat),
            lng: parseFloat(dsLng),
            display_name: address
        };
        
        console.log('Using dataset coordinates:', coords);
        
        const serviceAreaCheck = validation.validateServiceArea(coords);
        if (!serviceAreaCheck.isValid) {
            const locationName = address.toLowerCase();
            const addressLower = coords.display_name ? coords.display_name.toLowerCase() : '';
            const knownNairobiLocations = [
                'junction mall', 'westgate', 'sarit centre', 'village market', 'two rivers',
                'garden city', 'thika road mall', 'capital centre', 'yaya centre', 'prestige plaza',
                'westlands', 'karen', 'lavington', 'kilimani', 'kileleshwa', 'parklands',
                'kasarani', 'embakasi', 'langata', 'dagoretti', 'kibera', 'kawangware',
                'stonebridge', 'osieli', 'argwings', 'kodhek', 'hurlingham', 'upperhill',
                'cbd', 'downtown', 'river road', 'moi avenue', 'kenyatta avenue'
            ];
            
            const isKnownLocation = knownNairobiLocations.some(loc => 
                locationName.includes(loc) || addressLower.includes(loc)
            );
            
            const isNairobiAddress = locationName.includes('nairobi') || addressLower.includes('nairobi');
            
            if (isKnownLocation || isNairobiAddress) {
                console.warn('Known Nairobi location detected, overriding distance check:', {
                    address: address,
                    coords: coords,
                    calculatedDistance: serviceAreaCheck.distance.toFixed(2) + 'km',
                    decision: 'ALLOWING'
                });
                
                if (Math.abs(coords.lat) > 5 || coords.lng < 35 || coords.lng > 38) {
                    console.error('CRITICAL: Coordinates are definitely wrong for Nairobi:', coords);
                    showNotification('Location coordinates appear incorrect. Please try selecting from the dropdown or use GPS.', 'error');
                    input.value = '';
                    delete input.dataset.lat;
                    delete input.dataset.lng;
                    updateLocationStatus(input, false);
                    return;
                }
            } else {
                showNotification(
                    `Sorry, this location is ${serviceAreaCheck.distance.toFixed(1)}km from our service center. We currently serve areas within ${serviceAreaCheck.maxRadius}km of Nairobi CBD.`,
                    'error'
                );
                input.value = '';
                delete input.dataset.lat;
                delete input.dataset.lng;
                updateLocationStatus(input, false);
                return;
            }
        }
        
        formState.set(`${type}Coords`, coords);
        updateLocationStatus(input, true);
        
        if (formState.get('pickupCoords') && formState.get('deliveryCoords')) {
            await calculateDistance();
        }
        return;
    }
    
    if (!address || address.length < 3) {
        updateLocationStatus(input, false);
        return;
    }
    
    const cached = await geocodingCache.search(address);
    if (cached) {
        const coords = {
            lat: cached.lat,
            lng: cached.lng,
            display_name: cached.display_name
        };
        
        const serviceAreaCheck = validation.validateServiceArea(coords);
        if (!serviceAreaCheck.isValid) {
            showNotification(
                `Sorry, this location is ${serviceAreaCheck.distance.toFixed(1)}km from our service center. We currently serve areas within ${serviceAreaCheck.maxRadius}km of Nairobi CBD.`,
                'error'
            );
            input.value = '';
            updateLocationStatus(input, false);
            return;
        }
        
        input.dataset.lat = coords.lat;
        input.dataset.lng = coords.lng;
        
        formState.set(`${type}Coords`, coords);
        updateLocationStatus(input, true);
        
        if (formState.get('pickupCoords') && formState.get('deliveryCoords')) {
            await calculateDistance();
        }
        
        showNotification(`📦 Location loaded from cache`, 'success');
        return;
    }
    
    if (window.google && window.google.maps && window.google.maps.Geocoder) {
        console.log(`Using Google Geocoder for manually typed address: ${address}`);
        const geocoder = new google.maps.Geocoder();
        
        geocoder.geocode({ 
            address: address,
            componentRestrictions: { country: 'KE' }
        }, async (results, status) => {
            if (status === 'OK' && results[0]) {
                const location = results[0].geometry.location;
                const coords = {
                    lat: location.lat(),
                    lng: location.lng(),
                    display_name: results[0].formatted_address,
                    formatted_address: results[0].formatted_address,
                    place_id: results[0].place_id,
                    address_components: results[0].address_components,
                    raw: results[0]
                };
                
                input.dataset.lat = coords.lat;
                input.dataset.lng = coords.lng;
                input.value = results[0].formatted_address;
                
                const serviceAreaCheck = validation.validateServiceArea(coords);
                if (!serviceAreaCheck.isValid) {
                    showNotification(
                        `Sorry, this location is ${serviceAreaCheck.distance.toFixed(1)}km from our service center. We currently serve areas within ${serviceAreaCheck.maxRadius}km of Nairobi CBD.`,
                        'error'
                    );
                    input.value = '';
                    delete input.dataset.lat;
                    delete input.dataset.lng;
                    updateLocationStatus(input, false);
                    return;
                }
                
                await geocodingCache.store(address, coords, 'google');
                
                formState.set(`${type}Coords`, coords);
                updateLocationStatus(input, true);
                
                if (formState.get('pickupCoords') && formState.get('deliveryCoords')) {
                    await calculateDistance();
                }
            } else {
                console.log('Google Geocoder failed, trying Nominatim');
                await geocodeWithNominatim(address, type);
            }
        });
    } else {
        await geocodeWithNominatim(address, type);
    }
}

function updateLocationStatus(input, isValid) {
    const container = input.parentElement;
    const actionButton = container.querySelector('.input-action');
    
    if (isValid) {
        input.classList.add('location-confirmed');
        input.classList.remove('error');
        
        if (actionButton) {
            actionButton.innerHTML = `
                <svg viewBox="0 0 24 24" style="fill: #34C759;">
                    <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                </svg>
            `;
            actionButton.style.background = 'rgba(52, 199, 89, 0.1)';
        }
        
        input.style.animation = 'locationSuccess 0.3s ease-out';
    } else {
        input.classList.remove('location-confirmed');
        
        if (actionButton) {
            actionButton.innerHTML = `
                <svg viewBox="0 0 24 24">
                    <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5Z"/>
                </svg>
            `;
            actionButton.style.background = '';
        }
    }
}

async function geocodeWithNominatim(address, type) {
    const input = type === 'pickup' ? elements.pickupLocation : elements.deliveryLocation;
    
    try {
        console.log(`Geocoding ${type} via Nominatim:`, address);
        const coords = await geocodeAddress(address);
        
        const serviceAreaCheck = validation.validateServiceArea(coords);
        if (!serviceAreaCheck.isValid) {
            showNotification(
                `Sorry, this location is ${serviceAreaCheck.distance.toFixed(1)}km from our service center. We currently serve areas within ${serviceAreaCheck.maxRadius}km of Nairobi CBD.`,
                'error'
            );
            input.value = '';
            delete input.dataset.lat;
            delete input.dataset.lng;
            return;
        }
        
        input.dataset.lat = coords.lat;
        input.dataset.lng = coords.lng;
        
        formState.set(`${type}Coords`, coords);
        
        if (formState.get('pickupCoords') && formState.get('deliveryCoords')) {
            await calculateDistance();
        }
    } catch (err) {
        console.error('Geocoding error:', err);
        showNotification(
            'Could not find that address. Please select from the dropdown suggestions or try a more specific address.',
            'error'
        );
    }
}

async function calculateDistance() {
    const pickup = formState.get('pickupCoords');
    const delivery = formState.get('deliveryCoords');
    
    if (!pickup || !delivery) return;
    
    console.log('📏 Calculating distance...');
    
    const cached = await distanceCache.get(pickup, delivery);
    if (cached) {
        console.log('✅ Using cached distance:', cached.distance, 'km');
        formState.set('distance', cached.distance);
        formState.set('duration', cached.duration);
        elements.calculatedDistance.textContent = `${cached.distance.toFixed(2)} km`;
        elements.distanceInfo.style.display = 'block';
        
        const durationEl = document.getElementById('estimatedDuration');
        if (durationEl) {
            durationEl.textContent = `~${cached.duration} min`;
        }
        
        updateProgress(2);
        
        const stats = distanceCache.getStats();
        if (stats.hits % 10 === 0 && stats.hits > 0) {
            showNotification(`💰 Saved ${stats.hits} API calls using smart caching!`, 'success');
        }
        
        // Force form validation after distance calculation
        setTimeout(() => {
            checkFormValidity();
            
            // Double-check and force enable if conditions are met
            const pickupCheck = formState.get('pickupCoords');
            const deliveryCheck = formState.get('deliveryCoords');
            const distanceCheck = formState.get('distance');
            
            if (pickupCheck && deliveryCheck && distanceCheck > 0) {
                const submitBtn = document.getElementById('submitBtn');
                const buttonText = document.getElementById('buttonText');
                
                if (submitBtn && submitBtn.disabled) {
                    console.log('🚨 Force-enabling button after distance calculation');
                    submitBtn.disabled = false;
                    buttonText.textContent = 'Book Delivery';
                }
            }
        }, 200);
        
        return;
    }
    
    if (window.google && window.google.maps) {
        try {
            const service = new google.maps.DistanceMatrixService();
            
            const response = await new Promise((resolve, reject) => {
                service.getDistanceMatrix({
                    origins: [new google.maps.LatLng(pickup.lat, pickup.lng)],
                    destinations: [new google.maps.LatLng(delivery.lat, delivery.lng)],
                    travelMode: google.maps.TravelMode.DRIVING,
                    unitSystem: google.maps.UnitSystem.METRIC,
                    avoidHighways: false,
                    avoidTolls: false,
                    drivingOptions: {
                        departureTime: new Date(),
                        trafficModel: 'bestguess'
                    }
                }, (response, status) => {
                    if (status === 'OK') {
                        resolve(response);
                    } else {
                        reject(new Error(`Distance Matrix API error: ${status}`));
                    }
                });
            });
            
            if (response.rows[0].elements[0].status === 'OK') {
                const element = response.rows[0].elements[0];
                const distance = element.distance.value / 1000;
                const duration = Math.ceil(element.duration.value / 60);
                
                console.log('📍 Google Distance Matrix:', distance, 'km,', duration, 'minutes');
                
                const cacheData = {
                    distance: distance,
                    duration: duration,
                    distance_text: element.distance.text,
                    duration_text: element.duration.text,
                    timestamp: Date.now(),
                    raw: response
                };
                
                await distanceCache.set(pickup, delivery, cacheData);
                
                formState.set('distance', distance);
                formState.set('duration', duration);
                
                elements.calculatedDistance.textContent = `${distance.toFixed(2)} km`;
                elements.distanceInfo.style.display = 'block';
                
                const durationEl = document.getElementById('estimatedDuration');
                if (durationEl) {
                    durationEl.textContent = `~${duration} min`;
                }
                
                updateProgress(2);
                
                // Force validation here too
                setTimeout(() => {
                    checkFormValidity();
                }, 200);
                
                return;
            }
        } catch (error) {
            console.error('Distance Matrix API failed:', error);
        }
    }
    
    console.log('⚠️ Using estimation fallback');
    const straightDistance = calculateStraightDistance(pickup, delivery);
    const estimatedDistance = straightDistance * 1.5;
    const estimatedDuration = Math.ceil(estimatedDistance * 3);
    
    const estimationData = {
        distance: estimatedDistance,
        duration: estimatedDuration,
        distance_text: `~${estimatedDistance.toFixed(1)} km`,
        duration_text: `~${estimatedDuration} min`,
        estimated: true,
        timestamp: Date.now()
    };
    
    await distanceCache.set(pickup, delivery, estimationData);
    
    formState.set('distance', estimatedDistance);
    formState.set('duration', estimatedDuration);
    
    elements.calculatedDistance.textContent = `~${estimatedDistance.toFixed(2)} km`;
    elements.distanceInfo.style.display = 'block';
    
    const durationEl = document.getElementById('estimatedDuration');
    if (durationEl) {
        durationEl.textContent = `~${estimatedDuration} min`;
    }
    
    showNotification('📏 Using estimated distance. Actual distance may vary.', 'warning');
    updateProgress(2);
    
    // Force validation here too
    setTimeout(() => {
        checkFormValidity();
    }, 200);
}

function updatePricing() {
    const distance = formState.get('distance');
    if (distance <= 0) return;
    
    console.log('Updating pricing for distance:', distance);
    
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

function checkFormValidity() {
    const pickup = formState.get('pickupCoords');
    const delivery = formState.get('deliveryCoords');
    const distance = formState.get('distance');
    
    console.log('🔍 Form validity check:', {
        hasPickup: !!pickup,
        pickupCoords: pickup,
        hasDelivery: !!delivery,
        deliveryCoords: delivery,
        hasDistance: !!distance,
        distance: distance
    });
    
    const submitBtn = document.getElementById('submitBtn');
    const buttonText = document.getElementById('buttonText');
    
    if (!submitBtn || !buttonText) {
        console.error('❌ Submit button elements not found!');
        return;
    }
    
    if (pickup && delivery && distance > 0) {
        submitBtn.disabled = false;
        buttonText.textContent = 'Book Delivery';
        console.log('✅ Form is valid - button enabled');
    } else {
        submitBtn.disabled = true;
        buttonText.textContent = 'Enter locations to see price';
        console.log('❌ Form is invalid - button disabled');
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (formState.get('isLoading')) return;
    
    const requiredFields = {
        pickupLocation: elements.pickupLocation.value,
        deliveryLocation: elements.deliveryLocation.value,
        recipientName: elements.recipientName.value,
        recipientPhone: elements.recipientPhone.value,
        packageDescription: elements.packageDescription.value
    };
    
    if (!formState.get('isAuthenticated')) {
        requiredFields.vendorName = elements.vendorName?.value;
        requiredFields.phoneNumber = elements.phoneNumber?.value;
    }
    
    const validationResult = validation.validateRequired(requiredFields);
    
    if (!validationResult.isValid) {
        showNotification('Please fill in all required fields: ' + validationResult.missing.join(', '), 'error');
        console.error('Missing fields:', validationResult.missing);
        return;
    }
    
    console.log('Form values:', {
        vendorName: elements.vendorName?.value || 'Authenticated',
        phoneNumber: elements.phoneNumber?.value || 'Authenticated',
        distance: formState.get('distance'),
        service: formState.get('selectedService')
    });
    
    if (!formState.get('isAuthenticated') && !validation.validatePhone(elements.phoneNumber.value)) {
        showNotification('Please enter a valid vendor phone number', 'error');
        return;
    }
    
    if (!validation.validatePhone(elements.recipientPhone.value)) {
        showNotification('Please enter a valid recipient phone number', 'error');
        return;
    }
    
    formState.set('isLoading', true);
    elements.submitBtn.classList.add('loading');
    elements.buttonText.textContent = 'Processing...';
    
    try {
        const deliveryCodes = {
            parcel_code: codes.generateParcelCode(),
            pickup_code: codes.generatePickupCode(),
            delivery_code: codes.generateDeliveryCode()
        };
        
        const finalPrice = pricing.calculate(
            formState.get('distance'),
            formState.get('selectedService'),
            {
                isManaged: formState.get('vendorType') === 'managed'
            }
        );
        
        console.log('Creating booking with price:', finalPrice);
        
        let vendorData;
        let vendorId = null;
        
        if (formState.get('isAuthenticated')) {
            vendorData = formState.get('authenticatedVendor');
            vendorId = vendorData.id;
            console.log('Using authenticated vendor:', vendorData);
        } else {
            const vendorNameValue = elements.vendorName?.value?.trim();
            const phoneValue = elements.phoneNumber?.value;
            
            if (!vendorNameValue || !phoneValue) {
                showNotification('Please fill in your name and phone number', 'error');
                console.error('Vendor info missing:', { name: vendorNameValue, phone: phoneValue });
                return;
            }
            
            // Check if vendor exists
            const existingVendors = await supabaseAPI.query('vendors', {
                filter: `phone=eq.${phoneValue}`,
                limit: 1
            });
            
            if (existingVendors.length === 0) {
                // Create new vendor
                const newVendorData = {
                    vendor_name: vendorNameValue,  // Changed from 'name' to 'vendor_name'
                    phone: phoneValue,
                    vendor_type: formState.get('vendorType') || 'casual',
                    is_managed: formState.get('vendorType') === 'managed',
                    agent_code: formState.get('agentCode') || null,
                    agent_name: formState.get('agentName') || null,
                    status: 'active',
                    total_bookings: 0,
                    successful_deliveries: 0,
                    created_at: new Date().toISOString()
                };
                
                const newVendor = await supabaseAPI.insert('vendors', newVendorData);
                console.log('✅ New vendor created:', newVendor);
                vendorId = newVendor[0]?.id;
                
                vendorData = {
                    ...newVendorData,
                    id: vendorId,
                    vendor_name: vendorNameValue,
                    phone_number: phoneValue
                };
            } else {
                // Update existing vendor
                vendorId = existingVendors[0].id;
                await supabaseAPI.update('vendors', vendorId, {
                    last_active: new Date().toISOString(),
                    total_bookings: (existingVendors[0].total_bookings || 0) + 1
                });
                
                vendorData = {
                    ...existingVendors[0],
                    vendor_name: vendorNameValue,
                    phone_number: phoneValue
                };
            }
        }
        
        console.log('Vendor data:', vendorData);
        
        // Calculate pricing breakdown
        const pricingBreakdown = pricing.calculateBreakdown(finalPrice, formState.get('selectedService'));
        
        const parcelData = {
            vendor_id: vendorId,
            vendor_name: vendorData.vendor_name || vendorData.name,
            vendor_phone: vendorData.phone || vendorData.phone_number,
            vendor_type: vendorData.vendor_type,
            
            pickup_location: {
                address: elements.pickupLocation.value,
                lat: formState.get('pickupCoords').lat,
                lng: formState.get('pickupCoords').lng
            },
            pickup_lat: formState.get('pickupCoords').lat,
            pickup_lng: formState.get('pickupCoords').lng,
            pickup_coordinates: `${formState.get('pickupCoords').lat},${formState.get('pickupCoords').lng}`,
            
            delivery_location: {
                address: elements.deliveryLocation.value,
                lat: formState.get('deliveryCoords').lat,
                lng: formState.get('deliveryCoords').lng
            },
            delivery_lat: formState.get('deliveryCoords').lat,
            delivery_lng: formState.get('deliveryCoords').lng,
            delivery_coordinates: `${formState.get('deliveryCoords').lat},${formState.get('deliveryCoords').lng}`,
            
            recipient_name: elements.recipientName.value,
            recipient_phone: elements.recipientPhone.value,
            
            package_category: elements.packageDescription.value,
            package_description: elements.packageDescription.options[elements.packageDescription.selectedIndex].text,
            package_type: elements.packageDescription.value,
            package_size: formState.get('selectedSize'),
            item_count: formState.get('itemCount'),
            number_of_items: formState.get('itemCount'),
            special_instructions: elements.specialInstructions.value || null,
            
            is_fragile: ['phone', 'laptop', 'electronics-fragile', 'glassware', 'artwork', 'fragile-general'].includes(elements.packageDescription.value),
            is_perishable: ['food-fresh', 'food-frozen'].includes(elements.packageDescription.value),
            requires_signature: ['certificates', 'pharmaceuticals', 'medical-equipment'].includes(elements.packageDescription.value),
            priority_level: ['food-frozen', 'pharmaceuticals'].includes(elements.packageDescription.value) ? 'urgent' : 
                           ['food-fresh', 'medical-equipment'].includes(elements.packageDescription.value) ? 'high' : 'normal',
            
            service_type: formState.get('selectedService'),
            customer_choice: formState.get('selectedService'),
            distance_km: formState.get('distance'),
            estimated_duration_minutes: formState.get('duration') || null,
            duration_minutes: formState.get('duration') || null,
            
            base_price: BUSINESS_CONFIG.pricing.rates.base + (formState.get('distance') * BUSINESS_CONFIG.pricing.rates.perKm),
            service_multiplier: BUSINESS_CONFIG.pricing.multipliers.service[formState.get('selectedService')],
            price: finalPrice,
            total_price: finalPrice,
            platform_fee: pricingBreakdown.platform_fee,
            platform_revenue: pricingBreakdown.platform_revenue,
            vendor_payout: pricingBreakdown.vendor_payout,
            rider_payout: pricingBreakdown.rider_payout,
            
            agent_commission: (vendorData.agent_code && vendorData.is_managed) 
                ? Math.round(pricingBreakdown.platform_fee * 0.15) // 15% of platform's 30% fee
                : 0,
            
            payment_method: formState.get('selectedPaymentMethod'),
            payment_status: formState.get('selectedPaymentMethod') === 'cash' ? 'pending' : 'awaiting_payment',
            
            parcel_code: deliveryCodes.parcel_code,
            pickup_code: deliveryCodes.pickup_code,
            delivery_code: deliveryCodes.delivery_code,
            
            status: 'submitted',
            created_at: new Date().toISOString()
        };
        
        console.log('Saving booking to database...');
        console.log('Parcel data:', parcelData);
        console.log('Price field value:', parcelData.price);
        
        const savedParcel = await supabaseAPI.insert('parcels', parcelData);
        console.log('✅ Parcel saved successfully:', savedParcel);
        
        showSuccess(deliveryCodes, finalPrice);
        
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

function showSuccess(codes, price) {
    console.log('📋 Showing success with codes:', codes, 'price:', price);
    
    // Get elements by ID
    const displayParcelCode = document.getElementById('displayParcelCode');
    const displayPickupCode = document.getElementById('displayPickupCode');
    const displayDeliveryCode = document.getElementById('displayDeliveryCode');
    const displayTotalPrice = document.getElementById('displayTotalPrice');
    const successOverlay = document.getElementById('successOverlay');
    
    // Also try alternative element IDs that might be used
    const parcelCodeEl = displayParcelCode || document.querySelector('[data-parcel-code]') || document.querySelector('.parcel-code');
    const pickupCodeEl = displayPickupCode || document.querySelector('[data-pickup-code]') || document.querySelector('.pickup-code');
    const deliveryCodeEl = displayDeliveryCode || document.querySelector('[data-delivery-code]') || document.querySelector('.delivery-code');
    const priceEl = displayTotalPrice || document.querySelector('[data-total-price]') || document.querySelector('.total-price');
    
    if (!parcelCodeEl || !pickupCodeEl || !deliveryCodeEl) {
        console.error('❌ Success modal code elements not found! Looking for:', {
            parcelCode: !!parcelCodeEl,
            pickupCode: !!pickupCodeEl,
            deliveryCode: !!deliveryCodeEl
        });
        
        // Try to find any element that might display codes
        const modalContent = document.querySelector('.success-content, .modal-content, #successOverlay');
        if (modalContent) {
            console.log('Modal content HTML:', modalContent.innerHTML);
        }
    }
    
    // Set the codes
    if (parcelCodeEl) {
        parcelCodeEl.textContent = codes.parcel_code || codes.parcelCode || 'N/A';
        console.log('✅ Set parcel code:', parcelCodeEl.textContent);
    }
    
    if (pickupCodeEl) {
        pickupCodeEl.textContent = codes.pickup_code || codes.pickupCode || 'N/A';
        console.log('✅ Set pickup code:', pickupCodeEl.textContent);
    }
    
    if (deliveryCodeEl) {
        deliveryCodeEl.textContent = codes.delivery_code || codes.deliveryCode || 'N/A';
        console.log('✅ Set delivery code:', deliveryCodeEl.textContent);
    }
    
    // Display the price
    if (priceEl) {
        priceEl.textContent = `KES ${Math.round(price)}`;
        console.log('✅ Set price:', priceEl.textContent);
    }
    
    // Show the overlay
    if (successOverlay) {
        successOverlay.style.display = 'flex';
        console.log('✅ Success overlay displayed');
        
        // Force a reflow to ensure display updates
        successOverlay.offsetHeight;
        
        // Also try to make it visible through other means
        successOverlay.style.visibility = 'visible';
        successOverlay.style.opacity = '1';
        successOverlay.classList.add('show', 'active');
    } else {
        console.error('❌ Success overlay element not found!');
    }
    
    // As a fallback, also try updating any elements with the specific text content
    const allElements = document.querySelectorAll('*');
    allElements.forEach(el => {
        if (el.textContent === 'Parcel Code' || el.textContent === 'TMXXXXXX') {
            const nextEl = el.nextElementSibling || el.parentElement.querySelector('span, div, p');
            if (nextEl) {
                nextEl.textContent = codes.parcel_code || codes.parcelCode || 'N/A';
                console.log('✅ Updated parcel code via text search');
            }
        }
        if (el.textContent === 'Pickup Code' || el.textContent === 'PKXXXXXX') {
            const nextEl = el.nextElementSibling || el.parentElement.querySelector('span, div, p');
            if (nextEl) {
                nextEl.textContent = codes.pickup_code || codes.pickupCode || 'N/A';
                console.log('✅ Updated pickup code via text search');
            }
        }
        if (el.textContent === 'Delivery Code' || el.textContent === 'DLXXXXXX') {
            const nextEl = el.nextElementSibling || el.parentElement.querySelector('span, div, p');
            if (nextEl) {
                nextEl.textContent = codes.delivery_code || codes.deliveryCode || 'N/A';
                console.log('✅ Updated delivery code via text search');
            }
        }
    });
}

// Override showSuccess globally
window.showSuccess = showSuccess;

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

// ─── Form Validation Monitoring ────────────────────────────────────────────

function setupFormValidationMonitoring() {
    // Watch for button state changes
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
                    const pickup = formState.get('pickupCoords');
                    const delivery = formState.get('deliveryCoords');
                    const distance = formState.get('distance');
                    
                    if (pickup && delivery && distance > 0 && submitBtn.disabled) {
                        console.log('🚨 Button was incorrectly disabled, re-enabling...');
                        submitBtn.disabled = false;
                    }
                }
            });
        });
        
        observer.observe(submitBtn, { attributes: true });
    }
    
    // Periodically check form validity (failsafe)
    setInterval(() => {
        const pickup = formState.get('pickupCoords');
        const delivery = formState.get('deliveryCoords');
        const distance = formState.get('distance');
        
        if (pickup && delivery && distance > 0) {
            const submitBtn = document.getElementById('submitBtn');
            if (submitBtn && submitBtn.disabled) {
                console.log('⏰ Periodic check: enabling button');
                checkFormValidity();
            }
        }
    }, 1000);
}

// ─── Helper Functions ──────────────────────────────────────────────────────

window.forceEnableBooking = function() {
    const pickup = formState.get('pickupCoords');
    const delivery = formState.get('deliveryCoords');
    const distance = formState.get('distance');
    
    console.log('🔨 Force enable booking:', {
        pickup: pickup,
        delivery: delivery,
        distance: distance
    });
    
    const submitBtn = document.getElementById('submitBtn');
    const buttonText = document.getElementById('buttonText');
    
    if (submitBtn && buttonText) {
        if (pickup && delivery && distance > 0) {
            submitBtn.disabled = false;
            buttonText.textContent = 'Book Delivery';
            return '✅ Button enabled!';
        } else {
            return '❌ Missing data - cannot enable. Check pickup, delivery, and distance.';
        }
    } else {
        return '❌ Button elements not found!';
    }
};

window.testBooking = async function() {
    console.log('🧪 Testing booking creation...');
    
    const testData = {
        vendor_name: document.getElementById('vendorName')?.value || 'Test Vendor',
        vendor_phone: document.getElementById('phoneNumber')?.value || '0700000000',
        pickup_location: {
            address: 'Test Pickup',
            lat: -1.2921,
            lng: 36.8219
        },
        delivery_location: {
            address: 'Test Delivery', 
            lat: -1.2821,
            lng: 36.8319
        },
        recipient_name: 'Test Recipient',
        recipient_phone: '0700000001',
        package_category: 'documents',
        package_description: 'Test Package',
        package_size: 'small',
        item_count: 1,
        service_type: 'smart',
        distance_km: 5,
        price: 150,
        total_price: 150,
        payment_method: 'cash',
        payment_status: 'pending',
        parcel_code: 'TEST123',
        pickup_code: 'PK123',
        delivery_code: 'DL123',
        status: 'submitted',
        created_at: new Date().toISOString()
    };
    
    try {
        const result = await supabaseAPI.insert('parcels', testData);
        console.log('✅ Test booking created:', result);
        return result;
    } catch (error) {
        console.error('❌ Test booking failed:', error);
        return error;
    }
};

window.debugSuccessModal = function() {
    console.log('🔍 Debugging success modal...');
    
    // Check for overlay
    const overlay = document.getElementById('successOverlay');
    console.log('Success overlay found:', !!overlay);
    if (overlay) {
        console.log('Overlay display:', overlay.style.display);
        console.log('Overlay visibility:', overlay.style.visibility);
        console.log('Overlay classes:', overlay.className);
    }
    
    // Check for code elements
    const elements = {
        parcelCode: document.getElementById('displayParcelCode'),
        pickupCode: document.getElementById('displayPickupCode'),
        deliveryCode: document.getElementById('displayDeliveryCode'),
        totalPrice: document.getElementById('displayTotalPrice')
    };
    
    Object.entries(elements).forEach(([key, el]) => {
        console.log(`${key} element:`, !!el, el?.textContent || 'N/A');
    });
    
    // Look for any elements that might contain codes
    const possibleCodeElements = document.querySelectorAll('[id*="Code"], [class*="code"], [data-code]');
    console.log('Possible code elements found:', possibleCodeElements.length);
    possibleCodeElements.forEach(el => {
        console.log('Element:', el.tagName, el.id || el.className, '=', el.textContent);
    });
    
    // Check form state
    console.log('Current form state:', {
        distance: formState.get('distance'),
        selectedService: formState.get('selectedService'),
        isLoading: formState.get('isLoading')
    });
    
    return elements;
};

// Manual success display function
window.showSuccessManual = function(parcelCode = 'TM123456', pickupCode = 'PK123456', deliveryCode = 'DL123456', price = 200) {
    const codes = {
        parcel_code: parcelCode,
        pickup_code: pickupCode,
        delivery_code: deliveryCode
    };
    
    showSuccess(codes, price);
    
    // Force display update
    setTimeout(() => {
        const overlay = document.getElementById('successOverlay');
        if (overlay) {
            overlay.style.cssText = 'display: flex !important; visibility: visible !important; opacity: 1 !important;';
        }
    }, 100);
};

// ─── CSS Styles ────────────────────────────────────────────────────────────

// Add fade-in animation for saved locations
if (!document.getElementById('saved-locations-animations')) {
    const style = document.createElement('style');
    style.id = 'saved-locations-animations';
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes locationSuccess {
            0% { transform: scale(1); }
            50% { transform: scale(1.02); }
            100% { transform: scale(1); }
        }
        
        .input-field.location-confirmed {
            border-color: #34C759 !important;
            background: rgba(52, 199, 89, 0.05) !important;
        }
        
        .input-action {
            transition: all 0.3s ease;
        }
        
        .saved-location-btn:hover {
            background: var(--surface-high) !important;
            border-color: var(--primary) !important;
            color: var(--text-primary) !important;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 102, 255, 0.15);
        }
        
        .saved-location-btn:active {
            transform: scale(0.98);
        }
    `;
    document.head.appendChild(style);
}

// ─── Initialize on Load ────────────────────────────────────────────────────

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

console.log('✅ Vendor dashboard script loaded with all integrations');
console.log('💡 Debug commands available:');
console.log('   - forceEnableBooking() : Force enable the booking button');
console.log('   - testBooking() : Create a test booking');
console.log('   - debugSuccessModal() : Debug why codes might not be showing');
console.log('   - showSuccessManual() : Manually show success modal with test data');
