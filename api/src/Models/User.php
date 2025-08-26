<?php

namespace App\Models;

use App\Core\Database;
use App\Core\Logger;
use PDO;
use PDOException;

class User
{
    /**
     * Find an active user by their username.
     *
     * @param string $username The username to search for.
     * @return array|false The user data as an associative array, or false if not found.
     */
    public static function findByUsername(string $username)
    {
        try {
            $pdo = Database::getConnection();
            $stmt = $pdo->prepare("SELECT * FROM users WHERE username = :username AND is_active = TRUE");
            $stmt->execute(['username' => $username]);
            return $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            Logger::error('Database error in findByUsername', ['error' => $e->getMessage()]);
            return false;
        }
    }

    /**
     * Update user with Supabase user ID after migration.
     *
     * @param int $mysqlUserId The MySQL user ID.
     * @param string $supabaseUserId The Supabase user ID.
     * @return bool True if updated successfully, false otherwise.
     */
    public static function updateSupabaseId(int $mysqlUserId, string $supabaseUserId)
    {
        try {
            $pdo = Database::getConnection();
            $stmt = $pdo->prepare("UPDATE users SET supabase_user_id = :supabase_user_id WHERE id = :id");
            $result = $stmt->execute([
                'supabase_user_id' => $supabaseUserId,
                'id' => $mysqlUserId
            ]);
            return $result && $stmt->rowCount() > 0;
        } catch (PDOException $e) {
            Logger::error('Database error in updateSupabaseId', ['error' => $e->getMessage()]);
            return false;
        }
    }
}
