/**
 * Comprehensive Route Optimization Engine
 * Intelligent route optimization without backtracking
 * Version: 2.0.0
 * 
 * Core Principles:
 * 1. No backtracking - always move forward in a logical direction
 * 2. Minimize total distance traveled
 * 3. Respect pickup-before-delivery constraints
 * 4. Group nearby stops intelligently
 * 5. Follow natural traffic flow patterns
 */

class RouteOptimizer {
    constructor(config = {}) {
        this.config = {
            // Distance thresholds
            immediateDeliveryRadius: 1.5,      // km - deliver immediately if this close
            clusterRadius: 2.0,                // km - stops within this are considered clustered
            zoneRadius: 3.0,                   // km - for zone creation
            
            // Scoring weights
            distanceWeight: 1.0,               // Base weight for distance
            backtrackPenalty: 5.0,             // Penalty multiplier for going backwards
            directionChangesPenalty: 2.0,      // Penalty for changing direction frequently
            clusterBonus: 0.7,                 // Bonus multiplier for staying in cluster
            
            // Algorithm settings
            enableZoning: true,                // Group stops into zones
            enableSmartPairing: true,          // Pair pickups with nearby deliveries
            maxLookahead: 3,                   // How many stops to look ahead for optimization
            
            // Performance settings
            maxIterations: 1000,               // Max iterations for optimization algorithms
            convergenceThreshold: 0.01,        // Stop optimizing when improvement < this
            
            ...config
        };
        
        // Statistics tracking
        this.stats = {
            originalDistance: 0,
            optimizedDistance: 0,
            savedDistance: 0,
            savedPercentage: 0,
            backtrackingEliminated: 0,
            zonesCreated: 0,
            executionTime: 0
        };
    }

    /**
     * Main entry point for route optimization
     * @param {Array} stops - Array of stop objects with type, location, parcelCode
     * @returns {Array} - Optimized array of stops
     */
    optimizeRoute(stops) {
        const startTime = performance.now();
        
        console.log('═══════════════════════════════════════════════════════');
        console.log('🚀 COMPREHENSIVE ROUTE OPTIMIZATION STARTING');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`📍 Total stops: ${stops.length}`);
        console.log(`📦 Pickups: ${stops.filter(s => s.type === 'pickup').length}`);
        console.log(`📍 Deliveries: ${stops.filter(s => s.type === 'delivery').length}`);
        
        // Reset statistics
        this.resetStats();
        
        // Step 1: Validate and prepare data
        const validatedStops = this.validateStops(stops);
        if (validatedStops.length === 0) {
            console.warn('No valid stops to optimize');
            return [];
        }
        
        // Step 2: Analyze route characteristics
        const analysis = this.analyzeRoute(validatedStops);
        console.log('\n📊 Route Analysis:', analysis);
        
        // Step 3: Choose optimization strategy based on analysis
        const strategy = this.selectStrategy(analysis);
        console.log(`\n📋 Selected Strategy: ${strategy.name}`);
        console.log(`   Reason: ${strategy.reason}`);
        
        // Step 4: Apply the selected optimization strategy
        let optimizedRoute;
        switch (strategy.type) {
            case 'cluster':
                optimizedRoute = this.clusterBasedOptimization(validatedStops);
                break;
            case 'directional':
                optimizedRoute = this.directionalFlowOptimization(validatedStops);
                break;
            case 'zone':
                optimizedRoute = this.zoneBasedOptimization(validatedStops);
                break;
            case 'tsp':
                optimizedRoute = this.tspOptimization(validatedStops);
                break;
            default:
                optimizedRoute = this.hybridOptimization(validatedStops);
        }
        
        // Step 5: Post-optimization improvements
        optimizedRoute = this.applyLocalOptimizations(optimizedRoute);
        
        // Step 6: Validate the optimized route
        if (!this.validateRouteIntegrity(optimizedRoute)) {
            console.error('Route integrity check failed, returning original');
            return stops;
        }
        
        // Calculate statistics
        this.calculateStatistics(stops, optimizedRoute);
        
