<?php

namespace App\Controllers;

use App\Core\Database;
use App\Core\Logger;
use App\Core\ActivityLogger;
use App\Core\Auth;
use App\Core\EDTTimeConverter;
use App\Services\GeocoderService;
use PDO;
use PDOException;
use Exception;

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
                    updated_by, updated_at, latitude, longitude,
                    hold_status, hold_started_at, hold_dispatcher_id, hold_dispatcher_name,
                    assigned_dispatcher_id, no_need_update_reason, no_need_update_until, no_need_update_comment
                 FROM Trucks'
            );
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $mappedResults = array_map(function ($row) {
                // Get current user ID from JWT token
                $currentUser = Auth::getCurrentUser();
                $currentUserId = $currentUser ? $currentUser->id : null;
                
                // Check if phone numbers should be hidden
                $shouldHidePhones = $row['hold_status'] === 'active' && 
                                  $row['hold_dispatcher_id'] != $currentUserId;
                
                return [
                    'truck_no' => $row['TruckNumber'],
                    'loads_mark' => $row['rate'] ?? '',
                    'status' => $row['Status'],
                    'arrival_time' => $row['WhenWillBeThere'],
                    'driver_name' => $row['DriverName'],
                    'contactphone' => $shouldHidePhones ? '***' : $row['contactphone'],
                    'cell_phone' => $shouldHidePhones ? '***' : $row['CellPhone'],
                    'email' => $row['mail'],
                    'city_state_zip' => $row['CityStateZip'],
                    'dimensions_payload' => $row['Dimensions'],
                    'comment' => $row['comments'],
                    'id' => $row['ID'],
                    'updated_by' => $row['updated_by'],
                    'updated_at' => $row['updated_at'],
                    'latitude' => $row['latitude'],
                    'longitude' => $row['longitude'],
                    'hold_status' => $row['hold_status'],
                    'hold_started_at' => $row['hold_started_at'],
                    'hold_dispatcher_id' => $row['hold_dispatcher_id'],
                    'hold_dispatcher_name' => $row['hold_dispatcher_name'],
                    'assigned_dispatcher_id' => $row['assigned_dispatcher_id'],
                    'no_need_update_reason' => $row['no_need_update_reason'],
                    'no_need_update_until' => $row['no_need_update_until'],
                    'no_need_update_comment' => $row['no_need_update_comment']
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
            

            
            if ($userData && isset($userData->fullName)) {
                $currentUser = $userData->fullName;
            }

            // Build dynamic update query based on provided fields
            $updateFields = [];
            $dbData = ['ID' => $id];
            
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
                'comment' => 'comments',
                'assigned_dispatcher_id' => 'assigned_dispatcher_id'
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
            
            // Automatic geocoding for location updates
            if (isset($data['city_state_zip'])) {
                // If coordinates are explicitly provided and are valid (non-zero), use them.
                // Otherwise, always attempt to geocode the address.
                $hasValidCoordinatesInInput = isset($data['latitude']) && isset($data['longitude']) && 
                                              $data['latitude'] != 0 && $data['longitude'] != 0;
                
                if (!$hasValidCoordinatesInInput) {
                    // Auto-geocode the address if coordinates are missing or invalid
                    try {
                        $geocoder = new GeocoderService();
                        $coords = $geocoder->getBestCoordinatesForLocation($data['city_state_zip']);
                        
                        if ($coords && isset($coords['lat']) && isset($coords['lon'])) {
                            $updateFields[] = "latitude = :latitude";
                            $updateFields[] = "longitude = :longitude";
                            $dbData['latitude'] = $coords['lat'];
                            $dbData['longitude'] = $coords['lon'];
                            

                        } else {
                            // If geocoding failed, explicitly set coordinates to NULL to indicate no valid coordinates
                            $updateFields[] = "latitude = :latitude";
                            $updateFields[] = "longitude = :longitude";
                            $dbData['latitude'] = null;
                            $dbData['longitude'] = null;

                            Logger::warning('Auto-geocoding failed - no coordinates returned', [
                                'truck_id' => $id,
                                'address' => $data['city_state_zip']
                            ]);
                        }
                    } catch (Exception $e) {
                        // If geocoding caused an exception, explicitly set coordinates to NULL
                        $updateFields[] = "latitude = :latitude";
                        $updateFields[] = "longitude = :longitude";
                        $dbData['latitude'] = null;
                        $dbData['longitude'] = null;

                        Logger::error('Auto-geocoding error', [
                            'truck_id' => $id,
                            'address' => $data['city_state_zip'],
                            'error' => $e->getMessage()
                        ]);
                    }
                } else {
                    // Use provided coordinates (they are already validated as non-zero)
                    $updateFields[] = "latitude = :latitude";
                    $updateFields[] = "longitude = :longitude";
                    $dbData['latitude'] = $data['latitude'];
                    $dbData['longitude'] = $data['longitude'];
                    

                }
            }
            
            // Update the updated_by field and updated_at timestamp only if provided in the request
            if (isset($data['updated_by'])) {
                $updateFields[] = "updated_by = :updated_by";
                $dbData['updated_by'] = $data['updated_by'];
            } else {
                // Default to current user if not provided
                $updateFields[] = "updated_by = :updated_by";
                $dbData['updated_by'] = $currentUser;
            }
            
            // Always use current EDT time for updated_at
            $updateFields[] = "updated_at = :updated_at";
            $dbData['updated_at'] = EDTTimeConverter::getCurrentEDT();
            
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
                    

                    
                    // Only log if location actually changed
                    if ($oldLocation !== $newLocation && $oldLocation !== null) {

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
                        COALESCE(t.latitude, ac.lat) as lat,
                        COALESCE(t.longitude, ac.lon) as lon,
                        COALESCE(ac.formatted_address, t.CityStateZip) as formatted_address,
                        t.hold_status, t.hold_started_at, t.hold_dispatcher_id, t.hold_dispatcher_name,
                        t.assigned_dispatcher_id
                     FROM Trucks t
                     LEFT JOIN address_cache ac ON t.CityStateZip = ac.search_query 
                        OR t.CityStateZip = ac.formatted_address
                        OR CONCAT(ac.city, ", ", ac.state, " ", ac.zip_code) = t.CityStateZip
                        OR CONCAT(ac.city, ", ", ac.state) = LEFT(t.CityStateZip, LENGTH(CONCAT(ac.city, ", ", ac.state)))
                     WHERE (t.latitude IS NOT NULL AND t.longitude IS NOT NULL) 
                        OR (ac.lat IS NOT NULL AND ac.lon IS NOT NULL)
                     GROUP BY t.ID';
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute();
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $mappedResults = array_map(function ($row) {
                // Get current user ID from JWT token
                $currentUser = Auth::getCurrentUser();
                $currentUserId = $currentUser ? $currentUser->id : null;
                
                // Check if phone numbers should be hidden
                $shouldHidePhones = $row['hold_status'] === 'active' && 
                                  $row['hold_dispatcher_id'] != $currentUserId;
                
                return [
                    'id' => $row['ID'],
                    'truck_no' => $row['TruckNumber'],
                    'status' => $row['Status'],
                    'driver_name' => $row['DriverName'],
                    'cell_phone' => $shouldHidePhones ? '***' : $row['CellPhone'],
                    'city_state_zip' => $row['CityStateZip'],
                    'arrival_time' => $row['WhenWillBeThere'],
                    'loads_mark' => $row['rate'] ?? '',
                    'lat' => (float)$row['lat'],
                    'lon' => (float)$row['lon'],
                    'formatted_address' => $row['formatted_address'],
                    'hold_status' => $row['hold_status'],
                    'hold_started_at' => $row['hold_started_at'],
                    'hold_dispatcher_id' => $row['hold_dispatcher_id'],
                    'hold_dispatcher_name' => $row['hold_dispatcher_name'],
                    'assigned_dispatcher_id' => $row['assigned_dispatcher_id']
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
            
            // Get user info from JWT token
            $currentUser = 'Unknown User';
            $userData = Auth::getCurrentUser();
            
            if ($userData && isset($userData->fullName)) {
                $currentUser = $userData->fullName;
            }
            
            // Prepare base parameters
            $params = [
                'TruckNumber' => $data['truck_no'],
                'DriverName' => $data['driver_name'],
                'CellPhone' => $data['cell_phone'],
                'Status' => $data['status'] ?? 'Available',
                'CityStateZip' => $data['city_state_zip'] ?? null,
                'comments' => $data['comment'] ?? null,
                'WhenWillBeThere' => !empty($data['arrival_time']) ? $data['arrival_time'] : EDTTimeConverter::getCurrentEDT(),
                'rate' => $data['loads_mark'] ?? null,
                'mail' => $data['email'] ?? null,
                'contactphone' => $data['contactphone'] ?? null,
                'Dimensions' => $data['dimensions_payload'] ?? null,
                'assigned_dispatcher_id' => $data['assigned_dispatcher_id'] ?? null,
                'updated_by' => $currentUser,
                'updated_at' => EDTTimeConverter::getCurrentEDT(),
                'latitude' => null, // Initialize with null
                'longitude' => null // Initialize with null
            ];
            
            // Automatic geocoding for location
            if (!empty($data['city_state_zip'])) {
                // If coordinates are explicitly provided and are valid (non-zero), use them.
                // Otherwise, always attempt to geocode the address.
                $hasValidCoordinatesInInput = isset($data['latitude']) && isset($data['longitude']) && 
                                              $data['latitude'] != 0 && $data['longitude'] != 0;

                if (!$hasValidCoordinatesInInput) {
                    // Auto-geocode the address if coordinates are missing or invalid
                    try {
                        $geocoder = new GeocoderService();
                        $coords = $geocoder->getBestCoordinatesForLocation($data['city_state_zip']);
                        
                        if ($coords && isset($coords['lat']) && isset($coords['lon'])) {
                            $params['latitude'] = $coords['lat'];
                            $params['longitude'] = $coords['lon'];
                            

                        } else {
                            // If geocoding failed, explicitly set coordinates to NULL
                            $params['latitude'] = null;
                            $params['longitude'] = null;

                            Logger::warning('Auto-geocoding failed for new truck - no coordinates returned', [
                                'address' => $data['city_state_zip']
                            ]);
                        }
                    } catch (Exception $e) {
                        // If geocoding caused an exception, explicitly set coordinates to NULL
                        $params['latitude'] = null;
                        $params['longitude'] = null;

                        Logger::error('Auto-geocoding error for new truck', [
                            'address' => $data['city_state_zip'],
                            'error' => $e->getMessage()
                        ]);
                    }
                } else {
                    // Use provided coordinates (they are already validated as non-zero)
                    $params['latitude'] = $data['latitude'];
                    $params['longitude'] = $data['longitude'];
                    

                }
            }
            
            // Build dynamic SQL based on available parameters
            $fields = array_keys($params);
            $placeholders = ':' . implode(', :', $fields);
            
            $sql = "INSERT INTO Trucks (" . implode(', ', $fields) . ") VALUES (" . $placeholders . ")";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            
            $newTruckId = $pdo->lastInsertId();
            
            ActivityLogger::log('truck_created', ['truck_id' => $newTruckId, 'truck_number' => $data['truck_no']]);

            // Fetch the newly created truck to return it
            $fetchStmt = $pdo->prepare("SELECT TruckNumber, rate, Status, WhenWillBeThere, DriverName, contactphone, CellPhone, mail, CityStateZip, Dimensions, comments, ID, updated_by, updated_at, latitude, longitude, hold_status, hold_started_at, hold_dispatcher_id, hold_dispatcher_name, assigned_dispatcher_id FROM Trucks WHERE ID = ?");
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
                'updated_at' => $newTruck['updated_at'],
                'latitude' => $newTruck['latitude'],
                'longitude' => $newTruck['longitude'],
                'hold_status' => $newTruck['hold_status'],
                'hold_started_at' => $newTruck['hold_started_at'],
                'hold_dispatcher_id' => $newTruck['hold_dispatcher_id'],
                'hold_dispatcher_name' => $newTruck['hold_dispatcher_name'],
                'assigned_dispatcher_id' => $newTruck['assigned_dispatcher_id']
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

    /**
     * Place a hold on a truck for 15 minutes
     */
    public static function placeHold($truckId, $dispatcherId, $dispatcherName)
    {
        try {
            $pdo = Database::getConnection();
            
            // Check if truck exists
            $truckStmt = $pdo->prepare("SELECT TruckNumber FROM Trucks WHERE ID = :ID");
            $truckStmt->execute(['ID' => $truckId]);
            $truckData = $truckStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$truckData) {
                self::sendResponse(['success' => false, 'message' => 'Truck not found.'], 404);
                return;
            }
            
            $truckNumber = $truckData['TruckNumber'] ?? 'unknown';
            
            // Check if truck is already on hold
            $holdStmt = $pdo->prepare("SELECT hold_status, hold_dispatcher_id, hold_dispatcher_name FROM Trucks WHERE ID = :ID");
            $holdStmt->execute(['ID' => $truckId]);
            $holdData = $holdStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($holdData['hold_status'] === 'active') {
                self::sendResponse([
                    'success' => false, 
                    'message' => 'Truck is already on hold.',
                    'hold_info' => [
                        'dispatcher_name' => $holdData['hold_dispatcher_name'],
                        'dispatcher_id' => $holdData['hold_dispatcher_id']
                    ]
                ], 409);
                return;
            }
            
            // Place hold with optimistic locking to prevent race conditions
            $updateStmt = $pdo->prepare("
                UPDATE Trucks 
                SET hold_status = 'active', 
                    hold_started_at = :edt_time, 
                    hold_dispatcher_id = :dispatcher_id, 
                    hold_dispatcher_name = :dispatcher_name
                WHERE ID = :truck_id AND (hold_status IS NULL OR hold_status != 'active')
            ");
            
            $updateStmt->execute([
                'edt_time' => EDTTimeConverter::getCurrentEDT(),
                'dispatcher_id' => $dispatcherId,
                'dispatcher_name' => $dispatcherName,
                'truck_id' => $truckId
            ]);
            
            // Check if any rows were actually updated
            if ($updateStmt->rowCount() === 0) {
                // Hold was already placed by another request
                $holdStmt = $pdo->prepare("SELECT hold_dispatcher_name FROM Trucks WHERE ID = :ID");
                $holdStmt->execute(['ID' => $truckId]);
                $holdData = $holdStmt->fetch(PDO::FETCH_ASSOC);
                
                self::sendResponse([
                    'success' => false, 
                    'message' => 'Truck is already on hold.',
                    'hold_info' => [
                        'dispatcher_name' => $holdData['hold_dispatcher_name'] ?? 'Unknown',
                        'dispatcher_id' => $dispatcherId
                    ]
                ], 409);
                return;
            }
            
            ActivityLogger::log('truck_hold_placed', [
                'truck_id' => $truckId,
                'truck_number' => $truckNumber,
                'dispatcher_id' => $dispatcherId,
                'dispatcher_name' => $dispatcherName
            ]);
            
            self::sendResponse(['success' => true, 'message' => 'Hold placed successfully.']);

        } catch (PDOException $e) {
            Logger::error('Failed to place hold', ['error' => $e->getMessage(), 'truck_id' => $truckId]);
            self::sendResponse(['success' => false, 'message' => 'Database error during hold placement.'], 500);
        }
    }

    /**
     * Remove hold from a truck
     */
    public static function removeHold($truckId, $dispatcherId)
    {
        try {
            $pdo = Database::getConnection();
            
            // Check if truck exists and get hold info
            $truckStmt = $pdo->prepare("
                SELECT TruckNumber, hold_status, hold_dispatcher_id, hold_dispatcher_name 
                FROM Trucks WHERE ID = :ID
            ");
            $truckStmt->execute(['ID' => $truckId]);
            $truckData = $truckStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$truckData) {
                self::sendResponse(['success' => false, 'message' => 'Truck not found.'], 404);
                return;
            }
            
            if ($truckData['hold_status'] !== 'active') {
                self::sendResponse(['success' => false, 'message' => 'Truck is not on hold.'], 400);
                return;
            }
            
            // Check if dispatcher can remove the hold
            if ($truckData['hold_dispatcher_id'] != $dispatcherId) {
                self::sendResponse(['success' => false, 'message' => 'You can only remove your own holds.'], 403);
                return;
            }
            
            $truckNumber = $truckData['TruckNumber'] ?? 'unknown';
            
            // Remove hold with optimistic locking to prevent race conditions
            $updateStmt = $pdo->prepare("
                UPDATE Trucks 
                SET hold_status = NULL, 
                    hold_started_at = NULL, 
                    hold_dispatcher_id = NULL, 
                    hold_dispatcher_name = NULL
                WHERE ID = :truck_id AND hold_status = 'active'
            ");
            
            $updateStmt->execute([
                'truck_id' => $truckId
            ]);
            
            // Check if any rows were actually updated
            if ($updateStmt->rowCount() === 0) {
                // Hold was already removed by another request
                self::sendResponse(['success' => false, 'message' => 'Hold was already removed.'], 409);
                return;
            }
            
            ActivityLogger::log('truck_hold_removed', [
                'truck_id' => $truckId,
                'truck_number' => $truckNumber,
                'dispatcher_id' => $dispatcherId,
                'dispatcher_name' => $truckData['hold_dispatcher_name']
            ]);
            
            self::sendResponse(['success' => true, 'message' => 'Hold removed successfully.']);

        } catch (PDOException $e) {
            Logger::error('Failed to remove hold', ['error' => $e->getMessage(), 'truck_id' => $truckId]);
            self::sendResponse(['success' => false, 'message' => 'Database error during hold removal.'], 500);
        }
    }

    /**
     * Cleanup expired holds (older than 15 minutes)
     */
    public static function cleanupExpiredHolds()
    {
        try {
            $pdo = Database::getConnection();
            
            // Find and update expired holds with optimistic locking
            $updateStmt = $pdo->prepare("
                UPDATE Trucks 
                SET hold_status = 'expired'
                WHERE hold_status = 'active' 
                AND hold_started_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)
            ");
            
            $updateStmt->execute();
            $expiredCount = $updateStmt->rowCount();
            
            if ($expiredCount > 0) {
                Logger::info('Cleaned up expired holds', ['count' => $expiredCount]);
            }
            
            self::sendResponse(['success' => true, 'expired_count' => $expiredCount]);

        } catch (PDOException $e) {
            Logger::error('Failed to cleanup expired holds', ['error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Database error during cleanup.'], 500);
        }
    }

    /**
     * Get hold information for a truck
     */
    public static function getHoldInfo($truckId)
    {
        try {
            $pdo = Database::getConnection();
            
            $stmt = $pdo->prepare("
                SELECT hold_status, hold_started_at, hold_dispatcher_id, hold_dispatcher_name
                FROM Trucks WHERE ID = :ID
            ");
            $stmt->execute(['ID' => $truckId]);
            $holdData = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$holdData) {
                self::sendResponse(['success' => false, 'message' => 'Truck not found.'], 404);
                return;
            }
            
            $holdInfo = [
                'hold_status' => $holdData['hold_status'],
                'hold_started_at' => $holdData['hold_started_at'],
                'hold_dispatcher_id' => $holdData['hold_dispatcher_id'],
                'hold_dispatcher_name' => $holdData['hold_dispatcher_name']
            ];
            
            // Calculate time remaining if on active hold using EDT time
            if ($holdData['hold_status'] === 'active' && $holdData['hold_started_at']) {
                $startTime = new \DateTime($holdData['hold_started_at']);
                $now = new \DateTime(EDTTimeConverter::getCurrentEDT()); // EDT time
                $elapsed = $now->diff($startTime);
                $elapsedMinutes = ($elapsed->h * 60) + $elapsed->i;
                $remainingMinutes = max(0, 15 - $elapsedMinutes);
                
                $holdInfo['remaining_minutes'] = $remainingMinutes;
                $holdInfo['elapsed_minutes'] = $elapsedMinutes;
                $holdInfo['server_time'] = EDTTimeConverter::getCurrentEDT();
            }
            
            self::sendResponse(['success' => true, 'hold_info' => $holdInfo]);

        } catch (PDOException $e) {
            Logger::error('Failed to get hold info', ['error' => $e->getMessage(), 'truck_id' => $truckId]);
            self::sendResponse(['success' => false, 'message' => 'Database error.'], 500);
        }
    }

    /**
     * Get server time and hold countdown for all trucks
     */
    public static function getServerTimeAndHolds()
    {
        try {
            $pdo = Database::getConnection();
            
            // Get current EDT time
            $edtTime = EDTTimeConverter::getCurrentEDT();
            
            // Get all active holds with remaining time
            $holdsStmt = $pdo->prepare("
                SELECT ID, hold_started_at, hold_dispatcher_id, hold_dispatcher_name
                FROM Trucks 
                WHERE hold_status = 'active' AND hold_started_at IS NOT NULL
            ");
            $holdsStmt->execute();
            $activeHolds = $holdsStmt->fetchAll(PDO::FETCH_ASSOC);
            
            $holdsInfo = [];
            foreach ($activeHolds as $hold) {
                $startTime = new \DateTime($hold['hold_started_at']);
                $now = new \DateTime($edtTime); // EDT time
                $elapsed = $now->diff($startTime);
                $elapsedMinutes = ($elapsed->h * 60) + $elapsed->i;
                $remainingMinutes = max(0, 15 - $elapsedMinutes);
                
                $holdsInfo[] = [
                    'truck_id' => $hold['ID'],
                    'remaining_minutes' => $remainingMinutes,
                    'elapsed_minutes' => $elapsedMinutes,
                    'is_expired' => $remainingMinutes <= 0
                ];
            }
            
            self::sendResponse([
                'success' => true, 
                'server_time' => $edtTime,
                'holds' => $holdsInfo
            ]);

        } catch (PDOException $e) {
            Logger::error('Failed to get server time and holds', ['error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Database error.'], 500);
        }
    }
} 