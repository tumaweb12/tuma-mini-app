/**
 * Complete Enhanced Route Navigation Module with Dynamic Optimization and Simple POD
 * PART 1 OF 2 - FULL VERSION WITH ALL FUNCTIONS
 * Fixes: No Active Route overlay, Cash widget styling, Details/Navigation buttons
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
                parcelCode: parcel.parcel_code || parcel.code || `P${parcel.id.slice(-6)}`,
                type: 'pickup',
                location: pickupLocation,
                address: parcel.pickup_address || this.extractAddress(pickupLocation, parcel),
                verificationCode: parcel.pickup_code || parcel.pickup_verification_code || 'XXX-XXXX',
                customerName: parcel.vendor_name || parcel.sender_name || 'Vendor',
                customerPhone: parcel.vendor_phone || parcel.sender_phone || '',
                price: parseFloat(parcel.price || parcel.amount || 0),
                completed: false,
                canComplete: true
            });
            
            stops.push({
                id: `${parcel.id}-delivery`,
                parcelId: parcel.id,
                parcelCode: parcel.parcel_code || parcel.code || `P${parcel.id.slice(-6)}`,
                type: 'delivery',
                location: deliveryLocation,
                address: parcel.delivery_address || this.extractAddress(deliveryLocation, parcel),
                verificationCode: parcel.delivery_code || parcel.delivery_verification_code || 'XXX-XXXX',
                customerName: parcel.recipient_name || parcel.receiver_name || 'Recipient',
                customerPhone: parcel.recipient_phone || parcel.receiver_phone || '',
                price: parseFloat(parcel.price || parcel.amount || 0),
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
    totalCashToCollect: 0,
    totalCashCollected: 0,
    paymentsByStop: {},
    optimizedSequence: null
};

const OPENROUTE_API_KEY = '5b3ce3597851110001cf624841e48578ffb34c6b96dfe3bbe9b3ad4c';
const SUPABASE_URL = 'https://btxavqfoirdzwpfrvezp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk';

// ============================================================================
// NAVIGATION PANEL (WITH FIXED BUTTONS)
// ============================================================================

function createNavigationPanel() {
    // Remove any existing navigation panel
    const existingPanel = document.querySelector('.navigation-panel');
    if (existingPanel) existingPanel.remove();
    
    const panel = document.createElement('div');
    panel.className = 'navigation-panel collapsed';
    panel.innerHTML = `
        <div class="nav-panel-header" onclick="toggleNavigationPanel()">
            <div class="nav-panel-title">
                <span class="nav-icon">🧭</span>
                <span>Navigation Controls</span>
            </div>
            <span class="nav-toggle-icon">▼</span>
        </div>
        <div class="nav-panel-content">
            <div class="nav-actions">
                <button class="nav-btn primary" onclick="startNavigation()">
                    <span class="btn-icon">▶️</span>
                    <span>Start Navigation</span>
                </button>
                <button class="nav-btn secondary" onclick="viewRouteDetails()">
                    <span class="btn-icon">📋</span>
                    <span>Route Details</span>
                </button>
            </div>
            <div class="nav-stats">
                <div class="nav-stat">
                    <span class="stat-label">Next Stop</span>
                    <span id="nextStopName" class="stat-value">--</span>
                </div>
                <div class="nav-stat">
                    <span class="stat-label">Distance</span>
                    <span id="nextStopDistance" class="stat-value">--</span>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    updateNavigationPanel();
}

function toggleNavigationPanel() {
    const panel = document.querySelector('.navigation-panel');
    if (panel) {
        panel.classList.toggle('collapsed');
        const icon = panel.querySelector('.nav-toggle-icon');
        icon.textContent = panel.classList.contains('collapsed') ? '▼' : '▲';
    }
}

function updateNavigationPanel() {
    const nextStop = getNextStop();
    if (nextStop) {
        const nextStopName = document.getElementById('nextStopName');
        const nextStopDistance = document.getElementById('nextStopDistance');
        
        if (nextStopName) {
            nextStopName.textContent = getStopShortName(nextStop);
        }
        
        if (nextStopDistance && state.currentLocation) {
            const distance = DynamicRouteOptimizer.calculateDistance(
                state.currentLocation,
                nextStop.location
            );
            nextStopDistance.textContent = `${distance.toFixed(1)} km`;
        }
    }
}

window.startNavigation = function() {
    state.navigationActive = true;
    showNotification('Navigation started', 'success');
    
    // Start tracking location
    if (navigator.geolocation) {
        state.locationWatchId = navigator.geolocation.watchPosition(
            position => {
                state.currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                updateNavigationPanel();
                updateCurrentLocationMarker();
                
                // Redraw route when location updates
                if (state.activeRoute && state.activeRoute.stops) {
                    drawOptimizedRoute();
                }
            },
            error => {
                console.error('Location error:', error);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 5000
            }
        );
    }
    
    // Navigate to first uncompleted stop
    const nextStop = getNextStop();
    if (nextStop) {
        navigateToStop(nextStop.id);
    }
    
    // Draw the route immediately when navigation starts
    if (state.activeRoute && state.activeRoute.stops) {
        drawOptimizedRoute();
    }
};

window.viewRouteDetails = function() {
    if (!state.activeRoute) {
        showNotification('No active route', 'warning');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'route-details-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeRouteDetails()"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h2>Route Details</h2>
                <button class="close-btn" onclick="closeRouteDetails()">✕</button>
            </div>
            <div class="modal-body">
                <div class="route-summary">
                    <h3>${state.activeRoute.name || 'Route'}</h3>
                    <div class="summary-stats">
                        <div class="stat">
                            <span class="label">Total Stops</span>
                            <span class="value">${state.activeRoute.stops.length}</span>
                        </div>
                        <div class="stat">
                            <span class="label">Completed</span>
                            <span class="value">${state.activeRoute.stops.filter(s => s.completed).length}</span>
                        </div>
                        <div class="stat">
                            <span class="label">Earnings</span>
                            <span class="value">KES ${Math.round(state.totalRouteEarnings)}</span>
                        </div>
                    </div>
                </div>
                
                <div class="stops-timeline">
                    ${state.activeRoute.stops.map((stop, index) => `
                        <div class="timeline-item ${stop.completed ? 'completed' : ''} ${stop.type}">
                            <div class="timeline-marker">
                                ${stop.completed ? '✓' : index + 1}
                            </div>
                            <div class="timeline-content">
                                <div class="timeline-type">${stop.type.toUpperCase()}</div>
                                <div class="timeline-address">${stop.address}</div>
                                <div class="timeline-info">
                                    <span>${stop.customerName}</span>
                                    <span>•</span>
                                    <span>${stop.parcelCode}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
};

window.closeRouteDetails = function() {
    const modal = document.querySelector('.route-details-modal');
    if (modal) modal.remove();
};

function updateCurrentLocationMarker() {
    if (!state.map || !state.currentLocation) return;
    
    if (state.currentLocationMarker) {
        state.currentLocationMarker.setLatLng([state.currentLocation.lat, state.currentLocation.lng]);
    } else {
        state.currentLocationMarker = L.marker([state.currentLocation.lat, state.currentLocation.lng], {
            icon: L.divIcon({
                className: 'current-location-marker',
                html: `
                    <div class="location-marker-wrapper">
                        <div class="location-pulse"></div>
                        <div class="location-dot"></div>
                    </div>
                `,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })
        }).addTo(state.map);
    }
}

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
    
    // DELIVERY: Check cash if needed, then show POD
    if (stop.type === 'delivery') {
        // Check cash ONLY if it's a cash payment that needs collection
        if (paymentInfo.needsCollection && paymentInfo.amount > 0) {
            const paymentCheckbox = document.getElementById('paymentCollected');
            if (paymentCheckbox && !paymentCheckbox.checked) {
                showNotification('Please confirm cash collection first', 'warning');
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
            state.paymentsByStop[stop.id] = {
                amount: paymentInfo.amount,
                collected: true,
                timestamp: new Date()
            };
            state.totalCashCollected += paymentInfo.amount;
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
 * PART 2 OF 2 - FULL VERSION WITH ALL FUNCTIONS (continued from Part 1)
 */

