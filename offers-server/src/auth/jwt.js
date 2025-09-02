const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

/**
 * JWT Authentication middleware for Socket.io
 */
class JWTAuth {
    constructor() {
        this.secret = process.env.JWT_SECRET;
        if (!this.secret) {
            throw new Error('JWT_SECRET environment variable is required');
        }
    }

    /**
     * Verify JWT token
     * @param {string} token - JWT token to verify
     * @returns {Promise<Object>} - Decoded token payload
     */
    async verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.secret);
            return {
                success: true,
                user: decoded
            };
        } catch (error) {
            logger.error('JWT verification failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Socket.io authentication middleware
     * @param {Object} socket - Socket.io socket instance
     * @param {Function} next - Next middleware function
     */
    authenticateSocket = async (socket, next) => {
        try {
            const bearer = socket.handshake.headers?.authorization;
            const token = socket.handshake.auth?.token || (bearer && bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined);

            if (!token) {
                return next(new Error('Authentication token required'));
            }

            const result = await this.verifyToken(token);

            if (!result.success) {
                logger.warn(`Socket ${socket.id} failed auth: ${result.error}`);
                return next(new Error('Invalid authentication token'));
            }

            // Support payloads with user fields nested under `data`
            const payload = result.user && typeof result.user === 'object' ? result.user : {};
            const userData = payload.data && typeof payload.data === 'object' ? payload.data : payload;

            // Attach user info to socket (fallbacks for missing fields)
            socket.userId = userData.id;
            socket.username = userData.username || 'unknown';
            socket.fullName = userData.fullName || 'Unknown';
            socket.userRole = userData.role || 'user';
            socket.userType = socket.userRole === 'admin' || socket.userRole === 'dispatcher' ? 'dispatcher' : 'driver';
            socket.token = token; // Store original token for API calls

            if (!socket.userId) {
                logger.warn(`Authenticated token missing userId field (payload keys: ${Object.keys(userData).join(',')})`);
            }

            logger.info(`Socket authenticated: ${socket.id} - User: ${socket.username} (${socket.userRole})`);
            next();
        } catch (error) {
            logger.error('Socket authentication error:', error);
            next(new Error('Authentication failed'));
        }
    }

    /**
     * Check if user has required role
     * @param {Object} socket - Socket.io socket instance
     * @param {Array} allowedRoles - Array of allowed roles
     * @returns {boolean} - True if user has required role
     */
    hasRole(socket, allowedRoles) {
        return allowedRoles.includes(socket.userRole);
    }
}

module.exports = new JWTAuth();
