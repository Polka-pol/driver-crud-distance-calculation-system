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
use App\Controllers\AuthController;
use App\Controllers\UserController;
use App\Controllers\DashboardController;
use App\Controllers\DispatcherDashboardController;
use App\Controllers\DriverController;
use App\Controllers\DriverUpdatesController;
use App\Controllers\SettingsController;
use App\Core\Auth;
use App\Controllers\RbacController;
use App\Core\Authz;

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

// Attach global time headers for all JSON responses downstream
function attach_time_headers() {
    try {
        $tz = App\Core\SettingsService::getActiveTimezone();
        $nowUtc = (new DateTime('now', new DateTimeZone('UTC')))->format(DATE_ATOM);
        header('X-App-Timezone: ' . $tz);
        header('X-Server-Now: ' . $nowUtc);
    } catch (\Throwable $e) {
        // no-op
    }
}

// Route for the root/welcome message
if ($apiRoute === '/' && $requestMethod === 'GET') {
    http_response_code(200);
    attach_time_headers();
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
    attach_time_headers();
    echo json_encode([
        'status' => 'ok',
        'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
        'database_status' => $dbStatus,
        'database_error' => $dbError,
        'php_version' => phpversion()
    ]);
    exit();
}

// Settings: get active timezone
if ($apiRoute === '/settings/timezone' && $requestMethod === 'GET') {
    SettingsController::getTimezone();
    exit();
}

// Settings: update active timezone (admin only)
if ($apiRoute === '/settings/timezone' && $requestMethod === 'PUT') {
    Auth::protect();
    App\Core\Authz::require('settings.timezone.update');
    SettingsController::updateTimezone();
    exit();
}

// Server time endpoint
if ($apiRoute === '/server-time' && $requestMethod === 'GET') {
    SettingsController::getServerTime();
    exit();
}

// Settings: get last timezone change
if ($apiRoute === '/settings/timezone/last-change' && $requestMethod === 'GET') {
    Auth::protect();
    Authz::require('settings.timezone.view');
    SettingsController::getTimezoneLastChange();
    exit();
}

// This regex will match /trucks, /trucks/ and /trucks/123
if (preg_match('/^\/trucks(\/(\d+))?\/?$/', $apiRoute, $matches)) {
    // The full ID is in $matches[2] if it exists
    $id = isset($matches[2]) ? (int)$matches[2] : null;
    
    // All truck routes require authentication; permissions validated per action
    Auth::protect();

    if ($id) {
        // Routes that require an ID
        if ($requestMethod === 'PUT') {
            App\Core\Authz::require('trucks.update');
            TruckController::update($id);
            exit();
        }
        if ($requestMethod === 'DELETE') {
            App\Core\Authz::require('trucks.delete');
            TruckController::delete($id);
            exit();
        }
    } else {
        // Routes that do not require an ID
        if ($requestMethod === 'GET') {
            App\Core\Authz::require('trucks.read');
            TruckController::getAll();
            exit();
        }
    }
}

// Route for updating a truck via POST
if ($apiRoute === '/trucks/update' && $requestMethod === 'POST') {
    Auth::protect();
    App\Core\Authz::require('trucks.update');
    TruckController::updateViaPost();
    exit();
}

// Route for creating a truck via POST
if ($apiRoute === '/trucks/create' && $requestMethod === 'POST') {
    Auth::protect();
    App\Core\Authz::require('trucks.create');
    TruckController::create();
    exit();
}

// Route for deleting a truck via POST
if ($apiRoute === '/trucks/delete' && $requestMethod === 'POST') {
    Auth::protect();
    App\Core\Authz::require('trucks.delete');
    TruckController::deleteViaPost();
    exit();
}

// Route for getting trucks with coordinates for map
if ($apiRoute === '/trucks/map' && $requestMethod === 'GET') {
    Auth::protect();
    Authz::require('trucks.map.view');
    TruckController::getForMap();
    exit();
}

// Route for getting truck location history
if (preg_match('/^\/trucks\/(\d+)\/location-history$/', $apiRoute, $matches) && $requestMethod === 'GET') {
    $truckId = (int)$matches[1];
    $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
    
    Auth::protect();
    Authz::require('trucks.history.read');
    TruckController::getLocationHistory($truckId, $page, $limit);
    exit();
}

// Route for getting comprehensive truck activity history (location, status, WhenWillBeThere)
if (preg_match('/^\/trucks\/(\d+)\/activity-history$/', $apiRoute, $matches) && $requestMethod === 'GET') {
    $truckId = (int)$matches[1];
    $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
    
    Auth::protect();
    Authz::require('trucks.history.read');
    TruckController::getTruckActivityHistory($truckId, $page, $limit);
    exit();
}

// Route for getting truck location history count
if (preg_match('/^\/trucks\/(\d+)\/location-history\/count$/', $apiRoute, $matches) && $requestMethod === 'GET') {
    $truckId = (int)$matches[1];
    Auth::protect();
    Authz::require('trucks.history.read');
    TruckController::getLocationHistoryCount($truckId);
    exit();
}

