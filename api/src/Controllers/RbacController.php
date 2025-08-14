<?php

namespace App\Controllers;

use App\Core\Database;
use App\Core\Auth;
use App\Core\Authz;
use App\Core\Logger;
use PDO;
use PDOException;

class RbacController
{
    private static function send($data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json');
        echo json_encode($data);
    }

    public static function getPermissionsCatalog(): void
    {
        // Could be pulled from DB or a known registry; for now derive from DB if available
        try {
            $pdo = Database::getConnection();
            $check = $pdo->query("SHOW TABLES LIKE 'permissions'");
            if ($check && $check->rowCount() > 0) {
                $rows = $pdo->query("SELECT `key`, `description`, `group` FROM permissions ORDER BY `group`, `key`")
                    ->fetchAll(PDO::FETCH_ASSOC);
                self::send(['success' => true, 'data' => $rows]);
                return;
            }
        } catch (\Throwable $e) {
            Logger::warning('RBAC getPermissionsCatalog error', ['error' => $e->getMessage()]);
        }
        self::send(['success' => true, 'data' => []]);
    }

    public static function getRoles(): void
    {
        try {
            $pdo = Database::getConnection();
            $check = $pdo->query("SHOW TABLES LIKE 'roles'");
            if (!$check || $check->rowCount() === 0) {
                self::send(['success' => true, 'data' => []]);
                return;
            }
            $rows = $pdo->query("SELECT id, name, description, is_system, is_active FROM roles ORDER BY name")
                ->fetchAll(PDO::FETCH_ASSOC);
            self::send(['success' => true, 'data' => $rows]);
        } catch (\Throwable $e) {
            Logger::error('RBAC getRoles failed', ['error' => $e->getMessage()]);
            self::send(['success' => false, 'message' => 'Database error'], 500);
        }
    }

    public static function getRolePermissions(int $roleId): void
    {
        try {
            $pdo = Database::getConnection();
            $check = $pdo->query("SHOW TABLES LIKE 'role_permissions'");
            if (!$check || $check->rowCount() === 0) {
                self::send(['success' => true, 'data' => []]);
                return;
            }
            $sql = "SELECT p.`key` FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = :rid AND rp.is_enabled = 1";
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['rid' => $roleId]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $keys = array_map(static fn($r) => $r['key'], $rows);
            self::send(['success' => true, 'data' => $keys]);
        } catch (\Throwable $e) {
            Logger::error('RBAC getRolePermissions failed', ['error' => $e->getMessage()]);
            self::send(['success' => false, 'message' => 'Database error'], 500);
        }
    }

    public static function createRole(): void
    {
        Authz::require('rbac.roles.manage');
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $name = trim($input['name'] ?? '');
        $description = trim($input['description'] ?? '');
        if ($name === '') {
            self::send(['success' => false, 'message' => 'Role name is required'], 400);
            return;
        }
        try {
            $pdo = Database::getConnection();
            $stmt = $pdo->prepare("INSERT INTO roles (name, description, is_system, is_active) VALUES (:n, :d, 0, 1)");
            $stmt->execute(['n' => $name, 'd' => $description]);
            \App\Core\ActivityLogger::log('rbac_role_created', [
                'role_name' => $name,
                'created_by' => (\App\Core\Auth::getCurrentUser()->username ?? 'unknown')
            ]);
            self::send(['success' => true, 'id' => (int)$pdo->lastInsertId()], 201);
        } catch (\Throwable $e) {
            Logger::error('RBAC createRole failed', ['error' => $e->getMessage()]);
            self::send(['success' => false, 'message' => 'Database error'], 500);
        }
    }

