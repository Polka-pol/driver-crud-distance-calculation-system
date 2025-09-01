<?php

namespace App\Controllers;

use App\Core\Database;
use App\Core\Auth;
use App\Core\Logger;
use PDO;
use PDOException;
use Exception;

class OfferController
{
    private static function json($data, $code = 200) {
        http_response_code($code);
        header('Content-Type: application/json');
        echo json_encode($data);
    }

    /**
     * Add missing columns to existing offers table if needed
     */
    private static function ensureColumns(PDO $db): void
    {
        // Check and add missing columns to existing offers table
        $columnsToAdd = [
            'pickup_datetime' => 'VARCHAR(64) NULL',
            'delivery_datetime' => 'VARCHAR(64) NULL', 
            'pieces' => 'INT NULL',
            'invited_driver_ids' => 'TEXT NULL'
        ];
        
        foreach ($columnsToAdd as $column => $definition) {
            try {
                $stmt = $db->query("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'offers' AND column_name = '$column'");
                $exists = $stmt->fetchColumn();
                if (!$exists) {
                    $db->exec("ALTER TABLE offers ADD COLUMN $column $definition");
                }
            } catch (Exception $e) {
                // Column might already exist or other issue - continue
            }
        }
    }

    public static function index()
    {
        try {
            Auth::protect();
            $db = Database::getConnection();
            if (!$db) { throw new Exception('Database connection failed'); }
            self::ensureColumns($db);

            $stmt = $db->query("SELECT id, created_by, pickup_location, delivery_location, pickup_datetime, delivery_datetime, proposed_rate, pieces, weight_lbs, dimensions, distance_miles, status, notes, invited_driver_ids, created_at, updated_at FROM offers ORDER BY id DESC LIMIT 200");
            $offers = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
            // Decode invited_driver_ids JSON into array for convenience
            foreach ($offers as &$o) {
                if (isset($o['invited_driver_ids']) && is_string($o['invited_driver_ids']) && $o['invited_driver_ids'] !== '') {
                    $decoded = json_decode($o['invited_driver_ids'], true);
                    if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                        $o['invited_driver_ids'] = array_values(array_map('intval', $decoded));
                    } else {
                        $o['invited_driver_ids'] = [];
                    }
                } else {
                    $o['invited_driver_ids'] = [];
                }
            }
            self::json(['success' => true, 'offers' => $offers]);
        } catch (Exception $e) {
            self::json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    // POST /offers
    public static function create()
    {
        try {
            Auth::protect();
            $db = Database::getConnection();
            if (!$db) { throw new Exception('Database connection failed'); }
            self::ensureColumns($db);

            $payload = json_decode(file_get_contents('php://input'), true) ?: [];

            // Basic validation
            $pickup = trim($payload['pickupAddress'] ?? '');
            $delivery = trim($payload['deliveryAddress'] ?? '');
            if ($pickup === '' || $delivery === '') {
                return self::json(['success' => false, 'message' => 'pickupAddress and deliveryAddress are required'], 400);
            }

            // Get current user ID from Auth
            $currentUser = Auth::getCurrentUser();
            $createdBy = $currentUser->id ?? null;

            // Normalize inputs to match existing table structure
            $pickupDt = $payload['pickupDateTime'] ?? null;      // plain text per UI
            $deliveryDt = $payload['deliveryDateTime'] ?? null;  // plain text per UI
            $rate = $payload['rate'] ?? ($payload['ratePerMile'] ?? null); // UI uses "Rate"
            $pieces = isset($payload['pieces']) ? (int)$payload['pieces'] : null;
            $weight = isset($payload['weight']) ? (float)$payload['weight'] : null;
            $dims = $payload['dims'] ?? ($payload['DIMS'] ?? null);
            $notes = $payload['notes'] ?? null;
            $loadedMiles = isset($payload['loadedMiles']) && $payload['loadedMiles'] !== '' ? (float)$payload['loadedMiles'] : null;
            $invitedDriverIds = $payload['driverIds'] ?? ($payload['selectedDrivers'] ?? []);
            if (!is_array($invitedDriverIds)) { $invitedDriverIds = []; }
            $invitedDriverIdsJson = json_encode(array_values(array_unique(array_map('intval', $invitedDriverIds))));

            // Map to existing table columns
            $sql = "INSERT INTO offers (
                        created_by, pickup_location, delivery_location,
                        pickup_datetime, delivery_datetime, proposed_rate, pieces, weight_lbs, dimensions,
                        notes, distance_miles, invited_driver_ids, status
                    ) VALUES (
                        :created_by, :pickup_location, :delivery_location,
                        :pickup_datetime, :delivery_datetime, :proposed_rate, :pieces, :weight_lbs, :dimensions,
                        :notes, :distance_miles, :invited_driver_ids, 'active'
                    )";

            $stmt = $db->prepare($sql);
            $stmt->execute([
                ':created_by' => $createdBy,
                ':pickup_location' => $pickup,
                ':delivery_location' => $delivery,
                ':pickup_datetime' => $pickupDt,
                ':delivery_datetime' => $deliveryDt,
                ':proposed_rate' => $rate ? (float)$rate : null,
                ':pieces' => $pieces,
                ':weight_lbs' => $weight,
                ':dimensions' => $dims,
                ':notes' => $notes,
                ':distance_miles' => $loadedMiles,
                ':invited_driver_ids' => $invitedDriverIdsJson,
            ]);

            $offerId = (int)$db->lastInsertId();

            // Try to notify offers-server via webhook (best-effort)
            try {
                $offersServerUrl = $_ENV['OFFERS_SERVER_URL'] ?? null; // e.g. https://offers.connex.team
                $webhookSecret = $_ENV['OFFERS_WEBHOOK_SECRET'] ?? null;
                if ($offersServerUrl && $webhookSecret) {
                    $offerForBroadcast = [
                        'id' => $offerId,
                        'pickup_location' => $pickup,
                        'delivery_location' => $delivery,
                        'pickup_datetime' => $pickupDt,
                        'delivery_datetime' => $deliveryDt,
                        'proposed_rate' => $rate,
                        'pieces' => $pieces,
                        'weight_lbs' => $weight,
                        'dimensions' => $dims,
                        'distance_miles' => $loadedMiles,
                        'invited_driver_ids' => json_decode($invitedDriverIdsJson, true) ?: [],
                        'created_at' => gmdate('c'),
                    ];

                    $payload = json_encode(['offer' => $offerForBroadcast], JSON_UNESCAPED_UNICODE);
                    $ch = curl_init(rtrim($offersServerUrl, '/') . '/events/offer-created');
                    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch, CURLOPT_POST, true);
                    curl_setopt($ch, CURLOPT_HTTPHEADER, [
                        'Content-Type: application/json',
                        'X-Webhook-Secret: ' . $webhookSecret,
                    ]);
                    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
                    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
                    curl_setopt($ch, CURLOPT_TIMEOUT, 4);
                    curl_exec($ch);
                    curl_close($ch);
                }
            } catch (\Throwable $we) {
                // best-effort; do not fail the request
            }

            self::json([
                'success' => true,
                'message' => 'Offer created',
                'offer_id' => $offerId
            ], 201);
        } catch (Exception $e) {
            self::json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    // GET /offers/{id}
    public static function show(int $id)
    {
        try {
            Auth::protect();
            $db = Database::getConnection();
            if (!$db) { throw new Exception('Database connection failed'); }
            self::ensureColumns($db);

            $stmt = $db->prepare("SELECT * FROM offers WHERE id = :id");
            $stmt->execute([':id' => $id]);
            $offer = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$offer) { return self::json(['success' => false, 'message' => 'Offer not found'], 404); }
            if (isset($offer['invited_driver_ids']) && is_string($offer['invited_driver_ids']) && $offer['invited_driver_ids'] !== '') {
                $decoded = json_decode($offer['invited_driver_ids'], true);
                if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                    $offer['invited_driver_ids'] = array_values(array_map('intval', $decoded));
                } else {
                    $offer['invited_driver_ids'] = [];
                }
            } else {
                $offer['invited_driver_ids'] = [];
            }
            self::json(['success' => true, 'offer' => $offer]);
        } catch (Exception $e) {
            self::json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    // PUT /offers/{id}
    public static function update(int $id)
    {
        try {
            Auth::protect();
            $db = Database::getConnection();
            if (!$db) { throw new Exception('Database connection failed'); }
            self::ensureColumns($db);

            $payload = json_decode(file_get_contents('php://input'), true) ?: [];
            // Build dynamic update - map to existing table columns
            $fields = [
                'pickup_location' => 'pickupAddress',
                'delivery_location' => 'deliveryAddress',
                'pickup_datetime' => 'pickupDateTime',
                'delivery_datetime' => 'deliveryDateTime',
                'proposed_rate' => 'rate',
                'pieces' => 'pieces',
                'weight_lbs' => 'weight',
                'dimensions' => 'dims',
                'notes' => 'notes',
                'distance_miles' => 'loadedMiles',
                'status' => 'status',
            ];
            $setParts = [];
            $params = [':id' => $id];
            foreach ($fields as $col => $key) {
                if (array_key_exists($key, $payload)) {
                    $setParts[] = "$col = :$col";
                    $params[":$col"] = ($col === 'pieces' || $col === 'weight_lbs' || $col === 'distance_miles')
                        ? ($payload[$key] === '' ? null : (float)$payload[$key])
                        : $payload[$key];
                }
            }
            if (array_key_exists('driverIds', $payload) || array_key_exists('selectedDrivers', $payload)) {
                $ids = $payload['driverIds'] ?? $payload['selectedDrivers'];
                if (!is_array($ids)) { $ids = []; }
                $setParts[] = 'invited_driver_ids = :invited_driver_ids';
                $params[':invited_driver_ids'] = json_encode(array_values(array_unique(array_map('intval', $ids))));
            }
            if (empty($setParts)) {
                return self::json(['success' => false, 'message' => 'No updatable fields supplied'], 400);
            }

            $sql = 'UPDATE offers SET ' . implode(', ', $setParts) . ' WHERE id = :id';
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            self::json(['success' => true, 'message' => 'Offer updated']);
        } catch (Exception $e) {
            self::json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    // DELETE /offers/{id}
    public static function delete(int $id)
    {
        try {
            Auth::protect();
            $db = Database::getConnection();
            if (!$db) { throw new Exception('Database connection failed'); }
            self::ensureColumns($db);
            $stmt = $db->prepare('DELETE FROM offers WHERE id = :id');
            $stmt->execute([':id' => $id]);
            self::json(['success' => true, 'message' => 'Offer deleted']);
        } catch (Exception $e) {
            self::json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    // POST /offers/{id}/send-to-drivers
    public static function sendToDrivers(int $id)
    {
        try {
            Auth::protect();
            // For now, just acknowledge. Integration with offers-server can be added later via webhook/redis.
            self::json(['success' => true, 'message' => 'Offer queued for delivery to drivers', 'offer_id' => $id]);
        } catch (Exception $e) {
            self::json(['success' => false, 'message' => 'Authentication failed'], 401);
        }
    }

    // GET /offers/{id}/proposals
    public static function listProposals(int $id)
    {
        try {
            Auth::protect();
            self::json(['success' => true, 'proposals' => []]);
        } catch (Exception $e) {
            self::json(['success' => false, 'message' => 'Authentication failed'], 401);
        }
    }

    // PUT /proposals/{id}/respond
    public static function respondToProposal(int $proposalId)
    {
        try {
            Auth::protect();
            self::json(['success' => true, 'message' => 'Proposals table not implemented yet'], 501);
        } catch (Exception $e) {
            self::json(['success' => false, 'message' => 'Authentication failed'], 401);
        }
    }

    // POST /drivers/by-ids - Get driver details by IDs
    public static function getDriversByIds()
    {
        try {
            Auth::protect();
            $db = Database::getConnection();
            if (!$db) { throw new Exception('Database connection failed'); }

            $payload = json_decode(file_get_contents('php://input'), true) ?: [];
            $driverIds = $payload['driver_ids'] ?? [];
            
            if (!is_array($driverIds) || empty($driverIds)) {
                return self::json(['success' => false, 'message' => 'driver_ids array is required'], 400);
            }

            // Sanitize IDs to integers
            $cleanIds = array_values(array_unique(array_map('intval', $driverIds)));
            $placeholders = str_repeat('?,', count($cleanIds) - 1) . '?';
            
            $sql = "SELECT ID as id, DriverName, TruckNumber, CellPhone, CityStateZip, Dimensions 
                    FROM Trucks 
                    WHERE ID IN ($placeholders)";
            
            $stmt = $db->prepare($sql);
            $stmt->execute($cleanIds);
            $drivers = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

            // Transform to match frontend expectations
            $driversFormatted = array_map(function($driver) {
                return [
                    'id' => (int)$driver['id'],
                    'DriverName' => $driver['DriverName'] ?: 'N/A',
                    'TruckNumber' => $driver['TruckNumber'] ?: 'N/A',
                    'CellPhone' => $driver['CellPhone'] ?: 'N/A',
                    'city_state_zip' => $driver['CityStateZip'] ?: 'N/A',
                    'dimensions_payload' => $driver['Dimensions'] ?: 'N/A',
                    'offerStatus' => 'not_sent',
                    'isOnline' => false
                ];
            }, $drivers);

            self::json(['success' => true, 'drivers' => $driversFormatted]);
        } catch (Exception $e) {
            self::json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }
}