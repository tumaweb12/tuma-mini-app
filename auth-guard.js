/**
 * Authentication Guard
 * Include this script in all pages that require authentication
 * Usage: <script type="module" src="./auth-guard.js"></script>
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { API_CONFIG } from './config.js';

// Initialize Supabase client
const supabase = createClient(API_CONFIG.supabase.url, API_CONFIG.supabase.anonKey);

// Authentication state
let currentUser = null;
let isAuthenticated = false;

/**
 * Check if user is authenticated
 */
function checkAuthentication() {
    const storedUser = localStorage.getItem('tuma_user');
    
    if (!storedUser) {
        redirectToLogin();
        return false;
    }
    
    try {
        const user = JSON.parse(storedUser);
        currentUser = user;
        isAuthenticated = true;
        
        // Verify session is still valid
        verifySession(user);
        
        return true;
    } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('tuma_user');
        redirectToLogin();
        return false;
    }
}

/**
 * Verify session with Supabase
 */
async function verifySession(user) {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
            console.warn('Session verification failed:', error);
            signOut();
            return;
        }
        
        // Update user data if needed
        if (session.user.id !== user.id) {
            localStorage.setItem('tuma_user', JSON.stringify({
                id: session.user.id,
                email: session.user.email,
                role: user.role
            }));
            currentUser = JSON.parse(localStorage.getItem('tuma_user'));
        }
        
    } catch (error) {
        console.error('Session verification error:', error);
        signOut();
    }
}

/**
 * Redirect to login page
 */
function redirectToLogin() {
    const currentPage = window.location.pathname.split('/').pop();
    window.location.href = `./index.html?redirect=${encodeURIComponent(currentPage)}`;
}

/**
 * Sign out user
 */
async function signOut() {
    try {
        await supabase.auth.signOut();
    } catch (error) {
        console.error('Sign out error:', error);
    }
    
    localStorage.removeItem('tuma_user');
    currentUser = null;
    isAuthenticated = false;
    
    redirectToLogin();
}

/**
 * Get current user
 */
function getCurrentUser() {
    return currentUser;
}

/**
 * Check if user has specific role
 */
function hasRole(role) {
    return currentUser && currentUser.role === role;
}

/**
 * Require specific role
 */
function requireRole(requiredRole) {
    if (!isAuthenticated) {
        redirectToLogin();
        return false;
    }
    
    if (currentUser.role !== requiredRole) {
        // Redirect to appropriate page based on user's actual role
        const rolePages = {
            'agent': 'agent.html',
            'rider': 'rider.html',
            'vendor': 'vendor.html',
            'customer': 'agent.html'
        };
        
        const targetPage = rolePages[currentUser.role] || 'agent.html';
        window.location.href = targetPage;
        return false;
    }
    
    return true;
}

/**
 * Show authentication status in UI
 */
function showAuthStatus() {
    if (!isAuthenticated || !currentUser) return;
    
    // Create auth status bar
    const authBar = document.createElement('div');
    authBar.id = 'auth-status-bar';
    authBar.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
        padding: 8px 16px;
        font-size: 12px;
        z-index: 1000;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;
    
    authBar.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 20px; height: 20px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px;">
                ${currentUser.role.charAt(0).toUpperCase()}
            </div>
            <span>Logged in as ${currentUser.email}</span>
        </div>
        <button onclick="signOut()" style="
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 10px;
            cursor: pointer;
        ">Sign Out</button>
    `;
    
    document.body.insertBefore(authBar, document.body.firstChild);
    
    // Adjust body padding to account for auth bar
    document.body.style.paddingTop = '32px';
}

/**
 * Initialize authentication guard
 */
function initAuthGuard() {
    // Check authentication on page load
    if (!checkAuthentication()) {
        return;
    }
    
    // Show auth status
    showAuthStatus();
    
    // Listen for auth state changes
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
            signOut();
        }
    });
    
    // Make functions globally available
    window.signOut = signOut;
    window.getCurrentUser = getCurrentUser;
    window.hasRole = hasRole;
    window.requireRole = requireRole;
}

// Auto-initialize when script loads
document.addEventListener('DOMContentLoaded', initAuthGuard);

// Export functions for module usage
export {
    checkAuthentication,
    getCurrentUser,
    hasRole,
    requireRole,
    signOut,
    isAuthenticated
};
