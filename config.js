/**
 * Configuration Module
 * Centralizes all API keys, URLs, and configuration
 * In production, these values come from environment variables
 */

/**
 * Configuration Module
 * Centralizes all API keys, URLs, and configuration
 * In production, these values come from environment variables
 */

// API Configuration
export const API_CONFIG = {
  // Supabase Configuration - UPDATE THESE WITH YOUR REAL VALUES!
  supabase: {
    url: 'https://btxavqfoirdzwpfrvezp.supabase.co', // From your screenshot
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk', // Get this from Supabase Settings > API
  },
  
  // Map Services (these are free and don't need API keys)
  maps: {
    // Using OSRM for routing (no API key needed)
    osrmUrl: 'https://router.project-osrm.org/route/v1',
    // Nominatim for geocoding (no API key needed)
    nominatimUrl: 'https://nominatim.openstreetmap.org',
    // Map tile server
    tileServerUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors'
  },
  
  // Telegram Configuration (optional for now)
  telegram: {
    botToken: '', // Leave empty for now
    webAppUrl: '' // Leave empty for now
  }
};

// Business Configuration
export const BUSINESS_CONFIG = {
  // Pricing tiers (in KES)
  pricing: {
    express: { base: 100, perKm: 18, multiplier: 1.4 },
    smart: { base: 85, perKm: 15, multiplier: 1.2 },
    eco: { base: 60, perKm: 12, multiplier: 1.05 }
  },
  
  // Package sizes and capacity
  packageSizes: {
    small: { units: 0.5, label: 'Small', desc: 'Documents, phone' },
    medium: { units: 2, label: 'Medium', desc: 'Shoebox size' },
    large: { units: 4, label: 'Large', desc: 'Backpack size' },
    bulky: { units: 8, label: 'Bulky', desc: 'Large boxes' }
  },
  
  // Vehicle capacity
  vehicleCapacity: {
    motorcycle: 10, // capacity units
    maxParcelsPerRoute: 20
  },
  
  // Commission rates
  commissionRates: {
    agent: 0.20, // 20% for agents on managed vendors
    rider: 0.70  // 70% of delivery fee goes to rider
  },
  
  // Service time windows (in minutes)
  serviceWindows: {
    express: { min: 0, max: 30 },
    smart: { min: 30, max: 60 },
    eco: { min: 60, max: 120 }
  }
};

// Common Nairobi locations for optimization
export const COMMON_LOCATIONS = {
  'cbd': { lat: -1.2921, lng: 36.8219, name: 'CBD' },
  'westlands': { lat: -1.2635, lng: 36.8104, name: 'Westlands' },
  'karen': { lat: -1.3204, lng: 36.6877, name: 'Karen' },
  'kilimani': { lat: -1.2906, lng: 36.7870, name: 'Kilimani' },
  'lavington': { lat: -1.2797, lng: 36.7757, name: 'Lavington' },
  'parklands': { lat: -1.2624, lng: 36.8129, name: 'Parklands' },
  'eastleigh': { lat: -1.2741, lng: 36.8486, name: 'Eastleigh' },
  'south b': { lat: -1.3098, lng: 36.8332, name: 'South B' },
  'south c': { lat: -1.3151, lng: 36.8282, name: 'South C' },
  'langata': { lat: -1.3667, lng: 36.7333, name: 'Langata' },
  'embakasi': { lat: -1.3242, lng: 36.8941, name: 'Embakasi' },
  'kasarani': { lat: -1.2219, lng: 36.8989, name: 'Kasarani' },
  'ruaka': { lat: -1.2014, lng: 36.7800, name: 'Ruaka' },
  'kileleshwa': { lat: -1.2879, lng: 36.7814, name: 'Kileleshwa' },
  'upperhill': { lat: -1.2997, lng: 36.8147, name: 'Upper Hill' }
};

// Default map center (Nairobi)
export const DEFAULT_MAP_CENTER = {
  lat: -1.2921,
  lng: 36.8219,
  zoom: 13
};

// Validation patterns
export const VALIDATION_PATTERNS = {
  phoneNumber: /^0[0-9]{9}$/,
  parcelCode: /^[A-Z]{3}-[0-9]{2}[A-Z][0-9A-Z]{2}$/
};

// Feature flags
export const FEATURES = {
  enableBulkDeliveries: true,
  enableRouteOptimization: true,
  enableOfflineMode: true,
  enableLiveTracking: true,
  maxBulkDeliveries: 10
};
