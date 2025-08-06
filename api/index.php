<?php

// No longer need to force error reporting here.
// We will rely on the .env setting.

// Set a default timezone to avoid potential warnings.
date_default_timezone_set('UTC');

// --- Bootstrap ---
// This section loads the necessary files and configurations.

// 1. Autoloader
// Load the Composer autoloader to automatically include class files.
require __DIR__ . '/vendor/autoload.php';

// 2. Environment Variables
// Load environment variables from the .env file.
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
$dotenv->load();

// 3. Error Reporting
if (isset($_ENV['APP_ENV']) && $_ENV['APP_ENV'] === 'development') {
    ini_set('display_errors', 1);
    ini_set('display_startup_errors', 1);
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', 0);
    ini_set('display_startup_errors', 0);
    error_reporting(0);
}

// Use statements for the classes we will use.
use App\Core\Database;
use App\Controllers\TruckController;
use App\Controllers\SearchController;
use App\Controllers\DistanceController;
use App\Controllers\LoadHierarchyController;
use App\Controllers\AuthController;
use App\Controllers\UserController;
use App\Controllers\DashboardController;
use App\Controllers\DispatcherDashboardController;
use App\Controllers\DriverController;
use App\Controllers\LoadOfferController;
use App\Controllers\DriverUpdatesController;
use App\Core\Auth;

// --- Headers ---
// Set common headers for the API response.
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '*';

// Get allowed origins from environment variable
$allowedOrigins = [];
if (isset($_ENV['ALLOWED_ORIGINS'])) {
    $allowedOrigins = array_map('trim', explode(',', $_ENV['ALLOWED_ORIGINS']));
}

// Allow specific origins for production, all for development
if (in_array($origin, $allowedOrigins) || $_ENV['APP_ENV'] === 'development') {
    header("Access-Control-Allow-Origin: $origin");
} else {
    header("Access-Control-Allow-Origin: *");
}
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Max-Age: 3600");

// Set security headers
header("Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none';");
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: DENY");
header("X-XSS-Protection: 1; mode=block");

// --- Handle OPTIONS Preflight Requests ---
// The browser sends an OPTIONS request first for complex requests (PUT, DELETE)
// to check CORS policy. We need to handle it and send a 200 OK response.
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit();
}

// --- Routing ---
// This simple router handles incoming requests.
$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$requestMethod = $_SERVER['REQUEST_METHOD'];

// Our router should handle paths relative to the API root.
// For example, for a request to https://connex.team/api/trucks,
// the $requestUri will be '/api/trucks'. We need to match '/trucks'.
$apiRoute = str_replace('/api', '', $requestUri);
if (empty($apiRoute)) {
    $apiRoute = '/';
}

// Route for the root/welcome message
if ($apiRoute === '/' && $requestMethod === 'GET') {
    http_response_code(200);
    echo json_encode([
        'message' => 'Connex2 API is running.',
        'version' => '1.1.0-php',
        'health_check' => '/api/health'
    ]);
    exit();
}

// Route for user login
if ($apiRoute === '/login' && $requestMethod === 'POST') {
    AuthController::login();
    exit();
}

// Driver authentication routes (no auth required)
if ($apiRoute === '/driver/login' && $requestMethod === 'POST') {
    DriverController::login();
    exit();
}

if ($apiRoute === '/driver/set-password' && $requestMethod === 'POST') {
    DriverController::setPassword();
    exit();
}

// Route for the health check.
if ($apiRoute === '/health' && $requestMethod === 'GET') {
    $dbConnection = Database::getConnection();
    $dbStatus = 'disconnected';
    $dbError = '';

    if ($dbConnection) {
        try {
            $dbConnection->query('SELECT 1');
            $dbStatus = 'connected';
        } catch (PDOException $e) {
            $dbStatus = 'error';
            $dbError = $e->getMessage();
        }
    } else {
        $dbStatus = 'error';
        $dbError = 'Failed to create PDO instance. Check server logs.';
    }

    http_response_code(200);
    echo json_encode([
        'status' => 'ok',
        'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
        'database_status' => $dbStatus,
        'database_error' => $dbError,
        'php_version' => phpversion()
    ]);
    exit();
}

