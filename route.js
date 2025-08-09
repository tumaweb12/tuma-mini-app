/**
 * Complete Enhanced Route Navigation Module with Dynamic Optimization and Simple POD
 * PART 1 OF 2 - Includes Route Optimizer and Core Functions
 */

// ============================================================================
// DYNAMIC ROUTE OPTIMIZER
// ============================================================================

const DynamicRouteOptimizer = {
    /**
     * Main optimization function using nearest neighbor with smart lookahead
     */
    optimizeRoute(parcels, currentLocation = null) {
        console.log('Starting dynamic route optimization for', parcels.length, 'parcels');
        
        const allStops = this.createAllStops(parcels);
        const proximityMatrix = this.buildProximityMatrix(allStops);
        const optimizedSequence = this.dynamicNearestNeighbor(
            allStops, 
            proximityMatrix, 
            currentLocation
        );
        const validatedSequence = this.validateSequence(optimizedSequence);
        return this.enrichSequence(validatedSequence);
    },
    
    createAllStops(parcels) {
        const stops = [];
        
        parcels.forEach(parcel => {
            const pickupLocation = this.parseLocation(parcel.pickup_coordinates || parcel.pickup_location);
            const deliveryLocation = this.parseLocation(parcel.delivery_coordinates || parcel.delivery_location);
            
            stops.push({
                id: `${parcel.id}-pickup`,
                parcelId: parcel.id,
                parcelCode: parcel.parcel_code,
                type: 'pickup',
                location: pickupLocation,
                address: this.extractAddress(pickupLocation, parcel),
                verificationCode: parcel.pickup_code,
                customerName: parcel.vendor_name || 'Vendor',
                customerPhone: parcel.vendor_phone || '',
                price: parseFloat(parcel.price || 0),
                completed: false,
                canComplete: true
            });
            
            stops.push({
                id: `${parcel.id}-delivery`,
                parcelId: parcel.id,
                parcelCode: parcel.parcel_code,
                type: 'delivery',
                location: deliveryLocation,
                address: this.extractAddress(deliveryLocation, parcel),
                verificationCode: parcel.delivery_code,
                customerName: parcel.recipient_name || 'Recipient',
                customerPhone: parcel.recipient_phone || '',
                price: parseFloat(parcel.price || 0),
                paymentMethod: parcel.payment_method || 'cash',
                paymentStatus: parcel.payment_status || 'pending',
                completed: false,
                canComplete: false,
                dependsOn: `${parcel.id}-pickup`
            });
        });
        
        return stops;
    },
    
    buildProximityMatrix(stops) {
        const matrix = {};
        
        stops.forEach((stop1, i) => {
            matrix[stop1.id] = {};
            stops.forEach((stop2, j) => {
                if (i !== j) {
                    matrix[stop1.id][stop2.id] = {
                        distance: this.calculateDistance(stop1.location, stop2.location),
                        sameParcel: stop1.parcelId === stop2.parcelId,
                        transition: `${stop1.type}-${stop2.type}`
                    };
                }
            });
        });
        
        return matrix;
    },
    
    dynamicNearestNeighbor(stops, matrix, startLocation) {
        const sequence = [];
        const visited = new Set();
        const pickedUp = new Set();
        
        let currentPos = startLocation || this.findNearestPickup(stops, null).location;
        
        while (visited.size < stops.length) {
            let bestNext = null;
            let bestScore = -Infinity;
            
            for (const stop of stops) {
                if (visited.has(stop.id)) continue;
                
                if (stop.type === 'delivery' && !pickedUp.has(stop.parcelId)) {
                    continue;
                }
                
                const score = this.calculateStopScore(
                    stop, 
                    currentPos, 
                    matrix, 
                    visited, 
                    pickedUp,
                    stops
                );
                
                if (score > bestScore) {
                    bestScore = score;
                    bestNext = stop;
                }
            }
            
            if (!bestNext) {
                console.warn('No valid next stop found, may have dependency issues');
                break;
            }
            
            sequence.push(bestNext);
            visited.add(bestNext.id);
            currentPos = bestNext.location;
            
            if (bestNext.type === 'pickup') {
                pickedUp.add(bestNext.parcelId);
                const delivery = stops.find(s => 
                    s.type === 'delivery' && s.parcelId === bestNext.parcelId
                );
                if (delivery) delivery.canComplete = true;
            }
        }
        
        return sequence;
    },
    
    calculateStopScore(stop, currentPos, matrix, visited, pickedUp, allStops) {
        const distance = this.calculateDistance(currentPos, stop.location);
        let score = 100 - (distance * 10);
        
        if (stop.type === 'delivery' && pickedUp.has(stop.parcelId)) {
            const pickupStop = allStops.find(s => 
                s.type === 'pickup' && s.parcelId === stop.parcelId
            );
            if (pickupStop && visited.has(pickupStop.id)) {
                const pairDistance = this.calculateDistance(pickupStop.location, stop.location);
                if (pairDistance < 3) {
                    score += 50;
                } else if (pairDistance < 5) {
                    score += 30;
                }
            }
        }
        
        const nearbyUnvisited = allStops.filter(s => 
            !visited.has(s.id) && 
            s.id !== stop.id &&
            (s.type === 'pickup' || pickedUp.has(s.parcelId)) &&
            this.calculateDistance(stop.location, s.location) < 2
        );
        
        if (nearbyUnvisited.length > 0) {
            score += nearbyUnvisited.length * 20;
            const sameTypeNearby = nearbyUnvisited.filter(s => s.type === stop.type);
            score += sameTypeNearby.length * 10;
        }
        
        if (stop.type === 'pickup') {
            const delivery = allStops.find(s => 
                s.type === 'delivery' && s.parcelId === stop.parcelId
            );
            if (delivery) {
                const pairDistance = this.calculateDistance(stop.location, delivery.location);
                const nearbyPickups = allStops.filter(s => 
                    s.type === 'pickup' && 
                    !visited.has(s.id) && 
                    s.id !== stop.id &&
                    this.calculateDistance(delivery.location, s.location) < 3
                );
                
                if (nearbyPickups.length > 0 && pairDistance > 5) {
                    score -= 20;
                }
            }
        }
        
        if (stop.type === 'delivery' && stop.paymentMethod === 'cash') {
            score += 5;
        }
        
        if (stop.serviceType === 'express') {
            score += 10;
        }
        
        return score;
    },
    
    validateSequence(sequence) {
        const validated = [];
        const completed = new Set();
        
        for (const stop of sequence) {
            if (stop.type === 'pickup') {
                validated.push(stop);
                completed.add(stop.parcelId);
            } else if (stop.type === 'delivery') {
                if (completed.has(stop.parcelId)) {
                    validated.push(stop);
                } else {
                    const pickup = sequence.find(s => 
                        s.type === 'pickup' && s.parcelId === stop.parcelId
                    );
                    if (pickup && !validated.includes(pickup)) {
                        validated.push(pickup);
                        completed.add(stop.parcelId);
                        validated.push(stop);
                    }
                }
            }
        }
        
        return validated;
    },
    
    enrichSequence(sequence) {
        let totalDistance = 0;
        let currentTime = 0;
        
        return sequence.map((stop, index) => {
            let segmentDistance = 0;
            if (index > 0) {
                segmentDistance = this.calculateDistance(
                    sequence[index - 1].location,
                    stop.location
                );
                totalDistance += segmentDistance;
            }
            
            currentTime += (segmentDistance / 20) * 60 + 3;
            
            let isEfficientPair = false;
            if (index > 0 && 
                sequence[index - 1].type === 'pickup' && 
                stop.type === 'delivery' && 
                sequence[index - 1].parcelId === stop.parcelId &&
                segmentDistance < 3) {
                isEfficientPair = true;
            }
            
            return {
                ...stop,
                sequenceNumber: index + 1,
                distanceFromPrevious: Math.round(segmentDistance * 100) / 100,
                totalDistanceSoFar: Math.round(totalDistance * 100) / 100,
                estimatedMinutes: Math.round(currentTime),
                estimatedArrival: this.formatTime(currentTime),
                isEfficientPair
            };
        });
    },
    
    parseLocation(locationData) {
        if (typeof locationData === 'string' && locationData.includes(',')) {
            const [lat, lng] = locationData.split(',').map(parseFloat);
            return { lat, lng };
        }
        
        if (typeof locationData === 'string') {
            try {
                return JSON.parse(locationData);
            } catch (e) {
                console.error('Error parsing location:', e);
            }
        }
        
        if (typeof locationData === 'object' && locationData) {
            return locationData;
        }
        
        return { lat: -1.2921, lng: 36.8219 };
    },
    
    extractAddress(location, parcel) {
        if (location.address) return location.address;
        if (parcel.pickup_address || parcel.delivery_address) {
            return parcel.pickup_address || parcel.delivery_address;
        }
        return 'Location';
    },
    
    findNearestPickup(stops, position) {
        const pickups = stops.filter(s => s.type === 'pickup');
        if (!position) return pickups[0];
        
        let nearest = pickups[0];
        let minDistance = Infinity;
        
        pickups.forEach(pickup => {
            const distance = this.calculateDistance(position, pickup.location);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = pickup;
            }
        });
        
        return nearest;
    },
    
    calculateDistance(point1, point2) {
        if (!point1 || !point2) return 999;
        
        const R = 6371;
        const dLat = (point2.lat - point1.lat) * Math.PI / 180;
        const dLon = (point2.lng - point1.lng) * Math.PI / 180;
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(point1.lat * Math.PI / 180) * 
                  Math.cos(point2.lat * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    },
    
    formatTime(minutes) {
        if (minutes < 60) {
            return `${Math.round(minutes)} min`;
        }
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        return `${hours}h ${mins}min`;
    },
    
    analyzeRoute(sequence) {
        const metrics = {
            totalStops: sequence.length,
            pickups: sequence.filter(s => s.type === 'pickup').length,
            deliveries: sequence.filter(s => s.type === 'delivery').length,
            totalDistance: 0,
            efficientPairs: 0,
            averageSegment: 0,
            maxSegment: 0,
            backtracking: 0,
            clusteringScore: 0
        };
        
        for (let i = 1; i < sequence.length; i++) {
            const distance = this.calculateDistance(
                sequence[i-1].location,
                sequence[i].location
            );
            
            metrics.totalDistance += distance;
            metrics.maxSegment = Math.max(metrics.maxSegment, distance);
            
            if (sequence[i-1].parcelId === sequence[i].parcelId &&
                sequence[i-1].type === 'pickup' && 
                sequence[i].type === 'delivery' &&
                distance < 3) {
                metrics.efficientPairs++;
            }
            
            if (distance < 2) {
                metrics.clusteringScore++;
            }
            
            if (i >= 2) {
                const prevDistance = this.calculateDistance(
                    sequence[i-2].location,
                    sequence[i].location
                );
                if (prevDistance < distance * 0.7) {
                    metrics.backtracking++;
                }
            }
        }
        
        metrics.totalDistance = Math.round(metrics.totalDistance * 100) / 100;
        metrics.averageSegment = Math.round((metrics.totalDistance / (sequence.length - 1)) * 100) / 100;
        metrics.maxSegment = Math.round(metrics.maxSegment * 100) / 100;
        
        metrics.efficiencyScore = Math.round(
            Math.max(0, Math.min(100,
                100 - (metrics.totalDistance * 2) + 
                (metrics.efficientPairs * 15) + 
                (metrics.clusteringScore * 5) - 
                (metrics.backtracking * 10)
            ))
        );
        
        return metrics;
    }
};

