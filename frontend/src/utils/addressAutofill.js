import { API_BASE_URL } from '../config';
import { apiClient } from './apiClient';

/**
 * Fetches address suggestions from the backend's "smart" search endpoint.
 *
 * This function encapsulates the logic for calling the `/api/search` endpoint,
 * which internally handles caching and external API calls to Mapbox.
 *
 * @param {string} query The user's input string.
 * @param {function} setSuggestions Callback to update the suggestions state in the calling component.
 * @param {function} setIsLoading Callback to update the loading state.
 * @param {function} [setError] Optional callback to update the error state.
 */
export const getAddressSuggestions = async (query, setSuggestions, setIsLoading, setError = null) => {
    if (query.length < 3) {
        setSuggestions([]);
        setError && setError(null);
        return;
    }
    setIsLoading(true);
    setError && setError(null);

    try {
        const response = await apiClient(`${API_BASE_URL}/search?query=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            // Try to parse the error message from the backend, otherwise use a generic error.
            let errorMessage = `HTTP error ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                // Ignore if response is not JSON
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();

        // Backend already handles ZIP filtering, no need to filter again
        setSuggestions(data || []);

    } catch (error) {
        console.error('Failed to fetch address suggestions:', error.message);
        setSuggestions([]);
        
        // Show user-friendly error if it's an auth issue
        if (error.message.includes('Session expired')) {
            // Auth error is handled by apiClient (logout + reload)
            return;
        }
        
        // Set error for display in component
        setError && setError('Failed to load suggestions. Please try again.');
    } finally {
        setIsLoading(false);
    }
};

/**
 * Checks for recent searches of similar addresses by other users.
 *
 * @param {string} query The address query to check for recent searches.
 * @returns {Promise<Array>} Array of recent search matches with user info.
 */
export const getRecentSearches = async (query) => {
    if (query.length < 3) {
        return [];
    }

    try {
        const response = await apiClient(`${API_BASE_URL}/search/recent?query=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            // Don't throw error for recent searches - it's not critical
            console.warn('Failed to fetch recent searches:', response.status);
            return [];
        }

        const data = await response.json();
        return data.matches || [];

    } catch (error) {
        console.warn('Failed to check recent searches:', error.message);
        return [];
    }
};