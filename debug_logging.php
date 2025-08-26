<?php
/**
 * Debug script to test logging for Supabase-only users
 * Run this to verify that activity_logs and distance_log entries are created
 */

require_once __DIR__ . '/api/src/Core/Database.php';
require_once __DIR__ . '/api/src/Core/Logger.php';
require_once __DIR__ . '/api/src/Core/ActivityLogger.php';
require_once __DIR__ . '/api/src/Core/UserService.php';
require_once __DIR__ . '/api/src/Core/HybridAuth.php';
require_once __DIR__ . '/api/src/Core/SupabaseAuth.php';
require_once __DIR__ . '/api/src/Controllers/DistanceController.php';

use App\Core\Database;
use App\Core\Logger;
use App\Core\ActivityLogger;
use App\Core\UserService;

echo "=== Debug Logging for Supabase Users ===\n\n";

// Test 1: Check database schema
echo "1. Checking database schema...\n";
try {
    $pdo = Database::getConnection();
    
    // Check activity_logs table
    $stmt = $pdo->query("DESCRIBE activity_logs");
    $activityColumns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "activity_logs columns:\n";
    foreach ($activityColumns as $col) {
        echo "  - {$col['Field']}: {$col['Type']} (NULL: {$col['Null']})\n";
    }
    
    echo "\n";
    
    // Check distance_log table
    $stmt = $pdo->query("DESCRIBE distance_log");
    $distanceColumns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "distance_log columns:\n";
    foreach ($distanceColumns as $col) {
        echo "  - {$col['Field']}: {$col['Type']} (NULL: {$col['Null']})\n";
    }
    
} catch (Exception $e) {
    echo "Database schema check failed: " . $e->getMessage() . "\n";
}

echo "\n2. Testing UserService helpers...\n";

// Test 2: Create mock Supabase user
$mockSupabaseUser = (object) [
    'id' => '550e8400-e29b-41d4-a716-446655440000', // UUID format
    'email' => 'test@supabase.com',
    'role' => 'dispatcher',
    'full_name' => 'Test Supabase User'
];

echo "Mock Supabase user ID: {$mockSupabaseUser->id}\n";
echo "Is Supabase user: " . (UserService::isSupabaseUser($mockSupabaseUser) ? 'YES' : 'NO') . "\n";
echo "MySQL ID: " . (UserService::getMysqlId($mockSupabaseUser) ?? 'NULL') . "\n";
echo "Supabase ID: " . (UserService::getSupabaseId($mockSupabaseUser) ?? 'NULL') . "\n";

// Test 3: Create mock MySQL user
$mockMysqlUser = (object) [
    'id' => 123,
    'email' => 'test@mysql.com',
    'role' => 'dispatcher',
    'full_name' => 'Test MySQL User'
];

echo "\nMock MySQL user ID: {$mockMysqlUser->id}\n";
echo "Is Supabase user: " . (UserService::isSupabaseUser($mockMysqlUser) ? 'YES' : 'NO') . "\n";
echo "MySQL ID: " . (UserService::getMysqlId($mockMysqlUser) ?? 'NULL') . "\n";
echo "Supabase ID: " . (UserService::getSupabaseId($mockMysqlUser) ?? 'NULL') . "\n";

echo "\n3. Testing direct database inserts...\n";

// Test 4: Direct database insert for Supabase user
try {
    $pdo = Database::getConnection();
    
    // Test activity_logs insert
    $stmt = $pdo->prepare("INSERT INTO activity_logs (user_id, supabase_user_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())");
    $result = $stmt->execute([
        null, // user_id (NULL for Supabase-only users)
        $mockSupabaseUser->id, // supabase_user_id
        'debug_test_supabase_user',
        json_encode(['test' => 'supabase_only_user'])
    ]);
    
    if ($result) {
        echo "✓ activity_logs insert for Supabase user: SUCCESS\n";
        echo "  Last insert ID: " . $pdo->lastInsertId() . "\n";
    } else {
        echo "✗ activity_logs insert for Supabase user: FAILED\n";
    }
    
    // Test distance_log insert
    $stmt = $pdo->prepare("INSERT INTO distance_log (user_id, supabase_user_id, source_address, total_origins, cache_hits, mapbox_requests, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())");
    $result = $stmt->execute([
        null, // user_id (NULL for Supabase-only users)
        $mockSupabaseUser->id, // supabase_user_id
        'Test Destination',
        10,
        5,
        5
    ]);
    
    if ($result) {
        echo "✓ distance_log insert for Supabase user: SUCCESS\n";
        echo "  Last insert ID: " . $pdo->lastInsertId() . "\n";
    } else {
        echo "✗ distance_log insert for Supabase user: FAILED\n";
    }
    
} catch (Exception $e) {
    echo "✗ Database insert test failed: " . $e->getMessage() . "\n";
}

echo "\n4. Checking recent logs...\n";

// Test 5: Check recent logs
try {
    $pdo = Database::getConnection();
    
    // Check recent activity_logs
    $stmt = $pdo->query("SELECT * FROM activity_logs WHERE supabase_user_id IS NOT NULL ORDER BY created_at DESC LIMIT 5");
    $activityLogs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "Recent activity_logs with supabase_user_id:\n";
    foreach ($activityLogs as $log) {
        echo "  - ID: {$log['id']}, Action: {$log['action']}, Supabase ID: {$log['supabase_user_id']}, Created: {$log['created_at']}\n";
    }
    
    // Check recent distance_log
    $stmt = $pdo->query("SELECT * FROM distance_log WHERE supabase_user_id IS NOT NULL ORDER BY created_at DESC LIMIT 5");
    $distanceLogs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "\nRecent distance_log with supabase_user_id:\n";
    foreach ($distanceLogs as $log) {
        echo "  - ID: {$log['id']}, Address: {$log['source_address']}, Supabase ID: {$log['supabase_user_id']}, Created: {$log['created_at']}\n";
    }
    
} catch (Exception $e) {
    echo "Recent logs check failed: " . $e->getMessage() . "\n";
}

echo "\n=== Debug Complete ===\n";
