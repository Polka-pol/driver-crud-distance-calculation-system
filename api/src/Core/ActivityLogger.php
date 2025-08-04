<?php

namespace App\Core;

use App\Core\Database;
use App\Core\Auth; // To get the current user
use PDO;
use PDOException;

class ActivityLogger
{
    /**
     * Logs a user action to the activity_logs table.
     *
     * @param string $action A description of the action (e.g., 'user_login', 'truck_updated').
     * @param array $details Optional JSON serializable data with more context.
     */
    public static function log(string $action, array $details = [])
    {
        // Get the current user from the JWT token.
        // If no user is logged in (e.g., a script), we can't log the activity.
        $user = Auth::getCurrentUser();
        if (!$user || !isset($user->id)) {
            // Optionally log this situation to the file logger for debugging.
            Logger::warning('ActivityLogger called without a valid user session.', ['action' => $action]);
            return;
        }

        $sql = "INSERT INTO activity_logs (user_id, action, details) VALUES (:user_id, :action, :details)";
        
        try {
            $pdo = Database::getConnection();
            $stmt = $pdo->prepare($sql);
            
            $stmt->execute([
                ':user_id' => $user->id,
                ':action' => $action,
                ':details' => json_encode($details)
            ]);

        } catch (PDOException $e) {
            // Log the failure to the main application logger.
            // We don't want to create an infinite loop if the DB is down.
            Logger::error('Failed to log user activity', [
                'error' => $e->getMessage(),
                'action' => $action
            ]);
        }
    }
} 