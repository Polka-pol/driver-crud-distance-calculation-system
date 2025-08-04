<?php

namespace App\Controllers;

use App\Core\Database;
use App\Core\Logger;
use App\Core\ActivityLogger;
use PDO;
use PDOException;

class UserController
{
    private static function sendResponse($data, $statusCode = 200)
    {
        http_response_code($statusCode);
        header('Content-Type: application/json');
        echo json_encode($data);
    }

    public static function getAll()
    {
        try {
            $pdo = Database::getConnection();
            // Select all fields except password
            $stmt = $pdo->query('SELECT id, username, full_name, mobile_number, role, created_at FROM users');
            $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
            self::sendResponse($users);
        } catch (PDOException $e) {
            Logger::error('Failed to fetch users', ['error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Database error.'], 500);
        }
    }

    public static function create()
    {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['username']) || empty($data['password']) || empty($data['role'])) {
            self::sendResponse(['success' => false, 'message' => 'Username, password, and role are required.'], 400);
            return;
        }

        $hashed_password = password_hash($data['password'], PASSWORD_DEFAULT);

        $sql = "INSERT INTO users (username, password, full_name, mobile_number, role) VALUES (:username, :password, :full_name, :mobile_number, :role)";
        
        try {
            $pdo = Database::getConnection();
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                ':username' => $data['username'],
                ':password' => $hashed_password,
                ':full_name' => $data['full_name'] ?? null,
                ':mobile_number' => $data['mobile_number'] ?? null,
                ':role' => $data['role'],
            ]);

            $newUserId = $pdo->lastInsertId();
            ActivityLogger::log('user_created', ['user_id' => $newUserId, 'username' => $data['username']]);

            self::sendResponse(['success' => true, 'message' => 'User created successfully.'], 201);
        } catch (PDOException $e) {
             // Check for duplicate username
            if ($e->getCode() == 23000) {
                 self::sendResponse(['success' => false, 'message' => 'Username already exists.'], 409);
            } else {
                Logger::error('User creation failed', ['error' => $e->getMessage()]);
                self::sendResponse(['success' => false, 'message' => 'Database error during user creation.'], 500);
            }
        }
    }

    public static function update($id)
    {
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data)) {
            self::sendResponse(['success' => false, 'message' => 'Empty request body.'], 400);
            return;
        }
        
        // Fields that can be updated
        $allowed_fields = ['full_name', 'mobile_number', 'role', 'password'];
        $update_fields = [];
        $params = ['id' => $id];

        foreach($allowed_fields as $field) {
            if(isset($data[$field])) {
                if ($field === 'password') {
                    // Only update password if it's not empty
                    if (!empty($data['password'])) {
                       $update_fields[] = "password = :password";
                       $params['password'] = password_hash($data['password'], PASSWORD_DEFAULT);
                    }
                } else {
                    $update_fields[] = "$field = :$field";
                    $params[$field] = $data[$field];
                }
            }
        }

        if (empty($update_fields)) {
            self::sendResponse(['success' => false, 'message' => 'No fields to update.'], 400);
            return;
        }

        $sql = "UPDATE users SET " . implode(', ', $update_fields) . " WHERE id = :id";

        try {
            $pdo = Database::getConnection();
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            if ($stmt->rowCount() > 0) {
                 ActivityLogger::log('user_updated', ['user_id' => $id, 'updated_fields' => array_keys($params)]);
            }
            
            self::sendResponse(['success' => true, 'message' => 'User updated successfully.']);
        } catch (PDOException $e) {
            Logger::error('User update failed', ['id' => $id, 'error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Database error during update.'], 500);
        }
    }

    public static function delete($id)
    {
        try {
            $pdo = Database::getConnection();
            $sql = "DELETE FROM users WHERE id = :id";
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['id' => $id]);

            if ($stmt->rowCount() === 0) {
                 self::sendResponse(['success' => false, 'message' => 'User not found.'], 404);
                 return;
            }
            
            ActivityLogger::log('user_deleted', ['user_id' => $id]);
            self::sendResponse(['success' => true, 'message' => 'User deleted successfully.']);
        } catch (PDOException $e) {
            Logger::error('User deletion failed', ['id' => $id, 'error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Database error during deletion.'], 500);
        }
    }
} 