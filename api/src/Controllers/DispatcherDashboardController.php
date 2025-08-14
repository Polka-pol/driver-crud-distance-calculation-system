<?php

namespace App\Controllers;

use App\Core\Database;
use App\Core\Auth;
use App\Core\Logger;
use App\Core\EDTTimeConverter;
use PDO;
use PDOException;
use Exception;

class DispatcherDashboardController
{
    private static function sendResponse($data, $statusCode = 200)
    {
        http_response_code($statusCode);
        header('Content-Type: application/json');
        echo json_encode($data);
    }

    /**
     * Get dashboard data for all dispatchers
     */
    public static function getDashboardData()
    {
        try {
            $pdo = Database::getConnection();

            // Get all dispatchers
            $dispatchers = self::getAllDispatchers($pdo);

            // Get today's stats for all dispatchers
            $todayStats = self::getTodayStatsAllDispatchers($pdo);

            // Check if heatmap mode is requested
            $heatmapMode = isset($_GET['heatmap']) && $_GET['heatmap'] === 'true';

            if ($heatmapMode) {
                // Get heatmap data for all dispatchers
                $heatmapData = self::getHeatmapDataAllDispatchers($pdo);

                self::sendResponse([
                    'dispatchers' => $dispatchers,
                    'today_stats' => $todayStats,
                    'heatmap_data' => $heatmapData
                ]);
                return;
            }

            // Original logic for single dispatcher
            $selectedDispatcherId = $_GET['dispatcher_id'] ?? null;
            $currentUser = Auth::getCurrentUser();

            if (!$selectedDispatcherId && $currentUser) {
                $selectedDispatcherId = $currentUser->id;
            }

            // Get monthly calendar data for selected dispatcher
            $monthlyData = null;
            if ($selectedDispatcherId) {
                $monthlyData = self::getMonthlyCalendarData($pdo, $selectedDispatcherId);
            }

            self::sendResponse([
                'dispatchers' => $dispatchers,
                'today_stats' => $todayStats,
                'selected_dispatcher_id' => $selectedDispatcherId,
                'monthly_data' => $monthlyData
            ]);
        } catch (Exception $e) {
            Logger::error('Failed to get dispatcher dashboard data', ['error' => $e->getMessage()]);
            self::sendResponse(['error' => 'Failed to fetch dashboard data'], 500);
        }
    }