    public static function updateRole(int $roleId): void
    {
        Authz::require('rbac.roles.manage');
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $name = isset($input['name']) ? trim($input['name']) : null;
        $description = isset($input['description']) ? trim($input['description']) : null;
        $isActive = isset($input['is_active']) ? (int)!!$input['is_active'] : null;
        try {
            $pdo = Database::getConnection();
            $stmt = $pdo->prepare("SELECT is_system FROM roles WHERE id = :id");
            $stmt->execute(['id' => $roleId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                self::send(['success' => false, 'message' => 'Role not found'], 404);
                return;
            }
            if ((int)$row['is_system'] === 1 && $name !== null) {
                self::send(['success' => false, 'message' => 'Cannot rename system role'], 400);
                return;
            }
            $updates = [];
            $params = ['id' => $roleId];
            if ($name !== null) {
                $updates[] = 'name = :n';
                $params['n'] = $name;
            }
            if ($description !== null) {
                $updates[] = 'description = :d';
                $params['d'] = $description;
            }
            if ($isActive !== null) {
                $updates[] = 'is_active = :a';
                $params['a'] = $isActive;
            }
            if (empty($updates)) {
                self::send(['success' => true, 'message' => 'No changes']);
                return;
            }
            $sql = 'UPDATE roles SET ' . implode(', ', $updates) . ' WHERE id = :id';
            $pdo->prepare($sql)->execute($params);
            \App\Core\ActivityLogger::log('rbac_role_updated', [
                'role_id' => $roleId,
                'updated_fields' => array_keys($params),
                'updated_by' => (\App\Core\Auth::getCurrentUser()->username ?? 'unknown')
            ]);
            self::send(['success' => true]);
        } catch (\Throwable $e) {
            Logger::error('RBAC updateRole failed', ['error' => $e->getMessage()]);
            self::send(['success' => false, 'message' => 'Database error'], 500);
        }
    }

    public static function deleteRole(int $roleId): void
    {
        Authz::require('rbac.roles.manage');
        try {
            $pdo = Database::getConnection();
            $stmt = $pdo->prepare("SELECT is_system FROM roles WHERE id = :id");
            $stmt->execute(['id' => $roleId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                self::send(['success' => false, 'message' => 'Role not found'], 404);
                return;
            }
            if ((int)$row['is_system'] === 1) {
                self::send(['success' => false, 'message' => 'Cannot delete system role'], 400);
                return;
            }
            // NOTE: Ensure no users assigned or perform reassignment separately
            $pdo->prepare("DELETE FROM role_permissions WHERE role_id = :id")->execute(['id' => $roleId]);
            $pdo->prepare("DELETE FROM roles WHERE id = :id")->execute(['id' => $roleId]);
            \App\Core\ActivityLogger::log('rbac_role_deleted', [
                'role_id' => $roleId,
                'deleted_by' => (\App\Core\Auth::getCurrentUser()->username ?? 'unknown')
            ]);
            self::send(['success' => true]);
        } catch (\Throwable $e) {
            Logger::error('RBAC deleteRole failed', ['error' => $e->getMessage()]);
            self::send(['success' => false, 'message' => 'Database error'], 500);
        }
    }

    public static function setRolePermissions(int $roleId): void
    {
        Authz::require('rbac.permissions.manage');
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $keys = isset($input['permissions']) && is_array($input['permissions']) ? $input['permissions'] : null;
        if ($keys === null) {
            self::send(['success' => false, 'message' => 'permissions array required'], 400);
            return;
        }
        try {
            $pdo = Database::getConnection();
            $pdo->beginTransaction();
            // Clear
            $pdo->prepare("DELETE rp FROM role_permissions rp WHERE rp.role_id = :rid")
                ->execute(['rid' => $roleId]);
            if (!empty($keys)) {
                // Map keys -> ids
                $in = str_repeat('?,', count($keys) - 1) . '?';
                $stmt = $pdo->prepare("SELECT id, `key` FROM permissions WHERE `key` IN ($in)");
                $stmt->execute($keys);
                $map = [];
                foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                    $map[$row['key']] = (int)$row['id'];
                }
                $ins = $pdo->prepare("INSERT INTO role_permissions (role_id, permission_id, is_enabled) VALUES (:r, :p, 1)");
                foreach ($keys as $k) {
                    if (!isset($map[$k])) {
                        continue;
                    }
                    $ins->execute(['r' => $roleId, 'p' => $map[$k]]);
                }
            }
            $pdo->commit();
            \App\Core\ActivityLogger::log('rbac_role_permissions_set', [
                'role_id' => $roleId,
                'permissions' => $keys,
                'updated_by' => (\App\Core\Auth::getCurrentUser()->username ?? 'unknown')
            ]);
            self::send(['success' => true]);
        } catch (\Throwable $e) {
            try {
                $pdo->rollBack();
            } catch (\Throwable $ignore) {
            }
            Logger::error('RBAC setRolePermissions failed', ['error' => $e->getMessage()]);
            self::send(['success' => false, 'message' => 'Database error'], 500);
        }
    }

    public static function mePermissions(): void
    {
        Auth::protect();
        $perms = Authz::getCurrentUserPermissions();
        self::send(['success' => true, 'data' => $perms]);
    }
}
