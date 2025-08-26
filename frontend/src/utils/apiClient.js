import { supabaseHelpers } from '../supabaseClient';

/**
 * A custom fetch wrapper that adds the Authorization header to every request.
 * It also handles automatic logout on 401 Unauthorized responses.
 *
 * @param {string} url The URL to fetch.
 * @param {object} options The options for the fetch call (method, headers, body, etc.).
 * @returns {Promise<Response>} The fetch Response object.
 */
export async function apiClient(url, options = {}) {
    // Source token from Supabase session
    const { data: sessionData } = await supabaseHelpers.getCurrentSession();
    const token = sessionData?.session?.access_token || null;

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        ...options,
        headers
    };

    const response = await fetch(url, config);

    if (response.status === 401) {
        // Attempt silent sign-out so UI can react via auth context without full reload
        try { await supabaseHelpers.signOut(); } catch (_) {}
        throw new Error('Session expired. Please log in again.');
    }

    return response;
} 

export async function fetchMyPermissions(baseUrl) {
    const res = await apiClient(`${baseUrl}/me/permissions`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.data) ? data.data : [];
}