const logger = require('../utils/logger');
const mysqlDB = require('../database/mysql');
const redisDB = require('../database/redis');

/**
 * Offer Event Handlers for Socket.io
 */
class OfferHandler {
    constructor(io) {
        this.io = io;
    }

    /**
     * Handle new offer creation notification
     */
    async handleNewOfferCreated(socket, data) {
        try {
            const { offerId, driverIds, offerDetails } = data;
            
            // Validate dispatcher permissions
            if (socket.userType !== 'dispatcher') {
                socket.emit('error', { message: 'Only dispatchers can create offers' });
                return;
            }
            
            // Notify selected drivers about new offer
            for (const driverId of driverIds) {
                const driverPresence = await redisDB.getUserPresence(driverId, 'driver');
                
                if (driverPresence && driverPresence.status === 'online') {
                    // Send real-time notification to online driver
                    this.io.to(driverPresence.socketId).emit('new_offer_received', {
                        offerId,
                        dispatcherName: socket.username,
                        offerDetails,
                        timestamp: new Date().toISOString()
                    });
                }
            }
            
            logger.info(`Offer ${offerId} created by ${socket.username} for ${driverIds.length} drivers`);
            socket.emit('offer_created_confirmed', { offerId });
            
        } catch (error) {
            logger.error('Error handling new offer creation:', error);
            socket.emit('error', { message: 'Failed to create offer notification' });
        }
    }

    /**
     * Handle driver proposal response
     */
    async handleDriverProposal(socket, data) {
        try {
            const { offerId, proposalStatus, proposedRate, notes } = data;
            
            // Validate driver permissions
            if (socket.userType !== 'driver') {
                socket.emit('error', { message: 'Only drivers can respond to offers' });
                return;
            }
            
            // Get offer details to find dispatcher
            const offer = await mysqlDB.query(
                'SELECT created_by FROM offers WHERE id = ?', 
                [offerId]
            );
            
            if (!offer || offer.length === 0) {
                socket.emit('error', { message: 'Offer not found' });
                return;
            }
            
            const dispatcherId = offer[0].created_by;
            
            // Update proposal in database
            await mysqlDB.query(`
                INSERT INTO offer_proposals (offer_id, driver_id, status, driver_proposed_rate, responded_at)
                VALUES (?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE 
                status = VALUES(status), 
                driver_proposed_rate = VALUES(driver_proposed_rate),
                responded_at = NOW()
            `, [offerId, socket.userId, proposalStatus, proposedRate]);
            
            // Notify dispatcher about driver response
            const dispatcherPresence = await redisDB.getUserPresence(dispatcherId, 'dispatcher');
            
            if (dispatcherPresence && dispatcherPresence.status === 'online') {
                this.io.to(dispatcherPresence.socketId).emit('driver_proposal_response', {
                    offerId,
                    driverId: socket.userId,
                    driverName: socket.username,
                    proposalStatus,
                    proposedRate,
                    notes,
                    timestamp: new Date().toISOString()
                });
            }
            
            // Add system message to chat
            const messageId = await mysqlDB.saveChatMessage({
                offerId,
                driverId: socket.userId,
                senderType: 'system',
                senderId: 0,
                message: `Driver ${proposalStatus} the offer${proposedRate ? ` with rate $${proposedRate}` : ''}${notes ? `: ${notes}` : ''}`,
                messageType: 'system'
            });
            
            // Broadcast system message to chat room
            const roomName = `offer_${offerId}_driver_${socket.userId}`;
            this.io.to(roomName).emit('receive_message', {
                id: messageId,
                message: `Driver ${proposalStatus} the offer${proposedRate ? ` with rate $${proposedRate}` : ''}${notes ? `: ${notes}` : ''}`,
                messageType: 'system',
                senderType: 'system',
                senderId: 0,
                senderName: 'System',
                timestamp: new Date().toISOString(),
                isRead: false
            });
            
            logger.info(`Driver ${socket.username} ${proposalStatus} offer ${offerId}`);
            socket.emit('proposal_submitted', { offerId, status: proposalStatus });
            
        } catch (error) {
            logger.error('Error handling driver proposal:', error);
            socket.emit('error', { message: 'Failed to submit proposal' });
        }
    }

