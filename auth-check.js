/**
 * auth-check.js
 * Include this file in vendor.html, agent.html, and rider.html
 * Add: <script src="./auth-check.js"></script> before your main JS file
 */

// Run auth check when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Get current page
    const currentPage = window.location.pathname.split('/').pop();
    
    // Define which pages need auth
    const authRequirements = {
        'vendor.html': { required: false, type: 'vendor' },  // Optional auth
        'agent.html': { required: true, type: 'agent' },     // Required auth
        'rider.html': { required: true, type: 'rider' },     // Required auth
        'track.html': { required: false, type: null }        // No auth
    };
    
    const pageAuth = authRequirements[currentPage];
    if (!pageAuth) return; // Unknown page, skip
    
    // Check if auth is required
    if (pageAuth.required) {
        checkRequiredAuth(pageAuth.type);
    } else if (pageAuth.type === 'vendor') {
        checkOptionalVendorAuth();
    }
});

/**
 * Check required authentication (agents and riders)
 */
function checkRequiredAuth(userType) {
    const session = localStorage.getItem(`tuma_${userType}_session`);
    
    if (!session) {
        // No session - redirect to auth
        redirectToAuth(userType);
        return;
    }
    
    try {
        const sessionData = JSON.parse(session);
        
        // Check if session is valid (30 days)
        const age = Date.now() - sessionData.timestamp;
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        
        if (age > maxAge) {
            // Session expired
            localStorage.removeItem(`tuma_${userType}_session`);
            redirectToAuth(userType);
            return;
        }
        
        // Session valid - set global user data
        window.currentUser = sessionData;
        
        // Add sign out button
        addSignOutButton(userType);
        
    } catch (error) {
        // Invalid session data
        localStorage.removeItem(`tuma_${userType}_session`);
        redirectToAuth(userType);
    }
}

/**
 * Check optional vendor authentication
 */
function checkOptionalVendorAuth() {
    const session = localStorage.getItem('tuma_vendor_session');
    
    if (session) {
        try {
            const sessionData = JSON.parse(session);
            
            // Check if valid
            const age = Date.now() - sessionData.timestamp;
            const maxAge = 30 * 24 * 60 * 60 * 1000;
            
            if (age <= maxAge) {
                // Valid session - pre-fill form
                window.currentUser = sessionData;
                prefillVendorForm(sessionData);
                showAuthenticatedUI();
            } else {
                // Expired
                localStorage.removeItem('tuma_vendor_session');
            }
        } catch (error) {
            localStorage.removeItem('tuma_vendor_session');
        }
    } else {
        // Not authenticated - show sign in prompt
        showSignInPrompt();
    }
}

/**
 * Redirect to auth page
 */
function redirectToAuth(userType) {
    const currentUrl = encodeURIComponent(window.location.href);
    window.location.replace(`./auth.html?type=${userType}&return=${currentUrl}`);
}

/**
 * Add sign out button to page
 */
function addSignOutButton(userType) {
    const signOutHTML = `
        <div class="auth-header-controls" style="
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
        ">
            <button onclick="signOut('${userType}')" style="
                background: #FF3B30;
                color: white;
                border: none;
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
    
    document.body.insertAdjacentHTML('afterbegin', signOutHTML);
}

/**
 * Sign out function
 */
window.signOut = function(userType) {
    // Clear session
    localStorage.removeItem(`tuma_${userType}_session`);
    localStorage.removeItem(`tuma_${userType}_phone`);
    
    // Redirect to auth
    window.location.href = './auth.html';
};

/**
 * Vendor-specific functions
 */
function prefillVendorForm(sessionData) {
    // Wait for form to load
    setTimeout(() => {
        const phoneInput = document.getElementById('vendorPhone');
        const nameInput = document.getElementById('vendorName');
        
        if (phoneInput && sessionData.phone) {
            phoneInput.value = sessionData.phone.replace('+254', '0');
        }
        
        if (nameInput && sessionData.name) {
            nameInput.value = sessionData.name;
        }
    }, 100);
}

function showAuthenticatedUI() {
    // Add welcome message
    const welcomeHTML = `
        <div class="authenticated-banner" style="
            background: rgba(0, 102, 255, 0.1);
            border: 1px solid #0066FF;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        ">
            <span>👋 Welcome back, ${window.currentUser.name || 'Vendor'}!</span>
            <button onclick="signOut('vendor')" style="
                background: transparent;
                color: #0066FF;
                border: 1px solid #0066FF;
                padding: 4px 12px;
                border-radius: 6px;
                font-size: 12px;
                cursor: pointer;
            ">
                Sign Out
            </button>
        </div>
    `;
    
    const formHeader = document.querySelector('.form-header');
    if (formHeader) {
        formHeader.insertAdjacentHTML('afterend', welcomeHTML);
    }
}

function showSignInPrompt() {
    const promptHTML = `
        <div class="sign-in-prompt" style="
            background: rgba(0, 102, 255, 0.05);
            border: 1px solid rgba(0, 102, 255, 0.2);
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 16px;
            text-align: center;
        ">
            <p style="margin-bottom: 12px;">📱 Sign in to save your addresses and track orders</p>
            <a href="./auth.html?type=vendor" style="
                display: inline-block;
                background: #0066FF;
                color: white;
                padding: 8px 24px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
            ">
                Sign In / Sign Up
            </a>
        </div>
    `;
    
    const formHeader = document.querySelector('.form-header');
    if (formHeader) {
        formHeader.insertAdjacentHTML('afterend', promptHTML);
    }
}

/**
 * Utility functions available globally
 */
window.authUtils = {
    // Get current user
    getCurrentUser() {
        return window.currentUser || null;
    },
    
    // Check if authenticated
    isAuthenticated(userType) {
        const session = localStorage.getItem(`tuma_${userType}_session`);
        if (!session) return false;
        
        try {
            const data = JSON.parse(session);
            return Date.now() - data.timestamp < 30 * 24 * 60 * 60 * 1000;
        } catch {
            return false;
        }
    },
    
    // Get user phone
    getUserPhone() {
        return window.currentUser?.phone || null;
    },
    
    // Get user name
    getUserName() {
        return window.currentUser?.name || null;
    }
};
