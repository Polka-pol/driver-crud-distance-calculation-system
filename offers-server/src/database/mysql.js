const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

/**
 * MySQL Database Connection Manager
 */
class MySQLConnection {
    constructor() {
        this.pool = null;
        this.config = {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            charset: process.env.DB_CHARSET || 'utf8mb4',
            connectionLimit: 10,
            acquireTimeout: 60000,
            timeout: 60000,
            reconnect: true
        };
    }

    /**
     * Initialize database connection pool
     */
    async connect() {
        try {
            this.pool = mysql.createPool(this.config);
            
            // Test connection
            const connection = await this.pool.getConnection();
            await connection.ping();
            connection.release();
            
            logger.info('MySQL connection pool established');
            return true;
        } catch (error) {
            logger.error('MySQL connection failed:', error);
            throw error;
        }
    }

    /**
     * Execute query
     * @param {string} query - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Array>} - Query results
     */
    async query(query, params = []) {
        try {
            const [results] = await this.pool.execute(query, params);
            return results;
        } catch (error) {
            logger.error('MySQL query error:', { query, params, error: error.message });
            throw error;
        }
    }

    /**
     * Get user by ID
     * @param {number} userId - User ID
     * @returns {Promise<Object>} - User object
     */
    async getUserById(userId) {
        const query = 'SELECT id, username, email, full_name, role, is_active FROM users WHERE id = ? AND is_active = 1';
        const results = await this.query(query, [userId]);
        return results[0] || null;
    }

    /**
     * Get truck/driver by ID
     * @param {number} driverId - Driver/Truck ID
     * @returns {Promise<Object>} - Driver object
     */
    async getDriverById(driverId) {
        const query = 'SELECT ID, TruckNumber, DriverName, CellPhone, Status, isActive FROM Trucks WHERE ID = ? AND isActive = 1';
        const results = await this.query(query, [driverId]);
        return results[0] || null;
    }

    /**
     * Save chat message
     * @param {Object} messageData - Message data
     * @returns {Promise<number>} - Message ID
     */
    async saveChatMessage(messageData) {
        const { offerId, driverId, senderType, senderId, message, messageType = 'text' } = messageData;
        
        const query = `
            INSERT INTO chat_messages (offer_id, driver_id, sender_type, sender_id, message, message_type, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `;
        
        const result = await this.query(query, [offerId, driverId, senderType, senderId, message, messageType]);
        return result.insertId;
    }

    /**
     * Get chat messages for offer and driver
     * @param {number} offerId - Offer ID
     * @param {number} driverId - Driver ID
     * @param {number} limit - Message limit
     * @returns {Promise<Array>} - Chat messages
     */
    async getChatMessages(offerId, driverId, limit = 50) {
        const query = `
            SELECT id, sender_type, sender_id, message, message_type, is_read, created_at
            FROM chat_messages
            WHERE offer_id = ? AND driver_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `;
        
        const results = await this.query(query, [offerId, driverId, limit]);
        return results.reverse(); // Return in chronological order
    }

    /**
     * Mark message as read
     * @param {number} messageId - Message ID
     * @param {number} userId - User ID who read the message
     * @returns {Promise<boolean>} - Success status
     */
    async markMessageAsRead(messageId, userId) {
        const query = 'UPDATE chat_messages SET is_read = 1 WHERE id = ?';
        const result = await this.query(query, [messageId]);
        return result.affectedRows > 0;
    }

    /**
     * Close database connection
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            logger.info('MySQL connection pool closed');
        }
    }
}

module.exports = new MySQLConnection();
