<?php

namespace App\Controllers;

use App\Core\Database;
use App\Core\Logger;
use App\Core\ActivityLogger;
use App\Core\DriverActivityLogger;
use App\Core\Auth;
use PDO;
use PDOException;

class LoadOfferController
{
    /**
     * Send a JSON response with an HTTP status code.
     */
    private static function sendResponse($data, $statusCode = 200)
    {
        http_response_code($statusCode);
        header('Content-Type: application/json');
        echo json_encode($data);
    }

    /**
     * Get driver data from JWT token (for driver-specific endpoints).
     */
    private static function getDriverFromToken()
    {
        if (!isset($_SERVER['HTTP_AUTHORIZATION'])) {
            self::sendResponse(['success' => false, 'message' => 'Authorization header missing.'], 401);
            return null;
        }

        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
        list($jwt) = sscanf($authHeader, 'Bearer %s');

        if (!$jwt) {
            self::sendResponse(['success' => false, 'message' => 'Invalid authorization header.'], 401);
            return null;
        }

        try {
            $secretKey = $_ENV['JWT_SECRET'];
            if (empty($secretKey)) {
                throw new \Exception("JWT secret key is not configured.");
            }

            $decoded = \Firebase\JWT\JWT::decode($jwt, new \Firebase\JWT\Key($secretKey, 'HS256'));
            
            if (!isset($decoded->data) || $decoded->data->role !== 'driver') {
                self::sendResponse(['success' => false, 'message' => 'Invalid token or insufficient permissions.'], 403);
                return null;
            }

            return (array)$decoded->data;

        } catch (\Exception $e) {
            Logger::warning('Driver JWT validation failed', ['error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Invalid or expired token.'], 401);
            return null;
        }
    }

    /**
     * Get all load offers for a specific driver.
     */
    public static function getDriverOffers()
    {
        // Get driver info from JWT token
        $driverData = self::getDriverFromToken();
        if (!$driverData) {
            return; // Error response already sent
        }

        try {
            $pdo = Database::getConnection();
            
            $sql = "SELECT 
                        lo.id as offer_id,
                        lo.driver_proposed_cost,
                        lo.offer_status,
                        lo.created_at,
                        lo.updated_at,
                        lo.accepted_at,
                        lo.rejected_at,
                        l.id as load_id,
                        l.origin_address,
                        l.destination_address,
                        l.weight,
                        l.dimensions,
                        l.proposed_cost_by_user,
                        l.created_at as load_created_at
                    FROM LoadOffers lo
                    JOIN Loads l ON lo.load_id = l.id
                    WHERE lo.driver_id = :driver_id
                    ORDER BY lo.created_at DESC";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['driver_id' => $driverData['id']]);
            $offers = $stmt->fetchAll(PDO::FETCH_ASSOC);

            self::sendResponse([
                'success' => true,
                'data' => $offers
            ]);

        } catch (PDOException $e) {
            Logger::error('Get driver offers failed', ['error' => $e->getMessage(), 'driver_id' => $driverData['id']]);
            self::sendResponse(['success' => false, 'message' => 'Failed to get load offers.'], 500);
        }
    }

