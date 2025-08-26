<?php
require_once 'api/src/Core/Database.php';

use App\Core\Database;

try {
    $pdo = Database::getConnection();
    
    // Check if user exists in MySQL
    $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->execute(['vlad.polishuk.biz@gmail.com']);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    echo "=== USER CHECK ===\n";
    if ($user) {
        echo "User found in MySQL:\n";
        print_r($user);
    } else {
        echo "User NOT found in MySQL database\n";
        
        // Show all users
        echo "\nAll users in database:\n";
        $allUsers = $pdo->query("SELECT id, username, email, role, supabase_user_id FROM users")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($allUsers as $u) {
            echo "ID: {$u['id']}, Username: {$u['username']}, Email: {$u['email']}, Role: {$u['role']}, Supabase ID: {$u['supabase_user_id']}\n";
        }
    }
    
    // Check permissions
    echo "\n=== PERMISSIONS CHECK ===\n";
    if ($user) {
        $permStmt = $pdo->prepare("
            SELECT p.key_name 
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id
            JOIN roles r ON rp.role_id = r.id
            JOIN user_roles ur ON r.id = ur.role_id
            WHERE ur.user_id = ?
        ");
        $permStmt->execute([$user['id']]);
        $permissions = $permStmt->fetchAll(PDO::FETCH_COLUMN);
        
        echo "User permissions:\n";
        foreach ($permissions as $perm) {
            echo "- $perm\n";
        }
    }
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
