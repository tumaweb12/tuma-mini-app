/**
 * Business Logic Module
 * Handles pricing, validation, code generation, and business rules
 */

import { BUSINESS_CONFIG, VALIDATION_PATTERNS } from './config.js';

/**
 * Pricing calculations
 */
export const pricing = {
  // Calculate delivery price
  calculate(distance, serviceType, options = {}) {
    const config = BUSINESS_CONFIG.pricing[serviceType];
    if (!config) {
      throw new Error(`Invalid service type: ${serviceType}`);
    }

    let basePrice = config.base + (distance * config.perKm);
    basePrice = basePrice * config.multiplier;

    // Apply bulk discount if applicable
    if (options.isBulk && options.quantity > 5) {
      basePrice = basePrice * 0.9; // 10% bulk discount
    }

    // Apply managed vendor discount
    if (options.isManaged) {
      basePrice = basePrice * 0.95; // 5% managed vendor discount
    }

    return Math.round(basePrice);
  },

  // Calculate commission
  calculateCommission(amount, type) {
    const rate = BUSINESS_CONFIG.commissionRates[type];
    if (!rate) {
      throw new Error(`Invalid commission type: ${type}`);
    }
    return Math.round(amount * rate);
  },

  // Format price for display
  formatPrice(amount) {
    return `KES ${amount.toLocaleString()}`;
  }
};

/**
 * Code generation
 */
export const codes = {
  // Generate parcel code
  generateParcelCode() {
    const prefix = 'PRC';
    const numbers = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const suffix = Math.random().toString(36).substring(2, 4).toUpperCase();
    return `${prefix}-${numbers}${letter}${suffix}`;
  },

  // Generate pickup code
  generatePickupCode() {
    const prefix = 'VPK';
    const numbers = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const suffix = Math.random().toString(36).substring(2, 4).toUpperCase();
    return `${prefix}-${numbers}${letter}${suffix}`;
  },

  // Generate delivery code
  generateDeliveryCode() {
    const prefix = 'DLV';
    const numbers = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const suffix = Math.random().toString(36).substring(2, 4).toUpperCase();
    return `${prefix}-${numbers}${letter}${suffix}`;
  },

  // Generate agent code
  generateAgentCode() {
    const prefix = 'AGT';
    const numbers = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${numbers}`;
  },

  // Generate route code
  generateRouteCode(area, type) {
    const areaCode = area.substring(0, 3).toUpperCase();
    const typeCode = type.charAt(0).toUpperCase();
    const numbers = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${areaCode}-${typeCode}${numbers}`;
  },

  // Validate code format
  validateCode(code, type = 'parcel') {
    return VALIDATION_PATTERNS.parcelCode.test(code);
  }
};

/**
 * Validation utilities
 */
export const validation = {
  // Validate phone number
  validatePhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    return VALIDATION_PATTERNS.phoneNumber.test(cleaned);
  },

  // Format phone number
  formatPhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 9 && !cleaned.startsWith('0')) {
      return '0' + cleaned;
    }
    return cleaned.substring(0, 10);
  },

  // Validate required fields
  validateRequired(fields) {
    const errors = {};
    
    Object.entries(fields).forEach(([key, value]) => {
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        errors[key] = `${key} is required`;
      }
    });
    
    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  },

  // Validate coordinates
  validateCoordinates(lat, lng) {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  },

  // Validate delivery capacity
  validateCapacity(items, size) {
    const sizeConfig = BUSINESS_CONFIG.packageSizes[size];
    if (!sizeConfig) return false;
    
    const totalUnits = items * sizeConfig.units;
    return {
      isValid: totalUnits <= BUSINESS_CONFIG.vehicleCapacity.motorcycle,
      totalUnits,
      vehiclesNeeded: Math.ceil(totalUnits / BUSINESS_CONFIG.vehicleCapacity.motorcycle)
    };
  }
};

/**
 * Form state management
 */
export class FormState {
  constructor(initialState = {}) {
    this.state = {
      itemCount: 1,
      selectedSize: 'small',
      selectedService: 'smart',
      pickupCoords: null,
      deliveryCoords: null,
      distance: 0,
      vendorType: 'casual',
      agentCode: null,
      agentName: null,
      isLoading: false,
      deliveryType: 'single',
      bulkDeliveries: [],
      ...initialState
    };
    
    this.listeners = new Map();
  }

  // Get state value
  get(key) {
    return key ? this.state[key] : this.state;
  }

  // Set state value
  set(key, value) {
    if (typeof key === 'object') {
      Object.assign(this.state, key);
      this.notify(Object.keys(key));
    } else {
      this.state[key] = value;
      this.notify([key]);
    }
  }

  // Subscribe to state changes
  subscribe(keys, callback) {
    if (!Array.isArray(keys)) keys = [keys];
    
    keys.forEach(key => {
      if (!this.listeners.has(key)) {
        this.listeners.set(key, new Set());
      }
      this.listeners.get(key).add(callback);
    });
    
    // Return unsubscribe function
    return () => {
      keys.forEach(key => {
        this.listeners.get(key)?.delete(callback);
      });
    };
  }

