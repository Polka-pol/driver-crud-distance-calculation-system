<?php

namespace App\Core;

use PDO;
use PDOException;

/**
 * Database Connection Manager
 *
 * This class handles the creation of a persistent PDO connection
 * using settings from the .env file.
 */
class Database
{
    private static ?PDO $instance = null;

    /**
     * Get a singleton PDO database connection.
     *
     * @return PDO|null Returns the PDO instance or null on failure.
     */
    public static function getConnection(): ?PDO
    {
        if (self::$instance === null) {
            $host = $_ENV['DB_HOST'] ?? 'localhost';
            $port = $_ENV['DB_PORT'] ?? '3306';
            $db   = $_ENV['DB_NAME'] ?? '';
            $user = $_ENV['DB_USER'] ?? '';
            $pass = $_ENV['DB_PASSWORD'] ?? '';
            $charset = $_ENV['DB_CHARSET'] ?? 'utf8mb4';

            $dsn = "mysql:host={$host};port={$port};dbname={$db};charset={$charset}";

            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::ATTR_PERSISTENT         => true,
            ];

            try {
                self::$instance = new PDO($dsn, $user, $pass, $options);
            // Ensure session time zone is UTC for deterministic CURRENT_TIMESTAMP, etc.
                try {
                    self::$instance->exec("SET time_zone = '+00:00'");
                } catch (PDOException $e) {
                    // Ignore if not supported
                }
            } catch (PDOException $e) {
                // In a real application, you would log this error.
                // For now, we return null and let the caller handle it.
                error_log("Database Connection Error: " . $e->getMessage());
                return null;
            }
        }

        return self::$instance;
    }
}