// Hold functionality routes
// Route for placing a hold on a truck
if (preg_match('/^\/trucks\/(\d+)\/hold$/', $apiRoute, $matches)) {
    $truckId = (int)$matches[1];
    Auth::protect();
    
    if ($requestMethod === 'POST') {
        App\Core\Authz::require('trucks.hold.manage');
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data || !isset($data['dispatcher_id']) || !isset($data['dispatcher_name'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Dispatcher ID and name are required.']);
            exit();
        }
        Authz::require('trucks.hold.manage');
        TruckController::placeHold($truckId, $data['dispatcher_id'], $data['dispatcher_name']);
        exit();
    }
    
    if ($requestMethod === 'DELETE') {
        App\Core\Authz::require('trucks.hold.manage');
        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data || !isset($data['dispatcher_id'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Dispatcher ID is required.']);
            exit();
        }
        Authz::require('trucks.hold.manage');
        TruckController::removeHold($truckId, $data['dispatcher_id']);
        exit();
    }
    
    if ($requestMethod === 'GET') {
        Authz::requireAny(['trucks.hold.manage','trucks.read']);
        TruckController::getHoldInfo($truckId);
        exit();
    }
}

// Route for cleaning up expired holds
if ($apiRoute === '/trucks/hold/cleanup' && $requestMethod === 'GET') {
    Auth::protect();
    Authz::require('trucks.hold.manage');
    TruckController::cleanupExpiredHolds();
    exit();
}

// Route for getting server time and hold countdowns
if ($apiRoute === '/trucks/hold/time' && $requestMethod === 'GET') {
    Auth::protect();
    Authz::requireAny(['trucks.hold.manage','trucks.read']);
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
    Auth::protect();
    Authz::require('search.reverse');
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
    Auth::protect();
    Authz::require('distance.process');
    DistanceController::process();
    exit();
}

// Route for batch processing distance
if ($apiRoute === '/distance/batch' && $requestMethod === 'POST') {
    Auth::protect();
    Authz::require('distance.batch');
    DistanceController::batchProcess();
    exit();
}

// Route for distance cache check
if ($apiRoute === '/distance/cache-check' && $requestMethod === 'POST') {
    Auth::protect();
    Authz::require('distance.cache.check');
    (new App\Controllers\DistanceController())->checkCacheBatch();
    exit();
}

// Route for logging distance statistics
if ($apiRoute === '/distance/log-stats' && $requestMethod === 'POST') {
    Auth::protect();
    Authz::require('distance.cache.log');
    (new App\Controllers\DistanceController())->logStats();
    exit();
}

// User Management Routes (Protected for admins only)
if ($apiRoute === '/users' && $requestMethod === 'GET') {
    Auth::protect();
    Authz::require('users.manage');
    UserController::getAll();
    exit();
}

if ($apiRoute === '/users' && $requestMethod === 'POST') {
    Auth::protect();
    Authz::require('users.manage');
    UserController::create();
    exit();
}

if (preg_match('/^\/users\/(\d+)$/', $apiRoute, $matches) && $requestMethod === 'PUT') {
    $id = (int)$matches[1];
    Auth::protect();
    Authz::require('users.manage');
    UserController::update($id);
    exit();
}

if (preg_match('/^\/users\/(\d+)$/', $apiRoute, $matches) && $requestMethod === 'DELETE') {
    $id = (int)$matches[1];
    Auth::protect();
    Authz::require('users.manage');
    UserController::delete($id);
    exit();
}

// Get Dispatchers Route (Protected for dispatchers, managers, admins)
if ($apiRoute === '/users/dispatchers' && $requestMethod === 'GET') {
    Auth::protect();
    Authz::require('users.dispatchers.read');
    UserController::getDispatchers();
    exit();
}

// Analytics Route (Protected)
if ($apiRoute === '/dashboard/analytics' && $requestMethod === 'GET') {
    Auth::protect();
    Authz::require('dashboard.analytics.view');
    DashboardController::getAnalytics();
    exit();
}

// Dispatcher Dashboard Route (Protected for dispatchers, managers, admins)
if ($apiRoute === '/dispatcher/dashboard' && $requestMethod === 'GET') {
    Auth::protect();
    Authz::require('dashboard.dispatcher.view');
    DispatcherDashboardController::getDashboardData();
    exit();
}

// Session Management Route (Admins only)
if ($apiRoute === '/dashboard/session-management' && $requestMethod === 'GET') {
    Auth::protect();
    Authz::require('sessions.manage');
    DashboardController::getSessionManagement();
    exit();
}

// Logout User Route (Admins only)
if ($apiRoute === '/dashboard/logout-user' && $requestMethod === 'POST') {
    Auth::protect();
    Authz::require('sessions.manage');
    DashboardController::logoutUser();
    exit();
}

// RBAC audit logs
if ($apiRoute === '/dashboard/rbac-logs' && $requestMethod === 'GET') {
    Auth::protect();
    Authz::require('rbac.roles.manage');
    DashboardController::getRbacLogs();
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



// Driver status update route
if ($apiRoute === '/driver/status' && $requestMethod === 'POST') {
    DriverController::updateStatus();
    exit();
}



// === NEW ROUTES FOR DISTANCE WORK (USES driver_distances) ===

// Bulk distance calculation for new load
if (preg_match('/^\/loads\/(\d+)\/calculate-distances$/', $apiRoute, $matches) && $requestMethod === 'POST') {
    $loadId = (int)$matches[1];
    Auth::protect();
    App\Core\Authz::require('distance.batch');
    (new DistanceController())->calculateDistancesForLoad($loadId);
    exit();
}

// Distance cache statistics
if ($apiRoute === '/distances/cache-stats' && $requestMethod === 'GET') {
    Auth::protect();
    App\Core\Authz::require('distance.cache.stats');
    (new DistanceController())->getCacheStats();
    exit();
}

// Clear distance cache
if ($apiRoute === '/distances/cache-cleanup' && $requestMethod === 'POST') {
    Auth::protect();
    App\Core\Authz::require('distance.cache.cleanup');
    (new DistanceController())->cleanupCache();
    exit();
}

// === DRIVER UPDATES ROUTES ===

// Get driver update statuses (Daily Updates and Monthly Review)
if ($apiRoute === '/driver-updates/status' && $requestMethod === 'GET') {
    Auth::protect();
    Authz::require('driver.updates.view');
    DriverUpdatesController::getDriverStatuses();
    exit();
}

// Update driver no_need_update status
if (preg_match('/^\/trucks\/(\d+)\/update-no-need-status$/', $apiRoute, $matches) && $requestMethod === 'POST') {
    $truckId = (int)$matches[1];
    Auth::protect();
    Authz::require('driver.updates.modify');
    DriverUpdatesController::updateNoNeedStatus($truckId);
    exit();
}

// Clear driver no_need_update status
if (preg_match('/^\/trucks\/(\d+)\/clear-no-need-status$/', $apiRoute, $matches) && $requestMethod === 'POST') {
    $truckId = (int)$matches[1];
    Auth::protect();
    Authz::require('driver.updates.modify');
    DriverUpdatesController::clearNoNeedStatus($truckId);
    exit();
}

// Auto-update driver statuses when page loads
if ($apiRoute === '/driver-updates/auto-update' && $requestMethod === 'POST') {
    Auth::protect();
    Authz::require('driver.updates.modify');
    DriverUpdatesController::autoUpdateDriverStatuses();
    exit();
}

// Get driver updates heatmap data
if ($apiRoute === '/driver-updates/heatmap' && $requestMethod === 'GET') {
    Auth::protect();
    Authz::require('driver.updates.view');
    DriverUpdatesController::getDriverUpdatesHeatmap();
    exit();
}

// === RBAC MANAGEMENT ENDPOINTS ===
if ($apiRoute === '/rbac/permissions' && $requestMethod === 'GET') {
    Auth::protect();
    Authz::require('rbac.permissions.manage');
    RbacController::getPermissionsCatalog();
    exit();
}

if ($apiRoute === '/rbac/roles' && $requestMethod === 'GET') {
    Auth::protect();
    Authz::require('rbac.roles.manage');
    RbacController::getRoles();
    exit();
}

if ($apiRoute === '/rbac/roles' && $requestMethod === 'POST') {
    Auth::protect();
    Authz::require('rbac.roles.manage');
    RbacController::createRole();
    exit();
}

if (preg_match('/^\/rbac\/roles\/(\d+)$/', $apiRoute, $matches) && $requestMethod === 'PUT') {
    Auth::protect();
    Authz::require('rbac.roles.manage');
    RbacController::updateRole((int)$matches[1]);
    exit();
}

if (preg_match('/^\/rbac\/roles\/(\d+)$/', $apiRoute, $matches) && $requestMethod === 'DELETE') {
    Auth::protect();
    Authz::require('rbac.roles.manage');
    RbacController::deleteRole((int)$matches[1]);
    exit();
}

if (preg_match('/^\/rbac\/roles\/(\d+)\/permissions$/', $apiRoute, $matches) && $requestMethod === 'GET') {
    Auth::protect();
    Authz::require('rbac.permissions.manage');
    RbacController::getRolePermissions((int)$matches[1]);
    exit();
}

if (preg_match('/^\/rbac\/roles\/(\d+)\/permissions$/', $apiRoute, $matches) && $requestMethod === 'PUT') {
    Auth::protect();
    Authz::require('rbac.permissions.manage');
    RbacController::setRolePermissions((int)$matches[1]);
    exit();
}

// Current user permissions endpoint
if ($apiRoute === '/me/permissions' && $requestMethod === 'GET') {
    RbacController::mePermissions();
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