// ============================================================================
// MAIN ROUTE MODULE CONFIGURATION
// ============================================================================

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
    ignoreRiderNotFound: true
};

const config = {
    headingUp: false,
    smoothMovement: true,
    autoZoom: true,
    mapRotatable: true,
    useDynamicOptimization: true
};

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
    config: config,
    locationWatchId: null,
    accuracyCircle: null,
    radiusCircle: null,
    totalRouteEarnings: 0,
    routeCommission: 0,
    totalCashToCollect: 0,
    totalCashCollected: 0,
    paymentsByStop: {},
    optimizedSequence: null
};

const OPENROUTE_API_KEY = '5b3ce3597851110001cf624841e48578ffb34c6b96dfe3bbe9b3ad4c';
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

const BUSINESS_CONFIG = {
    commission: {
        rider: 0.70,
        platform: 0.30,
        maxUnpaid: 300,
        warningThreshold: 250
    }
};

// ============================================================================
// SIMPLE POD SYSTEM INTEGRATION
// ============================================================================

/**
 * Enhanced verify code function with Simple POD flow
 */
window.verifyCode = async function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop) return;
    
    const codeInput = document.getElementById('verificationCode');
    const code = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const paymentInfo = getPaymentInfoForStop(stop);
    
    // Validate code
    if (!code || code.length < 6) {
        codeInput.classList.add('error');
        showNotification('Please enter a valid code', 'error');
        return;
    }
    
    if (code !== stop.verificationCode.toUpperCase().replace(/[^A-Z0-9]/g, '')) {
        codeInput.classList.add('error');
        showNotification('Invalid code. Please try again.', 'error');
        return;
    }
    
    // Code is VALID!
    
    // PICKUP: Just complete it
    if (stop.type === 'pickup') {
        completePickupSimple(stop);
        return;
    }
    
    // DELIVERY: Show simple POD
    if (stop.type === 'delivery') {
        // Check cash first
        if (paymentInfo.needsCollection) {
            const paymentCheckbox = document.getElementById('paymentCollected');
            if (paymentCheckbox && !paymentCheckbox.checked) {
                showNotification('Please confirm cash collection', 'warning');
                return;
            }
        }
        
        // Close verification modal
        closeVerificationModal();
        
        // Show SIMPLE proof capture
        showSimplePOD(stop, paymentInfo);
    }
};

