<?php

namespace App\Controllers;

use App\Core\Database;
use App\Core\Auth;
use App\Core\Logger;

class LoadHierarchyController
{
    private $db;
    private $logger;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $this->logger = new Logger();
    }

    /**
     * Level 1: List of all loads with summary information
     */
    public function getLoadsHierarchy()
    {
        Auth::protect(['dispatcher', 'manager', 'admin']);

        try {
            $stmt = $this->db->prepare("
                SELECT 
                    l.id,
                    l.origin_address,
                    l.destination_address,
                    l.weight,
                    l.dimensions,
                    l.proposed_cost_by_user,
                    l.delivery_distance_miles,
                    l.created_at,
                    -- Підрахунок водіїв
                    COUNT(DISTINCT lo.driver_id) as driver_count,
                    COUNT(DISTINCT CASE WHEN lo.offer_status IN ('driver_interested', 'price_negotiation') THEN lo.driver_id END) as interested_count,
                    -- Підрахунок непрочитаних повідомлень
                    COUNT(DISTINCT CASE WHEN m.is_read = 0 AND m.sender_type = 'driver' THEN m.id END) as unread_messages,
                    -- Статуси пропозицій
                    COUNT(DISTINCT CASE WHEN lo.offer_status = 'sent' THEN lo.id END) as sent_count,
                    COUNT(DISTINCT CASE WHEN lo.offer_status = 'viewed' THEN lo.id END) as viewed_count,
                    COUNT(DISTINCT CASE WHEN lo.offer_status = 'driver_interested' THEN lo.id END) as interested_offers,
                    COUNT(DISTINCT CASE WHEN lo.offer_status = 'price_negotiation' THEN lo.id END) as negotiation_count,
                    COUNT(DISTINCT CASE WHEN lo.offer_status = 'accepted' THEN lo.id END) as accepted_count,
                    -- Остання активність
                    MAX(COALESCE(m.created_at, lo.updated_at)) as last_activity
                FROM Loads l
                LEFT JOIN LoadOffers lo ON l.id = lo.load_id
                LEFT JOIN Messages m ON lo.id = m.load_offer_id
                WHERE l.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY l.id
                ORDER BY last_activity DESC, l.created_at DESC
            ");
            $stmt->execute();
            $loads = $stmt->fetchAll();

            $result = [];
            foreach ($loads as $load) {
                $result[] = [
                    'id' => (int)$load['id'],
                    'origin_address' => $load['origin_address'],
                    'destination_address' => $load['destination_address'],
                    'weight' => $load['weight'],
                    'dimensions' => $load['dimensions'],
                    'proposed_cost_by_user' => (float)$load['proposed_cost_by_user'],
                    'delivery_distance_miles' => $load['delivery_distance_miles'] ? (float)$load['delivery_distance_miles'] : null,
                    'driver_count' => (int)$load['driver_count'],
                    'interested_count' => (int)$load['interested_count'],
                    'unread_messages' => (int)$load['unread_messages'],
                    'created_at' => $load['created_at'],
                    'last_activity' => $load['last_activity'],
                    'status_summary' => [
                        'sent' => (int)$load['sent_count'],
                        'viewed' => (int)$load['viewed_count'],
                        'driver_interested' => (int)$load['interested_offers'],
                        'price_negotiation' => (int)$load['negotiation_count'],
                        'accepted' => (int)$load['accepted_count']
                    ]
                ];
            }

            echo json_encode([
                'loads' => $result,
                'total' => count($result),
                'timestamp' => date('Y-m-d H:i:s')
            ]);

        } catch (Exception $e) {
            $this->logger->error('Failed to get loads hierarchy', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            http_response_code(500);
            echo json_encode(['error' => 'Failed to get loads hierarchy']);
        }
    }

    /**
     * Level 2: List of drivers for specific load
     */
    public function getLoadDrivers($loadId)
    {
        Auth::protect(['dispatcher', 'manager', 'admin']);

        try {
            // First, get load information
            $stmt = $this->db->prepare("
                SELECT id, origin_address, destination_address, weight, dimensions, 
                       proposed_cost_by_user, delivery_distance_miles
                FROM Loads 
                WHERE id = ?
            ");
            $stmt->execute([$loadId]);
            $load = $stmt->fetch();

            if (!$load) {
                http_response_code(404);
                echo json_encode(['error' => 'Load not found']);
                return;
            }

            // Get drivers with offers
            $stmt = $this->db->prepare("
                SELECT 
                    lo.id as offer_id,
                    lo.driver_id,
                    lo.offer_status,
                    lo.driver_proposed_cost,
                    lo.driver_message,
                    lo.price_proposed_at,
                    lo.dispatcher_response,
                    lo.responded_at,
                    lo.driver_distance_miles,
                    lo.viewed_at,
                    lo.created_at,
                    lo.updated_at,
                    -- Інформація про водія
                    t.DriverName,
                    t.TruckNumber,
                    t.CellPhone,
                    t.CityStateZip as driver_location,
                    t.latitude as driver_lat,
                    t.longitude as driver_lon,
                    -- Підрахунок непрочитаних повідомлень
                    COUNT(DISTINCT CASE WHEN m.is_read = 0 AND m.sender_type = 'driver' THEN m.id END) as unread_messages,
                    -- Останнє повідомлення
                    MAX(m.created_at) as last_message_at,
                    -- Загальна кількість повідомлень
                    COUNT(DISTINCT m.id) as total_messages
                FROM LoadOffers lo
                JOIN Trucks t ON lo.driver_id = t.ID
                LEFT JOIN Messages m ON lo.id = m.load_offer_id
                WHERE lo.load_id = ? AND t.isActive = 1
                GROUP BY lo.id
                ORDER BY 
                    CASE lo.offer_status
                        WHEN 'driver_interested' THEN 1
                        WHEN 'price_negotiation' THEN 2
                        WHEN 'viewed' THEN 3
                        WHEN 'sent' THEN 4
                        ELSE 5
                    END,
                    lo.driver_distance_miles ASC,
                    last_message_at DESC
            ");
            $stmt->execute([$loadId]);
            $drivers = $stmt->fetchAll();

            $result = [];
            foreach ($drivers as $driver) {
                $result[] = [
                    'offer_id' => (int)$driver['offer_id'],
                    'driver_id' => (int)$driver['driver_id'],
                    'driver_name' => $driver['DriverName'],
                    'truck_number' => $driver['TruckNumber'],
                    'phone' => $driver['CellPhone'],
                    'current_location' => $driver['driver_location'],
                    'driver_coordinates' => [
                        'lat' => $driver['driver_lat'] ? (float)$driver['driver_lat'] : null,
                        'lon' => $driver['driver_lon'] ? (float)$driver['driver_lon'] : null
                    ],
                    'distance_to_pickup_miles' => $driver['driver_distance_miles'] ? (float)$driver['driver_distance_miles'] : null,
                    'offer_status' => $driver['offer_status'],
                    'driver_proposed_cost' => $driver['driver_proposed_cost'] ? (float)$driver['driver_proposed_cost'] : null,
                    'driver_message' => $driver['driver_message'],
                    'price_proposed_at' => $driver['price_proposed_at'],
                    'dispatcher_response' => $driver['dispatcher_response'],
                    'responded_at' => $driver['responded_at'],
                    'viewed_at' => $driver['viewed_at'],
                    'unread_messages' => (int)$driver['unread_messages'],
                    'total_messages' => (int)$driver['total_messages'],
                    'last_message_at' => $driver['last_message_at'],
                    'created_at' => $driver['created_at'],
                    'updated_at' => $driver['updated_at']
                ];
            }

            echo json_encode([
                'load' => [
                    'id' => (int)$load['id'],
                    'origin_address' => $load['origin_address'],
                    'destination_address' => $load['destination_address'],
                    'weight' => $load['weight'],
                    'dimensions' => $load['dimensions'],
                    'proposed_cost_by_user' => (float)$load['proposed_cost_by_user'],
                    'delivery_distance_miles' => $load['delivery_distance_miles'] ? (float)$load['delivery_distance_miles'] : null
                ],
                'drivers' => $result,
                'total_drivers' => count($result),
                'timestamp' => date('Y-m-d H:i:s')
            ]);

        } catch (Exception $e) {
            $this->logger->error('Failed to get load drivers', [
                'load_id' => $loadId,
                'error' => $e->getMessage()
            ]);
            
            http_response_code(500);
            echo json_encode(['error' => 'Failed to get load drivers']);
        }
    }

    /**
     * Level 3: Chat with specific driver
     */
    public function getLoadDriverChat($loadId, $driverId)
    {
        Auth::protect(['dispatcher', 'manager', 'admin']);

        try {
            // Check if offer exists
            $stmt = $this->db->prepare("
                SELECT lo.id as offer_id, lo.offer_status, lo.driver_proposed_cost,
                       l.origin_address, l.destination_address, l.proposed_cost_by_user,
                       t.DriverName, t.TruckNumber, t.CellPhone
                FROM LoadOffers lo
                JOIN Loads l ON lo.load_id = l.id
                JOIN Trucks t ON lo.driver_id = t.ID
                WHERE lo.load_id = ? AND lo.driver_id = ?
            ");
            $stmt->execute([$loadId, $driverId]);
            $offer = $stmt->fetch();

            if (!$offer) {
                http_response_code(404);
                echo json_encode(['error' => 'Load offer not found']);
                return;
            }

            // Get messages
            $stmt = $this->db->prepare("
                SELECT id, sender_type, sender_id, message_text, message_type, 
                       price_amount, created_at, is_read, read_at
                FROM Messages
                WHERE load_offer_id = ?
                ORDER BY created_at ASC
            ");
            $stmt->execute([$offer['offer_id']]);
            $messages = $stmt->fetchAll();

            // Mark driver messages as read
            $stmt = $this->db->prepare("
                UPDATE Messages 
                SET is_read = 1, read_at = CURRENT_TIMESTAMP
                WHERE load_offer_id = ? AND sender_type = 'driver' AND is_read = 0
            ");
            $stmt->execute([$offer['offer_id']]);

            $result = [];
            foreach ($messages as $message) {
                $result[] = [
                    'id' => (int)$message['id'],
                    'sender_type' => $message['sender_type'],
                    'sender_id' => (int)$message['sender_id'],
                    'message_text' => $message['message_text'],
                    'message_type' => $message['message_type'],
                    'price_amount' => $message['price_amount'] ? (float)$message['price_amount'] : null,
                    'created_at' => $message['created_at'],
                    'is_read' => (bool)$message['is_read'],
                    'read_at' => $message['read_at']
                ];
            }

            echo json_encode([
                'offer' => [
                    'id' => (int)$offer['offer_id'],
                    'status' => $offer['offer_status'],
                    'driver_proposed_cost' => $offer['driver_proposed_cost'] ? (float)$offer['driver_proposed_cost'] : null,
                    'dispatcher_proposed_cost' => (float)$offer['proposed_cost_by_user']
                ],
                'load' => [
                    'id' => (int)$loadId,
                    'origin_address' => $offer['origin_address'],
                    'destination_address' => $offer['destination_address']
                ],
                'driver' => [
                    'id' => (int)$driverId,
                    'name' => $offer['DriverName'],
                    'truck_number' => $offer['TruckNumber'],
                    'phone' => $offer['CellPhone']
                ],
                'messages' => $result,
                'total_messages' => count($result),
                'timestamp' => date('Y-m-d H:i:s')
            ]);

        } catch (Exception $e) {
            $this->logger->error('Failed to get load driver chat', [
                'load_id' => $loadId,
                'driver_id' => $driverId,
                'error' => $e->getMessage()
            ]);
            
            http_response_code(500);
            echo json_encode(['error' => 'Failed to get chat']);
        }
    }

    /**
     * Send message to chat
     */
    public function sendMessage()
    {
        Auth::protect(['dispatcher', 'manager', 'admin']);

        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $user = Auth::getCurrentUser();

            if (!isset($input['load_offer_id']) || !isset($input['message_text'])) {
                http_response_code(400);
                echo json_encode(['error' => 'load_offer_id and message_text are required']);
                return;
            }

            $messageType = $input['message_type'] ?? 'text';
            $priceAmount = isset($input['price_amount']) ? (float)$input['price_amount'] : null;

            // Check if offer exists
            $stmt = $this->db->prepare("
                SELECT id, offer_status FROM LoadOffers WHERE id = ?
            ");
            $stmt->execute([$input['load_offer_id']]);
            $offer = $stmt->fetch();

            if (!$offer) {
                http_response_code(404);
                echo json_encode(['error' => 'Load offer not found']);
                return;
            }

            // Add message
            $stmt = $this->db->prepare("
                INSERT INTO Messages (load_offer_id, sender_type, sender_id, message_text, message_type, price_amount, created_at)
                VALUES (?, 'dispatcher', ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ");
            $stmt->execute([
                $input['load_offer_id'],
                $user['id'],
                $input['message_text'],
                $messageType,
                $priceAmount
            ]);

            $messageId = $this->db->lastInsertId();

            // Update offer status if needed
            if ($messageType === 'price_counter' && $offer['offer_status'] === 'driver_interested') {
                $stmt = $this->db->prepare("
                    UPDATE LoadOffers 
                    SET offer_status = 'price_negotiation', 
                        dispatcher_response = ?, 
                        responded_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ");
                $stmt->execute([$input['message_text'], $input['load_offer_id']]);
            }

            echo json_encode([
                'message_id' => (int)$messageId,
                'status' => 'sent',
                'timestamp' => date('Y-m-d H:i:s')
            ]);

        } catch (Exception $e) {
            $this->logger->error('Failed to send message', [
                'error' => $e->getMessage(),
                'input' => $input ?? null
            ]);
            
            http_response_code(500);
            echo json_encode(['error' => 'Failed to send message']);
        }
    }

    /**
     * Accept/reject driver offer
     */
    public function respondToOffer()
    {
        Auth::protect(['dispatcher', 'manager', 'admin']);

        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $user = Auth::getCurrentUser();

            if (!isset($input['offer_id']) || !isset($input['action'])) {
                http_response_code(400);
                echo json_encode(['error' => 'offer_id and action are required']);
                return;
            }

            $action = $input['action']; // 'accept' or 'reject'
            $response = $input['response'] ?? '';

            if (!in_array($action, ['accept', 'reject'])) {
                http_response_code(400);
                echo json_encode(['error' => 'action must be accept or reject']);
                return;
            }

            // Update offer status
            $newStatus = $action === 'accept' ? 'accepted' : 'rejected';
            $timestamp = $action === 'accept' ? 'accepted_at' : 'rejected_at';

            $stmt = $this->db->prepare("
                UPDATE LoadOffers 
                SET offer_status = ?, 
                    dispatcher_response = ?, 
                    responded_at = CURRENT_TIMESTAMP,
                    {$timestamp} = CURRENT_TIMESTAMP
                WHERE id = ?
            ");
            $stmt->execute([$newStatus, $response, $input['offer_id']]);

            // Add system message
            $systemMessage = $action === 'accept' ? 
                "Your offer has been accepted! {$response}" : 
                "Your offer has been rejected. {$response}";

            $stmt = $this->db->prepare("
                INSERT INTO Messages (load_offer_id, sender_type, sender_id, message_text, message_type, created_at)
                VALUES (?, 'system', ?, ?, 'system', CURRENT_TIMESTAMP)
            ");
            $stmt->execute([$input['offer_id'], $user['id'], $systemMessage]);

            echo json_encode([
                'status' => $newStatus,
                'message' => $action === 'accept' ? 'Offer accepted' : 'Offer rejected',
                'timestamp' => date('Y-m-d H:i:s')
            ]);

        } catch (Exception $e) {
            $this->logger->error('Failed to respond to offer', [
                'error' => $e->getMessage(),
                'input' => $input ?? null
            ]);
            
            http_response_code(500);
            echo json_encode(['error' => 'Failed to respond to offer']);
        }
    }
} 