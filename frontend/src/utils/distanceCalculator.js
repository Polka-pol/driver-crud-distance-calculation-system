import { API_BASE_URL } from '../config';
import { apiClient } from './apiClient';
import * as turf from '@turf/turf';

/**
 * Calculate preliminary distance using Turf.js Haversine formula
 * @param {Object} origin - Origin coordinates {lat, lon}
 * @param {Object} destination - Destination coordinates {lat, lon}
 * @returns {number} Distance in miles
 */
function calculatePreliminaryDistance(origin, destination) {
    if (!origin || !destination || !origin.lat || !origin.lon || !destination.lat || !destination.lon) {
        return null;
    }
    
    const point1 = turf.point([origin.lon, origin.lat]);
    const point2 = turf.point([destination.lon, destination.lat]);
    const distanceKm = turf.distance(point1, point2, { units: 'kilometers' });
    const distanceMiles = distanceKm * 0.621371; // Convert km to miles
    
    return Math.round(distanceMiles * 100) / 100; // Round to 2 decimal places
}

/**
 * Optimized distance calculation with backend handling truck data retrieval.
 * Uses Turf.js for preliminary distance calculation and filters Mapbox requests.
 * Backend fetches truck addresses directly from database for always-fresh data.
 *
 * @param {string} destination - The destination address string.
 * @param {function} onDistancesUpdate - Callback to update distances in the UI with the final results.
 * @param {function} onCalculationEnd - Callback to signal that the entire process is complete.
 */