/**
 * Show Simple POD Modal
 */
function showSimplePOD(stop, paymentInfo) {
    // Auto-capture GPS location
    captureGPSLocation();
    
    // Create simple modal
    const modal = document.createElement('div');
    modal.className = 'simple-pod-modal';
    modal.innerHTML = `
        <div class="simple-pod-content">
            <!-- Header -->
            <div class="pod-header-simple">
                <h3>📸 Quick Photo Required</h3>
                <p>${stop.address}</p>
            </div>
            
            <!-- Main Action Area -->
            <div class="pod-main">
                <!-- Big Photo Button -->
                <input type="file" 
                       id="quickPhoto" 
                       accept="image/*" 
                       capture="environment"
                       style="display: none;"
                       onchange="quickPhotoTaken(this, '${stop.id}')">
                
                <div id="photoArea" class="photo-area" onclick="document.getElementById('quickPhoto').click()">
                    <div class="photo-prompt">
                        <div class="camera-big">📷</div>
                        <div class="prompt-text">Tap to Take Photo</div>
                        <div class="prompt-hint">Photo of package at delivery location</div>
                    </div>
                </div>
                
                <!-- Quick Options (Optional) -->
                <div class="quick-options">
                    <label class="quick-option">
                        <input type="radio" name="deliveryType" value="customer" checked>
                        <span>👤 Given to Customer</span>
                    </label>
                    <label class="quick-option">
                        <input type="radio" name="deliveryType" value="door">
                        <span>🚪 Left at Door</span>
                    </label>
                    <label class="quick-option">
                        <input type="radio" name="deliveryType" value="security">
                        <span>👮 With Security</span>
                    </label>
                </div>
                
                <!-- Complete Button (Disabled until photo) -->
                <button id="completeDeliveryBtn" 
                        class="complete-btn" 
                        onclick="completeDeliverySimple('${stop.id}')"
                        disabled>
                    Complete Delivery
                </button>
                
                <!-- Skip POD (Emergency only) -->
                <button class="skip-link" onclick="skipPOD('${stop.id}')">
                    Skip photo (not recommended)
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    addSimplePODStyles();
    
    // Store data
    window.simplePOD = {
        stopId: stop.id,
        parcelId: stop.parcelId,
        photo: null,
        location: null,
        timestamp: new Date().toISOString()
    };
}

/**
 * Handle photo capture
 */
window.quickPhotoTaken = function(input, stopId) {
    const file = input.files[0];
    if (!file) return;
    
    // Check size (but compress if needed)
    if (file.size > 5 * 1024 * 1024) {
        compressAndStore(file);
    } else {
        window.simplePOD.photo = file;
    }
    
    // Show preview immediately
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('photoArea').innerHTML = `
            <img src="${e.target.result}" class="photo-preview">
            <button class="retake-btn" onclick="retakeQuickPhoto()">↻ Retake</button>
        `;
        
        // Enable complete button
        document.getElementById('completeDeliveryBtn').disabled = false;
        document.getElementById('completeDeliveryBtn').classList.add('ready');
        
        // Auto-focus complete button
        document.getElementById('completeDeliveryBtn').focus();
    };
    reader.readAsDataURL(file);
};

/**
 * Retake photo
 */
window.retakeQuickPhoto = function() {
    document.getElementById('quickPhoto').value = '';
    document.getElementById('photoArea').innerHTML = `
        <div class="photo-prompt">
            <div class="camera-big">📷</div>
            <div class="prompt-text">Tap to Take Photo</div>
            <div class="prompt-hint">Photo of package at delivery location</div>
        </div>
    `;
    document.getElementById('completeDeliveryBtn').disabled = true;
    document.getElementById('completeDeliveryBtn').classList.remove('ready');
    
    // Trigger click again
    setTimeout(() => {
        document.getElementById('quickPhoto').click();
    }, 100);
};

/**
 * Complete delivery with Simple POD
 */
window.completeDeliverySimple = async function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop || !window.simplePOD.photo) return;
    
    // Disable button and show loading
    const btn = document.getElementById('completeDeliveryBtn');
    btn.disabled = true;
    btn.innerHTML = '⏳ Completing...';
    
    try {
        // Get delivery type
        const deliveryType = document.querySelector('input[name="deliveryType"]:checked').value;
        
        // Prepare proof data
        const proofData = {
            parcelId: stop.parcelId,
            stopId: stop.id,
            photo: window.simplePOD.photo,
            deliveryType: deliveryType,
            location: window.simplePOD.location,
            timestamp: new Date().toISOString(),
            verificationCode: stop.verificationCode
        };
        
        // Save photo (can be async in background)
        saveProofInBackground(proofData);
        
        // Mark as completed immediately for better UX
        stop.completed = true;
        stop.timestamp = new Date();
        stop.proofData = proofData;
        
        // Update payment status if needed
        const paymentInfo = getPaymentInfoForStop(stop);
        if (paymentInfo.needsCollection) {
            state.paymentsByStop[stop.id].collected = true;
            updateCashCollectionWidget();
        }
        
        // Save to localStorage
        await syncRouteData();
        
        // Update database (async)
        updateDatabaseInBackground(stop);
        
        // Close modal
        document.querySelector('.simple-pod-modal').remove();
        
        // Show success
        showQuickSuccess();
        
        // Update UI
        displayRouteInfo();
        updateDynamicHeader();
        plotRoute();
        
        // Check if route complete
        if (state.activeRoute.stops.every(s => s.completed)) {
            await completeRoute();
        } else {
            // Navigate to next stop
            const nextStop = getNextStop();
            if (nextStop) {
                setTimeout(() => {
                    showNotification(`Delivery complete! Next: ${nextStop.address}`, 'success');
                    if (state.navigationActive) {
                        navigateToStop(nextStop.id);
                    }
                }, 1000);
            }
        }
        
    } catch (error) {
        console.error('Error completing delivery:', error);
        btn.disabled = false;
        btn.innerHTML = 'Try Again';
        showNotification('Error completing delivery. Please try again.', 'error');
    }
};

/**
 * Skip POD (emergency only)
 */
window.skipPOD = function(stopId) {
    if (confirm('⚠️ Skipping photo is not recommended and may affect dispute resolution. Continue anyway?')) {
        const stop = state.activeRoute.stops.find(s => s.id === stopId);
        if (!stop) return;
        
        // Mark completed without proof
        stop.completed = true;
        stop.timestamp = new Date();
        stop.skippedProof = true;
        
        syncRouteData();
        
        // Close modal
        document.querySelector('.simple-pod-modal').remove();
        
        // Update UI
        displayRouteInfo();
        updateDynamicHeader();
        
        showNotification('Delivery marked complete (no photo)', 'warning');
    }
};

/**
 * Complete pickup - Simple
 */
function completePickupSimple(stop) {
    stop.completed = true;
    stop.timestamp = new Date();
    
    // Enable delivery
    const deliveryStop = state.activeRoute.stops.find(s => 
        s.type === 'delivery' && s.parcelId === stop.parcelId
    );
    if (deliveryStop) {
        deliveryStop.canComplete = true;
    }
    
    syncRouteData();
    closeVerificationModal();
    showQuickSuccess();
    
    // Update UI
    displayRouteInfo();
    updateDynamicHeader();
    
    // Next stop
    const nextStop = getNextStop();
    if (nextStop) {
        setTimeout(() => {
            showNotification(`Pickup complete! Next: ${nextStop.address}`, 'success');
        }, 500);
    }
}

// ============================================================================
// BACKGROUND FUNCTIONS (Don't block UI)
// ============================================================================

/**
 * Save proof in background
 */
async function saveProofInBackground(proofData) {
    try {
        // Create form data
        const formData = new FormData();
        formData.append('photo', proofData.photo);
        formData.append('data', JSON.stringify({
            parcelId: proofData.parcelId,
            deliveryType: proofData.deliveryType,
            location: proofData.location,
            timestamp: proofData.timestamp
        }));
        
        // Upload to Supabase storage (async)
        const fileName = `pod_${proofData.parcelId}_${Date.now()}.jpg`;
        
        // If offline, store locally
        if (!navigator.onLine) {
            storeProofOffline(proofData);
            return;
        }
        
        // Upload
        fetch(`${SUPABASE_URL}/storage/v1/object/delivery-photos/${fileName}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: formData
        }).catch(err => {
            console.error('Background upload failed:', err);
            storeProofOffline(proofData);
        });
        
    } catch (error) {
        console.error('Error saving proof:', error);
        storeProofOffline(proofData);
    }
}