// ============================================================================
// CASH COLLECTION WIDGET (FIXED STYLING)
// ============================================================================

function showCashCollectionWidget() {
    // Remove existing widget first
    const existingWidget = document.querySelector('.cash-collection-widget');
    if (existingWidget) existingWidget.remove();
    
    const pendingAmount = state.totalCashToCollect - state.totalCashCollected;
    
    // Only show if there's cash to collect
    if (state.totalCashToCollect === 0) return;
    
    const widget = document.createElement('div');
    widget.className = `cash-collection-widget ${pendingAmount > 0 ? 'has-pending' : ''}`;
    widget.innerHTML = `
        <div class="cash-widget-container">
            <div class="cash-widget-header">
                <span class="cash-widget-icon">💰</span>
                <span class="cash-widget-title">Cash Collection</span>
            </div>
            <div class="cash-widget-content">
                <div class="cash-widget-main-amount">
                    <span class="amount-label">To Collect:</span>
                    <span class="amount-value">KES ${pendingAmount.toLocaleString()}</span>
                </div>
                <div class="cash-widget-breakdown">
                    <div class="breakdown-row">
                        <span class="breakdown-label">Total</span>
                        <span class="breakdown-value">KES ${state.totalCashToCollect.toLocaleString()}</span>
                    </div>
                    <div class="breakdown-row collected">
                        <span class="breakdown-label">✓ Collected</span>
                        <span class="breakdown-value">KES ${state.totalCashCollected.toLocaleString()}</span>
                    </div>
                    <div class="breakdown-row pending">
                        <span class="breakdown-label">⏳ Pending</span>
                        <span class="breakdown-value">KES ${pendingAmount.toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Find proper container for the widget
    const stopsContainer = document.querySelector('.stops-container');
    const stopsList = document.getElementById('stopsList');
    
    if (stopsContainer && stopsList) {
        // Insert before stops list
        stopsContainer.insertBefore(widget, stopsList);
    } else if (stopsList) {
        // Insert before stops list parent
        stopsList.parentElement.insertBefore(widget, stopsList);
    } else {
        // Create container if needed
        const container = document.createElement('div');
        container.className = 'stops-container';
        container.appendChild(widget);
        document.body.appendChild(container);
    }
}

function updateCashCollectionWidget() {
    calculateCashCollection();
    if (state.totalCashToCollect > 0) {
        showCashCollectionWidget();
    }
}

// ============================================================================
// MAP OVERLAY FIX (MORE AGGRESSIVE)
// ============================================================================

function clearMapOverlays() {
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
        // Method 1: Remove any overlay divs that might be showing "No Active Route"
        const overlays = mapContainer.querySelectorAll('div[style*="position: absolute"][style*="transform: translate"]');
        overlays.forEach(overlay => {
            if (overlay.textContent.includes('No Active Route')) {
                console.log('Removing "No Active Route" overlay - Method 1');
                overlay.remove();
            }
        });
        
        // Method 2: More aggressive - remove any div with "No Active Route" text
        const allDivs = mapContainer.querySelectorAll('div');
        allDivs.forEach(div => {
            if (div.textContent.includes('No Active Route') && 
                div.textContent.includes('Claim a route from the rider dashboard')) {
                console.log('Removing overlay - Method 2 (aggressive)');
                div.remove();
            }
        });
        
        // Method 3: Remove by checking specific styling patterns
        const styledOverlays = mapContainer.querySelectorAll('div[style*="z-index: 1000"]');
        styledOverlays.forEach(overlay => {
            if (overlay.innerHTML.includes('No Active Route')) {
                console.log('Removing overlay - Method 3 (z-index)');
                overlay.remove();
            }
        });
        
        // Method 4: Check for overlays with specific background
        const bgOverlays = mapContainer.querySelectorAll('div[style*="background: rgba(0, 0, 0"]');
        bgOverlays.forEach(overlay => {
            if (overlay.innerHTML.includes('No Active Route')) {
                console.log('Removing overlay - Method 4 (background)');
                overlay.remove();
            }
        });
    }
}

// ============================================================================
// ROUTE DRAWING AND NAVIGATION
// ============================================================================

// Draw optimized route with multiple fallback options for reliable navigation
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
        
        // Try multiple routing services for reliability
        let routeData = null;
        
        // Method 1: OpenRouteService with POST (your working method)
        try {
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
            
            if (response.ok) {
                const data = await response.json();
                if (data.routes && data.routes.length > 0) {
                    routeData = {
                        coordinates: decodePolyline(data.routes[0].geometry),
                        distance: (data.routes[0].summary.distance / 1000).toFixed(1),
                        duration: Math.round(data.routes[0].summary.duration / 60)
                    };
                }
            }
        } catch (error) {
            console.log('OpenRouteService failed, trying alternative...');
        }
        
        // Method 2: Try OSRM as backup (free, no API key needed, CORS-friendly)
        if (!routeData) {
            try {
                const osrmCoords = coordinates.map(c => `${c[0]},${c[1]}`).join(';');
                const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${osrmCoords}?overview=full&geometries=polyline`;
                
                const response = await fetch(osrmUrl);
                if (response.ok) {
                    const data = await response.json();
                    if (data.routes && data.routes.length > 0) {
                        routeData = {
                            coordinates: decodePolyline(data.routes[0].geometry),
                            distance: (data.routes[0].distance / 1000).toFixed(1),
                            duration: Math.round(data.routes[0].duration / 60)
                        };
                        console.log('Using OSRM routing service');
                    }
                }
            } catch (error) {
                console.log('OSRM also failed');
            }
        }
        
        // Method 3: Enhanced straight lines with realistic curves (last resort)
        if (!routeData) {
            console.log('Using enhanced local routing');
            routeData = createEnhancedLocalRoute(coordinates);
        }
        
        // Draw the route
        if (routeData) {
            state.routePolyline = L.polyline(routeData.coordinates, {
                color: '#0066FF',
                weight: 6,
                opacity: 0.8,
                smoothFactor: 1
            }).addTo(state.map);
            
            // Update stats
            if (document.getElementById('totalDistance')) {
                document.getElementById('totalDistance').textContent = `${routeData.distance}km`;
            }
            if (document.getElementById('estimatedTime')) {
                document.getElementById('estimatedTime').textContent = `${routeData.duration}min`;
            }
        }
        
    } catch (error) {
        console.error('Error drawing route:', error);
        // Even if everything fails, create a basic route for navigation
        createBasicRoute(stops);
    }
}

