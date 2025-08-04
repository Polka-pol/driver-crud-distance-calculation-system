import { getToken, logout } from './auth';

/**
 * A custom fetch wrapper that adds the Authorization header to every request.
 * It also handles automatic logout on 401 Unauthorized responses.
 *
 * @param {string} url The URL to fetch.
 * @param {object} options The options for the fetch call (method, headers, body, etc.).
 * @returns {Promise<Response>} The fetch Response object.
 */
export async function apiClient(url, options = {}) {
    const token = getToken();

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        ...options,
        headers,
        credentials: 'include'
    };

    const response = await fetch(url, config);

    if (response.status === 401) {
        // The token is invalid or expired.
        // Log the user out and reload to show the login page.
        logout();
        // We throw an error to prevent the rest of the code from executing
        throw new Error('Session expired. Please log in again.');
    }

    return response;
} 