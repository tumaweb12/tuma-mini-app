/**
 * auth-check.js
 * Include this file in vendor.html to enable optional authentication
 * Add: <script src="./auth-check.js"></script> after vendor.js
 */

// Initialize Supabase client for auth checks
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

// Only initialize if not already done by vendor.js
if (typeof window.supabaseClient === 'undefined') {
    const { createClient } = supabase;
    window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Run auth check when page loads
document.addEventListener('DOMContentLoaded', function() {
    checkOptionalVendorAuth();
});

/**
 * Check optional vendor authentication
 */
async function checkOptionalVendorAuth() {
    const session = localStorage.getItem('tuma_vendor_session');
    
    if (session) {
        try {
            const sessionData = JSON.parse(session);
            
            // Verify session is still valid
            const { data } = await window.supabaseClient
                .from('vendor_sessions')
                .select('*, vendors(*)')
                .eq('session_token', sessionData.token)
                .gt('expires_at', new Date().toISOString())
                .single();
            
            if (data && data.vendors) {
                // Valid session - set global user data
                window.currentVendor = {
                    id: data.vendors.id,
                    name: data.vendors.vendor_name,
                    phone: data.vendors.phone,
                    email: data.vendors.email,
                    type: data.vendors.vendor_type,
                    isAuthenticated: true
                };
                
                // Pre-fill form fields
                prefillVendorForm(window.currentVendor);
                
                // Show authenticated UI
                showAuthenticatedUI();
                
                // Update last activity
                await window.supabaseClient
                    .from('vendor_sessions')
                    .update({ last_activity: new Date().toISOString() })
                    .eq('id', data.id);
            } else {
                // Invalid session - clear it
                localStorage.removeItem('tuma_vendor_session');
                showSignInPrompt();
            }
        } catch (error) {
            console.error('Session check error:', error);
            localStorage.removeItem('tuma_vendor_session');
            showSignInPrompt();
        }
    } else {
        // Not authenticated - show sign in prompt
        showSignInPrompt();
    }
}

/**
 * Pre-fill vendor form with authenticated user data
 */
function prefillVendorForm(vendor) {
    // Wait for form elements to be ready
    setTimeout(() => {
        const nameInput = document.getElementById('vendorName');
        const phoneInput = document.getElementById('phoneNumber');
        
        if (nameInput && vendor.name) {
            nameInput.value = vendor.name;
            nameInput.readOnly = true;
            nameInput.style.background = 'rgba(0, 102, 255, 0.05)';
        }
        
        if (phoneInput && vendor.phone) {
            phoneInput.value = vendor.phone;
            phoneInput.readOnly = true;
            phoneInput.style.background = 'rgba(0, 102, 255, 0.05)';
        }
        
        // Hide the "Your Information" section header since it's pre-filled
        const infoSection = nameInput?.closest('.form-section');
        if (infoSection) {
            const sectionTitle = infoSection.querySelector('.section-title');
            if (sectionTitle) {
                sectionTitle.innerHTML = 'Your Information <span style="color: var(--success); font-size: 12px;">(Logged in as ' + vendor.name + ')</span>';
            }
        }
    }, 100);
}

/**
 * Show authenticated UI elements
 */
function showAuthenticatedUI() {
    // Add authenticated banner
    const banner = document.createElement('div');
    banner.id = 'authBanner';
    banner.style.cssText = `
        background: linear-gradient(135deg, rgba(0, 102, 255, 0.1), rgba(52, 199, 89, 0.1));
        border: 1px solid var(--primary);
        padding: 12px 20px;
        margin: 0 20px 20px;
        border-radius: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        animation: slideDown 0.3s ease;
    `;
    
    banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 36px; height: 36px; background: var(--primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
                ${window.currentVendor.name.charAt(0).toUpperCase()}
            </div>
            <div>
                <div style="font-weight: 600;">Welcome back, ${window.currentVendor.name}!</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                    Track all your deliveries in one place
                </div>
            </div>
        </div>
        <div style="display: flex; gap: 8px;">
            <button onclick="window.location.href='vendor-dashboard.html'" style="
                background: var(--primary);
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            ">
                Dashboard
            </button>
            <button onclick="signOut()" style="
                background: transparent;
                color: var(--danger);
                border: 1px solid var(--danger);
                padding: 8px 16px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            ">
                Sign Out
            </button>
        </div>
    `;
    
    // Insert after header
    const formContainer = document.querySelector('.form-container');
    if (formContainer && !document.getElementById('authBanner')) {
        formContainer.insertBefore(banner, formContainer.firstChild);
    }
    
    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from { transform: translateY(-20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}

/**
 * Show sign-in prompt for non-authenticated users
 */
function showSignInPrompt() {
    // Add sign-in prompt
    const prompt = document.createElement('div');
    prompt.id = 'signInPrompt';
    prompt.style.cssText = `
        background: linear-gradient(135deg, rgba(255, 159, 10, 0.05), rgba(255, 59, 48, 0.05));
        border: 1px solid rgba(255, 159, 10, 0.3);
        padding: 16px 20px;
        margin: 0 20px 20px;
        border-radius: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        animation: slideDown 0.3s ease;
    `;
    
    prompt.innerHTML = `
        <div>
            <div style="font-weight: 600; margin-bottom: 4px; color: var(--warning);">
                ⚠️ Account Required
            </div>
            <div style="font-size: 14px; color: var(--text-secondary);">
                Please sign in or create an account to book deliveries
            </div>
        </div>
        <a href="./auth.html?type=vendor" style="
            background: var(--primary);
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            white-space: nowrap;
            display: inline-block;
        ">
            Sign In / Sign Up
        </a>
    `;
    
    // Insert after header
    const formContainer = document.querySelector('.form-container');
    if (formContainer && !document.getElementById('signInPrompt')) {
        formContainer.insertBefore(prompt, formContainer.firstChild);
    }
    
    // Disable form submission
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sign in to continue';
        submitBtn.style.opacity = '0.6';
        submitBtn.onclick = function(e) {
            e.preventDefault();
            window.location.href = './auth.html?type=vendor';
        };
    }
}

/**
 * Sign out function
 */
async function signOut() {
    const session = localStorage.getItem('tuma_vendor_session');
    
    if (session) {
        try {
            const sessionData = JSON.parse(session);
            
            // Delete session from database
            await window.supabaseClient
                .from('vendor_sessions')
                .delete()
                .eq('session_token', sessionData.token);
        } catch (error) {
            console.error('Sign out error:', error);
        }
    }
    
    // Clear local storage
    localStorage.removeItem('tuma_vendor_session');
    
    // Reload page
    window.location.reload();
}

/**
 * Load saved recipients for authenticated vendors
 */
async function loadSavedRecipients() {
    if (!window.currentVendor || !window.currentVendor.isAuthenticated) return;
    
    try {
        const { data } = await window.supabaseClient
            .from('saved_recipients')
            .select('*')
            .eq('vendor_id', window.currentVendor.id)
            .order('last_used', { ascending: false })
            .limit(5);
        
        if (data && data.length > 0) {
            window.savedRecipients = data;
            displaySavedRecipients(data);
        }
    } catch (error) {
        console.error('Error loading saved recipients:', error);
    }
}

/**
 * Display saved recipients dropdown
 */
function displaySavedRecipients(recipients) {
    const recipientNameInput = document.getElementById('recipientName');
    if (!recipientNameInput) return;
    
    // Create datalist for autocomplete
    const datalistId = 'savedRecipientsList';
    let datalist = document.getElementById(datalistId);
    
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = datalistId;
        document.body.appendChild(datalist);
        recipientNameInput.setAttribute('list', datalistId);
    }
    
    // Populate datalist
    datalist.innerHTML = recipients.map(r => 
        `<option value="${r.recipient_name}" data-phone="${r.recipient_phone}" data-address="${r.delivery_address || ''}">`
    ).join('');
    
    // Handle selection
    recipientNameInput.addEventListener('input', function(e) {
        const selectedRecipient = recipients.find(r => r.recipient_name === e.target.value);
        if (selectedRecipient) {
            const phoneInput = document.getElementById('recipientPhone');
            const deliveryInput = document.getElementById('deliveryLocation');
            
            if (phoneInput) phoneInput.value = selectedRecipient.recipient_phone;
            if (deliveryInput && selectedRecipient.delivery_address) {
                deliveryInput.value = selectedRecipient.delivery_address;
                if (selectedRecipient.delivery_lat && selectedRecipient.delivery_lng) {
                    deliveryInput.dataset.lat = selectedRecipient.delivery_lat;
                    deliveryInput.dataset.lng = selectedRecipient.delivery_lng;
                }
            }
            
            // Show notification
            if (typeof showNotification === 'function') {
                showNotification('Recipient details loaded!', 'success');
            }
        }
    });
}

/**
 * Load saved pickup locations for authenticated vendors
 */
async function loadSavedPickupLocations() {
    if (!window.currentVendor || !window.currentVendor.isAuthenticated) return;
    
    try {
        const { data } = await window.supabaseClient
            .from('saved_pickup_locations')
            .select('*')
            .eq('vendor_id', window.currentVendor.id)
            .order('use_count', { ascending: false })
            .limit(3);
        
        if (data && data.length > 0) {
            window.savedPickupLocations = data;
            displaySavedPickupLocations(data);
        }
    } catch (error) {
        console.error('Error loading saved pickup locations:', error);
    }
}

/**
 * Display saved pickup locations
 */
function displaySavedPickupLocations(locations) {
    const pickupSection = document.getElementById('pickupLocation')?.closest('.form-section');
    if (!pickupSection) return;
    
    // Remove existing saved locations if any
    const existing = document.getElementById('savedPickupLocations');
    if (existing) existing.remove();
    
    // Create saved locations UI
    const container = document.createElement('div');
    container.id = 'savedPickupLocations';
    container.style.cssText = 'margin-top: 12px;';
    
    container.innerHTML = `
        <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
            Quick select saved locations:
        </p>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${locations.map((loc, index) => `
                <button type="button" 
                        class="saved-location-btn" 
                        onclick="useSavedPickupLocation(${index})"
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
                    ${loc.location_name || loc.address.split(',')[0]}
                    ${loc.is_default ? '<span style="color: var(--success);">⭐</span>' : ''}
                </button>
            `).join('')}
        </div>
    `;
    
    // Add after location options
    const locationOptions = pickupSection.querySelector('.location-options');
    if (locationOptions) {
        locationOptions.insertAdjacentElement('afterend', container);
    }
}

/**
 * Use saved pickup location
 */
window.useSavedPickupLocation = function(index) {
    const location = window.savedPickupLocations?.[index];
    if (!location) return;
    
    const pickupInput = document.getElementById('pickupLocation');
    if (pickupInput) {
        pickupInput.value = location.address;
        pickupInput.dataset.lat = location.lat;
        pickupInput.dataset.lng = location.lng;
        
        // Trigger change event
        pickupInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Show notification
        if (typeof showNotification === 'function') {
            showNotification('Pickup location set!', 'success');
        }
    }
};

/**
 * Initialize authenticated features when DOM is ready
 */
document.addEventListener('DOMContentLoaded', function() {
    if (window.currentVendor && window.currentVendor.isAuthenticated) {
        // Load saved data
        loadSavedRecipients();
        loadSavedPickupLocations();
    }
});

/**
 * Export auth check function for vendor.js to use
 */
window.checkOptionalVendorAuth = checkOptionalVendorAuth;

/**
 * Utility functions available globally
 */
window.authUtils = {
    // Get current vendor
    getCurrentVendor() {
        return window.currentVendor || null;
    },
    
    // Check if authenticated
    isAuthenticated() {
        return window.currentVendor?.isAuthenticated || false;
    },
    
    // Get vendor ID
    getVendorId() {
        return window.currentVendor?.id || null;
    },
    
    // Get vendor name
    getVendorName() {
        return window.currentVendor?.name || null;
    },
    
    // Get vendor phone
    getVendorPhone() {
        return window.currentVendor?.phone || null;
    }
};
