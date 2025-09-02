const Redis = require('ioredis');
const logger = require('../utils/logger');

/**
 * Redis Connection Manager for sessions and caching
 */
class RedisConnection {
    constructor() {
        this.client = null;
        this.subscriber = null; // Окремий клієнт для підписок
        this.config = {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: process.env.REDIS_PORT || 6379,
            retryDelayOnFailover: 100,
            enableReadyCheck: false,
            maxRetriesPerRequest: null,
        };
        this.keyExpirationHandlers = new Map(); // Обробники подій закінчення ключів
    }

    /**
     * Initialize Redis connection
     */
    async connect() {
        try {
            // Основний клієнт для операцій
            this.client = new Redis(this.config);
            
            this.client.on('connect', () => {
                logger.info('Redis main client connected');
            });
            
            this.client.on('error', (error) => {
                logger.error('Redis main client error:', error);
            });
            
            // Окремий клієнт для підписок на події
            this.subscriber = new Redis(this.config);
            
            this.subscriber.on('connect', () => {
                logger.info('Redis subscriber client connected');
            });
            
            this.subscriber.on('error', (error) => {
                logger.error('Redis subscriber client error:', error);
            });
            
            // Налаштування підписки на події закінчення ключів
            await this.setupKeyExpirationEvents();
            
            // Test connection
            await this.client.ping();
            logger.info('Redis connections established');
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
     * Set truck hold with TTL (15 minutes)
     * @param {number} truckId - Truck ID
     * @param {Object} holdData - Hold information
     */
    async setTruckHold(truckId, holdData) {
        try {
            const key = `hold:truck:${truckId}`;
            const ttl = 15 * 60; // 15 minutes in seconds
            await this.client.setex(key, ttl, JSON.stringify({
                ...holdData,
                startedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + ttl * 1000).toISOString()
            }));
            logger.info(`Hold set for truck ${truckId} with TTL ${ttl}s`);
        } catch (error) {
            logger.error('Error setting truck hold:', error);
        }
    }

    /**
     * Get truck hold information
     * @param {number} truckId - Truck ID
     * @returns {Promise<Object|null>} - Hold data
     */
    async getTruckHold(truckId) {
        try {
            const key = `hold:truck:${truckId}`;
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Error getting truck hold:', error);
            return null;
        }
    }

    /**
     * Remove truck hold
     * @param {number} truckId - Truck ID
     */
    async removeTruckHold(truckId) {
        try {
            const key = `hold:truck:${truckId}`;
            await this.client.del(key);
            logger.info(`Hold removed for truck ${truckId}`);
        } catch (error) {
            logger.error('Error removing truck hold:', error);
        }
    }

    /**
     * Get all active holds
     * @returns {Promise<Array>} - Array of active holds with truck IDs
     */
    async getAllActiveHolds() {
        try {
            const keys = await this.client.keys('hold:truck:*');
            const holds = [];
            
            for (const key of keys) {
                const data = await this.client.get(key);
                if (data) {
                    const truckId = key.split(':')[2];
                    holds.push({
                        truckId: parseInt(truckId),
                        ...JSON.parse(data)
                    });
                }
            }
            
            return holds;
        } catch (error) {
            logger.error('Error getting all active holds:', error);
            return [];
        }
    }

    /**
     * Setup Redis key expiration events
     */
    async setupKeyExpirationEvents() {
        try {
            // Налаштування Redis для сповіщень про закінчення ключів
            await this.client.config('SET', 'notify-keyspace-events', 'Ex');
            
            // Підписка на події закінчення ключів
            this.subscriber.on('message', (channel, message) => {
                // Формат каналу: __keyevent@0__:expired
                if (channel.includes(':expired')) {
                    this.handleKeyExpiration(message);
                }
            });
            
            // Підписка на канал закінчення ключів
            await this.subscriber.subscribe('__keyevent@0__:expired');
            logger.info('Subscribed to Redis key expiration events');
        } catch (error) {
            logger.error('Error setting up key expiration events:', error);
        }
    }
    
    /**
     * Handle key expiration event
     * @param {string} key - Expired key
     */
    handleKeyExpiration(key) {
        try {
            // Перевірка, чи це ключ hold
            if (key.startsWith('hold:truck:')) {
                const truckId = key.split(':')[2];
                logger.info(`Hold expired for truck ${truckId} (via key expiration event)`);
                
                // Викликаємо всі зареєстровані обробники для закінчення hold
                if (this.keyExpirationHandlers.has('hold-expired')) {
                    const handlers = this.keyExpirationHandlers.get('hold-expired');
                    handlers.forEach(handler => {
                        handler({
                            truckId: parseInt(truckId),
                            expiredAt: new Date().toISOString()
                        });
                    });
                }
            }
        } catch (error) {
            logger.error('Error handling key expiration:', error);
        }
    }
    
    /**
     * Register handler for hold expiration events
     * @param {Function} handler - Function to call when a hold expires
     */
    onHoldExpired(handler) {
        if (!this.keyExpirationHandlers.has('hold-expired')) {
            this.keyExpirationHandlers.set('hold-expired', []);
        }
        this.keyExpirationHandlers.get('hold-expired').push(handler);
        logger.info('Registered new handler for hold expiration events');
    }
    
    /**
     * Close Redis connection
     */
    async close() {
        if (this.client) {
            await this.client.quit();
            logger.info('Redis main client closed');
        }
        
        if (this.subscriber) {
            await this.subscriber.quit();
            logger.info('Redis subscriber client closed');
        }
    }
}

module.exports = new RedisConnection();
