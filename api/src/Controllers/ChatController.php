<?php

namespace App\Controllers;

use App\Core\Logger;
use App\Core\Database;
use App\Core\ActivityLogger;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class ChatController
{
    /**
     * Get chat messages for an offer
     */
    public static function getMessages($offerId)
    {
        $user = self::authenticateRequest();
        if (!$user) return;

        try {
            $db = Database::getInstance();
            
            // Verify user has access to this offer's chat
            $sql = "SELECT o.id FROM offers o 
                    LEFT JOIN Trucks t ON o.truck_id = t.ID
                    WHERE o.id = ? AND (o.created_by = ? OR t.DriverName = ?)";
            
            $stmt = $db->prepare($sql);
            $stmt->execute([$offerId, $user['id'], $user['fullName']]);
            
            if (!$stmt->fetch()) {
                self::sendResponse(['success' => false, 'message' => 'Unauthorized access to chat.'], 403);
                return;
            }

            // Get chat messages
            $sql = "SELECT cm.*, u.full_name as sender_name, u.role as sender_role
                    FROM chat_messages cm
                    LEFT JOIN users u ON cm.sender_id = u.id
                    WHERE cm.offer_id = ?
                    ORDER BY cm.created_at ASC";
            
            $stmt = $db->prepare($sql);
            $stmt->execute([$offerId]);
            $messages = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Mark messages as read for current user
            $sql = "UPDATE chat_messages SET is_read = 1 
                    WHERE offer_id = ? AND sender_id != ? AND is_read = 0";
            $stmt = $db->prepare($sql);
            $stmt->execute([$offerId, $user['id']]);

            self::sendResponse([
                'success' => true,
                'messages' => $messages
            ]);

        } catch (\Exception $e) {
            Logger::error('Get chat messages failed', [
                'error' => $e->getMessage(), 
                'offer_id' => $offerId,
                'user_id' => $user['id']
            ]);
            self::sendResponse(['success' => false, 'message' => 'Failed to retrieve messages.'], 500);
        }
    }

    /**
     * Send a chat message
     */
    public static function sendMessage()
    {
        $user = self::authenticateRequest();
        if (!$user) return;

        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['offer_id']) || !isset($data['message'])) {
            self::sendResponse(['success' => false, 'message' => 'Offer ID and message are required.'], 400);
            return;
        }

        if (strlen(trim($data['message'])) === 0) {
            self::sendResponse(['success' => false, 'message' => 'Message cannot be empty.'], 400);
            return;
        }

        if (strlen($data['message']) > 1000) {
            self::sendResponse(['success' => false, 'message' => 'Message too long (max 1000 characters).'], 400);
            return;
        }

        try {
            $db = Database::getInstance();
            
            // Verify user has access to this offer's chat
            $sql = "SELECT o.id, o.created_by, t.DriverName FROM offers o 
                    LEFT JOIN Trucks t ON o.truck_id = t.ID
                    WHERE o.id = ? AND (o.created_by = ? OR t.DriverName = ?)";
            
            $stmt = $db->prepare($sql);
            $stmt->execute([$data['offer_id'], $user['id'], $user['fullName']]);
            $offer = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            if (!$offer) {
                self::sendResponse(['success' => false, 'message' => 'Unauthorized access to chat.'], 403);
                return;
            }

            // Insert message
            $sql = "INSERT INTO chat_messages (offer_id, sender_id, message, is_read, created_at) 
                    VALUES (?, ?, ?, 0, NOW())";
            
            $stmt = $db->prepare($sql);
            $stmt->execute([$data['offer_id'], $user['id'], trim($data['message'])]);
            $messageId = $db->lastInsertId();

            // Get the inserted message with sender info
            $sql = "SELECT cm.*, u.full_name as sender_name, u.role as sender_role
                    FROM chat_messages cm
                    LEFT JOIN users u ON cm.sender_id = u.id
                    WHERE cm.id = ?";
            
            $stmt = $db->prepare($sql);
            $stmt->execute([$messageId]);
            $message = $stmt->fetch(\PDO::FETCH_ASSOC);

            // Log activity
            ActivityLogger::log('chat_message_sent', [
                'message_id' => $messageId,
                'offer_id' => $data['offer_id'],
                'sender_id' => $user['id']
            ]);

            // Notify Socket.io server
            self::notifySocketServer('new_message', [
                'messageId' => $messageId,
                'offerId' => $data['offer_id'],
                'senderId' => $user['id'],
                'senderName' => $user['fullName'],
                'senderRole' => $user['role'],
                'message' => trim($data['message']),
                'timestamp' => $message['created_at']
            ]);

            self::sendResponse([
                'success' => true,
                'message' => 'Message sent successfully.',
                'chat_message' => $message
            ]);

        } catch (\Exception $e) {
            Logger::error('Send chat message failed', [
                'error' => $e->getMessage(),
                'offer_id' => $data['offer_id'],
                'user_id' => $user['id']
            ]);
            self::sendResponse(['success' => false, 'message' => 'Failed to send message.'], 500);
        }
    }

    /**
     * Mark messages as read
     */
    public static function markAsRead()
    {
        $user = self::authenticateRequest();
        if (!$user) return;

        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['offer_id'])) {
            self::sendResponse(['success' => false, 'message' => 'Offer ID is required.'], 400);
            return;
        }

        try {
            $db = Database::getInstance();
            
            // Verify user has access to this offer's chat
            $sql = "SELECT o.id FROM offers o 
                    LEFT JOIN Trucks t ON o.truck_id = t.ID
                    WHERE o.id = ? AND (o.created_by = ? OR t.DriverName = ?)";
            
            $stmt = $db->prepare($sql);
            $stmt->execute([$data['offer_id'], $user['id'], $user['fullName']]);
            
            if (!$stmt->fetch()) {
                self::sendResponse(['success' => false, 'message' => 'Unauthorized access to chat.'], 403);
                return;
            }

            // Mark messages as read (except user's own messages)
            $sql = "UPDATE chat_messages SET is_read = 1 
                    WHERE offer_id = ? AND sender_id != ? AND is_read = 0";
            $stmt = $db->prepare($sql);
            $stmt->execute([$data['offer_id'], $user['id']]);
            
            $readCount = $stmt->rowCount();

            // Notify Socket.io server if messages were marked as read
            if ($readCount > 0) {
                self::notifySocketServer('messages_read', [
                    'offerId' => $data['offer_id'],
                    'readBy' => $user['id'],
                    'readByName' => $user['fullName'],
                    'readCount' => $readCount
                ]);
            }

            self::sendResponse([
                'success' => true,
                'message' => 'Messages marked as read.',
                'read_count' => $readCount
            ]);

        } catch (\Exception $e) {
            Logger::error('Mark messages as read failed', [
                'error' => $e->getMessage(),
                'offer_id' => $data['offer_id'],
                'user_id' => $user['id']
            ]);
            self::sendResponse(['success' => false, 'message' => 'Failed to mark messages as read.'], 500);
        }
    }

    /**
     * Get unread message count for user
     */
    public static function getUnreadCount()
    {
        $user = self::authenticateRequest();
        if (!$user) return;

        try {
            $db = Database::getInstance();
            
            if ($user['role'] === 'dispatcher') {
                // Count unread messages in offers created by this dispatcher
                $sql = "SELECT COUNT(*) as unread_count
                        FROM chat_messages cm
                        INNER JOIN offers o ON cm.offer_id = o.id
                        WHERE o.created_by = ? AND cm.sender_id != ? AND cm.is_read = 0";
                $params = [$user['id'], $user['id']];
            } else {
                // Count unread messages in offers for driver's truck
                $sql = "SELECT COUNT(*) as unread_count
                        FROM chat_messages cm
                        INNER JOIN offers o ON cm.offer_id = o.id
                        INNER JOIN Trucks t ON o.truck_id = t.ID
                        WHERE t.DriverName = ? AND cm.sender_id != ? AND cm.is_read = 0";
                $params = [$user['fullName'], $user['id']];
            }
            
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $result = $stmt->fetch(\PDO::FETCH_ASSOC);

            self::sendResponse([
                'success' => true,
                'unread_count' => (int) $result['unread_count']
            ]);

        } catch (\Exception $e) {
            Logger::error('Get unread count failed', [
                'error' => $e->getMessage(),
                'user_id' => $user['id']
            ]);
            self::sendResponse(['success' => false, 'message' => 'Failed to get unread count.'], 500);
        }
    }

    /**
     * Get chat participants for an offer
     */
    public static function getParticipants($offerId)
    {
        $user = self::authenticateRequest();
        if (!$user) return;

        try {
            $db = Database::getInstance();
            
            // Get offer details with dispatcher and driver info
            $sql = "SELECT o.id, o.created_by,
                    u.full_name as dispatcher_name, u.mobile_number as dispatcher_phone, u.role as dispatcher_role,
                    t.DriverName, t.CellPhone as driver_phone
                    FROM offers o
                    LEFT JOIN users u ON o.created_by = u.id
                    LEFT JOIN Trucks t ON o.truck_id = t.ID
                    WHERE o.id = ? AND (o.created_by = ? OR t.DriverName = ?)";
            
            $stmt = $db->prepare($sql);
            $stmt->execute([$offerId, $user['id'], $user['fullName']]);
            $offer = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            if (!$offer) {
                self::sendResponse(['success' => false, 'message' => 'Offer not found or unauthorized.'], 404);
                return;
            }

            $participants = [
                [
                    'id' => $offer['created_by'],
                    'name' => $offer['dispatcher_name'],
                    'phone' => $offer['dispatcher_phone'],
                    'role' => 'dispatcher',
                    'is_online' => false // Will be updated by Socket.io presence
                ]
            ];

            // Add driver if different from dispatcher
            if ($offer['DriverName'] && $offer['DriverName'] !== $offer['dispatcher_name']) {
                $participants[] = [
                    'name' => $offer['DriverName'],
                    'phone' => $offer['driver_phone'],
                    'role' => 'driver',
                    'is_online' => false // Will be updated by Socket.io presence
                ];
            }

            self::sendResponse([
                'success' => true,
                'participants' => $participants
            ]);

        } catch (\Exception $e) {
            Logger::error('Get chat participants failed', [
                'error' => $e->getMessage(),
                'offer_id' => $offerId,
                'user_id' => $user['id']
            ]);
            self::sendResponse(['success' => false, 'message' => 'Failed to get participants.'], 500);
        }
    }

    /**
     * Authenticate JWT token and return user data
     */
    private static function authenticateRequest()
    {
        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';

        if (!$authHeader || !preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            self::sendResponse(['success' => false, 'message' => 'Authorization token required.'], 401);
            return false;
        }

        $token = $matches[1];

        try {
            $secretKey = $_ENV['JWT_SECRET'];
            if (empty($secretKey)) {
                throw new \Exception("JWT_SECRET is not configured.");
            }

            $decoded = JWT::decode($token, new Key($secretKey, 'HS256'));
            return (array) $decoded->data;

        } catch (\Exception $e) {
            Logger::warning('JWT Authentication failed', ['error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Invalid or expired token.'], 401);
            return false;
        }
    }

    /**
     * Notify Socket.io server about events
     */
    private static function notifySocketServer($event, $data)
    {
        try {
            // Use curl to notify the Socket.io server
            $socketUrl = 'https://offers.connex.team/api/notify';
            $payload = json_encode([
                'event' => $event,
                'data' => $data
            ]);

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $socketUrl);
            curl_setopt($ch, CURLOPT_POST, 1);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'Content-Length: ' . strlen($payload)
            ]);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 5);
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode !== 200) {
                Logger::warning('Socket.io notification failed', [
                    'event' => $event,
                    'http_code' => $httpCode,
                    'response' => $response
                ]);
            }

        } catch (\Exception $e) {
            Logger::error('Socket.io notification error', [
                'event' => $event,
                'error' => $e->getMessage()
            ]);
        }
    }

    /**
     * Send JSON response
     */
    private static function sendResponse($data, $statusCode = 200)
    {
        http_response_code($statusCode);
        header('Content-Type: application/json');
        echo json_encode($data);
    }
}