  // Notify listeners
  notify(keys) {
    keys.forEach(key => {
      this.listeners.get(key)?.forEach(callback => {
        callback(this.state[key], key, this.state);
      });
    });
  }

  // Reset state
  reset() {
    this.state = {
      itemCount: 1,
      selectedSize: 'small',
      selectedService: 'smart',
      pickupCoords: null,
      deliveryCoords: null,
      distance: 0,
      vendorType: 'casual',
      agentCode: null,
      agentName: null,
      isLoading: false,
      deliveryType: 'single',
      bulkDeliveries: []
    };
    this.notify(Object.keys(this.state));
  }
}

/**
 * Date/Time utilities
 */
export const dateTime = {
  // Get current timestamp
  now() {
    return new Date().toISOString();
  },

  // Format date for display
  formatDate(date, format = 'short') {
    const d = new Date(date);
    
    if (format === 'short') {
      return d.toLocaleDateString('en-KE');
    } else if (format === 'long') {
      return d.toLocaleDateString('en-KE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } else if (format === 'time') {
      return d.toLocaleTimeString('en-KE', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    
    return d.toLocaleString('en-KE');
  },

  // Get date range
  getDateRange(range) {
    const now = new Date();
    const ranges = {
      today: {
        start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        end: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      },
      week: {
        start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        end: now
      },
      month: {
        start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        end: now
      }
    };
    
    return ranges[range] || { start: new Date(0), end: now };
  },

  // Calculate ETA
  calculateETA(serviceType, distance) {
    const window = BUSINESS_CONFIG.serviceWindows[serviceType];
    const baseTime = distance * 3; // 3 minutes per km average
    
    return {
      min: window.min + baseTime,
      max: window.max + baseTime
    };
  }
};

/**
 * Notification utilities
 */
export const notifications = {
  // Show success message
  success(message, options = {}) {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      window.Telegram.WebApp.showPopup({
        title: options.title || 'Success',
        message: message,
        buttons: [{ id: 'ok', text: 'OK', type: 'ok' }]
      });
    } else {
      alert(message);
    }
  },

  // Show error message
  error(message, options = {}) {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
      window.Telegram.WebApp.showPopup({
        title: options.title || 'Error',
        message: message,
        buttons: [{ id: 'ok', text: 'OK', type: 'cancel' }]
      });
    } else {
      alert(`Error: ${message}`);
    }
  },

  // Show warning
  warning(message, options = {}) {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.HapticFeedback.notificationOccurred('warning');
      window.Telegram.WebApp.showPopup({
        title: options.title || 'Warning',
        message: message,
        buttons: [{ id: 'ok', text: 'OK', type: 'default' }]
      });
    } else {
      alert(`Warning: ${message}`);
    }
  }
};

/**
 * Haptic feedback
 */
export function haptic(type = 'light') {
  if (window.Telegram?.WebApp) {
    const hapticType = {
      light: 'light',
      medium: 'medium',
      heavy: 'heavy',
      success: 'success',
      warning: 'warning',
      error: 'error'
    };
    
    if (hapticType[type]) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred(hapticType[type]);
    }
  } else if ('vibrate' in navigator) {
    const patterns = {
      light: 10,
      medium: 20,
      heavy: 30,
      success: [10, 50, 10],
      warning: [20, 100, 20],
      error: [30, 200, 30, 200, 30]
    };
    
    navigator.vibrate(patterns[type] || 10);
  }
}

/**
 * Share functionality
 */
export async function shareDeliveryDetails(details) {
  const message = `🏍️ Tuma Delivery Update\n\n` +
                 `Hi ${details.recipientName},\n` +
                 `Your package is on the way!\n\n` +
                 `📦 Tracking: ${details.parcelCode}\n` +
                 `🔐 Delivery Code: ${details.deliveryCode}\n\n` +
                 `Show the delivery code to confirm receipt.\n` +
                 `Track: t.me/TumaNowBot`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Tuma Delivery Details',
        text: message
      });
    } catch (err) {
      // User cancelled or error
      await navigator.clipboard.writeText(message);
      notifications.success('Delivery details copied to clipboard!');
    }
  } else if (window.Telegram?.WebApp) {
    await navigator.clipboard.writeText(message);
    notifications.success('Delivery details copied. You can now share them.');
  } else {
    await navigator.clipboard.writeText(message);
    alert('Delivery details copied to clipboard!');
  }
}

/**
 * Local storage utilities
 */
export const storage = {
  // Save to local storage
  save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Storage save error:', error);
      return false;
    }
  },

  // Load from local storage
  load(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Storage load error:', error);
      return null;
    }
  },

  // Remove from local storage
  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Storage remove error:', error);
      return false;
    }
  },

  // Clear all app data
  clearAll() {
    try {
      const keys = Object.keys(localStorage).filter(key => key.startsWith('tuma_'));
      keys.forEach(key => localStorage.removeItem(key));
      return true;
    } catch (error) {
      console.error('Storage clear error:', error);
      return false;
    }
  }
};
