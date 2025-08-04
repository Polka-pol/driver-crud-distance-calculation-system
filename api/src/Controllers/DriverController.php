<?php

namespace App\Controllers;

use App\Core\Database;
use App\Core\Logger;
use App\Core\ActivityLogger;
use App\Core\DriverActivityLogger;
use Firebase\JWT\JWT;
use PDO;
use PDOException;
use DateTime;
use Exception;

class DriverController
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
     * Driver login using CellPhone and password.
     * If password_hash is empty, return requiresPasswordSetup flag.
     */
    public static function login()
    {
        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['cellPhone'])) {
            self::sendResponse(['success' => false, 'message' => 'Cell phone number is required.'], 400);
            return;
        }

        $cellPhone = $data['cellPhone'];
        $password = $data['password'] ?? null;

        try {
            $pdo = Database::getConnection();
            
            // Normalize phone number for search (remove all non-digits)
            $normalizedPhone = preg_replace('/[^\d]/', '', $cellPhone);
            
            // Find driver by cell phone using flexible search
            $stmt = $pdo->prepare('
                SELECT * FROM Trucks 
                WHERE REPLACE(REPLACE(REPLACE(REPLACE(CellPhone, "(", ""), ")", ""), "-", ""), " ", "") = :normalizedPhone
                   OR CellPhone = :cellPhone
            ');
            $stmt->execute([
                'normalizedPhone' => $normalizedPhone,
                'cellPhone' => $cellPhone
            ]);
            $driver = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$driver) {
                self::handleFailedLogin($cellPhone, 'Driver not found');
                return;
            }

            // Case 1: First-time login, password needs to be set.
            if (empty($driver['password_hash'])) {
                self::sendResponse([
                    'success' => false,
                    'message' => 'Password setup required for first-time login.',
                    'requiresPasswordSetup' => true
                ], 200);
                return;
            }

            // Case 2: Driver has a password, but none was provided in this request.
            if ($password === null) {
                self::sendResponse([
                    'success' => false,
                    'message' => 'Password is required to continue.'
                ], 200);
                return;
            }

            // Case 3: Password was provided, so verify it.
            if (!password_verify($password, $driver['password_hash'])) {
                self::handleFailedLogin($cellPhone, 'Invalid password');
                return;
            }

            // Generate JWT token
            $secretKey = $_ENV['JWT_SECRET'];
            if (empty($secretKey)) {
                throw new \Exception("JWT_SECRET is not configured.");
            }

            $issuedAt = time();
            $expire = $issuedAt + (60 * 60 * 24 * 7); // Expires in 7 days
            
            $payload = [
                'iat' => $issuedAt,
                'exp' => $expire,
                'data' => [
                    'id' => $driver['ID'],
                    'cellPhone' => $driver['CellPhone'],
                    'driverName' => $driver['DriverName'],
                    'truckNumber' => $driver['TruckNumber'],
                    'role' => 'driver'
                ]
            ];

            $jwt = JWT::encode($payload, $secretKey, 'HS256');

            // Log successful login
            DriverActivityLogger::log('driver_login_success', [
                'driver_id' => $driver['ID'],
                'cell_phone' => $cellPhone,
                'truck_number' => $driver['TruckNumber']
            ], $driver['ID']);

            // Prepare driver data for response (remove sensitive fields)
            $driverData = $driver;
            unset($driverData['password_hash']);

            self::sendResponse([
                'success' => true,
                'message' => 'Login successful.',
                'token' => $jwt,
                'driver' => $driverData
            ]);

        } catch (\Exception $e) {
            Logger::error('Driver login failed', ['error' => $e->getMessage(), 'cell_phone' => $cellPhone]);
            self::sendResponse(['success' => false, 'message' => 'Login failed. Please try again.'], 500);
        }
    }

    /**
     * Set password for driver (first-time setup).
     */
    public static function setPassword()
    {
        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['cellPhone']) || !isset($data['password'])) {
            self::sendResponse(['success' => false, 'message' => 'Cell phone and password are required.'], 400);
            return;
        }

        $cellPhone = $data['cellPhone'];
        $password = $data['password'];

        // Validate password strength
        if (strlen($password) < 6) {
            self::sendResponse(['success' => false, 'message' => 'Password must be at least 6 characters long.'], 400);
            return;
        }

        try {
            $pdo = Database::getConnection();
            
            // Normalize phone number for search (remove all non-digits)
            $normalizedPhone = preg_replace('/[^\d]/', '', $cellPhone);
            
            // Find driver by cell phone using flexible search
            $stmt = $pdo->prepare('
                SELECT ID, CellPhone, DriverName, password_hash FROM Trucks 
                WHERE REPLACE(REPLACE(REPLACE(REPLACE(CellPhone, "(", ""), ")", ""), "-", ""), " ", "") = :normalizedPhone
                   OR CellPhone = :cellPhone
            ');
            $stmt->execute([
                'normalizedPhone' => $normalizedPhone,
                'cellPhone' => $cellPhone
            ]);
            $driver = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$driver) {
                self::sendResponse(['success' => false, 'message' => 'Driver not found.'], 404);
                return;
            }

            // Check if password is already set
            if (!empty($driver['password_hash']) && $driver['password_hash'] !== '') {
                self::sendResponse(['success' => false, 'message' => 'Password is already set. Use login instead.'], 400);
                return;
            }

            // Hash the password
            $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

            // Update password in database
            $updateStmt = $pdo->prepare('UPDATE Trucks SET password_hash = :password_hash WHERE ID = :id');
            $updateStmt->execute([
                'password_hash' => $hashedPassword,
                'id' => $driver['ID']
            ]);

            // Log password setup
            DriverActivityLogger::log('driver_password_set', [
                'driver_id' => $driver['ID'],
                'cell_phone' => $cellPhone
            ], $driver['ID']);

            self::sendResponse([
                'success' => true,
                'message' => 'Password set successfully. You can now log in.'
            ]);

        } catch (PDOException $e) {
            Logger::error('Driver password setup failed', ['error' => $e->getMessage(), 'cell_phone' => $cellPhone]);
            self::sendResponse(['success' => false, 'message' => 'Failed to set password. Please try again.'], 500);
        }
    }

    /**
     * Update driver location (CityStateZip, latitude, longitude).
     */
    public static function updateLocation()
    {
        // Get driver info from JWT token
        $driverData = self::getDriverFromToken();
        if (!$driverData) {
            return; // Error response already sent
        }

        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['cityStateZip'])) {
            self::sendResponse(['success' => false, 'message' => 'City, State, ZIP is required.'], 400);
            return;
        }

        try {
            $pdo = Database::getConnection();
            
            $updateData = [
                'CityStateZip' => $data['cityStateZip'],
                'ID' => $driverData['id']
            ];

            // Add coordinates if provided
            if (isset($data['latitude']) && isset($data['longitude'])) {
                $updateData['latitude'] = $data['latitude'];
                $updateData['longitude'] = $data['longitude'];
            }

            // Handle timestamp update from phone
            if (isset($data['updated_at'])) {
                // Convert from ISO string to MySQL datetime format
                $phoneTimestamp = new DateTime($data['updated_at']);
                $updateData['updated_at'] = $phoneTimestamp->format('Y-m-d H:i:s');
            }

            $sql = "UPDATE Trucks SET CityStateZip = :CityStateZip";
            if (isset($updateData['latitude'])) {
                $sql .= ", latitude = :latitude, longitude = :longitude";
            }
            if (isset($updateData['updated_at'])) {
                $sql .= ", updated_at = :updated_at";
            } else {
                $sql .= ", updated_at = NOW()";
            }
            $sql .= " WHERE ID = :ID";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($updateData);

            // Determine if location actually changed
            $locationChanged = isset($data['location_changed']) ? $data['location_changed'] : true;

            // Log location update
            DriverActivityLogger::log($locationChanged ? 'driver_location_updated' : 'driver_location_confirmed', [
                'driver_id' => $driverData['id'],
                'location' => $data['cityStateZip'],
                'coordinates' => isset($data['latitude']) ? ['lat' => $data['latitude'], 'lon' => $data['longitude']] : null,
                'location_changed' => $locationChanged,
                'timestamp_source' => isset($data['updated_at']) ? 'phone' : 'server'
            ], $driverData['id']);

            self::sendResponse([
                'success' => true,
                'message' => $locationChanged ? 'Location updated successfully.' : 'Location confirmed as current.'
            ]);

        } catch (PDOException $e) {
            Logger::error('Driver location update failed', ['error' => $e->getMessage(), 'driver_id' => $driverData['id']]);
            self::sendResponse(['success' => false, 'message' => 'Failed to update location.'], 500);
        }
    }

    /**
     * Update FCM token for push notifications.
     */
    public static function updateFCMToken()
    {
        // Get driver info from JWT token
        $driverData = self::getDriverFromToken();
        if (!$driverData) {
            return; // Error response already sent
        }

        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['fcmToken'])) {
            self::sendResponse(['success' => false, 'message' => 'FCM token is required.'], 400);
            return;
        }

        try {
            $pdo = Database::getConnection();
            
            $stmt = $pdo->prepare('UPDATE Trucks SET fcm_token = :fcm_token WHERE ID = :id');
            $stmt->execute([
                'fcm_token' => $data['fcmToken'],
                'id' => $driverData['id']
            ]);

            self::sendResponse([
                'success' => true,
                'message' => 'FCM token updated successfully.'
            ]);

        } catch (PDOException $e) {
            Logger::error('FCM token update failed', ['error' => $e->getMessage(), 'driver_id' => $driverData['id']]);
            self::sendResponse(['success' => false, 'message' => 'Failed to update FCM token.'], 500);
        }
    }

    /**
     * Update driver status.
     */
    public static function updateStatus()
    {
        // Get driver info from JWT token
        $driverData = self::getDriverFromToken();
        if (!$driverData) {
            return; // Error response already sent
        }

        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['status'])) {
            self::sendResponse(['success' => false, 'message' => 'Status is required.'], 400);
            return;
        }

        $status = trim($data['status']);

        // Validate status
        $validStatuses = ['Available', 'Unavailable', 'Local', 'Out of Service', 'Updated'];
        if (!in_array($status, $validStatuses)) {
            self::sendResponse(['success' => false, 'message' => 'Invalid status value.'], 400);
            return;
        }

        try {
            $pdo = Database::getConnection();
            
            // Update status in database
            $stmt = $pdo->prepare('UPDATE Trucks SET Status = :status, updated_at = NOW(), updated_by = :updated_by WHERE ID = :id');
            $stmt->execute([
                'status' => $status,
                'updated_by' => $driverData['driverName'] ?? 'Driver App',
                'id' => $driverData['id']
            ]);

            // Log status update
            DriverActivityLogger::log('driver_status_update', [
                'driver_id' => $driverData['id'],
                'old_status' => null, // We could fetch the old status if needed
                'new_status' => $status,
                'cell_phone' => $driverData['cellPhone']
            ], $driverData['id']);

            self::sendResponse([
                'success' => true,
                'message' => 'Status updated successfully.',
                'status' => $status
            ]);

        } catch (PDOException $e) {
            Logger::error('Driver status update failed', ['error' => $e->getMessage(), 'driver_id' => $driverData['id']]);
            self::sendResponse(['success' => false, 'message' => 'Failed to update status. Please try again.'], 500);
        }
    }

    /**
     * Get driver profile information.
     */
    public static function getProfile()
    {
        // Get driver info from JWT token
        $driverData = self::getDriverFromToken();
        if (!$driverData) {
            return; // Error response already sent
        }

        try {
            $pdo = Database::getConnection();
            
            $stmt = $pdo->prepare('SELECT * FROM Trucks WHERE ID = :id');
            $stmt->execute(['id' => $driverData['id']]);
            $driver = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$driver) {
                self::sendResponse(['success' => false, 'message' => 'Driver not found.'], 404);
                return;
            }

            // Remove sensitive data
            unset($driver['password_hash']);

            self::sendResponse([
                'success' => true,
                'data' => $driver
            ]);

        } catch (PDOException $e) {
            Logger::error('Get driver profile failed', ['error' => $e->getMessage(), 'driver_id' => $driverData['id']]);
            self::sendResponse(['success' => false, 'message' => 'Failed to get profile.'], 500);
        }
    }

    /**
     * Get driver activity logs.
     */
    public static function getActivityLogs()
    {
        // Get driver info from JWT token
        $driverData = self::getDriverFromToken();
        if (!$driverData) {
            return; // Error response already sent
        }

        $limit = min((int)($_GET['limit'] ?? 50), 100); // Max 100 logs per request
        $offset = max((int)($_GET['offset'] ?? 0), 0);

        try {
            $logs = DriverActivityLogger::getDriverLogs($driverData['id'], $limit, $offset);
            $summary = DriverActivityLogger::getDriverActivitySummary($driverData['id'], 30);

            self::sendResponse([
                'success' => true,
                'data' => [
                    'logs' => $logs,
                    'summary' => $summary,
                    'pagination' => [
                        'limit' => $limit,
                        'offset' => $offset,
                        'has_more' => count($logs) === $limit
                    ]
                ]
            ]);

        } catch (Exception $e) {
            Logger::error('Get driver activity logs failed', ['error' => $e->getMessage(), 'driver_id' => $driverData['id']]);
            self::sendResponse(['success' => false, 'message' => 'Failed to get activity logs.'], 500);
        }
    }

    /**
     * Helper method to get driver data from JWT token.
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

            $decoded = JWT::decode($jwt, new \Firebase\JWT\Key($secretKey, 'HS256'));
            
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
     * Handle failed login attempts.
     */
    private static function handleFailedLogin($cellPhone, $reason)
    {
        Logger::warning('Driver login failed', ['cell_phone' => $cellPhone, 'reason' => $reason]);
        
        // Try to find driver ID for logging, but don't fail if not found
        try {
            $pdo = Database::getConnection();
            $normalizedPhone = preg_replace('/[^\d]/', '', $cellPhone);
            $stmt = $pdo->prepare('
                SELECT ID FROM Trucks 
                WHERE REPLACE(REPLACE(REPLACE(REPLACE(CellPhone, "(", ""), ")", ""), "-", ""), " ", "") = :normalizedPhone
                   OR CellPhone = :cellPhone
            ');
            $stmt->execute([
                'normalizedPhone' => $normalizedPhone,
                'cellPhone' => $cellPhone
            ]);
            $driver = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($driver) {
                DriverActivityLogger::log('driver_login_failure', [
                    'cell_phone' => $cellPhone,
                    'reason' => $reason,
                    'ip_address' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
                ], $driver['ID']);
            } else {
                // Log to regular activity logger if driver not found
                Logger::info('Driver login failure - driver not found', [
                    'cell_phone' => $cellPhone,
                    'reason' => $reason,
                    'ip_address' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
                ]);
            }
        } catch (PDOException $e) {
            Logger::error('Failed to log driver login failure', ['error' => $e->getMessage()]);
        }
        
        self::sendResponse(['success' => false, 'message' => 'Invalid credentials.'], 401);
    }

    /**
     * Get the list of available offers for the driver
     */
    public static function getOffers()
    {
        $driver = self::getDriverFromToken();
        if (!$driver) {
            return; // Error response already sent
        }

        try {
            $pdo = Database::getConnection();
            
            $stmt = $pdo->prepare("
                SELECT 
                    lo.id,
                    lo.load_id,
                    lo.offer_status,
                    lo.driver_distance_miles,
                    lo.created_at,
                    lo.viewed_at,
                    l.origin_address,
                    l.destination_address,
                    l.weight,
                    l.dimensions,
                    l.proposed_cost_by_user,
                    l.delivery_distance_miles,
                    -- Підрахунок непрочитаних повідомлень
                    COUNT(DISTINCT CASE WHEN m.is_read = 0 AND m.sender_type != 'driver' THEN m.id END) as unread_messages
                FROM LoadOffers lo
                JOIN Loads l ON lo.load_id = l.id
                LEFT JOIN Messages m ON lo.id = m.load_offer_id
                WHERE lo.driver_id = ? 
                AND lo.offer_status NOT IN ('rejected', 'driver_declined', 'expired', 'completed')
                GROUP BY lo.id
                ORDER BY lo.created_at DESC
            ");
            $stmt->execute([$driver['id']]);
            $offers = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $result = [];
            foreach ($offers as $offer) {
                $totalMiles = 0;
                if ($offer['driver_distance_miles'] && $offer['delivery_distance_miles']) {
                    $totalMiles = $offer['driver_distance_miles'] + $offer['delivery_distance_miles'];
                }

                $result[] = [
                    'id' => (int)$offer['id'],
                    'load_id' => (int)$offer['load_id'],
                    'origin_address' => $offer['origin_address'],
                    'destination_address' => $offer['destination_address'],
                    'distance_to_pickup_miles' => $offer['driver_distance_miles'] ? (float)$offer['driver_distance_miles'] : null,
                    'delivery_distance_miles' => $offer['delivery_distance_miles'] ? (float)$offer['delivery_distance_miles'] : null,
                    'total_miles' => $totalMiles > 0 ? (float)$totalMiles : null,
                    'weight' => $offer['weight'],
                    'dimensions' => $offer['dimensions'],
                    'proposed_cost_by_user' => (float)$offer['proposed_cost_by_user'],
                    'offer_status' => $offer['offer_status'],
                    'created_at' => $offer['created_at'],
                    'viewed_at' => $offer['viewed_at'],
                    'unread_messages' => (int)$offer['unread_messages']
                ];
            }

            self::sendResponse([
                'success' => true,
                'offers' => $result,
                'total' => count($result)
            ]);

        } catch (Exception $e) {
            Logger::error('Failed to get driver offers', [
                'driver_id' => $driver['id'],
                'error' => $e->getMessage()
            ]);
            self::sendResponse(['success' => false, 'message' => 'Failed to get offers'], 500);
        }
    }

    /**
     * View offer details (automatically updates status to 'viewed')
     */
    public static function getOfferDetails($offerId)
    {
        $driver = self::getDriverFromToken();
        if (!$driver) {
            return; // Error response already sent
        }

        try {
            $pdo = Database::getConnection();
            
            // Get offer details
            $stmt = $pdo->prepare("
                SELECT 
                    lo.*,
                    l.origin_address,
                    l.destination_address,
                    l.weight,
                    l.dimensions,
                    l.proposed_cost_by_user,
                    l.delivery_distance_miles
                FROM LoadOffers lo
                JOIN Loads l ON lo.load_id = l.id
                WHERE lo.id = ? AND lo.driver_id = ?
            ");
            $stmt->execute([$offerId, $driver['id']]);
            $offer = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$offer) {
                self::sendResponse(['success' => false, 'message' => 'Offer not found'], 404);
                return;
            }

            // Update status to 'viewed' if not yet viewed
            if ($offer['offer_status'] === 'sent' && !$offer['viewed_at']) {
                $updateStmt = $pdo->prepare("
                    UPDATE LoadOffers 
                    SET offer_status = 'viewed', viewed_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ");
                $updateStmt->execute([$offerId]);
                
                DriverActivityLogger::log('offer_viewed', [
                    'offer_id' => $offerId,
                    'load_id' => $offer['load_id']
                ], $driver['id']);
            }

            // Calculate total distance
            $totalMiles = 0;
            if ($offer['driver_distance_miles'] && $offer['delivery_distance_miles']) {
                $totalMiles = $offer['driver_distance_miles'] + $offer['delivery_distance_miles'];
            }

            self::sendResponse([
                'success' => true,
                'offer' => [
                    'id' => (int)$offer['id'],
                    'load_id' => (int)$offer['load_id'],
                    'origin_address' => $offer['origin_address'],
                    'destination_address' => $offer['destination_address'],
                    'distance_to_pickup_miles' => $offer['driver_distance_miles'] ? (float)$offer['driver_distance_miles'] : null,
                    'delivery_distance_miles' => $offer['delivery_distance_miles'] ? (float)$offer['delivery_distance_miles'] : null,
                    'total_miles' => $totalMiles > 0 ? (float)$totalMiles : null,
                    'weight' => $offer['weight'],
                    'dimensions' => $offer['dimensions'],
                    'proposed_cost_by_user' => (float)$offer['proposed_cost_by_user'],
                    'driver_proposed_cost' => $offer['driver_proposed_cost'] ? (float)$offer['driver_proposed_cost'] : null,
                    'offer_status' => $offer['offer_status'],
                    'driver_message' => $offer['driver_message'],
                    'dispatcher_response' => $offer['dispatcher_response'],
                    'created_at' => $offer['created_at'],
                    'viewed_at' => $offer['viewed_at'],
                    'price_proposed_at' => $offer['price_proposed_at'],
                    'responded_at' => $offer['responded_at']
                ]
            ]);

        } catch (Exception $e) {
            Logger::error('Failed to get offer details', [
                'offer_id' => $offerId,
                'driver_id' => $driver['id'],
                'error' => $e->getMessage()
            ]);
            self::sendResponse(['success' => false, 'message' => 'Failed to get offer details'], 500);
        }
    }

    /**
     * Price proposal from driver
     */
    public static function proposePrice($offerId)
    {
        $driver = self::getDriverFromToken();
        if (!$driver) {
            return; // Error response already sent
        }

        $data = json_decode(file_get_contents('php://input'), true);
        
        if (!isset($data['proposed_cost'])) {
            self::sendResponse(['success' => false, 'message' => 'Proposed cost is required'], 400);
            return;
        }

        $proposedCost = (float)$data['proposed_cost'];
        $message = $data['message'] ?? '';

        if ($proposedCost <= 0) {
            self::sendResponse(['success' => false, 'message' => 'Proposed cost must be greater than 0'], 400);
            return;
        }

        try {
            $pdo = Database::getConnection();
            
            // Check if offer exists and belongs to the driver
            $stmt = $pdo->prepare("
                SELECT id, offer_status, load_id 
                FROM LoadOffers 
                WHERE id = ? AND driver_id = ?
            ");
            $stmt->execute([$offerId, $driver['id']]);
            $offer = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$offer) {
                self::sendResponse(['success' => false, 'message' => 'Offer not found'], 404);
                return;
            }

            if (!in_array($offer['offer_status'], ['sent', 'viewed', 'price_negotiation'])) {
                self::sendResponse(['success' => false, 'message' => 'Cannot propose price for this offer'], 400);
                return;
            }

            // Update the offer
            $updateStmt = $pdo->prepare("
                UPDATE LoadOffers 
                SET driver_proposed_cost = ?, 
                    driver_message = ?, 
                    offer_status = 'driver_interested',
                    price_proposed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ");
            $updateStmt->execute([$proposedCost, $message, $offerId]);

            // Add message to chat
            $messageStmt = $pdo->prepare("
                INSERT INTO Messages (load_offer_id, sender_type, sender_id, message_text, message_type, price_amount, created_at)
                VALUES (?, 'driver', ?, ?, 'price_offer', ?, CURRENT_TIMESTAMP)
            ");
            $messageText = $message ?: "Пропоную $" . number_format($proposedCost, 2) . " за цей рейс";
            $messageStmt->execute([$offerId, $driver['id'], $messageText, $proposedCost]);

            // Log the action
            DriverActivityLogger::log('price_proposed', [
                'offer_id' => $offerId,
                'load_id' => $offer['load_id'],
                'proposed_cost' => $proposedCost,
                'message' => $message
            ], $driver['id']);

            self::sendResponse([
                'success' => true,
                'message' => 'Price proposed successfully',
                'proposed_cost' => $proposedCost,
                'offer_status' => 'driver_interested'
            ]);

        } catch (Exception $e) {
            Logger::error('Failed to propose price', [
                'offer_id' => $offerId,
                'driver_id' => $driver['id'],
                'error' => $e->getMessage()
            ]);
            self::sendResponse(['success' => false, 'message' => 'Failed to propose price'], 500);
        }
    }

    /**
     * Send message from driver
     */
    public static function sendChatMessage()
    {
        $driver = self::getDriverFromToken();
        if (!$driver) {
            return; // Error response already sent
        }

        $data = json_decode(file_get_contents('php://input'), true);
        
        if (!isset($data['offer_id']) || !isset($data['message_text'])) {
            self::sendResponse(['success' => false, 'message' => 'offer_id and message_text are required'], 400);
            return;
        }

        $offerId = (int)$data['offer_id'];
        $messageText = $data['message_text'];
        $messageType = $data['message_type'] ?? 'text';
        $priceAmount = isset($data['price_amount']) ? (float)$data['price_amount'] : null;

        try {
            $pdo = Database::getConnection();
            
            // Check if offer belongs to the driver
            $stmt = $pdo->prepare("
                SELECT id, load_id 
                FROM LoadOffers 
                WHERE id = ? AND driver_id = ?
            ");
            $stmt->execute([$offerId, $driver['id']]);
            $offer = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$offer) {
                self::sendResponse(['success' => false, 'message' => 'Offer not found'], 404);
                return;
            }

            // Add message
            $messageStmt = $pdo->prepare("
                INSERT INTO Messages (load_offer_id, sender_type, sender_id, message_text, message_type, price_amount, created_at)
                VALUES (?, 'driver', ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ");
            $messageStmt->execute([$offerId, $driver['id'], $messageText, $messageType, $priceAmount]);

            $messageId = $pdo->lastInsertId();

            // Log the action
            DriverActivityLogger::log('message_sent', [
                'offer_id' => $offerId,
                'load_id' => $offer['load_id'],
                'message_type' => $messageType,
                'message_id' => $messageId
            ], $driver['id']);

            self::sendResponse([
                'success' => true,
                'message_id' => (int)$messageId,
                'status' => 'sent'
            ]);

        } catch (Exception $e) {
            Logger::error('Failed to send chat message', [
                'offer_id' => $offerId,
                'driver_id' => $driver['id'],
                'error' => $e->getMessage()
            ]);
            self::sendResponse(['success' => false, 'message' => 'Failed to send message'], 500);
        }
    }

    /**
     * Get messages for driver
     */
    public static function getChatMessages($offerId)
    {
        $driver = self::getDriverFromToken();
        if (!$driver) {
            return; // Error response already sent
        }

        try {
            $pdo = Database::getConnection();
            
            // Check if offer belongs to the driver
            $stmt = $pdo->prepare("
                SELECT id, load_id 
                FROM LoadOffers 
                WHERE id = ? AND driver_id = ?
            ");
            $stmt->execute([$offerId, $driver['id']]);
            $offer = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$offer) {
                self::sendResponse(['success' => false, 'message' => 'Offer not found'], 404);
                return;
            }

            // Get messages
            $messageStmt = $pdo->prepare("
                SELECT id, sender_type, sender_id, message_text, message_type, 
                       price_amount, created_at, is_read, read_at
                FROM Messages
                WHERE load_offer_id = ?
                ORDER BY created_at ASC
            ");
            $messageStmt->execute([$offerId]);
            $messages = $messageStmt->fetchAll(PDO::FETCH_ASSOC);

            // Mark messages as read (except own messages)
            $readStmt = $pdo->prepare("
                UPDATE Messages 
                SET is_read = 1, read_at = CURRENT_TIMESTAMP
                WHERE load_offer_id = ? AND sender_type != 'driver' AND is_read = 0
            ");
            $readStmt->execute([$offerId]);

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

            self::sendResponse([
                'success' => true,
                'messages' => $result,
                'total' => count($result)
            ]);

        } catch (Exception $e) {
            Logger::error('Failed to get chat messages', [
                'offer_id' => $offerId,
                'driver_id' => $driver['id'],
                'error' => $e->getMessage()
            ]);
            self::sendResponse(['success' => false, 'message' => 'Failed to get messages'], 500);
        }
    }
} 