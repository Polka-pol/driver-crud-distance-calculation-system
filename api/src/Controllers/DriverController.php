<?php

require_once __DIR__ . '/../Core/Database.php';
require_once __DIR__ . '/../Core/Auth.php';

class DriverController {
    private $db;
    private $auth;
    
    public function __construct() {
        $this->db = Database::getInstance();
        $this->auth = new Auth();
    }
    
    /**
     * GET /drivers/available - Get available drivers for offers
     */
    public function getAvailable() {
        try {
            // Authenticate user
            $user = $this->auth->getCurrentUser();
            if (!$user) {
                http_response_code(401);
                echo json_encode(['error' => 'Unauthorized']);
                return;
            }
            
            // Only dispatchers can view available drivers
            if (!in_array($user['role'], ['dispatcher', 'admin', 'manager'])) {
                http_response_code(403);
                echo json_encode(['error' => 'Access denied. Dispatcher role required.']);
                return;
            }
            
            // Get available drivers
            $query = "
                SELECT 
                    ID as id,
                    TruckNumber as truck_number,
                    DriverName as driver_name,
                    CellPhone as cell_phone,
                    CityStateZip as location,
                    Dimensions as dimensions_payload,
                    rate as driver_rate,
                    mail as driver_email,
                    latitude,
                    longitude,
                    Status as status,
                    updated_at
                FROM Trucks 
                WHERE isActive = 1 
                    AND Status LIKE '%Available%'
                ORDER BY updated_at DESC
            ";
            
            $stmt = $this->db->prepare($query);
            $stmt->execute();
            $drivers = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Add online status (will be enhanced with real-time data later)
            foreach ($drivers as &$driver) {
                $driver['isOnline'] = false; // TODO: Get from socket_sessions table
                $driver['last_seen'] = $driver['updated_at'];
            }
            
            echo json_encode([
                'success' => true,
                'data' => $drivers
            ]);
            
        } catch (Exception $e) {
            error_log('Error in DriverController::getAvailable: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Internal server error']);
        }
    }
    
    /**
     * GET /drivers/{id} - Get specific driver details
     */
    public function getById($id) {
        try {
            // Authenticate user
            $user = $this->auth->getCurrentUser();
            if (!$user) {
                http_response_code(401);
                echo json_encode(['error' => 'Unauthorized']);
                return;
            }
            
            // Get driver details
            $query = "
                SELECT 
                    ID as id,
                    TruckNumber as truck_number,
                    DriverName as driver_name,
                    CellPhone as cell_phone,
                    CityStateZip as location,
                    Dimensions as dimensions_payload,
                    rate as driver_rate,
                    mail as driver_email,
                    latitude,
                    longitude,
                    Status as status,
                    updated_at,
                    assigned_dispatcher_id
                FROM Trucks 
                WHERE ID = ? AND isActive = 1
            ";
            
            $stmt = $this->db->prepare($query);
            $stmt->execute([$id]);
            $driver = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$driver) {
                http_response_code(404);
                echo json_encode(['error' => 'Driver not found']);
                return;
            }
            
            // Add online status (will be enhanced with real-time data later)
            $driver['isOnline'] = false; // TODO: Get from socket_sessions table
            $driver['last_seen'] = $driver['updated_at'];
            
            echo json_encode([
                'success' => true,
                'data' => $driver
            ]);
            
        } catch (Exception $e) {
            error_log('Error in DriverController::getById: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Internal server error']);
        }
    }
    
    /**
     * GET /drivers/by-location - Filter drivers by distance from location
     */
    public function getByLocation() {
        try {
            // Authenticate user
            $user = $this->auth->getCurrentUser();
            if (!$user) {
                http_response_code(401);
                echo json_encode(['error' => 'Unauthorized']);
                return;
            }
            
            // Only dispatchers can filter drivers
            if (!in_array($user['role'], ['dispatcher', 'admin', 'manager'])) {
                http_response_code(403);
                echo json_encode(['error' => 'Access denied. Dispatcher role required.']);
                return;
            }
            
            // Get query parameters
            $lat = $_GET['lat'] ?? null;
            $lon = $_GET['lon'] ?? null;
            $radius = $_GET['radius'] ?? 100; // Default 100 miles
            
            if (!$lat || !$lon) {
                http_response_code(400);
                echo json_encode(['error' => 'Latitude and longitude are required']);
                return;
            }
            
            // Get drivers within radius using Haversine formula
            $query = "
                SELECT 
                    ID as id,
                    TruckNumber as truck_number,
                    DriverName as driver_name,
                    CellPhone as cell_phone,
                    CityStateZip as location,
                    Dimensions as dimensions_payload,
                    rate as driver_rate,
                    mail as driver_email,
                    latitude,
                    longitude,
                    Status as status,
                    updated_at,
                    (
                        3959 * acos(
                            cos(radians(?)) * cos(radians(latitude)) * 
                            cos(radians(longitude) - radians(?)) + 
                            sin(radians(?)) * sin(radians(latitude))
                        )
                    ) AS distance_miles
                FROM Trucks 
                WHERE isActive = 1 
                    AND Status LIKE '%Available%'
                    AND latitude IS NOT NULL 
                    AND longitude IS NOT NULL
                HAVING distance_miles <= ?
                ORDER BY distance_miles ASC
            ";
            
            $stmt = $this->db->prepare($query);
            $stmt->execute([$lat, $lon, $lat, $radius]);
            $drivers = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Add online status
            foreach ($drivers as &$driver) {
                $driver['isOnline'] = false; // TODO: Get from socket_sessions table
                $driver['last_seen'] = $driver['updated_at'];
                $driver['distance_miles'] = round($driver['distance_miles'], 1);
            }
            
            echo json_encode([
                'success' => true,
                'data' => $drivers
            ]);
            
        } catch (Exception $e) {
            error_log('Error in DriverController::getByLocation: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Internal server error']);
        }
    }
}



