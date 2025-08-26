<?php

namespace App\Core;

use App\Core\SupabaseAuth;
use App\Core\UserService;
use Exception;

class HybridAuth
{
    /**
     * Hybrid authentication middleware that supports both JWT and Supabase tokens
     * 
     * @param array $allowedRoles An array of roles allowed to access the route.
     * @return object The decoded user data from the token.
     */
    public static function protect(array $allowedRoles = [])
    {
        // Supabase JWT only
        $supabaseUser = SupabaseAuth::getCurrentSupabaseUser();
        if ($supabaseUser) {
            // Ensure a corresponding MySQL user exists and attach its ID
            $mysqlUser = UserService::ensureMysqlUser($supabaseUser);
            if ($mysqlUser && isset($mysqlUser['id'])) {
                $supabaseUser->mysql_user_id = (int)$mysqlUser['id'];
                $supabaseUser->mysql_user = $mysqlUser;
            }
            if (!empty($allowedRoles)) {
                $userRole = $supabaseUser->role ?? null;
                if (!$userRole || !in_array($userRole, $allowedRoles)) {
                    self::sendError('Forbidden: You do not have permission to access this resource.', 403);
                }
            }
            return $supabaseUser;
        }

        self::sendError('Unauthorized: Invalid or missing token.', 401);
    }

    /**
     * Get current user from either authentication system
     * 
     * @return object|null The user data object or null if not authenticated.
     */
    public static function getCurrentUser()
    {
        // Supabase only
        $supabaseUser = SupabaseAuth::getCurrentSupabaseUser();
        if ($supabaseUser) {
            // Ensure a corresponding MySQL user exists and attach its ID
            $mysqlUser = UserService::ensureMysqlUser($supabaseUser);
            if ($mysqlUser && isset($mysqlUser['id'])) {
                $supabaseUser->mysql_user_id = (int)$mysqlUser['id'];
                $supabaseUser->mysql_user = $mysqlUser;
            }
            return $supabaseUser;
        }
        return null;
    }

    /**
     * Sends a JSON error response and terminates the script.
     */
    private static function sendError(string $message, int $statusCode)
    {
        http_response_code($statusCode);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => $message]);
        exit();
    }
}