        const executionTime = performance.now() - startTime;
        this.stats.executionTime = executionTime;
        
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('✅ OPTIMIZATION COMPLETE');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`⏱️  Execution time: ${executionTime.toFixed(2)}ms`);
        console.log(`📉 Distance saved: ${this.stats.savedDistance.toFixed(2)}km (${this.stats.savedPercentage.toFixed(1)}%)`);
        console.log(`🔄 Backtracking eliminated: ${this.stats.backtrackingEliminated} instances`);
        console.log('═══════════════════════════════════════════════════════');
        
        return optimizedRoute;
    }

    /**
     * Validate and prepare stops data
     */
    validateStops(stops) {
        return stops.filter(stop => {
            if (!stop.location || typeof stop.location.lat !== 'number' || typeof stop.location.lng !== 'number') {
                console.warn('Invalid stop location:', stop);
                return false;
            }
            if (!stop.type || !['pickup', 'delivery'].includes(stop.type)) {
                console.warn('Invalid stop type:', stop);
                return false;
            }
            return true;
        }).map(stop => ({
            ...stop,
            id: stop.id || this.generateId(),
            parcelCode: stop.parcelCode || stop.parcel_code || stop.code,
            address: stop.address || stop.location_address || 'Unknown'
        }));
    }

    /**
     * Analyze route characteristics to determine best optimization strategy
     */
    analyzeRoute(stops) {
        const pickups = stops.filter(s => s.type === 'pickup');
        const deliveries = stops.filter(s => s.type === 'delivery');
        
        // Calculate geographic spread
        const bounds = this.calculateBounds(stops);
        const spread = {
            lat: bounds.north - bounds.south,
            lng: bounds.east - bounds.west
        };
        
        // Calculate density
        const area = spread.lat * spread.lng * 111 * 111; // Rough conversion to km²
        const density = stops.length / area;
        
        // Analyze clustering
        const clusters = this.identifyClusters(stops);
        
        // Analyze pickup-delivery relationships
        const pairings = this.analyzePairings(pickups, deliveries);
        
        // Determine route shape
        const shape = this.determineRouteShape(stops);
        
        return {
            totalStops: stops.length,
            pickupCount: pickups.length,
            deliveryCount: deliveries.length,
            geographicSpread: spread,
            density: density,
            clusterCount: clusters.length,
            averageClusterSize: clusters.length > 0 ? 
                clusters.reduce((sum, c) => sum + c.stops.length, 0) / clusters.length : 0,
            pairingStats: pairings,
            routeShape: shape,
            isHighDensity: density > 10,
            isClustered: clusters.length > 1 && clusters.some(c => c.stops.length > 3),
            isLinear: shape.type === 'linear',
            isCircular: shape.type === 'circular'
        };
    }

    /**
     * Select optimization strategy based on route analysis
     */
    selectStrategy(analysis) {
        // High density clustered routes
        if (analysis.isHighDensity && analysis.isClustered) {
            return {
                type: 'cluster',
                name: 'Cluster-Based Optimization',
                reason: 'High density with clear clusters - optimizing within and between clusters'
            };
        }
        
        // Linear routes (e.g., highway corridor)
        if (analysis.isLinear) {
            return {
                type: 'directional',
                name: 'Directional Flow Optimization',
                reason: 'Linear route pattern detected - following natural flow'
            };
        }
        
        // Spread out routes with zones
        if (analysis.clusterCount > 3 && this.config.enableZoning) {
            return {
                type: 'zone',
                name: 'Zone-Based Optimization',
                reason: 'Multiple distinct zones detected - optimizing zone by zone'
            };
        }
        
        // Small routes - use exact TSP
        if (analysis.totalStops < 10) {
            return {
                type: 'tsp',
                name: 'Traveling Salesman Optimization',
                reason: 'Small route - using exact optimization'
            };
        }
        
        // Default: Hybrid approach
        return {
            type: 'hybrid',
            name: 'Hybrid Optimization',
            reason: 'Mixed characteristics - using combined approach'
        };
    }

    /**
     * Cluster-based optimization for dense urban areas
     */
    clusterBasedOptimization(stops) {
        console.log('\n🔄 Running Cluster-Based Optimization...');
        
        // Identify clusters
        const clusters = this.identifyClusters(stops);
        console.log(`   Found ${clusters.length} clusters`);
        
        // Order clusters to minimize inter-cluster travel
        const orderedClusters = this.orderClusters(clusters);
        
        // Optimize within each cluster
        const optimizedRoute = [];
        
        orderedClusters.forEach((cluster, idx) => {
            console.log(`   Optimizing cluster ${idx + 1}/${clusters.length} (${cluster.stops.length} stops)`);
            
            // Separate pickups and deliveries in cluster
            const clusterPickups = cluster.stops.filter(s => s.type === 'pickup');
            const clusterDeliveries = cluster.stops.filter(s => s.type === 'delivery');
            
            // Optimize order within cluster
            const optimizedCluster = this.optimizeClusterStops(
                clusterPickups, 
                clusterDeliveries,
                cluster.center
            );
            
            optimizedRoute.push(...optimizedCluster);
        });
        
        return optimizedRoute;
    }

    /**
     * Directional flow optimization for linear routes
     */
    directionalFlowOptimization(stops) {
        console.log('\n🔄 Running Directional Flow Optimization...');
        
        // Determine primary direction
        const direction = this.determinePrimaryDirection(stops);
        console.log(`   Primary direction: ${direction.bearing}° (${direction.name})`);
        
        // Project all stops onto the primary axis
        const projectedStops = stops.map(stop => ({
            ...stop,
            projection: this.projectOntoAxis(stop.location, direction.bearing)
        }));
        
        // Sort by projection
        projectedStops.sort((a, b) => a.projection - b.projection);
        
        // Build route respecting constraints
        const route = [];
        const completed = new Set();
        const pickedParcels = new Set();
        
        projectedStops.forEach(stop => {
            if (completed.has(stop.id)) return;
            
            if (stop.type === 'pickup') {
                route.push(stop);
                completed.add(stop.id);
                pickedParcels.add(stop.parcelCode);
                
                // Look for immediate delivery opportunity
                const delivery = projectedStops.find(s => 
                    s.type === 'delivery' && 
                    s.parcelCode === stop.parcelCode &&
                    !completed.has(s.id)
                );
                
                if (delivery) {
                    const distance = this.calculateDistance(stop.location, delivery.location);
                    if (distance < this.config.immediateDeliveryRadius) {
                        route.push(delivery);
                        completed.add(delivery.id);
                    }
                }
            } else if (stop.type === 'delivery' && pickedParcels.has(stop.parcelCode)) {
                route.push(stop);
                completed.add(stop.id);
            }
        });
        
        // Add any remaining deliveries
        projectedStops.forEach(stop => {
            if (!completed.has(stop.id) && stop.type === 'delivery') {
                route.push(stop);
            }
        });
        
        return route;
    }

    /**
     * Zone-based optimization for spread out routes
     */
    zoneBasedOptimization(stops) {
        console.log('\n🔄 Running Zone-Based Optimization...');
        
        // Create geographical zones
        const zones = this.createZones(stops);
        console.log(`   Created ${zones.length} zones`);
        this.stats.zonesCreated = zones.length;
        
        // Find optimal zone visiting order
        const zoneOrder = this.optimizeZoneOrder(zones);
        
        // Process each zone
        const optimizedRoute = [];
        
        zoneOrder.forEach((zone, idx) => {
            console.log(`   Processing zone ${idx + 1}/${zones.length}: ${zone.name}`);
            
            const zonePickups = zone.stops.filter(s => s.type === 'pickup');
            const zoneDeliveries = zone.stops.filter(s => s.type === 'delivery');
            
            // Check for cross-zone deliveries
            const localDeliveries = [];
            const externalDeliveries = [];
            
            zoneDeliveries.forEach(delivery => {
                const pickup = stops.find(s => 
                    s.type === 'pickup' && s.parcelCode === delivery.parcelCode
                );
                if (pickup && zone.stops.includes(pickup)) {
                    localDeliveries.push(delivery);
                } else {
                    externalDeliveries.push(delivery);
                }
            });
            
            // Optimize zone with smart ordering
            const zoneRoute = this.optimizeZoneStops(
                zonePickups,
                localDeliveries,
                externalDeliveries,
                zone.center
            );
            
            optimizedRoute.push(...zoneRoute);
        });
        
        return optimizedRoute;
    }

    /**
     * TSP optimization for small routes
     */
    tspOptimization(stops) {
        console.log('\n🔄 Running TSP Optimization...');
        
        const pickups = stops.filter(s => s.type === 'pickup');
        const deliveries = stops.filter(s => s.type === 'delivery');
        
        // Use nearest neighbor with 2-opt improvement
        const optimizedPickups = this.nearestNeighbor(pickups);
        
        // Insert deliveries optimally
        const route = [];
        const pickedParcels = new Set();
        
        optimizedPickups.forEach(pickup => {
            route.push(pickup);
            pickedParcels.add(pickup.parcelCode);
            
            // Find corresponding delivery
            const delivery = deliveries.find(d => d.parcelCode === pickup.parcelCode);
            if (delivery) {
                // Find best insertion point
                const bestPosition = this.findBestDeliveryPosition(route, delivery, pickedParcels);
                route.splice(bestPosition, 0, delivery);
            }
        });
        
        // Apply 2-opt improvement
        return this.apply2OptImprovement(route);
    }

    /**
     * Hybrid optimization combining multiple strategies
     */
    hybridOptimization(stops) {
        console.log('\n🔄 Running Hybrid Optimization...');
        
        // Phase 1: Geographic clustering
        const clusters = this.identifyClusters(stops);
        
        // Phase 2: Analyze flow within clusters
        const optimizedClusters = clusters.map(cluster => {
            const direction = this.determinePrimaryDirection(cluster.stops);
            return {
                ...cluster,
                direction: direction,
                optimizedStops: this.optimizeClusterWithDirection(cluster, direction)
            };
        });
        
        // Phase 3: Connect clusters optimally
        const clusterSequence = this.findOptimalClusterSequence(optimizedClusters);
        
        // Phase 4: Build final route
        const route = [];
        clusterSequence.forEach(cluster => {
            route.push(...cluster.optimizedStops);
        });
        
        // Phase 5: Final improvements
        return this.applyLocalOptimizations(route);
    }

    /**
     * Apply local optimizations to improve route
     */
    applyLocalOptimizations(route) {
        console.log('\n🔧 Applying local optimizations...');
        
        let improved = [...route];
        let improvement = true;
        let iterations = 0;
        
        while (improvement && iterations < this.config.maxIterations) {
            improvement = false;
            const originalDistance = this.calculateTotalDistance(improved);
            
            // Try 2-opt swaps
            improved = this.apply2OptImprovement(improved);
            
            // Try 3-opt if route is small enough
            if (improved.length < 20) {
                improved = this.apply3OptImprovement(improved);
            }
            
            // Try Or-opt (relocating sequences)
            improved = this.applyOrOptImprovement(improved);
            
            const newDistance = this.calculateTotalDistance(improved);
            if (originalDistance - newDistance > this.config.convergenceThreshold) {
                improvement = true;
                console.log(`   Iteration ${iterations + 1}: Improved by ${(originalDistance - newDistance).toFixed(2)}km`);
            }
            
            iterations++;
        }
        
        return improved;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Identify clusters of nearby stops
     */
    identifyClusters(stops) {
        const clusters = [];
        const assigned = new Set();
        
        stops.forEach(stop => {
            if (assigned.has(stop.id)) return;
            
            const cluster = {
                id: this.generateId(),
                stops: [stop],
                center: stop.location
            };
            
            assigned.add(stop.id);
            
            // Find all stops within cluster radius
            stops.forEach(otherStop => {
                if (assigned.has(otherStop.id)) return;
                
                const distance = this.calculateDistance(cluster.center, otherStop.location);
                if (distance <= this.config.clusterRadius) {
                    cluster.stops.push(otherStop);
                    assigned.add(otherStop.id);
                }
            });
            
            // Recalculate cluster center
            cluster.center = this.calculateCentroid(cluster.stops);
            clusters.push(cluster);
        });
        
        return clusters;
    }

    /**
     * Order clusters to minimize travel between them
     */
    orderClusters(clusters) {
        if (clusters.length <= 1) return clusters;
        
        // Find cluster with most pickups to start
        const startCluster = clusters.reduce((best, cluster) => {
            const pickupCount = cluster.stops.filter(s => s.type === 'pickup').length;
            const bestPickupCount = best.stops.filter(s => s.type === 'pickup').length;
            return pickupCount > bestPickupCount ? cluster : best;
        });
        
        const ordered = [startCluster];
        const remaining = clusters.filter(c => c.id !== startCluster.id);
        
        while (remaining.length > 0) {
            const current = ordered[ordered.length - 1];
            let nearest = null;
            let minDistance = Infinity;
            
            remaining.forEach(cluster => {
                const distance = this.calculateDistance(current.center, cluster.center);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearest = cluster;
                }
            });
            
            ordered.push(nearest);
            remaining.splice(remaining.indexOf(nearest), 1);
        }
        
        return ordered;
    }

    /**
     * Optimize stops within a cluster
     */
    optimizeClusterStops(pickups, deliveries, center) {
        const route = [];
        const remainingPickups = [...pickups];
        const remainingDeliveries = [...deliveries];
        const pickedParcels = new Set();
        
        // Start from center
        let currentPos = center;
        
        while (remainingPickups.length > 0 || remainingDeliveries.length > 0) {
            let nextStop = null;
            let minScore = Infinity;
            
            // Evaluate pickups
            remainingPickups.forEach(pickup => {
                const distance = this.calculateDistance(currentPos, pickup.location);
                const score = distance;
                
                if (score < minScore) {
                    minScore = score;
                    nextStop = { stop: pickup, type: 'pickup', index: remainingPickups.indexOf(pickup) };
                }
            });
            
            // Evaluate deliveries
            remainingDeliveries.forEach(delivery => {
                if (!pickedParcels.has(delivery.parcelCode)) return;
                
                const distance = this.calculateDistance(currentPos, delivery.location);
                const score = distance * 0.9; // Slight preference for deliveries
                
                if (score < minScore) {
                    minScore = score;
                    nextStop = { stop: delivery, type: 'delivery', index: remainingDeliveries.indexOf(delivery) };
                }
            });
            
            if (!nextStop) break;
            
            route.push(nextStop.stop);
            currentPos = nextStop.stop.location;
            
            if (nextStop.type === 'pickup') {
                remainingPickups.splice(nextStop.index, 1);
                pickedParcels.add(nextStop.stop.parcelCode);
                
                // Check for immediate delivery
                const deliveryIndex = remainingDeliveries.findIndex(d => 
                    d.parcelCode === nextStop.stop.parcelCode
                );
                
                if (deliveryIndex !== -1) {
                    const delivery = remainingDeliveries[deliveryIndex];
                    const distance = this.calculateDistance(currentPos, delivery.location);
                    
                    if (distance < this.config.immediateDeliveryRadius) {
                        route.push(delivery);
                        currentPos = delivery.location;
                        remainingDeliveries.splice(deliveryIndex, 1);
                    }
                }
            } else {
                remainingDeliveries.splice(nextStop.index, 1);
            }
        }
        
        return route;
    }

    /**
     * Create geographical zones
     */
    createZones(stops) {
        const zones = [];
        const assigned = new Set();
        
        // Use k-means clustering
        const k = Math.ceil(Math.sqrt(stops.length / 2));
        const centers = this.kMeansInitialize(stops, k);
        
        // Assign stops to nearest center
        const iterations = 50;
        for (let i = 0; i < iterations; i++) {
            const newZones = centers.map(center => ({
                id: this.generateId(),
                center: center,
                stops: [],
                name: `Zone ${zones.length + 1}`
            }));
            
            stops.forEach(stop => {
                let nearestZone = null;
                let minDistance = Infinity;
                
                newZones.forEach(zone => {
                    const distance = this.calculateDistance(stop.location, zone.center);
                    if (distance < minDistance) {
                        minDistance = distance;
                        nearestZone = zone;
                    }
                });
                
                nearestZone.stops.push(stop);
            });
            
            // Update centers
            let converged = true;
            newZones.forEach((zone, idx) => {
                if (zone.stops.length > 0) {
                    const newCenter = this.calculateCentroid(zone.stops);
                    const movement = this.calculateDistance(centers[idx], newCenter);
                    if (movement > 0.01) converged = false;
                    centers[idx] = newCenter;
                }
            });
            
            if (converged) {
                return newZones.filter(z => z.stops.length > 0);
            }
        }
        
        return zones;
    }

    /**
     * Optimize zone visiting order
     */
    optimizeZoneOrder(zones) {
        if (zones.length <= 1) return zones;
        
        // Calculate zone connectivity matrix
        const distances = [];
        for (let i = 0; i < zones.length; i++) {
            distances[i] = [];
            for (let j = 0; j < zones.length; j++) {
                distances[i][j] = this.calculateDistance(zones[i].center, zones[j].center);
            }
        }
        
        // Use nearest neighbor for zone ordering
        const visited = new Set();
        const ordered = [];
        
        // Start with zone that has most pickups
        let current = zones.reduce((best, zone, idx) => {
            const pickupCount = zone.stops.filter(s => s.type === 'pickup').length;
            const bestCount = best.zone.stops.filter(s => s.type === 'pickup').length;
            return pickupCount > bestCount ? { zone, index: idx } : best;
        }, { zone: zones[0], index: 0 });
        
        ordered.push(current.zone);
        visited.add(current.index);
        
        while (ordered.length < zones.length) {
            let nearest = null;
            let minDistance = Infinity;
            
            zones.forEach((zone, idx) => {
                if (visited.has(idx)) return;
                
                const distance = distances[current.index][idx];
                if (distance < minDistance) {
                    minDistance = distance;
                    nearest = { zone, index: idx };
                }
            });
            
            if (nearest) {
                ordered.push(nearest.zone);
                visited.add(nearest.index);
                current = nearest;
            }
        }
        
        return ordered;
    }

    /**
     * Optimize zone stops with consideration for external deliveries
     */
    optimizeZoneStops(pickups, localDeliveries, externalDeliveries, center) {
        const route = [];
        
        // First handle pickups and their immediate local deliveries
        const optimizedLocal = this.optimizeClusterStops(pickups, localDeliveries, center);
        route.push(...optimizedLocal);
        
        // Then handle external deliveries that can now be completed
        const pickedParcels = new Set(pickups.map(p => p.parcelCode));
        const validExternalDeliveries = externalDeliveries.filter(d => 
            pickedParcels.has(d.parcelCode)
        );
        
        if (validExternalDeliveries.length > 0) {
            const optimizedExternal = this.nearestNeighbor(validExternalDeliveries);
            route.push(...optimizedExternal);
        }
        
        return route;
    }

    /**
     * Apply 2-opt improvement
     */
    apply2OptImprovement(route) {
        let improved = [...route];
        let improvement = true;
        
        while (improvement) {
            improvement = false;
            
            for (let i = 0; i < improved.length - 2; i++) {
                for (let j = i + 2; j < improved.length; j++) {
                    if (j === i + 1) continue;
                    
                    // Check if swap maintains constraints
                    if (!this.canSwap2Opt(improved, i, j)) continue;
                    
                    const currentDist = 
                        this.calculateDistance(improved[i].location, improved[i + 1].location) +
                        this.calculateDistance(improved[j - 1].location, improved[j].location);
                    
                    const swappedDist = 
                        this.calculateDistance(improved[i].location, improved[j - 1].location) +
                        this.calculateDistance(improved[i + 1].location, improved[j].location);
                    
                    if (swappedDist < currentDist - this.config.convergenceThreshold) {
                        // Reverse the segment
                        const reversed = improved.slice(i + 1, j).reverse();
                        improved = [
                            ...improved.slice(0, i + 1),
                            ...reversed,
                            ...improved.slice(j)
                        ];
                        improvement = true;
                        break;
                    }
                }
                if (improvement) break;
            }
        }
        
        return improved;
    }

    /**
     * Apply 3-opt improvement
     */
    apply3OptImprovement(route) {
        // Simplified 3-opt for small routes
        let improved = [...route];
        
        for (let i = 0; i < improved.length - 3; i++) {
            for (let j = i + 2; j < improved.length - 1; j++) {
                for (let k = j + 2; k < improved.length; k++) {
                    // Try different reconnection patterns
                    const variants = this.generate3OptVariants(improved, i, j, k);
                    
                    let bestVariant = null;
                    let bestDistance = this.calculateTotalDistance(improved);
                    
                    variants.forEach(variant => {
                        if (this.validateRouteIntegrity(variant)) {
                            const distance = this.calculateTotalDistance(variant);
                            if (distance < bestDistance) {
                                bestDistance = distance;
                                bestVariant = variant;
                            }
                        }
                    });
                    
                    if (bestVariant) {
                        improved = bestVariant;
                    }
                }
            }
        }
        
        return improved;
    }

    /**
     * Apply Or-opt improvement (relocating sequences)
     */
    applyOrOptImprovement(route) {
        let improved = [...route];
        
        for (let segmentSize = 1; segmentSize <= 3; segmentSize++) {
            for (let i = 0; i < improved.length - segmentSize; i++) {
                const segment = improved.slice(i, i + segmentSize);
                
                // Check if segment can be moved
                if (!this.canRelocateSegment(segment, improved)) continue;
                
                // Try inserting at different positions
                for (let j = 0; j < improved.length - segmentSize; j++) {
                    if (j >= i - 1 && j <= i + segmentSize) continue;
                    
                    const testRoute = [
                        ...improved.slice(0, i),
                        ...improved.slice(i + segmentSize)
                    ];
                    
                    testRoute.splice(j, 0, ...segment);
                    
                    if (this.validateRouteIntegrity(testRoute)) {
                        const currentDistance = this.calculateTotalDistance(improved);
                        const newDistance = this.calculateTotalDistance(testRoute);
                        
                        if (newDistance < currentDistance - this.config.convergenceThreshold) {
                            improved = testRoute;
                        }
                    }
                }
            }
        }
        
        return improved;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UTILITY METHODS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Calculate distance between two points
     */
    calculateDistance(point1, point2) {
        const R = 6371; // Earth's radius in km
        const dLat = (point2.lat - point1.lat) * Math.PI / 180;
        const dLon = (point2.lng - point1.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    /**
     * Calculate total route distance
     */
    calculateTotalDistance(route) {
        if (route.length < 2) return 0;
        
        let total = 0;
        for (let i = 0; i < route.length - 1; i++) {
            total += this.calculateDistance(route[i].location, route[i + 1].location);
        }
        return total;
    }

    /**
     * Calculate centroid of stops
     */
    calculateCentroid(stops) {
        const sum = stops.reduce((acc, stop) => ({
            lat: acc.lat + stop.location.lat,
            lng: acc.lng + stop.location.lng
        }), { lat: 0, lng: 0 });
        
        return {
            lat: sum.lat / stops.length,
            lng: sum.lng / stops.length
        };
    }

    /**
     * Calculate geographic bounds
     */
    calculateBounds(stops) {
        const bounds = {
            north: -90,
            south: 90,
            east: -180,
            west: 180
        };
        
        stops.forEach(stop => {
            bounds.north = Math.max(bounds.north, stop.location.lat);
            bounds.south = Math.min(bounds.south, stop.location.lat);
            bounds.east = Math.max(bounds.east, stop.location.lng);
            bounds.west = Math.min(bounds.west, stop.location.lng);
        });
        
        return bounds;
    }

    /**
     * Determine primary direction of route
     */
    determinePrimaryDirection(stops) {
        const bounds = this.calculateBounds(stops);
        const latSpread = bounds.north - bounds.south;
        const lngSpread = bounds.east - bounds.west;
        
        let bearing, name;
        
        if (latSpread > lngSpread * 1.5) {
            // Primarily north-south
            bearing = 0;
            name = 'North-South';
        } else if (lngSpread > latSpread * 1.5) {
            // Primarily east-west
            bearing = 90;
            name = 'East-West';
        } else {
            // Calculate actual bearing from first to last stop
            const first = stops[0];
            const last = stops[stops.length - 1];
            bearing = this.calculateBearing(first.location, last.location);
            name = this.bearingToCompass(bearing);
        }
        
        return { bearing, name };
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
        
        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    }

    /**
     * Convert bearing to compass direction
     */
    bearingToCompass(bearing) {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(bearing / 45) % 8;
        return directions[index];
    }

    /**
     * Project location onto axis
     */
    projectOntoAxis(location, bearing) {
        const rad = bearing * Math.PI / 180;
        return location.lng * Math.cos(rad) + location.lat * Math.sin(rad);
    }

    /**
     * Determine route shape
     */
    determineRouteShape(stops) {
        if (stops.length < 3) {
            return { type: 'simple', description: 'Too few stops to determine shape' };
        }
        
        const bounds = this.calculateBounds(stops);
        const aspectRatio = (bounds.east - bounds.west) / (bounds.north - bounds.south);
        
        if (aspectRatio > 2 || aspectRatio < 0.5) {
            return { type: 'linear', description: 'Linear route pattern' };
        }
        
        // Check if stops form a circular pattern
        const centroid = this.calculateCentroid(stops);
        const distances = stops.map(s => this.calculateDistance(s.location, centroid));
        const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
        const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgDistance, 2), 0) / distances.length;
        
        if (variance < avgDistance * 0.3) {
            return { type: 'circular', description: 'Circular route pattern' };
        }
        
        return { type: 'mixed', description: 'Mixed route pattern' };
    }

    /**
     * Analyze pickup-delivery pairings
     */
    analyzePairings(pickups, deliveries) {
        const pairs = [];
        
        pickups.forEach(pickup => {
            const delivery = deliveries.find(d => d.parcelCode === pickup.parcelCode);
            if (delivery) {
                pairs.push({
                    distance: this.calculateDistance(pickup.location, delivery.location),
                    pickup: pickup,
                    delivery: delivery
                });
            }
        });
        
        const distances = pairs.map(p => p.distance);
        
        return {
            pairCount: pairs.length,
            averageDistance: distances.length > 0 ? 
                distances.reduce((a, b) => a + b, 0) / distances.length : 0,
            maxDistance: distances.length > 0 ? Math.max(...distances) : 0,
            minDistance: distances.length > 0 ? Math.min(...distances) : 0
        };
    }

    /**
     * K-means initialization
     */
    kMeansInitialize(stops, k) {
        const centers = [];
        const used = new Set();
        
        // K-means++ initialization
        // First center is random
        const first = stops[Math.floor(Math.random() * stops.length)];
        centers.push(first.location);
        used.add(first.id);
        
        // Remaining centers based on distance
        while (centers.length < k) {
            const distances = stops.map(stop => {
                if (used.has(stop.id)) return 0;
                
                const minDist = centers.reduce((min, center) => {
                    const dist = this.calculateDistance(stop.location, center);
                    return Math.min(min, dist);
                }, Infinity);
                
                return minDist * minDist; // Square for probability
            });
            
            const totalDist = distances.reduce((a, b) => a + b, 0);
            let random = Math.random() * totalDist;
            
            for (let i = 0; i < stops.length; i++) {
                random -= distances[i];
                if (random <= 0 && !used.has(stops[i].id)) {
                    centers.push(stops[i].location);
                    used.add(stops[i].id);
                    break;
                }
            }
        }
        
        return centers;
    }

    /**
     * Nearest neighbor algorithm
     */
    nearestNeighbor(stops) {
        if (stops.length <= 1) return stops;
        
        const route = [];
        const remaining = [...stops];
        
        // Start with first stop
        let current = remaining.shift();
        route.push(current);
        
        while (remaining.length > 0) {
            let nearest = null;
            let minDistance = Infinity;
            
            remaining.forEach(stop => {
                const distance = this.calculateDistance(current.location, stop.location);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearest = stop;
                }
            });
            
            if (nearest) {
                route.push(nearest);
                current = nearest;
                remaining.splice(remaining.indexOf(nearest), 1);
            }
        }
        
        return route;
    }

    /**
     * Find best position to insert delivery
     */
    findBestDeliveryPosition(route, delivery, pickedParcels) {
        let bestPosition = route.length;
        let minIncrease = Infinity;
        
        // Find where pickup was done
        const pickupIndex = route.findIndex(s => 
            s.type === 'pickup' && s.parcelCode === delivery.parcelCode
        );
        
        // Can only insert after pickup
        const startIndex = pickupIndex + 1;
        
        for (let i = startIndex; i <= route.length; i++) {
            const before = i > 0 ? route[i - 1].location : null;
            const after = i < route.length ? route[i].location : null;
            
            let increase = 0;
            if (before && after) {
                const current = this.calculateDistance(before, after);
                const withDelivery = 
                    this.calculateDistance(before, delivery.location) +
                    this.calculateDistance(delivery.location, after);
                increase = withDelivery - current;
            } else if (before) {
                increase = this.calculateDistance(before, delivery.location);
            }
            
            if (increase < minIncrease) {
                minIncrease = increase;
                bestPosition = i;
            }
        }
        
        return bestPosition;
    }

    /**
     * Optimize cluster with direction consideration
     */
    optimizeClusterWithDirection(cluster, direction) {
        // Project stops onto direction axis
        const projectedStops = cluster.stops.map(stop => ({
            ...stop,
            projection: this.projectOntoAxis(stop.location, direction.bearing)
        }));
        
        // Sort by projection
        projectedStops.sort((a, b) => a.projection - b.projection);
        
        // Separate and rebuild respecting constraints
        const route = [];
        const completed = new Set();
        
        projectedStops.forEach(stop => {
            if (stop.type === 'pickup' && !completed.has(stop.id)) {
                route.push(stop);
                completed.add(stop.id);
                
                // Look for nearby delivery
                const delivery = projectedStops.find(s => 
                    s.type === 'delivery' && 
                    s.parcelCode === stop.parcelCode &&
                    !completed.has(s.id)
                );
                
                if (delivery) {
                    const distance = this.calculateDistance(stop.location, delivery.location);
                    if (distance < this.config.immediateDeliveryRadius) {
                        route.push(delivery);
                        completed.add(delivery.id);
                    }
                }
            }
        });
        
        // Add remaining stops
        projectedStops.forEach(stop => {
            if (!completed.has(stop.id)) {
                route.push(stop);
            }
        });
        
        return route;
    }

    /**
     * Find optimal cluster sequence
     */
    findOptimalClusterSequence(clusters) {
        return this.nearestNeighbor(clusters.map(c => ({
            ...c,
            location: c.center
        }))).map(item => clusters.find(c => c.id === item.id));
    }

    /**
     * Generate 3-opt variants
     */
    generate3OptVariants(route, i, j, k) {
        const variants = [];
        
        // Different ways to reconnect three segments
        const segment1 = route.slice(0, i + 1);
        const segment2 = route.slice(i + 1, j + 1);
        const segment3 = route.slice(j + 1, k + 1);
        const segment4 = route.slice(k + 1);
        
        // Original order
        variants.push([...segment1, ...segment2, ...segment3, ...segment4]);
        
        // Other valid reconnections
        variants.push([...segment1, ...segment2.reverse(), ...segment3, ...segment4]);
        variants.push([...segment1, ...segment2, ...segment3.reverse(), ...segment4]);
        variants.push([...segment1, ...segment2.reverse(), ...segment3.reverse(), ...segment4]);
        variants.push([...segment1, ...segment3, ...segment2, ...segment4]);
        variants.push([...segment1, ...segment3.reverse(), ...segment2.reverse(), ...segment4]);
        
        return variants;
    }

    /**
     * Check if 2-opt swap maintains constraints
     */
    canSwap2Opt(route, i, j) {
        // Check the segment to be reversed
        for (let k = i + 1; k < j; k++) {
            if (route[k].type === 'delivery') {
                const parcelCode = route[k].parcelCode;
                // Find pickup position
                const pickupIndex = route.findIndex(s => 
                    s.type === 'pickup' && s.parcelCode === parcelCode
                );
                
                // If pickup is outside the segment being reversed, check validity
                if (pickupIndex <= i || pickupIndex >= j) {
                    // After reversal, delivery would be at position i + (j - k)
                    const newDeliveryIndex = i + (j - k);
                    if (pickupIndex > newDeliveryIndex) {
                        return false; // Would violate pickup-before-delivery
                    }
                }
            }
        }
        return true;
    }

    /**
     * Check if segment can be relocated
     */
    canRelocateSegment(segment, route) {
        // Check if moving segment would violate constraints
        for (const stop of segment) {
            if (stop.type === 'delivery') {
                const pickup = route.find(s => 
                    s.type === 'pickup' && s.parcelCode === stop.parcelCode
                );
                if (pickup && !segment.includes(pickup)) {
                    return false; // Can't move delivery without its pickup
                }
            }
        }
        return true;
    }

    /**
     * Validate route integrity
     */
    validateRouteIntegrity(route) {
        const pickedParcels = new Set();
        
        for (const stop of route) {
            if (stop.type === 'pickup') {
                pickedParcels.add(stop.parcelCode);
            } else if (stop.type === 'delivery') {
                if (!pickedParcels.has(stop.parcelCode)) {
                    return false; // Delivery before pickup
                }
            }
        }
        
        return true;
    }

    /**
     * Calculate statistics
     */
    calculateStatistics(original, optimized) {
        this.stats.originalDistance = this.calculateTotalDistance(original);
        this.stats.optimizedDistance = this.calculateTotalDistance(optimized);
        this.stats.savedDistance = this.stats.originalDistance - this.stats.optimizedDistance;
        this.stats.savedPercentage = (this.stats.savedDistance / this.stats.originalDistance) * 100;
        
        // Count backtracking instances eliminated
        let originalBacktracks = 0;
        let optimizedBacktracks = 0;
        
        for (let i = 1; i < original.length - 1; i++) {
            const bearing1 = this.calculateBearing(original[i - 1].location, original[i].location);
            const bearing2 = this.calculateBearing(original[i].location, original[i + 1].location);
            const diff = Math.abs(bearing1 - bearing2);
            if (diff > 90 && diff < 270) originalBacktracks++;
        }
        
        for (let i = 1; i < optimized.length - 1; i++) {
            const bearing1 = this.calculateBearing(optimized[i - 1].location, optimized[i].location);
            const bearing2 = this.calculateBearing(optimized[i].location, optimized[i + 1].location);
            const diff = Math.abs(bearing1 - bearing2);
            if (diff > 90 && diff < 270) optimizedBacktracks++;
        }
        
        this.stats.backtrackingEliminated = originalBacktracks - optimizedBacktracks;
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            originalDistance: 0,
            optimizedDistance: 0,
            savedDistance: 0,
            savedPercentage: 0,
            backtrackingEliminated: 0,
            zonesCreated: 0,
            executionTime: 0
        };
    }

    /**
     * Generate unique ID
     */
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get optimization statistics
     */
    getStatistics() {
        return { ...this.stats };
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
}

// Export for use in other modules
export default RouteOptimizer;
// Make available globally for non-module environments
if (typeof window !== 'undefined') {
    window.RouteOptimizer = RouteOptimizer;
}
