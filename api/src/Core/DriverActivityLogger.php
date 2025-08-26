<?php

namespace App\Core;

use App\Core\Database;
use App\Core\Logger;
use App\Core\EDTTimeConverter;
use App\Core\HybridAuth;
use App\Core\UserService;
use PDO;
use PDOException;
use Exception;

class DriverActivityLogger
{
    /**
     * Logs a driver action to the driver_activity_logs table.
     *
     * @param string $action A description of the action (e.g., 'driver_login', 'driver_location_updated').
     * @param array $details Optional JSON serializable data with more context.
     * @param int|null $driverId Optional driver ID (Truck/Driver record ID). If not provided, no log is written.
     */
    public static function log(string $action, array $details = [], ?int $driverId = null)
    {
        // Resolve driver ID only from provided parameter (no token decoding here)
        $finalDriverId = $driverId;

        if (!$finalDriverId) {
            Logger::warning('DriverActivityLogger called without a valid driver ID or token.', ['action' => $action]);
            return;
        }

        // Enrich details with authenticated user info (HybridAuth supports Supabase)
        try {
            $user = HybridAuth::getCurrentUser();
            if ($user) {
                $details['_user'] = UserService::getUserInfo($user);
            }
        } catch (Exception $e) {
            // Non-fatal: continue without user enrichment
            Logger::warning('Failed to enrich driver activity details with user info', ['error' => $e->getMessage()]);
        }

        // Create the driver_activity_logs table if it doesn't exist
        self::ensureTableExists();

        $sql = "INSERT INTO driver_activity_logs (driver_id, action, details, created_at) VALUES (:driver_id, :action, :details, :created_at)";

        try {
            $pdo = Database::getConnection();
            $stmt = $pdo->prepare($sql);

            $stmt->execute([
                ':driver_id' => $finalDriverId,
                ':action' => $action,
                ':details' => json_encode($details),
                ':created_at' => TimeService::nowUtc()->format('Y-m-d H:i:s')
            ]);
        } catch (PDOException $e) {
            // Log the failure to the main application logger.
            Logger::error('Failed to log driver activity', [
                'error' => $e->getMessage(),
                'action' => $action,
                'driver_id' => $finalDriverId
            ]);
        }
    }

    /**
     * Ensure the driver_activity_logs table exists.
     */
    private static function ensureTableExists()
    {
        try {
            $pdo = Database::getConnection();

            // Check if table exists
            $stmt = $pdo->prepare("SHOW TABLES LIKE 'driver_activity_logs'");
            $stmt->execute();

            if ($stmt->rowCount() === 0) {
                // Create the table
                $createTableSQL = "
                    CREATE TABLE driver_activity_logs (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        driver_id INT NOT NULL,
                        action VARCHAR(255) NOT NULL,
                        details JSON,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_driver_id (driver_id),
                        INDEX idx_action (action),
                        INDEX idx_created_at (created_at),
                        FOREIGN KEY (driver_id) REFERENCES Trucks(ID) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                ";

                $pdo->exec($createTableSQL);
            }
        } catch (PDOException $e) {
            Logger::error('Failed to ensure driver_activity_logs table exists', [
                'error' => $e->getMessage()
            ]);
        }
    }

    /**
     * Get driver activity logs with pagination.
     *
     * @param int $driverId Driver ID to get logs for
     * @param int $limit Number of logs to return
     * @param int $offset Offset for pagination
     * @return array Array of activity logs
     */
    public static function getDriverLogs(int $driverId, int $limit = 50, int $offset = 0): array
    {
        try {
            $pdo = Database::getConnection();

            $sql = "SELECT dal.*, t.DriverName, t.TruckNumber 
                    FROM driver_activity_logs dal 
                    JOIN Trucks t ON dal.driver_id = t.ID 
                    WHERE dal.driver_id = :driver_id 
                    ORDER BY dal.created_at DESC 
                    LIMIT :limit OFFSET :offset";

            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(':driver_id', $driverId, PDO::PARAM_INT);
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();

            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            Logger::error('Failed to get driver logs', [
                'error' => $e->getMessage(),
                'driver_id' => $driverId
            ]);
            return [];
        }
    }

    /**
     * Get activity summary for a driver.
     *
     * @param int $driverId Driver ID
     * @param int $days Number of days to look back
     * @return array Activity summary
     */
    public static function getDriverActivitySummary(int $driverId, int $days = 30): array
    {
        try {
            $pdo = Database::getConnection();

            $sql = "SELECT 
                        action,
                        COUNT(*) as count,
                        MAX(created_at) as last_occurrence
                    FROM driver_activity_logs 
                    WHERE driver_id = :driver_id 
                      AND created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
                    GROUP BY action 
                    ORDER BY count DESC";

            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(':driver_id', $driverId, PDO::PARAM_INT);
            $stmt->bindValue(':days', $days, PDO::PARAM_INT);
            $stmt->execute();

            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            Logger::error('Failed to get driver activity summary', [
                'error' => $e->getMessage(),
                'driver_id' => $driverId
            ]);
            return [];
        }
    }
}
