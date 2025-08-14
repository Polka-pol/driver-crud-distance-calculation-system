<?php

namespace App\Controllers;

use App\Core\Auth;
use App\Core\SettingsService;
use App\Core\TimeService;
use App\Core\ActivityLogger;
use App\Core\Database;

class SettingsController
{
    private static function sendResponse($data, $statusCode = 200)
    {
        http_response_code($statusCode);
        header('Content-Type: application/json');
        echo json_encode($data);
    }

    public static function getTimezone()
    {
        $tz = SettingsService::getActiveTimezone();
        self::sendResponse(['timezone' => $tz]);
    }

    public static function updateTimezone()
    {
        Auth::protect(['admin']);

        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $tz = $data['timezone'] ?? '';
        if (!$tz) {
            self::sendResponse(['success' => false, 'message' => 'timezone is required'], 400);
            return;
        }
        $previousTz = SettingsService::getActiveTimezone();
        $ok = SettingsService::setActiveTimezone($tz);
        if (!$ok) {
            self::sendResponse(['success' => false, 'message' => 'Invalid timezone'], 400);
            return;
        }
        $user = Auth::getCurrentUser();
        ActivityLogger::log('app_timezone_changed', [
            'previous_timezone' => $previousTz,
            'new_timezone' => $tz,
            'changed_by_user_id' => $user->id ?? null,
            'changed_by_username' => $user->username ?? ($user->fullName ?? null),
        ]);
        self::sendResponse(['success' => true, 'timezone' => $tz]);
    }

    public static function getServerTime()
    {
        $nowUtc = TimeService::nowUtc()->format(DATE_ATOM);
        $nowApp = TimeService::nowAppTz()->format(DATE_ATOM);
        $tz = SettingsService::getActiveTimezone();
        http_response_code(200);
        header('Content-Type: application/json');
        header('X-App-Timezone: ' . $tz);
        header('X-Server-Now: ' . $nowUtc);
        echo json_encode([
            'now_utc' => $nowUtc,
            'now_app_tz' => $nowApp,
            'app_timezone' => $tz
        ]);
    }

    public static function getTimezoneLastChange()
    {
        try {
            $pdo = Database::getConnection();
            if (!$pdo) {
                self::sendResponse(['success' => false, 'message' => 'DB connection error'], 500);
                return;
            }
            $stmt = $pdo->prepare("SELECT details, created_at FROM activity_logs WHERE action = 'app_timezone_changed' ORDER BY created_at DESC LIMIT 1");
            $stmt->execute();
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                self::sendResponse(['success' => true, 'last_change' => null]);
                return;
            }
            $details = json_decode($row['details'] ?? '{}', true) ?: [];
            self::sendResponse([
                'success' => true,
                'last_change' => [
                    'previous_timezone' => $details['previous_timezone'] ?? null,
                    'new_timezone' => $details['new_timezone'] ?? null,
                    'changed_by_user_id' => $details['changed_by_user_id'] ?? null,
                    'changed_by_username' => $details['changed_by_username'] ?? null,
                    'created_at' => $row['created_at'] ?? null,
                ]
            ]);
        } catch (\Throwable $e) {
            self::sendResponse(['success' => false, 'message' => 'Failed to load last change'], 500);
        }
    }
}
