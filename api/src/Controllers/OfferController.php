<?php

namespace App\Controllers;

use App\Core\Logger;
use App\Core\Database;
use App\Core\ActivityLogger;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class OfferController
{
    /**
     * Create a new offer
     */
    public static function create()
    {
        $user = self::authenticateRequest();
        if (!$user) return;

        // Only dispatchers can create offers
        if ($user['role'] !== 'dispatcher') {
            self::sendResponse(['success' => false, 'message' => 'Unauthorized. Only dispatchers can create offers.'], 403);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true);

        // Validate required fields
        $required = ['truck_id', 'pickup_location', 'delivery_location', 'pickup_date', 'delivery_date', 'rate'];
        foreach ($required as $field) {
            if (!isset($data[$field]) || empty($data[$field])) {
                self::sendResponse(['success' => false, 'message' => "Field '$field' is required."], 400);
                return;
            }
        }

        try {
            $db = Database::getInstance();
            
            // Insert offer
            $sql = "INSERT INTO offers (created_by, truck_id, pickup_location, delivery_location, 
                    pickup_date, delivery_date, rate, description, status, created_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())";
            
            $params = [
                $user['id'],
                $data['truck_id'],
                $data['pickup_location'],
                $data['delivery_location'],
                $data['pickup_date'],
                $data['delivery_date'],
                $data['rate'],
                $data['description'] ?? ''
            ];

            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $offerId = $db->lastInsertId();

            // Log activity
            ActivityLogger::log('offer_created', [
                'offer_id' => $offerId,
                'truck_id' => $data['truck_id'],
                'created_by' => $user['id']
            ]);

            // Notify Socket.io server about new offer
            self::notifySocketServer('new_offer_created', [
                'offerId' => $offerId,
                'truckId' => $data['truck_id'],
                'createdBy' => $user['id'],
                'pickupLocation' => $data['pickup_location'],
                'deliveryLocation' => $data['delivery_location'],
                'rate' => $data['rate']
            ]);

            self::sendResponse([
                'success' => true,
                'message' => 'Offer created successfully.',
                'offer_id' => $offerId
            ]);

        } catch (\Exception $e) {
            Logger::error('Offer creation failed', ['error' => $e->getMessage(), 'user_id' => $user['id']]);
            self::sendResponse(['success' => false, 'message' => 'Failed to create offer.'], 500);
        }
    }

    /**
     * Get all offers for a user
     */
    public static function getOffers()
    {
        $user = self::authenticateRequest();
        if (!$user) return;

        try {
            $db = Database::getInstance();
            
            if ($user['role'] === 'dispatcher') {
                // Dispatchers see all their created offers
                $sql = "SELECT o.*, t.TruckNumber, t.DriverName, t.CellPhone,
                        COUNT(op.id) as proposal_count,
                        MAX(op.created_at) as last_proposal_date
                        FROM offers o
                        LEFT JOIN Trucks t ON o.truck_id = t.ID
                        LEFT JOIN offer_proposals op ON o.id = op.offer_id
                        WHERE o.created_by = ?
                        GROUP BY o.id
                        ORDER BY o.created_at DESC";
                $params = [$user['id']];
            } else {
                // Drivers see offers for their truck
                $sql = "SELECT o.*, u.full_name as dispatcher_name, u.mobile_number as dispatcher_phone,
                        op.id as my_proposal_id, op.status as my_proposal_status, op.counter_rate
                        FROM offers o
                        LEFT JOIN users u ON o.created_by = u.id
                        LEFT JOIN Trucks t ON o.truck_id = t.ID
                        LEFT JOIN offer_proposals op ON (o.id = op.offer_id AND op.driver_id = ?)
                        WHERE t.DriverName = ? AND o.status IN ('pending', 'active')
                        ORDER BY o.created_at DESC";
                $params = [$user['id'], $user['fullName']];
            }

            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $offers = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            self::sendResponse([
                'success' => true,
                'offers' => $offers
            ]);

        } catch (\Exception $e) {
            Logger::error('Get offers failed', ['error' => $e->getMessage(), 'user_id' => $user['id']]);
            self::sendResponse(['success' => false, 'message' => 'Failed to retrieve offers.'], 500);
        }
    }

    /**
     * Get specific offer details
     */
    public static function getOffer($offerId)
    {
        $user = self::authenticateRequest();
        if (!$user) return;

        try {
            $db = Database::getInstance();
            
            $sql = "SELECT o.*, t.TruckNumber, t.DriverName, t.CellPhone, t.latitude, t.longitude,
                    u.full_name as dispatcher_name, u.mobile_number as dispatcher_phone
                    FROM offers o
                    LEFT JOIN Trucks t ON o.truck_id = t.ID
                    LEFT JOIN users u ON o.created_by = u.id
                    WHERE o.id = ?";
            
            $stmt = $db->prepare($sql);
            $stmt->execute([$offerId]);
            $offer = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$offer) {
                self::sendResponse(['success' => false, 'message' => 'Offer not found.'], 404);
                return;
            }

            // Get proposals for this offer
            $sql = "SELECT op.*, u.full_name as driver_name, u.mobile_number as driver_phone
                    FROM offer_proposals op
                    LEFT JOIN users u ON op.driver_id = u.id
                    WHERE op.offer_id = ?
                    ORDER BY op.created_at DESC";
            
            $stmt = $db->prepare($sql);
            $stmt->execute([$offerId]);
            $proposals = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $offer['proposals'] = $proposals;

            self::sendResponse([
                'success' => true,
                'offer' => $offer
            ]);

        } catch (\Exception $e) {
            Logger::error('Get offer failed', ['error' => $e->getMessage(), 'offer_id' => $offerId]);
            self::sendResponse(['success' => false, 'message' => 'Failed to retrieve offer.'], 500);
        }
    }

    /**
     * Submit driver proposal
     */
    public static function submitProposal()
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
            
            // Check if offer exists and is active
            $sql = "SELECT * FROM offers WHERE id = ? AND status IN ('pending', 'active')";
            $stmt = $db->prepare($sql);
            $stmt->execute([$data['offer_id']]);
            $offer = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$offer) {
                self::sendResponse(['success' => false, 'message' => 'Offer not found or no longer active.'], 404);
                return;
            }

            // Check if driver already has a proposal for this offer
            $sql = "SELECT id FROM offer_proposals WHERE offer_id = ? AND driver_id = ?";
            $stmt = $db->prepare($sql);
            $stmt->execute([$data['offer_id'], $user['id']]);
            
            if ($stmt->fetch()) {
                self::sendResponse(['success' => false, 'message' => 'You have already submitted a proposal for this offer.'], 400);
                return;
            }

            // Insert proposal
            $sql = "INSERT INTO offer_proposals (offer_id, driver_id, counter_rate, message, status, created_at) 
                    VALUES (?, ?, ?, ?, 'pending', NOW())";
            
            $params = [
                $data['offer_id'],
                $user['id'],
                $data['counter_rate'] ?? $offer['rate'],
                $data['message'] ?? ''
            ];

            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $proposalId = $db->lastInsertId();

            // Log activity
            ActivityLogger::log('driver_proposal_submitted', [
                'proposal_id' => $proposalId,
                'offer_id' => $data['offer_id'],
                'driver_id' => $user['id']
            ]);

            // Notify Socket.io server
            self::notifySocketServer('driver_proposal', [
                'proposalId' => $proposalId,
                'offerId' => $data['offer_id'],
                'driverId' => $user['id'],
                'driverName' => $user['fullName'],
                'counterRate' => $data['counter_rate'] ?? $offer['rate'],
                'message' => $data['message'] ?? ''
            ]);

            self::sendResponse([
                'success' => true,
                'message' => 'Proposal submitted successfully.',
                'proposal_id' => $proposalId
            ]);

        } catch (\Exception $e) {
            Logger::error('Submit proposal failed', ['error' => $e->getMessage(), 'user_id' => $user['id']]);
            self::sendResponse(['success' => false, 'message' => 'Failed to submit proposal.'], 500);
        }
    }

    /**
     * Update offer status
     */
    public static function updateStatus()
    {
        $user = self::authenticateRequest();
        if (!$user) return;

        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['offer_id']) || !isset($data['status'])) {
            self::sendResponse(['success' => false, 'message' => 'Offer ID and status are required.'], 400);
            return;
        }

        $validStatuses = ['pending', 'active', 'accepted', 'completed', 'cancelled'];
        if (!in_array($data['status'], $validStatuses)) {
            self::sendResponse(['success' => false, 'message' => 'Invalid status.'], 400);
            return;
        }

        try {
            $db = Database::getInstance();
            
            // Check if user has permission to update this offer
            $sql = "SELECT * FROM offers WHERE id = ? AND created_by = ?";
            $stmt = $db->prepare($sql);
            $stmt->execute([$data['offer_id'], $user['id']]);
            $offer = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$offer) {
                self::sendResponse(['success' => false, 'message' => 'Offer not found or unauthorized.'], 404);
                return;
            }

            // Update offer status
            $sql = "UPDATE offers SET status = ?, updated_at = NOW() WHERE id = ?";
            $stmt = $db->prepare($sql);
            $stmt->execute([$data['status'], $data['offer_id']]);

            // If accepting a proposal, update the proposal status
            if ($data['status'] === 'accepted' && isset($data['proposal_id'])) {
                $sql = "UPDATE offer_proposals SET status = 'accepted' WHERE id = ? AND offer_id = ?";
                $stmt = $db->prepare($sql);
                $stmt->execute([$data['proposal_id'], $data['offer_id']]);

                // Reject other proposals
                $sql = "UPDATE offer_proposals SET status = 'rejected' WHERE offer_id = ? AND id != ?";
                $stmt = $db->prepare($sql);
                $stmt->execute([$data['offer_id'], $data['proposal_id']]);
            }

            // Log activity
            ActivityLogger::log('offer_status_updated', [
                'offer_id' => $data['offer_id'],
                'new_status' => $data['status'],
                'updated_by' => $user['id']
            ]);

            // Notify Socket.io server
            self::notifySocketServer('offer_status_change', [
                'offerId' => $data['offer_id'],
                'newStatus' => $data['status'],
                'updatedBy' => $user['id'],
                'proposalId' => $data['proposal_id'] ?? null
            ]);

            self::sendResponse([
                'success' => true,
                'message' => 'Offer status updated successfully.'
            ]);

        } catch (\Exception $e) {
            Logger::error('Update offer status failed', ['error' => $e->getMessage(), 'user_id' => $user['id']]);
            self::sendResponse(['success' => false, 'message' => 'Failed to update offer status.'], 500);
        }
    }

    /**
     * Authenticate JWT token and return user data
     */
    private static function authenticateRequest()
    {
        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';

        // Debug logging
        Logger::info('Authentication attempt', [
            'headers' => array_keys($headers),
            'auth_header' => $authHeader ? 'present' : 'missing'
        ]);

        if (!$authHeader || !preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            Logger::warning('Missing or invalid Authorization header', ['auth_header' => $authHeader]);
            self::sendResponse(['success' => false, 'message' => 'Authorization token required.'], 401);
            return false;
        }

        $token = $matches[1];

        try {
            $secretKey = $_ENV['JWT_SECRET'];
            if (empty($secretKey)) {
                Logger::error('JWT_SECRET not configured');
                throw new \Exception("JWT_SECRET is not configured.");
            }

            $decoded = JWT::decode($token, new Key($secretKey, 'HS256'));
            Logger::info('JWT Authentication successful', ['user_id' => $decoded->data->id ?? 'unknown']);
            return (array) $decoded->data;

        } catch (\Exception $e) {
            Logger::warning('JWT Authentication failed', [
                'error' => $e->getMessage(),
                'token_length' => strlen($token),
                'token_start' => substr($token, 0, 20) . '...'
            ]);
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
