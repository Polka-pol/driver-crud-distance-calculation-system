<?php

namespace App\Controllers;

use App\Core\Database;
use App\Core\Logger;
use App\Core\ActivityLogger;
use App\Core\Auth;
use PDO;
use PDOException;

class TruckController
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
     * Get all trucks from the database.
     */
    public static function getAll()
    {
        try {
            $pdo = Database::getConnection();
            $stmt = $pdo->query(
                'SELECT 
                    TruckNumber, rate, Status, WhenWillBeThere, 
                    DriverName, contactphone, CellPhone, mail, 
                    CityStateZip, Dimensions, comments, ID,
                    updated_by, updated_at
                 FROM Trucks'
            );
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $mappedResults = array_map(function ($row) {
                return [
                    'truck_no' => $row['TruckNumber'],
                    'loads_mark' => $row['rate'] ?? '',
                    'status' => $row['Status'],
                    'arrival_time' => $row['WhenWillBeThere'],
                    'driver_name' => $row['DriverName'],
                    'contactphone' => $row['contactphone'],
                    'cell_phone' => $row['CellPhone'],
                    'email' => $row['mail'],
                    'city_state_zip' => $row['CityStateZip'],
                    'dimensions_payload' => $row['Dimensions'],
                    'comment' => $row['comments'],
                    'id' => $row['ID'],
                    'updated_by' => $row['updated_by'],
                    'updated_at' => $row['updated_at']
                ];
            }, $results);

            self::sendResponse($mappedResults);

        } catch (PDOException $e) {
            Logger::error('Failed to fetch trucks', ['error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Database error.'], 500);
        }
    }

    /**
     * Update a truck by its ID using data from the request body.
     */
    public static function update($id, $data)
    {
        try {
            if (empty($data)) {
                self::sendResponse(['success' => false, 'message' => 'Empty request body.'], 400);
                return;
            }

            // Get user info from JWT token
            $currentUser = 'Unknown User';
            $userData = Auth::getCurrentUser();
            
            // Debug logging
            Logger::info('JWT User Data Debug', [
                'userData' => $userData ? (array)$userData : null,
                'hasFullName' => $userData && isset($userData->fullName),
                'fullName' => $userData->fullName ?? 'not set'
            ]);
            
            if ($userData && isset($userData->fullName)) {
                $currentUser = $userData->fullName;
            }

            // Build dynamic update query based on provided fields
            $updateFields = [];
            $dbData = ['ID' => $id, 'updated_by' => $currentUser];
            
            // Map frontend field names to database column names
            $fieldMapping = [
                'truck_no' => 'TruckNumber',
                'loads_mark' => 'rate',
                'status' => 'Status',
                'arrival_time' => 'WhenWillBeThere',
                'driver_name' => 'DriverName',
                'contactphone' => 'contactphone',
                'cell_phone' => 'CellPhone',
                'email' => 'mail',
                'city_state_zip' => 'CityStateZip',
                'dimensions_payload' => 'Dimensions',
                'comment' => 'comments'
            ];
            
            // Only include fields that are actually provided in the request
            foreach ($fieldMapping as $frontendField => $dbField) {
                if (isset($data[$frontendField])) {
                    $updateFields[] = "$dbField = :$dbField";
                    $dbData[$dbField] = $data[$frontendField];
                }
            }
            
            // Special handling for contactphone (can be set from cell_phone)
            if (isset($data['cell_phone']) && !isset($data['contactphone'])) {
                $updateFields[] = "contactphone = :contactphone";
                $dbData['contactphone'] = $data['cell_phone'];
            }
            
            // Always update the updated_by field
            $updateFields[] = "updated_by = :updated_by";
            
            if (empty($updateFields)) {
                self::sendResponse(['success' => false, 'message' => 'No fields to update.'], 400);
                return;
            }
            
            // Validate that truck number is provided if it's being updated
            if (isset($data['truck_no']) && empty($data['truck_no'])) {
                self::sendResponse(['success' => false, 'message' => 'Truck number is required.'], 400);
                return;
            }

            $pdo = Database::getConnection();
            
            // Get current truck data BEFORE update for location change detection
            $currentTruckStmt = $pdo->prepare("SELECT TruckNumber, CityStateZip FROM Trucks WHERE ID = :ID");
            $currentTruckStmt->execute(['ID' => $id]);
            $currentTruckData = $currentTruckStmt->fetch(PDO::FETCH_ASSOC);
            $oldLocation = $currentTruckData['CityStateZip'] ?? null;
            $truckNumber = $currentTruckData['TruckNumber'] ?? 'unknown';
            
            $sql = "UPDATE Trucks SET " . implode(', ', $updateFields) . " WHERE ID = :ID";
            
            // Log what fields are being updated
            Logger::info('Truck update fields', [
                'truck_id' => $id,
                'update_fields' => array_keys($dbData),
                'sql' => $sql
            ]);
            $stmt = $pdo->prepare($sql);
            $stmt->execute($dbData);

            if ($stmt->rowCount() > 0) {
                $updatedFields = array_keys($dbData);
                // Remove internal fields from the log
                $updatedFields = array_filter($updatedFields, function($field) {
                    return !in_array($field, ['ID', 'updated_by']);
                });
                
                // Check if location was changed and log it
                if (isset($data['city_state_zip'])) {
                    $newLocation = $data['city_state_zip'];
                    
                    // Debug logging
                    Logger::info('Location change check', [
                        'truck_id' => $id,
                        'old_location' => $oldLocation,
                        'new_location' => $newLocation,
                        'locations_different' => $oldLocation !== $newLocation,
                        'old_location_not_null' => $oldLocation !== null
                    ]);
                    
                    // Only log if location actually changed
                    if ($oldLocation !== $newLocation && $oldLocation !== null) {
                        Logger::info('Logging location change', [
                            'truck_id' => $id,
                            'truck_number' => $truckNumber,
                            'old_location' => $oldLocation,
                            'new_location' => $newLocation
                        ]);
                        self::logLocationChange($pdo, $id, $truckNumber, $oldLocation, $newLocation, $userData);
                    }
                }
                
                ActivityLogger::log('truck_updated', [
                    'truck_id' => $id, 
                    'truck_number' => $truckNumber,
                    'updated_fields' => array_values($updatedFields)
                ]);
            }
            
            self::sendResponse(['success' => true, 'message' => 'Truck updated successfully.']);

        } catch (PDOException $e) {
            Logger::error('Truck update failed', ['id' => $id, 'error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Database error during update.'], 500);
        }
    }

    /**
     * Update a truck's information from a POST request.
     */
    public static function updateViaPost() {
        $data = json_decode(file_get_contents('php://input'), true);

        if (!$data || !isset($data['id'])) {
            self::sendResponse(['success' => false, 'message' => 'Invalid or missing truck ID.'], 400);
            return;
        }

        $id = (int)$data['id'];
        self::update($id, $data);
    }

    /**
     * Delete a truck by ID.
     */
    public static function delete($id) {
        try {
            $pdo = Database::getConnection();
            
            // Get truck number before deletion for logging
            $truckNumberStmt = $pdo->prepare("SELECT TruckNumber FROM Trucks WHERE ID = :ID");
            $truckNumberStmt->execute(['ID' => $id]);
            $truckData = $truckNumberStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$truckData) {
                self::sendResponse(['success' => false, 'message' => 'Truck not found.'], 404);
                return;
            }
            
            $truckNumber = $truckData['TruckNumber'] ?? 'unknown';
            
            $sql = "DELETE FROM Trucks WHERE ID = :ID";
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['ID' => $id]);

            if ($stmt->rowCount() === 0) {
                 self::sendResponse(['success' => false, 'message' => 'Truck not found.'], 404);
                 return;
            }
            
            ActivityLogger::log('truck_deleted', [
                'truck_id' => $id,
                'truck_number' => $truckNumber
            ]);
            self::sendResponse(['success' => true, 'message' => 'Truck deleted successfully.']);

        } catch (PDOException $e) {
            Logger::error('Truck deletion failed', ['id' => $id, 'error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Database error during deletion.'], 500);
        }
    }

    /**
     * Delete a truck by ID from a POST request.
     */
    public static function deleteViaPost() {
        $data = json_decode(file_get_contents('php://input'), true);

        if (!$data || !isset($data['id'])) {
            self::sendResponse(['success' => false, 'message' => 'Invalid or missing truck ID for deletion.'], 400);
            return;
        }

        $id = (int)$data['id'];
        self::delete($id);
    }

    /**
     * Get all trucks with their coordinates for map display.
     */
    public static function getForMap()
    {
        try {
            $pdo = Database::getConnection();
            
            $sql = 'SELECT 
                        t.TruckNumber, t.Status, t.DriverName, t.CellPhone, 
                        t.CityStateZip, t.ID, t.WhenWillBeThere, t.rate,
                        ac.lat, ac.lon, ac.formatted_address
                     FROM Trucks t
                     LEFT JOIN address_cache ac ON t.CityStateZip = ac.search_query 
                        OR t.CityStateZip = ac.formatted_address
                        OR CONCAT(ac.city, ", ", ac.state, " ", ac.zip_code) = t.CityStateZip
                        OR CONCAT(ac.city, ", ", ac.state) = LEFT(t.CityStateZip, LENGTH(CONCAT(ac.city, ", ", ac.state)))
                     WHERE ac.lat IS NOT NULL AND ac.lon IS NOT NULL
                     GROUP BY t.ID';
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute();
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $mappedResults = array_map(function ($row) {
                return [
                    'id' => $row['ID'],
                    'truck_no' => $row['TruckNumber'],
                    'status' => $row['Status'],
                    'driver_name' => $row['DriverName'],
                    'cell_phone' => $row['CellPhone'],
                    'city_state_zip' => $row['CityStateZip'],
                    'arrival_time' => $row['WhenWillBeThere'],
                    'loads_mark' => $row['rate'] ?? '',
                    'lat' => (float)$row['lat'],
                    'lon' => (float)$row['lon'],
                    'formatted_address' => $row['formatted_address']
                ];
            }, $results);

            self::sendResponse($mappedResults);

        } catch (PDOException $e) {
            Logger::error('Failed to fetch trucks for map', ['error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Database error.'], 500);
        }
    }

    /**
     * Create a new truck record.
     */
    public static function create()
    {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data)) {
            self::sendResponse(['success' => false, 'message' => 'Empty request body.'], 400);
            return;
        }

        // Basic validation
        if (empty($data['truck_no']) || empty($data['driver_name']) || empty($data['cell_phone'])) {
            self::sendResponse(['success' => false, 'message' => 'Truck No, Driver Name, and Cell Phone are required.'], 400);
            return;
        }

        try {
            $pdo = Database::getConnection();
            
            $sql = "INSERT INTO Trucks (
                        TruckNumber, DriverName, CellPhone, Status, CityStateZip, 
                        comments, WhenWillBeThere, rate, mail, contactphone, Dimensions
                    ) VALUES (
                        :TruckNumber, :DriverName, :CellPhone, :Status, :CityStateZip, 
                        :comments, :WhenWillBeThere, :rate, :mail, :contactphone, :Dimensions
                    )";

            $stmt = $pdo->prepare($sql);
            
            $params = [
                'TruckNumber' => $data['truck_no'],
                'DriverName' => $data['driver_name'],
                'CellPhone' => $data['cell_phone'],
                'Status' => $data['status'] ?? 'Available',
                'CityStateZip' => $data['city_state_zip'] ?? null,
                'comments' => $data['comment'] ?? null,
                'WhenWillBeThere' => !empty($data['arrival_time']) ? $data['arrival_time'] : date('Y-m-d H:i:s'),
                'rate' => $data['loads_mark'] ?? null,
                'mail' => $data['email'] ?? null,
                'contactphone' => $data['contactphone'] ?? null,
                'Dimensions' => $data['dimensions_payload'] ?? null
            ];
            
            $stmt->execute($params);
            
            $newTruckId = $pdo->lastInsertId();
            
            ActivityLogger::log('truck_created', ['truck_id' => $newTruckId, 'truck_number' => $data['truck_no']]);

            // Fetch the newly created truck to return it
            $fetchStmt = $pdo->prepare("SELECT TruckNumber, rate, Status, WhenWillBeThere, DriverName, contactphone, CellPhone, mail, CityStateZip, Dimensions, comments, ID, updated_by, updated_at FROM Trucks WHERE ID = ?");
            $fetchStmt->execute([$newTruckId]);
            $newTruck = $fetchStmt->fetch(PDO::FETCH_ASSOC);

            $mappedTruck = [
                'truck_no' => $newTruck['TruckNumber'],
                'loads_mark' => $newTruck['rate'] ?? '',
                'status' => $newTruck['Status'],
                'arrival_time' => $newTruck['WhenWillBeThere'],
                'driver_name' => $newTruck['DriverName'],
                'contactphone' => $newTruck['contactphone'],
                'cell_phone' => $newTruck['CellPhone'],
                'email' => $newTruck['mail'],
                'city_state_zip' => $newTruck['CityStateZip'],
                'dimensions_payload' => $newTruck['Dimensions'],
                'comment' => $newTruck['comments'],
                'id' => $newTruck['ID'],
                'updated_by' => $newTruck['updated_by'],
                'updated_at' => $newTruck['updated_at']
            ];

            self::sendResponse(['success' => true, 'message' => 'Truck created successfully.', 'truck' => $mappedTruck]);

        } catch (PDOException $e) {
            Logger::error('Truck creation failed', ['error' => $e->getMessage()]);
            // Check for duplicate entry
            if ($e->getCode() == 23000) {
                self::sendResponse(['success' => false, 'message' => 'Error: A truck with this number or cell phone might already exist.'], 409);
            } else {
                self::sendResponse(['success' => false, 'message' => 'Database error during creation.'], 500);
            }
        }
    }
    
    /**
     * Log location change to truck_location_history table
     */
    private static function logLocationChange($pdo, $truckId, $truckNumber, $oldLocation, $newLocation, $userData)
    {
        try {
            $sql = "INSERT INTO truck_location_history (
                        truck_id, truck_number, old_location, new_location, 
                        changed_by_user_id, changed_by_username, created_at
                    ) VALUES (
                        :truck_id, :truck_number, :old_location, :new_location,
                        :changed_by_user_id, :changed_by_username, NOW()
                    )";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                ':truck_id' => $truckId,
                ':truck_number' => $truckNumber,
                ':old_location' => $oldLocation,
                ':new_location' => $newLocation,
                ':changed_by_user_id' => $userData ? ($userData->id ?? null) : null,
                ':changed_by_username' => $userData ? ($userData->fullName ?? $userData->username ?? 'Unknown User') : 'Unknown User'
            ]);
            
            // Also log to activity_logs for dashboard
            ActivityLogger::log('truck_location_changed', [
                'truck_id' => $truckId,
                'truck_number' => $truckNumber,
                'old_location' => $oldLocation,
                'new_location' => $newLocation
            ]);
            
            Logger::info('Location change logged', [
                'truck_id' => $truckId,
                'truck_number' => $truckNumber,
                'old_location' => $oldLocation,
                'new_location' => $newLocation
            ]);
            
        } catch (PDOException $e) {
            Logger::error('Failed to log location change', [
                'error' => $e->getMessage(),
                'truck_id' => $truckId
            ]);
        }
    }

    /**
     * Get location history for a truck with pagination
     */
    public static function getLocationHistory($truckId, $page = 1, $limit = 10)
    {
        try {
            $pdo = Database::getConnection();
            
            // Validate truck exists
            $truckStmt = $pdo->prepare("SELECT TruckNumber FROM Trucks WHERE ID = :ID");
            $truckStmt->execute(['ID' => $truckId]);
            $truckData = $truckStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$truckData) {
                self::sendResponse(['success' => false, 'message' => 'Truck not found.'], 404);
                return;
            }
            
            $offset = ($page - 1) * $limit;
            
            // Get location history with pagination
            $sql = "SELECT 
                        id, truck_id, truck_number, old_location, new_location,
                        changed_by_user_id, changed_by_username, created_at
                    FROM truck_location_history 
                    WHERE truck_id = :truck_id 
                    ORDER BY created_at DESC 
                    LIMIT :limit OFFSET :offset";
            
            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(':truck_id', $truckId, PDO::PARAM_INT);
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            
            $history = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Get total count for pagination
            $countStmt = $pdo->prepare("SELECT COUNT(*) as total FROM truck_location_history WHERE truck_id = :truck_id");
            $countStmt->execute(['truck_id' => $truckId]);
            $countData = $countStmt->fetch(PDO::FETCH_ASSOC);
            $total = $countData['total'];
            
            $totalPages = ceil($total / $limit);
            
            self::sendResponse([
                'success' => true,
                'data' => $history,
                'pagination' => [
                    'current_page' => $page,
                    'total_pages' => $totalPages,
                    'total_records' => $total,
                    'per_page' => $limit
                ],
                'truck' => [
                    'id' => $truckId,
                    'truck_number' => $truckData['TruckNumber']
                ]
            ]);
            
        } catch (PDOException $e) {
            Logger::error('Failed to get location history', [
                'error' => $e->getMessage(),
                'truck_id' => $truckId
            ]);
            self::sendResponse(['success' => false, 'message' => 'Database error.'], 500);
        }
    }
    
    /**
     * Get location history count for a truck
     */
    public static function getLocationHistoryCount($truckId)
    {
        try {
            $pdo = Database::getConnection();
            
            $countStmt = $pdo->prepare("SELECT COUNT(*) as total FROM truck_location_history WHERE truck_id = :truck_id");
            $countStmt->execute(['truck_id' => $truckId]);
            $countData = $countStmt->fetch(PDO::FETCH_ASSOC);
            
            self::sendResponse([
                'success' => true,
                'count' => $countData['total']
            ]);
            
        } catch (PDOException $e) {
            Logger::error('Failed to get location history count', [
                'error' => $e->getMessage(),
                'truck_id' => $truckId
            ]);
            self::sendResponse(['success' => false, 'message' => 'Database error.'], 500);
        }
    }
} 