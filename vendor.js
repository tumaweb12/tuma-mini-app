/**
 * Vendor Page Entry Script - Complete Working Version
 * Handles vendor dashboard functionality with direct Supabase REST API calls
 */

// Embedded configuration to avoid import issues
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
    // Service area configuration
    serviceArea: {
        center: { lat: -1.2921, lng: 36.8219 }, // Nairobi CBD
        radiusKm: 30, // Increased to 30km service radius
        expandedRadiusKm: 40 // Future expansion radius
    },
    // Package compatibility matrix
    packageCompatibility: {
        // Define groups that should NOT be mixed
        incompatibleGroups: [
            ['food-dry', 'food-fresh', 'food-frozen', 'beverages'],  // Food items
            ['pharmaceuticals', 'medical-equipment', 'supplements'],   // Medical items
            ['cleaning', 'liquids-sealed', 'paint'],                  // Chemicals/liquids
            ['perfumes', 'cosmetics'],                                // Strong scents
        ],
        // Special handling requirements
        specialHandling: {
            'food-fresh': { maxDelay: 60, priority: 'high' },         // 60 min max
            'food-frozen': { maxDelay: 45, priority: 'urgent' },      // 45 min max
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
            selectedPaymentMethod: 'cash',
            itemCount: 1,
            packageType: '',
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
            selectedPaymentMethod: 'cash',
            itemCount: 1,
            packageType: '',
            isLoading: false
        };
    }
}

// Initialize form state
const formState = new FormState();

