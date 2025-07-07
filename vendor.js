/**
 * Vendor Page Entry Script
 * Handles vendor dashboard functionality
 */

import { BUSINESS_CONFIG, FEATURES } from './config.js';
import { parcelsDB, vendorsDB } from './supabaseClient.js';
import { 
  geocodeAddress, 
  getCurrentLocation, 
  reverseGeocode,
  calculateStraightDistance,
  initializeMap,
  addMarker
} from './mapUtils.js';
import { 
  pricing, 
  codes, 
  validation, 
  FormState, 
  notifications, 
  haptic,
  shareDeliveryDetails
} from './businessLogic.js';

// Initialize form state
const formState = new FormState();

// DOM elements
const elements = {
  // Form fields
  vendorName: document.getElementById('vendorName'),
  phoneNumber: document.getElementById('phoneNumber'),
  pickupLocation: document.getElementById('pickupLocation'),
  deliveryLocation: document.getElementById('deliveryLocation'),
  recipientName: document.getElementById('recipientName'),
  recipientPhone: document.getElementById('recipientPhone'),
  packageDescription: document.getElementById('packageDescription'),
  specialInstructions: document.getElementById('specialInstructions'),
  
  // Buttons
  submitBtn: document.getElementById('submitBtn'),
  buttonText: document.getElementById('buttonText'),
  
  // Display elements
  itemCount: document.getElementById('itemCount'),
  capacityText: document.getElementById('capacityText'),
  capacityFill: document.getElementById('capacityFill'),
  capacityIcon: document.getElementById('capacityIcon'),
  calculatedDistance: document.getElementById('calculatedDistance'),
  distanceInfo: document.getElementById('distanceInfo'),
  vendorBadge: document.getElementById('vendorBadge'),
  vendorBadgeContent: document.getElementById('vendorBadgeContent'),
  
  // Service prices
  expressPrice: document.getElementById('expressPrice'),
  smartPrice: document.getElementById('smartPrice'),
  ecoPrice: document.getElementById('ecoPrice'),
  servicePriceHint: document.getElementById('servicePriceHint'),
  
  // Success modal
  successOverlay: document.getElementById('successOverlay'),
  displayParcelCode: document.getElementById('displayParcelCode'),
  displayPickupCode: document.getElementById('displayPickupCode'),
  displayDeliveryCode: document.getElementById('displayDeliveryCode'),
  
  // Bulk delivery
  bulkDeliveries: document.getElementById('bulkDeliveries'),
  bulkPickupLocation: document.getElementById('bulkPickupLocation')
};

// Initialize page
async function initialize() {
  setupEventListeners();
  setupStateSubscriptions();
  initializeTelegramWebApp();
  updateCapacityDisplay();
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
  
  // Add touch feedback to interactive elements
  document.querySelectorAll('button, .location-btn, .size-option, .service-card').forEach(el => {
    el.addEventListener('touchstart', () => haptic('light'));
  });
}

// Setup state subscriptions
function setupStateSubscriptions() {
  // Update button state when locations change
  formState.subscribe(['pickupCoords', 'deliveryCoords'], () => {
    checkFormValidity();
  });
  
  // Update capacity when items or size change
  formState.subscribe(['itemCount', 'selectedSize'], () => {
    updateCapacityDisplay();
  });
  
  // Update pricing when distance changes
  formState.subscribe('distance', (distance) => {
    if (distance > 0) {
      updatePricing();
    }
  });
}

// Initialize Telegram Web App
function initializeTelegramWebApp() {
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    
    // Get user data
    const user = tg.initDataUnsafe.user;
    if (user && elements.vendorName) {
      elements.vendorName.value = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    }
    
    // Handle back button
    tg.BackButton.onClick(() => {
      if (elements.successOverlay.style.display === 'flex') {
        elements.successOverlay.style.display = 'none';
      } else {
        tg.close();
      }
    });
  }
}