// This regex will match /trucks, /trucks/ and /trucks/123
if (preg_match('/^\/trucks(\/(\d+))?\/?$/', $apiRoute, $matches)) {
    // The full ID is in $matches[2] if it exists
    $id = isset($matches[2]) ? (int)$matches[2] : null;
    
    // All truck routes require at least 'dispatcher' role
    Auth::protect(['dispatcher', 'manager', 'admin']);

    if ($id) {
        // Routes that require an ID
        if ($requestMethod === 'PUT') {
            TruckController::update($id);
            exit();
        }
        if ($requestMethod === 'DELETE') {
            TruckController::delete($id);
            exit();
        }
    } else {
        // Routes that do not require an ID
        if ($requestMethod === 'GET') {
            TruckController::getAll();
            exit();
        }
    }
}

// Route for updating a truck via POST
if ($apiRoute === '/trucks/update' && $requestMethod === 'POST') {
    Auth::protect(['dispatcher', 'manager', 'admin']); // Allow dispatchers to update
    TruckController::updateViaPost();
    exit();
}

// Route for creating a truck via POST
if ($apiRoute === '/trucks/create' && $requestMethod === 'POST') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    TruckController::create();
    exit();
}

// Route for deleting a truck via POST
if ($apiRoute === '/trucks/delete' && $requestMethod === 'POST') {
    Auth::protect(['dispatcher', 'manager', 'admin']); // Allow all roles to delete
    TruckController::deleteViaPost();
    exit();
}

// Route for getting trucks with coordinates for map
if ($apiRoute === '/trucks/map' && $requestMethod === 'GET') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    TruckController::getForMap();
    exit();
}

// Route for getting truck location history
if (preg_match('/^\/trucks\/(\d+)\/location-history$/', $apiRoute, $matches) && $requestMethod === 'GET') {
    $truckId = (int)$matches[1];
    Auth::protect(['dispatcher', 'manager', 'admin']);
    TruckController::getLocationHistory($truckId);
    exit();
}

// Route for getting truck location history count
if (preg_match('/^\/trucks\/(\d+)\/location-history\/count$/', $apiRoute, $matches) && $requestMethod === 'GET') {
    $truckId = (int)$matches[1];
    Auth::protect(['dispatcher', 'manager', 'admin']);
    TruckController::getLocationHistoryCount($truckId);
    exit();
}

// Hold functionality routes
// Route for placing a hold on a truck
if (preg_match('/^\/trucks\/(\d+)\/hold$/', $apiRoute, $matches)) {
    $truckId = (int)$matches[1];
    Auth::protect(['dispatcher', 'manager', 'admin']);
    
    if ($requestMethod === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data || !isset($data['dispatcher_id']) || !isset($data['dispatcher_name'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Dispatcher ID and name are required.']);
            exit();
        }
        TruckController::placeHold($truckId, $data['dispatcher_id'], $data['dispatcher_name']);
        exit();
    }
    
    if ($requestMethod === 'DELETE') {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data || !isset($data['dispatcher_id'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Dispatcher ID is required.']);
            exit();
        }
        TruckController::removeHold($truckId, $data['dispatcher_id']);
        exit();
    }
    
    if ($requestMethod === 'GET') {
        TruckController::getHoldInfo($truckId);
        exit();
    }
}

// Route for cleaning up expired holds
if ($apiRoute === '/trucks/hold/cleanup' && $requestMethod === 'GET') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    TruckController::cleanupExpiredHolds();
    exit();
}

// Route for getting server time and hold countdowns
if ($apiRoute === '/trucks/hold/time' && $requestMethod === 'GET') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    TruckController::getServerTimeAndHolds();
    exit();
}

// Route for the new smart search
if ($apiRoute === '/search' && $requestMethod === 'GET') {
    // Allow all authenticated users to use address search (no role restriction)
    Auth::protect();
    SearchController::search();
    exit();
}

// Route for checking recent searches by other users
if ($apiRoute === '/search/recent' && $requestMethod === 'GET') {
    // Allow all authenticated users to check recent searches
    Auth::protect();
    SearchController::getRecentSearches();
    exit();
}

// Route for reverse geocoding (coordinates to address) - PROTECTED FOR DISPATCHERS
if ($apiRoute === '/search/reverse' && $requestMethod === 'GET') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    SearchController::reverseGeocode();
    exit();
}

// Route for driver reverse geocoding (coordinates to address) - PROTECTED
if ($apiRoute === '/driver/reverse-geocode' && $requestMethod === 'GET') {
    SearchController::driverReverseGeocode();
    exit();
}

// Route for calculating distance
if ($apiRoute === '/distance' && $requestMethod === 'POST') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    DistanceController::process();
    exit();
}

// Route for batch processing distance
if ($apiRoute === '/distance/batch' && $requestMethod === 'POST') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    DistanceController::batchProcess();
    exit();
}