export async function calculateDistancesForDrivers(destination, onDistancesUpdate, onCalculationEnd) {
    if (!destination) {
        if (onCalculationEnd) onCalculationEnd();
        return;
    }

    // Frontend guard: require either distance.process or distance.batch
    try {
        const resp = await apiClient(`${API_BASE_URL}/me/permissions`);
        const data = await resp.json();
        const perms = Array.isArray(data.data) ? data.data : [];
        const canProcess = perms.includes('*') || perms.includes('distance.process') || perms.includes('distance.batch');
        if (!canProcess) {
            throw new Error('You do not have permission to calculate distances.');
        }
    } catch (e) {
        if (onCalculationEnd) onCalculationEnd();
        throw e;
    }

    const totalStartTime = performance.now();

    try {
        // Phase 0: Clean up expired holds before processing
        try {
            await apiClient(`${API_BASE_URL}/trucks/hold/cleanup`);
        } catch (cleanupError) {
            console.warn('Hold cleanup failed during distance calculation:', cleanupError.message);
        }
        
        // Phase 1: Fast cache check (backend fetches truck addresses from DB)
        const cacheStartTime = performance.now();
        const cacheResponse = await apiClient(`${API_BASE_URL}/distance/cache-check`, {
            method: 'POST',
            body: JSON.stringify({ destination }),
        });

        if (!cacheResponse.ok) {
            const errorData = await cacheResponse.json();
            throw new Error(errorData.message || `Cache check failed with status ${cacheResponse.status}`);
        }

        const { cached, uncached, destination_coordinates } = await cacheResponse.json();
        const cacheEndTime = performance.now();
        const cacheTime = (cacheEndTime - cacheStartTime).toFixed(2);
        console.log(`⏱️ Cache check completed in ${cacheTime}ms`);

        // Phase 2: Immediately show cached results
        if (cached && Object.keys(cached).length > 0) {
            const cachedDistances = Object.entries(cached).map(([driverId, data]) => ({
                driverId: parseInt(driverId, 10),
                distance: data?.distance,
                source: data?.source,
            }));
            onDistancesUpdate(cachedDistances);
        }

        // Initialize variables for statistics tracking
        let originsForMapbox = [];
        let preliminaryDistances = [];

        // Phase 3: Process uncached origins with Turf.js preliminary calculation
        if (uncached && uncached.length > 0 && destination_coordinates) {
            const turfStartTime = performance.now();
            

            
            // Calculate preliminary distances and filter for Mapbox
            uncached.forEach(origin => {
                // Ensure both origin and destination coordinates are available for preliminary calculation
                if (origin.coordinates && destination_coordinates) {
                    const preliminaryDistance = calculatePreliminaryDistance(
                        origin.coordinates, 
                        destination_coordinates
                    );
                    
                    if (preliminaryDistance !== null) {
                        if (preliminaryDistance <= 200) {
                            // Distance <= 200 miles: send to Mapbox for accurate calculation
                            originsForMapbox.push(origin);
                        } else {
                            // Distance > 200 miles: use preliminary distance
                            preliminaryDistances.push({
                                driverId: parseInt(origin.id, 10),
                                distance: Math.round(preliminaryDistance * 1609.34), // Convert miles to meters to match backend format
                                source: 'preliminary',
                                preliminaryMiles: preliminaryDistance
                            });
                        }
                    } else {
                        // This case should ideally not be reached if origin.coordinates and destination_coordinates are checked above
                        // If preliminaryDistance is null despite having coordinates, something is wrong with calculatePreliminaryDistance
                        console.warn(`⚠️ Driver ${origin.id}: Preliminary distance calculation returned null despite having coordinates.`);
                        // Fallback: Send to Mapbox if calculation failed, assuming it's critical to get a distance.
                        originsForMapbox.push(origin);
                    }
                } else {
                    // No coordinates available for preliminary calculation, do NOT send to Mapbox
                    preliminaryDistances.push({
                        driverId: parseInt(origin.id, 10),
                        distance: null, // No distance can be calculated
                        source: 'no-coords-available', // Custom source to indicate why no distance
                        preliminaryMiles: null
                    });
                }
            });
            
            const turfEndTime = performance.now();
            const turfTime = (turfEndTime - turfStartTime).toFixed(2);
            console.log(`⏱️ Turf.js processing completed in ${turfTime}ms`);
            console.log(`🔢 Preliminary distances: ${preliminaryDistances.length}, Mapbox requests: ${originsForMapbox.length}`);
            
            // Phase 4: Immediately show preliminary distances
            if (preliminaryDistances.length > 0) {
                onDistancesUpdate(preliminaryDistances);
            }
            
            // Phase 5: Process remaining origins through Mapbox (if any)
            if (originsForMapbox.length > 0) {
                const mapboxStartTime = performance.now();
                const apiResponse = await apiClient(`${API_BASE_URL}/distance/batch`, {
                    method: 'POST',
                    body: JSON.stringify({ destination, origins: originsForMapbox }),
                });

                if (!apiResponse.ok) {
                    const errorData = await apiResponse.json();
                    throw new Error(errorData.message || `Mapbox processing failed with status ${apiResponse.status}`);
                }

                const apiResults = await apiResponse.json();
                const mapboxEndTime = performance.now();
                const mapboxTime = (mapboxEndTime - mapboxStartTime).toFixed(2);
                console.log(`⏱️ Mapbox API completed in ${mapboxTime}ms`);
                
                const apiDistances = Object.entries(apiResults).map(([driverId, data]) => ({
                    driverId: parseInt(driverId, 10),
                    distance: data?.distance,
                    source: data?.source,
                }));
                
                // Update UI with ONLY the Mapbox results (don't overwrite preliminary distances)
                onDistancesUpdate(apiDistances);
            }
        }

        const totalEndTime = performance.now();
        const totalTime = (totalEndTime - totalStartTime).toFixed(2);
        console.log(`⏱️ Total distance calculation completed in ${totalTime}ms`);
        
        // Log correct statistics for ActivityDashboard
        const cacheCount = cached ? Object.keys(cached).length : 0;
        const preliminaryCount = preliminaryDistances ? preliminaryDistances.length : 0;
        const mapboxCount = originsForMapbox ? originsForMapbox.length : 0;
        const totalProcessed = cacheCount + preliminaryCount + mapboxCount;
        
        console.log(`📊 Final statistics: ${cacheCount} cached, ${preliminaryCount} preliminary (Turf.js), ${mapboxCount} Mapbox - Total: ${totalProcessed}`);
        
        // Send correct statistics to backend for logging
        try {
            await apiClient(`${API_BASE_URL}/distance/log-stats`, {
                method: 'POST',
                body: JSON.stringify({
                    destination: destination,
                    total_drivers: totalProcessed,
                    cache_hits: cacheCount,
                    preliminary_calculations: preliminaryCount,
                    mapbox_requests: mapboxCount
                }),
            });
        } catch (error) {
            console.warn('Failed to log statistics to backend:', error.message);
        }

    } catch (error) {
        console.error(`❌ Distance calculation failed: ${error.message}`);
        if (error.message && error.message.includes('Mapbox API token is invalid or expired')) {
            throw error;
        }
        if (error.message && error.message.includes('Mapbox servers are busy')) {
            throw error;
        }
        if (error.message && error.message.includes('No trucks found in database')) {
            throw new Error("No trucks available for distance calculation.");
        }
        throw new Error("Distance calculation failed. Please try again.");
    } finally {
        if (onCalculationEnd) onCalculationEnd();
    }
}