    /**
     * Handle offer status change
     */
    async handleOfferStatusChange(socket, data) {
        try {
            const { offerId, newStatus, reason } = data;
            
            // Validate dispatcher permissions
            if (socket.userType !== 'dispatcher') {
                socket.emit('error', { message: 'Only dispatchers can change offer status' });
                return;
            }
            
            // Update offer status in database
            await mysqlDB.query(
                'UPDATE offers SET status = ?, updated_at = NOW() WHERE id = ? AND created_by = ?',
                [newStatus, offerId, socket.userId]
            );
            
            // Get all drivers involved in this offer
            const proposals = await mysqlDB.query(
                'SELECT driver_id FROM offer_proposals WHERE offer_id = ?',
                [offerId]
            );
            
            // Notify all involved drivers
            for (const proposal of proposals) {
                const driverPresence = await redisDB.getUserPresence(proposal.driver_id, 'driver');
                
                if (driverPresence && driverPresence.status === 'online') {
                    this.io.to(driverPresence.socketId).emit('offer_status_changed', {
                        offerId,
                        newStatus,
                        reason,
                        dispatcherName: socket.username,
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Add system message to each driver's chat
                const messageId = await mysqlDB.saveChatMessage({
                    offerId,
                    driverId: proposal.driver_id,
                    senderType: 'system',
                    senderId: 0,
                    message: `Offer status changed to ${newStatus}${reason ? `: ${reason}` : ''}`,
                    messageType: 'system'
                });
                
                // Broadcast to chat room
                const roomName = `offer_${offerId}_driver_${proposal.driver_id}`;
                this.io.to(roomName).emit('receive_message', {
                    id: messageId,
                    message: `Offer status changed to ${newStatus}${reason ? `: ${reason}` : ''}`,
                    messageType: 'system',
                    senderType: 'system',
                    senderId: 0,
                    senderName: 'System',
                    timestamp: new Date().toISOString(),
                    isRead: false
                });
            }
            
            logger.info(`Offer ${offerId} status changed to ${newStatus} by ${socket.username}`);
            socket.emit('offer_status_updated', { offerId, newStatus });
            
        } catch (error) {
            logger.error('Error handling offer status change:', error);
            socket.emit('error', { message: 'Failed to update offer status' });
        }
    }

    /**
     * Handle getting offer details
     */
    async handleGetOfferDetails(socket, data) {
        try {
            const { offerId } = data;
            
            // Get offer details
            const offers = await mysqlDB.query(`
                SELECT o.*, u.username as dispatcher_name 
                FROM offers o 
                JOIN users u ON o.created_by = u.id 
                WHERE o.id = ?
            `, [offerId]);
            
            if (!offers || offers.length === 0) {
                socket.emit('error', { message: 'Offer not found' });
                return;
            }
            
            const offer = offers[0];
            
            // Get proposals for this offer
            const proposals = await mysqlDB.query(`
                SELECT op.*, t.DriverName, t.CellPhone 
                FROM offer_proposals op 
                JOIN Trucks t ON op.driver_id = t.ID 
                WHERE op.offer_id = ?
            `, [offerId]);
            
            // Check permissions
            const isDispatcher = socket.userType === 'dispatcher' && offer.created_by === socket.userId;
            const isInvolvedDriver = socket.userType === 'driver' && 
                proposals.some(p => p.driver_id === socket.userId);
            
            if (!isDispatcher && !isInvolvedDriver) {
                socket.emit('error', { message: 'Unauthorized to view this offer' });
                return;
            }
            
            socket.emit('offer_details', {
                offer,
                proposals,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Error getting offer details:', error);
            socket.emit('error', { message: 'Failed to get offer details' });
        }
    }

    /**
     * Handle getting user's offers list
     */
    async handleGetUserOffers(socket, data) {
        try {
            const { status = 'active', limit = 20, offset = 0 } = data;
            
            let offers = [];
            
            if (socket.userType === 'dispatcher') {
                // Get dispatcher's created offers
                offers = await mysqlDB.query(`
                    SELECT o.*, COUNT(op.id) as proposal_count
                    FROM offers o
                    LEFT JOIN offer_proposals op ON o.id = op.offer_id
                    WHERE o.created_by = ? AND o.status = ?
                    GROUP BY o.id
                    ORDER BY o.created_at DESC
                    LIMIT ? OFFSET ?
                `, [socket.userId, status, limit, offset]);
                
            } else if (socket.userType === 'driver') {
                // Get driver's received offers
                offers = await mysqlDB.query(`
                    SELECT o.*, op.status as proposal_status, op.driver_proposed_rate, u.username as dispatcher_name
                    FROM offers o
                    JOIN offer_proposals op ON o.id = op.offer_id
                    JOIN users u ON o.created_by = u.id
                    WHERE op.driver_id = ? AND o.status = ?
                    ORDER BY o.created_at DESC
                    LIMIT ? OFFSET ?
                `, [socket.userId, status, limit, offset]);
            }
            
            socket.emit('user_offers_list', {
                offers,
                status,
                hasMore: offers.length === limit,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Error getting user offers:', error);
            socket.emit('error', { message: 'Failed to get offers list' });
        }
    }
}

module.exports = OfferHandler;