    /**
     * Respond to a load offer (accept, reject, or counter-offer).
     */
    public static function respondToOffer()
    {
        // Get driver info from JWT token
        $driverData = self::getDriverFromToken();
        if (!$driverData) {
            return; // Error response already sent
        }

        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['offerId']) || !isset($data['action'])) {
            self::sendResponse(['success' => false, 'message' => 'Offer ID and action are required.'], 400);
            return;
        }

        $offerId = (int)$data['offerId'];
        $action = $data['action']; // 'accepted', 'rejected', 'counter_offer'
        $counterOfferAmount = $data['counterOfferAmount'] ?? null;

        // Validate action
        if (!in_array($action, ['accepted', 'rejected', 'counter_offer'])) {
            self::sendResponse(['success' => false, 'message' => 'Invalid action. Must be accepted, rejected, or counter_offer.'], 400);
            return;
        }

        // Validate counter offer amount
        if ($action === 'counter_offer' && (!$counterOfferAmount || !is_numeric($counterOfferAmount))) {
            self::sendResponse(['success' => false, 'message' => 'Counter offer amount is required for counter offers.'], 400);
            return;
        }

        try {
            $pdo = Database::getConnection();
            
            // Verify the offer belongs to this driver
            $verifyStmt = $pdo->prepare('SELECT * FROM LoadOffers WHERE id = :id AND driver_id = :driver_id');
            $verifyStmt->execute(['id' => $offerId, 'driver_id' => $driverData['id']]);
            $offer = $verifyStmt->fetch(PDO::FETCH_ASSOC);

            if (!$offer) {
                self::sendResponse(['success' => false, 'message' => 'Load offer not found or access denied.'], 404);
                return;
            }

            // Check if offer is still pending
            if ($offer['offer_status'] !== 'pending') {
                self::sendResponse(['success' => false, 'message' => 'This offer has already been responded to.'], 400);
                return;
            }

            // Update the offer
            $updateData = [
                'offer_status' => $action,
                'id' => $offerId
            ];

            $sql = "UPDATE LoadOffers SET offer_status = :offer_status";
            
            if ($action === 'accepted') {
                $sql .= ", accepted_at = CURRENT_TIMESTAMP";
            } elseif ($action === 'rejected') {
                $sql .= ", rejected_at = CURRENT_TIMESTAMP";
            } elseif ($action === 'counter_offer') {
                $sql .= ", driver_proposed_cost = :driver_proposed_cost";
                $updateData['driver_proposed_cost'] = $counterOfferAmount;
            }
            
            $sql .= " WHERE id = :id";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($updateData);

            // Log the action
            DriverActivityLogger::log('load_offer_response', [
                'driver_id' => $driverData['id'],
                'offer_id' => $offerId,
                'action' => $action,
                'counter_offer_amount' => $counterOfferAmount
            ], $driverData['id']);

            $message = match($action) {
                'accepted' => 'Load offer accepted successfully.',
                'rejected' => 'Load offer rejected successfully.',
                'counter_offer' => 'Counter offer submitted successfully.',
                default => 'Response submitted successfully.'
            };

            self::sendResponse([
                'success' => true,
                'message' => $message
            ]);

        } catch (PDOException $e) {
            Logger::error('Respond to offer failed', ['error' => $e->getMessage(), 'driver_id' => $driverData['id'], 'offer_id' => $offerId]);
            self::sendResponse(['success' => false, 'message' => 'Failed to respond to offer.'], 500);
        }
    }

    /**
     * Create a new load (dispatcher functionality).
     */
    public static function createLoad()
    {
        // Require dispatcher/admin authentication
        Auth::protect(['dispatcher', 'manager', 'admin']);

        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['origin_address']) || !isset($data['destination_address']) || !isset($data['proposed_cost_by_user'])) {
            self::sendResponse(['success' => false, 'message' => 'Origin address, destination address, and proposed cost are required.'], 400);
            return;
        }

        try {
            $pdo = Database::getConnection();
            
            $sql = "INSERT INTO Loads (origin_address, destination_address, weight, dimensions, proposed_cost_by_user) 
                    VALUES (:origin_address, :destination_address, :weight, :dimensions, :proposed_cost_by_user)";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                'origin_address' => $data['origin_address'],
                'destination_address' => $data['destination_address'],
                'weight' => $data['weight'] ?? null,
                'dimensions' => $data['dimensions'] ?? null,
                'proposed_cost_by_user' => $data['proposed_cost_by_user']
            ]);

            $loadId = $pdo->lastInsertId();

            // Log load creation
            ActivityLogger::log('load_created', [
                'load_id' => $loadId,
                'origin' => $data['origin_address'],
                'destination' => $data['destination_address'],
                'cost' => $data['proposed_cost_by_user']
            ]);

            self::sendResponse([
                'success' => true,
                'message' => 'Load created successfully.',
                'load_id' => $loadId
            ]);

        } catch (PDOException $e) {
            Logger::error('Create load failed', ['error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Failed to create load.'], 500);
        }
    }

    /**
     * Send load offer to specific drivers (dispatcher functionality).
     */
    public static function sendOfferToDrivers()
    {
        // Require dispatcher/admin authentication
        Auth::protect(['dispatcher', 'manager', 'admin']);

        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['load_id']) || !isset($data['driver_ids']) || !is_array($data['driver_ids'])) {
            self::sendResponse(['success' => false, 'message' => 'Load ID and driver IDs array are required.'], 400);
            return;
        }

        $loadId = (int)$data['load_id'];
        $driverIds = array_map('intval', $data['driver_ids']);

        try {
            $pdo = Database::getConnection();
            
            // Verify load exists
            $loadStmt = $pdo->prepare('SELECT * FROM Loads WHERE id = :id');
            $loadStmt->execute(['id' => $loadId]);
            $load = $loadStmt->fetch(PDO::FETCH_ASSOC);

            if (!$load) {
                self::sendResponse(['success' => false, 'message' => 'Load not found.'], 404);
                return;
            }

            // Insert offers for each driver
            $successCount = 0;
            $failureCount = 0;
            $duplicateCount = 0;

            foreach ($driverIds as $driverId) {
                try {
                    // Check if offer already exists
                    $existingStmt = $pdo->prepare('SELECT id FROM LoadOffers WHERE load_id = :load_id AND driver_id = :driver_id');
                    $existingStmt->execute(['load_id' => $loadId, 'driver_id' => $driverId]);
                    
                    if ($existingStmt->fetch()) {
                        $duplicateCount++;
                        continue; // Skip duplicate
                    }

                    // Create new offer
                    $offerStmt = $pdo->prepare('INSERT INTO LoadOffers (load_id, driver_id, offer_status) VALUES (:load_id, :driver_id, :offer_status)');
                    $offerStmt->execute([
                        'load_id' => $loadId,
                        'driver_id' => $driverId,
                        'offer_status' => 'pending'
                    ]);

                    $successCount++;

                } catch (PDOException $e) {
                    Logger::warning('Failed to create offer for driver', ['driver_id' => $driverId, 'error' => $e->getMessage()]);
                    $failureCount++;
                }
            }

            // Log the bulk offer creation
            ActivityLogger::log('load_offers_sent', [
                'load_id' => $loadId,
                'total_drivers' => count($driverIds),
                'successful_offers' => $successCount,
                'failed_offers' => $failureCount,
                'duplicate_offers' => $duplicateCount
            ]);

            self::sendResponse([
                'success' => true,
                'message' => "Load offers sent successfully. Created: $successCount, Duplicates: $duplicateCount, Failures: $failureCount",
                'stats' => [
                    'successful' => $successCount,
                    'duplicates' => $duplicateCount,
                    'failures' => $failureCount
                ]
            ]);

        } catch (PDOException $e) {
            Logger::error('Send offers to drivers failed', ['error' => $e->getMessage(), 'load_id' => $loadId]);
            self::sendResponse(['success' => false, 'message' => 'Failed to send offers to drivers.'], 500);
        }
    }

    /**
     * Get all loads with their offers (dispatcher functionality).
     */
    public static function getAllLoadsWithOffers()
    {
        // Require dispatcher/admin authentication
        Auth::protect(['dispatcher', 'manager', 'admin']);

        try {
            $pdo = Database::getConnection();
            
            $sql = "SELECT 
                        l.id as load_id,
                        l.origin_address,
                        l.destination_address,
                        l.weight,
                        l.dimensions,
                        l.proposed_cost_by_user,
                        l.created_at as load_created_at,
                        l.updated_at as load_updated_at,
                        COUNT(lo.id) as total_offers,
                        SUM(CASE WHEN lo.offer_status = 'pending' THEN 1 ELSE 0 END) as pending_offers,
                        SUM(CASE WHEN lo.offer_status = 'accepted' THEN 1 ELSE 0 END) as accepted_offers,
                        SUM(CASE WHEN lo.offer_status = 'rejected' THEN 1 ELSE 0 END) as rejected_offers,
                        SUM(CASE WHEN lo.offer_status = 'counter_offer' THEN 1 ELSE 0 END) as counter_offers
                    FROM Loads l
                    LEFT JOIN LoadOffers lo ON l.id = lo.load_id
                    GROUP BY l.id
                    ORDER BY l.created_at DESC";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute();
            $loads = $stmt->fetchAll(PDO::FETCH_ASSOC);

            self::sendResponse([
                'success' => true,
                'data' => $loads
            ]);

        } catch (PDOException $e) {
            Logger::error('Get all loads with offers failed', ['error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Failed to get loads.'], 500);
        }
    }

    /**
     * Get detailed offers for a specific load (dispatcher functionality).
     */
    public static function getLoadOffers($loadId)
    {
        // Require dispatcher/admin authentication
        Auth::protect(['dispatcher', 'manager', 'admin']);

        try {
            $pdo = Database::getConnection();
            
            $sql = "SELECT 
                        lo.id as offer_id,
                        lo.driver_proposed_cost,
                        lo.offer_status,
                        lo.created_at,
                        lo.updated_at,
                        lo.accepted_at,
                        lo.rejected_at,
                        t.ID as driver_id,
                        t.DriverName,
                        t.TruckNumber,
                        t.CellPhone,
                        t.CityStateZip,
                        t.Status as driver_status
                    FROM LoadOffers lo
                    JOIN Trucks t ON lo.driver_id = t.ID
                    WHERE lo.load_id = :load_id
                    ORDER BY lo.created_at DESC";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['load_id' => $loadId]);
            $offers = $stmt->fetchAll(PDO::FETCH_ASSOC);

            self::sendResponse([
                'success' => true,
                'data' => $offers
            ]);

        } catch (PDOException $e) {
            Logger::error('Get load offers failed', ['error' => $e->getMessage(), 'load_id' => $loadId]);
            self::sendResponse(['success' => false, 'message' => 'Failed to get load offers.'], 500);
        }
    }
} 