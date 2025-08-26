<?php

namespace App\Core;

use App\Core\HybridAuth;
use App\Core\Database;
use App\Core\Logger;
use PDO;
use PDOException;

/**
 * Unified User Service for consistent user data handling
 * Works with both MySQL and Supabase users
 */
class UserService
{
    /**
     * Get standardized user display name
     */
    public static function getDisplayName($user): string
    {
        if (!$user) {
            return 'Unknown User';
        }

        // Supabase user format
        if (isset($user->user_metadata)) {
            return $user->user_metadata->full_name ?? 
                   $user->user_metadata->username ?? 
                   $user->email ?? 'Unknown User';
        }

        // MySQL user format
        return $user->full_name ?? 
               $user->fullName ?? 
               $user->username ?? 
               $user->email ?? 'Unknown User';
    }

    /**
     * Get user ID (prioritize Supabase UUID)
     */
    public static function getUserId($user): ?string
    {
        if (!$user || !isset($user->id)) {
            return null;
        }

        return (string)$user->id;
    }

    /**
     * Get legacy MySQL numeric user ID if available.
     * Returns null for Supabase users (UUIDs).
     */
    public static function getMysqlId($user): ?int
    {
        if (!$user || !isset($user->id)) {
            return null;
        }

        // If Supabase UUID, no MySQL ID
        if (self::isSupabaseUser($user)) {
            return null;
        }

        // Otherwise cast to int (legacy users)
        $id = (int)$user->id;
        return $id > 0 ? $id : null;
    }

    /**
     * Get Supabase UUID if available.
     * Returns null for legacy MySQL users.
     */
    public static function getSupabaseId($user): ?string
    {
        if (!$user || !isset($user->id)) {
            return null;
        }

        return self::isSupabaseUser($user) ? (string)$user->id : null;
    }

    /**
     * Get user role
     */
    public static function getUserRole($user): string
    {
        if (!$user) {
            return 'dispatcher';
        }

        // Supabase user format
        if (isset($user->user_metadata)) {
            return $user->user_metadata->role ?? 'dispatcher';
        }

        // MySQL user format
        return $user->role ?? 'dispatcher';
    }

    /**
     * Get user email
     */
    public static function getUserEmail($user): ?string
    {
        if (!$user) {
            return null;
        }

        return $user->email ?? null;
    }

