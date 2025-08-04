import { API_BASE_URL } from '../config';

const TOKEN_KEY = 'connex_jwt';
const USER_KEY = 'connex_user';

/**
 * Handles the login API call.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<object>} The user data from the server.
 */
export async function login(username, password) {
    const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Login failed.');
    }

    if (data.token && data.user) {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }

    return data.user;
}

/**
 * Handles logout by removing the token and user info.
 */
export function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // Optionally, redirect to login page or refresh the app
    window.location.reload();
}

/**
 * Retrieves the JWT from localStorage.
 * @returns {string|null} The token or null if not found.
 */
export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

/**
 * Retrieves the user info from localStorage.
 * @returns {object|null} The user object or null if not found.
 */
export function getCurrentUser() {
    const user = localStorage.getItem(USER_KEY);
    try {
        return user ? JSON.parse(user) : null;
    } catch (e) {
        return null;
    }
}

/**
 * Checks if a user is currently authenticated.
 * This is a basic check. A more robust implementation would also decode
 * the token and verify its expiration date.
 * @returns {boolean}
 */
export function isAuthenticated() {
    const token = getToken();
    return !!token;
}