/**
 * Store proof offline for later sync
 */
function storeProofOffline(proofData) {
    const offlineProofs = JSON.parse(localStorage.getItem('tuma_offline_proofs') || '[]');
    offlineProofs.push(proofData);
    localStorage.setItem('tuma_offline_proofs', JSON.stringify(offlineProofs));
}

/**
 * Update database in background
 */
async function updateDatabaseInBackground(stop) {
    if (!navigator.onLine) return;
    
    try {
        await supabaseUpdate('parcels',
            `id=eq.${stop.parcelId}`,
            {
                status: 'delivered',
                delivery_timestamp: stop.timestamp.toISOString(),
                has_pod: true
            }
        );
    } catch (error) {
        console.error('Background database update failed:', error);
    }
}

/**
 * Capture GPS location
 */
function captureGPSLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                window.simplePOD.location = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
            },
            error => {
                console.log('Location not available');
            },
            { timeout: 5000 }
        );
    }
}

/**
 * Show quick success animation
 */
function showQuickSuccess() {
    const success = document.createElement('div');
    success.className = 'quick-success';
    success.innerHTML = '✅';
    document.body.appendChild(success);
    
    setTimeout(() => success.remove(), 1500);
}

/**
 * Compress image if needed
 */
async function compressAndStore(file) {
    // Simple compression logic
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
        // Max 1920px wide
        let width = img.width;
        let height = img.height;
        const maxWidth = 1920;
        
        if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(blob => {
            window.simplePOD.photo = blob;
        }, 'image/jpeg', 0.8);
    };
    
    img.src = URL.createObjectURL(file);
}

/**
 * Add Simple POD Styles
 */
function addSimplePODStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .simple-pod-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.2s ease;
        }
        
        .simple-pod-content {
            background: white;
            border-radius: 20px;
            width: 90%;
            max-width: 400px;
            overflow: hidden;
            animation: slideUp 0.3s ease;
        }
        
        .pod-header-simple {
            padding: 20px;
            text-align: center;
            border-bottom: 1px solid #f0f0f0;
        }
        
        .pod-header-simple h3 {
            margin: 0;
            font-size: 20px;
            color: #333;
        }
        
        .pod-header-simple p {
            margin: 5px 0 0 0;
            color: #666;
            font-size: 14px;
        }
        
        .pod-main {
            padding: 20px;
        }
        
        .photo-area {
            background: #f8f8f8;
            border: 2px dashed #ddd;
            border-radius: 16px;
            padding: 40px 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-bottom: 20px;
            position: relative;
        }
        
        .photo-area:hover {
            background: #f0f0f0;
            border-color: #0066FF;
        }
        
        .camera-big {
            font-size: 48px;
            margin-bottom: 10px;
        }
        
        .prompt-text {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            margin-bottom: 5px;
        }
        
        .prompt-hint {
            font-size: 14px;
            color: #666;
        }
        
        .photo-preview {
            width: 100%;
            border-radius: 12px;
            display: block;
        }
        
        .retake-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: white;
            border: none;
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        .quick-options {
            display: flex;
            gap: 8px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        
        .quick-option {
            flex: 1;
            min-width: calc(33% - 8px);
        }
        
        .quick-option input {
            display: none;
        }
        
        .quick-option span {
            display: block;
            padding: 10px;
            background: #f8f8f8;
            border: 2px solid #f0f0f0;
            border-radius: 10px;
            text-align: center;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .quick-option input:checked + span {
            background: #e6f2ff;
            border-color: #0066FF;
            color: #0066FF;
            font-weight: 600;
        }
        
        .complete-btn {
            width: 100%;
            padding: 16px;
            background: #ccc;
            border: none;
            border-radius: 12px;
            font-size: 18px;
            font-weight: 700;
            color: white;
            cursor: not-allowed;
            transition: all 0.3s;
        }
        
        .complete-btn.ready {
            background: #0066FF;
            cursor: pointer;
            animation: pulse 1s infinite;
        }
        
        .complete-btn.ready:hover {
            background: #0052cc;
            transform: scale(1.02);
        }
        
        .complete-btn:disabled {
            background: #ccc;
            cursor: not-allowed;
            animation: none;
        }
        
        .skip-link {
            display: block;
            width: 100%;
            padding: 10px;
            background: none;
            border: none;
            color: #999;
            font-size: 13px;
            text-decoration: underline;
            cursor: pointer;
            margin-top: 10px;
        }
        
        .quick-success {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 72px;
            animation: successPop 0.5s ease;
            z-index: 10001;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        
        @keyframes pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(0, 102, 255, 0.4); }
            50% { box-shadow: 0 0 0 10px rgba(0, 102, 255, 0); }
        }
        
        @keyframes successPop {
            0% { transform: translate(-50%, -50%) scale(0); }
            50% { transform: translate(-50%, -50%) scale(1.2); }
            100% { transform: translate(-50%, -50%) scale(1); }
        }
    `;
    document.head.appendChild(style);
}

// ============================================================================
// AUTO-SYNC WHEN ONLINE
// ============================================================================

window.addEventListener('online', () => {
    const offlineProofs = JSON.parse(localStorage.getItem('tuma_offline_proofs') || '[]');
    if (offlineProofs.length > 0) {
        // Sync in background
        offlineProofs.forEach(proof => {
            saveProofInBackground(proof);
        });
        localStorage.removeItem('tuma_offline_proofs');
    }
});

console.log('Simple POD System integrated - One screen, fast & easy!');
/**
 * Complete Enhanced Route Navigation Module with Dynamic Optimization and Simple POD
 * PART 2 OF 2 - Includes API functions, UI components, and initialization
 */

// ============================================================================
// API FUNCTIONS
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parsePrice(priceValue) {
    if (typeof priceValue === 'number') return priceValue;
    if (typeof priceValue === 'string') {
        const cleaned = priceValue.replace(/[^0-9.-]+/g, '');
        return parseFloat(cleaned) || 0;
    }
    return 0;
}

function applyDynamicOptimization() {
    if (!state.activeRoute || !state.activeRoute.parcels) return;
    
    console.log('Applying dynamic route optimization...');
    
    const currentLocation = state.currentLocation || null;
    const optimizedStops = DynamicRouteOptimizer.optimizeRoute(
        state.activeRoute.parcels, 
        currentLocation
    );
    
    state.optimizedSequence = optimizedStops;
    state.activeRoute.stops = optimizedStops;
    
    const analysis = DynamicRouteOptimizer.analyzeRoute(optimizedStops);
    console.log('Route optimization complete:', {
        stops: optimizedStops.length,
        totalDistance: analysis.totalDistance + ' km',
        efficientPairs: analysis.efficientPairs,
        efficiencyScore: analysis.efficiencyScore
    });
    
    if (window.showNotification) {
        window.showNotification(
            `Route optimized: ${analysis.efficientPairs} efficient pairs, ${analysis.totalDistance}km total`,
            'success'
        );
    }
    
    return optimizedStops;
}

function getPaymentInfoForStop(stop) {
    if (!state.activeRoute || !state.activeRoute.parcels) {
        return {
            amount: 0,
            method: 'unknown',
            status: 'unknown',
            needsCollection: false
        };
    }
    
    const parcel = state.activeRoute.parcels.find(p => p.id === stop.parcelId);
    if (!parcel) {
        return {
            amount: 0,
            method: 'unknown',
            status: 'unknown',
            needsCollection: false
        };
    }
    
    const amount = parsePrice(parcel.price || parcel.total_price || 0);
    const method = parcel.payment_method || 'cash';
    const status = parcel.payment_status || 'pending';
    
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

async function syncRouteData() {
    if (!state.activeRoute) return;
    
    try {
        localStorage.setItem('tuma_active_route', JSON.stringify(state.activeRoute));
        
        if (state.activeRoute.stops && state.activeRoute.stops.every(s => s.completed)) {
            await handleRouteCompletion();
        }
    } catch (error) {
        console.error('Error syncing route data:', error);
    }
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

// ============================================================================
// MAP AND UI FUNCTIONS
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

function getNextStop() {
    if (!state.activeRoute || !state.activeRoute.stops) return null;
    return state.activeRoute.stops.find(stop => !stop.completed);
}

function updateRouteStats() {
    const remainingStops = state.activeRoute.stops.filter(s => !s.completed).length;
    const totalDistance = state.activeRoute.distance || 0;
    const estimatedTime = Math.round(totalDistance * 2.5 + remainingStops * 5);
    
    const stats = {
        remainingStops,
        totalDistance,
        estimatedTime
    };
    
    if (state.optimizedSequence) {
        const analysis = DynamicRouteOptimizer.analyzeRoute(state.optimizedSequence);
        stats.efficientPairs = analysis.efficientPairs;
        stats.optimizedDistance = analysis.totalDistance;
    }
    
    document.getElementById('remainingStops').textContent = remainingStops;
    document.getElementById('totalDistance').textContent = stats.optimizedDistance || totalDistance;
    document.getElementById('estimatedTime').textContent = estimatedTime;
}

function displayStops() {
    const stopsList = document.getElementById('stopsList');
    if (!stopsList || !state.activeRoute) return;
    
    updateParcelsInPossession();
    
    let html = '';
    
    if (state.optimizedSequence) {
        const analysis = DynamicRouteOptimizer.analyzeRoute(state.optimizedSequence);
        html += `
            <div class="optimization-summary" style="
                background: linear-gradient(135deg, rgba(0, 102, 255, 0.1), rgba(0, 88, 255, 0.05));
                border: 1px solid var(--primary);
                border-radius: 14px;
                padding: 16px;
                margin-bottom: 20px;
            ">
                <h4 style="margin: 0 0 12px 0; color: var(--primary);">
                    ⚡ Optimized Route
                </h4>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                    <div>
                        <div style="font-size: 20px; font-weight: 700; color: var(--primary);">
                            ${analysis.totalDistance}km
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">Total Distance</div>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: 700; color: var(--success);">
                            ${analysis.efficientPairs}
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">Efficient Pairs</div>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: 700; color: var(--warning);">
                            ${analysis.efficiencyScore}%
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">Efficiency</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    if (state.parcelsInPossession.length > 0) {
        html += createParcelsInPossessionWidget();
    }
    
    html += `<div class="stops-list">`;
    state.activeRoute.stops.forEach((stop, index) => {
        html += createOptimizedStopCard(stop, index + 1);
    });
    html += `</div>`;
    
    stopsList.innerHTML = html;
}

