<?php

namespace App\Controllers;

use App\Core\Logger;
use App\Models\User;
use Firebase\JWT\JWT;
use App\Core\ActivityLogger;

// Import ActivityLogger

class AuthController
{
    /**
     * Handle user login request.
     */
    public static function login()
    {
        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['username']) || !isset($data['password'])) {
            self::sendResponse(['success' => false, 'message' => 'Username and password are required.'], 400);
            return;
        }

        $user = User::findByUsername($data['username']);

        // IMPORTANT: We use password_verify for security. Your existing plain-text passwords will NOT work.
        // You must update your 'password' column to store hashed passwords.
        if (!$user || !password_verify($data['password'], $user['password'])) {
            self::handleFailedLogin($data['username']);
            return;
        }

        // Generate JWT
        try {
            $secretKey = $_ENV['JWT_SECRET'];
            if (empty($secretKey)) {
                throw new \Exception("JWT_SECRET is not configured.");
            }

            $issuedAt   = time();
            $expire     = $issuedAt + (60 * 60 * 24 * 7); // Expires in 7 days
            $payload = [
                'iat'  => $issuedAt,
                'exp'  => $expire,
                'data' => [
                    'id'       => $user['id'],
                    'username' => $user['username'],
                    'role'     => $user['role'],
                    'fullName' => $user['full_name'] ?? ''
                ]
            ];

            // Log successful login
            ActivityLogger::log('user_login_success', ['username' => $data['username']]);

            $jwt = JWT::encode($payload, $secretKey, 'HS256');

            self::sendResponse([
                'success' => true,
                'message' => 'Login successful.',
                'token'   => $jwt,
                'user'    => [
                    'id' => $user['id'],
                    'fullName' => $user['full_name'],
                    'mobileNumber' => $user['mobile_number'],
                    'role' => $user['role']
                ]
            ]);
        } catch (\Exception $e) {
            Logger::error('JWT Generation Failed', ['error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Could not process login. Please contact support.'], 500);
        }
    }

    private static function sendResponse($data, $statusCode = 200)
    {
        http_response_code($statusCode);
        header('Content-Type: application/json');
        echo json_encode($data);
    }

    private static function handleFailedLogin($username)
    {
        Logger::warning('Failed login attempt', ['username' => $username]);
        ActivityLogger::log('user_login_failure', ['username' => $username, 'ip_address' => $_SERVER['REMOTE_ADDR'] ?? 'unknown']);
        self::sendResponse(['success' => false, 'message' => 'Invalid username or password.'], 401);
    }

    /**
     * MySQL login for migration to Supabase
     */
    public static function mysqlLogin()
    {
        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['username']) || !isset($data['password'])) {
            self::sendResponse(['success' => false, 'message' => 'Username and password are required.'], 400);
            return;
        }

        $user = User::findByUsername($data['username']);

        if (!$user || !$user['is_active']) {
            self::sendResponse(['success' => false, 'message' => 'User not found or inactive.'], 401);
            return;
        }

        // Check password (assuming plain text for now, will be migrated to Supabase)
        if ($user['password'] !== $data['password']) {
            self::handleFailedLogin($data['username']);
            return;
        }

        // Return user data for migration
        self::sendResponse([
            'success' => true,
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'email' => $user['email'],
                'full_name' => $user['full_name'],
                'role' => $user['role'],
                'supabase_user_id' => $user['supabase_user_id']
            ]
        ]);
    }

    /**
     * Update MySQL user with Supabase user ID after migration
     */
    public static function updateSupabaseId()
    {
        $data = json_decode(file_get_contents('php://input'), true);

        if (!isset($data['mysql_user_id']) || !isset($data['supabase_user_id'])) {
            self::sendResponse(['success' => false, 'message' => 'MySQL user ID and Supabase user ID are required.'], 400);
            return;
        }

        try {
            $updated = User::updateSupabaseId($data['mysql_user_id'], $data['supabase_user_id']);
            
            if ($updated) {
                self::sendResponse(['success' => true, 'message' => 'Supabase ID updated successfully.']);
            } else {
                self::sendResponse(['success' => false, 'message' => 'Failed to update Supabase ID.'], 500);
            }
        } catch (\Exception $e) {
            Logger::error('Failed to update Supabase ID', ['error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Database error.'], 500);
        }
    }
}
