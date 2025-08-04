import { API_BASE_URL } from '../config';
import { apiClient } from './apiClient';

/**
 * Optimized distance calculation with backend handling truck data retrieval.
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

    const totalStartTime = performance.now();

    try {
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

        const { cached, uncached } = await cacheResponse.json();
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

        // Phase 3: Fast Mapbox processing (if needed)
        if (uncached && uncached.length > 0) {
            const mapboxStartTime = performance.now();
            const apiResponse = await apiClient(`${API_BASE_URL}/distance/batch`, {
                method: 'POST',
                body: JSON.stringify({ destination, origins: uncached }),
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
            
            // Update UI with the new results from Mapbox
            onDistancesUpdate(apiDistances);
        }

        const totalEndTime = performance.now();
        const totalTime = (totalEndTime - totalStartTime).toFixed(2);
        console.log(`⏱️ Total distance calculation completed in ${totalTime}ms`);

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