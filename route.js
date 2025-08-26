/**
 * Enhanced Route Navigation Module - Part 1/6
 * Setup, Configuration, Core API Functions, and Enhanced Verification Features
 * Version: 5.0.0 - Includes Photo Capture, Digital Signatures, M-Pesa Integration
 */

// Fix: Make route optimizer optional - fallback to inline optimization if module not found
let routeOptimizer;

// Try to use the comprehensive optimizer if available
if (typeof RouteOptimizer !== 'undefined') {
    // If loaded as global
    routeOptimizer = new RouteOptimizer();
} else {
    // Fallback to simple optimizer
    class FallbackRouteOptimizer {
        // ... keep your existing fallback code ...
    }
    routeOptimizer = new FallbackRouteOptimizer({
        // ... existing config ...
    });
}

// Fallback route optimizer if external module not available
class FallbackRouteOptimizer {
    constructor(config) {
        this.config = config;
    }
    
    optimizeRoute(stops) {
        if (!stops || stops.length === 0) return stops;
        
        // Simple nearest neighbor optimization
        const optimized = [];
        const remaining = [...stops];
        let current = remaining.shift(); // Start with first stop
        optimized.push(current);
        
        while (remaining.length > 0) {
            let nearest = null;
            let nearestDistance = Infinity;
            let nearestIndex = -1;
            
            remaining.forEach((stop, index) => {
                const dist = this.calculateDistance(current.location, stop.location);
                if (dist < nearestDistance) {
                    nearestDistance = dist;
                    nearest = stop;
                    nearestIndex = index;
                }
            });
            
            if (nearest) {
                optimized.push(nearest);
                current = nearest;
                remaining.splice(nearestIndex, 1);
            }
        }
        
        return optimized;
    }
    
    calculateDistance(point1, point2) {
        const R = 6371;
        const dLat = (point2.lat - point1.lat) * Math.PI / 180;
        const dLon = (point2.lng - point1.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    getStatistics() {
        return {
            originalDistance: 0,
            optimizedDistance: 0,
            savedDistance: 0,
            savedPercentage: 0,
            executionTime: 0
        };
    }
    
    getConfig() {
        return this.config;
    }
    
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
}

// Initialize route optimizer with fallback
if (!routeOptimizer) {
    routeOptimizer = new FallbackRouteOptimizer({
        immediateDeliveryRadius: 1.5,
        clusterRadius: 2.0,
        zoneRadius: 3.0,
        distanceWeight: 1.0,
        backtrackPenalty: 5.0,
        directionChangesPenalty: 2.0,
        clusterBonus: 0.7,
        enableZoning: true,
        enableSmartPairing: true,
        maxLookahead: 3,
        maxIterations: 1000,
        convergenceThreshold: 0.01
    });
}

// Development Configuration
const DEV_CONFIG = {
    isDevelopment: window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1' ||
                   window.location.hostname.includes('github.io'),
    testRider: {
        id: 'ef5438ef-0cc0-4e35-8d1b-be18dbce7fe4',
        name: 'Bobby G',
        phone: '0725046880'
    },
    verboseLogging: true,
    ignoreRiderNotFound: true,
    skipPhotoCapture: false, // Set to true to skip photo requirements in dev
    skipSignature: false     // Set to true to skip signature requirements in dev
};

// Enhanced State Management with new verification features
const state = {
    activeRoute: null,
    currentLocation: null,
    map: null,
    markers: [],
    routePolyline: null,
    directionsPolyline: null,
    isTracking: false,
    currentStopIndex: 0,
    parcelsInPossession: [],
    trackingInterval: null,
    proximityNotified: false,
    routeControl: null,
    currentLocationMarker: null,
    lastLocation: null,
    lastLocationTime: null,
    lastLocationErrorTime: null,
    lastOptimizationCheck: null,
    pickupPhaseCompleted: false,
    isPanelVisible: true,
    isPanelExpanded: false,
    navigationActive: false,
    currentSpeed: 0,
    currentHeading: 0,
    isFollowingUser: true,
    lastMapRotation: 0,
    smoothLocationInterval: null,
    mapBearing: 0,
    locationWatchId: null,
    accuracyCircle: null,
    radiusCircle: null,
    totalRouteEarnings: 0,
    routeCommission: 0,
    totalCashToCollect: 0,
    totalCashCollected: 0,
    paymentsByStop: {},
    routeOptimizationMode: 'dynamic',
    originalRouteOrder: null,
    optimizationStats: {
        originalDistance: 0,
        optimizedDistance: 0,
        savedDistance: 0,
        savedPercentage: 0
    },
    stopOrderMap: {},
    showNumberedMarkers: true,
    
    // New: Enhanced verification data storage
    verificationData: {
        photos: {},        // stopId -> {pickup: imageData, delivery: imageData}
        signatures: {},    // stopId -> signatureData
        timestamps: {},    // stopId -> {pickup: timestamp, delivery: timestamp}
        locations: {},     // stopId -> {pickup: location, delivery: location}
        mpesaCodes: {}     // stopId -> mpesaTransactionCode
    },
    
    // New: Current verification session
    currentVerification: {
        stopId: null,
        type: null,       // 'pickup' or 'delivery'
        photoData: null,
        signatureData: null,
        locationData: null,
        startTime: null
    }
};

// Configuration
const config = {
    headingUp: false,
    smoothMovement: true,
    autoZoom: true,
    mapRotatable: true,
    optimization: {
        enableDynamicRouting: true,
        autoReoptimize: false,
        reoptimizeThreshold: 2.0
    },
    verification: {
        requirePhoto: true,
        requireSignature: true,
        requireLocation: true,
        photoQuality: 0.8,
        maxPhotoSize: 2048,
        signatureMinPoints: 20,
        mpesaPromptDelay: 500
    }
};

// API Configuration
const OPENROUTE_API_KEY = '5b3ce3597851110001cf624841e48578ffb34c6b96dfe3bbe9b3ad4c';
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

// Business configuration
const BUSINESS_CONFIG = {
    commission: {
        rider: 0.70,
        platform: 0.30,
        maxUnpaid: 300,
        warningThreshold: 250
    }
};

// ============================================================================
// ENHANCED SUPABASE API FUNCTIONS
// ============================================================================

async function supabaseQuery(table, options = {}) {
    const { select = '*', filter = '', order = '', limit } = options;
    
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
        const errorText = await response.text();
        console.error(`API Error: ${response.status} ${errorText}`);
        throw new Error(`API Error: ${response.status}`);
    }
    
    return await response.json();
}

async function supabaseUpdate(table, filter, data) {
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
        const errorText = await response.text();
        console.error(`Update Error: ${response.status} ${errorText}`);
        throw new Error(`Update Error: ${response.status}`);
    }
    
    return await response.json();
}

async function supabaseInsert(table, data) {
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
        const errorText = await response.text();
        console.error(`Insert Error: ${response.status} ${errorText}`);
        throw new Error(`Insert Error: ${response.status}`);
    }
    
    return await response.json();
}

// New: Store verification data in Supabase
async function storeVerificationData(stopId, verificationType, data) {
    try {
        const stop = state.activeRoute.stops.find(s => s.id === stopId);
        if (!stop) return;
        
        const verificationRecord = {
            parcel_id: stop.parcelId,
            stop_id: stopId,
            verification_type: verificationType, // 'pickup' or 'delivery'
            verification_code: data.code,
            photo_url: data.photoUrl || null,
            signature_data: data.signatureData || null,
            location_lat: data.location?.lat || null,  // Separate latitude column
            location_lng: data.location?.lng || null,  // Separate longitude column
            location_accuracy: data.location?.accuracy || null,
            mpesa_code: data.mpesaCode || null,
            timestamp: new Date().toISOString(),
            rider_id: DEV_CONFIG.testRider.id
        };
        
        await supabaseInsert('delivery_verifications', verificationRecord);
        console.log('Verification data stored successfully');
        
        // Update parcel status
        if (verificationType === 'delivery') {
            await supabaseUpdate('parcels', 
                `id=eq.${stop.parcelId}`,
                {
                    status: 'delivered',
                    delivery_timestamp: new Date().toISOString(),
                    delivery_verified: true,
                    has_signature: data.signatureData ? true : false,
                    has_photo: data.photoUrl ? true : false,
                    payment_status: data.mpesaCode ? 'paid' : (data.cashCollected ? 'collected' : 'pending')
                }
            );
        } else if (verificationType === 'pickup') {
            await supabaseUpdate('parcels',
                `id=eq.${stop.parcelId}`,
                {
                    status: 'in_transit',
                    pickup_timestamp: new Date().toISOString(),
                    pickup_verified: true,
                    has_pickup_photo: data.photoUrl ? true : false
                }
            );
        }
    } catch (error) {
        console.error('Error storing verification data:', error);
        // Continue even if storage fails - don't block delivery
    }
}

// ============================================================================
// PHOTO CAPTURE FUNCTIONS WITH DIRECT SUPABASE UPLOAD
// ============================================================================

// Initialize Supabase client for storage
const supabase = {
    storage: {
        from: (bucket) => ({
            upload: async (path, file, options) => {
                const formData = new FormData();
                formData.append('file', file);
                
                const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'x-upsert': options.upsert ? 'true' : 'false'
                    },
                    body: formData
                });
                
                if (!response.ok) {
                    const error = await response.text();
                    return { data: null, error };
                }
                
                return { data: await response.json(), error: null };
            },
            getPublicUrl: (path) => ({
                data: {
                    publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
                }
            })
        })
    }
};

function initializeCamera() {
    return new Promise((resolve, reject) => {
        const constraints = {
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        };
        
        navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
                resolve(stream);
            })
            .catch(err => {
                console.error('Camera initialization failed:', err);
                // Fallback to any available camera
                navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                    .then(stream => resolve(stream))
                    .catch(err => reject(err));
            });
    });
}

async function captureAndUploadPhoto(videoElement, stopId, verificationType) {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0);
    
    // Resize if needed
    if (canvas.width > config.verification.maxPhotoSize) {
        const scale = config.verification.maxPhotoSize / canvas.width;
        const newCanvas = document.createElement('canvas');
        newCanvas.width = config.verification.maxPhotoSize;
        newCanvas.height = canvas.height * scale;
        
        const newCtx = newCanvas.getContext('2d');
        newCtx.drawImage(canvas, 0, 0, newCanvas.width, newCanvas.height);
        canvas = newCanvas;
    }
    
    // Convert canvas to blob and upload directly to Supabase
    return new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
            try {
                const fileName = `${stopId}_${verificationType}_${Date.now()}.jpg`;
                const filePath = `delivery-photos/${new Date().toISOString().split('T')[0]}/${fileName}`;
                
                // Upload to Supabase Storage
                const { data, error } = await supabase.storage
                    .from('delivery-verifications')
                    .upload(filePath, blob, {
                        contentType: 'image/jpeg',
                        upsert: false
                    });
                
                if (error) {
                    console.error('Upload failed, using base64 fallback:', error);
                    // Fallback to base64 for offline capability
                    resolve(canvas.toDataURL('image/jpeg', config.verification.photoQuality));
                } else {
                    // Return public URL
                    const { data: { publicUrl } } = supabase.storage
                        .from('delivery-verifications')
                        .getPublicUrl(filePath);
                    
                    console.log('Photo uploaded successfully:', publicUrl);
                    resolve(publicUrl);
                }
            } catch (err) {
                console.error('Photo upload error:', err);
                // Fallback to base64
                resolve(canvas.toDataURL('image/jpeg', config.verification.photoQuality));
            }
        }, 'image/jpeg', config.verification.photoQuality);
    });
}

// Backward compatible function for simple capture
function capturePhoto(videoElement) {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0);
    
    // Resize if needed
    if (canvas.width > config.verification.maxPhotoSize) {
        const scale = config.verification.maxPhotoSize / canvas.width;
        const newCanvas = document.createElement('canvas');
        newCanvas.width = config.verification.maxPhotoSize;
        newCanvas.height = canvas.height * scale;
        
        const newCtx = newCanvas.getContext('2d');
        newCtx.drawImage(canvas, 0, 0, newCanvas.width, newCanvas.height);
        
        return newCanvas.toDataURL('image/jpeg', config.verification.photoQuality);
    }
    
    return canvas.toDataURL('image/jpeg', config.verification.photoQuality);
}

// ============================================================================
// DIGITAL SIGNATURE FUNCTIONS WITH DIRECT SUPABASE UPLOAD
// ============================================================================

async function uploadSignatureToSupabase(signatureData, stopId) {
    try {
        // Convert base64 to blob
        const base64Response = await fetch(signatureData);
        const blob = await base64Response.blob();
        
        const fileName = `${stopId}_signature_${Date.now()}.png`;
        const filePath = `delivery-signatures/${new Date().toISOString().split('T')[0]}/${fileName}`;
        
        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from('delivery-verifications')
            .upload(filePath, blob, {
                contentType: 'image/png',
                upsert: false
            });
        
        if (error) {
            console.error('Signature upload failed:', error);
            return signatureData; // Fallback to base64
        }
        
        // Return public URL
        const { data: { publicUrl } } = supabase.storage
            .from('delivery-verifications')
            .getPublicUrl(filePath);
        
        console.log('Signature uploaded successfully:', publicUrl);
        return publicUrl;
    } catch (error) {
        console.error('Signature upload error:', error);
        return signatureData; // Fallback to base64
    }
}

function initializeSignaturePad(canvas) {
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let points = [];
    
    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    // Style setup
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const startDrawing = (e) => {
        isDrawing = true;
        const point = getPoint(e, canvas);
        points.push(point);
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
    };
    
    const draw = (e) => {
        if (!isDrawing) return;
        
        const point = getPoint(e, canvas);
        points.push(point);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
    };
    
    const stopDrawing = () => {
        isDrawing = false;
    };
    
    const getPoint = (e, canvas) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;
        return { x, y };
    };
    
    // Mouse events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    // Touch events
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startDrawing(e);
    });
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        draw(e);
    });
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopDrawing();
    });
    
    return {
        clear: () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            points = [];
        },
        getSignatureData: async () => {
            if (points.length < config.verification.signatureMinPoints) {
                return null;
            }
            // Return the raw canvas data for upload
            return canvas.toDataURL('image/png');
        },
        getPointCount: () => points.length
    };
}

// ============================================================================
// M-PESA INTEGRATION FUNCTIONS
// ============================================================================