// Handle phone input
async function handlePhoneInput(e) {
  let value = validation.formatPhone(e.target.value);
  e.target.value = value;
  
  // Check vendor type when phone is complete
  if (value.length === 10) {
    try {
      const result = await vendorsDB.checkManaged(value);
      
      formState.set({
        vendorType: result.isManaged ? 'managed' : 'casual',
        agentCode: result.agentCode,
        agentName: result.agentName
      });
      
      displayVendorBadge(result);
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
    notifications.error('Could not find the address. Please try again.');
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
    isManaged: formState.get('vendorType') === 'managed',
    isBulk: formState.get('deliveryType') === 'bulk'
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
    notifications.error('Please fill in all required fields');
    return;
  }
  
  // Validate phone numbers
  if (!validation.validatePhone(elements.phoneNumber.value)) {
    notifications.error('Please enter a valid vendor phone number');
    return;
  }
  
  if (!validation.validatePhone(elements.recipientPhone.value)) {
    notifications.error('Please enter a valid recipient phone number');
    return;
  }
  
  // Show loading state
  formState.set('isLoading', true);
  elements.submitBtn.classList.add('loading');
  elements.buttonText.textContent = 'Processing...';
  haptic('medium');
  
  try {
    // Generate codes
    const deliveryCodes = {
      parcelCode: codes.generateParcelCode(),
      pickupCode: codes.generatePickupCode(),
      deliveryCode: codes.generateDeliveryCode()
    };
    
    // Calculate final price
    const finalPrice = pricing.calculate(
      formState.get('distance'),
      formState.get('selectedService'),
      {
        isManaged: formState.get('vendorType') === 'managed',
        isBulk: false
      }
    );
    
    // Prepare parcel data
    const parcelData = {
      ...deliveryCodes,
      vendor_name: elements.vendorName.value,
      vendor_phone: elements.phoneNumber.value,
      vendor_type: formState.get('vendorType'),
      agent_code: formState.get('agentCode'),
      pickup_location: elements.pickupLocation.value,
      delivery_location: elements.deliveryLocation.value,
      pickup_lat: formState.get('pickupCoords').lat,
      pickup_lng: formState.get('pickupCoords').lng,
      delivery_lat: formState.get('deliveryCoords').lat,
      delivery_lng: formState.get('deliveryCoords').lng,
      distance: formState.get('distance'),
      service_type: formState.get('selectedService'),
      price: finalPrice,
      item_count: formState.get('itemCount'),
      package_size: formState.get('selectedSize'),
      package_description: elements.packageDescription.value,
      recipient_name: elements.recipientName.value,
      recipient_phone: elements.recipientPhone.value,
      special_instructions: elements.specialInstructions.value
    };
    
    // Create booking in database
    const result = await parcelsDB.create(parcelData);
    
    // Show success
    showSuccess(deliveryCodes, finalPrice);
    updateProgress(4);
    
  } catch (error) {
    console.error('Booking error:', error);
    notifications.error('Failed to create booking. Please try again.');
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
  haptic('success');
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
window.toggleDeliveryType = function(type) {
  formState.set('deliveryType', type);
  
  document.getElementById('singleBtn').classList.toggle('active', type === 'single');
  document.getElementById('bulkBtn').classList.toggle('active', type === 'bulk');
  
  document.getElementById('singleDeliverySection').style.display = type === 'single' ? 'block' : 'none';
  document.getElementById('singleDeliveryLocation').style.display = type === 'single' ? 'block' : 'none';
  document.getElementById('bulkDeliverySection').style.display = type === 'bulk' ? 'block' : 'none';
  
  if (type === 'bulk' && formState.get('bulkDeliveries').length === 0) {
    addBulkDelivery();
  }
  
  haptic('light');
};

window.updateItemCount = function(change) {
  const currentCount = formState.get('itemCount');
  const newCount = currentCount + change;
  
  if (newCount >= 1 && newCount <= 20) {
    formState.set('itemCount', newCount);
    elements.itemCount.textContent = newCount;
    
    document.getElementById('decreaseBtn').disabled = newCount === 1;
    document.getElementById('increaseBtn').disabled = newCount === 20;
    
    haptic('light');
  }
};

window.selectSize = function(size) {
  document.querySelectorAll('.size-option').forEach(el => el.classList.remove('selected'));
  const selected = document.querySelector(`[data-size="${size}"]`);
  if (selected) {
    selected.classList.add('selected');
    formState.set('selectedSize', size);
    haptic('light');
  }
};

window.selectService = function(service) {
  document.querySelectorAll('.service-card').forEach(el => el.classList.remove('selected'));
  const selected = document.querySelector(`[data-service="${service}"]`);
  if (selected) {
    selected.classList.add('selected');
    formState.set('selectedService', service);
    updateProgress(3);
    haptic('light');
  }
};

window.getLocation = async function(type) {
  haptic('medium');
  try {
    const location = await getCurrentLocation();
    const address = await reverseGeocode(location.lat, location.lng);
    
    const input = type === 'pickup' ? elements.pickupLocation : elements.deliveryLocation;
    input.value = address.address;
    
    formState.set(`${type}Coords`, location);
    
    if (formState.get('pickupCoords') && formState.get('deliveryCoords')) {
      await calculateDistance();
    }
  } catch (error) {
    notifications.error('Could not get your location. Please enable GPS or type the address.');
  }
};

window.shareDeliveryDetails = async function() {
  await shareDeliveryDetails({
    recipientName: elements.recipientName.value,
    parcelCode: elements.displayParcelCode.textContent,
    deliveryCode: elements.displayDeliveryCode.textContent
  });
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
};

// Bulk delivery functions
window.addBulkDelivery = function() {
  const id = Date.now();
  const bulkDeliveries = formState.get('bulkDeliveries');
  
  bulkDeliveries.push({
    id,
    location: '',
    coords: null,
    recipientName: '',
    recipientPhone: '',
    items: 1,
    size: 'small'
  });
  
  formState.set('bulkDeliveries', bulkDeliveries);
  
  const bulkHtml = `
    <div class="bulk-delivery-item" data-id="${id}" style="background: var(--surface-elevated); border-radius: 14px; padding: 16px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h4 style="font-size: 16px; font-weight: 600;">Delivery ${bulkDeliveries.length}</h4>
        <button type="button" onclick="removeBulkDelivery(${id})" style="width: 24px; height: 24px; border-radius: 50%; background: var(--danger); border: none; color: white; cursor: pointer;">×</button>
      </div>
      <div class="input-container" style="margin-bottom: 12px;">
        <input type="text" class="input-field" placeholder="Delivery address" onchange="updateBulkDelivery(${id}, 'location', this.value)" required>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
        <input type="text" class="input-field" placeholder="Recipient name" onchange="updateBulkDelivery(${id}, 'recipientName', this.value)" style="padding: 12px;" required>
        <input type="tel" class="input-field" placeholder="Phone" onchange="updateBulkDelivery(${id}, 'recipientPhone', this.value)" pattern="0[0-9]{9}" style="padding: 12px;" required>
      </div>
      <div style="display: flex; gap: 8px;">
        <select class="input-field" onchange="updateBulkDelivery(${id}, 'items', this.value)" style="flex: 1; padding: 12px;">
          <option value="1">1 item</option>
          <option value="2">2 items</option>
          <option value="3">3 items</option>
          <option value="4">4 items</option>
          <option value="5">5 items</option>
        </select>
        <select class="input-field" onchange="updateBulkDelivery(${id}, 'size', this.value)" style="flex: 1; padding: 12px;">
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </div>
    </div>
  `;
  
  elements.bulkDeliveries.insertAdjacentHTML('beforeend', bulkHtml);
};

window.updateBulkDelivery = function(id, field, value) {
  const bulkDeliveries = formState.get('bulkDeliveries');
  const delivery = bulkDeliveries.find(d => d.id === id);
  
  if (delivery) {
    delivery[field] = field === 'items' ? parseInt(value) : value;
    formState.set('bulkDeliveries', bulkDeliveries);
  }
};

window.removeBulkDelivery = function(id) {
  const bulkDeliveries = formState.get('bulkDeliveries').filter(d => d.id !== id);
  formState.set('bulkDeliveries', bulkDeliveries);
  
  document.querySelector(`[data-id="${id}"]`).remove();
  
  // Update numbering
  document.querySelectorAll('.bulk-delivery-item h4').forEach((h4, index) => {
    h4.textContent = `Delivery ${index + 1}`;
  });
};

// Initialize on load
window.addEventListener('DOMContentLoaded', initialize);
