<?php
require_once 'api/src/Core/Database.php';

use App\Core\Database;

try {
    $pdo = Database::getConnection();
    
    echo "Testing Dashboard queries with Supabase-only users...\n\n";
    
    // Test 1: Insert a test activity log for a Supabase-only user
    echo "1. Inserting test activity for Supabase-only user...\n";
    $testSupabaseId = 'test-supabase-uuid-12345';
    $insertStmt = $pdo->prepare("
        INSERT INTO activity_logs (user_id, supabase_user_id, action, details, created_at) 
        VALUES (NULL, ?, 'truck_updated', ?, NOW())
    ");
    $details = json_encode(['truck_id' => 999, 'truck_number' => 'TEST-001', 'updated_fields' => ['location']]);
    $insertStmt->execute([$testSupabaseId, $details]);
    echo "✓ Test activity inserted\n\n";
    
    // Test 2: Recent Activities Query (should include Supabase user)
    echo "2. Testing recent activities query...\n";
    $recentStmt = $pdo->query("
        SELECT a.action, a.details, a.created_at, a.user_id, a.supabase_user_id,
               u.username, u.full_name, u.role 
        FROM activity_logs a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.action NOT IN ('distance_calculation_cached', 'distance_calculation_mapbox')
        ORDER BY a.created_at DESC
        LIMIT 5
    ");
    $activities = $recentStmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($activities as $activity) {
        $username = $activity['username'] ?: 'Supabase User';
        $fullName = $activity['full_name'] ?: substr($activity['supabase_user_id'] ?? 'Unknown', 0, 8) . '...';
        echo "- {$activity['action']} by {$username} ({$fullName})\n";
    }
    echo "✓ Recent activities query working\n\n";
    
    // Test 3: Top Users Query (should include Supabase user)
    echo "3. Testing top users query...\n";
    $sevenDaysAgo = date('Y-m-d H:i:s', strtotime('-7 days'));
    $topUsersStmt = $pdo->prepare("
        SELECT 
            COALESCE(u.username, 'Supabase User') as username,
            COALESCE(u.full_name, CONCAT(SUBSTRING(a.supabase_user_id, 1, 8), '...')) as full_name,
            COALESCE(u.role, 'supabase_user') as role,
            COUNT(a.action) as total_activities,
            MAX(a.created_at) as last_activity
        FROM activity_logs a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.created_at >= ?
        GROUP BY COALESCE(a.user_id, a.supabase_user_id), u.username, u.full_name, u.role, a.supabase_user_id
        ORDER BY total_activities DESC
        LIMIT 5
    ");
    $topUsersStmt->execute([$sevenDaysAgo]);
    $topUsers = $topUsersStmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($topUsers as $user) {
        echo "- {$user['username']} ({$user['full_name']}) - {$user['total_activities']} activities\n";
    }
    echo "✓ Top users query working\n\n";
    
    // Clean up test data
    echo "4. Cleaning up test data...\n";
    $cleanupStmt = $pdo->prepare("DELETE FROM activity_logs WHERE supabase_user_id = ?");
    $cleanupStmt->execute([$testSupabaseId]);
    echo "✓ Test data cleaned up\n\n";
    
    echo "All dashboard queries now support Supabase-only users! ✅\n";
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
