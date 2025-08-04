<?php
namespace App\Models;

use App\Core\Database;
use App\Core\Logger;
use PDO;
use PDOException;

class User {
    /**
     * Find an active user by their username.
     *
     * @param string $username The username to search for.
     * @return array|false The user data as an associative array, or false if not found.
     */
    public static function findByUsername(string $username) {
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
} 