function createOptimizedStopCard(stop, number) {
    const isActive = isNextStop(stop);
    const canInteract = !stop.completed && stop.canComplete !== false;
    const paymentInfo = getPaymentInfoForStop(stop);
    const isEfficientPair = stop.isEfficientPair;
    
    return `
        <div class="stop-card ${stop.completed ? 'completed' : ''} ${isActive ? 'active' : ''} ${isEfficientPair ? 'efficient-pair' : ''}" 
             onclick="${canInteract ? `selectStop('${stop.id}')` : ''}"
             data-stop-id="${stop.id}">
            <div class="stop-number-badge ${stop.type}">
                ${stop.completed ? '✓' : number}
            </div>
            <div class="stop-content">
                <div class="stop-header">
                    <h3 class="stop-address">${stop.address}</h3>
                    ${stop.distanceFromPrevious ? `
                        <span class="stop-distance">${stop.distanceFromPrevious} km</span>
                    ` : ''}
                </div>
                <div class="stop-details">
                    <div class="detail-row">
                        <span class="detail-icon">${stop.type === 'pickup' ? '📦' : '📍'}</span>
                        <span>${stop.type === 'pickup' ? 'Pickup' : 'Delivery'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">👤</span>
                        <span>${stop.customerName} • ${stop.customerPhone}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-icon">📋</span>
                        <span>Code: ${stop.parcelCode}</span>
                    </div>
                    ${stop.estimatedArrival ? `
                        <div class="detail-row">
                            <span class="detail-icon">⏱</span>
                            <span>ETA: ${stop.estimatedArrival}</span>
                        </div>
                    ` : ''}
                </div>
                
                ${stop.type === 'delivery' && paymentInfo.needsCollection ? `
                    <div class="payment-badge ${stop.completed ? 'collected' : ''}">
                        <span>💵</span>
                        <span>${stop.completed ? 'Collected' : 'COLLECT'}: KES ${paymentInfo.amount.toLocaleString()}</span>
                    </div>
                ` : stop.type === 'delivery' && paymentInfo.method === 'online' ? `
                    <div class="payment-badge prepaid">
                        <span>✅</span>
                        <span>Already Paid</span>
                    </div>
                ` : ''}
                
                ${stop.completed ? `
                    <div class="stop-status completed">
                        ✓ Completed ${formatTimeAgo(stop.timestamp)}
                    </div>
                ` : isActive ? `
                    <div class="stop-status active">
                        → Current Stop
                    </div>
                ` : !stop.canComplete ? `
                    <div class="stop-status blocked">
                        🔒 Complete pickup first
                    </div>
                ` : ''}
            </div>
            <div class="stop-actions">
                ${!stop.completed && canInteract ? `
                    <button class="action-btn navigate" onclick="event.stopPropagation(); navigateToStop('${stop.id}')">
                        🧭
                    </button>
                    <a href="tel:${stop.customerPhone}" class="action-btn call" onclick="event.stopPropagation();">
                        📞
                    </a>
                ` : ''}
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
                s.type === 'delivery' && s.parcelId === stop.parcelId
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

function createParcelsInPossessionWidget() {
    return `
        <div class="parcels-possession-widget" style="
            background: linear-gradient(135deg, rgba(255, 159, 10, 0.2) 0%, rgba(255, 159, 10, 0.1) 100%);
            border: 1px solid var(--warning);
            border-radius: 14px;
            padding: 16px;
            margin-bottom: 20px;
        ">
            <div class="carrying-banner" style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                <span class="carrying-icon">📦</span>
                <span style="font-weight: 600; color: var(--text-primary);">
                    Carrying ${state.parcelsInPossession.length} parcel${state.parcelsInPossession.length > 1 ? 's' : ''}
                </span>
            </div>
            <div class="parcel-cards" style="display: flex; flex-direction: column; gap: 8px;">
                ${state.parcelsInPossession.map(parcel => {
                    const deliveryStop = state.activeRoute.stops.find(s => 
                        s.type === 'delivery' && s.parcelId === parcel.parcelId
                    );
                    const paymentInfo = deliveryStop ? getPaymentInfoForStop(deliveryStop) : null;
                    
                    return `
                        <div class="parcel-card" style="
                            background: var(--surface-high);
                            border-radius: 8px;
                            padding: 12px;
                            border-left: 3px solid var(--warning);
                        ">
                            <div class="parcel-code" style="font-weight: 600; margin-bottom: 4px; color: var(--text-primary);">
                                ${parcel.parcelCode}
                            </div>
                            <div class="parcel-destination" style="font-size: 14px; color: var(--text-secondary); margin-bottom: 4px;">
                                ${parcel.destination}
                            </div>
                            <div class="parcel-time" style="font-size: 12px; color: var(--text-tertiary);">
                                Picked up ${formatTimeAgo(parcel.pickupTime)}
                            </div>
                            ${paymentInfo && paymentInfo.needsCollection ? `
                                <div style="margin-top: 6px; font-size: 13px; font-weight: 600; color: var(--warning);">
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

function isNextStop(stop) {
    const nextStop = getNextStop();
    return nextStop && nextStop.id === stop.id;
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const minutes = Math.floor((Date.now() - new Date(timestamp)) / 60000);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
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
    
    if (nextStop.isEfficientPair) {
        headerText += ' ⚡';
    }
    
    routeTitle.textContent = headerText;
}

function getCurrentStop() {
    if (!state.activeRoute) return null;
    
    const completedStops = state.activeRoute.stops.filter(s => s.completed);
    if (completedStops.length === 0) return null;
    
    return completedStops[completedStops.length - 1];
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

async function plotRoute() {
    if (!state.map || !state.activeRoute || !state.activeRoute.stops) return;
    
    state.markers.forEach(marker => marker.remove());
    state.markers = [];
    
    if (state.routePolyline) {
        state.routePolyline.remove();
        state.routePolyline = null;
    }
    
    const bounds = L.latLngBounds();
    
    state.activeRoute.stops.forEach((stop, index) => {
        const icon = createLeafletIcon(stop);
        const marker = L.marker([stop.location.lat, stop.location.lng], { icon })
            .addTo(state.map)
            .bindPopup(createStopPopup(stop));
        
        state.markers.push(marker);
        bounds.extend([stop.location.lat, stop.location.lng]);
    });
    
    state.map.fitBounds(bounds, { padding: [50, 50] });
}

function createLeafletIcon(stop) {
    const isCompleted = stop.completed;
    const isActive = isNextStop(stop);
    const type = stop.type;
    const isEfficient = stop.isEfficientPair;
    
    const bgColor = isCompleted ? '#1C1C1F' : type === 'pickup' ? '#FF9F0A' : '#0066FF';
    const borderColor = isCompleted ? '#48484A' : '#FFFFFF';
    const symbol = isCompleted ? '✓' : type === 'pickup' ? 'P' : 'D';
    
    return L.divIcon({
        className: 'custom-marker',
        html: `
            <div class="stop-marker-wrapper ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}">
                <div class="stop-marker ${type}" style="
                    background: ${bgColor};
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    border: 3px solid ${borderColor};
                    position: relative;
                ">
                    <span style="
                        color: white;
                        font-weight: bold;
                        font-size: 20px;
                        ${isCompleted ? 'color: #8E8E93;' : ''}
                    ">${symbol}</span>
                    ${isActive ? '<div class="marker-pulse"></div>' : ''}
                    ${isEfficient ? '<div class="efficient-indicator">⚡</div>' : ''}
                </div>
                <div class="marker-label">${type === 'pickup' ? 'Pickup' : 'Delivery'}</div>
            </div>
        `,
        iconSize: [44, 70],
        iconAnchor: [22, 55],
        popupAnchor: [0, -55]
    });
}

function createStopPopup(stop) {
    const bgColor = stop.type === 'pickup' ? '#FF9F0A' : '#0066FF';
    const textColor = stop.type === 'pickup' ? 'black' : 'white';
    const paymentInfo = getPaymentInfoForStop(stop);
    
    return `
        <div class="stop-popup">
            <div class="popup-header ${stop.type}" style="background: ${bgColor}; color: ${textColor};">
                <span class="popup-phase">${stop.type.toUpperCase()}</span>
                <span class="popup-code">${stop.parcelCode}</span>
                ${stop.isEfficientPair ? '<span class="efficient-badge">⚡ Efficient</span>' : ''}
            </div>
            <div class="popup-body">
                <h3>${stop.address}</h3>
                <div class="popup-info">
                    <div class="info-row">
                        <span class="info-icon">👤</span>
                        <span>${stop.customerName}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-icon">📞</span>
                        <a href="tel:${stop.customerPhone}">${stop.customerPhone}</a>
                    </div>
                    ${paymentInfo.needsCollection ? `
                        <div class="info-row payment">
                            <span class="info-icon">💰</span>
                            <span style="font-weight: 600; color: var(--warning);">
                                Collect: KES ${paymentInfo.amount.toLocaleString()}
                            </span>
                        </div>
                    ` : ''}
                </div>
                ${!stop.completed && stop.canComplete !== false ? `
                    <div class="popup-actions">
                        <button onclick="openVerificationModal('${stop.id}')">
                            ✓ Verify ${stop.type}
                        </button>
                        <button onclick="navigateToStop('${stop.id}')">
                            🧭 Navigate
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
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
        
        const coords = stops.map(stop => [stop.location.lat, stop.location.lng]);
        
        if (state.currentLocation) {
            coords.unshift([state.currentLocation.lat, state.currentLocation.lng]);
        }
        
        state.routePolyline = L.polyline(coords, {
            color: '#0066FF',
            weight: 6,
            opacity: 0.8,
            smoothFactor: 1
        }).addTo(state.map);
        
    } catch (error) {
        console.error('Error drawing route:', error);
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
        parcels: state.activeRoute.parcels || []
    };
    
    console.log('Storing completion data:', completionData);
    
    localStorage.setItem('tuma_route_completion', JSON.stringify(completionData));
    localStorage.removeItem('tuma_active_route');
    
    if (!state.activeRoute.id?.startsWith('demo-')) {
        try {
            for (const parcel of (state.activeRoute.parcels || [])) {
                await supabaseUpdate('parcels',
                    `id=eq.${parcel.id}`,
                    {
                        status: 'delivered',
                        delivery_timestamp: new Date().toISOString(),
                        payment_status: parcel.payment_method === 'cash' ? 'collected' : parcel.payment_status,
                        has_pod: true
                    }
                );
            }
        } catch (error) {
            console.error('Error updating parcel status:', error);
        }
    }
}

// ============================================================================
// WINDOW FUNCTIONS
// ============================================================================

window.openQuickVerification = function() {
    const nextStop = getNextStop();
    if (nextStop) {
        openVerificationModal(nextStop.id);
    }
};

window.openVerificationModal = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop || stop.completed) return;
    
    const paymentInfo = getPaymentInfoForStop(stop);
    
    const modal = document.createElement('div');
    modal.className = 'verification-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeVerificationModal()"></div>
        <div class="modal-content">
            <div class="modal-header ${stop.type}">
                <span class="modal-icon">${stop.type === 'pickup' ? '📦' : '📍'}</span>
                <h2>Verify ${stop.type === 'pickup' ? 'Pickup' : 'Delivery'}</h2>
                ${stop.isEfficientPair ? '<span class="efficient-badge">⚡ Efficient Pair</span>' : ''}
            </div>
            <div class="modal-body">
                <div class="stop-summary">
                    <h3>${stop.address}</h3>
                    <div class="summary-details">
                        <div class="summary-row">
                            <span class="summary-label">Customer:</span>
                            <span class="summary-value">${stop.customerName}</span>
                        </div>
                        <div class="summary-row">
                            <span class="summary-label">Phone:</span>
                            <span class="summary-value">${stop.customerPhone}</span>
                        </div>
                        <div class="summary-row">
                            <span class="summary-label">Parcel Code:</span>
                            <span class="summary-value">${stop.parcelCode}</span>
                        </div>
                    </div>
                </div>
                
                ${stop.type === 'delivery' && paymentInfo.needsCollection ? `
                    <div class="payment-collection-alert" style="
                        background: linear-gradient(135deg, rgba(255, 159, 10, 0.2), rgba(255, 149, 0, 0.1));
                        border: 2px solid var(--warning);
                        border-radius: 12px;
                        padding: 16px;
                        margin: 16px 0;
                        text-align: center;
                    ">
                        <div style="font-size: 24px; margin-bottom: 8px;">💰</div>
                        <div style="font-size: 20px; font-weight: 700; color: var(--warning); margin-bottom: 4px;">
                            Collect KES ${paymentInfo.amount.toLocaleString()}
                        </div>
                        <div style="font-size: 14px; color: var(--text-secondary);">
                            Cash payment from customer
                        </div>
                    </div>
                ` : ''}
                
                <div class="verification-section">
                    <label>Enter ${stop.type} verification code:</label>
                    <input type="text" 
                           class="verification-input" 
                           id="verificationCode" 
                           placeholder="XXX-XXXX"
                           maxlength="8"
                           autocomplete="off">
                    <p class="code-hint">Ask the ${stop.type === 'pickup' ? 'sender' : 'recipient'} for their code</p>
                </div>
                
                ${stop.type === 'delivery' && paymentInfo.needsCollection ? `
                    <div style="margin-top: 16px; padding: 12px; background: var(--surface-high); border-radius: 8px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="paymentCollected" style="width: 20px; height: 20px; cursor: pointer;">
                            <span style="font-size: 16px;">I have collected KES ${paymentInfo.amount.toLocaleString()} cash</span>
                        </label>
                    </div>
                ` : ''}
                
                <div class="modal-actions">
                    <button class="modal-btn primary" onclick="verifyCode('${stop.id}')">
                        <span>✓</span>
                        <span>Verify ${stop.type === 'pickup' ? 'Pickup' : 'Delivery'}</span>
                    </button>
                    <button class="modal-btn secondary" onclick="closeVerificationModal()">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    setTimeout(() => {
        document.getElementById('verificationCode').focus();
    }, 100);
    
    document.getElementById('verificationCode').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            verifyCode(stop.id);
        }
    });
};