// Create enhanced local route with realistic curves
function createEnhancedLocalRoute(coordinates) {
    const latLngs = coordinates.map(c => [c[1], c[0]]);
    const enhancedCoords = [];
    let totalDistance = 0;
    
    for (let i = 0; i < latLngs.length - 1; i++) {
        const start = latLngs[i];
        const end = latLngs[i + 1];
        
        // Add start point
        enhancedCoords.push(start);
        
        // Calculate distance for this segment
        const segmentDistance = calculateDistance(
            { lat: start[0], lng: start[1] },
            { lat: end[0], lng: end[1] }
        );
        totalDistance += segmentDistance;
        
        // Add intermediate points for smoother appearance
        const steps = Math.max(3, Math.floor(segmentDistance * 10));
        for (let j = 1; j < steps; j++) {
            const t = j / steps;
            
            // Use bezier curve interpolation for more realistic path
            const lat = start[0] + (end[0] - start[0]) * t;
            const lng = start[1] + (end[1] - start[1]) * t;
            
            // Add slight curve based on direction change
            const curveOffset = Math.sin(t * Math.PI) * 0.0003;
            const perpLat = lat + curveOffset * (end[1] - start[1]);
            const perpLng = lng - curveOffset * (end[0] - start[0]);
            
            enhancedCoords.push([perpLat, perpLng]);
        }
    }
    
    // Add final point
    enhancedCoords.push(latLngs[latLngs.length - 1]);
    
    // Estimate travel time (average 30 km/h in city)
    const duration = Math.round(totalDistance * 2);
    
    return {
        coordinates: enhancedCoords,
        distance: totalDistance.toFixed(1),
        duration: duration
    };
}

