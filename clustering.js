/**
 * clustering.js - Enhanced Tuma Route Clustering Module
 * 
 * Intelligent route clustering with:
 * - Route awareness (parcels on the way)
 * - Return trip optimization
 * - Smart delivery corridors
 * 
 * @module clustering
 * @version 2.0.0
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
    
    // Route deviation tolerance (km off main route)
    maxRouteDeviation: {
        express: 1.5,
        smart: 2.5,
        eco: 3.5
    },
    
    // Return trip configuration
    returnTrip: {
        maxReturnDistance: 3,      // km from last delivery to new pickup
        maxAngleDeviation: 45,     // degrees from home direction
        bonusMultiplier: 1.15,     // 15% bonus for return trips
        preferredEndLocations: ['CBD', 'Westlands', 'Kilimani'] // Common rider bases
    },
    
    // Clustering time windows (minutes)
    clusteringWindows: {
        express: 15,
        smart: 30,
        eco: 90
    },
    
    // Route size constraints
    minClusterSize: {
        express: 1,
        smart: 1,
        eco: 2  // Reduced from 3 for flexibility
    },
    
    maxClusterSize: {
        express: 4,  // Increased for route efficiency
        smart: 8,
        eco: 12
    },
    
    // Quality thresholds
    maxRouteDistance: 30,
    maxPickupChainDistance: 15,
    maxPickupSegment: 5,
    minClusterScore: 45,  // Reduced for flexibility
    minRouteAwareScore: 55  // Higher score for route-aware clusters
};

// Major Nairobi corridors and routes
const NAIROBI_ROUTES = {
    'waiyaki_way': {
        areas: ['Chiromo', 'Westlands', 'Kangemi', 'Mountain View', 'Kikuyu'],
        connects: ['CBD', 'Western regions']
    },
    'uhuru_highway': {
        areas: ['CBD', 'University Way', 'Pangani', 'Muthaiga'],
        connects: ['CBD', 'Northern regions']
    },
    'mombasa_road': {
        areas: ['CBD', 'South C', 'Industrial Area', 'Imara Daima', 'Syokimau', 'JKIA'],
        connects: ['CBD', 'Airport', 'Eastern regions']
    },
    'langata_road': {
        areas: ['CBD', 'Kilimani', 'Karen', 'Langata', 'Rongai'],
        connects: ['CBD', 'Southern regions']
    },
    'thika_road': {
        areas: ['CBD', 'Pangani', 'Roysambu', 'Kasarani', 'Ruiru'],
        connects: ['CBD', 'Northern regions']
    },
    'kilimani_ring': {
        areas: ['Kilimani', 'Kileleshwa', 'Lavington', 'Hurlingham'],
        connects: ['Westlands', 'Upper Hill', 'CBD']
    }
};

// ============================================================================
// MAIN CLUSTERING CLASS
// ============================================================================

class TumaRouteClustering {
    constructor(config = {}) {
        this.config = { ...CLUSTERING_CONFIG, ...config };
        this.distanceCache = new Map();
        this.routeCache = new Map();
    }
    
    /**
     * Create optimized routes from an array of parcels
     * @param {Array} parcels - Array of parcel objects from Supabase
     * @param {Object} riderInfo - Current rider information (location, preferred end point)
     * @returns {Array} Array of optimized route objects
     */
    createOptimizedRoutes(parcels, riderInfo = {}) {
        if (!parcels || parcels.length === 0) {
            console.log('[Clustering] No parcels to cluster');
            return [];
        }
        
        console.log(`[Clustering] Processing ${parcels.length} parcels with route awareness`);
        
        // Step 1: Validate and enrich parcel data
        const validParcels = this.preprocessParcels(parcels);
        
        if (validParcels.length === 0) {
            console.warn('[Clustering] No valid parcels after preprocessing');
            return [];
        }
        
        // Step 2: Create initial clusters with route awareness
        const clusters = this.createRouteAwareClusters(validParcels);
        
        // Step 3: Optimize for return trips
        const optimizedClusters = this.optimizeReturnTrips(clusters, riderInfo);
        
        // Step 4: Convert clusters to route objects
        const routes = optimizedClusters.map((cluster, index) => 
            this.createRouteFromCluster(cluster, index)
        );
        
        // Step 5: Sort by quality score and return potential
        routes.sort((a, b) => {
            // Prioritize return trips
            if (a.metadata.hasReturnTrip && !b.metadata.hasReturnTrip) return -1;
            if (!a.metadata.hasReturnTrip && b.metadata.hasReturnTrip) return 1;
            return b.qualityScore - a.qualityScore;
        });
        
        console.log(`[Clustering] Created ${routes.length} routes (${routes.filter(r => r.metadata.hasReturnTrip).length} with return trips)`);
        return routes;
    }
    
    /**
     * Create clusters with route awareness
     */
    createRouteAwareClusters(parcels) {
        const clusters = [];
        const assigned = new Set();
        
        // Sort by service priority and location efficiency
        const sorted = this.smartSort(parcels);
        
        for (const seed of sorted) {
            if (assigned.has(seed.id)) continue;
            
            const cluster = this.buildRouteAwareCluster(seed, sorted, assigned);
            
            if (this.isValidCluster(cluster, seed.customer_choice)) {
                clusters.push(cluster);
                cluster.forEach(p => assigned.add(p.id));
            } else if (cluster.length === 1 && seed.customer_choice !== 'eco') {
                // Single parcel routes OK for express/smart
                clusters.push(cluster);
                assigned.add(seed.id);
            }
        }
        
        return clusters;
    }
    
    /**
     * Smart sorting that considers hubs and corridors
     */
    smartSort(parcels) {
        return parcels.sort((a, b) => {
            // Priority order
            const servicePriority = { express: 3, smart: 2, eco: 1 };
            const sPriorityDiff = servicePriority[b.customer_choice] - servicePriority[a.customer_choice];
            if (sPriorityDiff !== 0) return sPriorityDiff;
            
            // Same service type - prefer hub pickups
            const aIsHub = this.isHubLocation(a._pickup);
            const bIsHub = this.isHubLocation(b._pickup);
            if (aIsHub && !bIsHub) return -1;
            if (!aIsHub && bIsHub) return 1;
            
            // Then by creation time
            return new Date(a.created_at) - new Date(b.created_at);
        });
    }
    
    /**
     * Build cluster with route awareness
     */
    buildRouteAwareCluster(seed, candidates, assigned) {
        const cluster = [seed];
        const serviceType = seed.customer_choice;
        const maxSize = this.config.maxClusterSize[serviceType];
        
        // Get the main route for this seed
        const seedRoute = this.getMainRoute(seed._pickup, seed._delivery);
        
        // Find all compatible candidates
        const compatibleCandidates = candidates
            .filter(c => !assigned.has(c.id) && c.id !== seed.id)
            .map(candidate => {
                const score = this.calculateRouteAwareScore(seed, candidate, cluster, seedRoute);
                return { parcel: candidate, score };
            })
            .filter(c => c.score > 0)
            .sort((a, b) => b.score - a.score);
        
        // Build cluster greedily
        for (const { parcel: candidate, score } of compatibleCandidates) {
            if (cluster.length >= maxSize) break;
            if (assigned.has(candidate.id)) continue;
            
            // Test cluster quality with new addition
            const testCluster = [...cluster, candidate];
            const quality = this.analyzeClusterQuality(testCluster);
            
            if (quality.isValid && quality.score >= this.config.minRouteAwareScore) {
                cluster.push(candidate);
            }
        }
        
        return cluster;
    }
    
    /**
     * Calculate score with route awareness
     */
    calculateRouteAwareScore(seed, candidate, currentCluster, seedRoute) {
        let score = 0;
        
        // 1. Service compatibility (15 points)
        if (!this.areServicesCompatible(seed, candidate)) return 0;
        score += seed.customer_choice === candidate.customer_choice ? 15 : 8;
        
        // 2. Route awareness check (35 points) - HIGHEST WEIGHT
        const routeCheck = this.isOnRoute(candidate._pickup, seedRoute);
        if (routeCheck.onRoute) {
            // Perfect score if pickup is directly on route
            score += Math.max(0, 35 - routeCheck.deviation * 10);
        } else {
            // Check if pickup is close to seed pickup
            const pickupDist = this.calculateDistance(seed._pickup, candidate._pickup);
            if (pickupDist <= 0.5) score += 25;  // Very close
            else if (pickupDist <= 1) score += 15;
            else if (pickupDist <= 2) score += 8;
            else if (pickupDist > this.config.maxPickupRadius[seed.customer_choice]) return 0;
        }
        
        // 3. Delivery compatibility (25 points)
        const deliveryScore = this.scoreDeliveryCompatibility(seed, candidate);
        if (deliveryScore === 0) return 0;
        score += deliveryScore;
        
        // 4. Time compatibility (15 points)
        const timeScore = this.scoreTimeCompatibility(seed, candidate);
        score += timeScore;
        
        // 5. Efficiency bonus (10 points)
        const efficiency = this.calculateAdditionEfficiency(currentCluster, candidate);
        score += efficiency * 10;
        
        return score;
    }
    
    /**
     * Check if a pickup is on the route
     */
    isOnRoute(pickup, route) {
        if (!route || route.segments.length === 0) {
            return { onRoute: false };
        }
        
        let minDeviation = Infinity;
        let nearestSegment = null;
        
        for (const segment of route.segments) {
            const deviation = this.pointToLineDistance(pickup, segment.start, segment.end);
            if (deviation < minDeviation) {
                minDeviation = deviation;
                nearestSegment = segment;
            }
        }
        
        const maxDeviation = this.config.maxRouteDeviation[route.serviceType] || 2;
        
        return {
            onRoute: minDeviation <= maxDeviation,
            deviation: minDeviation,
            nearestSegment
        };
    }
    
    /**
     * Get main route between two points
     */
    getMainRoute(start, end) {
        const cacheKey = `${start.lat},${start.lng}-${end.lat},${end.lng}`;
        if (this.routeCache.has(cacheKey)) {
            return this.routeCache.get(cacheKey);
        }
        
        // Determine which major route this likely uses
        const route = {
            start,
            end,
            segments: [],
            serviceType: 'smart'
        };
        
        // Simple approximation - create segments through likely waypoints
        const distance = this.calculateDistance(start, end);
        
        if (distance < 2) {
            // Direct route for short distances
            route.segments = [{ start, end }];
        } else {
            // Identify likely route through Nairobi
            const corridor = this.identifyCorridor(start, end);
            if (corridor) {
                route.segments = this.getCorridorSegments(start, end, corridor);
            } else {
                // Default to direct route
                route.segments = [{ start, end }];
            }
        }
        
        this.routeCache.set(cacheKey, route);
        return route;
    }
    
    /**
     * Identify which corridor a route likely uses
     */
    identifyCorridor(start, end) {
        // Check if route aligns with major corridors
        const bearing = this.calculateBearing(start, end);
        const distance = this.calculateDistance(start, end);
        
        // Simplified corridor detection
        if (bearing > 315 || bearing <= 45) return 'north';
        if (bearing > 45 && bearing <= 135) return 'east';
        if (bearing > 135 && bearing <= 225) return 'south';
        if (bearing > 225 && bearing <= 315) return 'west';
        
        return null;
    }
    
    /**
     * Get corridor segments (simplified)
     */
    getCorridorSegments(start, end, corridor) {
        // For now, return waypoint through common areas
        const waypoints = [];
        
        // Example: If going from Kangemi to Upper Hill
        if (this.isNearArea(start, 'Kangemi') && this.isNearArea(end, 'Upper Hill')) {
            waypoints.push(
                start,
                { lat: -1.2890, lng: 36.7851 }, // Kilimani waypoint
                end
            );
        } else {
            waypoints.push(start, end);
        }
        
        const segments = [];
        for (let i = 0; i < waypoints.length - 1; i++) {
            segments.push({
                start: waypoints[i],
                end: waypoints[i + 1]
            });
        }
        
        return segments;
    }
    
    /**
     * Calculate point to line distance
     */
    pointToLineDistance(point, lineStart, lineEnd) {
        const A = point.lng - lineStart.lng;
        const B = point.lat - lineStart.lat;
        const C = lineEnd.lng - lineStart.lng;
        const D = lineEnd.lat - lineStart.lat;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) param = dot / lenSq;
        
        let xx, yy;
        
        if (param < 0) {
            xx = lineStart.lng;
            yy = lineStart.lat;
        } else if (param > 1) {
            xx = lineEnd.lng;
            yy = lineEnd.lat;
        } else {
            xx = lineStart.lng + param * C;
            yy = lineStart.lat + param * D;
        }
        
        const dx = point.lng - xx;
        const dy = point.lat - yy;
        
        return Math.sqrt(dx * dx + dy * dy) * 111; // Convert to km
    }
    
    /**
     * Optimize clusters for return trips
     */
    optimizeReturnTrips(clusters, riderInfo) {
        const optimized = [];
        const used = new Set();
        
        // Get rider's preferred end location
        const riderEndLocation = this.getRiderEndLocation(riderInfo);
        
        // Try to chain clusters with return opportunities
        for (let i = 0; i < clusters.length; i++) {
            if (used.has(i)) continue;
            
            const cluster = clusters[i];
            const lastDelivery = this.getLastDelivery(cluster);
            
            // Look for return opportunities
            let bestReturn = null;
            let bestScore = 0;
            
            for (let j = 0; j < clusters.length; j++) {
                if (i === j || used.has(j)) continue;
                
                const returnCluster = clusters[j];
                const returnScore = this.scoreReturnTrip(
                    lastDelivery,
                    returnCluster[0]._pickup,
                    riderEndLocation
                );
                
                if (returnScore > bestScore) {
                    bestScore = returnScore;
                    bestReturn = j;
                }
            }
            
            // If good return trip found, combine clusters
            if (bestReturn !== null && bestScore > 70) {
                const combinedCluster = this.combineForReturnTrip(cluster, clusters[bestReturn]);
                optimized.push(combinedCluster);
                used.add(i);
                used.add(bestReturn);
            } else {
                // Check if this cluster ends near rider's preferred location
                const homeScore = this.scoreReturnToBase(lastDelivery, riderEndLocation);
                if (homeScore > 80) {
                    cluster._metadata = { ...cluster._metadata, returnsToBase: true };
                }
                optimized.push(cluster);
                used.add(i);
            }
        }
        
        return optimized;
    }
    
    /**
     * Score a potential return trip
     */
    scoreReturnTrip(lastDelivery, nextPickup, riderEndLocation) {
        let score = 0;
        
        // Distance from last delivery to next pickup
        const distance = this.calculateDistance(lastDelivery, nextPickup);
        if (distance > this.config.returnTrip.maxReturnDistance) return 0;
        
        // Distance score (40 points max)
        score += Math.max(0, 40 - distance * 10);
        
        // Check if it's towards rider's end location (30 points max)
        const bearingToEnd = this.calculateBearing(lastDelivery, riderEndLocation);
        const bearingToPickup = this.calculateBearing(lastDelivery, nextPickup);
        const angleDiff = Math.abs(bearingToEnd - bearingToPickup);
        
        if (angleDiff <= this.config.returnTrip.maxAngleDeviation) {
            score += 30 * (1 - angleDiff / this.config.returnTrip.maxAngleDeviation);
        }
        
        // Efficiency bonus (30 points max)
        const directDistance = this.calculateDistance(lastDelivery, riderEndLocation);
        const viaDistance = distance + this.calculateDistance(nextPickup, riderEndLocation);
        const efficiency = directDistance / viaDistance;
        score += efficiency * 30;
        
        return score;
    }
    
    /**
     * Score return to base
     */
    scoreReturnToBase(lastDelivery, baseLocation) {
        const distance = this.calculateDistance(lastDelivery, baseLocation);
        
        // Within 3km is excellent
        if (distance <= 3) return 100;
        if (distance <= 5) return 80;
        if (distance <= 8) return 60;
        return 40;
    }
    
    /**
     * Combine clusters for return trip
     */
    combineForReturnTrip(cluster1, cluster2) {
        const combined = [...cluster1, ...cluster2];
        combined._metadata = {
            isReturnTrip: true,
            firstLeg: cluster1.length,
            returnLeg: cluster2.length,
            returnBonus: this.config.returnTrip.bonusMultiplier
        };
        return combined;
    }
    
    /**
     * Get rider's preferred end location
     */
    getRiderEndLocation(riderInfo) {
        if (riderInfo.preferredEndLocation) {
            return riderInfo.preferredEndLocation;
        }
        
        // Default to CBD
        return { lat: -1.2921, lng: 36.8219, name: 'CBD' };
    }
    
    /**
     * Get last delivery location from cluster
     */
    getLastDelivery(cluster) {
        const deliveries = cluster.filter(p => p._delivery);
        if (deliveries.length === 0) return null;
        
        // For now, return the furthest delivery
        let furthest = deliveries[0]._delivery;
        let maxDist = 0;
        
        const center = { lat: -1.2921, lng: 36.8219 }; // CBD
        
        deliveries.forEach(p => {
            const dist = this.calculateDistance(center, p._delivery);
            if (dist > maxDist) {
                maxDist = dist;
                furthest = p._delivery;
            }
        });
        
        return furthest;
    }
    
    /**
     * Check if services are compatible for clustering
     */
    areServicesCompatible(parcel1, parcel2) {
        const service1 = parcel1.customer_choice;
        const service2 = parcel2.customer_choice;
        
        // Same service always compatible
        if (service1 === service2) return true;
        
        // Check time window compatibility
        const timeDiff = Math.abs(
            new Date(parcel1.created_at).getTime() - 
            new Date(parcel2.created_at).getTime()
        ) / (1000 * 60); // minutes
        
        const maxWindow = Math.min(
            this.config.clusteringWindows[service1],
            this.config.clusteringWindows[service2]
        );
        
        return timeDiff <= maxWindow;
    }
    
    /**
     * Score delivery compatibility
     */
    scoreDeliveryCompatibility(parcel1, parcel2) {
        const dist = this.calculateDistance(parcel1._delivery, parcel2._delivery);
        
        if (dist <= 1) return 25;      // Same area
        if (dist <= 2) return 20;      // Very close
        if (dist <= 3) return 15;      // Close
        if (dist <= 5) return 10;      // Same corridor
        if (dist <= 8) return 5;       // Acceptable
        return 0;                      // Too far
    }
    
    /**
     * Score time compatibility
     */
    scoreTimeCompatibility(parcel1, parcel2) {
        const timeDiff = Math.abs(
            new Date(parcel1.created_at).getTime() - 
            new Date(parcel2.created_at).getTime()
        ) / (1000 * 60); // minutes
        
        if (timeDiff <= 5) return 15;
        if (timeDiff <= 15) return 10;
        if (timeDiff <= 30) return 5;
        return 0;
    }
    
    /**
     * Calculate efficiency of adding parcel to cluster
     */
    calculateAdditionEfficiency(cluster, newParcel) {
        if (cluster.length === 0) return 1;
        
        // Calculate current route distance
        const currentDistance = this.calculateClusterDistance(cluster);
        
        // Calculate new distance with addition
        const newCluster = [...cluster, newParcel];
        const newDistance = this.calculateClusterDistance(newCluster);
        
        // Efficiency is how little extra distance we add
        const extraDistance = newDistance - currentDistance;
        const directDistance = this.calculateDistance(newParcel._pickup, newParcel._delivery);
        
        return Math.max(0, 1 - (extraDistance - directDistance) / directDistance);
    }
    
    /**
     * Check if location is near a known area
     */
    isNearArea(location, areaName) {
        const area = this.getAreaName(location);
        return area.toLowerCase().includes(areaName.toLowerCase());
    }
    
    /**
     * Check if location is a hub
     */
    isHubLocation(location) {
        const hubs = [
            'Sarit Centre', 'Westgate', 'Junction Mall', 'Village Market',
            'CBD', 'Yaya Centre', 'The Hub Karen', 'Two Rivers'
        ];
        
        const locationName = location.address || '';
        return hubs.some(hub => locationName.toLowerCase().includes(hub.toLowerCase()));
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
        
        if (corridors.size > 3) {  // Allow up to 3 corridors for flexibility
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
        
        // Corridor alignment (30 points)
        const corridors = new Set(cluster.map(p => p._deliveryCorridor));
        if (corridors.size === 1) score += 30;
        else if (corridors.size === 2) score += 20;
        else if (corridors.size === 3) score += 10;
        
        // Delivery pattern (25 points)
        if (deliveryPattern.angleSpread < 60) score += 25;
        else if (deliveryPattern.angleSpread < 90) score += 15;
        else if (deliveryPattern.angleSpread < 120) score += 5;
        
        // Pickup efficiency (25 points)
        if (pickupDistance <= 3) score += 25;
        else if (pickupDistance <= 6) score += 15;
        else if (pickupDistance <= 10) score += 5;
        
        // Route awareness bonus (20 points)
        const routeAwareCount = cluster.filter(p => p._isOnRoute).length;
        score += (routeAwareCount / cluster.length) * 20;
        
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
        const hasReturnTrip = cluster._metadata?.isReturnTrip || false;
        
        const route = {
            id: `route-${Date.now()}-${index}`,
            name: this.generateRouteName(cluster),
            type: serviceType,
            parcels: cluster.map(p => p.id),
            parcelDetails: cluster,
            pickups: cluster.length,
            deliveries: cluster.length,
            distance: Math.round(this.calculateClusterDistance(cluster)),
            total_earnings: this.calculateEarnings(cluster),
            status: 'available',
            created_at: new Date().toISOString()
        };
        
        // Apply return trip bonus if applicable
        if (hasReturnTrip) {
            route.total_earnings = Math.round(route.total_earnings * this.config.returnTrip.bonusMultiplier);
        }
        
        // Add computed properties
        route.earnings_per_km = Math.round(route.total_earnings / Math.max(route.distance, 1));
        route.estimatedTime = this.estimateDeliveryTime(cluster, route.distance);
        route.qualityScore = this.analyzeClusterQuality(cluster).score;
        
        // Add metadata
        route.metadata = {
            pickupAreas: [...new Set(cluster.map(p => p._pickupArea))],
            deliveryCorridors: [...new Set(cluster.map(p => p._deliveryCorridor))],
            hasReturnTrip: hasReturnTrip,
            returnsToBase: cluster._metadata?.returnsToBase || false,
            pickupSequence: this.optimizePickupSequence(cluster).map(p => p.id),
            routeType: this.classifyRouteType(cluster)
        };
        
        return route;
    }
    
    /**
     * Classify route type
     */
    classifyRouteType(cluster) {
        const pickupAreas = new Set(cluster.map(p => p._pickupArea));
        const deliveryAreas = new Set(cluster.map(p => p._deliveryArea));
        
        if (pickupAreas.size === 1 && deliveryAreas.size === 1) {
            if (Array.from(pickupAreas)[0] === Array.from(deliveryAreas)[0]) {
                return 'local'; // Same area pickup and delivery
            }
            return 'point-to-point'; // Single pickup area to single delivery area
        }
        
        if (pickupAreas.size === 1 && deliveryAreas.size > 1) {
            return 'distribution'; // One pickup, multiple delivery areas
        }
        
        if (pickupAreas.size > 1 && deliveryAreas.size === 1) {
            return 'collection'; // Multiple pickups to one area
        }
        
        return 'multi-stop'; // Multiple pickups and deliveries
    }
    
    /**
     * Generate descriptive route name
     */
    generateRouteName(cluster) {
        if (cluster.length === 0) return 'Empty Route';
        
        const routeType = this.classifyRouteType(cluster);
        const hasReturn = cluster._metadata?.isReturnTrip;
        
        // Get pickup and delivery names
        const pickupNames = [...new Set(cluster.map(p => 
            this.extractLocationName(p._pickup.address || p.pickup_address || '')
        ))].filter(n => n);
        
        const deliveryNames = [...new Set(cluster.map(p => 
            this.extractLocationName(p._delivery.address || p.delivery_address || '')
        ))].filter(n => n);
        
        let name = '';
        
        // Single parcel routes
        if (cluster.length === 1) {
            const pickup = pickupNames[0] || this.getAreaName(cluster[0]._pickup);
            const delivery = deliveryNames[0] || this.getAreaName(cluster[0]._delivery);
            name = `${pickup} → ${delivery}`;
        } else {
            // Multiple parcels - vary by route type
            switch (routeType) {
                case 'local':
                    name = `${pickupNames[0]} Local (${cluster.length} stops)`;
                    break;
                    
                case 'distribution':
                    name = `${pickupNames[0]} → ${deliveryNames.length > 2 ? 'Multiple' : deliveryNames.join(' & ')}`;
                    break;
                    
                case 'collection':
                    name = `${pickupNames.length > 2 ? 'Multiple' : pickupNames.join(' & ')} → ${deliveryNames[0]}`;
                    break;
                    
                default:
                    const primary = pickupNames[0] || 'Multiple';
                    const dest = deliveryNames[0] || 'Multiple';
                    name = `${primary} → ${dest}`;
                    if (cluster.length > 2) {
                        name += ` +${cluster.length - 1}`;
                    }
            }
        }
        
        // Add return trip indicator
        if (hasReturn) {
            name += ' ↩️';
        }
        
        return name;
    }
    
    /**
     * Extract location name from address
     */
    extractLocationName(address) {
        if (!address || address === 'Pickup location' || address === 'Delivery location') {
            return '';
        }
        
        // Clean common suffixes
        let cleaned = address
            .replace(/, Kenya$/i, '')
            .replace(/, Nairobi County$/i, '')
            .replace(/, Nairobi$/i, '');
        
        // Extract key location identifiers
        const patterns = [
            // Specific landmarks/buildings
            /^(.*?(?:Mall|Centre|Center|Plaza|Building|House|Court|Hotel|Hospital|School|University|College|Market|Stage|Stop|Terminal))/i,
            // Roads and streets
            /^(.*?(?:Road|Street|Avenue|Drive|Lane|Way|Close|Crescent|Highway))/i,
            // Areas before comma
            /^([^,]+)/,
            // First meaningful part
            /^(.+?)(?:\s*[-–]\s*|,)/
        ];
        
        for (const pattern of patterns) {
            const match = cleaned.match(pattern);
            if (match && match[1]) {
                let name = match[1].trim();
                
                // Clean up common prefixes
                name = name
                    .replace(/^Quickmart\s*[-–]\s*/i, '')
                    .replace(/^Railways\s+Bus\s+stop\s*\/?\s*bus\s+Stage/i, 'Railways')
                    .replace(/\s+Apartments$/i, '')
                    .replace(/\s+Estate$/i, '')
                    .replace(/^The\s+/i, '');
                
                // Shorten long names
                if (name.length > 25) {
                    const shortened = name
                        .replace(/\s+Shopping\s+Centre/i, '')
                        .replace(/\s+Business\s+Centre/i, '')
                        .replace(/\s+Commercial\s+Centre/i, '');
                    
                    if (shortened.length < name.length && shortened.length > 5) {
                        name = shortened;
                    }
                }
                
                return name;
            }
        }
        
        return cleaned.split(',')[0].trim();
    }
    
    /**
     * Calculate total earnings
     */
    calculateEarnings(cluster) {
        return cluster.reduce((sum, p) => {
            // Use price if available, otherwise calculate
            const price = p.price || p.total_price || 
                         (p.rider_payout ? p.rider_payout / 0.7 : 500);
            return sum + price;
        }, 0);
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
    
    // ========================================================================
    // HELPER METHODS
    // ========================================================================
    
    /**
     * Get pickup location from parcel
     */
    getPickupLocation(parcel) {
        if (parcel._pickup) return parcel._pickup;
        
        let location = { 
            lat: -1.2921, 
            lng: 36.8219, 
            address: 'Pickup location' 
        };
        
        // Handle JSON string format
        if (parcel.pickup_location) {
            try {
                const parsed = typeof parcel.pickup_location === 'string' 
                    ? JSON.parse(parcel.pickup_location) 
                    : parcel.pickup_location;
                
                location.lat = parseFloat(parsed.lat);
                location.lng = parseFloat(parsed.lng);
                location.address = parsed.address || parcel.pickup_address || 'Pickup location';
            } catch (e) {
                console.error('[Clustering] Error parsing pickup location:', e);
            }
        }
        
        // Also check the separate lat/lng columns as backup
        if (parcel.pickup_lat && parcel.pickup_lng) {
            location.lat = parseFloat(parcel.pickup_lat);
            location.lng = parseFloat(parcel.pickup_lng);
            if (parcel.pickup_address) {
                location.address = parcel.pickup_address;
            }
        }
        
        return location;
    }
    
    /**
     * Get delivery location from parcel
     */
    getDeliveryLocation(parcel) {
        if (parcel._delivery) return parcel._delivery;
        
        let location = { 
            lat: -1.2921, 
            lng: 36.8219, 
            address: 'Delivery location' 
        };
        
        // Handle JSON string format
        if (parcel.delivery_location) {
            try {
                const parsed = typeof parcel.delivery_location === 'string' 
                    ? JSON.parse(parcel.delivery_location) 
                    : parcel.delivery_location;
                
                location.lat = parseFloat(parsed.lat);
                location.lng = parseFloat(parsed.lng);
                location.address = parsed.address || parcel.delivery_address || 'Delivery location';
            } catch (e) {
                console.error('[Clustering] Error parsing delivery location:', e);
            }
        }
        
        // Also check the separate lat/lng columns as backup
        if (parcel.delivery_lat && parcel.delivery_lng) {
            location.lat = parseFloat(parcel.delivery_lat);
            location.lng = parseFloat(parcel.delivery_lng);
            if (parcel.delivery_address) {
                location.address = parcel.delivery_address;
            }
        }
        
        return location;
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
     * Get area name from location
     */
    getAreaName(location) {
        if (!location) return 'General';
        
        // Check address first if available
        if (location.address && location.address !== 'Pickup location' && location.address !== 'Delivery location') {
            const address = location.address.toLowerCase();
            
            // Check for specific areas mentioned in the address
            const areaMap = {
                'westlands': 'Westlands',
                'karen': 'Karen',
                'cbd': 'CBD',
                'central business': 'CBD',
                'town': 'CBD',
                'upper hill': 'Upper Hill',
                'upperhill': 'Upper Hill',
                'kilimani': 'Kilimani',
                'kileleshwa': 'Kileleshwa',
                'lavington': 'Lavington',
                'eastlands': 'Eastlands',
                'south b': 'South B',
                'south c': 'South C',
                'langata': 'Langata',
                'industrial area': 'Industrial Area',
                'kasarani': 'Kasarani',
                'kangemi': 'Kangemi',
                'parklands': 'Parklands',
                'hurlingham': 'Hurlingham'
            };
            
            // Check each area pattern
            for (const [pattern, area] of Object.entries(areaMap)) {
                if (address.includes(pattern)) {
                    return area;
                }
            }
        }
        
        // Fall back to coordinate-based detection
        const areaCenters = {
            'CBD': { lat: -1.2833, lng: 36.8167 },
            'Westlands': { lat: -1.2634, lng: 36.8097 },
            'Kilimani': { lat: -1.2906, lng: 36.7853 },
            'Karen': { lat: -1.3194, lng: 36.7096 },
            'Eastlands': { lat: -1.2921, lng: 36.8608 },
            'Upper Hill': { lat: -1.2975, lng: 36.8189 },
            'Kangemi': { lat: -1.2681, lng: 36.7493 }
        };
        
        let closestArea = 'General';
        let minDistance = 5; // 5km threshold
        
        for (const [area, center] of Object.entries(areaCenters)) {
            const dist = this.calculateDistance(location, center);
            if (dist < minDistance) {
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
        
        // Map bearing to corridor
        if (bearing >= 337.5 || bearing < 22.5) return 'north';
        if (bearing >= 22.5 && bearing < 67.5) return 'northeast';
        if (bearing >= 67.5 && bearing < 112.5) return 'east';
        if (bearing >= 112.5 && bearing < 157.5) return 'southeast';
        if (bearing >= 157.5 && bearing < 202.5) return 'south';
        if (bearing >= 202.5 && bearing < 247.5) return 'southwest';
        if (bearing >= 247.5 && bearing < 292.5) return 'west';
        if (bearing >= 292.5 && bearing < 337.5) return 'northwest';
        
        return 'mixed';
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
        
        // Distance to first pickup (from CBD or rider location)
        const startPoint = { lat: -1.2921, lng: 36.8219 };
        total += this.calculateDistance(startPoint, sequence[0]._pickup);
        
        // Pickup to pickup distances
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
        
        // Add return distance if applicable
        if (cluster._metadata?.isReturnTrip) {
            // Distance between legs is already included
        }
        
        return total;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

// For ES6 modules
window.TumaRouteClustering = TumaRouteClustering;

// For CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TumaRouteClustering;
}

// For browser global
if (typeof window !== 'undefined') {
    window.TumaRouteClustering = TumaRouteClustering;
}