window.closeVerificationModal = function() {
    const modal = document.querySelector('.verification-modal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 300);
    }
};

window.navigateToStop = function(stopId) {
    const stop = state.activeRoute.stops.find(s => s.id === stopId);
    if (!stop) return;
    
    showNotification(`Navigating to ${stop.type} location`, 'info');
    
    if (state.map && stop.location) {
        state.map.setView([stop.location.lat, stop.location.lng], 16);
    }
};

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

async function completeRoute() {
    console.log('Completing route...');
    
    await handleRouteCompletion();
    
    const animation = document.createElement('div');
    animation.className = 'route-complete-animation';
    animation.innerHTML = `
        <div class="route-complete-content">
            <div class="complete-icon">🏆</div>
            <h1>Route Complete!</h1>
            <p>Excellent work! All deliveries completed successfully.</p>
            <div class="route-stats">
                <div class="stat">
                    <span class="stat-value">${state.activeRoute.stops.length}</span>
                    <span class="stat-label">Stops</span>
                </div>
                <div class="stat">
                    <span class="stat-value">KES ${Math.round(state.totalRouteEarnings)}</span>
                    <span class="stat-label">Earned</span>
                </div>
                ${state.totalCashCollected > 0 ? `
                    <div class="stat">
                        <span class="stat-value">KES ${Math.round(state.totalCashCollected)}</span>
                        <span class="stat-label">Cash Collected</span>
                    </div>
                ` : ''}
            </div>
            <button class="complete-btn" onclick="finishRoute()">
                Back to Dashboard
            </button>
        </div>
    `;
    
    document.body.appendChild(animation);
}

