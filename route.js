// Add this updated section to rider.js to fix the API errors for temporary riders

// Updated supabaseAPI object with better error handling for temporary riders
const supabaseAPI = {
    async query(table, options = {}) {
        const { select = '*', filter = '', order = '', limit } = options;
        
        // Don't make API calls for temporary riders
        if (filter && filter.includes('temp-')) {
            console.log('Skipping API call for temporary rider');
            return [];
        }
        
        let url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}`;
        if (filter) url += `&${filter}`;
        if (order) url += `&order=${order}`;
        if (limit) url += `&limit=${limit}`;
        
        const response = await fetch(url, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            // Log error but don't throw for development
            if (DEV_CONFIG.isDevelopment && DEV_CONFIG.ignoreRiderNotFound) {
                console.log(`API Error (ignored in dev): ${response.status}`);
                return [];
            }
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    },
    
    async insert(table, data) {
        // Skip for temporary riders
        if (data.rider_id && data.rider_id.includes('temp-')) {
            console.log('Skipping insert for temporary rider');
            return [data];
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
    
    async update(table, filter, data) {
        // Skip for temporary riders
        if (filter && filter.includes('temp-')) {
            console.log('Skipping update for temporary rider');
            return [data];
        }
        
        const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
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

// Updated CommissionTracker class to handle temporary riders
class CommissionTracker {
    constructor(config) {
        this.config = config;
        this.state = {
            unpaidCommission: 0,
            totalPaid: 0,
            pendingDeliveries: [],
            isBlocked: false,
            lastPayment: null
        };
    }

    async initialize(riderId, api) {
        try {
            // Skip database initialization for temporary riders
            if (riderId.startsWith('temp-')) {
                console.log('Using default commission values for temporary rider');
                return;
            }
            
            const riders = await api.query('riders', {
                filter: `id=eq.${riderId}`,
                limit: 1
            });
            
            if (riders.length > 0) {
                const rider = riders[0];
                this.state.unpaidCommission = rider.unpaid_commission || 0;
                this.state.totalPaid = rider.total_commission_paid || 0;
                this.state.isBlocked = rider.is_commission_blocked || false;
                this.state.lastPayment = rider.last_commission_payment;
            }
        } catch (error) {
            if (error.message.includes('400') && DEV_CONFIG.ignoreRiderNotFound) {
                console.log('Commission tracker API error (expected in dev mode)');
            } else {
                console.error('Error initializing commission tracker:', error);
            }
        }
    }
    
    // ... rest of the class methods remain the same
}

// Updated loadEarnings function to handle temporary riders
async function loadEarnings() {
    try {
        if (!state.rider) return;
        
        // Use default values for temporary riders
        if (state.rider.id.startsWith('temp-')) {
            console.log('Using default earnings for temporary rider');
            state.earnings = {
                daily: 0,
                weekly: 0,
                monthly: 0
            };
            updateEarningsDisplay();
            return;
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        
        const dailyParcels = await supabaseAPI.query('parcels', {
            filter: `rider_id=eq.${state.rider.id}&status=eq.delivered&delivery_timestamp=gte.${today.toISOString()}`,
            select: 'rider_payout'
        });
        
        const weeklyParcels = await supabaseAPI.query('parcels', {
            filter: `rider_id=eq.${state.rider.id}&status=eq.delivered&delivery_timestamp=gte.${weekStart.toISOString()}`,
            select: 'rider_payout'
        });
        
        const monthlyParcels = await supabaseAPI.query('parcels', {
            filter: `rider_id=eq.${state.rider.id}&status=eq.delivered&delivery_timestamp=gte.${monthStart.toISOString()}`,
            select: 'rider_payout'
        });
        
        state.earnings = {
            daily: dailyParcels.reduce((sum, p) => sum + (p.rider_payout || 0), 0),
            weekly: weeklyParcels.reduce((sum, p) => sum + (p.rider_payout || 0), 0),
            monthly: monthlyParcels.reduce((sum, p) => sum + (p.rider_payout || 0), 0)
        };
        
        updateEarningsDisplay();
        
    } catch (error) {
        if (error.message.includes('400') && DEV_CONFIG.ignoreRiderNotFound) {
            console.log('Earnings API error (expected in dev mode)');
            // Use default values
            state.earnings = {
                daily: 0,
                weekly: 0,
                monthly: 0
            };
            updateEarningsDisplay();
        } else {
            console.error('Error loading earnings:', error);
        }
    }
}

// Updated createTemporaryRider function
async function createTemporaryRider() {
    // Use the test rider configuration if in development
    const tempId = DEV_CONFIG.isDevelopment && DEV_CONFIG.testRider ? 
        DEV_CONFIG.testRider.id : 
        'temp-' + Date.now();
    
    state.rider = {
        id: tempId,
        rider_name: DEV_CONFIG.isDevelopment && DEV_CONFIG.testRider ? 
            DEV_CONFIG.testRider.name : 
            'Test Rider',
        phone: DEV_CONFIG.isDevelopment && DEV_CONFIG.testRider ? 
            DEV_CONFIG.testRider.phone : 
            '0700000000',
        status: 'active',
        total_deliveries: 0,
        completed_deliveries: 0,
        total_distance: 0,
        rating: 5.0,
        unpaid_commission: 0,
        verification_status: 'verified'
    };
    
    console.log('Created temporary rider:', state.rider.id);
}

// Updated initialization in DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ rider.js loaded successfully with clustering integration!');
    
    // Initialize Telegram WebApp
    const tg = window.Telegram?.WebApp;
    const telegramUser = tg?.initDataUnsafe?.user;
    
    // Determine rider ID based on environment
    let riderId;
    let riderName;
    
    if (telegramUser?.id) {
        // Running in Telegram - use real user
        riderId = telegramUser.id;
        riderName = telegramUser.first_name || 'Rider';
        if (DEV_CONFIG.verboseLogging) {
            console.log('Using Telegram user:', riderId);
        }
    } else if (DEV_CONFIG.isDevelopment && DEV_CONFIG.testRider) {
        // Development mode - use test rider
        riderId = DEV_CONFIG.testRider.id;
        riderName = DEV_CONFIG.testRider.name;
        if (DEV_CONFIG.verboseLogging) {
            console.log('Development mode: Using test rider', riderId);
        }
    } else {
        // Fallback - generate temporary ID
        riderId = `temp-${Date.now()}`;
        riderName = 'Guest Rider';
        if (DEV_CONFIG.verboseLogging) {
            console.log('Generated temporary rider:', riderId);
        }
    }
    
    // Store the rider ID for use in other functions
    window.currentRiderId = riderId;
    
    // Continue with initialization...
    await initialize();
});