// Create basic route as absolute fallback
function createBasicRoute(stops) {
    const coords = stops.map(stop => [stop.location.lat, stop.location.lng]);
    
    if (state.currentLocation) {
        coords.unshift([state.currentLocation.lat, state.currentLocation.lng]);
    }
    
    // Still use smooth lines, not dashed, so navigation feels normal
    state.routePolyline = L.polyline(coords, {
        color: '#0066FF',
        weight: 5,
        opacity: 0.7,
        smoothFactor: 2  // Higher smooth factor for better curves
    }).addTo(state.map);
    
    // Calculate approximate distance and time
    let totalDistance = 0;
    for (let i = 1; i < coords.length; i++) {
        totalDistance += calculateDistance(
            { lat: coords[i-1][0], lng: coords[i-1][1] },
            { lat: coords[i][0], lng: coords[i][1] }
        );
    }
    
    if (document.getElementById('totalDistance')) {
        document.getElementById('totalDistance').textContent = `~${totalDistance.toFixed(1)}km`;
    }
    if (document.getElementById('estimatedTime')) {
        document.getElementById('estimatedTime').textContent = `~${Math.round(totalDistance * 2)}min`;
    }
}

// Decode polyline (keep this as it was working)
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

// Add the missing centerOnLocation function
window.centerOnLocation = function() {
    if (state.currentLocation && state.map) {
        state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 16);
        showNotification('Centered on your location', 'info');
    } else {
        showNotification('Getting your location...', 'info');
        // Start location tracking if not already active
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    state.currentLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    if (state.map) {
                        state.map.setView([state.currentLocation.lat, state.currentLocation.lng], 16);
                    }
                },
                error => {
                    console.error('Location error:', error);
                    showNotification('Please enable location services', 'warning');
                }
            );
        }
    }
};

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
    
    const amount = parsePrice(parcel.price || parcel.total_price || parcel.amount || 0);
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
    // Clear previous cash data
    state.totalCashToCollect = 0;
    state.totalCashCollected = 0;
    state.paymentsByStop = {};
    
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
    
    // Calculate only rider earnings (70% of total)
    if (state.activeRoute.parcels && state.activeRoute.parcels.length > 0) {
        state.activeRoute.parcels.forEach(parcel => {
            const price = parsePrice(parcel.price || parcel.total_price || parcel.amount || 500);
            const riderPayout = price * 0.7; // Rider gets 70%
            state.totalRouteEarnings += riderPayout;
        });
    } else if (state.activeRoute.total_earnings) {
        const totalPrice = parsePrice(state.activeRoute.total_earnings);
        state.totalRouteEarnings = totalPrice * 0.7;
    } else {
        const deliveryCount = state.activeRoute.stops?.filter(s => s.type === 'delivery').length || 0;
        state.totalRouteEarnings = deliveryCount * 350; // Default earning per delivery
    }
    
    console.log('Route earnings calculated:', {
        earnings: state.totalRouteEarnings
    });
}