// Configuration - UPDATED WITH CORRECT CREDENTIALS FROM TEST.HTML
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

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
    displayDeliveryCode: document.getElementById('displayDeliveryCode'),
    displayTotalPrice: document.getElementById('displayTotalPrice')
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
    },
    
    // Check if location is within service radius
    validateServiceArea: (coords) => {
        // Ensure coords are numbers
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

// Database functions using direct REST API calls - UPDATED
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

// Geocoding Cache Service
const geocodingCache = {
    async search(query, type = 'address') {
        if (!query || query.length < 3) return null;
        
        try {
            // Normalize the query
            const normalizedQuery = query.toLowerCase().trim();
            
            // First check popular places cache for exact matches
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
                // Update usage statistics
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
            // Round coordinates for cache lookup (about 11 meter precision)
            const latRounded = Math.round(lat * 10000) / 10000;
            const lngRounded = Math.round(lng * 10000) / 10000;
            
            const cached = await supabaseAPI.query('reverse_geocoding_cache', {
                filter: `lat_rounded=eq.${latRounded}&lng_rounded=eq.${lngRounded}`,
                limit: 1
            });
            
            if (cached.length > 0 && cached[0].expires_at > new Date().toISOString()) {
                // Update usage statistics
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
            
            // Extract address components if available
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
            
            // Add Google Place ID if available
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
            
            // Extract address components similar to forward geocoding
            if (result.address_components) {
                // ... same component extraction as above
            }
            
            await supabaseAPI.insert('reverse_geocoding_cache', cacheData);
            console.log('💾 Reverse geocoding cached');
        } catch (error) {
            console.error('Reverse cache store error:', error);
        }
    }
};

// Distance Matrix Cache Service
const distanceCache = {
    // In-memory cache
    cache: new Map(),
    
    // Database cache methods
    async searchDB(pickup, delivery, travelMode = 'driving') {
        try {
            // Round coordinates for caching (about 100m precision)
            const originLat = Math.round(pickup.lat * 100000) / 100000;
            const originLng = Math.round(pickup.lng * 100000) / 100000;
            const destLat = Math.round(delivery.lat * 100000) / 100000;
            const destLng = Math.round(delivery.lng * 100000) / 100000;
            
            const cached = await supabaseAPI.query('distance_matrix_cache', {
                filter: `origin_lat=eq.${originLat}&origin_lng=eq.${originLng}&destination_lat=eq.${destLat}&destination_lng=eq.${destLng}&travel_mode=eq.${travelMode}`,
                limit: 1
            });
            
            if (cached.length > 0 && cached[0].expires_at > new Date().toISOString()) {
                // Update usage statistics
                await supabaseAPI.update('distance_matrix_cache', cached[0].id, {
                    usage_count: cached[0].usage_count + 1,
                    last_used: new Date().toISOString()
                });
                
                console.log('📦 Distance from DB cache');
                return {
                    distance: cached[0].distance_meters / 1000, // Convert to km
                    duration: Math.ceil(cached[0].duration_seconds / 60), // Convert to minutes
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
                distance_meters: Math.round(result.distance * 1000), // Convert km to meters
                distance_text: result.distance_text || `${result.distance.toFixed(1)} km`,
                duration_seconds: result.duration * 60, // Convert minutes to seconds
                duration_text: result.duration_text || `${result.duration} min`,
                travel_mode: travelMode,
                provider: provider,
                route_polyline: result.polyline || null,
                raw_response: result.raw || {},
                // Set appropriate expiry based on time of day
                expires_at: new Date(Date.now() + (isRushHour() ? 30 * 60000 : 120 * 60000)).toISOString()
            };
            
            await supabaseAPI.insert('distance_matrix_cache', cacheData);
            console.log('💾 Distance cached to DB');
        } catch (error) {
            console.error('Distance cache store error:', error);
        }
    },
    
    // Keep existing in-memory cache methods but also use DB
    get: async function(pickup, delivery) {
        // First check in-memory cache
        const key = this.getKey(pickup, delivery);
        const memCached = this.cache.get(key);
        
        if (memCached) {
            console.log('📦 Distance from memory cache:', key);
            memCached.lastUsed = Date.now();
            return memCached.data;
        }
        
        // Then check database cache
        const dbCached = await this.searchDB(pickup, delivery);
        if (dbCached) {
            // Store in memory cache for faster subsequent access
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
        // Store in both memory and database
        const key = this.getKey(pickup, delivery);
        
        // Memory cache
        this.cache.set(key, {
            data: data,
            created: Date.now(),
            lastUsed: Date.now()
        });
        
        // Also cache reverse route
        const reverseKey = this.getKey(delivery, pickup);
        this.cache.set(reverseKey, {
            data: { ...data, distance: data.distance },
            created: Date.now(),
            lastUsed: Date.now()
        });
        
        // Database cache
        await this.storeDB(pickup, delivery, data);
        
        // Persist memory cache
        this.persist();
    },
    
    // Generate cache key with 100m precision (reduces unique combinations)
    getKey: (pickup, delivery) => {
        const p = `${pickup.lat.toFixed(3)},${pickup.lng.toFixed(3)}`;
        const d = `${delivery.lat.toFixed(3)},${delivery.lng.toFixed(3)}`;
        return `${p}→${d}`;
    },
    
    // Persist to localStorage (survives page reloads)
    persist: function() {
        try {
            const cacheData = Array.from(this.cache.entries()).slice(-1000); // Keep last 1000 entries
            localStorage.setItem('tuma_distance_cache', JSON.stringify(cacheData));
        } catch (e) {
            console.warn('Failed to persist cache:', e);
        }
    },
    
    // Load from localStorage
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
    
    // Get cache stats
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

// Helper function to determine rush hour
function isRushHour() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    // Monday to Friday
    if (day >= 1 && day <= 5) {
        // Morning rush: 6:30 AM - 9:30 AM
        // Evening rush: 4:30 PM - 7:30 PM
        return (hour >= 6 && hour < 10) || (hour >= 16 && hour < 20);
    }
    
    return false;
}

// Enhanced geocoding with better Nairobi support and caching
async function geocodeAddress(address) {
    // Check cache first
    const cached = await geocodingCache.search(address);
    if (cached) {
        return cached;
    }
    
    // Add "Nairobi, Kenya" if not already specified
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
        
        // Prefer results within Nairobi
        const nairobiResult = data.find(result => 
            result.display_name.toLowerCase().includes('nairobi')
        ) || data[0];
        
        const result = {
            lat: parseFloat(nairobiResult.lat),
            lng: parseFloat(nairobiResult.lon),
            display_name: nairobiResult.display_name
        };
        
        // Cache the result
        await geocodingCache.store(address, result, 'nominatim');
        
        return result;
    } catch (error) {
        console.error('Geocoding error:', error);
        throw new Error('Could not find address. Please be more specific.');
    }
}

function calculateStraightDistance(point1, point2) {
    // Ensure we have valid coordinates
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

// Helper function to convert degrees to radians
function toRad(value) {
    return value * Math.PI / 180;
}

// Notification functions
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

// ─── Global Functions (Must be defined before initialize()) ───────────────

// Update item count
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

// Select package size
window.selectSize = function(size) {
    document.querySelectorAll('.size-option').forEach(el => el.classList.remove('selected'));
    const selected = document.querySelector(`[data-size="${size}"]`);
    if (selected) {
        selected.classList.add('selected');
        formState.set('selectedSize', size);
    }
};

// Select service type
window.selectService = function(service) {
    document.querySelectorAll('.service-card').forEach(el => el.classList.remove('selected'));
    const selected = document.querySelector(`[data-service="${service}"]`);
    if (selected) {
        selected.classList.add('selected');
        formState.set('selectedService', service);
        updateProgress(3);
    }
};

// Select payment method
window.selectPaymentMethod = function(method) {
    // Remove selected class from all buttons
    document.querySelectorAll('.payment-button').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Add selected class to clicked button
    if (method === 'online') {
        document.querySelector('.payment-button.pay-now').classList.add('selected');
    } else {
        document.querySelector('.payment-button.cash-delivery').classList.add('selected');
    }
    
    // Store selected method
    formState.set('selectedPaymentMethod', method);
};

// Track delivery
window.trackDelivery = function() {
    const parcelCode = elements.displayParcelCode.textContent;
    window.location.href = `tracking.html?parcel=${parcelCode}`;
};

// GPS location function with caching
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
        
        // Validate service area before proceeding
        const serviceAreaCheck = validation.validateServiceArea(coords);
        if (!serviceAreaCheck.isValid) {
            showNotification(
                `Your location is outside our current service area (${serviceAreaCheck.distance.toFixed(1)}km from CBD). We serve areas within ${serviceAreaCheck.maxRadius}km of Nairobi CBD.`,
                'error'
            );
            return;
        }
        
        // Check reverse geocoding cache first
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
            // Reverse geocode to get address
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}`);
            const data = await response.json();
            
            const input = type === 'pickup' ? elements.pickupLocation : elements.deliveryLocation;
            input.value = data.display_name || `${coords.lat}, ${coords.lng}`;
            
            // Store coords in dataset for consistency
            input.dataset.lat = coords.lat;
            input.dataset.lng = coords.lng;
            
            formState.set(`${type}Coords`, coords);
            
            // Cache the reverse geocoding result
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

// Alias functions
window.useGPS = window.getLocation;
window.typeAddress = function(type) {
    const input = type === 'pickup' ? elements.pickupLocation : elements.deliveryLocation;
    input.focus();
    showNotification('Type your address in the field above', 'info');
};

// Delivery type toggle
window.toggleDeliveryType = function(type) {
    // For now, just log - can implement bulk delivery later
    console.log('Delivery type:', type);
};

// Add bulk delivery
window.addBulkDelivery = function() {
    showNotification('Bulk delivery feature coming soon!', 'info');
};

// Share delivery details
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

// Book another delivery
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
    document.querySelector('[data-size="small"]')?.classList.add('selected');
    document.querySelectorAll('.service-card').forEach(el => el.classList.remove('selected'));
    document.querySelector('[data-service="smart"]')?.classList.add('selected');
    
    // Clear location data attributes
    if (elements.pickupLocation) {
        delete elements.pickupLocation.dataset.lat;
        delete elements.pickupLocation.dataset.lng;
    }
    if (elements.deliveryLocation) {
        delete elements.deliveryLocation.dataset.lat;
        delete elements.deliveryLocation.dataset.lng;
    }
};

// ─── Map Modal Functions ───────────────────────────────────────

// Shared state for the modal (ONLY DECLARE THESE ONCE)
let simpleMap = null;
let currentInputField = null;
let selectedSimpleLocation = null;

// Open the map modal & lazy-init the map + search
window.openSimpleLocationModal = function(inputId) {
    currentInputField = inputId;
    document.getElementById('simpleLocationModal').style.display = 'block';

    if (!simpleMap) {
        // Initialize Leaflet map
        simpleMap = L.map('simpleMap').setView([-1.2921, 36.8219], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(simpleMap);

        // When the user drags or zooms, re-reverse-geocode center
        simpleMap.on('moveend', updateSelectedLocation);

        // Wire up the search button
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

    // Force a resize after the modal opens
    setTimeout(() => simpleMap.invalidateSize(), 100);
};

// Reverse-geocode the map's center
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

// Update the location display in the modal
function updateLocationDisplay() {
    if (!selectedSimpleLocation) return;
    const name = selectedSimpleLocation.address.split(',')[0] || 'Selected Location';
    document.getElementById('selectedLocationName').textContent = name;
    document.getElementById('selectedLocationAddress').textContent = selectedSimpleLocation.address;
}

// Confirm location selection
window.confirmSimpleLocation = function() {
    if (!selectedSimpleLocation || !currentInputField) return;
    
    // First validate service area
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
    
    // Trigger handleLocationChange
    const type = currentInputField.includes('pickup') ? 'pickup' : 'delivery';
    handleLocationChange(type);
    
    closeLocationModal();
};

// Close the location modal
window.closeLocationModal = function() {
    document.getElementById('simpleLocationModal').style.display = 'none';
    currentInputField = null;
    selectedSimpleLocation = null;
};

// ─── Core Functions ───────────────────────────────────────

// Check if user is authenticated (future implementation)
async function checkAuthAndLoadVendor() {
    // TODO: In the future, this will check for authenticated user
    // For now, return null to indicate no auth
    
    // Future implementation will look like:
    // const session = await supabase.auth.getSession();
    // if (session?.user) {
    //     const vendor = await supabaseAPI.query('vendors', {
    //         filter: `user_id=eq.${session.user.id}`,
    //         limit: 1
    //     });
    //     return vendor[0];
    // }
    
    return null;
}

// Initialize page
async function initialize() {
    console.log('Initializing vendor dashboard...');
    
    // Check if user is authenticated
    const authenticatedVendor = await checkAuthAndLoadVendor();
    
    if (authenticatedVendor) {
        // Hide the "Your Information" section
        const vendorInfoSection = document.querySelector('.form-section:has(#vendorName)');
        if (vendorInfoSection) {
            vendorInfoSection.style.display = 'none';
        }
        
        // Store vendor info in form state
        formState.set('authenticatedVendor', authenticatedVendor);
        formState.set('vendorType', authenticatedVendor.vendor_type);
        formState.set('isAuthenticated', true);
        
        // Show vendor badge
        displayVendorBadge({
            isManaged: authenticatedVendor.is_managed,
            agentName: authenticatedVendor.agent_name
        });
    } else {
        // No auth - show the form fields as normal
        formState.set('isAuthenticated', false);
    }
    
    setupEventListeners();
    setupStateSubscriptions();
    updateCapacityDisplay();
    
    // Set default service selection
    formState.set('selectedService', 'smart');
    formState.set('selectedSize', 'small');
    
    // Initialize Google Places Autocomplete
    initializeGooglePlacesAutocomplete();
    
    // Test Supabase connection on load
    testSupabaseConnection();
    
    // Load distance cache from localStorage
    distanceCache.load();
    
    console.log('Vendor dashboard initialized successfully');
}

// Test Supabase connection
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

// Initialize Google Places Autocomplete
function initializeGooglePlacesAutocomplete() {
    // Wait for Google Maps API to load
    if (window.google && window.google.maps && window.google.maps.places) {
        console.log('✅ Google Maps API loaded, setting up autocomplete');
        setupAutocomplete();
    } else {
        console.log('⏳ Waiting for Google Maps API...');
        // Try again after a delay
        setTimeout(initializeGooglePlacesAutocomplete, 500);
    }
}

// Global callback for Google Maps
window.initMap = function() {
    console.log('✅ Google Maps initialized via callback');
    initializeGooglePlacesAutocomplete();
};

// Setup Google Places Autocomplete with caching
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
                
                // Debug log
                console.log(`Google Places selected for ${type}:`, {
                    name: place.name,
                    address: place.formatted_address,
                    lat: coords.lat,
                    lng: coords.lng
                });
                
                // Store coordinates in dataset
                inputElement.dataset.lat = coords.lat;
                inputElement.dataset.lng = coords.lng;
                
                // Cache the geocoding result FIRST
                await geocodingCache.store(inputElement.value, coords, 'google');
                
                // Update form state directly without calling handleLocationChange yet
                formState.set(`${type}Coords`, coords);
                
                // Show success indicator
                updateLocationStatus(inputElement, true);
                showNotification('✅ Location selected', 'success');
                
                // Calculate distance if both locations are set
                if (formState.get('pickupCoords') && formState.get('deliveryCoords')) {
                    await calculateDistance();
                }
            } else if (place.name || place.formatted_address) {
                // Place selected but no geometry - use Google Geocoder
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
                        
                        // Cache the result
                        await geocodingCache.store(addressToGeocode, coords, 'google');
                        
                        // Call the handler
                        handleLocationChange(type);
                    } else {
                        console.error('Google Geocoding failed:', status);
                        showNotification('Could not find exact location. Please try a different address.', 'error');
                    }
                });
            } else {
                // No valid place selected
                showNotification('Please select a valid address from the dropdown', 'warning');
            }
        });
        
        // Prevent form submission on Enter key in autocomplete
        inputElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
            }
        });
    };
    
    setupField(elements.pickupLocation, 'pickup');
    setupField(elements.deliveryLocation, 'delivery');
}

// Setup event listeners
function setupEventListeners() {
    // Phone number input
    elements.phoneNumber?.addEventListener('input', handlePhoneInput);
    elements.recipientPhone?.addEventListener('input', handleRecipientPhoneInput);
    
    // Location inputs - remove the blur event listener that might be causing duplicate validation
    // elements.pickupLocation?.addEventListener('blur', () => handleLocationChange('pickup'));
    // elements.deliveryLocation?.addEventListener('blur', () => handleLocationChange('delivery'));
    
    // Package description dropdown
    elements.packageDescription?.addEventListener('change', (e) => {
        handlePackageTypeChange(e.target.value);
    });
    
    // Character counter
    elements.specialInstructions?.addEventListener('input', (e) => {
        const charCountEl = document.getElementById('charCount');
        if (charCountEl) {
            charCountEl.textContent = e.target.value.length;
        }
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
    
    // Check if vendor is managed when phone is complete
    if (value.length === 10 && validation.validatePhone(value)) {
        try {
            const vendors = await supabaseAPI.query('vendors', {
                filter: `phone=eq.${value}`, // Changed from phone_number to phone
                limit: 1
            });
            
            if (vendors.length > 0) {
                const vendor = vendors[0];
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
                    
                    showNotification(`Welcome back! Managed by ${vendor.agent_name}`, 'success');
                }
            } else {
                // New vendor
                formState.set({
                    vendorType: 'casual',
                    agentCode: null,
                    agentName: null
                });
                elements.vendorBadge.style.display = 'none';
            }
        } catch (error) {
            console.error('Error checking vendor status:', error);
            // Default to casual vendor on error
            formState.set({
                vendorType: 'casual',
                agentCode: null,
                agentName: null
            });
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

// Handle package type selection
function handlePackageTypeChange(packageType) {
    if (!packageType) return;
    
    const specialHandling = BUSINESS_CONFIG.packageCompatibility.specialHandling[packageType];
    
    // Update service recommendation based on package type
    if (specialHandling) {
        if (specialHandling.priority === 'urgent' || specialHandling.maxDelay <= 60) {
            // Recommend Express for time-sensitive items
            showNotification('⚡ Express delivery recommended for this item type', 'info');
            
            // Optionally auto-select Express service
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
    
    // Store package type in form state
    formState.set('packageType', packageType);
}

// Handle location change with caching
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
    
    // If coordinates already provided (by Google), use them directly
    if (dsLat && dsLng) {
        const coords = {
            lat: parseFloat(dsLat),
            lng: parseFloat(dsLng),
            display_name: address
        };
        
        console.log('Using dataset coordinates:', coords);
        
        // Validate service area
        const serviceAreaCheck = validation.validateServiceArea(coords);
        if (!serviceAreaCheck.isValid) {
            // Check if it's a known Nairobi location that should be valid
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
            
            // Also check if "nairobi" is in the address
            const isNairobiAddress = locationName.includes('nairobi') || addressLower.includes('nairobi');
            
            if (isKnownLocation || isNairobiAddress) {
                // Log warning but allow the location
                console.warn('Known Nairobi location detected, overriding distance check:', {
                    address: address,
                    coords: coords,
                    calculatedDistance: serviceAreaCheck.distance.toFixed(2) + 'km',
                    decision: 'ALLOWING'
                });
                
                // Check if coordinates look suspicious (not in Kenya region)
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
                // Clear the input and dataset
                input.value = '';
                delete input.dataset.lat;
                delete input.dataset.lng;
                // Remove success indicator
                updateLocationStatus(input, false);
                return;
            }
        }
        
        formState.set(`${type}Coords`, coords);
        
        // Show success indicator
        updateLocationStatus(input, true);
        
        if (formState.get('pickupCoords') && formState.get('deliveryCoords')) {
            await calculateDistance();
        }
        return; // Exit here - no need to geocode again
    }
    
    // Only try geocoding if user typed address manually without selecting from dropdown
    if (!address || address.length < 3) {
        updateLocationStatus(input, false);
        return;
    }
    
    // First check cache
    const cached = await geocodingCache.search(address);
    if (cached) {
        const coords = {
            lat: cached.lat,
            lng: cached.lng,
            display_name: cached.display_name
        };
        
       // Validate service area
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
        
        // Store in dataset for consistency
        input.dataset.lat = coords.lat;
        input.dataset.lng = coords.lng;
        
        formState.set(`${type}Coords`, coords);
        
        // Show success indicator
        updateLocationStatus(input, true);
        
        if (formState.get('pickupCoords') && formState.get('deliveryCoords')) {
            await calculateDistance();
        }
        
        showNotification(`📦 Location loaded from cache`, 'success');
        return;
    }
    
    // Check if Google Maps is loaded and try Google Geocoder first
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
                
                // Store in dataset for consistency
                input.dataset.lat = coords.lat;
                input.dataset.lng = coords.lng;
                input.value = results[0].formatted_address;
                
                // Validate service area
                const serviceAreaCheck = validation.validateServiceArea(coords);
                if (!serviceAreaCheck.isValid) {
                    showNotification(
                        `Sorry, this location is ${serviceAreaCheck.distance.toFixed(1)}km from our service center. We currently serve areas within ${serviceAreaCheck.maxRadius}km of Nairobi CBD.`,
                        'error'
                    );
                    // Clear the input and dataset
                    input.value = '';
                    delete input.dataset.lat;
                    delete input.dataset.lng;
                    updateLocationStatus(input, false);
                    return;
                }
                
                // Cache the result
                await geocodingCache.store(address, coords, 'google');
                
                formState.set(`${type}Coords`, coords);
                
                // Show success indicator
                updateLocationStatus(input, true);
                
                if (formState.get('pickupCoords') && formState.get('deliveryCoords')) {
                    await calculateDistance();
                }
            } else {
                // Fall back to Nominatim only if Google Geocoder fails
                console.log('Google Geocoder failed, trying Nominatim');
                await geocodeWithNominatim(address, type);
            }
        });
    } else {
        // Google Maps not loaded, use Nominatim
        await geocodeWithNominatim(address, type);
    }
}

// Helper function to update location input visual status
function updateLocationStatus(input, isValid) {
    const container = input.parentElement;
    const actionButton = container.querySelector('.input-action');
    
    if (isValid) {
        // Add success state
        input.classList.add('location-confirmed');
        input.classList.remove('error');
        
        // Change icon to checkmark
        if (actionButton) {
            actionButton.innerHTML = `
                <svg viewBox="0 0 24 24" style="fill: #34C759;">
                    <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                </svg>
            `;
            actionButton.style.background = 'rgba(52, 199, 89, 0.1)';
        }
        
        // Add subtle animation
        input.style.animation = 'locationSuccess 0.3s ease-out';
    } else {
        // Remove success state
        input.classList.remove('location-confirmed');
        
        // Reset icon to location pin
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

// Separate function for Nominatim geocoding with caching
async function geocodeWithNominatim(address, type) {
    const input = type === 'pickup' ? elements.pickupLocation : elements.deliveryLocation;
    
    try {
        console.log(`Geocoding ${type} via Nominatim:`, address);
        const coords = await geocodeAddress(address); // This now includes caching
        
        // Validate service area
        const serviceAreaCheck = validation.validateServiceArea(coords);
        if (!serviceAreaCheck.isValid) {
            showNotification(
                `Sorry, this location is ${serviceAreaCheck.distance.toFixed(1)}km from our service center. We currently serve areas within ${serviceAreaCheck.maxRadius}km of Nairobi CBD.`,
                'error'
            );
            // Clear the input and dataset
            input.value = '';
            delete input.dataset.lat;
            delete input.dataset.lng;
            return;
        }
        
        // Store coordinates for consistency
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

// Calculate distance between pickup and delivery with enhanced caching
async function calculateDistance() {
    const pickup = formState.get('pickupCoords');
    const delivery = formState.get('deliveryCoords');
    
    if (!pickup || !delivery) return;
    
    // Check cache first (now checks both memory and database)
    const cached = await distanceCache.get(pickup, delivery);
    if (cached) {
        console.log('✅ Using cached distance:', cached.distance, 'km');
        formState.set('distance', cached.distance);
        formState.set('duration', cached.duration);
        elements.calculatedDistance.textContent = `${cached.distance.toFixed(2)} km`;
        elements.distanceInfo.style.display = 'block';
        
        // Add duration display if element exists
        const durationEl = document.getElementById('estimatedDuration');
        if (durationEl) {
            durationEl.textContent = `~${cached.duration} min`;
        }
        
        updateProgress(2);
        
        // Show cache savings notification occasionally
        const stats = distanceCache.getStats();
        if (stats.hits % 10 === 0 && stats.hits > 0) {
            showNotification(`💰 Saved ${stats.hits} API calls using smart caching!`, 'success');
        }
        return;
    }
    
    // Try Google Distance Matrix API
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
                        departureTime: new Date(), // For traffic consideration
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
                const distance = element.distance.value / 1000; // Convert to km
                const duration = Math.ceil(element.duration.value / 60); // Convert to minutes
                
                console.log('📍 Google Distance Matrix:', distance, 'km,', duration, 'minutes');
                
                // Prepare data for caching
                const cacheData = {
                    distance: distance,
                    duration: duration,
                    distance_text: element.distance.text,
                    duration_text: element.duration.text,
                    timestamp: Date.now(),
                    raw: response
                };
                
                // Cache the result (both memory and database)
                await distanceCache.set(pickup, delivery, cacheData);
                
                formState.set('distance', distance);
                formState.set('duration', duration);
                
                // Update UI
                elements.calculatedDistance.textContent = `${distance.toFixed(2)} km`;
                elements.distanceInfo.style.display = 'block';
                
                // Add duration display if element exists
                const durationEl = document.getElementById('estimatedDuration');
                if (durationEl) {
                    durationEl.textContent = `~${duration} min`;
                }
                
                updateProgress(2);
                return;
            }
        } catch (error) {
            console.error('Distance Matrix API failed:', error);
            // Fall through to estimation
        }
    }
    
    // Fallback to estimation (only if Google fails)
    console.log('⚠️ Using estimation fallback');
    const straightDistance = calculateStraightDistance(pickup, delivery);
    const estimatedDistance = straightDistance * 1.5; // 50% buffer for Nairobi roads
    const estimatedDuration = Math.ceil(estimatedDistance * 3); // 3 min per km average
    
    // Cache even estimations to avoid repeated calculations
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
    
    // Update UI with warning
    elements.calculatedDistance.textContent = `~${estimatedDistance.toFixed(2)} km`;
    elements.distanceInfo.style.display = 'block';
    
    const durationEl = document.getElementById('estimatedDuration');
    if (durationEl) {
        durationEl.textContent = `~${estimatedDuration} min`;
    }
    
    showNotification('📏 Using estimated distance. Actual distance may vary.', 'warning');
    updateProgress(2);
}

// Update pricing display
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

// Handle form submission - UPDATED WITH SUPABASE SAVE
async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (formState.get('isLoading')) return;
    
    // Validate form
    const requiredFields = {
        pickupLocation: elements.pickupLocation.value,
        deliveryLocation: elements.deliveryLocation.value,
        recipientName: elements.recipientName.value,
        recipientPhone: elements.recipientPhone.value,
        packageDescription: elements.packageDescription.value
    };
    
    // Only require vendor fields if not authenticated
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
    
    // Debug log to check values
    console.log('Form values:', {
        vendorName: elements.vendorName?.value || 'Authenticated',
        phoneNumber: elements.phoneNumber?.value || 'Authenticated',
        distance: formState.get('distance'),
        service: formState.get('selectedService')
    });
    
    // Validate phone numbers
    if (!formState.get('isAuthenticated') && !validation.validatePhone(elements.phoneNumber.value)) {
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
            pickup_code: codes.generatePickupCode(),
            delivery_code: codes.generateDeliveryCode()
        };
        
        // Calculate final price
        const finalPrice = pricing.calculate(
            formState.get('distance'),
            formState.get('selectedService'),
            {
                isManaged: formState.get('vendorType') === 'managed'
            }
        );
        
        console.log('Creating booking with price:', finalPrice);
        
        let vendorData;
        
        // Check if user is authenticated
        if (formState.get('isAuthenticated')) {
            // Use authenticated vendor data
            vendorData = formState.get('authenticatedVendor');
            console.log('Using authenticated vendor:', vendorData);
        } else {
            // Get vendor data from form inputs
            const vendorNameValue = elements.vendorName?.value?.trim();
            const phoneValue = elements.phoneNumber?.value;
            
            if (!vendorNameValue || !phoneValue) {
                showNotification('Please fill in your name and phone number', 'error');
                console.error('Vendor info missing:', { name: vendorNameValue, phone: phoneValue });
                return;
            }
            
            // Prepare vendor data from form
            vendorData = {
                vendor_name: vendorNameValue,
                phone: phoneValue,
                phone_number: phoneValue, // Keep both for compatibility
                name: vendorNameValue, // Also include 'name' field
                vendor_type: formState.get('vendorType') || 'casual',
                is_managed: formState.get('vendorType') === 'managed',
                agent_code: formState.get('agentCode') || null,
                agent_name: formState.get('agentName') || null,
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_active: new Date().toISOString()
            };
        }
        
        console.log('Vendor data:', vendorData);
        
        // Prepare parcel data with enhanced fields
        const parcelData = {
            // Vendor info
            vendor_name: vendorData.vendor_name,
            vendor_phone: vendorData.phone, // Use 'phone' field from vendorData
            vendor_type: vendorData.vendor_type,
            vendor_id: null, // Will be set after vendor is created/found
            
            // Pickup info - Note: pickup_location and delivery_location need to be JSONB
            pickup_location: {
                address: elements.pickupLocation.value,
                lat: formState.get('pickupCoords').lat,
                lng: formState.get('pickupCoords').lng
            },
            pickup_lat: formState.get('pickupCoords').lat,
            pickup_lng: formState.get('pickupCoords').lng,
            pickup_coordinates: `${formState.get('pickupCoords').lat},${formState.get('pickupCoords').lng}`,
            
            // Delivery info
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
            
            // Package info
            package_category: elements.packageDescription.value,
            package_description: elements.packageDescription.options[elements.packageDescription.selectedIndex].text,
            package_type: elements.packageDescription.value,
            package_size: formState.get('selectedSize'),
            item_count: formState.get('itemCount'),
            number_of_items: formState.get('itemCount'),
            special_instructions: elements.specialInstructions.value || null,
            
            // Special handling flags based on package category
            is_fragile: ['phone', 'laptop', 'electronics-fragile', 'glassware', 'artwork', 'fragile-general'].includes(elements.packageDescription.value),
            is_perishable: ['food-fresh', 'food-frozen'].includes(elements.packageDescription.value),
            requires_signature: ['certificates', 'pharmaceuticals', 'medical-equipment'].includes(elements.packageDescription.value),
            priority_level: ['food-frozen', 'pharmaceuticals'].includes(elements.packageDescription.value) ? 'urgent' : 
                           ['food-fresh', 'medical-equipment'].includes(elements.packageDescription.value) ? 'high' : 'normal',
            
            // Service info
            service_type: formState.get('selectedService'),
            customer_choice: formState.get('selectedService'), // Duplicate for compatibility
            distance_km: formState.get('distance'),
            estimated_duration_minutes: formState.get('duration') || null,
            duration_minutes: formState.get('duration') || null,
            
            // Pricing breakdown - IMPORTANT: price is required
            base_price: BUSINESS_CONFIG.pricing.rates.base + (formState.get('distance') * BUSINESS_CONFIG.pricing.rates.perKm),
            service_multiplier: BUSINESS_CONFIG.pricing.multipliers.service[formState.get('selectedService')],
            price: finalPrice, // Required field
            total_price: finalPrice,
            platform_fee: Math.round(finalPrice * 0.15), // 15% platform fee
            platform_revenue: Math.round(finalPrice * 0.15), // Same as platform_fee
            vendor_payout: Math.round(finalPrice * 0.85), // 85% to vendor
            rider_payout: Math.round(finalPrice * 0.7), // Assuming rider gets 70%
            
            // Payment info
            payment_method: formState.get('selectedPaymentMethod'),
            payment_status: formState.get('selectedPaymentMethod') === 'cash' ? 'pending' : 'awaiting_payment',
            
            // Codes
            parcel_code: deliveryCodes.parcel_code,
            pickup_code: deliveryCodes.pickup_code,
            delivery_code: deliveryCodes.delivery_code,
            
            // Status
            status: 'submitted',
            created_at: new Date().toISOString()
        };
        
        // Save to database
        console.log('Saving booking to database...');
        console.log('Parcel data:', parcelData);
        console.log('Price field value:', parcelData.price);
        
        // First, check if vendor exists and update or create (only if not authenticated)
        if (!formState.get('isAuthenticated')) {
            try {
                const existingVendors = await supabaseAPI.query('vendors', {
                    filter: `phone=eq.${vendorData.phone}`, // Changed from phone_number to phone
                    limit: 1
                });
                
                if (existingVendors.length === 0) {
                    // Create new vendor
                    const newVendor = await supabaseAPI.insert('vendors', vendorData);
                    console.log('✅ New vendor created:', newVendor);
                    // Use the new vendor's ID
                    if (newVendor && newVendor[0]) {
                        parcelData.vendor_id = newVendor[0].id;
                    }
                } else {
                    // Update last_active for existing vendor
                    console.log('Vendor already exists:', existingVendors[0]);
                    parcelData.vendor_id = existingVendors[0].id;
                    // Optionally update last_active
                    await supabaseAPI.update('vendors', existingVendors[0].id, {
                        last_active: new Date().toISOString()
                    });
                }
            } catch (vendorError) {
                console.error('Vendor save error:', vendorError);
                // Continue with booking even if vendor save fails
            }
        } else {
            // For authenticated users, use their vendor ID directly
            parcelData.vendor_id = vendorData.id;
        }
        
        // Save parcel - FIXED: Changed from bookingData to parcelData
        const savedParcel = await supabaseAPI.insert('parcels', parcelData);
        console.log('✅ Parcel saved successfully:', savedParcel);
        
        // Show success
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

// Show success modal
function showSuccess(codes, price) {
    elements.displayParcelCode.textContent = codes.parcel_code;
    elements.displayPickupCode.textContent = codes.pickup_code;
    elements.displayDeliveryCode.textContent = codes.delivery_code;
    
    // Add price display
    if (elements.displayTotalPrice && price) {
        elements.displayTotalPrice.textContent = `KES ${price.toLocaleString()}`;
    }
    
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

// Initialize on load
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// Export showNotification to global scope
window.showNotification = showNotification;

// Add CSS for location success animation only if not already added
if (!document.getElementById('location-success-styles')) {
    const style = document.createElement('style');
    style.id = 'location-success-styles';
    style.textContent = `
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
    `;
    document.head.appendChild(style);
}
// Add this code at the very end of your vendor.js file
// This is a comprehensive fix for the booking button issue

// Fix 1: Ensure form validation runs after any state change
(function() {
    console.log('🔧 Applying comprehensive booking button fix...');
    
    // Override checkFormValidity to be more aggressive
    window.checkFormValidity = function() {
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
        
        // Get button elements
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
    };
    
    // Fix 2: Watch for state changes more aggressively
    const originalFormStateSet = formState.set;
    formState.set = function(key, value) {
        // Call original
        originalFormStateSet.call(this, key, value);
        
        // Check validity after any relevant change
        if (key === 'distance' || key === 'pickupCoords' || key === 'deliveryCoords') {
            setTimeout(() => {
                checkFormValidity();
            }, 100);
        }
    };
    
    // Fix 3: Ensure calculateDistance always triggers validation
    const originalCalculateDistance = window.calculateDistance;
    window.calculateDistance = async function() {
        console.log('📏 Calculating distance...');
        const result = await originalCalculateDistance.apply(this, arguments);
        
        // Force validation after calculation
        setTimeout(() => {
            checkFormValidity();
            
            // Double-check and force enable if conditions are met
            const pickup = formState.get('pickupCoords');
            const delivery = formState.get('deliveryCoords');
            const distance = formState.get('distance');
            
            if (pickup && delivery && distance > 0) {
                const submitBtn = document.getElementById('submitBtn');
                const buttonText = document.getElementById('buttonText');
                
                if (submitBtn && submitBtn.disabled) {
                    console.log('🚨 Force-enabling button after distance calculation');
                    submitBtn.disabled = false;
                    buttonText.textContent = 'Book Delivery';
                }
            }
        }, 200);
        
        return result;
    };
    
    // Fix 4: Manual validation helper (can be called from console)
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
    
    // Fix 5: Add mutation observer to watch for button state changes
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
    
    // Fix 6: Periodically check form validity (failsafe)
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
    
    console.log('✅ Comprehensive booking button fix applied!');
    console.log('💡 If button is still disabled, run: forceEnableBooking()');
})();
// Add this code to the END of your vendor.js file
// This will intercept and fix the status before submission

(function() {
    console.log('🔧 Applying direct status fix...');
    
    // Store the original insert function
    const originalInsert = supabaseAPI.insert;
    
    // Override the insert function to fix status
    supabaseAPI.insert = async function(table, data) {
        if (table === 'parcels') {
            console.log('📦 Intercepting parcel insert...');
            console.log('Original status:', data.status);
            
            // Force the status to 'submitted'
            data.status = 'submitted';
            
            console.log('✅ Fixed status to:', data.status);
            console.log('Full parcel data:', JSON.stringify(data, null, 2));
        }
        
        // Call the original insert with fixed data
        return originalInsert.call(this, table, data);
    };
    
    console.log('✅ Direct status fix applied!');
})();

// Also add a console helper to manually create a booking
window.testBooking = async function() {
    console.log('🧪 Testing booking creation...');
    
    // Get current form data
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
        status: 'submitted', // Using correct status
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
