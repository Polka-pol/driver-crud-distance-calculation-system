<?php
/**
 * Database Analysis Script for Supabase Migration
 * This script analyzes the current MySQL database structure
 * to prepare for complete migration to Supabase
 */

// Database connection
$host = "dr542239.mysql.tools";
$port = "3306";
$dbname = "dr542239_db";
$username = "dr542239_db";
$password = "4WYhhUgU";

try {
    $pdo = new PDO("mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    echo "=== DATABASE MIGRATION ANALYSIS ===\n\n";
    
    // 1. Analyze users table
    echo "1. USERS TABLE ANALYSIS:\n";
    echo "========================\n";
    
    $stmt = $pdo->query("DESCRIBE users");
    $userColumns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "Users table structure:\n";
    foreach ($userColumns as $column) {
        echo "- {$column['Field']}: {$column['Type']} " . 
             ($column['Null'] === 'NO' ? 'NOT NULL' : 'NULL') . 
             ($column['Key'] ? " ({$column['Key']})" : '') . "\n";
    }
    
    $stmt = $pdo->query("SELECT COUNT(*) as total FROM users");
    $userCount = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "\nTotal users: {$userCount['total']}\n";
    
    $stmt = $pdo->query("SELECT role, COUNT(*) as count FROM users GROUP BY role");
    $roleStats = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "Users by role:\n";
    foreach ($roleStats as $role) {
        echo "- {$role['role']}: {$role['count']}\n";
    }
    
    // Check for email uniqueness
    $stmt = $pdo->query("SELECT email, COUNT(*) as count FROM users GROUP BY email HAVING count > 1");
    $duplicateEmails = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (count($duplicateEmails) > 0) {
        echo "\n⚠️  DUPLICATE EMAILS FOUND:\n";
        foreach ($duplicateEmails as $dup) {
            echo "- {$dup['email']}: {$dup['count']} users\n";
        }
    } else {
        echo "\n✅ All emails are unique\n";
    }
    
    // 2. Analyze activity_logs table
    echo "\n2. ACTIVITY_LOGS TABLE ANALYSIS:\n";
    echo "=================================\n";
    
    $stmt = $pdo->query("DESCRIBE activity_logs");
    $logColumns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "Activity_logs table structure:\n";
    foreach ($logColumns as $column) {
        echo "- {$column['Field']}: {$column['Type']} " . 
             ($column['Null'] === 'NO' ? 'NOT NULL' : 'NULL') . 
             ($column['Key'] ? " ({$column['Key']})" : '') . "\n";
    }
    
    $stmt = $pdo->query("SELECT COUNT(*) as total FROM activity_logs");
    $logCount = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "\nTotal activity logs: {$logCount['total']}\n";
    
    $stmt = $pdo->query("SELECT COUNT(DISTINCT user_id) as unique_users FROM activity_logs");
    $uniqueUsers = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "Unique users in logs: {$uniqueUsers['unique_users']}\n";
    
    // Check for orphaned logs (logs without corresponding users)
    $stmt = $pdo->query("
        SELECT COUNT(*) as orphaned_logs 
        FROM activity_logs al 
        LEFT JOIN users u ON al.user_id = u.id 
        WHERE u.id IS NULL
    ");
    $orphanedLogs = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($orphanedLogs['orphaned_logs'] > 0) {
        echo "⚠️  Orphaned logs (no user): {$orphanedLogs['orphaned_logs']}\n";
    } else {
        echo "✅ All logs have corresponding users\n";
    }
    
    // 3. Find all tables with user_id references
    echo "\n3. TABLES WITH USER_ID REFERENCES:\n";
    echo "===================================\n";
    
    $stmt = $pdo->query("
        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE COLUMN_NAME LIKE '%user_id%' 
        AND TABLE_SCHEMA = '$dbname'
        ORDER BY TABLE_NAME, COLUMN_NAME
    ");
    $userIdColumns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $tableStats = [];
    foreach ($userIdColumns as $column) {
        $tableName = $column['TABLE_NAME'];
        $columnName = $column['COLUMN_NAME'];
        
        echo "- {$tableName}.{$columnName} ({$column['DATA_TYPE']})\n";
        
        // Count records in each table
        try {
            $countStmt = $pdo->query("SELECT COUNT(*) as count FROM `$tableName`");
            $count = $countStmt->fetch(PDO::FETCH_ASSOC);
            $tableStats[$tableName] = $count['count'];
        } catch (Exception $e) {
            $tableStats[$tableName] = "Error: " . $e->getMessage();
        }
    }
    
    echo "\nRecord counts by table:\n";
    foreach ($tableStats as $table => $count) {
        echo "- $table: $count records\n";
    }
    
    // 4. Sample user data for migration planning
    echo "\n4. SAMPLE USER DATA FOR MIGRATION:\n";
    echo "===================================\n";
    
    $stmt = $pdo->query("
        SELECT id, email, username, full_name, role, created_at 
        FROM users 
        ORDER BY created_at 
        LIMIT 5
    ");
    $sampleUsers = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "Sample users (first 5):\n";
    foreach ($sampleUsers as $user) {
        echo "- ID: {$user['id']}, Email: {$user['email']}, Username: {$user['username']}, Role: {$user['role']}\n";
    }
    
    // 5. Check for other important tables
    echo "\n5. ALL TABLES IN DATABASE:\n";
    echo "==========================\n";
    
    $stmt = $pdo->query("SHOW TABLES");
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    foreach ($tables as $table) {
        $countStmt = $pdo->query("SELECT COUNT(*) as count FROM `$table`");
        $count = $countStmt->fetch(PDO::FETCH_ASSOC);
        echo "- $table: {$count['count']} records\n";
    }
    
    echo "\n=== ANALYSIS COMPLETE ===\n";
    echo "Next steps:\n";
    echo "1. Review duplicate emails if any\n";
    echo "2. Plan migration for tables with user_id references\n";
    echo "3. Create user mapping strategy\n";
    echo "4. Prepare Supabase user creation script\n";
    
} catch (PDOException $e) {
    echo "Database connection failed: " . $e->getMessage() . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
