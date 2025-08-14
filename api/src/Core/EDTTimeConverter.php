<?php

namespace App\Core;

class EDTTimeConverter
{
    // DEPRECATED: Use TimeService instead. Kept for backward compatibility during migration.
    /**
     * Конвертує UTC час в EDT
     */
    public static function convertToEDT($utcTime)
    {
        $dt = TimeService::convertUtcToAppTz(new \DateTimeImmutable($utcTime, new \DateTimeZone('UTC')));
        return $dt->format('Y-m-d H:i:s');
    }

    /**
     * Отримує поточний час в EDT
     */
    public static function getCurrentEDT()
    {
        return TimeService::nowAppTz()->format('Y-m-d H:i:s');
    }

    /**
     * Конвертує EDT час назад в UTC для збереження
     */
    public static function convertEDTToUTC($edtTime)
    {
        return TimeService::convertAppTzToUtc(new \DateTimeImmutable($edtTime))->format('Y-m-d H:i:s');
    }

    /**
     * Отримує поточну дату в EDT
     */
    public static function getCurrentEDTDate()
    {
        return TimeService::nowAppTz()->format('Y-m-d');
    }

    /**
     * Отримує поточний час в EDT для порівняння
     */
    public static function getCurrentEDTDateTime()
    {
        return TimeService::nowAppTz()->format('Y-m-d H:i:s');
    }

    /**
     * Конвертує час з телефону (який може бути в різних форматах) в EDT
     */
    public static function convertPhoneTimeToEDT($phoneTime)
    {
        try {
            $utc = TimeService::parseFromClientToUtc($phoneTime);
            return TimeService::convertUtcToAppTz($utc)->format('Y-m-d H:i:s');
        } catch (\Throwable $e) {
            return self::getCurrentEDT();
        }
    }
}