function promptMpesaPayment(amount, phoneNumber) {
    return new Promise((resolve, reject) => {
        // Create M-Pesa prompt UI
        const mpesaModal = document.createElement('div');
        mpesaModal.className = 'mpesa-prompt-modal';
        mpesaModal.innerHTML = `
            <div class="mpesa-content">
                <h3>M-Pesa Payment</h3>
                <p>Request sent to ${phoneNumber}</p>
                <p class="amount">KES ${amount.toLocaleString()}</p>
                <div class="mpesa-instructions">
                    <ol>
                        <li>Check your phone for M-Pesa prompt</li>
                        <li>Enter your M-Pesa PIN</li>
                        <li>Wait for confirmation</li>
                    </ol>
                </div>
                <div class="mpesa-input">
                    <label>Or enter M-Pesa code manually:</label>
                    <input type="text" id="mpesaCode" placeholder="e.g. QDA3R8K2XY" maxlength="10">
                </div>
                <div class="mpesa-actions">
                    <button onclick="confirmMpesaPayment()">Confirm Payment</button>
                    <button onclick="skipMpesaPayment()">Pay Cash Instead</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(mpesaModal);
        
        window.confirmMpesaPayment = () => {
            const code = document.getElementById('mpesaCode').value;
            if (code && code.length >= 6) {
                mpesaModal.remove();
                resolve({ success: true, code: code });
            } else {
                showNotification('Please enter a valid M-Pesa code', 'warning');
            }
        };
        
        window.skipMpesaPayment = () => {
            mpesaModal.remove();
            resolve({ success: false, method: 'cash' });
        };
        
        // Simulate M-Pesa timeout after 2 minutes
        setTimeout(() => {
            if (document.body.contains(mpesaModal)) {
                mpesaModal.remove();
                resolve({ success: false, timeout: true });
            }
        }, 120000);
    });
}
/**
 * Enhanced Route Navigation Module - Part 2/6
 * Route Optimization Functions and Utility Functions
 * Version: 5.0.0
 */

// ============================================================================
// ROUTE OPTIMIZATION FUNCTIONS (Fixed to work with or without external module)
// ============================================================================

/**
 * Main route optimization function - works with both external and fallback optimizer
 */
function optimizeRouteStops() {
    if (!state.activeRoute || !state.activeRoute.stops) {
        showNotification('No route to optimize', 'warning');
        return;
    }
    
    const hasCompletedStops = state.activeRoute.stops.some(s => s.completed);
    
    if (hasCompletedStops) {
        // Only optimize remaining stops
        reoptimizeRemainingStops();
        showNotification('Remaining stops optimized!', 'success');
    } else {
        // Full route optimization
        console.log('Starting full route optimization...');
        
        // Store original for undo - ONLY IF NOT ALREADY STORED
        if (!state.originalRouteOrder || state.originalRouteOrder.length === 0) {
            state.originalRouteOrder = JSON.parse(JSON.stringify(state.activeRoute.stops)); // Deep copy
            console.log('Stored original route for undo:', state.originalRouteOrder);
        }
        
        const originalDistance = calculateTotalRouteDistance(state.activeRoute.stops);
        
        showOptimizingAnimation();
        
        setTimeout(() => {
            try {
                // Use the route optimizer (either external or fallback)
                const optimizedStops = routeOptimizer.optimizeRoute(state.activeRoute.stops);
                
                // Calculate statistics
                const optimizedDistance = calculateTotalRouteDistance(optimizedStops);
                const savedDistance = originalDistance - optimizedDistance;
                const savedPercentage = Math.round((savedDistance / originalDistance) * 100);
                
                // Update state
                state.activeRoute.stops = optimizedStops;
                state.activeRoute.isOptimized = true;
                state.optimizationStats = {
                    originalDistance: originalDistance,
                    optimizedDistance: optimizedDistance,
                    savedDistance: savedDistance,
                    savedPercentage: savedPercentage
                };
                
                // Update UI
                updateStopOrderMap();
                localStorage.setItem('tuma_active_route', JSON.stringify({
                    ...state.activeRoute,
                    originalRouteOrder: state.originalRouteOrder // Save original in localStorage
                }));
                
                console.log('Optimization complete:');
                console.log(`Original distance: ${state.optimizationStats.originalDistance.toFixed(1)}km`);
                console.log(`Optimized distance: ${state.optimizationStats.optimizedDistance.toFixed(1)}km`);
                console.log(`Saved: ${state.optimizationStats.savedDistance.toFixed(1)}km (${state.optimizationStats.savedPercentage}%)`);
                
                console.log('\nOptimized route order:');
                optimizedStops.forEach((stop, index) => {
                    console.log(`${index + 1}. ${stop.type.toUpperCase()} - ${stop.address} (${stop.parcelCode})`);
                });
                
                displayRouteInfo();
                plotRoute();
                drawOptimizedRoute();
                
                hideOptimizingAnimation();
                
                if (state.optimizationStats.savedDistance > 0.1) {
                    showOptimizationResults(state.optimizationStats.savedDistance, state.optimizationStats.savedPercentage);
                } else {
                    showNotification('Route optimized for efficient delivery sequence', 'success');
                }
                
                updateOptimizeButton(true);
            } catch (error) {
                console.error('Optimization error:', error);
                hideOptimizingAnimation();
                showNotification('Optimization failed - using original route', 'error');
            }
        }, 1500);
    }
}

/**
 * Real-time route re-optimization for remaining stops
 */
function reoptimizeRemainingStops() {
    if (!state.activeRoute || !state.activeRoute.stops) return;
    
    // Get only uncompleted stops
    const remainingStops = state.activeRoute.stops.filter(s => !s.completed);
    
    if (remainingStops.length <= 1) return; // No need to optimize
    
    console.log('📍 Re-optimizing remaining stops...');
    
    try {
        // Re-optimize remaining stops
        const reoptimized = routeOptimizer.optimizeRoute(remainingStops);
        
        // Calculate savings
        const originalDistance = calculateTotalRouteDistance(remainingStops);
        const optimizedDistance = calculateTotalRouteDistance(reoptimized);
        const savedDistance = originalDistance - optimizedDistance;
        
        console.log(`Re-optimization saved: ${savedDistance.toFixed(1)}km`);
        
        // Update the route with completed + reoptimized stops
        const completedStops = state.activeRoute.stops.filter(s => s.completed);
        state.activeRoute.stops = [...completedStops, ...reoptimized];
        
        // Update UI
        updateStopOrderMap();
        displayRouteInfo();
        plotRoute();
        drawOptimizedRoute();
        
        console.log('Route re-optimized in real-time');
    } catch (error) {
        console.error('Re-optimization failed:', error);
    }
}

/**
 * Check if re-optimization would provide significant savings
 */
function checkForBetterRoute() {
    if (!state.navigationActive || !config.optimization.autoReoptimize) return;
    
    const remainingStops = state.activeRoute.stops.filter(s => !s.completed);
    if (remainingStops.length <= 2) return; // Too few stops to matter
    
    try {
        // Test if re-optimization would save significant distance
        const currentOrderDistance = calculateTotalRouteDistance(remainingStops);
        const testOptimized = routeOptimizer.optimizeRoute(remainingStops);
        const optimizedDistance = calculateTotalRouteDistance(testOptimized);
        const savings = currentOrderDistance - optimizedDistance;
        
        // If we can save more than threshold km, suggest re-optimization
        if (savings > config.optimization.reoptimizeThreshold) {
            showNotification(
                `Route optimization available - Save ${savings.toFixed(1)}km! Tap to optimize.`,
                'info'
            );
            
            // Show a button to re-optimize
            showReoptimizeButton();
        }
    } catch (error) {
        console.error('Route check failed:', error);
    }
}

/**
 * Undo the last optimization
 */
function undoOptimization() {
    console.log('Undo called. Original route:', state.originalRouteOrder);
    
    if (!state.originalRouteOrder || state.originalRouteOrder.length === 0) {
        showNotification('No original route to restore', 'warning');
        return;
    }
    
    // Deep copy to restore
    state.activeRoute.stops = JSON.parse(JSON.stringify(state.originalRouteOrder));
    state.activeRoute.isOptimized = false;
    
    // DON'T clear originalRouteOrder - keep it for multiple undos
    // state.originalRouteOrder = null; 
    
    updateStopOrderMap();
    localStorage.setItem('tuma_active_route', JSON.stringify({
        ...state.activeRoute,
        originalRouteOrder: state.originalRouteOrder // Keep original in localStorage
    }));
    
    displayRouteInfo();
    plotRoute();
    drawOptimizedRoute();
    
    updateOptimizeButton(false);
    showNotification('Route restored to original order', 'info');
    
    // Clear optimization stats
    state.optimizationStats = {
        originalDistance: 0,
        optimizedDistance: 0,
        savedDistance: 0,
        savedPercentage: 0
    };
}

/**
 * Update optimizer configuration
 */
window.updateOptimizerSetting = function(setting, value) {
    if (routeOptimizer && routeOptimizer.updateConfig) {
        routeOptimizer.updateConfig({ [setting]: parseFloat(value) });
        console.log(`Optimizer setting updated: ${setting} = ${value}`);
        
        // Optionally re-optimize current route with new settings
        if (state.activeRoute && !state.activeRoute.stops.some(s => s.completed)) {
            optimizeRouteStops();
        }
    }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function parsePrice(priceValue) {
    if (typeof priceValue === 'number') return priceValue;
    if (typeof priceValue === 'string') {
        const cleaned = priceValue.replace(/[^0-9.-]+/g, '');
        return parseFloat(cleaned) || 0;
    }
    return 0;
}

function getPaymentInfoForStop(stop) {
    if (!state.activeRoute) {
        return {
            amount: 0,
            method: 'unknown',
            status: 'unknown',
            needsCollection: false
        };
    }
    
    let parcel = null;
    if (state.activeRoute.parcels && state.activeRoute.parcels.length > 0) {
        parcel = state.activeRoute.parcels.find(p => 
            p.id === stop.parcelId || 
            p.parcel_code === stop.parcelCode ||
            p.code === stop.parcelCode
        );
    }
    
    if (!parcel && stop.paymentInfo) {
        return {
            amount: parsePrice(stop.paymentInfo.amount || 0),
            method: stop.paymentInfo.method || 'cash',
            status: stop.paymentInfo.status || 'pending',
            needsCollection: stop.type === 'delivery' && 
                           (stop.paymentInfo.method || 'cash') === 'cash' && 
                           (stop.paymentInfo.status || 'pending') === 'pending'
        };
    }
    
    if (!parcel) {
        return {
            amount: 0,
            method: 'unknown',
            status: 'unknown',
            needsCollection: false
        };
    }
    
    const amount = parsePrice(parcel.price || parcel.total_price || parcel.amount || 0);
    const method = parcel.payment_method || parcel.paymentMethod || 'cash';
    const status = parcel.payment_status || parcel.paymentStatus || 'pending';
    
    return {
        amount: amount,
        method: method,
        status: status,
        needsCollection: stop.type === 'delivery' && method === 'cash' && status === 'pending'
    };
}

function calculateCashCollection() {
    state.totalCashToCollect = 0;
    state.totalCashCollected = 0;
    
    if (!state.activeRoute || !state.activeRoute.stops) return;
    
    state.activeRoute.stops.forEach(stop => {
        if (stop.type === 'delivery') {
            const paymentInfo = getPaymentInfoForStop(stop);
            
            if (paymentInfo.needsCollection) {
                state.totalCashToCollect += paymentInfo.amount;
                
                if (stop.completed) {
                    state.totalCashCollected += paymentInfo.amount;
                    state.paymentsByStop[stop.id] = {
                        amount: paymentInfo.amount,
                        collected: true,
                        timestamp: stop.timestamp
                    };
                } else {
                    state.paymentsByStop[stop.id] = {
                        amount: paymentInfo.amount,
                        collected: false
                    };
                }
            }
        }
    });
    
    console.log('Cash collection calculated:', {
        total: state.totalCashToCollect,
        collected: state.totalCashCollected,
        pending: state.totalCashToCollect - state.totalCashCollected
    });
}

function calculateRouteFinancials() {
    if (!state.activeRoute) return;
    
    state.totalRouteEarnings = 0;
    state.routeCommission = 0;
    
    if (state.activeRoute.parcels && state.activeRoute.parcels.length > 0) {
        state.activeRoute.parcels.forEach(parcel => {
            const price = parsePrice(parcel.price || parcel.total_price || 500);
            const riderPayout = price * BUSINESS_CONFIG.commission.rider;
            const commission = price * BUSINESS_CONFIG.commission.platform;
            
            state.totalRouteEarnings += riderPayout;
            state.routeCommission += commission;
        });
    } else if (state.activeRoute.total_earnings) {
        const totalPrice = parsePrice(state.activeRoute.total_earnings);
        state.totalRouteEarnings = totalPrice * BUSINESS_CONFIG.commission.rider;
        state.routeCommission = totalPrice * BUSINESS_CONFIG.commission.platform;
    } else {
        const deliveryCount = state.activeRoute.stops?.filter(s => s.type === 'delivery').length || 0;
        state.totalRouteEarnings = deliveryCount * 350;
        state.routeCommission = deliveryCount * 150;
    }
    
    console.log('Route financials calculated:', {
        earnings: state.totalRouteEarnings,
        commission: state.routeCommission
    });
}

function updateStopOrderMap() {
    state.stopOrderMap = {};
    if (!state.activeRoute || !state.activeRoute.stops) return;
    
    state.activeRoute.stops.forEach((stop, index) => {
        state.stopOrderMap[stop.id] = index + 1;
    });
    
    console.log('Stop order map updated:', state.stopOrderMap);
}

function calculateTotalRouteDistance(stops) {
    if (!stops || stops.length === 0) return 0;
    
    let totalDistance = 0;
    let currentPos = state.currentLocation 
        ? { lat: state.currentLocation.lat, lng: state.currentLocation.lng }
        : stops[0].location;
    
    stops.forEach(stop => {
        totalDistance += calculateDistance(currentPos, stop.location);
        currentPos = stop.location;
    });
    
    return totalDistance;
}

function calculateDistance(point1, point2) {
    if (!point1 || !point2) return 0;
    
    const R = 6371; // Earth's radius in kilometers
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLon = (point2.lng - point1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function calculateBearing(start, end) {
    const dLng = (end.lng - start.lng) * Math.PI / 180;
    const lat1 = start.lat * Math.PI / 180;
    const lat2 = end.lat * Math.PI / 180;
    
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - 
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
}

async function syncRouteData() {
    if (!state.activeRoute) return;
    
    try {
        // Save verification data to local storage
        const routeData = {
            ...state.activeRoute,
            verificationData: state.verificationData
        };
        localStorage.setItem('tuma_active_route', JSON.stringify(routeData));
        
        if (state.activeRoute.stops && state.activeRoute.stops.every(s => s.completed)) {
            await handleRouteCompletion();
        }
    } catch (error) {
        console.error('Error syncing route data:', error);
    }
}

async function handleRouteCompletion() {
    console.log('Handling route completion...');
    
    const deliveryCount = state.activeRoute.stops.filter(s => s.type === 'delivery').length;
    
    const completionData = {
        completed: true,
        earnings: Math.round(state.totalRouteEarnings),
        commission: Math.round(state.routeCommission),
        cashCollected: Math.round(state.totalCashCollected),
        deliveries: deliveryCount,
        stops: state.activeRoute.stops.length,
        timestamp: new Date().toISOString(),
        routeId: state.activeRoute.id,
        parcels: state.activeRoute.parcels || [],
        optimizationMode: state.routeOptimizationMode,
        distanceSaved: state.optimizationStats.savedDistance,
        verificationData: state.verificationData // Include verification data
    };
    
    console.log('Storing completion data:', completionData);
    
    localStorage.setItem('tuma_route_completion', JSON.stringify(completionData));
    localStorage.removeItem('tuma_active_route');
    
    if (!state.activeRoute.id?.startsWith('demo-')) {
        try {
            // Update all parcels as delivered
            for (const parcel of (state.activeRoute.parcels || [])) {
                const stop = state.activeRoute.stops.find(s => 
                    s.parcelId === parcel.id || s.parcelCode === parcel.parcel_code
                );
                
                const verificationData = state.verificationData[stop?.id];
                
                await supabaseUpdate('parcels',
                    `id=eq.${parcel.id}`,
                    {
                        status: 'delivered',
                        delivery_timestamp: new Date().toISOString(),
                        payment_status: parcel.payment_method === 'cash' ? 'collected' : parcel.payment_status,
                        delivery_verified: true,
                        has_signature: verificationData?.signatures ? true : false,
                        has_photo: verificationData?.photos?.delivery ? true : false
                    }
                );
            }
            
            // Store verification records
            for (const stopId in state.verificationData) {
                const data = state.verificationData[stopId];
                if (data.photos || data.signatures) {
                    await storeVerificationData(stopId, 'delivery', data);
                }
            }
        } catch (error) {
            console.error('Error updating parcel status:', error);
        }
    }
}

// Toggle numbered markers
window.toggleNumberedMarkers = function() {
    state.showNumberedMarkers = !state.showNumberedMarkers;
    plotRoute(); // Redraw with new marker style
    showNotification(
        state.showNumberedMarkers ? 'Showing route numbers' : 'Showing pickup/delivery labels',
        'info'
    );
};

// Helper function to compress image data for storage
function compressImageData(dataUrl, maxWidth = 800) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth) {
                height = (maxWidth / width) * height;
                width = maxWidth;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = dataUrl;
    });
}

// Early definition of showNotification to avoid reference errors
function showNotification(message, type = 'info') {
    // Simple console fallback if called before full UI is loaded
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Try to show actual notification if DOM is ready
    if (document.body) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 20px;
            border-radius: 14px;
            z-index: 4000;
            background: ${type === 'success' ? '#34C759' : type === 'error' ? '#FF3B30' : '#FF9F0A'};
            color: white;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
}
/**
 * Enhanced Route Navigation Module - Part 3/6
 * UI Functions, Styles, Display Components, and Enhanced Verification UI
 * Version: 5.0.0
 */

// ============================================================================
// UI STYLING & INITIALIZATION (Enhanced with new verification styles)
// ============================================================================

function injectNavigationStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Import premium fonts */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        
        * {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', system-ui, sans-serif;
        }
        
        /* Map container styles */
        .map-container {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            z-index: 1 !important;
        }
        
        #map {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            z-index: 1 !important;
        }
        
        /* Enhanced Verification Modal Styles */
        .verification-modal-enhanced {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 3000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        .verification-steps {
            display: flex;
            justify-content: space-between;
            margin: 20px 0;
            padding: 0 10px;
        }
        
        .verification-step {
            flex: 1;
            text-align: center;
            position: relative;
        }
        
        .verification-step::after {
            content: '';
            position: absolute;
            top: 20px;
            right: -50%;
            width: 100%;
            height: 2px;
            background: rgba(255, 255, 255, 0.1);
        }
        
        .verification-step:last-child::after {
            display: none;
        }
        
        .step-circle {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid rgba(255, 255, 255, 0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 8px;
            font-size: 18px;
            transition: all 0.3s ease;
        }
        
        .verification-step.active .step-circle {
            background: linear-gradient(135deg, #9333EA, #7928CA);
            border-color: #9333EA;
            color: white;
        }
        
        .verification-step.completed .step-circle {
            background: linear-gradient(135deg, #34C759, #30D158);
            border-color: #34C759;
            color: white;
        }
        
        .step-label {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.6);
            font-weight: 600;
        }
        
        .verification-step.active .step-label {
            color: white;
        }
        
        /* Camera View Styles */
        .camera-container {
            position: relative;
            width: 100%;
            height: 300px;
            background: #000;
            border-radius: 12px;
            overflow: hidden;
            margin: 20px 0;
        }
        
        .camera-video {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .camera-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
        }
        
        .camera-frame {
            width: 80%;
            height: 80%;
            border: 3px solid rgba(255, 255, 255, 0.5);
            border-radius: 12px;
            position: relative;
        }
        
        .camera-frame::before,
        .camera-frame::after {
            content: '';
            position: absolute;
            width: 30px;
            height: 30px;
            border: 3px solid #9333EA;
        }
        
        .camera-frame::before {
            top: -3px;
            left: -3px;
            border-right: none;
            border-bottom: none;
        }
        
        .camera-frame::after {
            bottom: -3px;
            right: -3px;
            border-left: none;
            border-top: none;
        }
        
        .camera-controls {
            position: absolute;
            bottom: 20px;
            left: 0;
            right: 0;
            display: flex;
            justify-content: center;
            gap: 20px;
        }
        
        .camera-button {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: white;
            border: 4px solid #9333EA;
            cursor: pointer;
            transition: transform 0.2s ease;
        }
        
        .camera-button:hover {
            transform: scale(1.1);
        }
        
        .camera-button:active {
            transform: scale(0.95);
        }
        
        .photo-preview {
            width: 100%;
            height: 200px;
            object-fit: cover;
            border-radius: 12px;
            margin: 10px 0;
        }
        
        /* Signature Pad Styles */
        .signature-container {
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
        }
        
        .signature-canvas {
            width: 100%;
            height: 200px;
            border: 2px dashed #ccc;
            border-radius: 8px;
            cursor: crosshair;
            touch-action: none;
        }
        
        .signature-label {
            font-size: 14px;
            color: #666;
            margin-bottom: 10px;
            display: block;
        }
        
        .signature-controls {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
        }
        
        .signature-clear {
            padding: 8px 16px;
            background: #f0f0f0;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
        }
        
        /* M-Pesa Prompt Styles */
        .mpesa-prompt-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 4000;
            animation: slideUp 0.3s ease;
        }
        
        @keyframes slideUp {
            from {
                transform: translateY(100%);
            }
            to {
                transform: translateY(0);
            }
        }
        
        .mpesa-content {
            background: linear-gradient(135deg, #1C1C1F, #2C2C2E);
            border-radius: 24px;
            padding: 30px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .mpesa-content h3 {
            color: white;
            font-size: 24px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .mpesa-content h3::before {
            content: '';
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #34C759, #30D158);
            border-radius: 50%;
            display: inline-block;
        }
        
        .mpesa-amount {
            font-size: 36px;
            font-weight: 800;
            color: #34C759;
            text-align: center;
            margin: 20px 0;
        }
        
        .mpesa-instructions {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
        }
        
        .mpesa-instructions ol {
            margin: 0;
            padding-left: 20px;
            color: rgba(255, 255, 255, 0.8);
        }
        
        .mpesa-instructions li {
            margin: 10px 0;
        }
        
        .mpesa-input {
            margin: 20px 0;
        }
        
        .mpesa-input label {
            display: block;
            color: rgba(255, 255, 255, 0.6);
            margin-bottom: 10px;
            font-size: 14px;
        }
        
        .mpesa-input input {
            width: 100%;
            padding: 15px;
            background: rgba(255, 255, 255, 0.05);
            border: 2px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            color: white;
            font-size: 18px;
            font-weight: 600;
            text-align: center;
            letter-spacing: 2px;
            text-transform: uppercase;
        }
        
        .mpesa-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        
        .mpesa-actions button {
            flex: 1;
            padding: 16px;
            border: none;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s ease;
        }
        
        .mpesa-actions button:first-child {
            background: linear-gradient(135deg, #34C759, #30D158);
            color: white;
        }
        
        .mpesa-actions button:last-child {
            background: rgba(255, 255, 255, 0.1);
            color: white;
        }
        
        .mpesa-actions button:hover {
            transform: translateY(-2px);
        }
        
        /* Cash Collection Widget */
        .cash-collection-widget {
            position: fixed;
            top: 80px;
            right: 20px;
            background: linear-gradient(135deg, #0A0A0B 0%, #1C1C1F 100%);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            padding: 20px;
            min-width: 240px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), 0 2px 10px rgba(0, 0, 0, 0.3);
            z-index: 100;
            transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            border: 1px solid rgba(255, 255, 255, 0.1);
            font-weight: 500;
        }
        
        /* Premium Leaflet popup styles */
        .leaflet-popup {
            margin-bottom: 25px !important;
        }
        
        .leaflet-popup-content-wrapper {
            background: linear-gradient(145deg, #1A1A1D 0%, #2D2D30 100%) !important;
            border-radius: 24px !important;
            box-shadow: 
                0 20px 60px rgba(0, 0, 0, 0.8),
                0 10px 20px rgba(0, 0, 0, 0.6),
                inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            overflow: hidden !important;
            padding: 0 !important;
            backdrop-filter: blur(10px) !important;
        }
        
        .leaflet-popup-content {
            margin: 0 !important;
            width: 340px !important;
            max-width: 340px !important;
            color: white !important;
            padding: 0 !important;
        }
        
        .leaflet-popup-tip-container {
            display: none !important;
        }
        
        .leaflet-popup-close-button {
            color: rgba(255, 255, 255, 0.6) !important;
            font-size: 28px !important;
            font-weight: 200 !important;
            padding: 10px 14px !important;
            right: 10px !important;
            top: 10px !important;
            opacity: 0.8 !important;
            z-index: 100 !important;
            transition: all 0.2s ease !important;
            background: rgba(0, 0, 0, 0.3) !important;
            border-radius: 50% !important;
            width: 36px !important;
            height: 36px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            line-height: 1 !important;
        }
        
        .leaflet-popup-close-button:hover {
            opacity: 1 !important;
            color: #FF453A !important;
            background: rgba(255, 69, 58, 0.2) !important;
            transform: rotate(90deg) !important;
        }
        
        /* Verification Progress Bar */
        .verification-progress {
            height: 4px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 2px;
            overflow: hidden;
            margin: 20px 0;
        }
        
        .verification-progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #9333EA, #7928CA);
            border-radius: 2px;
            transition: width 0.3s ease;
        }
        
        /* Photo Grid for Multiple Photos */
        .photo-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin: 20px 0;
        }
        
        .photo-grid-item {
            position: relative;
            padding-bottom: 100%;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            overflow: hidden;
        }
        
        .photo-grid-item img {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .photo-grid-item .photo-label {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
            color: white;
            padding: 10px;
            font-size: 12px;
            font-weight: 600;
        }
        
        /* Optimization Button Styles */
        .optimize-button-container {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
            width: 100%;
        }
        
        .optimize-route-btn {
            flex: 1;
            background: linear-gradient(135deg, #9333EA, #7928CA);
            color: white;
            border: none;
            border-radius: 16px;
            padding: 16px 20px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            box-shadow: 0 4px 15px rgba(147, 51, 234, 0.4);
            letter-spacing: 0.5px;
        }
        
        .optimize-route-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(147, 51, 234, 0.5);
        }
        
        .optimize-route-btn.optimized {
            background: linear-gradient(135deg, #34C759, #30D158);
            cursor: default;
        }
        
        .undo-optimize-btn {
            background: rgba(255, 255, 255, 0.1);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 16px;
            padding: 16px 20px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.3s ease;
        }
        
        .undo-optimize-btn:hover {
            background: rgba(255, 255, 255, 0.15);
        }
        
        /* Optimization Animation */
        .optimizing-animation {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 5000;
        }
        
        .optimizing-content {
            background: linear-gradient(135deg, #1C1C1F, #2C2C2E);
            border-radius: 24px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
            max-width: 400px;
        }
        
        .optimizing-spinner {
            width: 60px;
            height: 60px;
            border: 3px solid rgba(147, 51, 234, 0.3);
            border-top-color: #9333EA;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `;
    
    document.head.appendChild(style);
}
/**
 * Enhanced Route Navigation Module - Part 4/6
 * UI Display Functions and Components
 * Version: 5.0.0
 */

// ============================================================================
// UI DISPLAY FUNCTIONS
// ============================================================================

function addOptimizeButton() {
    if (document.getElementById('optimizeBtn')) return;
    
    const navControls = document.getElementById('navControls');
    if (!navControls) return;
    
    const optimizeContainer = document.createElement('div');
    optimizeContainer.className = 'optimize-button-container';
    optimizeContainer.innerHTML = `
        <button id="optimizeBtn" class="optimize-route-btn" onclick="optimizeRouteStops()">
            <span class="optimize-icon">✨</span>
            <span class="optimize-text">Optimize Route</span>
        </button>
        <button id="undoOptimizeBtn" class="undo-optimize-btn" onclick="undoOptimization()" style="display: none;">
            <span class="undo-icon">↩️</span>
            <span>Undo</span>
        </button>
    `;
    
    navControls.insertBefore(optimizeContainer, navControls.firstChild);
}

function updateOptimizeButton(isOptimized) {
    const optimizeBtn = document.getElementById('optimizeBtn');
    const undoBtn = document.getElementById('undoOptimizeBtn');
    
    if (optimizeBtn) {
        if (isOptimized) {
            optimizeBtn.innerHTML = `
                <span class="optimize-icon">✅</span>
                <span class="optimize-text">Route Optimized</span>
            `;
            optimizeBtn.disabled = true;
            optimizeBtn.classList.add('optimized');
        } else {
            optimizeBtn.innerHTML = `
                <span class="optimize-icon">✨</span>
                <span class="optimize-text">Optimize Route</span>
            `;
            optimizeBtn.disabled = false;
            optimizeBtn.classList.remove('optimized');
        }
    }
    
    if (undoBtn) {
        undoBtn.style.display = isOptimized ? 'flex' : 'none';
    }
}

function showOptimizingAnimation() {
    const animation = document.createElement('div');
    animation.id = 'optimizingAnimation';
    animation.className = 'optimizing-animation';
    
    const steps = [
        '📍 Analyzing stop locations',
        '🗺️ Detecting route direction',
        '⚡ Optimizing delivery sequence',
        '✅ Validating route integrity'
    ];
    
    animation.innerHTML = `
        <div class="optimizing-content">
            <div class="optimizing-spinner"></div>
            <h3 style="color: white; margin-bottom: 10px;">Optimizing Route...</h3>
            <p style="color: rgba(255, 255, 255, 0.6); margin-bottom: 20px;">
                Using intelligent geographical flow analysis
            </p>
            <div class="optimizing-steps">
                ${steps.map((step, i) => `
                    <div class="step ${i === 0 ? 'active' : ''}" data-step="${i}">
                        ${step}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    document.body.appendChild(animation);
    
    // Animate steps
    steps.forEach((_, index) => {
        if (index > 0) {
            setTimeout(() => {
                const step = animation.querySelector(`.step[data-step="${index}"]`);
                if (step) step.classList.add('active');
            }, 300 * (index + 1));
        }
    });
}

function hideOptimizingAnimation() {
    const animation = document.getElementById('optimizingAnimation');
    if (animation) {
        animation.classList.add('fade-out');
        setTimeout(() => animation.remove(), 300);
    }
}

function showOptimizationResults(savedDistance, savedPercentage) {
    const results = document.createElement('div');
    results.className = 'optimization-results';
    
    results.innerHTML = `
        <div class="results-content">
            <div class="results-icon">🎉</div>
            <h2 style="color: white; margin-bottom: 10px;">Route Optimized!</h2>
            <div class="results-stats">
                <div class="stat">
                    <span class="stat-value">${savedDistance.toFixed(1)} km</span>
                    <span class="stat-label">Distance Saved</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${savedPercentage}%</span>
                    <span class="stat-label">More Efficient</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${Math.round(savedDistance * 2.5)} min</span>
                    <span class="stat-label">Time Saved</span>
                </div>
            </div>
            <div class="results-comparison">
                <div class="comparison-item">
                    <span class="comparison-label">Original:</span>
                    <span class="comparison-value">${state.optimizationStats.originalDistance.toFixed(1)} km</span>
                </div>
                <div class="comparison-item">
                    <span class="comparison-label">Optimized:</span>
                    <span class="comparison-value success">${state.optimizationStats.optimizedDistance.toFixed(1)} km</span>
                </div>
            </div>
            <button class="results-close" onclick="this.parentElement.parentElement.remove()">
                Got it!
            </button>
        </div>
    `;
    
    document.body.appendChild(results);
    
    setTimeout(() => {
        if (results.parentElement) {
            results.classList.add('fade-out');
            setTimeout(() => results.remove(), 300);
        }
    }, 7000);
}

function showReoptimizeButton() {
    const existing = document.querySelector('.reoptimize-float-btn');
    if (existing) existing.remove();
    
    const btn = document.createElement('button');
    btn.className = 'reoptimize-float-btn';
    btn.innerHTML = '🔄 Re-optimize Route';
    btn.onclick = () => {
        reoptimizeRemainingStops();
        btn.remove();
    };
    
    document.body.appendChild(btn);
    setTimeout(() => btn.remove(), 10000);
}

function showCashCollectionWidget() {
    const existingWidget = document.querySelector('.cash-collection-widget');
    if (existingWidget) existingWidget.remove();
    
    const pendingAmount = state.totalCashToCollect - state.totalCashCollected;
    const hasPending = pendingAmount > 0;
    
    const widget = document.createElement('div');
    widget.className = `cash-collection-widget ${hasPending ? 'has-pending' : ''}`;
    widget.innerHTML = `
        <div class="cash-widget-title" style="font-size: 14px; font-weight: 600; margin-bottom: 10px; color: white;">
            ${hasPending ? '⚡' : '✓'} Cash Collection
        </div>
        <div class="cash-widget-amount" style="font-size: 24px; font-weight: 700; color: #FF9F0A; margin-bottom: 15px;">
            KES ${pendingAmount.toLocaleString()}
        </div>
        <div class="cash-widget-breakdown" style="font-size: 13px; color: rgba(255,255,255,0.7);">
            <div class="cash-breakdown-item" style="display: flex; justify-content: space-between; padding: 5px 0;">
                <span>Total Expected</span>
                <span style="font-weight: 600;">KES ${state.totalCashToCollect.toLocaleString()}</span>
            </div>
            <div class="cash-breakdown-item" style="display: flex; justify-content: space-between; padding: 5px 0;">
                <span>✓ Collected</span>
                <span style="font-weight: 600; color: #34C759;">KES ${state.totalCashCollected.toLocaleString()}</span>
            </div>
            <div class="cash-breakdown-item" style="display: flex; justify-content: space-between; padding: 5px 0; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 5px; padding-top: 10px;">
                <span>⏳ Pending</span>
                <span style="font-weight: 600; color: #FF9F0A;">KES ${pendingAmount.toLocaleString()}</span>
            </div>
        </div>
    `;
    
    document.body.appendChild(widget);
}

function updateCashCollectionWidget() {
    calculateCashCollection();
    const widget = document.querySelector('.cash-collection-widget');
    if (widget) {
        showCashCollectionWidget();
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? 'linear-gradient(135deg, #34C759, #30D158)' : 
                      type === 'error' ? 'linear-gradient(135deg, #FF3B30, #FF2D55)' : 
                      type === 'warning' ? 'linear-gradient(135deg, #FF9F0A, #FF6B00)' : 
                      'linear-gradient(135deg, #1C1C1F, #2C2C2E)'};
        color: ${type === 'warning' ? '#0A0A0B' : 'white'};
        padding: 16px 20px;
        border-radius: 14px;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 4000;
        animation: slideIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        max-width: 380px;
        font-weight: 600;
        font-size: 15px;
        letter-spacing: 0.3px;
    `;
    notification.innerHTML = `
        <span class="notification-icon" style="font-size: 20px;">
            ${type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ'}
        </span>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ============================================================================
// ENHANCED VERIFICATION UI FUNCTIONS
// ============================================================================

function showVerificationProgress(currentStep, totalSteps) {
    const progressBar = document.querySelector('.verification-progress-bar');
    if (progressBar) {
        const percentage = (currentStep / totalSteps) * 100;
        progressBar.style.width = `${percentage}%`;
    }
}

function updateVerificationStep(stepNumber, status = 'active') {
    const steps = document.querySelectorAll('.verification-step');
    steps.forEach((step, index) => {
        if (index < stepNumber) {
            step.classList.remove('active');
            step.classList.add('completed');
        } else if (index === stepNumber) {
            step.classList.add(status);
        } else {
            step.classList.remove('active', 'completed');
        }
    });
}

function createPhotoPreview(photoData, label) {
    const preview = document.createElement('div');
    preview.className = 'photo-grid-item';
    preview.innerHTML = `
        <img src="${photoData}" alt="${label}">
        <div class="photo-label">${label}</div>
    `;
    return preview;
}

function showCameraUI(onCapture) {
    const cameraModal = document.createElement('div');
    cameraModal.className = 'camera-modal';
    cameraModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.95);
        z-index: 3500;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    `;
    
    cameraModal.innerHTML = `
        <div class="camera-container">
            <video id="cameraVideo" class="camera-video" autoplay></video>
            <div class="camera-overlay">
                <div class="camera-frame"></div>
            </div>
            <div class="camera-controls">
                <button class="camera-button" id="captureBtn"></button>
                <button style="
                    background: rgba(255, 255, 255, 0.2);
                    border: none;
                    border-radius: 50%;
                    width: 50px;
                    height: 50px;
                    color: white;
                    font-size: 20px;
                    cursor: pointer;
                " onclick="this.parentElement.parentElement.parentElement.remove()">✕</button>
            </div>
        </div>
        <p style="color: white; margin-top: 20px; font-size: 14px;">
            Position the package within the frame
        </p>
    `;
    
    document.body.appendChild(cameraModal);
    
    // Initialize camera
    const video = document.getElementById('cameraVideo');
    initializeCamera().then(stream => {
        video.srcObject = stream;
        
        document.getElementById('captureBtn').onclick = async () => {
            // Show loading state
            const captureBtn = document.getElementById('captureBtn');
            captureBtn.disabled = true;
            captureBtn.style.opacity = '0.5';
            
            try {
                // Capture and upload directly to Supabase
                const photoUrl = await captureAndUploadPhoto(
                    video, 
                    state.currentVerification.stopId,
                    state.currentVerification.type
                );
                
                stream.getTracks().forEach(track => track.stop());
                cameraModal.remove();
                onCapture(photoUrl);
            } catch (err) {
                console.error('Photo capture/upload failed:', err);
                // Fallback to base64
                const photoData = capturePhoto(video);
                stream.getTracks().forEach(track => track.stop());
                cameraModal.remove();
                onCapture(photoData);
            }
        };
    }).catch(err => {
        console.error('Camera error:', err);
        showNotification('Camera not available', 'error');
        cameraModal.remove();
    });
}

function showSignaturePad(onSign) {
    const signatureModal = document.createElement('div');
    signatureModal.className = 'signature-modal';
    signatureModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.95);
        z-index: 3500;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    `;
    
    signatureModal.innerHTML = `
        <div class="signature-container" style="max-width: 500px; width: 100%;">
            <h3 style="margin: 0 0 20px 0; color: #333;">Customer Signature</h3>
            <label class="signature-label">Please ask the customer to sign below:</label>
            <canvas id="signatureCanvas" class="signature-canvas"></canvas>
            <div class="signature-controls">
                <button class="signature-clear" id="clearSignature">Clear</button>
                <div style="display: flex; gap: 10px;">
                    <button style="
                        padding: 10px 20px;
                        background: #ccc;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 600;
                    " onclick="this.parentElement.parentElement.parentElement.parentElement.remove()">Cancel</button>
                    <button id="confirmSignature" style="
                        padding: 10px 20px;
                        background: linear-gradient(135deg, #34C759, #30D158);
                        border: none;
                        border-radius: 8px;
                        color: white;
                        cursor: pointer;
                        font-weight: 600;
                    ">Confirm Signature</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(signatureModal);
    
    const canvas = document.getElementById('signatureCanvas');
    const signaturePad = initializeSignaturePad(canvas);
    
    document.getElementById('clearSignature').onclick = () => {
        signaturePad.clear();
    };
    
    document.getElementById('confirmSignature').onclick = async () => {
        const signatureData = await signaturePad.getSignatureData();
        if (signatureData) {
            // Show loading state
            const confirmBtn = document.getElementById('confirmSignature');
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Uploading...';
            
            try {
                // Upload signature to Supabase
                const signatureUrl = await uploadSignatureToSupabase(
                    signatureData,
                    state.currentVerification.stopId
                );
                signatureModal.remove();
                onSign(signatureUrl);
            } catch (err) {
                console.error('Signature upload failed:', err);
                // Fallback to base64
                signatureModal.remove();
                onSign(signatureData);
            }
} else {
            showNotification('Please provide a signature', 'warning');
        }
    };
}

function showOptimizationResults(savedDistance, savedPercentage) {
    const results = document.createElement('div');
    results.className = 'optimization-results';
    
    results.innerHTML = `
        <div class="results-content">
            <div class="results-icon">🎉</div>
            <h2 style="color: white; margin-bottom: 10px;">Route Optimized!</h2>
            <div class="results-stats">
                <div class="stat">
                    <span class="stat-value">${savedDistance.toFixed(1)} km</span>
                    <span class="stat-label">Distance Saved</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${savedPercentage}%</span>
                    <span class="stat-label">More Efficient</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${Math.round(savedDistance * 2.5)} min</span>
                    <span class="stat-label">Time Saved</span>
                </div>
            </div>
            <div class="results-comparison">
                <div class="comparison-item">
                    <span class="comparison-label">Original:</span>
                    <span class="comparison-value">${state.optimizationStats.originalDistance.toFixed(1)} km</span>
                </div>
                <div class="comparison-item">
                    <span class="comparison-label">Optimized:</span>
                    <span class="comparison-value success">${state.optimizationStats.optimizedDistance.toFixed(1)} km</span>
                </div>
            </div>
            <button class="results-close" onclick="this.parentElement.parentElement.remove()">
                Got it!
            </button>
        </div>
    `;
    
    document.body.appendChild(results);
    
    setTimeout(() => {
        if (results.parentElement) {
            results.classList.add('fade-out');
            setTimeout(() => results.remove(), 300);
        }
    }, 7000);
}

function showReoptimizeButton() {
    const existing = document.querySelector('.reoptimize-float-btn');
    if (existing) existing.remove();
    
    const btn = document.createElement('button');
    btn.className = 'reoptimize-float-btn';
    btn.innerHTML = '🔄 Re-optimize Route';
    btn.onclick = () => {
        reoptimizeRemainingStops();
        btn.remove();
    };
    
    document.body.appendChild(btn);
    setTimeout(() => btn.remove(), 10000);
}

function showCashCollectionWidget() {
    const existingWidget = document.querySelector('.cash-collection-widget');
    if (existingWidget) existingWidget.remove();
    
    const pendingAmount = state.totalCashToCollect - state.totalCashCollected;
    const hasPending = pendingAmount > 0;
    
    const widget = document.createElement('div');
    widget.className = `cash-collection-widget ${hasPending ? 'has-pending' : ''}`;
    widget.innerHTML = `
        <div class="cash-widget-title" style="font-size: 14px; font-weight: 600; margin-bottom: 10px; color: white;">
            ${hasPending ? '⚡' : '✓'} Cash Collection
        </div>
        <div class="cash-widget-amount" style="font-size: 24px; font-weight: 700; color: #FF9F0A; margin-bottom: 15px;">
            KES ${pendingAmount.toLocaleString()}
        </div>
        <div class="cash-widget-breakdown" style="font-size: 13px; color: rgba(255,255,255,0.7);">
            <div class="cash-breakdown-item" style="display: flex; justify-content: space-between; padding: 5px 0;">
                <span>Total Expected</span>
                <span style="font-weight: 600;">KES ${state.totalCashToCollect.toLocaleString()}</span>
            </div>
            <div class="cash-breakdown-item" style="display: flex; justify-content: space-between; padding: 5px 0;">
                <span>✓ Collected</span>
                <span style="font-weight: 600; color: #34C759;">KES ${state.totalCashCollected.toLocaleString()}</span>
            </div>
            <div class="cash-breakdown-item" style="display: flex; justify-content: space-between; padding: 5px 0; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 5px; padding-top: 10px;">
                <span>⏳ Pending</span>
                <span style="font-weight: 600; color: #FF9F0A;">KES ${pendingAmount.toLocaleString()}</span>
            </div>
        </div>
    `;
    
    document.body.appendChild(widget);
}

function updateCashCollectionWidget() {
    calculateCashCollection();
    const widget = document.querySelector('.cash-collection-widget');
    if (widget) {
        showCashCollectionWidget();
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? 'linear-gradient(135deg, #34C759, #30D158)' : 
                      type === 'error' ? 'linear-gradient(135deg, #FF3B30, #FF2D55)' : 
                      type === 'warning' ? 'linear-gradient(135deg, #FF9F0A, #FF6B00)' : 
                      'linear-gradient(135deg, #1C1C1F, #2C2C2E)'};
        color: ${type === 'warning' ? '#0A0A0B' : 'white'};
        padding: 16px 20px;
        border-radius: 14px;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 4000;
        animation: slideIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        max-width: 380px;
        font-weight: 600;
        font-size: 15px;
        letter-spacing: 0.3px;
    `;
    notification.innerHTML = `
        <span class="notification-icon" style="font-size: 20px;">
            ${type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ'}
        </span>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ============================================================================
// ENHANCED VERIFICATION UI FUNCTIONS
// ============================================================================

function showVerificationProgress(currentStep, totalSteps) {
    const progressBar = document.querySelector('.verification-progress-bar');
    if (progressBar) {
        const percentage = (currentStep / totalSteps) * 100;
        progressBar.style.width = `${percentage}%`;
    }
}

function updateVerificationStep(stepNumber, status = 'active') {
    const steps = document.querySelectorAll('.verification-step');
    steps.forEach((step, index) => {
        if (index < stepNumber) {
            step.classList.remove('active');
            step.classList.add('completed');
        } else if (index === stepNumber) {
            step.classList.add(status);
        } else {
            step.classList.remove('active', 'completed');
        }
    });
}

function createPhotoPreview(photoData, label) {
    const preview = document.createElement('div');
    preview.className = 'photo-grid-item';
    preview.innerHTML = `
        <img src="${photoData}" alt="${label}">
        <div class="photo-label">${label}</div>
    `;
    return preview;
}
/**
 * Enhanced Route Navigation Module - Part 5/6
 * Map, Navigation, Location Tracking Functions
 * Version: 5.0.0
 */

// ============================================================================
// MAP INITIALIZATION & MANAGEMENT
// ============================================================================

async function initializeMap() {
    console.log('Initializing map...');
    
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.error('Map container not found!');
        return;
    }
    
    mapContainer.style.width = '100%';
    mapContainer.style.height = '100%';
    
    let centerLat = -1.2921;
    let centerLng = 36.8219;
    
    if (state.activeRoute && state.activeRoute.stops && state.activeRoute.stops.length > 0) {
        const bounds = calculateBounds(state.activeRoute.stops);
        centerLat = (bounds.north + bounds.south) / 2;
        centerLng = (bounds.east + bounds.west) / 2;
    }
    
    state.map = L.map('map', {
        center: [centerLat, centerLng],
        zoom: 17,
        zoomControl: false,
        rotate: true,
        bearing: 0,
        touchRotate: true,
        shiftKeyRotate: true,
        rotateControl: {
            closeOnZeroBearing: false,
            position: 'topleft'
        },
        attributionControl: false
    });
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(state.map);
    
    L.control.zoom({
        position: 'bottomleft'
    }).addTo(state.map);
    
    L.control.scale({
        position: 'bottomleft',
        imperial: false
    }).addTo(state.map);
    
    if (L.Browser.touch && state.map.touchRotate) {
        state.map.touchRotate.enable();
    }
    
    setTimeout(() => {
        state.map.invalidateSize();
    }, 100);
    
    console.log('Map initialized');
}

// ============================================================================
// LOCATION TRACKING FUNCTIONS
// ============================================================================

function startLocationTracking() {
    if (!navigator.geolocation) {
        showNotification('Location services not available', 'warning');
        return;
    }
    
    console.log('Starting location tracking...');
    
    const geoOptions = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    };
    
    // Get initial position
    navigator.geolocation.getCurrentPosition(
        position => {
            console.log('Initial position obtained');
            updateCurrentLocation(position);
            state.isTracking = true;
            
            // Store location for verification
            state.currentVerification.locationData = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: new Date().toISOString()
            };
            
            // Center map on location
            if (state.map && state.currentLocation) {
                state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 17, {
                    animate: true
                });
            }
            
            // Check for better route with new location
            if (config.optimization.autoReoptimize) {
                checkForBetterRoute();
            }
            
            showNotification('Location tracking started', 'success');
        },
        error => {
            console.error('Location error:', error);
            let errorMessage = 'Unable to get location';
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Please enable location permissions';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Location information unavailable';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Location request timed out';
                    break;
            }
            
            showNotification(errorMessage, 'error');
            
            // Use fallback location (Nairobi center)
            state.currentLocation = { lat: -1.2921, lng: 36.8219 };
            if (state.map) {
                state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 13);
            }
        },
        geoOptions
    );
    
    // Watch position for continuous updates
    if (state.locationWatchId) {
        navigator.geolocation.clearWatch(state.locationWatchId);
    }
    
    state.locationWatchId = navigator.geolocation.watchPosition(
        position => {
            updateCurrentLocation(position);
            
            // Update verification location data
            if (state.currentVerification.stopId) {
                state.currentVerification.locationData = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: new Date().toISOString()
                };
            }
            
            // Periodic optimization check
            if (state.navigationActive && config.optimization.autoReoptimize) {
                if (!state.lastOptimizationCheck || 
                    Date.now() - state.lastOptimizationCheck > 300000) { // Every 5 minutes
                    checkForBetterRoute();
                    state.lastOptimizationCheck = Date.now();
                }
            }
        },
        error => {
            console.error('Location update error:', error);
            
            if (Date.now() - (state.lastLocationErrorTime || 0) > 30000) {
                state.lastLocationErrorTime = Date.now();
                showNotification('Location update failed - using last known position', 'warning');
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );
    
    // Backup interval for location updates
    if (state.trackingInterval) {
        clearInterval(state.trackingInterval);
    }
    
    state.trackingInterval = setInterval(() => {
        if (navigator.geolocation && state.isTracking) {
            navigator.geolocation.getCurrentPosition(
                position => updateCurrentLocation(position),
                error => console.log('Interval location update failed:', error),
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 5000 }
            );
        }
    }, 10000); // Update every 10 seconds
}

function stopLocationTracking() {
    console.log('Stopping location tracking...');
    
    if (state.locationWatchId) {
        navigator.geolocation.clearWatch(state.locationWatchId);
        state.locationWatchId = null;
    }
    
    if (state.trackingInterval) {
        clearInterval(state.trackingInterval);
        state.trackingInterval = null;
    }
    
    state.isTracking = false;
    
    // Remove location marker from map
    if (state.currentLocationMarker) {
        state.currentLocationMarker.remove();
        state.currentLocationMarker = null;
    }
    
    if (state.accuracyCircle) {
        state.accuracyCircle.remove();
        state.accuracyCircle = null;
    }
    
    showNotification('Location tracking stopped', 'info');
}

function updateCurrentLocation(position) {
    const newLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
    };
    
    // Skip update if location hasn't changed significantly
    if (state.currentLocation) {
        const distance = calculateDistance(state.currentLocation, newLocation);
        if (distance < 0.005) return; // Less than 5 meters
    }
    
    state.currentLocation = newLocation;
    
    // Update heading
    if (position.coords.heading !== null && position.coords.heading !== undefined) {
        state.currentHeading = position.coords.heading;
    } else if (state.lastLocation) {
        state.currentHeading = calculateBearing(state.lastLocation, state.currentLocation);
    }
    
    // Update speed
    if (position.coords.speed !== null) {
        state.currentSpeed = Math.round(position.coords.speed * 3.6); // Convert m/s to km/h
    }
    
    // Update map marker
    if (state.map) {
        // Create or update location marker
        if (!state.currentLocationMarker) {
            const riderIcon = createRiderIcon(state.currentHeading);
            state.currentLocationMarker = L.marker(
                [state.currentLocation.lat, state.currentLocation.lng],
                { 
                    icon: riderIcon,
                    zIndexOffset: 2000,
                    interactive: false
                }
            ).addTo(state.map);
            
            state.currentLocationMarker.bindPopup(`
                <div style="text-align: center; padding: 10px;">
                    <strong>Your Location</strong><br>
                    <span style="font-size: 12px; color: #666;">
                        Speed: ${state.currentSpeed} km/h<br>
                        Accuracy: ±${Math.round(position.coords.accuracy)}m
                    </span>
                </div>
            `);
        } else {
            state.currentLocationMarker.setLatLng([state.currentLocation.lat, state.currentLocation.lng]);
            const riderIcon = createRiderIcon(state.currentHeading);
            state.currentLocationMarker.setIcon(riderIcon);
        }
        
        // Update accuracy circle
        if (position.coords.accuracy) {
            if (state.accuracyCircle) {
                state.accuracyCircle.setLatLng([state.currentLocation.lat, state.currentLocation.lng]);
                state.accuracyCircle.setRadius(position.coords.accuracy);
            } else {
                state.accuracyCircle = L.circle([state.currentLocation.lat, state.currentLocation.lng], {
                    radius: position.coords.accuracy,
                    color: '#007AFF',
                    fillColor: '#007AFF',
                    fillOpacity: 0.1,
                    weight: 1,
                    opacity: 0.3,
                    interactive: false
                }).addTo(state.map);
            }
        }
        
        // Auto-pan to location if following
        if (state.navigationActive && state.isFollowingUser) {
            state.map.panTo([state.currentLocation.lat, state.currentLocation.lng], {
                animate: true,
                duration: 1,
                noMoveStart: true
            });
            
            // Auto-zoom based on speed
            const targetZoom = calculateZoomFromSpeed(state.currentSpeed);
            const currentZoom = state.map.getZoom();
            if (Math.abs(currentZoom - targetZoom) > 0.5) {
                state.map.setZoom(targetZoom, {
                    animate: true,
                    duration: 1
                });
            }
        }
    }
    
    // Update last location
    state.lastLocation = state.currentLocation;
    state.lastLocationTime = Date.now();
    
    // Update UI elements
    if (state.navigationActive) {
        updateNavigationInfo();
    }
    
    updateDynamicHeader();
    
    // Check proximity to stops
    checkStopProximity();
    
    console.log('Location updated:', {
        lat: newLocation.lat.toFixed(6),
        lng: newLocation.lng.toFixed(6),
        accuracy: `±${Math.round(newLocation.accuracy)}m`,
        heading: Math.round(state.currentHeading) + '°',
        speed: state.currentSpeed + ' km/h'
    });
}

function checkStopProximity() {
    if (!state.currentLocation || !state.activeRoute) return;
    
    const nextStop = getNextStop();
    if (!nextStop) return;
    
    const distance = calculateDistance(
        state.currentLocation,
        nextStop.location
    );
    
    // Alert when within 100 meters
    if (distance < 0.1 && !state.proximityNotified) {
        state.proximityNotified = true;
        
        const paymentInfo = getPaymentInfoForStop(nextStop);
        
        let message = `Approaching ${nextStop.type} location - ${Math.round(distance * 1000)}m away`;
        
        if (nextStop.type === 'delivery' && paymentInfo.needsCollection) {
            message = `💰 Approaching delivery - Remember to collect KES ${paymentInfo.amount.toLocaleString()}`;
        }
        
        showNotification(message, 'warning');
        
        // Play sound if available
        if ('Audio' in window) {
            try {
                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBStz0Oy9nzUIHGGz7+OZURE');
                audio.play().catch(e => console.log('Could not play notification sound'));
            } catch (e) {
                console.log('Audio not supported');
            }
        }
        
        // Reset notification after 5 minutes
        setTimeout(() => {
            state.proximityNotified = false;
        }, 300000);
    }
}

// ============================================================================
// MAP PLOTTING & ROUTE DISPLAY
// ============================================================================

async function plotRoute() {
    if (!state.map || !state.activeRoute || !state.activeRoute.stops) return;
    
    // Update the stop order map FIRST
    updateStopOrderMap();
    
    // Clear existing markers
    state.markers.forEach(marker => marker.remove());
    state.markers = [];
    if (state.routePolyline) {
        state.routePolyline.remove();
        state.routePolyline = null;
    }
    
    if (state.radiusCircle) {
        state.radiusCircle.remove();
        state.radiusCircle = null;
    }
    
    const bounds = L.latLngBounds();
    
    // Add markers for each stop
    state.activeRoute.stops.forEach((stop, index) => {
        const marker = L.marker([stop.location.lat, stop.location.lng], {
            icon: createLeafletIcon(stop),
            zIndexOffset: isNextStop(stop) ? 1000 : index
        })
        .addTo(state.map)
        .bindPopup(createStopPopup(stop), {
            maxWidth: 340,
            className: 'enhanced-popup',
            autoPan: true,
            autoPanPadding: [20, 20],
            autoClose: true,
            closeOnClick: true
        });
        
        marker.on('click', function() {
            this.openPopup();
        });
        
        state.markers.push(marker);
        bounds.extend([stop.location.lat, stop.location.lng]);
    });
    
    // Add current location if available
    if (state.currentLocation) {
        bounds.extend([state.currentLocation.lat, state.currentLocation.lng]);
    }
    
    state.map.fitBounds(bounds, { 
        padding: [60, 60],
        maxZoom: 16
    });
}

async function drawOptimizedRoute() {
    if (!state.activeRoute) return;
    
    const stops = state.activeRoute.stops.filter(s => !s.completed);
    if (stops.length < 2) {
        console.log('Not enough stops to draw route');
        return;
    }
    
    try {
        if (state.routePolyline) {
            state.routePolyline.remove();
            state.routePolyline = null;
        }
        
        let coordinates = [];
        if (state.currentLocation && state.navigationActive) {
            coordinates.push([state.currentLocation.lng, state.currentLocation.lat]);
        }
        
        coordinates = coordinates.concat(stops.map(stop => [stop.location.lng, stop.location.lat]));
        
        const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
            method: 'POST',
            headers: {
                'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
                'Content-Type': 'application/json',
                'Authorization': OPENROUTE_API_KEY
            },
            body: JSON.stringify({
                coordinates: coordinates,
                continue_straight: false,
                elevation: false,
                extra_info: [],
                geometry: true,
                instructions: false,
                preference: 'recommended',
                units: 'km'
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouteService error:', errorText);
            throw new Error('OpenRouteService API error');
        }
        
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const decodedCoords = decodePolyline(route.geometry);
            
            state.routePolyline = L.polyline(decodedCoords, {
                color: '#0066FF',
                weight: 6,
                opacity: 0.8,
                smoothFactor: 1
            }).addTo(state.map);
            
            const distance = (route.summary.distance / 1000).toFixed(1);
            const duration = Math.round(route.summary.duration / 60);
            
            if (document.getElementById('totalDistance')) {
                document.getElementById('totalDistance').textContent = distance;
            }
            if (document.getElementById('estimatedTime')) {
                document.getElementById('estimatedTime').textContent = duration;
            }
        }
    } catch (error) {
        console.error('Error getting route:', error);
        drawFallbackRoute(stops);
    }
}

function drawFallbackRoute(stops) {
    console.log('Drawing fallback route');
    const coords = stops.map(stop => [stop.location.lat, stop.location.lng]);
    
    if (state.currentLocation && state.navigationActive) {
        coords.unshift([state.currentLocation.lat, state.currentLocation.lng]);
    }
    
    state.routePolyline = L.polyline(coords, {
        color: '#0066FF',
        weight: 4,
        opacity: 0.6,
        dashArray: '10, 10',
        smoothFactor: 1
    }).addTo(state.map);
}

function decodePolyline(encoded) {
    const poly = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
        let b;
        let shift = 0;
        let result = 0;
        
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        
        const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;

        shift = 0;
        result = 0;
        
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        
        const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;

        poly.push([lat / 1E5, lng / 1E5]);
    }

    return poly;
}

// ============================================================================
// MARKER & POPUP CREATION
// ============================================================================

function createRiderIcon(heading = 0) {
    return L.divIcon({
        className: 'rider-location-marker',
        html: `
            <div class="rider-marker-wrapper">
                <div class="rider-pulse"></div>
                <div class="rider-marker-container" style="transform: rotate(${heading}deg)">
                    <div class="rider-direction-cone"></div>
                    <div class="rider-dot">
                        <div class="rider-inner-dot"></div>
                    </div>
                </div>
            </div>
        `,
        iconSize: [60, 60],
        iconAnchor: [30, 30]
    });
}

function createLeafletIcon(stop) {
    const isCompleted = stop.completed;
    const isActive = isNextStop(stop);
    const type = stop.type;
    
    // Get the order number from the map
    const orderNumber = state.stopOrderMap[stop.id] || '';
    
    // Show order number if route is optimized and numbered markers are enabled
    const showOrderNumber = state.activeRoute?.isOptimized && 
                           orderNumber && 
                           state.showNumberedMarkers !== false;
    
    const bgColor = isCompleted ? '#2C2C2E' : type === 'pickup' ? '#FF9F0A' : '#007AFF';
    const borderColor = isCompleted ? '#48484A' : '#FFFFFF';
    const symbol = isCompleted ? '✓' : showOrderNumber ? orderNumber : (type === 'pickup' ? 'P' : 'D');
    
    // Different sizes for number vs letter
    const fontSize = showOrderNumber ? '17px' : '20px';
    const markerSize = showOrderNumber ? '46px' : '44px';
    
    return L.divIcon({
        className: 'custom-marker',
        html: `
            <div class="stop-marker-wrapper ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}">
                <div class="stop-marker ${type}" style="
                    background: ${bgColor};
                    width: ${markerSize};
                    height: ${markerSize};
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 6px 16px rgba(0,0,0,0.6);
                    border: 3px solid ${borderColor};
                    position: relative;
                    transition: all 0.3s ease;
                ">
                    <span style="
                        color: ${isCompleted ? '#8E8E93' : 'white'};
                        font-weight: 800;
                        font-size: ${fontSize};
                        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                    ">${symbol}</span>
                    ${isActive ? '<div class="marker-pulse"></div>' : ''}
                </div>
                <div class="marker-label" style="
                    position: absolute;
                    bottom: -24px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(28, 28, 31, 0.95);
                    color: white;
                    padding: 3px 10px;
                    border-radius: 10px;
                    font-size: 11px;
                    font-weight: 600;
                    white-space: nowrap;
                    pointer-events: none;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                ">${type === 'pickup' ? 'Pickup' : 'Delivery'}</div>
            </div>
        `,
        iconSize: [parseInt(markerSize) + 20, 80],
        iconAnchor: [(parseInt(markerSize) + 20) / 2, 60],
        popupAnchor: [0, -60]
    });
}

// Helper functions
function calculateBounds(stops) {
    let north = -90, south = 90, east = -180, west = 180;
    
    stops.forEach(stop => {
        if (stop.location) {
            north = Math.max(north, stop.location.lat);
            south = Math.min(south, stop.location.lat);
            east = Math.max(east, stop.location.lng);
            west = Math.min(west, stop.location.lng);
        }
    });
    
    return { north, south, east, west };
}

function calculateZoomFromSpeed(speed) {
    if (speed > 60) return 15;
    if (speed > 40) return 16;
    if (speed > 20) return 17;
    if (speed > 5) return 18;
    return 18;
}

function waitForLeaflet() {
    return new Promise((resolve) => {
        if (window.L) {
            resolve();
        } else {
            const checkInterval = setInterval(() => {
                if (window.L) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        }
    });
}

// Navigation control functions
window.centerOnLocation = function() {
    if (state.currentLocation && state.map) {
        state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 17, {
            animate: true,
            duration: 1
        });
        
        // Flash the location marker
        if (state.currentLocationMarker) {
            const marker = state.currentLocationMarker.getElement();
            if (marker) {
                marker.style.animation = 'none';
                setTimeout(() => {
                    marker.style.animation = '';
                }, 100);
            }
        }
        
        showNotification('Centered on your location', 'info');
    } else {
        showNotification('Getting your location...', 'info');
        startLocationTracking();
    }
};

window.toggleLocationTracking = function() {
    if (state.isTracking) {
        stopLocationTracking();
    } else {
        startLocationTracking();
    }
};

window.startNavigation = function() {
    const nextStop = getNextStop();
    if (!nextStop) {
        showNotification('No stops to navigate to', 'warning');
        return;
    }
    
    if (!state.routePolyline) {
        showNotification('Optimizing route...', 'info');
        drawOptimizedRoute().then(() => {
            proceedWithNavigation(nextStop);
        });
    } else {
        proceedWithNavigation(nextStop);
    }
};

function proceedWithNavigation(nextStop) {
    startContinuousTracking();
    state.navigationActive = true;
    showNotification(`Navigating to ${nextStop.type} at ${nextStop.address}`, 'info');
}

function startContinuousTracking() {
    if (state.trackingInterval) {
        clearInterval(state.trackingInterval);
    }
    
    state.trackingInterval = setInterval(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    updateCurrentLocation(position);
                    checkStopProximity();
                },
                error => console.error('Tracking error:', error),
                { enableHighAccuracy: true, maximumAge: 5000 }
            );
        }
    }, 5000);
}

window.navigateToStop = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop) return;
    
    state.navigationActive = true;
    showNotification(`Navigating to ${stop.type} location`, 'info');
    
    // Center map on stop
    if (state.map) {
        state.map.setView([stop.location.lat, stop.location.lng], 16);
    }
};
/**
 * Enhanced Route Navigation Module - Part 6/6
 * Display, Enhanced Verification with Photos/Signatures, and Completion Functions
 * Version: 5.0.0
 */

// ============================================================================
// ROUTE DISPLAY FUNCTIONS
// ============================================================================

function displayRouteInfo() {
    if (!state.activeRoute) return;
    
    const routeType = document.getElementById('routeType');
    if (routeType) {
        const nextStop = getNextStop();
        if (nextStop) {
            routeType.className = `route-badge verify-btn ${nextStop.type}`;
            routeType.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                <span>Verify ${nextStop.type === 'pickup' ? 'Pickup' : 'Delivery'}</span>
            `;
            routeType.onclick = () => openQuickVerification();
        } else {
            routeType.className = 'route-badge completed';
            routeType.innerHTML = 'Route Complete';
            routeType.onclick = null;
        }
    }
    
    updateRouteStats();
    displayStops();
}

function displayStops() {
    const stopsList = document.getElementById('stopsList');
    if (!stopsList || !state.activeRoute) return;
    
    updateParcelsInPossession();
    
    let html = '';
    
    // Add route efficiency badge if optimized
    if (state.activeRoute.isOptimized) {
        html += `
            <div class="route-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                <h3 style="margin: 0; color: white;">Optimized Route</h3>
                ${state.optimizationStats.savedDistance > 0 ? `
                    <span style="
                        background: linear-gradient(135deg, #9333EA, #7928CA);
                        color: white;
                        padding: 6px 12px;
                        border-radius: 20px;
                        font-size: 12px;
                        font-weight: 600;
                    ">
                        Saved ${state.optimizationStats.savedDistance.toFixed(1)}km
                    </span>
                ` : ''}
            </div>
        `;
    }
    
    if (state.parcelsInPossession.length > 0) {
        html += createParcelsInPossessionWidget();
    }
    
    // Display all stops in current order
    html += `<div class="stops-container">`;
    state.activeRoute.stops.forEach((stop, index) => {
        const orderNumber = state.stopOrderMap[stop.id] || (index + 1);
        html += createStopCard(stop, orderNumber, stop.type);
    });
    html += `</div>`;
    
    stopsList.innerHTML = html;
}

function createParcelsInPossessionWidget() {
    return `
        <div class="parcels-possession-widget" style="
            background: linear-gradient(135deg, rgba(255, 159, 10, 0.15), rgba(255, 107, 0, 0.1));
            border: 1px solid rgba(255, 159, 10, 0.3);
            border-radius: 16px;
            padding: 18px;
            margin-bottom: 20px;
        ">
            <div class="carrying-banner" style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
                <span class="carrying-icon">📦</span>
                <span style="font-weight: 700; color: white; font-size: 15px;">
                    Carrying ${state.parcelsInPossession.length} parcel${state.parcelsInPossession.length > 1 ? 's' : ''}
                </span>
            </div>
            <div class="parcel-cards" style="display: flex; flex-direction: column; gap: 10px;">
                ${state.parcelsInPossession.map(parcel => {
                    const deliveryStop = state.activeRoute.stops.find(s => 
                        s.type === 'delivery' && (s.parcelId === parcel.parcelId || s.parcelCode === parcel.parcelCode)
                    );
                    const paymentInfo = deliveryStop ? getPaymentInfoForStop(deliveryStop) : null;
                    
                    return `
                        <div class="parcel-card" style="
                            background: rgba(255, 255, 255, 0.05);
                            border-radius: 12px;
                            padding: 14px;
                            border-left: 3px solid #FF9F0A;
                        ">
                            <div style="font-weight: 700; margin-bottom: 4px; color: white; font-size: 15px;">
                                ${parcel.parcelCode}
                            </div>
                            <div style="font-size: 14px; color: rgba(255, 255, 255, 0.6); margin-bottom: 4px;">
                                ${parcel.destination}
                            </div>
                            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.4);">
                                Picked up ${formatTimeAgo(parcel.pickupTime)}
                            </div>
                            ${paymentInfo && paymentInfo.needsCollection ? `
                                <div style="margin-top: 8px; font-size: 14px; font-weight: 700; color: #FF9F0A;">
                                    💰 Collect: KES ${paymentInfo.amount.toLocaleString()}
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function updateParcelsInPossession() {
    state.parcelsInPossession = [];
    
    if (!state.activeRoute || !state.activeRoute.stops) return;
    
    state.activeRoute.stops.forEach(stop => {
        if (stop.type === 'pickup' && stop.completed) {
            const deliveryStop = state.activeRoute.stops.find(s => 
                s.type === 'delivery' && 
                (s.parcelId === stop.parcelId || s.parcelCode === stop.parcelCode)
            );
            
            if (deliveryStop && !deliveryStop.completed) {
                state.parcelsInPossession.push({
                    parcelId: stop.parcelId,
                    parcelCode: stop.parcelCode,
                    pickupTime: stop.timestamp,
                    destination: deliveryStop.address
                });
            }
        }
    });
}

function createStopCard(stop, number, type) {
    const isActive = isNextStop(stop);
    const canInteract = !stop.completed && canCompleteStop(stop);
    const paymentInfo = getPaymentInfoForStop(stop);
    const hasVerificationData = state.verificationData.photos[stop.id] || state.verificationData.signatures[stop.id];
    
    // Different fields for pickup vs delivery
    let customerName, customerPhone;
    if (type === 'pickup') {
        customerName = stop.vendor_name || stop.vendorName || stop.sender_name || stop.customerName || 'Vendor';
        customerPhone = stop.vendor_phone || stop.vendorPhone || stop.sender_phone || stop.customerPhone || '';
    } else {
        customerName = stop.recipient_name || stop.recipientName || stop.customer_name || stop.customerName || 'Recipient';
        customerPhone = stop.recipient_phone || stop.recipientPhone || stop.customer_phone || stop.customerPhone || '';
    }
    
    const address = stop.address || stop.location_address || 'Address not available';
    const parcelCode = stop.parcelCode || stop.parcel_code || stop.code || 'N/A';
    const instructions = stop.specialInstructions || stop.special_instructions || stop.instructions || '';
    
    return `
        <div class="stop-card ${stop.completed ? 'completed' : ''} ${isActive ? 'active' : ''}" 
             onclick="${canInteract ? `selectStop('${stop.id}')` : ''}"
             data-stop-id="${stop.id}"
             style="
                 background: ${stop.completed ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)'};
                 border: 1px solid ${stop.completed ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'};
                 border-radius: 16px;
                 padding: 16px;
                 margin-bottom: 12px;
                 cursor: ${canInteract ? 'pointer' : 'default'};
                 transition: all 0.3s ease;
                 ${isActive ? 'border-color: #9333EA; box-shadow: 0 0 20px rgba(147, 51, 234, 0.3);' : ''}
             ">
            <div style="display: flex; gap: 16px;">
                <div class="stop-number-badge" style="
                    width: 44px;
                    height: 44px;
                    background: ${stop.completed ? '#2C2C2E' : type === 'pickup' ? '#FF9F0A' : '#007AFF'};
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 800;
                    font-size: 18px;
                    color: ${stop.completed ? '#8E8E93' : 'white'};
                    flex-shrink: 0;
                ">
                    ${stop.completed ? '✓' : number}
                </div>
                <div style="flex: 1;">
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; color: white; font-weight: 600;">
                        ${address}
                    </h3>
                    <div style="display: flex; flex-direction: column; gap: 6px; font-size: 14px;">
                        <div style="color: rgba(255,255,255,0.7);">
                            <span>👤 ${customerName}</span>
                            ${customerPhone ? ` • ${customerPhone}` : ''}
                        </div>
                        <div style="color: rgba(255,255,255,0.6);">
                            📋 Code: ${parcelCode}
                        </div>
                        ${instructions ? `
                            <div style="color: rgba(255,255,255,0.6); font-style: italic;">
                                💬 ${instructions}
                            </div>
                        ` : ''}
                    </div>
                    
                    ${type === 'delivery' && paymentInfo.needsCollection ? `
                        <div style="
                            margin-top: 10px;
                            padding: 8px 12px;
                            background: ${stop.completed ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 159, 10, 0.15)'};
                            border: 1px solid ${stop.completed ? 'rgba(52, 199, 89, 0.3)' : 'rgba(255, 159, 10, 0.3)'};
                            border-radius: 8px;
                            font-weight: 600;
                            color: ${stop.completed ? '#34C759' : '#FF9F0A'};
                        ">
                            💵 ${stop.completed ? 'Collected' : 'COLLECT'}: KES ${paymentInfo.amount.toLocaleString()}
                        </div>
                    ` : type === 'delivery' && paymentInfo.method === 'online' ? `
                        <div style="
                            margin-top: 10px;
                            padding: 8px 12px;
                            background: rgba(52, 199, 89, 0.1);
                            border: 1px solid rgba(52, 199, 89, 0.3);
                            border-radius: 8px;
                            color: #34C759;
                            font-weight: 600;
                        ">
                            ✅ Already Paid Online
                        </div>
                    ` : ''}
                    
                    ${stop.completed ? `
                        <div style="margin-top: 10px; color: #34C759; font-size: 13px; font-weight: 600;">
                            ✓ Completed ${formatTimeAgo(stop.timestamp)}
                            ${hasVerificationData ? `
                                <span style="margin-left: 10px; color: #9333EA;">
                                    📷 ✍️ Verified
                                </span>
                            ` : ''}
                        </div>
                    ` : isActive ? `
                        <div style="margin-top: 10px; color: #9333EA; font-size: 13px; font-weight: 600;">
                            → Current Stop
                        </div>
                    ` : ''}
                </div>
                ${!stop.completed && canInteract ? `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <button onclick="event.stopPropagation(); navigateToStop('${stop.id}')" style="
                            background: rgba(255,255,255,0.1);
                            border: none;
                            border-radius: 10px;
                            width: 40px;
                            height: 40px;
                            cursor: pointer;
                            font-size: 20px;
                        ">🧭</button>
                        ${customerPhone ? `
                            <a href="tel:${customerPhone}" onclick="event.stopPropagation();" style="
                                background: rgba(255,255,255,0.1);
                                border: none;
                                border-radius: 10px;
                                width: 40px;
                                height: 40px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                text-decoration: none;
                                font-size: 20px;
                            ">📞</a>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function createStopPopup(stop) {
    const type = stop.type;
    const paymentInfo = getPaymentInfoForStop(stop);
    const orderNumber = state.stopOrderMap[stop.id] || '';
    const showOrderNumber = state.activeRoute?.isOptimized && orderNumber;
    
    // Different fields for pickup vs delivery
    let customerName, customerPhone;
    if (type === 'pickup') {
        customerName = stop.vendor_name || stop.vendorName || stop.sender_name || stop.customerName || 'Vendor';
        customerPhone = stop.vendor_phone || stop.vendorPhone || stop.sender_phone || stop.customerPhone || '';
    } else {
        customerName = stop.recipient_name || stop.recipientName || stop.customer_name || stop.customerName || 'Recipient';
        customerPhone = stop.recipient_phone || stop.recipientPhone || stop.customer_phone || stop.customerPhone || '';
    }
    
    const address = stop.address || stop.location_address || 'Address not available';
    const parcelCode = stop.parcelCode || stop.parcel_code || stop.code || 'N/A';
    const instructions = stop.specialInstructions || stop.special_instructions || stop.instructions || '';
    
    return `
        <div class="stop-popup">
            <div class="popup-header ${type}" style="
                padding: 18px 22px;
                margin: 0;
                font-weight: 700;
                font-size: 14px;
                letter-spacing: 1px;
                text-transform: uppercase;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: ${type === 'pickup' ? 'linear-gradient(135deg, #FF9F0A 0%, #FF6000 100%)' : 'linear-gradient(135deg, #007AFF 0%, #0051D5 100%)'};
                color: ${type === 'pickup' ? '#000000' : 'white'};
            ">
                ${showOrderNumber ? `
                    <div style="
                        position: absolute;
                        left: 20px;
                        top: 50%;
                        transform: translateY(-50%);
                        width: 36px;
                        height: 36px;
                        background: rgba(0, 0, 0, 0.25);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 18px;
                        font-weight: 800;
                        border: 2px solid rgba(255, 255, 255, 0.3);
                    ">${orderNumber}</div>
                    <span style="margin-left: 50px;">${type.toUpperCase()}</span>
                ` : `<span>${type.toUpperCase()}</span>`}
                <span style="
                    background: rgba(0, 0, 0, 0.2);
                    padding: 5px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                ">${parcelCode}</span>
            </div>
            <div class="popup-body" style="padding: 22px; background: transparent;">
                <h3 style="margin: 0 0 18px 0; font-size: 18px; font-weight: 600; color: white;">${address}</h3>
                <div class="popup-info" style="display: flex; flex-direction: column; gap: 14px;">
                    <div class="info-row" style="display: flex; align-items: flex-start; gap: 12px; padding: 10px; background: rgba(255, 255, 255, 0.03); border-radius: 10px;">
                        <span class="info-icon" style="width: 24px; font-size: 18px;">👤</span>
                        <span style="color: rgba(255, 255, 255, 0.9);">${customerName}</span>
                    </div>
                    ${customerPhone ? `
                        <div class="info-row" style="display: flex; align-items: flex-start; gap: 12px; padding: 10px; background: rgba(255, 255, 255, 0.03); border-radius: 10px;">
                            <span class="info-icon" style="width: 24px; font-size: 18px;">📞</span>
                            <a href="tel:${customerPhone}" style="color: #007AFF; text-decoration: none; font-weight: 600;">${customerPhone}</a>
                        </div>
                    ` : ''}
                    ${instructions ? `
                        <div class="info-row instructions" style="display: flex; align-items: flex-start; gap: 12px; padding: 10px; background: rgba(147, 51, 234, 0.1); border: 1px solid rgba(147, 51, 234, 0.2); border-radius: 10px;">
                            <span class="info-icon" style="width: 24px; font-size: 18px;">💬</span>
                            <span style="color: rgba(255, 255, 255, 0.9);">${instructions}</span>
                        </div>
                    ` : ''}
                    ${paymentInfo.needsCollection ? `
                        <div class="info-row payment" style="display: flex; align-items: flex-start; gap: 12px; padding: 14px; background: linear-gradient(135deg, rgba(255, 159, 10, 0.15), rgba(255, 107, 0, 0.1)); border: 1px solid rgba(255, 159, 10, 0.3); border-radius: 10px; margin-top: 12px;">
                            <span class="info-icon" style="width: 24px; font-size: 18px;">💰</span>
                            <span style="font-weight: 700; color: #FF9F0A;">
                                Collect: KES ${paymentInfo.amount.toLocaleString()}
                            </span>
                        </div>
                    ` : paymentInfo.method === 'online' ? `
                        <div class="info-row payment" style="display: flex; align-items: flex-start; gap: 12px; padding: 14px; background: rgba(52, 199, 89, 0.1); border: 1px solid rgba(52, 199, 89, 0.3); border-radius: 10px;">
                            <span class="info-icon" style="width: 24px; font-size: 18px;">✅</span>
                            <span style="color: #34C759; font-weight: 600;">Already Paid Online</span>
                        </div>
                    ` : ''}
                </div>
                ${!stop.completed && canCompleteStop(stop) ? `
                    <div class="popup-actions" style="display: flex; gap: 10px; margin-top: 22px; padding-top: 22px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                        <button onclick="openEnhancedVerificationModal('${stop.id}')" style="
                            flex: 1;
                            padding: 14px 18px;
                            border: none;
                            border-radius: 14px;
                            font-size: 14px;
                            font-weight: 600;
                            cursor: pointer;
                            background: linear-gradient(135deg, #34C759, #30D158);
                            color: white;
                            box-shadow: 0 4px 12px rgba(52, 199, 89, 0.3);
                        ">
                            <span>✓ Verify ${stop.type}</span>
                        </button>
                        <button onclick="navigateToStop('${stop.id}')" style="
                            padding: 14px 18px;
                            border: none;
                            border-radius: 14px;
                            font-size: 14px;
                            font-weight: 600;
                            cursor: pointer;
                            background: rgba(255, 255, 255, 0.08);
                            color: white;
                            border: 1px solid rgba(255, 255, 255, 0.15);
                        ">
                            <span>🧭 Navigate</span>
                        </button>
                    </div>
                ` : stop.completed ? `
                    <div style="margin-top: 18px; padding: 14px; background: linear-gradient(135deg, rgba(52, 199, 89, 0.15), rgba(48, 209, 88, 0.1)); border: 1px solid rgba(52, 199, 89, 0.3); border-radius: 14px; text-align: center; color: #34C759; font-weight: 600; font-size: 14px;">
                        <span>✓ Completed ${formatTimeAgo(stop.timestamp)}</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// ============================================================================
// ENHANCED VERIFICATION & COMPLETION FUNCTIONS
// ============================================================================

window.openQuickVerification = function() {
    const nextStop = getNextStop();
    if (nextStop) {
        openEnhancedVerificationModal(nextStop.id);
    }
};

window.openEnhancedVerificationModal = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop || stop.completed) return;
    
    const paymentInfo = getPaymentInfoForStop(stop);
    
    // Initialize verification session
    state.currentVerification = {
        stopId: stopId,
        type: stop.type,
        photoData: null,
        signatureData: null,
        locationData: state.currentLocation,
        startTime: new Date()
    };
    
    const modal = document.createElement('div');
    modal.className = 'verification-modal-enhanced';
    modal.id = 'verificationModal';
    
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeVerificationModal()" style="
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(10, 10, 11, 0.9);
            backdrop-filter: blur(20px);
        "></div>
        <div class="modal-content" style="
            position: relative;
            background: linear-gradient(135deg, #1C1C1F, #2C2C2E);
            border-radius: 24px;
            max-width: 480px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            z-index: 1;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
        ">
            <!-- Verification Steps -->
            <div class="verification-steps">
                <div class="verification-step active" data-step="1">
                    <div class="step-circle">📸</div>
                    <div class="step-label">Photo</div>
                </div>
                <div class="verification-step" data-step="2">
                    <div class="step-circle">🔑</div>
                    <div class="step-label">Code</div>
                </div>
                ${stop.type === 'delivery' ? `
                    <div class="verification-step" data-step="3">
                        <div class="step-circle">✍️</div>
                        <div class="step-label">Signature</div>
                    </div>
                    <div class="verification-step" data-step="4">
                        <div class="step-circle">💰</div>
                        <div class="step-label">Payment</div>
                    </div>
                ` : ''}
            </div>
            
            <!-- Progress Bar -->
            <div class="verification-progress">
                <div class="verification-progress-bar" style="width: 25%;"></div>
            </div>
            
            <!-- Modal Header -->
            <div class="modal-header" style="
                padding: 20px 24px;
                background: ${stop.type === 'pickup' ? 'linear-gradient(135deg, #FF9F0A, #FF6B00)' : 'linear-gradient(135deg, #34C759, #30D158)'};
                color: ${stop.type === 'pickup' ? '#0A0A0B' : 'white'};
                display: flex;
                align-items: center;
                gap: 12px;
            ">
                <span style="font-size: 24px;">${stop.type === 'pickup' ? '📦' : '📍'}</span>
                <h2 style="margin: 0; font-size: 20px; font-weight: 700;">
                    Enhanced ${stop.type === 'pickup' ? 'Pickup' : 'Delivery'} Verification
                </h2>
            </div>
            
            <!-- Modal Body -->
            <div class="modal-body" style="padding: 24px;">
                <!-- Step 1: Photo Capture -->
                <div id="step1" class="verification-step-content">
                    <h3 style="color: white; margin-bottom: 16px;">Step 1: Capture Package Photo</h3>
                    <p style="color: rgba(255, 255, 255, 0.6); margin-bottom: 20px;">
                        Take a clear photo of the package ${stop.type === 'pickup' ? 'being picked up' : 'at delivery location'}
                    </p>
                    <div id="photoContainer">
                        <button onclick="startPhotoCapture()" style="
                            width: 100%;
                            padding: 18px;
                            background: linear-gradient(135deg, #9333EA, #7928CA);
                            border: none;
                            border-radius: 14px;
                            color: white;
                            font-size: 16px;
                            font-weight: 600;
                            cursor: pointer;
                        ">
                            📸 Take Photo
                        </button>
                    </div>
                </div>
                
                <!-- Step 2: Verification Code -->
                <div id="step2" class="verification-step-content" style="display: none;">
                    <h3 style="color: white; margin-bottom: 16px;">Step 2: Verification Code</h3>
                    <div class="stop-summary" style="margin-bottom: 20px;">
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <div style="display: flex; gap: 12px; font-size: 15px;">
                                <span style="color: rgba(255, 255, 255, 0.5); min-width: 90px;">Location:</span>
                                <span style="color: white; font-weight: 600;">${stop.address}</span>
                            </div>
                            <div style="display: flex; gap: 12px; font-size: 15px;">
                                <span style="color: rgba(255, 255, 255, 0.5); min-width: 90px;">Customer:</span>
                                <span style="color: white; font-weight: 600;">
                                    ${stop.customerName || stop.vendor_name || stop.recipient_name || 'N/A'}
                                </span>
                            </div>
                            <div style="display: flex; gap: 12px; font-size: 15px;">
                                <span style="color: rgba(255, 255, 255, 0.5); min-width: 90px;">Parcel:</span>
                                <span style="color: white; font-weight: 600;">${stop.parcelCode || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <label style="font-weight: 600; font-size: 15px; color: white; display: block; margin-bottom: 12px;">
                        Enter ${stop.type} verification code:
                    </label>
                    <input type="text" 
                           id="verificationCode" 
                           placeholder="XXX-XXXX"
                           maxlength="8"
                           autocomplete="off"
                           style="
                               width: 100%;
                               background: rgba(255, 255, 255, 0.05);
                               border: 2px solid rgba(255, 255, 255, 0.2);
                               border-radius: 14px;
                               padding: 18px;
                               font-size: 26px;
                               font-weight: 700;
                               text-align: center;
                               color: white;
                               letter-spacing: 5px;
                               text-transform: uppercase;
                               outline: none;
                               transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                               margin: 12px 0;
                           ">
                    <p style="font-size: 13px; color: rgba(255, 255, 255, 0.5); text-align: center; margin-top: 8px;">
                        Ask the ${stop.type === 'pickup' ? 'sender' : 'recipient'} for their code
                    </p>
                </div>
                
                ${stop.type === 'delivery' ? `
                    <!-- Step 3: Digital Signature -->
                    <div id="step3" class="verification-step-content" style="display: none;">
                        <h3 style="color: white; margin-bottom: 16px;">Step 3: Customer Signature</h3>
                        <p style="color: rgba(255, 255, 255, 0.6); margin-bottom: 20px;">
                            Please ask the recipient to sign below
                        </p>
                        <div id="signatureContainer">
                            <button onclick="startSignatureCapture()" style="
                                width: 100%;
                                padding: 18px;
                                background: linear-gradient(135deg, #9333EA, #7928CA);
                                border: none;
                                border-radius: 14px;
                                color: white;
                                font-size: 16px;
                                font-weight: 600;
                                cursor: pointer;
                            ">
                                ✍️ Collect Signature
                            </button>
                        </div>
                    </div>
                    
                    <!-- Step 4: Payment -->
                    <div id="step4" class="verification-step-content" style="display: none;">
                        <h3 style="color: white; margin-bottom: 16px;">Step 4: Payment Collection</h3>
                        ${paymentInfo.needsCollection ? `
                            <div style="
                                padding: 20px;
                                background: linear-gradient(135deg, rgba(255, 159, 10, 0.15), rgba(255, 107, 0, 0.1));
                                border: 1px solid rgba(255, 159, 10, 0.3);
                                border-radius: 14px;
                                margin-bottom: 20px;
                            ">
                                <div style="text-align: center;">
                                    <div style="font-size: 14px; color: rgba(255, 255, 255, 0.7); margin-bottom: 8px;">
                                        Amount to Collect
                                    </div>
                                    <div style="font-size: 32px; font-weight: 800; color: #FF9F0A;">
                                        KES ${paymentInfo.amount.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                <button onclick="promptMpesaPaymentForStop('${stop.id}')" style="
                                    padding: 18px;
                                    background: linear-gradient(135deg, #34C759, #30D158);
                                    border: none;
                                    border-radius: 14px;
                                    color: white;
                                    font-size: 16px;
                                    font-weight: 600;
                                    cursor: pointer;
                                ">
                                    📱 M-Pesa Payment
                                </button>
                                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 14px; background: rgba(255, 255, 255, 0.05); border-radius: 12px;">
                                    <input type="checkbox" id="cashCollected" style="width: 22px; height: 22px; cursor: pointer;">
                                    <span style="font-size: 15px; color: white; font-weight: 600;">
                                        I have collected KES ${paymentInfo.amount.toLocaleString()} cash
                                    </span>
                                </label>
                            </div>
                        ` : `
                            <div style="
                                padding: 20px;
                                background: rgba(52, 199, 89, 0.1);
                                border: 1px solid rgba(52, 199, 89, 0.3);
                                border-radius: 14px;
                                text-align: center;
                            ">
                                <span style="font-size: 24px;">✅</span>
                                <p style="color: #34C759; font-weight: 600; margin-top: 10px;">
                                    Payment already received online
                                </p>
                            </div>
                        `}
                    </div>
                ` : ''}
                
                <!-- Navigation Buttons -->
                <div class="modal-actions" style="display: flex; gap: 12px; margin-top: 24px;">
                    <button id="prevBtn" onclick="previousVerificationStep()" style="
                        padding: 18px 24px;
                        border: none;
                        border-radius: 14px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        background: rgba(255, 255, 255, 0.1);
                        color: white;
                        display: none;
                    ">
                        ← Back
                    </button>
                    <button id="nextBtn" onclick="nextVerificationStep()" style="
                        flex: 1;
                        padding: 18px;
                        border: none;
                        border-radius: 14px;
                        font-size: 16px;
                        font-weight: 700;
                        cursor: pointer;
                        background: linear-gradient(135deg, #0066FF, #0052CC);
                        color: white;
                        display: none;
                    ">
                        Continue →
                    </button>
                    <button id="completeBtn" onclick="completeEnhancedVerification('${stop.id}')" style="
                        flex: 1;
                        padding: 18px;
                        border: none;
                        border-radius: 14px;
                        font-size: 16px;
                        font-weight: 700;
                        cursor: pointer;
                        background: linear-gradient(135deg, #34C759, #30D158);
                        color: white;
                        display: none;
                    ">
                        ✓ Complete Verification
                    </button>
                    <button onclick="closeVerificationModal()" style="
                        padding: 18px 24px;
                        border: none;
                        border-radius: 14px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        background: rgba(255, 255, 255, 0.1);
                        color: white;
                    ">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Initialize first step
    setTimeout(() => {
        updateVerificationStep(0, 'active');
    }, 100);
};

// Enhanced verification step navigation
let currentVerificationStep = 1;
const totalVerificationSteps = 4;

window.nextVerificationStep = function() {
    const stop = state.activeRoute.stops.find(s => s.id === state.currentVerification.stopId);
    const maxSteps = stop.type === 'delivery' ? 4 : 2;
    
    if (currentVerificationStep < maxSteps) {
        // Hide current step
        document.getElementById(`step${currentVerificationStep}`).style.display = 'none';
        currentVerificationStep++;
        // Show next step
        document.getElementById(`step${currentVerificationStep}`).style.display = 'block';
        
        updateVerificationStep(currentVerificationStep - 1, 'completed');
        showVerificationProgress(currentVerificationStep, maxSteps);
        
        // Update buttons
        document.getElementById('prevBtn').style.display = 'block';
        if (currentVerificationStep === maxSteps) {
            document.getElementById('nextBtn').style.display = 'none';
            document.getElementById('completeBtn').style.display = 'block';
        }
        
        // Focus on code input if on step 2
        if (currentVerificationStep === 2) {
            document.getElementById('verificationCode').focus();
        }
    }
};

window.previousVerificationStep = function() {
    if (currentVerificationStep > 1) {
        // Hide current step
        document.getElementById(`step${currentVerificationStep}`).style.display = 'none';
        currentVerificationStep--;
        // Show previous step
        document.getElementById(`step${currentVerificationStep}`).style.display = 'block';
        
        updateVerificationStep(currentVerificationStep - 1, 'active');
        const stop = state.activeRoute.stops.find(s => s.id === state.currentVerification.stopId);
        const maxSteps = stop.type === 'delivery' ? 4 : 2;
        showVerificationProgress(currentVerificationStep, maxSteps);
        
        // Update buttons
        if (currentVerificationStep === 1) {
            document.getElementById('prevBtn').style.display = 'none';
        }
        document.getElementById('nextBtn').style.display = 'block';
        document.getElementById('completeBtn').style.display = 'none';
    }
};

window.startPhotoCapture = function() {
    showCameraUI((photoData) => {
        state.currentVerification.photoData = photoData;
        
        // Update UI to show captured photo
        const container = document.getElementById('photoContainer');
        container.innerHTML = `
            <img src="${photoData}" class="photo-preview" alt="Package photo">
            <button onclick="startPhotoCapture()" style="
                width: 100%;
                margin-top: 10px;
                padding: 12px;
                background: rgba(255, 255, 255, 0.1);
                border: none;
                border-radius: 10px;
                color: white;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            ">
                Retake Photo
            </button>
        `;
        
        // Enable next button
        document.getElementById('nextBtn').style.display = 'block';
    });
};

window.startSignatureCapture = function() {
    showSignaturePad((signatureData) => {
        state.currentVerification.signatureData = signatureData;
        
        // Update UI to show captured signature
        const container = document.getElementById('signatureContainer');
        container.innerHTML = `
            <img src="${signatureData}" style="
                width: 100%;
                height: 150px;
                object-fit: contain;
                background: white;
                border-radius: 12px;
                padding: 10px;
            " alt="Customer signature">
            <button onclick="startSignatureCapture()" style="
                width: 100%;
                margin-top: 10px;
                padding: 12px;
                background: rgba(255, 255, 255, 0.1);
                border: none;
                border-radius: 10px;
                color: white;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            ">
                Redo Signature
            </button>
        `;
        
        // Enable next button
        document.getElementById('nextBtn').style.display = 'block';
    });
};

window.promptMpesaPaymentForStop = async function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    const paymentInfo = getPaymentInfoForStop(stop);
    const customerPhone = stop.recipient_phone || stop.customer_phone || '';
    
    const result = await promptMpesaPayment(paymentInfo.amount, customerPhone);
    
    if (result.success) {
        state.currentVerification.mpesaCode = result.code;
        state.verificationData.mpesaCodes[stopId] = result.code;
        
        showNotification('M-Pesa payment confirmed', 'success');
        
        // Update UI
        const checkbox = document.getElementById('cashCollected');
        if (checkbox) {
            checkbox.checked = true;
            checkbox.disabled = true;
        }
    } else if (result.method === 'cash') {
        showNotification('Please collect cash payment', 'info');
    }
};

window.completeEnhancedVerification = async function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop) return;
    
    const codeInput = document.getElementById('verificationCode');
    const code = codeInput?.value?.toUpperCase().replace(/[^A-Z0-9]/g, '') || '';
    const paymentInfo = getPaymentInfoForStop(stop);
    
    // Validate verification code
    const isValidCode = DEV_CONFIG.isDevelopment ? 
        code.length >= 6 : 
        code === stop.verificationCode?.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    if (!isValidCode) {
        showNotification('Invalid verification code', 'error');
        return;
    }
    
    // Validate photo (if required)
    if (config.verification.requirePhoto && !DEV_CONFIG.skipPhotoCapture && !state.currentVerification.photoData) {
        showNotification('Please capture a photo of the package', 'warning');
        return;
    }
    
    // Validate signature for deliveries (if required)
    if (stop.type === 'delivery' && config.verification.requireSignature && 
        !DEV_CONFIG.skipSignature && !state.currentVerification.signatureData) {
        showNotification('Please collect customer signature', 'warning');
        return;
    }
    
    // Validate payment for deliveries
    if (stop.type === 'delivery' && paymentInfo.needsCollection) {
        const paymentCheckbox = document.getElementById('cashCollected');
        if (!paymentCheckbox?.checked && !state.currentVerification.mpesaCode) {
            showNotification('Please confirm payment collection', 'warning');
            return;
        }
    }
    
    // Store verification data
    state.verificationData.photos[stopId] = {
        [stop.type]: state.currentVerification.photoData
    };
    state.verificationData.signatures[stopId] = state.currentVerification.signatureData;
    state.verificationData.timestamps[stopId] = {
        [stop.type]: new Date().toISOString()
    };
    state.verificationData.locations[stopId] = {
        [stop.type]: state.currentVerification.locationData
    };
    
    // Mark stop as completed
    stop.completed = true;
    stop.timestamp = new Date();
    stop.verificationCode = code;
    
    // Handle payment tracking
    if (stop.type === 'delivery' && paymentInfo.needsCollection) {
        state.paymentsByStop[stopId] = {
            collected: true,
            amount: paymentInfo.amount,
            timestamp: stop.timestamp,
            method: state.currentVerification.mpesaCode ? 'mpesa' : 'cash',
            mpesaCode: state.currentVerification.mpesaCode
        };
        updateCashCollectionWidget();
    }
    
    // Store verification data in Supabase
    await storeVerificationData(stopId, stop.type, {
        code: code,
        photoUrl: state.currentVerification.photoData,
        signatureData: state.currentVerification.signatureData,
        location: state.currentVerification.locationData,
        mpesaCode: state.currentVerification.mpesaCode,
        cashCollected: paymentInfo.needsCollection
    });
    
    // Sync route data
    await syncRouteData();
    
    // Close modal
    closeVerificationModal();
    
    // Show success animation
    showSuccessAnimation(stop.type);
    
    // Update UI
    displayRouteInfo();
    plotRoute();
    drawOptimizedRoute();
    
    // Check if route is complete
    if (state.activeRoute.stops.every(s => s.completed)) {
        await completeRoute();
    }
    
    // Reset verification step counter
    currentVerificationStep = 1;
};

window.closeVerificationModal = function() {
    const modal = document.querySelector('.verification-modal-enhanced');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 300);
    }
    currentVerificationStep = 1;
    
    // Clear current verification session
    state.currentVerification = {
        stopId: null,
        type: null,
        photoData: null,
        signatureData: null,
        locationData: null,
        startTime: null
    };
};

function showSuccessAnimation(type) {
    const animation = document.createElement('div');
    animation.className = 'success-animation';
    animation.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #1C1C1F, #2C2C2E);
        border-radius: 24px;
        padding: 48px;
        text-align: center;
        z-index: 3000;
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
        animation: popIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        border: 1px solid rgba(255, 255, 255, 0.1);
    `;
    animation.innerHTML = `
        <div style="
            width: 84px;
            height: 84px;
            background: linear-gradient(135deg, #34C759, #30D158);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            font-size: 48px;
            color: white;
            box-shadow: 0 8px 30px rgba(52, 199, 89, 0.4);
        ">✓</div>
        <div style="
            font-size: 26px;
            font-weight: 800;
            color: white;
            letter-spacing: -0.5px;
        ">${type === 'pickup' ? 'Pickup' : 'Delivery'} Verified!</div>
        <div style="
            font-size: 14px;
            color: rgba(255, 255, 255, 0.6);
            margin-top: 10px;
        ">
            📷 Photo captured • ✍️ Signature collected
        </div>
    `;
    
    document.body.appendChild(animation);
    setTimeout(() => animation.remove(), 2500);
}

async function completeRoute() {
    console.log('Completing route with enhanced verification data...');
    
    await handleRouteCompletion();
    
    const animation = document.createElement('div');
    animation.className = 'route-complete-animation';
    animation.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #1C1C1F, #2C2C2E);
        border-radius: 24px;
        padding: 48px;
        text-align: center;
        z-index: 3000;
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
        animation: popIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        border: 1px solid rgba(255, 255, 255, 0.1);
        max-width: 420px;
    `;
    animation.innerHTML = `
        <div class="route-complete-content">
            <div style="font-size: 72px; margin-bottom: 24px;">🏆</div>
            <h1 style="font-size: 32px; font-weight: 800; margin-bottom: 14px; letter-spacing: -1px; color: white;">
                Route Complete!
            </h1>
            <p style="font-size: 16px; color: rgba(255, 255, 255, 0.6); margin-bottom: 28px; font-weight: 500;">
                All deliveries verified and completed successfully.
            </p>
            <div style="display: flex; justify-content: center; gap: 40px; margin-bottom: 36px;">
                <div style="text-align: center;">
                    <span style="display: block; font-size: 36px; font-weight: 800; color: #9333EA; margin-bottom: 6px;">
                        ${state.activeRoute.stops.length}
                    </span>
                    <span style="font-size: 13px; color: rgba(255, 255, 255, 0.5); text-transform: uppercase;">
                        Stops
                    </span>
                </div>
                <div style="text-align: center;">
                    <span style="display: block; font-size: 36px; font-weight: 800; color: #9333EA; margin-bottom: 6px;">
                        KES ${Math.round(state.totalRouteEarnings)}
                    </span>
                    <span style="font-size: 13px; color: rgba(255, 255, 255, 0.5); text-transform: uppercase;">
                        Earned
                    </span>
                </div>
            </div>
            ${state.optimizationStats.savedDistance > 0 ? `
                <div style="margin-bottom: 24px; padding: 14px; background: rgba(147, 51, 234, 0.1); border-radius: 12px;">
                    <p style="margin: 0; color: #9333EA; font-weight: 600;">
                        Route optimization saved ${state.optimizationStats.savedDistance.toFixed(1)}km (${state.optimizationStats.savedPercentage}%)
                    </p>
                </div>
            ` : ''}
            <button onclick="finishRoute()" style="
                width: 100%;
                background: linear-gradient(135deg, #9333EA, #7928CA);
                color: white;
                border: none;
                border-radius: 16px;
                padding: 18px;
                font-size: 17px;
                font-weight: 700;
                cursor: pointer;
            ">
                Back to Dashboard
            </button>
        </div>
    `;
    
    document.body.appendChild(animation);
}

window.finishRoute = function() {
    window.location.href = './rider.html';
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getNextStop() {
    if (!state.activeRoute || !state.activeRoute.stops) return null;
    return state.activeRoute.stops.find(stop => !stop.completed);
}

function getCurrentStop() {
    if (!state.activeRoute) return null;
    
    const completedStops = state.activeRoute.stops.filter(s => s.completed);
    if (completedStops.length === 0) return null;
    
    return completedStops[completedStops.length - 1];
}

function isNextStop(stop) {
    const nextStop = getNextStop();
    return nextStop && nextStop.id === stop.id;
}

function canCompleteStop(stop) {
    if (stop.type === 'pickup') return true;
    return canCompleteDelivery(stop);
}

function canCompleteDelivery(deliveryStop) {
    if (!state.activeRoute || !state.activeRoute.stops) return false;
    
    const pickupStop = state.activeRoute.stops.find(s => 
        s.type === 'pickup' && 
        (s.parcelId === deliveryStop.parcelId || s.parcelCode === deliveryStop.parcelCode)
    );
    
    return pickupStop && pickupStop.completed;
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const minutes = Math.floor((Date.now() - new Date(timestamp)) / 60000);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
}

function updateRouteStats() {
    const remainingStops = state.activeRoute.stops.filter(s => !s.completed).length;
    
    let totalDistance = 0;
    if (state.activeRoute.distance) {
        totalDistance = parseFloat(state.activeRoute.distance);
    } else if (state.activeRoute.total_distance) {
        totalDistance = parseFloat(state.activeRoute.total_distance);
    } else {
        totalDistance = calculateTotalRouteDistance(state.activeRoute.stops);
    }
    
    const estimatedTime = Math.round(totalDistance * 2.5 + remainingStops * 5);
    
    const remainingEl = document.getElementById('remainingStops');
    const distanceEl = document.getElementById('totalDistance');
    const timeEl = document.getElementById('estimatedTime');
    
    if (remainingEl) remainingEl.textContent = remainingStops;
    if (distanceEl) distanceEl.textContent = totalDistance.toFixed(1);
    if (timeEl) timeEl.textContent = estimatedTime;
}

function updateDynamicHeader() {
    const routeTitle = document.getElementById('routeTitle');
    if (!routeTitle || !state.activeRoute) return;
    
    const nextStop = getNextStop();
    const currentStop = getCurrentStop();
    
    if (!nextStop) {
        routeTitle.textContent = 'Route Complete';
        return;
    }
    
    let headerText = '';
    
    if (currentStop && state.currentLocation) {
        headerText = `Your Location → ${getStopShortName(nextStop)}`;
    } else if (currentStop) {
        headerText = `${getStopShortName(currentStop)} → ${getStopShortName(nextStop)}`;
    } else {
        const firstStop = state.activeRoute.stops[0];
        headerText = `Starting → ${getStopShortName(firstStop)}`;
    }
    
    routeTitle.textContent = headerText;
}

function getStopShortName(stop) {
    if (!stop) return '';
    
    const address = stop.address;
    const patterns = [
        /^([^,]+),/,
        /^(.+?)(?:\s+Road|\s+Street|\s+Avenue|\s+Drive|\s+Centre|\s+Center)/i
    ];
    
    for (const pattern of patterns) {
        const match = address.match(pattern);
        if (match) {
            return match[1].trim();
        }
    }
    
    return address.length > 20 ? address.substring(0, 20) + '...' : address;
}

function updateNavigationInfo() {
    // Called during navigation to update real-time info
}

function initializeOptimizeButton() {
    setTimeout(() => {
        addOptimizeButton();
        
        if (state.activeRoute && state.activeRoute.isOptimized) {
            updateOptimizeButton(true);
        }
    }, 500);
}

// ============================================================================
// WINDOW FUNCTIONS
// ============================================================================

window.selectStop = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop || stop.completed) return;
    
    if (state.map) {
        state.map.setView([stop.location.lat, stop.location.lng], 16);
        
        const marker = state.markers.find(m => {
            const latLng = m.getLatLng();
            return latLng.lat === stop.location.lat && latLng.lng === stop.location.lng;
        });
        
        if (marker) {
            marker.openPopup();
        }
    }
};

window.goBack = function() {
    if (confirm('Are you sure you want to exit navigation?')) {
        window.location.href = './rider.html';
    }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Enhanced Route.js v5.0.0 initializing...');
    console.log('New features: Photo capture, Digital signatures, M-Pesa integration');
    
    injectNavigationStyles();
    
    await waitForLeaflet();
    
    try {
        const storedRoute = localStorage.getItem('tuma_active_route');
        
        if (storedRoute) {
            const routeData = JSON.parse(storedRoute);
            state.activeRoute = routeData;

            // Restore original route order if it was saved
            if (routeData.originalRouteOrder) {
                state.originalRouteOrder = routeData.originalRouteOrder;
                console.log('Restored original route from localStorage');
        
            // Restore verification data if exists
            if (routeData.verificationData) {
                state.verificationData = routeData.verificationData;
            }
            
            console.log('Route loaded:', state.activeRoute);
            console.log('Verification features enabled:', {
                photos: config.verification.requirePhoto,
                signatures: config.verification.requireSignature,
                location: config.verification.requireLocation,
                mpesa: true
            });
            
            updateStopOrderMap();
            calculateRouteFinancials();
            calculateCashCollection();
            
            await initializeMap();
            
            displayRouteInfo();
            updateDynamicHeader();
            
            await plotRoute();
            await drawOptimizedRoute();
            
            // Show UI elements
            const routePanel = document.getElementById('routePanel');
            const navControls = document.getElementById('navControls');
            const emptyState = document.getElementById('emptyState');
            
            if (routePanel) {
                routePanel.style.display = 'block';
                state.isPanelVisible = true;
            }
            
            if (navControls) {
                navControls.style.display = 'flex';
            }
            
            if (emptyState) {
                emptyState.style.display = 'none';
            }
            
            initializeOptimizeButton();
            
            if (state.totalCashToCollect > 0) {
                showCashCollectionWidget();
            }
            
            startLocationTracking();
            
            console.log('Enhanced route initialization complete');
        } else {
            console.log('No active route found');
            
            const routePanel = document.getElementById('routePanel');
            const navControls = document.getElementById('navControls');
            const emptyState = document.getElementById('emptyState');
            
            if (routePanel) routePanel.style.display = 'none';
            if (navControls) navControls.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
        }
});

// Debug utilities
window.routeDebug = {
    state,
    config,
    optimizer: routeOptimizer,
    testOptimization: () => {
        if (!state.activeRoute) {
            console.log('No route loaded');
            return;
        }
        
        const result = routeOptimizer.optimizeRoute(state.activeRoute.stops);
        const stats = routeOptimizer.getStatistics ? routeOptimizer.getStatistics() : {};
        
        console.log('Optimization result:', result);
        console.log('Statistics:', stats);
        return { optimizedRoute: result, statistics: stats };
    },
    getOptimizerConfig: () => routeOptimizer.getConfig ? routeOptimizer.getConfig() : {},
    updateOptimizerConfig: (newConfig) => routeOptimizer.updateConfig ? routeOptimizer.updateConfig(newConfig) : null,
    verificationData: state.verificationData,
    testCamera: () => startPhotoCapture(),
    testSignature: () => startSignatureCapture(),
    testMpesa: () => promptMpesaPayment(1000, '0712345678')
};
// ... all your existing code ...

// Export all necessary functions to window for HTML access
window.optimizeRouteStops = optimizeRouteStops;
window.undoOptimization = undoOptimization;
window.toggleNumberedMarkers = toggleNumberedMarkers;
window.updateOptimizerSetting = updateOptimizerSetting;
window.selectStop = selectStop;
window.goBack = goBack;
window.centerOnLocation = centerOnLocation;
window.toggleLocationTracking = toggleLocationTracking;
window.startNavigation = startNavigation;
window.navigateToStop = navigateToStop;
window.openQuickVerification = openQuickVerification;
window.openEnhancedVerificationModal = openEnhancedVerificationModal;
window.closeVerificationModal = closeVerificationModal;
window.completeEnhancedVerification = completeEnhancedVerification;
window.nextVerificationStep = nextVerificationStep;
window.previousVerificationStep = previousVerificationStep;
window.startPhotoCapture = startPhotoCapture;
window.startSignatureCapture = startSignatureCapture;
window.promptMpesaPaymentForStop = promptMpesaPaymentForStop;
window.finishRoute = finishRoute;

// Export helper functions for debugging
window.getNextStop = getNextStop;
window.proceedWithNavigation = proceedWithNavigation;
window.plotRoute = plotRoute;
window.stopLocationTracking = stopLocationTracking;

console.log('✅ Enhanced Route.js v5.0.0 loaded successfully');
console.log('Debug utilities available at: window.routeDebug');
console.log('Enhanced features: Photo capture, Digital signatures, M-Pesa payments');