// Route for distance cache check
if ($apiRoute === '/distance/cache-check' && $requestMethod === 'POST') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    (new App\Controllers\DistanceController())->checkCacheBatch();
    exit();
}

// User Management Routes (Protected for admins only)
if ($apiRoute === '/users' && $requestMethod === 'GET') {
    Auth::protect(['admin']);
    UserController::getAll();
    exit();
}

if ($apiRoute === '/users' && $requestMethod === 'POST') {
    Auth::protect(['admin']);
    UserController::create();
    exit();
}

if (preg_match('/^\/users\/(\d+)$/', $apiRoute, $matches) && $requestMethod === 'PUT') {
    $id = (int)$matches[1];
    Auth::protect(['admin']);
    UserController::update($id);
    exit();
}

if (preg_match('/^\/users\/(\d+)$/', $apiRoute, $matches) && $requestMethod === 'DELETE') {
    $id = (int)$matches[1];
    Auth::protect(['admin']);
    UserController::delete($id);
    exit();
}

// Get Dispatchers Route (Protected for dispatchers, managers, admins)
if ($apiRoute === '/users/dispatchers' && $requestMethod === 'GET') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    UserController::getDispatchers();
    exit();
}

// Analytics Route (Protected)
if ($apiRoute === '/dashboard/analytics' && $requestMethod === 'GET') {
    Auth::protect(['manager', 'admin']);
    DashboardController::getAnalytics();
    exit();
}

// Dispatcher Dashboard Route (Protected for dispatchers, managers, admins)
if ($apiRoute === '/dispatcher/dashboard' && $requestMethod === 'GET') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    DispatcherDashboardController::getDashboardData();
    exit();
}

// Session Management Route (Admins only)
if ($apiRoute === '/dashboard/session-management' && $requestMethod === 'GET') {
    Auth::protect(['admin']);
    DashboardController::getSessionManagement();
    exit();
}

// Logout User Route (Admins only)
if ($apiRoute === '/dashboard/logout-user' && $requestMethod === 'POST') {
    Auth::protect(['admin']);
    DashboardController::logoutUser();
    exit();
}

// Driver protected routes (require driver JWT token)
if ($apiRoute === '/driver/profile' && $requestMethod === 'GET') {
    DriverController::getProfile();
    exit();
}

if ($apiRoute === '/driver/activity-logs' && $requestMethod === 'GET') {
    DriverController::getActivityLogs();
    exit();
}

if ($apiRoute === '/driver/location' && $requestMethod === 'POST') {
    DriverController::updateLocation();
    exit();
}

if ($apiRoute === '/driver/fcm-token' && $requestMethod === 'POST') {
    DriverController::updateFCMToken();
    exit();
}

// Driver load offer routes
if ($apiRoute === '/driver/load-offers' && $requestMethod === 'GET') {
    LoadOfferController::getDriverOffers();
    exit();
}

if ($apiRoute === '/driver/load-offers/respond' && $requestMethod === 'POST') {
    LoadOfferController::respondToOffer();
    exit();
}

// Dispatcher load management routes
if ($apiRoute === '/loads' && $requestMethod === 'POST') {
    LoadOfferController::createLoad();
    exit();
}

if ($apiRoute === '/loads' && $requestMethod === 'GET') {
    LoadOfferController::getAllLoadsWithOffers();
    exit();
}

if ($apiRoute === '/loads/send-offers' && $requestMethod === 'POST') {
    LoadOfferController::sendOfferToDrivers();
    exit();
}

if (preg_match('/^\/loads\/(\d+)\/offers$/', $apiRoute, $matches) && $requestMethod === 'GET') {
    $loadId = (int)$matches[1];
    LoadOfferController::getLoadOffers($loadId);
    exit();
}

// Driver status update route
if ($apiRoute === '/driver/status' && $requestMethod === 'POST') {
    DriverController::updateStatus();
    exit();
}

// === NEW ROUTES FOR HIERARCHICAL INTERFACE ===

// Level 1: List of all loads with summary information
if ($apiRoute === '/loads/hierarchy' && $requestMethod === 'GET') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    (new LoadHierarchyController())->getLoadsHierarchy();
    exit();
}

// Level 2: List of drivers for specific load
if (preg_match('/^\/loads\/(\d+)\/drivers$/', $apiRoute, $matches) && $requestMethod === 'GET') {
    $loadId = (int)$matches[1];
    Auth::protect(['dispatcher', 'manager', 'admin']);
    (new LoadHierarchyController())->getLoadDrivers($loadId);
    exit();
}

