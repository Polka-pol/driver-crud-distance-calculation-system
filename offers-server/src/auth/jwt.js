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
    async authenticateSocket(socket, next) {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
            
            if (!token) {
                return next(new Error('Authentication token required'));
            }

            const result = await this.verifyToken(token);
            
            if (!result.success) {
                return next(new Error('Invalid authentication token'));
            }

            // Attach user info to socket
            socket.userId = result.user.id;
            socket.username = result.user.username;
            socket.userRole = result.user.role;
            socket.userType = result.user.role === 'admin' || result.user.role === 'dispatcher' ? 'dispatcher' : 'driver';

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
