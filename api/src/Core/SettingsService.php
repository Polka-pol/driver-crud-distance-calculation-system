<?php

namespace App\Core;

use PDO;
use PDOException;

/**
 * SettingsService provides access to application-wide settings stored in the database.
 * It currently supports reading and updating the active application timezone (IANA ID).
 */
class SettingsService
{
    private const TABLE_NAME = 'settings';
    private const KEY_ACTIVE_TIMEZONE = 'active_timezone';
    private const DEFAULT_TIMEZONE = 'America/New_York';

    // Simple per-process cache to avoid repeated DB lookups in a single request lifecycle
    private static $cachedTimezone = null;

    /**
     * Ensures the settings table exists. Creates it if missing.
     */
    private static function ensureTableExists(PDO $pdo): void
    {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS `" . self::TABLE_NAME . "` (
				`key` VARCHAR(64) NOT NULL PRIMARY KEY,
				`value` TEXT NOT NULL,
				`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
        );
    }

    /**
     * Returns the active application timezone (IANA string). Falls back to default if not set.
     */
    public static function getActiveTimezone(): string
    {
        if (self::$cachedTimezone !== null) {
            return self::$cachedTimezone;
        }

        $pdo = Database::getConnection();
        if (!$pdo) {
            self::$cachedTimezone = self::DEFAULT_TIMEZONE;
            return self::$cachedTimezone;
        }

        try {
            self::ensureTableExists($pdo);

            $stmt = $pdo->prepare("SELECT `value` FROM `" . self::TABLE_NAME . "` WHERE `key` = :key LIMIT 1");
            $stmt->execute([':key' => self::KEY_ACTIVE_TIMEZONE]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && !empty($row['value'])) {
                self::$cachedTimezone = $row['value'];
                return self::$cachedTimezone;
            }

            // Seed default if not present
            $default = self::DEFAULT_TIMEZONE;
            $insert = $pdo->prepare("INSERT IGNORE INTO `" . self::TABLE_NAME . "` (`key`, `value`) VALUES (:key, :value)");
            $insert->execute([':key' => self::KEY_ACTIVE_TIMEZONE, ':value' => $default]);
            self::$cachedTimezone = $default;
            return self::$cachedTimezone;
        } catch (PDOException $e) {
            // On any DB error, fall back to default timezone
            self::$cachedTimezone = self::DEFAULT_TIMEZONE;
            return self::$cachedTimezone;
        }
    }

    /**
     * Sets the active application timezone (IANA string). Returns true on success.
     */
    public static function setActiveTimezone(string $ianaTimezone): bool
    {
        // Validate timezone by attempting to construct a DateTimeZone
        try {
            new \DateTimeZone($ianaTimezone);
        } catch (\Exception $e) {
            return false;
        }

        $pdo = Database::getConnection();
        if (!$pdo) {
            return false;
        }

        try {
            self::ensureTableExists($pdo);

            $stmt = $pdo->prepare(
                "INSERT INTO `" . self::TABLE_NAME . "` (`key`, `value`) VALUES (:key, :value)
				 ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)"
            );
            $stmt->execute([
                ':key' => self::KEY_ACTIVE_TIMEZONE,
                ':value' => $ianaTimezone
            ]);
            // Update cache immediately
            self::$cachedTimezone = $ianaTimezone;
            return true;
        } catch (PDOException $e) {
            return false;
        }
    }
}
