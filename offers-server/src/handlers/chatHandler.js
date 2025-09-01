const logger = require('../utils/logger');
const mysqlDB = require('../database/mysql');
const redisDB = require('../database/redis');

/**
 * Chat Event Handlers for Socket.io
 */
class ChatHandler {
    constructor(io) {
        this.io = io;
    }

    /**
     * Handle joining offer chat room
     */
    async handleJoinOfferChat(socket, data) {
        try {
            const { offerId, driverId } = data;
            const roomName = `offer_${offerId}_driver_${driverId}`;
            
            // Validate permissions
            if (socket.userType === 'dispatcher' || 
                (socket.userType === 'driver' && socket.userId === driverId)) {
                
                socket.join(roomName);
                
                // Load chat history
                const messages = await mysqlDB.getChatMessages(offerId, driverId, 50);
                socket.emit('chat_history', { offerId, driverId, messages });
                
                // Notify room about user joining
                socket.to(roomName).emit('user_joined_chat', {
                    userId: socket.userId,
                    username: socket.username,
                    userType: socket.userType
                });
                
                logger.info(`Socket ${socket.id} (${socket.username}) joined room: ${roomName}`);
            } else {
                socket.emit('error', { message: 'Unauthorized to join this chat' });
            }
        } catch (error) {
            logger.error('Error joining chat room:', error);
            socket.emit('error', { message: 'Failed to join chat room' });
        }
    }

    /**
     * Handle sending chat message
     */
    async handleSendMessage(socket, data) {
        try {
            const { offerId, driverId, message, messageType = 'text' } = data;
            const roomName = `offer_${offerId}_driver_${driverId}`;
            
            // Validate message
            if (!message || message.trim().length === 0) {
                socket.emit('error', { message: 'Message cannot be empty' });
                return;
            }
            
            if (message.length > 1000) {
                socket.emit('error', { message: 'Message too long (max 1000 characters)' });
                return;
            }
            
            // Save message to database
            const messageId = await mysqlDB.saveChatMessage({
                offerId,
                driverId,
                senderType: socket.userType,
                senderId: socket.userId,
                message: message.trim(),
                messageType
            });
            
            // Broadcast to room (include routing identifiers)
            const messageData = {
                id: messageId,
                offerId,
                driverId,
                message: message.trim(),
                messageType,
                senderType: socket.userType,
                senderId: socket.userId,
                senderName: socket.username,
                timestamp: new Date().toISOString(),
                isRead: false
            };

            this.io.to(roomName).emit('receive_message', messageData);
            logger.info(`Message ${messageId} sent by ${socket.username} in room ${roomName}`);
            
            // Clear typing indicator
            await redisDB.setTypingIndicator(roomName, socket.userId, false);
            socket.to(roomName).emit('user_typing', { 
                offerId,
                driverId,
                userId: socket.userId, 
                username: socket.username,
                typing: false,
                isTyping: false
            });
            
        } catch (error) {
            logger.error('Error sending message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    }

    /**
     * Handle typing start indicator
     */
    async handleTypingStart(socket, data) {
        try {
            const { offerId, driverId } = data;
            const roomName = `offer_${offerId}_driver_${driverId}`;
            
            await redisDB.setTypingIndicator(roomName, socket.userId, true);
            socket.to(roomName).emit('user_typing', { 
                offerId,
                driverId,
                userId: socket.userId, 
                username: socket.username,
                typing: true,
                isTyping: true 
            });
        } catch (error) {
            logger.error('Error setting typing indicator:', error);
        }
    }

    /**
     * Handle typing stop indicator
     */
    async handleTypingStop(socket, data) {
        try {
            const { offerId, driverId } = data;
            const roomName = `offer_${offerId}_driver_${driverId}`;
            
            await redisDB.setTypingIndicator(roomName, socket.userId, false);
            socket.to(roomName).emit('user_typing', { 
                offerId,
                driverId,
                userId: socket.userId, 
                username: socket.username,
                typing: false,
                isTyping: false 
            });
        } catch (error) {
            logger.error('Error removing typing indicator:', error);
        }
    }

    /**
     * Handle marking message as read
     */
    async handleMarkMessageRead(socket, data) {
        try {
            const { messageId, offerId, driverId } = data;
            
            await mysqlDB.markMessageAsRead(messageId, socket.userId);
            
            // Notify sender about read receipt
            const roomName = `offer_${offerId}_driver_${driverId}`;
            socket.to(roomName).emit('message_read_receipt', {
                messageId,
                readBy: socket.userId,
                readByName: socket.username,
                readAt: new Date().toISOString()
            });
            
            socket.emit('message_read_confirmed', { messageId });
        } catch (error) {
            logger.error('Error marking message as read:', error);
        }
    }

    /**
     * Handle leaving chat room
     */
    async handleLeaveChatRoom(socket, data) {
        try {
            const { offerId, driverId } = data;
            const roomName = `offer_${offerId}_driver_${driverId}`;
            
            socket.leave(roomName);
            
            // Clear typing indicator
            await redisDB.setTypingIndicator(roomName, socket.userId, false);
            
            // Notify room about user leaving
            socket.to(roomName).emit('user_left_chat', {
                userId: socket.userId,
                username: socket.username,
                userType: socket.userType
            });
            
            logger.info(`Socket ${socket.id} (${socket.username}) left room: ${roomName}`);
        } catch (error) {
            logger.error('Error leaving chat room:', error);
        }
    }
}

module.exports = ChatHandler;
