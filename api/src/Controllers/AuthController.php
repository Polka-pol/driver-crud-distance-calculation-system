<?php

namespace App\Controllers;

use App\Core\Logger;
use App\Models\User;
use Firebase\JWT\JWT;
use App\Core\ActivityLogger; // Import ActivityLogger

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
} 