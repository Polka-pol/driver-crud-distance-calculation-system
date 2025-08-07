<?php

namespace App\Core;

class EDTTimeConverter
{
    /**
     * Конвертує UTC час в EDT
     */
    public static function convertToEDT($utcTime)
    {
        $date = new \DateTime($utcTime, new \DateTimeZone('UTC'));
        $date->setTimezone(new \DateTimeZone('America/New_York'));
        return $date->format('Y-m-d H:i:s');
    }
    
    /**
     * Отримує поточний час в EDT
     */
    public static function getCurrentEDT()
    {
        $date = new \DateTime('now', new \DateTimeZone('America/New_York'));
        return $date->format('Y-m-d H:i:s');
    }
    
    /**
     * Конвертує EDT час назад в UTC для збереження
     */
    public static function convertEDTToUTC($edtTime)
    {
        $date = new \DateTime($edtTime, new \DateTimeZone('America/New_York'));
        $date->setTimezone(new \DateTimeZone('UTC'));
        return $date->format('Y-m-d H:i:s');
    }
    
    /**
     * Отримує поточну дату в EDT
     */
    public static function getCurrentEDTDate()
    {
        $date = new \DateTime('now', new \DateTimeZone('America/New_York'));
        return $date->format('Y-m-d');
    }
    
    /**
     * Отримує поточний час в EDT для порівняння
     */
    public static function getCurrentEDTDateTime()
    {
        $date = new \DateTime('now', new \DateTimeZone('America/New_York'));
        return $date->format('Y-m-d H:i:s');
    }
    
    /**
     * Конвертує час з телефону (який може бути в різних форматах) в EDT
     */
    public static function convertPhoneTimeToEDT($phoneTime)
    {
        // Спробуємо різні формати часу
        $formats = [
            'Y-m-d\TH:i:s.v\Z', // ISO 8601 з мілісекундами
            'Y-m-d\TH:i:s\Z',   // ISO 8601 без мілісекунд
            'Y-m-d H:i:s',      // MySQL формат
            'Y-m-d\TH:i:s.vP',  // ISO 8601 з часовим поясом
            'Y-m-d\TH:i:sP'     // ISO 8601 з часовим поясом
        ];
        
        foreach ($formats as $format) {
            $date = \DateTime::createFromFormat($format, $phoneTime);
            if ($date !== false) {
                // Конвертуємо в EDT
                $date->setTimezone(new \DateTimeZone('America/New_York'));
                return $date->format('Y-m-d H:i:s');
            }
        }
        
        // Якщо нічого не спрацювало, повертаємо поточний EDT час
        return self::getCurrentEDT();
    }
} 