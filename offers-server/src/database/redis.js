const Redis = require('ioredis');
const logger = require('../utils/logger');

/**
 * Redis Connection Manager for sessions and caching
 */
class RedisConnection {
    constructor() {
        this.client = null;
        this.config = {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: process.env.REDIS_PORT || 6379,
            retryDelayOnFailover: 100,
            enableReadyCheck: false,
            maxRetriesPerRequest: null,
        };
    }

    /**
     * Initialize Redis connection
     */
    async connect() {
        try {
            this.client = new Redis(this.config);
            
            this.client.on('connect', () => {
                logger.info('Redis connected');
            });
            
            this.client.on('error', (error) => {
                logger.error('Redis connection error:', error);
            });
            
            // Test connection
            await this.client.ping();
            logger.info('Redis connection established');
            return true;
        } catch (error) {
            logger.error('Redis connection failed:', error);
            throw error;
        }
    }

    /**
     * Store socket session
     * @param {string} socketId - Socket ID
     * @param {Object} sessionData - Session data
     * @param {number} ttl - Time to live in seconds
     */
    async setSocketSession(socketId, sessionData, ttl = 3600) {
        try {
            await this.client.setex(`socket:${socketId}`, ttl, JSON.stringify(sessionData));
        } catch (error) {
            logger.error('Error setting socket session:', error);
        }
    }

    /**
     * Get socket session
     * @param {string} socketId - Socket ID
     * @returns {Promise<Object|null>} - Session data
     */
    async getSocketSession(socketId) {
        try {
            const data = await this.client.get(`socket:${socketId}`);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Error getting socket session:', error);
            return null;
        }
    }

    /**
     * Remove socket session
     * @param {string} socketId - Socket ID
     */
    async removeSocketSession(socketId) {
        try {
            await this.client.del(`socket:${socketId}`);
        } catch (error) {
            logger.error('Error removing socket session:', error);
        }
    }

    /**
     * Set user online status
     * @param {number} userId - User ID
     * @param {string} userType - User type (dispatcher/driver)
     * @param {string} socketId - Socket ID
     */
    async setUserOnline(userId, userType, socketId) {
        try {
            const key = `presence:${userType}:${userId}`;
            const data = {
                socketId,
                status: 'online',
                lastSeen: new Date().toISOString()
            };
            await this.client.setex(key, 3600, JSON.stringify(data));
        } catch (error) {
            logger.error('Error setting user online:', error);
        }
    }

    /**
     * Set user offline status
     * @param {number} userId - User ID
     * @param {string} userType - User type (dispatcher/driver)
     */
    async setUserOffline(userId, userType) {
        try {
            const key = `presence:${userType}:${userId}`;
            const data = {
                status: 'offline',
                lastSeen: new Date().toISOString()
            };
            await this.client.setex(key, 86400, JSON.stringify(data)); // Keep offline status for 24h
        } catch (error) {
            logger.error('Error setting user offline:', error);
        }
    }

    /**
     * Get user presence status
     * @param {number} userId - User ID
     * @param {string} userType - User type (dispatcher/driver)
     * @returns {Promise<Object|null>} - Presence data
     */
    async getUserPresence(userId, userType) {
        try {
            const key = `presence:${userType}:${userId}`;
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Error getting user presence:', error);
            return null;
        }
    }

    /**
     * Set typing indicator
     * @param {string} roomName - Room name
     * @param {number} userId - User ID
     * @param {boolean} isTyping - Typing status
     */
    async setTypingIndicator(roomName, userId, isTyping) {
        try {
            const key = `typing:${roomName}:${userId}`;
            if (isTyping) {
                await this.client.setex(key, 10, 'typing'); // 10 seconds TTL
            } else {
                await this.client.del(key);
            }
        } catch (error) {
            logger.error('Error setting typing indicator:', error);
        }
    }

    /**
     * Get typing users in room
     * @param {string} roomName - Room name
     * @returns {Promise<Array>} - Array of typing user IDs
     */
    async getTypingUsers(roomName) {
        try {
            const keys = await this.client.keys(`typing:${roomName}:*`);
            return keys.map(key => key.split(':')[2]);
        } catch (error) {
            logger.error('Error getting typing users:', error);
            return [];
        }
    }

    /**
     * Cache data with TTL
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     * @param {number} ttl - Time to live in seconds
     */
    async cache(key, data, ttl = 300) {
        try {
            await this.client.setex(key, ttl, JSON.stringify(data));
        } catch (error) {
            logger.error('Error caching data:', error);
        }
    }

    /**
     * Get cached data
     * @param {string} key - Cache key
     * @returns {Promise<any|null>} - Cached data
     */
    async getCached(key) {
        try {
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Error getting cached data:', error);
            return null;
        }
    }

    /**
     * Close Redis connection
     */
    async close() {
        if (this.client) {
            await this.client.quit();
            logger.info('Redis connection closed');
        }
    }
}

module.exports = new RedisConnection();
