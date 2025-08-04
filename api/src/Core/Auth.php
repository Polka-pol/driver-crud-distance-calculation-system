<?php
namespace App\Core;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Exception;

class Auth
{
    /**
     * Middleware function to protect a route.
     * Exits with a 401 or 403 error if authentication or authorization fails.
     *
     * @param array $allowedRoles An array of roles allowed to access the route. If empty, only authentication is checked.
     * @return object The decoded payload data from the token for potential use in the controller.
     */
    public static function protect(array $allowedRoles = [])
    {
        $decodedToken = self::getDecodedToken();

        if (!$decodedToken) {
            self::sendError('Unauthorized: Invalid or missing token.', 401);
        }

        if (!empty($allowedRoles)) {
            $userRole = $decodedToken->data->role ?? null;
            if (!$userRole || !in_array($userRole, $allowedRoles)) {
                self::sendError('Forbidden: You do not have permission to access this resource.', 403);
            }
        }
        
        return $decodedToken->data;
    }

    /**
     * Decode the JWT from the Authorization header.
     *
     * @return object|null The decoded payload from the JWT, or null on failure.
     */
    private static function getDecodedToken()
    {
        if (!isset($_SERVER['HTTP_AUTHORIZATION'])) {
            return null;
        }

        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
        list($jwt) = sscanf($authHeader, 'Bearer %s');

        if (!$jwt) {
            return null;
        }

        try {
            $secretKey = $_ENV['JWT_SECRET'];
            if (empty($secretKey)) {
                throw new Exception("JWT secret key is not configured on the server.");
            }
            return JWT::decode($jwt, new Key($secretKey, 'HS256'));
        } catch (Exception $e) {
            Logger::warning('JWT validation failed', ['error' => $e->getMessage()]);
            return null;
        }
    }

    /**
     * Sends a JSON error response and terminates the script.
     */
    private static function sendError(string $message, int $statusCode) {
        http_response_code($statusCode);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => $message]);
        exit();
    }

    /**
     * Gets the current user's data from the JWT token.
     *
     * @return object|null The user data object or null if not authenticated.
     */
    public static function getCurrentUser()
    {
        $decodedToken = self::getDecodedToken();
        return $decodedToken->data ?? null;
    }
} 