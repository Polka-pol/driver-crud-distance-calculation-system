<?php

namespace App\Core;

use App\Core\Database;
use App\Core\HybridAuth; // Updated to use HybridAuth
use App\Core\Logger;
use App\Core\TimeService;
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
        // Get the current user from HybridAuth (supports both JWT and Supabase)
        $user = HybridAuth::getCurrentUser();
        if (!$user) {
            Logger::warning('ActivityLogger called without a valid user session.', [
                'action' => $action,
                'headers' => getallheaders(),
                'auth_header' => $_SERVER['HTTP_AUTHORIZATION'] ?? 'not set'
            ]);
            return;
        }

        // Use UserService helpers for consistent user ID extraction
        $userId = \App\Core\UserService::getMysqlId($user);
        $supabaseUserId = \App\Core\UserService::getSupabaseId($user);

        // If Supabase user has no MySQL ID yet, ensure one exists and use it
        if ($userId === null && $supabaseUserId) {
            $mysqlUser = \App\Core\UserService::ensureMysqlUser($user);
            if ($mysqlUser && isset($mysqlUser['id'])) {
                $userId = (int)$mysqlUser['id'];
            }
        }

        $sql = "INSERT INTO activity_logs (user_id, supabase_user_id, action, details, created_at) VALUES (:user_id, :supabase_user_id, :action, :details, :created_at)";

        try {
            $pdo = Database::getConnection();
            $stmt = $pdo->prepare($sql);

            $stmt->execute([
                ':user_id' => $userId,
                ':supabase_user_id' => $supabaseUserId,
                ':action' => $action,
                ':details' => json_encode($details),
                ':created_at' => TimeService::nowUtc()->format('Y-m-d H:i:s')
            ]);

            Logger::info('Activity logged successfully', [
                'action' => $action,
                'user_id' => $userId,
                'supabase_user_id' => $supabaseUserId
            ]);
        } catch (PDOException $e) {
            Logger::error('Failed to log user activity', [
                'error' => $e->getMessage(),
                'action' => $action,
                'user_id' => $userId,
                'supabase_user_id' => $supabaseUserId
            ]);
        }
    }

}