    /**
     * Get all dispatchers from users table
     */
    private static function getAllDispatchers($pdo)
    {
        $stmt = $pdo->prepare("
            SELECT id, username, full_name, role
            FROM users 
            WHERE role IN ('dispatcher', 'manager', 'admin')
            ORDER BY full_name ASC
        ");
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Get today's statistics for all dispatchers
     * Day counted from midnight to midnight
     */
    private static function getTodayStatsAllDispatchers($pdo)
    {
        // Compute App TZ day bounds and convert to UTC for sargable range filtering
        $todayStartApp = \App\Core\TimeService::startOfDayAppTz(\App\Core\TimeService::nowAppTz());
        $tomorrowStartApp = $todayStartApp->modify('+1 day');
        $startUtc = \App\Core\TimeService::convertAppTzToUtc($todayStartApp)->format('Y-m-d H:i:s');
        $endUtc = \App\Core\TimeService::convertAppTzToUtc($tomorrowStartApp)->format('Y-m-d H:i:s');

        $stmt = $pdo->prepare("
            SELECT 
                u.id,
                u.username,
                u.full_name,
                u.role,
                SUM(CASE WHEN a.action = 'distance_batch_calculated' 
                      AND (JSON_EXTRACT(a.details, '$.query_type') = 'optimized_with_turf' 
                           OR JSON_EXTRACT(a.details, '$.query_type') = 'cache_check_with_stats')
                      THEN 1 ELSE 0 END) as today_calculations,
                SUM(CASE WHEN a.action = 'truck_updated' THEN 1 ELSE 0 END) as today_updates
            FROM users u
            LEFT JOIN activity_logs a ON u.id = a.user_id 
                AND a.created_at >= :start_utc
                AND a.created_at < :end_utc
            WHERE u.role IN ('dispatcher', 'manager', 'admin')
            GROUP BY u.id, u.username, u.full_name, u.role
            ORDER BY today_calculations DESC, today_updates DESC, u.full_name ASC
        ");

        $stmt->execute([
            ':start_utc' => $startUtc,
            ':end_utc' => $endUtc
        ]);

        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Add goal status for each dispatcher
        foreach ($results as &$dispatcher) {
            $dispatcher['today_calculations'] = (int)$dispatcher['today_calculations'];
            $dispatcher['today_updates'] = (int)$dispatcher['today_updates'];
            $dispatcher['goal_status'] = self::getGoalStatus(
                $dispatcher['today_calculations'],
                $dispatcher['today_updates']
            );
        }

        return $results;
    }

    /**
     * Get monthly calendar data for specific dispatcher
     */
    private static function getMonthlyCalendarData($pdo, $dispatcherId)
    {
        // Get current month data using EDT
        $currentDate = new \DateTime(EDTTimeConverter::getCurrentEDT());
        $year = $currentDate->format('Y');
        $month = $currentDate->format('m');

        // Get first and last day of month
        $firstDayOfMonth = new \DateTime("$year-$month-01");
        $lastDayOfMonth = clone $firstDayOfMonth;
        $lastDayOfMonth->modify('last day of this month');

        // Get daily statistics for the month with standard day boundaries
        $dailyStats = self::getMonthlyDailyStats($pdo, $dispatcherId, $firstDayOfMonth, $lastDayOfMonth);

        // Generate calendar grid
        $calendarData = self::generateCalendarGrid($firstDayOfMonth, $lastDayOfMonth, $dailyStats);

        return [
            'year' => (int)$year,
            'month' => (int)$month,
            'month_name' => $currentDate->format('F'),
            'calendar_data' => $calendarData
        ];
    }

    /**
     * Get daily statistics for a month with standard day boundaries
     */
    private static function getMonthlyDailyStats($pdo, $dispatcherId, $startDate, $endDate)
    {
        // Compute App TZ month bounds and convert to UTC range
        $appTz = \App\Core\TimeService::getActiveTimezone();
        $startApp = (new \DateTimeImmutable($startDate->format('Y-m-d'), $appTz))->setTime(0, 0, 0);
        $endAppExclusive = (new \DateTimeImmutable($endDate->format('Y-m-d'), $appTz))->modify('+1 day')->setTime(0, 0, 0);
        $startUtc = \App\Core\TimeService::convertAppTzToUtc($startApp)->format('Y-m-d H:i:s');
        $endUtc = \App\Core\TimeService::convertAppTzToUtc($endAppExclusive)->format('Y-m-d H:i:s');

        // Fetch all logs in one go for the user within the range
        $stmt = $pdo->prepare("
            SELECT 
                a.action,
                a.created_at
            FROM activity_logs a
            WHERE a.user_id = :user_id
              AND a.created_at >= :start_utc
              AND a.created_at < :end_utc
        ");
        $stmt->execute([
            ':user_id' => $dispatcherId,
            ':start_utc' => $startUtc,
            ':end_utc' => $endUtc,
        ]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Aggregate by App TZ date
        $stats = [];
        $current = new \DateTimeImmutable($startApp->format('Y-m-d'), $appTz);
        while ($current < $endAppExclusive) {
            $stats[$current->format('Y-m-d')] = ['calculations' => 0, 'updates' => 0];
            $current = $current->modify('+1 day');
        }

        foreach ($rows as $row) {
            $createdUtc = new \DateTimeImmutable($row['created_at'], new \DateTimeZone('UTC'));
            $createdApp = $createdUtc->setTimezone($appTz);
            $dateKey = $createdApp->format('Y-m-d');
            if (!isset($stats[$dateKey])) {
                $stats[$dateKey] = ['calculations' => 0, 'updates' => 0];
            }
            if ($row['action'] === 'distance_batch_calculated') {
                // Optionally filter by JSON details if required
                $stats[$dateKey]['calculations'] += 1;
            } elseif ($row['action'] === 'truck_updated') {
                $stats[$dateKey]['updates'] += 1;
            }
        }

        return $stats;
    }

    /**
     * Generate calendar grid for the month
     */
    private static function generateCalendarGrid($firstDayOfMonth, $lastDayOfMonth, $dailyStats)
    {
        $calendarData = [];
        $current = clone $firstDayOfMonth;

        // Start from Monday of the week containing the first day
        $current->modify('monday this week');

        // Generate 6 weeks (42 days) to ensure full month coverage
        for ($week = 0; $week < 6; $week++) {
            $weekData = [];

            for ($day = 0; $day < 7; $day++) {
                $dateStr = $current->format('Y-m-d');
                $isCurrentMonth = $current->format('m') == $firstDayOfMonth->format('m');
                $isToday = $current->format('Y-m-d') === EDTTimeConverter::getCurrentEDTDate();
                $isFuture = $current > new \DateTime(EDTTimeConverter::getCurrentEDT());
                $isWeekend = in_array($current->format('w'), [0, 6]); // Sunday = 0, Saturday = 6

                $dayStats = $dailyStats[$dateStr] ?? ['calculations' => 0, 'updates' => 0];

                $dayData = [
                    'date' => $dateStr,
                    'day' => (int)$current->format('d'),
                    'is_current_month' => $isCurrentMonth,
                    'is_today' => $isToday,
                    'is_future' => $isFuture,
                    'is_weekend' => $isWeekend,
                    'calculations' => $dayStats['calculations'],
                    'updates' => $dayStats['updates'],
                    'goal_status' => $isWeekend ? 'weekend' : self::getGoalStatus($dayStats['calculations'], $dayStats['updates'])
                ];

                $weekData[] = $dayData;
                $current->modify('+1 day');
            }

            $calendarData[] = $weekData;
        }

        return $calendarData;
    }

    /**
     * Get goal status based on calculations and updates
     */
    private static function getGoalStatus($calculations, $updates)
    {
        if ($calculations >= 50 && $updates >= 75) {
            return 'achieved'; // Green
        } elseif ($calculations >= 25 && $updates >= 75) {
            return 'partial'; // Yellow
        } else {
            return 'missed'; // Gray
        }
    }

    /**
     * Get heatmap data for all dispatchers
     */
    private static function getHeatmapDataAllDispatchers($pdo)
    {
        // Get current month data using EDT
        $currentDate = new \DateTime(EDTTimeConverter::getCurrentEDT());
        $year = $currentDate->format('Y');
        $month = $currentDate->format('m');

        // Get first and last day of month
        $firstDayOfMonth = new \DateTime("$year-$month-01");
        $lastDayOfMonth = clone $firstDayOfMonth;
        $lastDayOfMonth->modify('last day of this month');

        // Get all dispatchers
        $dispatchers = self::getAllDispatchers($pdo);

        // Get daily statistics for all dispatchers
        $dispatcherData = [];
        foreach ($dispatchers as $dispatcher) {
            $dailyStats = self::getMonthlyDailyStats($pdo, $dispatcher['id'], $firstDayOfMonth, $lastDayOfMonth);

            $dispatcherData[] = [
                'id' => $dispatcher['id'],
                'username' => $dispatcher['username'],
                'full_name' => $dispatcher['full_name'],
                'role' => $dispatcher['role'],
                'daily_stats' => $dailyStats
            ];
        }

        // Generate list of all days in month
        $monthDays = [];
        $current = clone $firstDayOfMonth;
        while ($current <= $lastDayOfMonth) {
            $isToday = $current->format('Y-m-d') === EDTTimeConverter::getCurrentEDTDate();
            $isFuture = $current > new \DateTime(EDTTimeConverter::getCurrentEDT());
            $isWeekend = in_array($current->format('w'), [0, 6]);

            $monthDays[] = [
                'date' => $current->format('Y-m-d'),
                'day' => (int)$current->format('d'),
                'is_today' => $isToday,
                'is_future' => $isFuture,
                'is_weekend' => $isWeekend
            ];
            $current->modify('+1 day');
        }

        return [
            'year' => (int)$year,
            'month' => (int)$month,
            'month_name' => $currentDate->format('F'),
            'month_days' => $monthDays,
            'dispatcher_data' => $dispatcherData
        ];
    }
}
