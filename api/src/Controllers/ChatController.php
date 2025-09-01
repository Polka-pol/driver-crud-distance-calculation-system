<?php

namespace App\Controllers;

use App\Core\Database;
use App\Core\Auth;
use App\Core\Logger;
use PDO;
use PDOException;
use Exception;

class ChatController
{
    private static function json($data, $code = 200) {
        http_response_code($code);
        header('Content-Type: application/json');
        echo json_encode($data);
    }

    // GET /offers/{id}/chat/{driver_id}
    public static function getMessages(int $offerId, int $driverId)
    {
        try {
            Auth::protect();
            $db = Database::getConnection();
            if (!$db) { throw new Exception('Database connection failed'); }

            $stmt = $db->prepare("
                SELECT id, sender_type, sender_id, message, message_type, is_read, created_at 
                FROM chat_messages 
                WHERE offer_id = ? AND driver_id = ? 
                ORDER BY created_at ASC
            ");
            $stmt->execute([$offerId, $driverId]);
            $messages = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

            // Format messages for frontend
            $formattedMessages = array_map(function($msg) {
                return [
                    'id' => (int)$msg['id'],
                    'sender_type' => $msg['sender_type'],
                    'sender_id' => (int)$msg['sender_id'],
                    'message' => $msg['message'],
                    'message_type' => $msg['message_type'],
                    'is_read' => (bool)$msg['is_read'],
                    'created_at' => $msg['created_at']
                ];
            }, $messages);

            self::json(['success' => true, 'messages' => $formattedMessages]);
        } catch (Exception $e) {
            self::json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    // POST /offers/{id}/chat/{driver_id}
    public static function sendMessage(int $offerId, int $driverId)
    {
        try {
            Auth::protect();
            $user = Auth::getCurrentUser();
            $data = json_decode(file_get_contents('php://input'), true) ?? [];
            
            if (!isset($data['message']) || trim($data['message']) === '') {
                return self::json(['success' => false, 'message' => 'Message is required'], 400);
            }

            $db = Database::getConnection();
            if (!$db) { throw new Exception('Database connection failed'); }

            // Insert message into database
            $stmt = $db->prepare("
                INSERT INTO chat_messages (offer_id, driver_id, sender_type, sender_id, message, message_type, is_read, created_at) 
                VALUES (?, ?, 'dispatcher', ?, ?, 'text', 0, NOW())
            ");
            $stmt->execute([
                $offerId, 
                $driverId, 
                $user->id, 
                trim($data['message'])
            ]);

            $messageId = $db->lastInsertId();

            // Get the inserted message for response
            $stmt = $db->prepare("SELECT id, sender_type, sender_id, message, message_type, is_read, created_at FROM chat_messages WHERE id = ?");
            $stmt->execute([$messageId]);
            $message = $stmt->fetch(PDO::FETCH_ASSOC);

            // Notify offers-server via webhook
            self::notifyOffersServer($offerId, $driverId, $message);

            self::json([
                'success' => true, 
                'message' => [
                    'id' => (int)$message['id'],
                    'sender_type' => $message['sender_type'],
                    'sender_id' => (int)$message['sender_id'],
                    'message' => $message['message'],
                    'message_type' => $message['message_type'],
                    'is_read' => (bool)$message['is_read'],
                    'created_at' => $message['created_at']
                ]
            ], 201);
        } catch (Exception $e) {
            self::json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    // PUT /chat/{message_id}/read
    public static function markAsRead(int $messageId)
    {
        try {
            Auth::protect();
            $db = Database::getConnection();
            if (!$db) { throw new Exception('Database connection failed'); }

            $stmt = $db->prepare("UPDATE chat_messages SET is_read = 1 WHERE id = ?");
            $stmt->execute([$messageId]);

            self::json(['success' => true]);
        } catch (Exception $e) {
            self::json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    // Webhook notification to offers-server
    private static function notifyOffersServer(int $offerId, int $driverId, array $message)
    {
        try {
            $webhookUrl = $_ENV['OFFERS_SERVER_URL'] ?? 'https://offers.connex.team';
            $webhookSecret = $_ENV['OFFERS_WEBHOOK_SECRET'] ?? '';

            if (empty($webhookSecret)) {
                Logger::warning('OFFERS_WEBHOOK_SECRET not configured');
                return;
            }

            $payload = [
                'offer_id' => $offerId,
                'driver_id' => $driverId,
                'message' => $message
            ];

            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL => $webhookUrl . '/events/message-sent',
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode($payload),
                CURLOPT_HTTPHEADER => [
                    'Content-Type: application/json',
                    'X-Webhook-Secret: ' . $webhookSecret
                ],
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 5,
                CURLOPT_SSL_VERIFYPEER => false
            ]);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode !== 200) {
                Logger::error("Webhook notification failed: HTTP $httpCode");
            }
        } catch (Exception $e) {
            Logger::error('Webhook notification error: ' . $e->getMessage());
        }
    }
}
