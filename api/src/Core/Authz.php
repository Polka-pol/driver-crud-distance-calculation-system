<?php

namespace App\Core;

use PDO;
use App\Core\Database;
use App\Core\Logger;
use App\Core\HybridAuth;

class Authz
{
    /**
     * In-request cache for permissions lookups to avoid repeated queries.
     * @var array<string, array<string, bool>> roleName => [permissionKey => true]
     */
    private static array $cacheRoleToPermissions = [];

    /**
     * Built-in fallback permission map to preserve behavior if RBAC tables are not present yet.
     * Admin is treated as superuser via "*".
     * @var array<string, array<int, string>>
     */
    private static array $fallbackPermissionsByRole = [
        'admin' => ['*'],
        'manager' => [
            'trucks.read', 'trucks.update', 'trucks.create', 'trucks.delete', 'trucks.hold.manage', 'trucks.history.read', 'trucks.map.view',
            'search.query', 'search.reverse',
            'distance.process', 'distance.batch', 'distance.cache.check', 'distance.cache.log', 'distance.cache.stats', 'distance.cache.cleanup',
            'dashboard.analytics.view', 'dashboard.dispatcher.view',
            'driver.updates.view', 'driver.updates.modify',
            'settings.timezone.view'
        ],
        'dispatcher' => [
            'trucks.read', 'trucks.update', 'trucks.create', 'trucks.delete', 'trucks.hold.manage', 'trucks.history.read', 'trucks.map.view',
            'search.query', 'search.reverse',
            'distance.process', 'distance.batch', 'distance.cache.check', 'distance.cache.log', 'distance.cache.stats', 'distance.cache.cleanup',
            'dashboard.dispatcher.view',
            'driver.updates.view', 'driver.updates.modify',
            'users.dispatchers.read'
        ],
        'driver' => [
            'search.query'
        ],
    ];

    /**
     * Returns true if the current user has the given permission.
     */
    public static function can(string $permissionKey): bool
    {
        $user = HybridAuth::getCurrentUser();
        if (!$user || empty($user->role)) {
            return false;
        }
        $roleName = $user->role;
        // Grant superuser access to admin role regardless of DB state
        if ($roleName === 'admin') {
            return true;
        }
        $permissions = self::getRolePermissions($roleName);

        // Superuser wildcard support
        if (isset($permissions['*'])) {
            return true;
        }
        return isset($permissions[$permissionKey]);
    }

    /**
     * Returns true if the current user has any of the permissions.
     */
    public static function canAny(array $permissionKeys): bool
    {
        foreach ($permissionKeys as $key) {
            if (self::can($key)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Requires a permission; on failure sends 403 and exits.
     */
    public static function require(string $permissionKey): void
    {
        if (!self::can($permissionKey)) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'message' => 'Forbidden: missing permission ' . $permissionKey]);
            exit();
        }
    }

    /**
     * Requires at least one of the given permissions; on failure sends 403 and exits.
     */
    public static function requireAny(array $permissionKeys): void
    {
        if (!self::canAny($permissionKeys)) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'message' => 'Forbidden: missing required permissions']);
            exit();
        }
    }

    /**
     * Returns current user's permission keys as a flat array of strings.
     */
    public static function getCurrentUserPermissions(): array
    {
        $user = HybridAuth::getCurrentUser();
        if (!$user || empty($user->role)) {
            return [];
        }
        // Admin is superuser: expose wildcard so frontends can gate UI appropriately
        if ($user->role === 'admin') {
            return ['*'];
        }
        return array_keys(self::getRolePermissions($user->role));
    }

    /**
     * Get role permissions as associative array for quick lookups.
     * Falls back to baked-in map if RBAC tables are absent or empty.
     * @return array<string, bool>
     */
    private static function getRolePermissions(string $roleName): array
    {
        if (isset(self::$cacheRoleToPermissions[$roleName])) {
            return self::$cacheRoleToPermissions[$roleName];
        }

        // Try database-backed RBAC first
        $dbPermissions = self::queryRolePermissions($roleName);
        if ($dbPermissions !== null) {
            $assoc = [];
            foreach ($dbPermissions as $key) {
                $assoc[$key] = true;
            }
            self::$cacheRoleToPermissions[$roleName] = $assoc;
            return $assoc;
        }

        // Fallback to baked-in permissions if no RBAC tables
        $fallback = [];
        $keys = self::$fallbackPermissionsByRole[$roleName] ?? [];
        foreach ($keys as $key) {
            $fallback[$key] = true;
        }
        self::$cacheRoleToPermissions[$roleName] = $fallback;
        return $fallback;
    }

    /**
     * Queries permissions from DB. Returns null if RBAC tables are missing or on error.
     * @return array<int, string>|null
     */
    private static function queryRolePermissions(string $roleName): ?array
    {
        try {
            $pdo = Database::getConnection();

            // Ensure tables exist by checking one of them
            $check = $pdo->query("SHOW TABLES LIKE 'roles'");
            if (!$check || $check->rowCount() === 0) {
                return null;
            }

            $sql = "SELECT p.`key` AS perm_key
                    FROM roles r
                    JOIN role_permissions rp ON rp.role_id = r.id
                    JOIN permissions p ON p.id = rp.permission_id
                    WHERE r.name = :role_name AND r.is_active = 1 AND rp.is_enabled = 1";
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['role_name' => $roleName]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $keys = [];
            foreach ($rows as $row) {
                $keys[] = $row['perm_key'];
            }

            // If no rows and role exists, still return empty array (no permissions)
            // If role doesn't exist, also return empty array.
            return $keys;
        } catch (\Throwable $e) {
            Logger::warning('Authz DB permission lookup failed', ['error' => $e->getMessage()]);
            return null;
        }
    }
}
