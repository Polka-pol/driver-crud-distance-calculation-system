<?php

namespace App\Core;

use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;

/**
 * TimeService centralizes time handling with UTC at rest and App Timezone for presentation.
 */
class TimeService
{
    public static function getActiveTimezone(): DateTimeZone
    {
        $tz = SettingsService::getActiveTimezone();
        try {
            return new DateTimeZone($tz);
        } catch (\Exception $e) {
            return new DateTimeZone('America/New_York');
        }
    }

    public static function nowUtc(): DateTimeImmutable
    {
        return new DateTimeImmutable('now', new DateTimeZone('UTC'));
    }

    public static function nowAppTz(): DateTimeImmutable
    {
        return self::convertUtcToAppTz(self::nowUtc());
    }

    public static function convertUtcToAppTz(DateTimeInterface|string $utc): DateTimeImmutable
    {
        $utcDt = $utc instanceof DateTimeInterface
            ? new DateTimeImmutable($utc->format('Y-m-d H:i:s'), new DateTimeZone('UTC'))
            : new DateTimeImmutable((string)$utc, new DateTimeZone('UTC'));

        return $utcDt->setTimezone(self::getActiveTimezone());
    }

    public static function convertAppTzToUtc(DateTimeInterface|string $local): DateTimeImmutable
    {
        $appTz = self::getActiveTimezone();
        $dt = $local instanceof DateTimeInterface
            ? new DateTimeImmutable($local->format('Y-m-d H:i:s'), $appTz)
            : new DateTimeImmutable((string)$local, $appTz);

        return $dt->setTimezone(new DateTimeZone('UTC'));
    }

    public static function startOfDayAppTz(DateTimeInterface|string $ts): DateTimeImmutable
    {
        $appTz = self::getActiveTimezone();
        $dt = $ts instanceof DateTimeInterface
            ? new DateTimeImmutable($ts->format('Y-m-d H:i:s'), $appTz)
            : new DateTimeImmutable((string)$ts, $appTz);

        $date = $dt->format('Y-m-d');
        return new DateTimeImmutable($date . ' 00:00:00', $appTz);
    }

    /**
     * Parses client-provided timestamp. If input has offset/"Z", trust it. If not, assume App TZ.
     * Returns UTC.
     */
    public static function parseFromClientToUtc(string|int $input): DateTimeImmutable
    {
        if (is_int($input) || ctype_digit((string)$input)) {
            // epoch ms or s
            $value = (int)$input;
            if ($value > 9999999999) { // ms
                $value = (int)floor($value / 1000);
            }
            return (new DateTimeImmutable('@' . $value))->setTimezone(new DateTimeZone('UTC'));
        }

        $str = (string)$input;
        // If contains Z or +/-HH:MM, treat as absolute
        if (preg_match('/Z$|[\+\-]\d{2}:\d{2}$/', $str)) {
            return (new DateTimeImmutable($str))->setTimezone(new DateTimeZone('UTC'));
        }

        // Otherwise interpret as App TZ local
        $appTz = self::getActiveTimezone();
        $local = new DateTimeImmutable($str, $appTz);
        return $local->setTimezone(new DateTimeZone('UTC'));
    }
}