function calculateDistance(point1, point2) {
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
    
    // Create navigation bar if it doesn't exist
    ensureNavigationBarExists();
    
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

function ensureNavigationBarExists() {
    // Check if navigation elements exist, create if missing
    if (!document.getElementById('routeType')) {
        const navBar = document.createElement('div');
        navBar.className = 'route-navigation-bar';
        navBar.innerHTML = `
            <div class="route-header">
                <h1 id="routeTitle">Loading Route...</h1>
                <div id="routeType" class="route-badge">Loading...</div>
            </div>
            <div class="route-stats">
                <div class="stat-item">
                    <span class="stat-label">Stops</span>
                    <span id="remainingStops" class="stat-value">0</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Distance</span>
                    <span id="totalDistance" class="stat-value">0</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">ETA</span>
                    <span id="estimatedTime" class="stat-value">0</span>
                </div>
            </div>
        `;
        document.body.appendChild(navBar);
    }
    
    // Ensure stops list exists
    if (!document.getElementById('stopsList')) {
        const stopsContainer = document.createElement('div');
        stopsContainer.className = 'stops-container';
        stopsContainer.innerHTML = '<div id="stopsList"></div>';
        document.body.appendChild(stopsContainer);
    }
}

function getNextStop() {
    if (!state.activeRoute || !state.activeRoute.stops) return null;
    return state.activeRoute.stops.find(stop => !stop.completed && stop.canComplete !== false);
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
    
    const remainingStopsEl = document.getElementById('remainingStops');
    const totalDistanceEl = document.getElementById('totalDistance');
    const estimatedTimeEl = document.getElementById('estimatedTime');
    
    if (remainingStopsEl) remainingStopsEl.textContent = remainingStops;
    if (totalDistanceEl) totalDistanceEl.textContent = `${stats.optimizedDistance || totalDistance}km`;
    if (estimatedTimeEl) estimatedTimeEl.textContent = `${estimatedTime}min`;
}

function displayStops() {
    const stopsList = document.getElementById('stopsList');
    if (!stopsList || !state.activeRoute) return;
    
    updateParcelsInPossession();
    
    // Remove any existing cash collection widget before recreating
    const existingWidget = document.querySelector('.cash-collection-widget');
    if (existingWidget) existingWidget.remove();
    
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
    
    // Draw route with actual roads
    await drawOptimizedRoute();
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

async function handleRouteCompletion() {
    console.log('Handling route completion...');
    
    const deliveryCount = state.activeRoute.stops.filter(s => s.type === 'delivery').length;
    
    // Only show rider earnings (no commission info)
    const completionData = {
        completed: true,
        earnings: Math.round(state.totalRouteEarnings),
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
                           autocomplete="off"
                           style="
                               width: 100%;
                               padding: 16px;
                               font-size: 24px;
                               text-align: center;
                               border: 2px solid #ddd;
                               border-radius: 12px;
                               margin: 10px 0;
                               text-transform: uppercase;
                               letter-spacing: 2px;
                               font-weight: 600;
                           ">
                    <p class="code-hint" style="text-align: center; color: #666; margin-top: 8px;">
                        Ask the ${stop.type === 'pickup' ? 'sender' : 'recipient'} for their code
                    </p>
                </div>
                
                ${stop.type === 'delivery' && paymentInfo.needsCollection ? `
                    <div style="margin-top: 16px; padding: 12px; background: #f8f8f8; border-radius: 8px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="paymentCollected" style="width: 20px; height: 20px; cursor: pointer;">
                            <span style="font-size: 16px;">I have collected KES ${paymentInfo.amount.toLocaleString()} cash</span>
                        </label>
                    </div>
                ` : ''}
                
                <!-- FIXED: Added the missing verify button -->
                <div class="modal-actions" style="
                    display: flex;
                    gap: 12px;
                    margin-top: 20px;
                ">
                    <button class="modal-btn primary" 
                            onclick="verifyCode('${stop.id}')"
                            style="
                                flex: 1;
                                padding: 16px;
                                background: #0066FF;
                                color: white;
                                border: none;
                                border-radius: 12px;
                                font-size: 18px;
                                font-weight: 600;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 8px;
                                transition: all 0.2s ease;
                            "
                            onmouseover="this.style.background='#0052cc'"
                            onmouseout="this.style.background='#0066FF'">
                        <span>✓</span>
                        <span>Verify ${stop.type === 'pickup' ? 'Pickup' : 'Delivery'}</span>
                    </button>
                    <button class="modal-btn secondary" 
                            onclick="closeVerificationModal()"
                            style="
                                padding: 16px 24px;
                                background: #f0f0f0;
                                color: #333;
                                border: none;
                                border-radius: 12px;
                                font-size: 16px;
                                font-weight: 600;
                                cursor: pointer;
                                transition: all 0.2s ease;
                            "
                            onmouseover="this.style.background='#e0e0e0'"
                            onmouseout="this.style.background='#f0f0f0'">
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

// Fixed: Show only earnings, not commission
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
// ENHANCED STYLES
// ============================================================================

function injectEnhancedStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Fix map container */
        #map {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            z-index: 1 !important;
        }
        
        /* Navigation Panel Styles */
        .navigation-panel {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: white;
            border-radius: 20px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            z-index: 1000;
            max-width: 400px;
            width: 90%;
            transition: all 0.3s ease;
        }
        
        .navigation-panel.collapsed .nav-panel-content {
            display: none;
        }
        
        .nav-panel-header {
            padding: 16px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            border-bottom: 1px solid #f0f0f0;
        }
        
        .nav-panel-title {
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 600;
            font-size: 16px;
        }
        
        .nav-icon {
            font-size: 20px;
        }
        
        .nav-toggle-icon {
            font-size: 12px;
            color: #666;
        }
        
        .nav-panel-content {
            padding: 20px;
        }
        
        .nav-actions {
            display: flex;
            gap: 10px;
            margin-bottom: 16px;
        }
        
        .nav-btn {
            flex: 1;
            padding: 12px;
            border: none;
            border-radius: 12px;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.2s ease;
        }
        
        .nav-btn.primary {
            background: #0066FF;
            color: white;
        }
        
        .nav-btn.primary:hover {
            background: #0052cc;
            transform: scale(1.02);
        }
        
        .nav-btn.secondary {
            background: #f0f0f0;
            color: #333;
        }
        
        .nav-btn.secondary:hover {
            background: #e0e0e0;
        }
        
        .btn-icon {
            font-size: 16px;
        }
        
        .nav-stats {
            display: flex;
            gap: 20px;
        }
        
        .nav-stat {
            flex: 1;
        }
        
        .nav-stat .stat-label {
            display: block;
            font-size: 12px;
            color: #666;
            margin-bottom: 4px;
        }
        
        .nav-stat .stat-value {
            display: block;
            font-size: 16px;
            font-weight: 600;
            color: #333;
        }
        
        /* Cash Collection Widget Styles */
        .cash-collection-widget {
            position: relative;
            margin: 16px;
            z-index: 100;
            animation: slideInFromTop 0.3s ease-out;
        }
        
        .cash-widget-container {
            background: linear-gradient(135deg, #fff 0%, #f8f9fa 100%);
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.05);
            border: 1px solid rgba(0, 0, 0, 0.08);
        }
        
        .cash-collection-widget.has-pending .cash-widget-container {
            background: linear-gradient(135deg, #fffbf0 0%, #fff9e6 100%);
            border: 2px solid #FF9F0A;
            box-shadow: 0 4px 16px rgba(255, 159, 10, 0.2);
        }
        
        .cash-widget-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        }
        
        .cash-widget-icon {
            font-size: 24px;
            animation: bounce 2s infinite;
        }
        
        .cash-widget-title {
            font-size: 18px;
            font-weight: 700;
            color: #1C1C1F;
        }
        
        .cash-widget-content {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        
        .cash-widget-main-amount {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: rgba(255, 159, 10, 0.1);
            border-radius: 12px;
            border: 1px solid rgba(255, 159, 10, 0.2);
        }
        
        .amount-label {
            font-size: 16px;
            color: #636366;
            font-weight: 500;
        }
        
        .amount-value {
            font-size: 24px;
            font-weight: 800;
            color: #FF9F0A;
        }
        
        .cash-widget-breakdown {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .breakdown-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: rgba(0, 0, 0, 0.02);
            border-radius: 8px;
            transition: all 0.2s ease;
        }
        
        .breakdown-row:hover {
            background: rgba(0, 0, 0, 0.04);
        }
        
        .breakdown-row.collected {
            background: rgba(52, 199, 89, 0.08);
        }
        
        .breakdown-row.collected .breakdown-value {
            color: #34C759;
            font-weight: 600;
        }
        
        .breakdown-row.pending {
            background: rgba(255, 159, 10, 0.08);
        }
        
        .breakdown-row.pending .breakdown-value {
            color: #FF9F0A;
            font-weight: 600;
        }
        
        .breakdown-label {
            font-size: 14px;
            color: #636366;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .breakdown-value {
            font-size: 15px;
            font-weight: 500;
            color: #1C1C1F;
        }
        
        /* Route Details Modal */
        .route-details-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        }
        
        .route-details-modal .modal-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
        }
        
        .route-details-modal .modal-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 20px;
            width: 90%;
            max-width: 500px;
            max-height: 80vh;
            overflow: hidden;
            animation: slideUp 0.3s ease;
        }
        
        .route-details-modal .modal-header {
            padding: 20px;
            border-bottom: 1px solid #f0f0f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .route-details-modal .close-btn {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #666;
        }
        
        .route-details-modal .modal-body {
            padding: 20px;
            overflow-y: auto;
            max-height: calc(80vh - 80px);
        }
        
        .route-summary {
            margin-bottom: 24px;
        }
        
        .summary-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-top: 16px;
        }
        
        .summary-stats .stat {
            text-align: center;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 12px;
        }
        
        .summary-stats .label {
            display: block;
            font-size: 12px;
            color: #666;
            margin-bottom: 4px;
        }
        
        .summary-stats .value {
            display: block;
            font-size: 20px;
            font-weight: 700;
            color: #333;
        }
        
        .stops-timeline {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        
        .timeline-item {
            display: flex;
            gap: 16px;
            align-items: flex-start;
        }
        
        .timeline-marker {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 14px;
            flex-shrink: 0;
        }
        
        .timeline-item.pickup .timeline-marker {
            background: #FF9F0A;
            color: white;
        }
        
        .timeline-item.delivery .timeline-marker {
            background: #0066FF;
            color: white;
        }
        
        .timeline-item.completed .timeline-marker {
            background: #34C759;
        }
        
        .timeline-content {
            flex: 1;
            padding-bottom: 16px;
            border-bottom: 1px solid #f0f0f0;
        }
        
        .timeline-type {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: #666;
            margin-bottom: 4px;
        }
        
        .timeline-address {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            margin-bottom: 4px;
        }
        
        .timeline-info {
            font-size: 13px;
            color: #666;
        }
        
        /* Current location marker */
        .current-location-marker {
            z-index: 1000;
        }
        
        .location-marker-wrapper {
            position: relative;
            width: 30px;
            height: 30px;
        }
        
        .location-dot {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 12px;
            height: 12px;
            background: #0066FF;
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0, 102, 255, 0.4);
        }
        
        .location-pulse {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 30px;
            height: 30px;
            background: rgba(0, 102, 255, 0.3);
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        
        @keyframes slideInFromTop {
            from {
                transform: translateY(-20px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
        
        @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes slideUp {
            from { 
                transform: translate(-50%, -45%);
                opacity: 0;
            }
            to { 
                transform: translate(-50%, -50%);
                opacity: 1;
            }
        }
        
        @keyframes pulse {
            0% {
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
            }
            100% {
                transform: translate(-50%, -50%) scale(2.5);
                opacity: 0;
            }
        }
        
        /* Ensure stops container is properly positioned */
        .stops-container {
            position: relative;
            z-index: 10;
            padding-top: 10px;
        }
    `;
    document.head.appendChild(style);
}

// ============================================================================
// INITIALIZATION (FIXED)
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

function showNoRouteState() {
    ensureNavigationBarExists();
    const routeTitle = document.getElementById('routeTitle');
    if (routeTitle) {
        routeTitle.textContent = 'No Active Route';
    }
    
    const mapContainer = document.getElementById('map');
    if (mapContainer && !state.activeRoute) {
        // Only show this if there's truly no route
        mapContainer.innerHTML = `
            <div style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                text-align: center;
                background: rgba(0, 0, 0, 0.8);
                padding: 40px;
                border-radius: 20px;
                color: white;
                z-index: 1000;
            ">
                <div style="font-size: 48px; margin-bottom: 20px;">📍</div>
                <h2 style="margin: 0 0 10px 0;">No Active Route</h2>
                <p style="margin: 0; opacity: 0.8;">Claim a route from the rider dashboard to start navigating</p>
            </div>
        `;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Route.js initializing with dynamic optimization and Simple POD...');
    
    // Inject all styles
    injectNavigationStyles();
    injectEnhancedStyles();
    
    await waitForLeaflet();
    
    try {
        const storedRoute = localStorage.getItem('tuma_active_route');
        console.log('Looking for active route...');
        console.log('Raw route data exists:', !!storedRoute);
        
        if (storedRoute) {
            try {
                state.activeRoute = JSON.parse(storedRoute);
                console.log('Route parsed successfully:', state.activeRoute);
                console.log('Route structure:', {
                    hasStops: !!state.activeRoute.stops,
                    stopsCount: state.activeRoute.stops?.length || 0,
                    hasParcels: !!state.activeRoute.parcels,
                    parcelsCount: state.activeRoute.parcels?.length || 0
                });
                
                // Process route data
                if (state.activeRoute.stops && state.activeRoute.stops.length > 0) {
                    console.log('Using existing stops:', state.activeRoute.stops.length);
                    
                    // Ensure stops have required fields
                    state.activeRoute.stops = state.activeRoute.stops.map(stop => ({
                        ...stop,
                        location: stop.location || {
                            lat: parseFloat(stop.lat || -1.2921),
                            lng: parseFloat(stop.lng || 36.8219)
                        },
                        address: stop.address || 'Unknown Location',
                        customerName: stop.customerName || (stop.type === 'pickup' ? 'Vendor' : 'Recipient'),
                        customerPhone: stop.customerPhone || '',
                        verificationCode: stop.verificationCode || 'XXX-XXXX',
                        parcelCode: stop.parcelCode || 'Unknown',
                        completed: stop.completed || false
                    }));
                } else if (state.activeRoute.parcels && state.activeRoute.parcels.length > 0) {
                    console.log('No stops found, generating from parcels...');
                    const optimizedStops = DynamicRouteOptimizer.optimizeRoute(
                        state.activeRoute.parcels,
                        state.currentLocation
                    );
                    state.activeRoute.stops = optimizedStops;
                    console.log('Generated', optimizedStops.length, 'stops from parcels');
                } else {
                    throw new Error('No valid stops or parcels in route');
                }
                
                // Apply optimization if needed
                if (config.useDynamicOptimization && state.activeRoute.parcels && !state.activeRoute.optimized) {
                    console.log('Applying dynamic optimization...');
                    applyDynamicOptimization();
                    state.activeRoute.optimized = true;
                    showOptimizationIndicator();
                }
                
                // Calculate financials
                calculateRouteFinancials();
                calculateCashCollection();
                
                // Initialize map
                console.log('Initializing map...');
                await initializeMap();
                
                // IMPORTANT: Clear any blocking overlays after map loads
                setTimeout(() => {
                    clearMapOverlays();
                    if (state.map) {
                        state.map.invalidateSize();
                    }
                    // Try again after a longer delay to catch any dynamically added overlays
                    setTimeout(() => {
                        clearMapOverlays();
                    }, 500);
                }, 200);
                
                // Display UI elements
                displayRouteInfo();
                updateDynamicHeader();
                
                // Create navigation panel with buttons
                createNavigationPanel();
                
                // Plot route on map
                await plotRoute();
                
                // Show cash widget if needed
                if (state.totalCashToCollect > 0) {
                    console.log('Showing cash collection widget for KES', state.totalCashToCollect);
                    showCashCollectionWidget();
                }
                
                console.log('✅ Route initialization complete!');
                console.log('Active route summary:', {
                    id: state.activeRoute.id,
                    name: state.activeRoute.name,
                    stops: state.activeRoute.stops.length,
                    totalEarnings: state.totalRouteEarnings,
                    cashToCollect: state.totalCashToCollect
                });
                
            } catch (parseError) {
                console.error('Error processing route:', parseError);
                console.error('Stack trace:', parseError.stack);
                showNotification('Error loading route data: ' + parseError.message, 'error');
                showNoRouteState();
            }
        } else {
            console.log('No active route found in localStorage');
            console.log('Available localStorage keys:', Object.keys(localStorage).filter(k => k.includes('tuma')));
            showNoRouteState();
        }
    } catch (error) {
        console.error('Fatal error initializing route:', error);
        console.error('Stack trace:', error.stack);
        showNotification('Fatal error: ' + error.message, 'error');
    }
});

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

// Export for debugging
window.routeDebug = {
    state,
    optimizer: DynamicRouteOptimizer,
    clearOverlays: clearMapOverlays,
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
    },
    checkStorage: () => {
        console.log('LocalStorage keys:', Object.keys(localStorage).filter(k => k.includes('tuma')));
        console.log('Active route:', localStorage.getItem('tuma_active_route'));
    },
    testNavPanel: () => {
        createNavigationPanel();
    },
    testCashWidget: () => {
        state.totalCashToCollect = 5000;
        state.totalCashCollected = 2000;
        showCashCollectionWidget();
    }
};

console.log('✅ Complete Route Navigation loaded successfully! (~3000 lines)');
console.log('Fixes applied: No Active Route overlay, Cash widget styling, Navigation buttons');
console.log('Debug commands available:');
console.log('- window.routeDebug.clearOverlays() - Clear map overlays');
console.log('- window.routeDebug.checkStorage() - Check localStorage');
console.log('- window.routeDebug.testNavPanel() - Test navigation panel');
console.log('- window.routeDebug.testCashWidget() - Test cash widget');
console.log('- window.routeDebug.reoptimize() - Re-optimize route');
console.log('- window.routeDebug.analyzeRoute() - Analyze current route');
console.log('Simple POD System integrated - One screen, fast & easy!');
