const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
require('dotenv').config();

// Import database connections and auth
const mysqlDB = require('./src/database/mysql');
const redisDB = require('./src/database/redis');
const jwtAuth = require('./src/auth/jwt');

const app = express();
const server = http.createServer(app);

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'offers-server' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Webhook endpoint for offer creation
app.post('/events/offer-created', express.json(), (req, res) => {
    try {
        const webhookSecret = req.headers['x-webhook-secret'];
        if (webhookSecret !== process.env.WEBHOOK_SECRET) {
            logger.warn('Invalid webhook secret for offer-created');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const offerData = req.body;
        logger.info('Received offer-created webhook:', offerData);

        // Broadcast to all connected clients
        io.emit('offer_created', offerData);
        
        res.json({ success: true });
    } catch (error) {
        logger.error('Error processing offer-created webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Webhook endpoint for chat messages
app.post('/events/message-sent', express.json(), (req, res) => {
    try {
        const webhookSecret = req.headers['x-webhook-secret'];
        if (webhookSecret !== process.env.WEBHOOK_SECRET) {
            logger.warn('Invalid webhook secret for message-sent');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { offer_id, driver_id, message } = req.body;
        logger.info('Received message-sent webhook:', { offer_id, driver_id, message_id: message.id });

        // Broadcast message to specific offer room
        io.to(`offer_${offer_id}`).emit('receive_message', {
            offer_id,
            driver_id,
            message
        });
        
        res.json({ success: true });
    } catch (error) {
        logger.error('Error processing message-sent webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Webhook endpoint for hold placed
app.post('/events/hold-placed', express.json(), (req, res) => {
    try {
        const webhookSecret = req.headers['x-webhook-secret'];
        if (webhookSecret !== process.env.WEBHOOK_SECRET) {
            logger.warn('Invalid webhook secret for hold-placed');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { truckId, dispatcherId, dispatcherName, startedAt } = req.body;
        logger.info('Received hold-placed webhook:', { truckId, dispatcherId, dispatcherName });

        // Store hold in Redis
        redisDB.setTruckHold(truckId, {
            dispatcherId,
            dispatcherName,
            truckId
        });

        // Broadcast to all connected clients
        io.emit('hold_placed', {
            truckId,
            dispatcherId,
            dispatcherName,
            startedAt
        });
        
        res.json({ success: true });
    } catch (error) {
        logger.error('Error processing hold-placed webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Webhook endpoint for hold removed
app.post('/events/hold-removed', express.json(), (req, res) => {
    try {
        const webhookSecret = req.headers['x-webhook-secret'];
        if (webhookSecret !== process.env.WEBHOOK_SECRET) {
            logger.warn('Invalid webhook secret for hold-removed');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { truckId, dispatcherId, removedAt } = req.body;
        logger.info('Received hold-removed webhook:', { truckId, dispatcherId });

        // Remove hold from Redis
        redisDB.removeTruckHold(truckId);

        // Broadcast to all connected clients
        io.emit('hold_removed', {
            truckId,
            dispatcherId,
            removedAt
        });
        
        res.json({ success: true });
    } catch (error) {
        logger.error('Error processing hold-removed webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip successful requests to reduce log noise
  skipSuccessfulRequests: false,
  // Skip failed requests to reduce log noise
  skipFailedRequests: false
});

// Trust proxy for rate limiting behind Nginx
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(limiter);
app.use(cors({
    origin: process.env.CORS_ORIGINS?.split(',') || ["https://connex.team", "http://localhost:3000"],
    credentials: true
}));
app.use(express.json());

// Socket.io setup with authentication
const io = socketIo(server, {
    cors: {
        origin: process.env.CORS_ORIGINS?.split(',') || ["https://connex.team", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Socket.io authentication middleware
io.use(jwtAuth.authenticateSocket);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Offers Socket.io Server',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        connections: io.engine.clientsCount
    });
});

// Initialize database connections
async function initializeConnections() {
    try {
        await mysqlDB.connect();
        await redisDB.connect();
        logger.info('All database connections established');
    } catch (error) {
        logger.error('Database connection failed:', error);
        process.exit(1);
    }
}

// Socket.io connection handling
io.on('connection', async (socket) => {
    logger.info(`User connected: ${socket.id} - User: ${socket.username} (${socket.userRole})`);
    
    // Store socket session in Redis
    await redisDB.setSocketSession(socket.id, {
        userId: socket.userId,
        username: socket.username,
        userType: socket.userType,
        userRole: socket.userRole
    });
    
    // Set user online status
    await redisDB.setUserOnline(socket.userId, socket.userType, socket.id);
    
    // Chat events
    socket.on('join_offer_chat', async (data) => {
        try {
            const { offerId, driverId } = data;
            const roomName = `offer_${offerId}_driver_${driverId}`;
            socket.join(roomName);
            
            // Load chat history
            const messages = await mysqlDB.getChatMessages(offerId, driverId, 50);
            socket.emit('chat_history', { offerId, driverId, messages });
            
            logger.info(`Socket ${socket.id} joined room: ${roomName}`);
        } catch (error) {
            logger.error('Error joining chat room:', error);
            socket.emit('error', { message: 'Failed to join chat room' });
        }
    });
    
    socket.on('send_message', async (data) => {
        try {
            const { offerId, driverId, message, messageType = 'text' } = data;
            const roomName = `offer_${offerId}_driver_${driverId}`;
            
            // Save message to database
            const messageId = await mysqlDB.saveChatMessage({
                offerId,
                driverId,
                senderType: socket.userType,
                senderId: socket.userId,
                message,
                messageType
            });
            
            // Broadcast to room
            const messageData = {
                id: messageId,
                message,
                messageType,
                senderType: socket.userType,
                senderId: socket.userId,
                senderName: socket.username,
                timestamp: new Date().toISOString(),
                isRead: false
            };
            
            io.to(roomName).emit('receive_message', messageData);
            logger.info(`Message ${messageId} sent in room ${roomName}`);
        } catch (error) {
            logger.error('Error sending message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });
    
    // Typing indicators
    socket.on('typing_start', async (data) => {
        try {
            const { offerId, driverId } = data;
            const roomName = `offer_${offerId}_driver_${driverId}`;
            
            await redisDB.setTypingIndicator(roomName, socket.userId, true);
            socket.to(roomName).emit('user_typing', { 
                userId: socket.userId, 
                username: socket.username,
                typing: true 
            });
        } catch (error) {
            logger.error('Error setting typing indicator:', error);
        }
    });
    
    socket.on('typing_stop', async (data) => {
        try {
            const { offerId, driverId } = data;
            const roomName = `offer_${offerId}_driver_${driverId}`;
            
            await redisDB.setTypingIndicator(roomName, socket.userId, false);
            socket.to(roomName).emit('user_typing', { 
                userId: socket.userId, 
                username: socket.username,
                typing: false 
            });
        } catch (error) {
            logger.error('Error removing typing indicator:', error);
        }
    });
    
    // Message read receipts
    socket.on('mark_message_read', async (data) => {
        try {
            const { messageId } = data;
            await mysqlDB.markMessageAsRead(messageId, socket.userId);
            socket.emit('message_read_confirmed', { messageId });
        } catch (error) {
            logger.error('Error marking message as read:', error);
        }
    });
    
    // Presence events
    socket.on('heartbeat', async () => {
        await redisDB.setUserOnline(socket.userId, socket.userType, socket.id);
        socket.emit('heartbeat_ack', { timestamp: new Date().toISOString() });
    });
    
    // Hold system events
    socket.on('place_hold', async (data) => {
        try {
            const { truckId, dispatcherId } = data;
            const dispatcherName = socket.fullName || 'Unknown';
            
            if (!truckId || !dispatcherId || !dispatcherName) {
                socket.emit('hold_error', { message: 'Missing required fields' });
                return;
            }

            // Check if truck already has an active hold
            const existingHold = await redisDB.getTruckHold(truckId);
            if (existingHold) {
                socket.emit('hold_error', { message: 'Truck already has an active hold' });
                return;
            }

            // Call PHP API to place hold in MySQL database
            try {
                const phpApiUrl = process.env.PHP_API_URL || 'https://connex.team/api';
                const headers = {
                    'Content-Type': 'application/json',
                    'X-Socket-Request': 'true' // Identify this as Socket.io request
                };

                // Add JWT token if available from socket auth
                if (socket.token) {
                    headers['Authorization'] = `Bearer ${socket.token}`;
                }

                const response = await fetch(`${phpApiUrl}/trucks/${truckId}/hold`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        dispatcher_id: dispatcherId,
                        dispatcher_name: socket.fullName || 'Unknown'
                    })
                });

                if (!response.ok) {
                    throw new Error(`PHP API responded with status: ${response.status}`);
                }

                logger.info('Successfully placed hold in MySQL via PHP API:', { truckId, dispatcherId, dispatcherName });
            } catch (apiError) {
                logger.error('Failed to place hold via PHP API:', apiError);
                socket.emit('hold_error', { message: 'Failed to sync with database' });
                return;
            }

            // Set hold in Redis with TTL
            await redisDB.setTruckHold(truckId, {
                dispatcherId,
                dispatcherName,
                truckId
            });

            // Broadcast to all clients
            const startedAt = new Date().toISOString();
            io.emit('hold_placed', {
                truckId,
                dispatcherId,
                dispatcherName,
                startedAt
            });

            logger.info('Hold placed via Socket.io:', { truckId, dispatcherId, dispatcherName });
        } catch (error) {
            logger.error('Error placing hold:', error);
            socket.emit('hold_error', { message: 'Failed to place hold' });
        }
    });
    
    socket.on('remove_hold', async (data) => {
        try {
            const { truckId, dispatcherId } = data;
            
            if (!truckId || !dispatcherId) {
                socket.emit('hold_error', { message: 'Missing truckId or dispatcherId' });
                return;
            }

            // Get current hold to verify ownership
            const currentHold = await redisDB.getTruckHold(truckId);
            if (!currentHold) {
                socket.emit('hold_error', { message: 'No active hold found' });
                return;
            }

            if (currentHold.dispatcherId !== dispatcherId) {
                socket.emit('hold_error', { message: 'Cannot remove hold placed by another dispatcher' });
                return;
            }

            // Call PHP API to remove hold from MySQL database
            try {
                const phpApiUrl = process.env.PHP_API_URL || 'https://connex.team/api';
                const headers = {
                    'Content-Type': 'application/json',
                    'X-Socket-Request': 'true' // Identify this as Socket.io request
                };

                // Add JWT token if available from socket auth
                if (socket.token) {
                    headers['Authorization'] = `Bearer ${socket.token}`;
                }

                const response = await fetch(`${phpApiUrl}/trucks/${truckId}/hold`, {
                    method: 'DELETE',
                    headers,
                    body: JSON.stringify({
                        dispatcher_id: dispatcherId
                    })
                });

                if (!response.ok) {
                    throw new Error(`PHP API responded with status: ${response.status}`);
                }

                logger.info('Successfully removed hold from MySQL via PHP API:', { truckId, dispatcherId });
            } catch (apiError) {
                logger.error('Failed to remove hold from PHP API:', apiError);
                socket.emit('hold_error', { message: 'Failed to sync with database' });
                return;
            }

            // Remove hold from Redis
            await redisDB.removeTruckHold(truckId);

            // Broadcast to all clients
            io.emit('hold_removed', {
                truckId,
                dispatcherId,
                removedAt: new Date().toISOString()
            });

            logger.info('Hold removed via Socket.io:', { truckId, dispatcherId });
        } catch (error) {
            logger.error('Error removing hold via Socket.io:', error);
            socket.emit('hold_error', { message: 'Failed to remove hold' });
        }
    });
    
    socket.on('get_active_holds', async () => {
        try {
            const activeHolds = await redisDB.getAllActiveHolds();
            socket.emit('active_holds', activeHolds);
        } catch (error) {
            logger.error('Error getting active holds:', error);
            socket.emit('hold_error', { message: 'Failed to get active holds' });
        }
    });

    // Test event
    socket.on('ping', (data) => {
        socket.emit('pong', { 
            message: 'Server is working!', 
            timestamp: new Date().toISOString(),
            user: socket.username,
            data 
        });
    });
    
    // Disconnect handling
    socket.on('disconnect', async (reason) => {
        logger.info(`User disconnected: ${socket.id} (${socket.username}), reason: ${reason}`);
        
        // Update user presence in Redis
        await redisDB.setUserOffline(socket.userId, socket.userType);
        await redisDB.removeSocketSession(socket.id);
    });
});

// Error handling
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const PORT = process.env.PORT || 3001;

// Setup hold expiration handler using Redis key notifications
async function setupHoldExpirationHandler() {
    // Реєструємо обробник подій закінчення hold
    redisDB.onHoldExpired(async (data) => {
        try {
            const { truckId, expiredAt } = data;
            
            // Синхронізація з MySQL - видалення hold в базі даних
            try {
                const phpApiUrl = process.env.PHP_API_URL || 'https://connex.team/api';
                const headers = {
                    'Content-Type': 'application/json',
                    'X-Socket-Request': 'true',
                    'X-Webhook-Secret': process.env.WEBHOOK_SECRET
                };
                
                // Використовуємо спеціальний системний запит для автоматичного зняття hold
                const response = await fetch(`${phpApiUrl}/trucks/${truckId}/hold/expire`, {
                    method: 'DELETE',
                    headers,
                    body: JSON.stringify({
                        expired_at: expiredAt
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`PHP API responded with status: ${response.status}`);
                }
                
                logger.info(`Successfully synchronized expired hold with MySQL for truck ${truckId}`);
            } catch (apiError) {
                logger.error(`Failed to synchronize expired hold with MySQL for truck ${truckId}:`, apiError);
            }
            
            // Broadcast hold_expired event to all clients
            io.emit('hold_expired', {
                truckId,
                expiredAt
            });
            
            logger.info(`Hold expired event emitted for truck ${truckId}`);
        } catch (error) {
            logger.error('Error handling hold expiration:', error);
        }
    });
    
    logger.info('Hold expiration handler setup complete');
}

// Start server with database initialization
async function startServer() {
    try {
        // Initialize database connections first
        await initializeConnections();
        
        // Setup hold expiration handler
        await setupHoldExpirationHandler();
        
        // Start HTTP server
        server.listen(PORT, () => {
            logger.info(`🚀 Offers Socket.io Server running on port ${PORT}`);
            logger.info(`📡 Health check: https://offers.connex.team/health`);
            logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`💾 Database connections: MySQL ✅ Redis ✅`);
            logger.info(`⏰ Hold monitoring: Active (Redis key notifications)`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
