// auth-check.js (NEW VERSION)
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Check auth on page load
document.addEventListener('DOMContentLoaded', async () => {
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '');
    
    // Check stored session
    const storedPhone = localStorage.getItem('2ma_user_phone');
    const storedType = localStorage.getItem('2ma_user_type');
    
    // Vendors can proceed without auth
    if (currentPage === 'vendor' && !storedPhone) {
        showGuestVendorUI();
        return;
    }
    
    // Others need auth
    if (!storedPhone && currentPage !== 'vendor') {
        window.location.href = `./auth.html?type=${currentPage}`;
        return;
    }
    
    // Set current user
    if (storedPhone) {
        window.currentUser = {
            phone: storedPhone,
            type: storedType
        };
        
        // Add sign out button
        addSignOutButton();
    }
});

function showGuestVendorUI() {
    // Optional: Show "Sign in for better experience" banner
    console.log('Guest vendor mode');
}

function addSignOutButton() {
    const existing = document.getElementById('signOutBtn');
    if (existing) return;
    
    const btn = document.createElement('button');
    btn.id = 'signOutBtn';
    btn.textContent = 'Sign Out';
    btn.style.cssText = 'position:fixed;top:20px;right:20px;z-index:1000;background:#FF3B30;color:white;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:600;';
    btn.onclick = signOut;
    document.body.appendChild(btn);
}

function signOut() {
    localStorage.removeItem('2ma_user_phone');
    localStorage.removeItem('2ma_user_type');
    localStorage.removeItem('2ma_user_name');
    window.location.href = './auth.html';
}

// Global auth utilities
window.auth = {
    getUser() {
        return window.currentUser;
    },
    
    getUserPhone() {
        return localStorage.getItem('2ma_user_phone');
    },
    
    getUserType() {
        return localStorage.getItem('2ma_user_type');
    },
    
    getUserName() {
        return localStorage.getItem('2ma_user_name');
    },
    
    isAuthenticated() {
        return !!localStorage.getItem('2ma_user_phone');
    }
};