window.finishRoute = function() {
    window.location.href = './rider.html';
};

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span class="notification-icon">
            ${type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ'}
        </span>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('hiding');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function updateCashCollectionWidget() {
    calculateCashCollection();
    const widget = document.querySelector('.cash-collection-widget');
    if (widget) {
        showCashCollectionWidget();
    }
}

function showCashCollectionWidget() {
    const existingWidget = document.querySelector('.cash-collection-widget');
    if (existingWidget) existingWidget.remove();
    
    const pendingAmount = state.totalCashToCollect - state.totalCashCollected;
    const hasPending = pendingAmount > 0;
    
    const widget = document.createElement('div');
    widget.className = `cash-collection-widget ${hasPending ? 'has-pending' : ''}`;
    widget.innerHTML = `
        <div class="cash-widget-title">
            <span>💰</span>
            <span>Cash Collection</span>
        </div>
        <div class="cash-widget-amount">
            KES ${pendingAmount.toLocaleString()}
        </div>
        <div class="cash-widget-breakdown">
            <div class="cash-breakdown-item">
                <span class="cash-breakdown-label">Total to collect</span>
                <span class="cash-breakdown-value">KES ${state.totalCashToCollect.toLocaleString()}</span>
            </div>
            <div class="cash-breakdown-item">
                <span class="cash-breakdown-label">✓ Collected</span>
                <span class="cash-breakdown-value">KES ${state.totalCashCollected.toLocaleString()}</span>
            </div>
            <div class="cash-breakdown-item">
                <span class="cash-breakdown-label">⏳ Pending</span>
                <span class="cash-breakdown-value">KES ${pendingAmount.toLocaleString()}</span>
            </div>
        </div>
    `;
    
    document.body.appendChild(widget);
}

function showOptimizationIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'optimization-indicator';
    indicator.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        <span>Route Optimized</span>
    `;
    document.body.appendChild(indicator);
    
    setTimeout(() => {
        indicator.style.animation = 'slideUp 0.3s ease-out';
        setTimeout(() => indicator.remove(), 300);
    }, 3000);
}

function injectNavigationStyles() {
    const style = document.createElement('style');
    style.textContent = `
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
        
        /* Optimization indicator */
        .optimization-indicator {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--primary);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            z-index: 1000;
            animation: slideDown 0.3s ease-out;
        }
        
        @keyframes slideDown {
            from {
                transform: translateX(-50%) translateY(-100%);
                opacity: 0;
            }
            to {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

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

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Route.js initializing with dynamic optimization and Simple POD...');
    
    injectNavigationStyles();
    await waitForLeaflet();
    
    try {
        const storedRoute = localStorage.getItem('tuma_active_route');
        console.log('Stored route data:', storedRoute);
        
        if (storedRoute) {
            state.activeRoute = JSON.parse(storedRoute);
            console.log('Parsed route:', state.activeRoute);
            
            if (config.useDynamicOptimization && state.activeRoute.parcels) {
                applyDynamicOptimization();
                showOptimizationIndicator();
            }
            
            calculateRouteFinancials();
            calculateCashCollection();
            
            await initializeMap();
            displayRouteInfo();
            updateDynamicHeader();
            await plotRoute();
            await drawOptimizedRoute();
            
            if (state.totalCashToCollect > 0) {
                showCashCollectionWidget();
            }
        } else {
            console.log('No active route found');
        }
    } catch (error) {
        console.error('Error initializing route:', error);
    }
});

// Export for debugging
window.routeDebug = {
    state,
    optimizer: DynamicRouteOptimizer,
    reoptimize: () => {
        if (state.activeRoute && state.activeRoute.parcels) {
            applyDynamicOptimization();
            displayRouteInfo();
            plotRoute();
            drawOptimizedRoute();
        }
    },
    analyzeRoute: () => {
        if (state.optimizedSequence) {
            const analysis = DynamicRouteOptimizer.analyzeRoute(state.optimizedSequence);
            console.log('Route Analysis:', analysis);
            return analysis;
        }
    }
};

console.log('✅ Integrated Route Navigation with Simple POD loaded successfully!');
console.log('Features: Dynamic optimization, Simple POD flow, Offline support');
console.log('Debug: window.routeDebug');
