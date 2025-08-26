<?php

namespace App\Core;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Exception;

class SupabaseAuth
{
    /**
     * Validate Supabase JWT token
     * 
     * @param string $token
     * @return object|null The decoded payload from the JWT, or null on failure.
     */
    public static function validateSupabaseJWT($token)
    {
        try {
            $supabaseJwtSecret = $_ENV['SUPABASE_JWT_SECRET'];
            if (empty($supabaseJwtSecret)) {
                throw new Exception("SUPABASE_JWT_SECRET is not configured on the server.");
            }

            // Decode the Supabase JWT
            $decoded = JWT::decode($token, new Key($supabaseJwtSecret, 'HS256'));
            
            // Validate required claims
            if (!isset($decoded->sub) || !isset($decoded->email)) {
                throw new Exception("Invalid Supabase JWT: missing required claims");
            }

            return $decoded;
        } catch (Exception $e) {
            Logger::warning('Supabase JWT validation failed', ['error' => $e->getMessage()]);
            return null;
        }
    }

    /**
     * Get the current user's data from Supabase JWT token.
     *
     * @return object|null The user data object or null if not authenticated.
     */
    public static function getCurrentSupabaseUser()
    {
        if (!isset($_SERVER['HTTP_AUTHORIZATION'])) {
            return null;
        }

        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
        list($jwt) = sscanf($authHeader, 'Bearer %s');

        if (!$jwt) {
            return null;
        }

        $decoded = self::validateSupabaseJWT($jwt);
        
        if (!$decoded) {
            return null;
        }

        // Extract meta safely - Supabase can have either user_metadata or raw_user_meta_data
        $meta = null;
        if (isset($decoded->raw_user_meta_data)) {
            $meta = (object)$decoded->raw_user_meta_data;
        } elseif (isset($decoded->user_metadata)) {
            $meta = (object)$decoded->user_metadata;
        } else {
            $meta = (object)[];
        }
        
        // Same for app metadata
        $appMeta = null;
        if (isset($decoded->raw_app_meta_data)) {
            $appMeta = (object)$decoded->raw_app_meta_data;
        } elseif (isset($decoded->app_metadata)) {
            $appMeta = (object)$decoded->app_metadata;
        } else {
            $appMeta = (object)[];
        }

        // Determine role
        $role = isset($meta->role) ? $meta->role : (isset($appMeta->role) ? $appMeta->role : 'dispatcher');

        // Determine full name from multiple possible fields
        $first = isset($meta->first_name) ? trim((string)$meta->first_name) : '';
        $last = isset($meta->last_name) ? trim((string)$meta->last_name) : '';
        $fullName = '';
        if (isset($meta->full_name) && trim((string)$meta->full_name) !== '') {
            $fullName = trim((string)$meta->full_name);
        } elseif (isset($meta->name) && trim((string)$meta->name) !== '') {
            $fullName = trim((string)$meta->name);
        } elseif (isset($decoded->name) && trim((string)$decoded->name) !== '') {
            $fullName = trim((string)$decoded->name);
        } elseif ($first !== '' || $last !== '') {
            $fullName = trim($first . ' ' . $last);
        }

        // Convert Supabase user format to our expected format
        return (object) [
            'id' => $decoded->sub,
            'email' => $decoded->email,
            'role' => $role,
            'full_name' => $fullName,
            'supabase_user_id' => $decoded->sub
        ];
    }

    /**
     * Middleware function to protect a route with Supabase JWT.
     * 
     * @param array $allowedRoles An array of roles allowed to access the route.
     * @return object The decoded user data from the token.
     */
    public static function protect(array $allowedRoles = [])
    {
        $user = self::getCurrentSupabaseUser();

        if (!$user) {
            self::sendError('Unauthorized: Invalid or missing Supabase token.', 401);
        }

        if (!empty($allowedRoles)) {
            $userRole = $user->role ?? null;
            if (!$userRole || !in_array($userRole, $allowedRoles)) {
                self::sendError('Forbidden: You do not have permission to access this resource.', 403);
            }
        }

        return $user;
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