    /**
     * Check if user is Supabase user (UUID format)
     */
    public static function isSupabaseUser($user): bool
    {
        if (!$user || !isset($user->id)) {
            return false;
        }

        return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $user->id) === 1;
    }

    /**
     * Get current user using HybridAuth
     */
    public static function getCurrentUser()
    {
        return HybridAuth::getCurrentUser();
    }

    /**
     * Get user info for logging/display purposes
     */
    public static function getUserInfo($user): array
    {
        if (!$user) {
            return [
                'id' => null,
                'display_name' => 'Unknown User',
                'email' => null,
                'role' => 'dispatcher',
                'type' => 'unknown'
            ];
        }

        return [
            'id' => self::getUserId($user),
            'display_name' => self::getDisplayName($user),
            'email' => self::getUserEmail($user),
            'role' => self::getUserRole($user),
            'type' => self::isSupabaseUser($user) ? 'supabase' : 'mysql'
        ];
    }

    /**
     * Ensure a legacy MySQL user record exists for a given Supabase user.
     * - If a row in `users` with matching supabase_user_id exists, return it.
     * - Otherwise, create a new MySQL user mapped to this Supabase UUID and return it.
     *
     * @param object $supabaseUser Supabase user object (from SupabaseAuth::getCurrentSupabaseUser())
     * @return array|null MySQL user row as associative array or null on failure
     */
    public static function ensureMysqlUser($supabaseUser): ?array
    {
        try {
            if (!$supabaseUser || !isset($supabaseUser->id)) {
                return null;
            }

            $supabaseId = (string)$supabaseUser->id;

            // Validate UUID format early
            if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $supabaseId)) {
                return null;
            }

            $pdo = Database::getConnection();

            // Extract user attributes once for both existing/backfill and insert paths
            // Get email directly from supabaseUser object
            $email = isset($supabaseUser->email) ? trim((string)$supabaseUser->email) : null;
            
            // Extract metadata - Supabase can have either user_metadata or raw_user_meta_data
            $meta = null;
            if (isset($supabaseUser->raw_user_meta_data)) {
                $meta = (object)$supabaseUser->raw_user_meta_data;
            } elseif (isset($supabaseUser->user_metadata)) {
                $meta = (object)$supabaseUser->user_metadata;
            } else {
                $meta = (object)[];
            }
            
            // Only log metadata on first login or when debugging is explicitly enabled
            static $hasLoggedMetadata = false;
            if (!$hasLoggedMetadata && isset($_SERVER['HTTP_X_DEBUG_AUTH']) && $_SERVER['HTTP_X_DEBUG_AUTH'] === '1') {
                Logger::warning('Supabase user metadata', [
                    'email' => $email,
                    'meta' => json_encode($meta)
                    // Don't log the full user object to reduce log size
                ]);
                $hasLoggedMetadata = true;
            }
            
            // Prefer already-computed full_name on the supabase user object (from SupabaseAuth)
            $fullName = null;
            if (isset($supabaseUser->full_name) && trim((string)$supabaseUser->full_name) !== '') {
                $fullName = trim((string)$supabaseUser->full_name);
            } else {
                $first = isset($meta->first_name) ? trim((string)$meta->first_name) : '';
                $last = isset($meta->last_name) ? trim((string)$meta->last_name) : '';
                if (isset($meta->full_name) && trim((string)$meta->full_name) !== '') {
                    $fullName = trim((string)$meta->full_name);
                } elseif (isset($meta->name) && trim((string)$meta->name) !== '') {
                    $fullName = trim((string)$meta->name);
                } elseif (isset($supabaseUser->name) && trim((string)$supabaseUser->name) !== '') {
                    $fullName = trim((string)$supabaseUser->name);
                } elseif ($first !== '' || $last !== '') {
                    $fullName = trim($first . ' ' . $last);
                }
            }
            
            // Get role from metadata
            $role = isset($meta->role) ? (string)$meta->role : 'dispatcher';

            // 1) Try existing mapping by supabase_user_id
            $selectBySupabase = $pdo->prepare("SELECT * FROM users WHERE supabase_user_id = :sid LIMIT 1");
            $selectBySupabase->execute([':sid' => $supabaseId]);
            $existing = $selectBySupabase->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                // If existing record lacks email or full_name, try to backfill
                $needsUpdate = false;
                $updateParts = [];
                $updateParams = [':id' => $existing['id']];
                $hasEmailCol = array_key_exists('email', $existing);
                $hasFullNameCol = array_key_exists('full_name', $existing);

                // Helper: detect if a string looks like an email
                $looksLikeEmail = function($s) {
                    return is_string($s) && strpos($s, '@') !== false;
                };

                // Backfill email if empty
                if ($hasEmailCol && (empty($existing['email']) || $existing['email'] === '')) {
                    if (!empty($email)) {
                        $updateParts[] = 'email = :email';
                        $updateParams[':email'] = $email;
                        $needsUpdate = true;
                    } elseif ($hasFullNameCol && $looksLikeEmail($existing['full_name'])) {
                        // If full_name actually contains an email, move it to email
                        $updateParts[] = 'email = :email_from_fullname';
                        $updateParams[':email_from_fullname'] = $existing['full_name'];
                        $needsUpdate = true;
                    }
                }

                // Backfill/clean full_name
                if ($hasFullNameCol) {
                    $currentFullName = $existing['full_name'];
                    // If full_name is empty or equals the email string, and we have a proper fullName, set it
                    if (!empty($fullName) && (empty($currentFullName) || $currentFullName === $email || $looksLikeEmail($currentFullName))) {
                        $updateParts[] = 'full_name = :full_name';
                        $updateParams[':full_name'] = $fullName;
                        $needsUpdate = true;
                    }
                }
                if ($needsUpdate && !empty($updateParts)) {
                    $upd = $pdo->prepare('UPDATE users SET ' . implode(', ', $updateParts) . ' WHERE id = :id');
                    $upd->execute($updateParams);
                    // Re-fetch updated row so callers get fresh values
                    $refetch = $pdo->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
                    $refetch->execute([':id' => $existing['id']]);
                    $existing = $refetch->fetch(PDO::FETCH_ASSOC) ?: $existing;
                }
                return $existing;
            }

            // 2) Create a new MySQL user record mapped to Supabase

            // Username generation strategy (unique, deterministic where possible)
            $baseUsername = null;
            if ($email && strpos($email, '@') !== false) {
                $baseUsername = preg_replace('/[^a-z0-9._-]/i', '', substr($email, 0, strpos($email, '@')));
            }
            if (!$baseUsername && isset($meta->username)) {
                $baseUsername = preg_replace('/[^a-z0-9._-]/i', '', (string)$meta->username);
            }
            if (!$baseUsername && $fullName) {
                // e.g., "John Doe" -> "john.doe"
                $baseUsername = strtolower(preg_replace('/\s+/', '.', preg_replace('/[^a-z0-9\s]/i', '', $fullName)));
            }
            if (!$baseUsername || $baseUsername === '') {
                $baseUsername = 'user_' . substr($supabaseId, 0, 8);
            }

            // Ensure uniqueness by appending a numeric suffix if needed
            $username = $baseUsername;
            $suffix = 0;
            $checkUsername = $pdo->prepare("SELECT id FROM users WHERE username = :u LIMIT 1");
            while (true) {
                $checkUsername->execute([':u' => $username]);
                $row = $checkUsername->fetch(PDO::FETCH_ASSOC);
                if (!$row) break;
                $suffix++;
                $username = $baseUsername . $suffix;
            }

            // Generate a random password hash (not used for Supabase-logins)
            $randomSecret = bin2hex(random_bytes(16));
            $passwordHash = password_hash($randomSecret, PASSWORD_DEFAULT);

            // Only log insert values when debugging is explicitly enabled
            if (isset($_SERVER['HTTP_X_DEBUG_AUTH']) && $_SERVER['HTTP_X_DEBUG_AUTH'] === '1') {
                Logger::warning('ensureMysqlUser insert values', [
                    'email' => $email,
                    'fullName' => $fullName,
                    'role' => $role,
                    'username' => $username,
                    'supabaseId' => $supabaseId
                ]);
            }
            
            // Insert new user
            $insert = $pdo->prepare(
                "INSERT INTO users (username, password, full_name, email, mobile_number, role, supabase_user_id)\n"
                . "VALUES (:username, :password, :full_name, :email, :mobile_number, :role, :supabase_user_id)"
            );
            $insert->execute([
                ':username' => $username,
                ':password' => $passwordHash,
                // Do not use email as full_name fallback; let it be null if not provided
                ':full_name' => $fullName ?: null,
                ':email' => $email ?: '',  // Ensure email is never null
                // Some schemas require mobile_number NOT NULL; store empty string by default
                ':mobile_number' => isset($meta->mobile_number) ? (string)$meta->mobile_number : '',
                ':role' => $role,
                ':supabase_user_id' => $supabaseId,
            ]);

            $newId = $pdo->lastInsertId();
            if (!$newId) {
                return null;
            }

            // Return the created row
            $fetch = $pdo->prepare("SELECT * FROM users WHERE id = :id LIMIT 1");
            $fetch->execute([':id' => $newId]);
            $created = $fetch->fetch(PDO::FETCH_ASSOC);

            Logger::info('Created MySQL user mapped to Supabase user', [
                'mysql_user_id' => $newId,
                'supabase_user_id' => $supabaseId,
                'username' => $username,
                'role' => $role
            ]);

            return $created ?: null;
        } catch (PDOException $e) {
            Logger::error('ensureMysqlUser database error', [
                'error' => $e->getMessage()
            ]);
            return null;
        } catch (\Throwable $e) {
            Logger::error('ensureMysqlUser unexpected error', [
                'error' => $e->getMessage()
            ]);
            return null;
        }
    }
}
