<?php

namespace App\Controllers;

use Exception;

class UserManagementController {
    private $supabaseUrl;
    private $supabaseServiceKey;
    
    public function __construct() {
        $this->supabaseUrl = $_ENV['SUPABASE_URL'] ?? '';
        $this->supabaseServiceKey = $_ENV['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
    }
    
    private function makeSupabaseRequest($endpoint, $method = 'GET', $data = null) {
        $url = $this->supabaseUrl . '/auth/v1/admin/' . $endpoint;
        
        // Trim whitespace and quotes from the service key
        $cleanServiceKey = trim($this->supabaseServiceKey, " \t\n\r\0\x0B\"'");
        
        $headers = [
            'Authorization: Bearer ' . $cleanServiceKey,
            'Content-Type: application/json',
            'apikey: ' . $cleanServiceKey
        ];
        
        error_log("Making request to: " . $url);
        error_log("Using service key (first 20 chars): " . substr($cleanServiceKey, 0, 20) . "...");
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        
        if ($data) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        
        if ($curlError) {
            throw new Exception('CURL error: ' . $curlError);
        }
        
        error_log("HTTP Code: " . $httpCode);
        error_log("Response: " . $response);
        
        if ($httpCode >= 400) {
            throw new Exception('Supabase API error (HTTP ' . $httpCode . '): ' . $response);
        }
        
        return json_decode($response, true);
    }
    
    public function listUsers() {
        try {
            error_log("Attempting to fetch users from Supabase");
            error_log("Supabase URL: " . $this->supabaseUrl);
            error_log("Service Key present: " . (!empty($this->supabaseServiceKey) ? 'Yes' : 'No'));
            
            $response = $this->makeSupabaseRequest('users');
            
            error_log("Supabase response: " . json_encode($response));
            
            return [
                'success' => true,
                'users' => $response['users'] ?? [],
                'debug' => [
                    'total_users' => count($response['users'] ?? []),
                    'supabase_url' => $this->supabaseUrl
                ]
            ];
        } catch (Exception $e) {
            error_log("Error fetching users: " . $e->getMessage());
            return [
                'success' => false,
                'message' => $e->getMessage()
            ];
        }
    }
    
    public function createUser() {
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            
            $userData = [
                'email' => $input['email'],
                'password' => $input['password'],
                'user_metadata' => [
                    'full_name' => $input['full_name'] ?? '',
                    'username' => $input['username'] ?? '',
                    'role' => $input['role'] ?? 'dispatcher',
                    'mobile_number' => $input['mobile_number'] ?? ''
                ],
                'email_confirm' => true
            ];
            
            $response = $this->makeSupabaseRequest('users', 'POST', $userData);
            
            return [
                'success' => true,
                'user' => $response
            ];
        } catch (Exception $e) {
            return [
                'success' => false,
                'message' => $e->getMessage()
            ];
        }
    }
    
    public function updateUser($userId) {
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            
            $updateData = [
                'user_metadata' => [
                    'full_name' => $input['full_name'] ?? '',
                    'username' => $input['username'] ?? '',
                    'role' => $input['role'] ?? 'dispatcher',
                    'mobile_number' => $input['mobile_number'] ?? ''
                ]
            ];
            
            if (!empty($input['password'])) {
                $updateData['password'] = $input['password'];
            }
            
            $response = $this->makeSupabaseRequest("users/{$userId}", 'PUT', $updateData);
            
            return [
                'success' => true,
                'user' => $response
            ];
        } catch (Exception $e) {
            return [
                'success' => false,
                'message' => $e->getMessage()
            ];
        }
    }
    
    public function deleteUser($userId) {
        try {
            $this->makeSupabaseRequest("users/{$userId}", 'DELETE');
            
            return [
                'success' => true,
                'message' => 'User deleted successfully'
            ];
        } catch (Exception $e) {
            return [
                'success' => false,
                'message' => $e->getMessage()
            ];
        }
    }
    
    public function changePassword($userId) {
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            
            $updateData = [
                'password' => $input['password']
            ];
            
            $this->makeSupabaseRequest("users/{$userId}", 'PUT', $updateData);
            
            return [
                'success' => true,
                'message' => 'Password changed successfully'
            ];
        } catch (Exception $e) {
            return [
                'success' => false,
                'message' => $e->getMessage()
            ];
        }
    }
}
