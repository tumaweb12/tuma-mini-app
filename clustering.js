/**
 * clustering.js - Tuma Route Clustering Module
 * 
 * Intelligent route clustering for delivery optimization in Nairobi
 * Considers pickup proximity, delivery corridors, and service types
 * 
 * @module clustering
 * @version 1.0.0
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CLUSTERING_CONFIG = {
    // Distance thresholds by service type (km)
    maxPickupRadius: {
        express: 2,
        smart: 3,
        eco: 4
    },
    
    // Clustering time windows (minutes)
    clusteringWindows: {
        express: 10,
        smart: 20,
        eco: 60
    },
    
    // Route size constraints
    minClusterSize: {
        express: 1,
        smart: 1,
        eco: 3
    },
    
    maxClusterSize: {
        express: 3,
        smart: 6,
        eco: 10
    },
    
    // Quality thresholds
    maxRouteDistance: 25,
    maxPickupChainDistance: 15,
    maxPickupSegment: 5,
    minClusterScore: 50
};

// Nairobi delivery corridors
const DELIVERY_CORRIDORS = {
    'north': {
        areas: ['Gigiri', 'UN Complex', 'Village Market', 'Rosslyn', 'Runda', 'Muthaiga'],
        angle: 0
    },
    'northeast': {
        areas: ['Kasarani', 'Roysambu', 'Thika Road', 'Garden Estate', 'Kahawa'],
        angle: 45
    },
    'east': {
        areas: ['Eastlands', 'Buruburu', 'Donholm', 'Umoja', 'Embakasi', 'Pipeline'],
        angle: 90
    },
    'southeast': {
        areas: ['South B', 'South C', 'Industrial Area', 'Imara Daima', 'Syokimau'],
        angle: 135
    },
    'south': {
        areas: ['Karen', 'Langata', 'Hardy', 'Bomas', 'Rongai', 'Ngong'],
        angle: 180
    },
    'southwest': {
        areas: ['Kilimani', 'Lavington', 'Kileleshwa', 'Riverside', 'Hurlingham'],
        angle: 225
    },
    'west': {
        areas: ['Westlands', 'Parklands', 'Spring Valley', 'Loresho', 'Mountain View'],
        angle: 270
    },
    'northwest': {
        areas: ['Kiambu Road', 'Ridgeways', 'Runda Estate', 'Nyari', 'Kikuyu'],
        angle: 315
    },
    'central': {
        areas: ['CBD', 'Upper Hill', 'Community', 'Pangani', 'Ngara'],
        angle: null
    }
};

// ============================================================================
// MAIN CLUSTERING CLASS
// ============================================================================

class TumaRouteClustering {
    constructor(config = {}) {
        this.config = { ...CLUSTERING_CONFIG, ...config };
        this.distanceCache = new Map();
    }
    
    /**
     * Create optimized routes from an array of parcels
     * This is the main entry point for rider.js
     * 
     * @param {Array} parcels - Array of parcel objects from Supabase
     * @returns {Array} Array of optimized route objects
     */
    createOptimizedRoutes(parcels) {
        if (!parcels || parcels.length === 0) {
            console.log('[Clustering] No parcels to cluster');
            return [];
        }
        
        console.log(`[Clustering] Processing ${parcels.length} parcels`);
        
        // Step 1: Validate and enrich parcel data
        const validParcels = this.preprocessParcels(parcels);
        
        if (validParcels.length === 0) {
            console.warn('[Clustering] No valid parcels after preprocessing');
            return [];
        }
        
        // Step 2: Group parcels by service type and area
        const groups = this.groupParcels(validParcels);
        
        // Step 3: Create clusters within each group
        const allClusters = [];
        for (const [key, groupParcels] of Object.entries(groups)) {
            const clusters = this.createClustersForGroup(groupParcels, key);
            allClusters.push(...clusters);
        }
        
        // Step 4: Convert clusters to route objects
        const routes = allClusters.map((cluster, index) => 
            this.createRouteFromCluster(cluster, index)
        );
        
        // Step 5: Sort by quality score
        routes.sort((a, b) => b.qualityScore - a.qualityScore);
        
        console.log(`[Clustering] Created ${routes.length} routes`);
        return routes;
    }
    
    /**
     * Preprocess parcels to ensure data validity
     */
    preprocessParcels(parcels) {
        return parcels.filter(parcel => {
            // Check essential fields
            if (!parcel.id || !parcel.status) {
                console.warn('[Clustering] Parcel missing essential data:', parcel);
                return false;
            }
            
            // Ensure valid status
            if (parcel.status !== 'submitted' || parcel.rider_id) {
                return false;
            }
            
            // Get and validate locations
            const pickup = this.getPickupLocation(parcel);
            const delivery = this.getDeliveryLocation(parcel);
            
            if (!this.isValidLocation(pickup) || !this.isValidLocation(delivery)) {
                console.warn('[Clustering] Invalid location data for parcel:', parcel.id);
                return false;
            }
            
            // Enrich parcel with computed properties
            parcel._pickup = pickup;
            parcel._delivery = delivery;
            parcel._pickupArea = this.getAreaName(pickup);
            parcel._deliveryArea = this.getAreaName(delivery);
            parcel._deliveryCorridor = this.getLocationCorridor(delivery);
            parcel._distance = this.calculateDistance(pickup, delivery);
            
            return true;
        });
    }
    
    /**
     * Group parcels by service type and pickup area
     */
    groupParcels(parcels) {
        const groups = {};
        
        parcels.forEach(parcel => {
            const serviceType = parcel.customer_choice || 'smart';
            const area = parcel._pickupArea;
            const key = `${serviceType}_${area}`;
            
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(parcel);
        });
        
        return groups;
    }
    
    /**
     * Create clusters for a specific group
     */
    createClustersForGroup(parcels, groupKey) {
        const [serviceType, area] = groupKey.split('_');
        const clusters = [];
        const assigned = new Set();
        
        // Sort parcels by delivery corridor for better clustering
        const sortedParcels = this.sortByDeliveryCorridor(parcels);
        
        for (const seed of sortedParcels) {
            if (assigned.has(seed.id)) continue;
            
            // Try to build a cluster around this seed
            const cluster = this.buildCluster(seed, sortedParcels, assigned, serviceType);
            
            // Validate cluster quality
            if (this.isValidCluster(cluster, serviceType)) {
                clusters.push(cluster);
                cluster.forEach(p => assigned.add(p.id));
            } else {
                // For express/smart, single parcels are OK
                if (serviceType !== 'eco' && cluster.length === 1) {
                    clusters.push(cluster);
                    assigned.add(seed.id);
                }
            }
        }
        
        return clusters;
    }
    
    /**
     * Build a cluster starting from a seed parcel
     */
    buildCluster(seed, candidates, assigned, serviceType) {
        const cluster = [seed];
        const maxSize = this.config.maxClusterSize[serviceType];
        const maxRadius = this.config.maxPickupRadius[serviceType];
        
        // Score all candidates
        const scoredCandidates = candidates
            .filter(c => !assigned.has(c.id) && c.id !== seed.id)
            .map(candidate => ({
                parcel: candidate,
                score: this.calculateClusteringScore(seed, candidate, cluster)
            }))
            .filter(sc => sc.score > 0)
            .sort((a, b) => b.score - a.score);
        
        // Greedily add best candidates
        for (const { parcel: candidate, score } of scoredCandidates) {
            if (cluster.length >= maxSize) break;
            if (assigned.has(candidate.id)) continue;
            
            // Check pickup distance
            const pickupDist = this.calculateDistance(seed._pickup, candidate._pickup);
            if (pickupDist > maxRadius) continue;
            
            // Check if adding maintains cluster quality
            const testCluster = [...cluster, candidate];
            if (this.analyzeClusterQuality(testCluster).isValid) {
                cluster.push(candidate);
            }
        }
        
        return cluster;
    }
    
    /**
     * Calculate score for adding a candidate to a cluster
     */
    calculateClusteringScore(seed, candidate, currentCluster) {
        let score = 0;
        
        // 1. Pickup proximity (40 points max)
        const pickupDist = this.calculateDistance(seed._pickup, candidate._pickup);
        if (pickupDist <= 1) score += 40;
        else if (pickupDist <= 2) score += 30;
        else if (pickupDist <= 3) score += 20;
        else if (pickupDist <= 4) score += 10;
        else return 0; // Too far
        
        // 2. Delivery corridor compatibility (30 points max)
        if (seed._deliveryCorridor === candidate._deliveryCorridor) {
            score += 30;
        } else if (this.areCorridorsAdjacent(seed._deliveryCorridor, candidate._deliveryCorridor)) {
            score += 15;
        } else {
            return 0; // Incompatible corridors
        }
        
        // 3. Same pickup location bonus (10 points)
        if (this.isSameLocation(seed._pickup, candidate._pickup)) {
            score += 10;
        }
        
        // 4. Route efficiency (20 points max)
        const routeEfficiency = this.calculateRouteEfficiency([...currentCluster, candidate]);
        score += Math.min(20, routeEfficiency * 20);
        
        return score;
    }
    
    /**
     * Analyze cluster quality
     */
    analyzeClusterQuality(cluster) {
        const analysis = {
            isValid: true,
            starPattern: false,
            totalDistance: 0,
            pickupRadius: 0,
            corridorCount: 0,
            score: 0
        };
        
        // Check for star pattern
        const deliveryPattern = this.analyzeDeliveryPattern(cluster);
        if (deliveryPattern.angleSpread > 120) {
            analysis.starPattern = true;
            analysis.isValid = false;
            return analysis;
        }
        
        // Check pickup feasibility
        const pickupChain = this.optimizePickupSequence(cluster);
        let pickupDistance = 0;
        for (let i = 0; i < pickupChain.length - 1; i++) {
            const dist = this.calculateDistance(
                pickupChain[i]._pickup,
                pickupChain[i + 1]._pickup
            );
            pickupDistance += dist;
            
            if (dist > this.config.maxPickupSegment) {
                analysis.isValid = false;
                return analysis;
            }
        }
        
        if (pickupDistance > this.config.maxPickupChainDistance) {
            analysis.isValid = false;
            return analysis;
        }
        
        // Calculate total route distance
        analysis.totalDistance = this.calculateClusterDistance(cluster);
        if (analysis.totalDistance > this.config.maxRouteDistance) {
            analysis.isValid = false;
            return analysis;
        }
        
        // Count unique corridors
        const corridors = new Set(cluster.map(p => p._deliveryCorridor));
        analysis.corridorCount = corridors.size;
        
        if (corridors.size > 2) {
            analysis.isValid = false;
            return analysis;
        }
        
        // Calculate quality score
        analysis.score = this.calculateClusterScore(cluster, deliveryPattern, pickupDistance);
        
        if (analysis.score < this.config.minClusterScore) {
            analysis.isValid = false;
        }
        
        return analysis;
    }
    
    /**
     * Analyze delivery pattern for star detection
     */
    analyzeDeliveryPattern(cluster) {
        const bearings = cluster.map(p => 
            this.calculateBearing(p._pickup, p._delivery)
        );
        
        const angleSpread = this.calculateAngleSpread(bearings);
        
        return {
            angleSpread,
            isStarPattern: angleSpread > 120,
            bearings
        };
    }
    
    /**
     * Calculate angle spread
     */
    calculateAngleSpread(angles) {
        if (angles.length < 2) return 0;
        
        angles.sort((a, b) => a - b);
        
        let maxGap = 0;
        for (let i = 0; i < angles.length - 1; i++) {
            maxGap = Math.max(maxGap, angles[i + 1] - angles[i]);
        }
        
        // Check wrap-around gap
        const wrapGap = (360 - angles[angles.length - 1]) + angles[0];
        maxGap = Math.max(maxGap, wrapGap);
        
        return 360 - maxGap;
    }
    
    /**
     * Optimize pickup sequence
     */
    optimizePickupSequence(cluster) {
        if (cluster.length <= 2) return cluster;
        
        // Group by same pickup location
        const locationGroups = new Map();
        cluster.forEach(p => {
            const key = `${p._pickup.lat.toFixed(5)},${p._pickup.lng.toFixed(5)}`;
            if (!locationGroups.has(key)) {
                locationGroups.set(key, []);
            }
            locationGroups.get(key).push(p);
        });
        
        // Build sequence using nearest neighbor
        const sequence = [];
        const visited = new Set();
        
        // Start with northernmost location
        let current = Array.from(locationGroups.values())
            .map(group => group[0])
            .sort((a, b) => b._pickup.lat - a._pickup.lat)[0];
        
        while (sequence.length < locationGroups.size) {
            // Add all parcels from current location
            const key = `${current._pickup.lat.toFixed(5)},${current._pickup.lng.toFixed(5)}`;
            const group = locationGroups.get(key);
            sequence.push(...group);
            visited.add(key);
            
            // Find nearest unvisited location
            let nearest = null;
            let minDist = Infinity;
            
            for (const [locKey, locGroup] of locationGroups) {
                if (visited.has(locKey)) continue;
                
                const dist = this.calculateDistance(current._pickup, locGroup[0]._pickup);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = locGroup[0];
                }
            }
            
            if (!nearest) break;
            current = nearest;
        }
        
        return sequence;
    }
    
    /**
     * Calculate cluster quality score
     */
    calculateClusterScore(cluster, deliveryPattern, pickupDistance) {
        let score = 0;
        
        // Corridor alignment (40 points)
        const corridors = new Set(cluster.map(p => p._deliveryCorridor));
        if (corridors.size === 1) score += 40;
        else if (corridors.size === 2) score += 20;
        
        // Delivery pattern (30 points)
        if (deliveryPattern.angleSpread < 60) score += 30;
        else if (deliveryPattern.angleSpread < 90) score += 20;
        else if (deliveryPattern.angleSpread < 120) score += 10;
        
        // Pickup efficiency (30 points)
        if (pickupDistance <= 5) score += 30;
        else if (pickupDistance <= 10) score += 20;
        else if (pickupDistance <= 15) score += 10;
        
        return score;
    }
    
    /**
     * Validate cluster based on service type
     */
    isValidCluster(cluster, serviceType) {
        const minSize = this.config.minClusterSize[serviceType];
        const quality = this.analyzeClusterQuality(cluster);
        
        return cluster.length >= minSize && quality.isValid;
    }
    
    /**
     * Create route object from cluster
     */
    createRouteFromCluster(cluster, index) {
        const serviceType = cluster[0].customer_choice || 'smart';
        
        const route = {
            id: `route-${Date.now()}-${index}`,
            name: this.generateRouteName(cluster),
            type: serviceType,
            parcels: cluster.map(p => p.id),
            parcelDetails: cluster, // Include full parcel data
            pickups: cluster.length,
            deliveries: cluster.length,
            distance: Math.round(this.calculateClusterDistance(cluster)),
            total_earnings: this.calculateEarnings(cluster),
            status: 'available',
            created_at: new Date().toISOString()
        };
        
        // Add computed properties
        route.earnings_per_km = Math.round(route.total_earnings / Math.max(route.distance, 1));
        route.estimatedTime = this.estimateDeliveryTime(cluster, route.distance);
        route.qualityScore = this.analyzeClusterQuality(cluster).score;
        
        // Add metadata
        route.metadata = {
            pickupAreas: [...new Set(cluster.map(p => p._pickupArea))],
            deliveryCorridors: [...new Set(cluster.map(p => p._deliveryCorridor))],
            hasReturnTrip: this.checkReturnOpportunity(cluster),
            pickupSequence: this.optimizePickupSequence(cluster).map(p => p.id)
        };
        
        return route;
    }
    
    /**
     * Generate descriptive route name
     */
    generateRouteName(cluster) {
        const pickupAreas = [...new Set(cluster.map(p => p._pickupArea))];
        const deliveryAreas = [...new Set(cluster.map(p => p._deliveryArea))];
        
        if (pickupAreas.length === 1 && deliveryAreas.length === 1) {
            if (pickupAreas[0] === deliveryAreas[0]) {
                return `${pickupAreas[0]} Local`;
            }
            return `${pickupAreas[0]} → ${deliveryAreas[0]}`;
        } else if (pickupAreas.length === 1) {
            const corridor = cluster[0]._deliveryCorridor;
            return `${pickupAreas[0]} → ${this.formatCorridorName(corridor)}`;
        }
        
        return 'Mixed Route';
    }
    
    /**
     * Format corridor name for display
     */
    formatCorridorName(corridor) {
        const names = {
            'north': 'North',
            'northeast': 'Northeast',
            'east': 'Eastlands',
            'southeast': 'Southeast',
            'south': 'South',
            'southwest': 'Kilimani Area',
            'west': 'Westlands Area',
            'northwest': 'Northwest',
            'central': 'CBD'
        };
        return names[corridor] || 'Mixed';
    }
    
    /**
     * Calculate total earnings
     */
    calculateEarnings(cluster) {
        return cluster.reduce((sum, p) => sum + (p.rider_payout || 350), 0);
    }
    
    /**
     * Estimate delivery time
     */
    estimateDeliveryTime(cluster, distance) {
        // Base: 2.5 min/km + 5 min per pickup + 3 min per delivery
        let time = distance * 2.5 + cluster.length * 8;
        
        // Add traffic factor
        const hasHighTraffic = cluster.some(p => 
            ['CBD', 'Westlands', 'Eastlands'].includes(p._pickupArea) ||
            ['CBD', 'Westlands', 'Eastlands'].includes(p._deliveryArea)
        );
        
        if (hasHighTraffic) time *= 1.3;
        
        return Math.round(time);
    }
    
    /**
     * Check for return trip opportunity
     */
    checkReturnOpportunity(cluster) {
        if (cluster.length === 0) return false;
        
        const lastDelivery = cluster[cluster.length - 1]._delivery;
        const firstPickup = cluster[0]._pickup;
        
        return this.calculateDistance(lastDelivery, firstPickup) <= 3;
    }
    
    // ========================================================================
    // HELPER METHODS
    // ========================================================================
    
    /**
     * Get pickup location from parcel
     */
    getPickupLocation(parcel) {
        if (parcel._pickup) return parcel._pickup;
        
        if (parcel.pickup_lat && parcel.pickup_lng) {
            return {
                lat: parseFloat(parcel.pickup_lat),
                lng: parseFloat(parcel.pickup_lng)
            };
        }
        
        // Try to parse from JSON
        if (parcel.pickup_location) {
            try {
                const loc = typeof parcel.pickup_location === 'string' 
                    ? JSON.parse(parcel.pickup_location) 
                    : parcel.pickup_location;
                return { lat: loc.lat, lng: loc.lng };
            } catch (e) {
                console.error('[Clustering] Error parsing pickup location:', e);
            }
        }
        
        return null;
    }
    
    /**
     * Get delivery location from parcel
     */
    getDeliveryLocation(parcel) {
        if (parcel._delivery) return parcel._delivery;
        
        if (parcel.delivery_lat && parcel.delivery_lng) {
            return {
                lat: parseFloat(parcel.delivery_lat),
                lng: parseFloat(parcel.delivery_lng)
            };
        }
        
        // Try to parse from JSON
        if (parcel.delivery_location) {
            try {
                const loc = typeof parcel.delivery_location === 'string' 
                    ? JSON.parse(parcel.delivery_location) 
                    : parcel.delivery_location;
                return { lat: loc.lat, lng: loc.lng };
            } catch (e) {
                console.error('[Clustering] Error parsing delivery location:', e);
            }
        }
        
        return null;
    }
    
    /**
     * Validate location
     */
    isValidLocation(location) {
        return location && 
               typeof location.lat === 'number' && 
               typeof location.lng === 'number' &&
               location.lat >= -2 && location.lat <= -1 &&
               location.lng >= 36 && location.lng <= 37;
    }
    
    /**
     * Check if two locations are the same
     */
    isSameLocation(loc1, loc2, precision = 5) {
        return loc1.lat.toFixed(precision) === loc2.lat.toFixed(precision) &&
               loc1.lng.toFixed(precision) === loc2.lng.toFixed(precision);
    }
    
    /**
     * Get area name from location
     */
    getAreaName(location) {
        // Find closest area based on known centers
        let closestArea = 'General';
        let minDistance = Infinity;
        
        const areaCenters = {
            'CBD': { lat: -1.2833, lng: 36.8167 },
            'Westlands': { lat: -1.2634, lng: 36.8097 },
            'Kilimani': { lat: -1.2906, lng: 36.7853 },
            'Karen': { lat: -1.3194, lng: 36.7096 },
            'Eastlands': { lat: -1.2921, lng: 36.8608 },
            'Kasarani': { lat: -1.2225, lng: 36.8973 },
            'Embakasi': { lat: -1.3232, lng: 36.8941 },
            'Langata': { lat: -1.3616, lng: 36.7483 }
        };
        
        for (const [area, center] of Object.entries(areaCenters)) {
            const dist = this.calculateDistance(location, center);
            if (dist < minDistance && dist < 5) { // Within 5km
                minDistance = dist;
                closestArea = area;
            }
        }
        
        return closestArea;
    }
    
    /**
     * Get location corridor
     */
    getLocationCorridor(location) {
        // Calculate bearing from CBD
        const cbd = { lat: -1.2921, lng: 36.8219 };
        const bearing = this.calculateBearing(cbd, location);
        
        // Find matching corridor
        for (const [corridor, data] of Object.entries(DELIVERY_CORRIDORS)) {
            if (data.angle === null) continue; // Skip central
            
            const angleDiff = Math.abs(bearing - data.angle);
            if (angleDiff <= 22.5 || angleDiff >= 337.5) {
                return corridor;
            }
        }
        
        // Check if in CBD
        if (this.calculateDistance(cbd, location) < 2) {
            return 'central';
        }
        
        return 'mixed';
    }
    
    /**
     * Check if corridors are adjacent
     */
    areCorridorsAdjacent(corridor1, corridor2) {
        if (corridor1 === corridor2) return true;
        
        const adjacency = {
            'north': ['northeast', 'northwest', 'central'],
            'northeast': ['north', 'east', 'central'],
            'east': ['northeast', 'southeast', 'central'],
            'southeast': ['east', 'south', 'central'],
            'south': ['southeast', 'southwest'],
            'southwest': ['south', 'west', 'central'],
            'west': ['southwest', 'northwest', 'central'],
            'northwest': ['west', 'north', 'central'],
            'central': ['north', 'east', 'south', 'west']
        };
        
        return adjacency[corridor1]?.includes(corridor2) || false;
    }
    
    /**
     * Sort parcels by delivery corridor
     */
    sortByDeliveryCorridor(parcels) {
        const corridorOrder = [
            'north', 'northeast', 'east', 'southeast',
            'south', 'southwest', 'west', 'northwest', 'central'
        ];
        
        return parcels.sort((a, b) => {
            const indexA = corridorOrder.indexOf(a._deliveryCorridor);
            const indexB = corridorOrder.indexOf(b._deliveryCorridor);
            return indexA - indexB;
        });
    }
    
    /**
     * Calculate bearing between two points
     */
    calculateBearing(start, end) {
        const dLng = (end.lng - start.lng) * Math.PI / 180;
        const lat1 = start.lat * Math.PI / 180;
        const lat2 = end.lat * Math.PI / 180;
        
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        
        let bearing = Math.atan2(y, x) * 180 / Math.PI;
        
        return (bearing + 360) % 360;
    }
    
    /**
     * Calculate distance between two points
     */
    calculateDistance(point1, point2) {
        const key = `${point1.lat},${point1.lng}-${point2.lat},${point2.lng}`;
        
        if (this.distanceCache.has(key)) {
            return this.distanceCache.get(key);
        }
        
        const R = 6371; // Earth's radius in km
        const dLat = (point2.lat - point1.lat) * Math.PI / 180;
        const dLon = (point2.lng - point1.lng) * Math.PI / 180;
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(point1.lat * Math.PI / 180) * 
                Math.cos(point2.lat * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        this.distanceCache.set(key, distance);
        return distance;
    }
    
    /**
     * Calculate total cluster distance
     */
    calculateClusterDistance(cluster) {
        if (cluster.length === 0) return 0;
        
        let total = 0;
        const sequence = this.optimizePickupSequence(cluster);
        
        // Distance to first pickup
        const nairobiCenter = { lat: -1.2921, lng: 36.8219 };
        total += this.calculateDistance(nairobiCenter, sequence[0]._pickup);
        
        // Pickup to pickup distances (visiting each location once)
        const visitedLocations = new Set();
        let lastLocation = sequence[0]._pickup;
        
        for (const parcel of sequence) {
            const locKey = `${parcel._pickup.lat.toFixed(5)},${parcel._pickup.lng.toFixed(5)}`;
            
            if (!visitedLocations.has(locKey)) {
                if (visitedLocations.size > 0) {
                    total += this.calculateDistance(lastLocation, parcel._pickup);
                }
                visitedLocations.add(locKey);
                lastLocation = parcel._pickup;
            }
        }
        
        // All delivery distances
        sequence.forEach(p => {
            total += this.calculateDistance(p._pickup, p._delivery);
        });
        
        return total;
    }
    
    /**
     * Calculate route efficiency
     */
    calculateRouteEfficiency(cluster) {
        const directDistance = cluster.reduce((sum, p) => sum + p._distance, 0);
        const routeDistance = this.calculateClusterDistance(cluster);
        
        return directDistance / Math.max(routeDistance, 1);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

// For ES6 modules
export default TumaRouteClustering;

// For CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TumaRouteClustering;
}

// For browser global
if (typeof window !== 'undefined') {
    window.TumaRouteClustering = TumaRouteClustering;
}