// Level 3: Chat with specific driver
if (preg_match('/^\/loads\/(\d+)\/drivers\/(\d+)\/chat$/', $apiRoute, $matches) && $requestMethod === 'GET') {
    $loadId = (int)$matches[1];
    $driverId = (int)$matches[2];
    Auth::protect(['dispatcher', 'manager', 'admin']);
    (new LoadHierarchyController())->getLoadDriverChat($loadId, $driverId);
    exit();
}

// Send message to chat
if ($apiRoute === '/chat/messages' && $requestMethod === 'POST') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    (new LoadHierarchyController())->sendMessage();
    exit();
}

// Accept/reject driver offer
if ($apiRoute === '/offers/respond' && $requestMethod === 'POST') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    (new LoadHierarchyController())->respondToOffer();
    exit();
}

// === NEW ROUTES FOR DISTANCE WORK (USES driver_distances) ===

// Bulk distance calculation for new load
if (preg_match('/^\/loads\/(\d+)\/calculate-distances$/', $apiRoute, $matches) && $requestMethod === 'POST') {
    $loadId = (int)$matches[1];
    (new DistanceController())->calculateDistancesForLoad($loadId);
    exit();
}

// Distance cache statistics
if ($apiRoute === '/distances/cache-stats' && $requestMethod === 'GET') {
    (new DistanceController())->getCacheStats();
    exit();
}

// Clear distance cache
if ($apiRoute === '/distances/cache-cleanup' && $requestMethod === 'POST') {
    (new DistanceController())->cleanupCache();
    exit();
}

// === DRIVER UPDATES ROUTES ===

// Get driver update statuses (Daily Updates and Monthly Review)
if ($apiRoute === '/driver-updates/status' && $requestMethod === 'GET') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    DriverUpdatesController::getDriverStatuses();
    exit();
}

// Update driver no_need_update status
if (preg_match('/^\/trucks\/(\d+)\/update-no-need-status$/', $apiRoute, $matches) && $requestMethod === 'POST') {
    $truckId = (int)$matches[1];
    Auth::protect(['dispatcher', 'manager', 'admin']);
    DriverUpdatesController::updateNoNeedStatus($truckId);
    exit();
}

// Clear driver no_need_update status
if (preg_match('/^\/trucks\/(\d+)\/clear-no-need-status$/', $apiRoute, $matches) && $requestMethod === 'POST') {
    $truckId = (int)$matches[1];
    Auth::protect(['dispatcher', 'manager', 'admin']);
    DriverUpdatesController::clearNoNeedStatus($truckId);
    exit();
}

// Auto-update driver statuses when page loads
if ($apiRoute === '/driver-updates/auto-update' && $requestMethod === 'POST') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    DriverUpdatesController::autoUpdateDriverStatuses();
    exit();
}

// Get driver updates heatmap data
if ($apiRoute === '/driver-updates/heatmap' && $requestMethod === 'GET') {
    Auth::protect(['dispatcher', 'manager', 'admin']);
    DriverUpdatesController::getDriverUpdatesHeatmap();
    exit();
}

// === EXTENDED ROUTES FOR MOBILE APP ===

// List of available offers for driver
if ($apiRoute === '/driver/offers' && $requestMethod === 'GET') {
    DriverController::getOffers();
    exit();
}

// View offer details (automatically updates status to 'viewed')
if (preg_match('/^\/driver\/offers\/(\d+)$/', $apiRoute, $matches) && $requestMethod === 'GET') {
    $offerId = (int)$matches[1];
    DriverController::getOfferDetails($offerId);
    exit();
}

// Price proposal from driver
if (preg_match('/^\/driver\/offers\/(\d+)\/propose-price$/', $apiRoute, $matches) && $requestMethod === 'POST') {
    $offerId = (int)$matches[1];
    DriverController::proposePrice($offerId);
    exit();
}

// Send message from driver
if ($apiRoute === '/driver/chat/send' && $requestMethod === 'POST') {
    DriverController::sendChatMessage();
    exit();
}

// Get messages for driver
if (preg_match('/^\/driver\/offers\/(\d+)\/messages$/', $apiRoute, $matches) && $requestMethod === 'GET') {
    $offerId = (int)$matches[1];
    DriverController::getChatMessages($offerId);
    exit();
}

// --- 404 Not Found ---
http_response_code(404);
echo json_encode([
    'error' => 'Not Found',
    'message' => "The requested API route '{$apiRoute}' was not found on this server."
]);
exit(); 