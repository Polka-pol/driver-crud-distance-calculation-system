<?php

namespace App\Controllers;

use App\Core\Database;
use App\Core\Auth;
use App\Core\Logger;
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
     * Day counted from 6:00 AM to 6:00 AM server time
     */
    private static function getTodayStatsAllDispatchers($pdo)
    {
        // Calculate the "working day" boundaries (6 AM to 6 AM)
        $now = new \DateTime();
        $currentHour = (int)$now->format('H');
        
        if ($currentHour >= 6) {
            // After 6 AM today, so working day is 6 AM today to 6 AM tomorrow
            $workingDayStart = $now->format('Y-m-d') . ' 06:00:00';
            $workingDayEnd = $now->modify('+1 day')->format('Y-m-d') . ' 06:00:00';
        } else {
            // Before 6 AM today, so working day is 6 AM yesterday to 6 AM today
            $workingDayStart = $now->modify('-1 day')->format('Y-m-d') . ' 06:00:00';
            $workingDayEnd = $now->modify('+1 day')->format('Y-m-d') . ' 06:00:00';
        }

        $stmt = $pdo->prepare("
            SELECT 
                u.id,
                u.username,
                u.full_name,
                u.role,
                COUNT(CASE WHEN a.action = 'distance_batch_calculated' 
                      AND JSON_EXTRACT(a.details, '$.query_type') = 'cache_check_with_stats' 
                      THEN 1 END) as today_calculations,
                COUNT(CASE WHEN a.action = 'truck_updated' THEN 1 END) as today_updates
            FROM users u
            LEFT JOIN activity_logs a ON u.id = a.user_id 
                AND a.created_at >= :start_time 
                AND a.created_at < :end_time
            WHERE u.role IN ('dispatcher', 'manager', 'admin')
            GROUP BY u.id, u.username, u.full_name, u.role
            ORDER BY today_calculations DESC, today_updates DESC, u.full_name ASC
        ");
        
        $stmt->execute([
            ':start_time' => $workingDayStart,
            ':end_time' => $workingDayEnd
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
        // Get current month data
        $currentDate = new \DateTime();
        $year = $currentDate->format('Y');
        $month = $currentDate->format('m');
        
        // Get first and last day of month
        $firstDayOfMonth = new \DateTime("$year-$month-01");
        $lastDayOfMonth = clone $firstDayOfMonth;
        $lastDayOfMonth->modify('last day of this month');
        
        // Get daily statistics for the month with 6AM-6AM logic
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
     * Get daily statistics for a month with 6AM-6AM working day logic
     */
    private static function getMonthlyDailyStats($pdo, $dispatcherId, $startDate, $endDate)
    {
        $stats = [];
        $current = clone $startDate;
        
        while ($current <= $endDate) {
            $workingDayStart = $current->format('Y-m-d') . ' 06:00:00';
            $workingDayEnd = clone $current;
            $workingDayEnd->modify('+1 day');
            $workingDayEnd = $workingDayEnd->format('Y-m-d') . ' 06:00:00';
            
            $stmt = $pdo->prepare("
                SELECT 
                    COUNT(CASE WHEN a.action = 'distance_batch_calculated' 
                          AND JSON_EXTRACT(a.details, '$.query_type') = 'cache_check_with_stats' 
                          THEN 1 END) as calculations,
                    COUNT(CASE WHEN a.action = 'truck_updated' THEN 1 END) as updates
                FROM activity_logs a
                WHERE a.user_id = :user_id 
                  AND a.created_at >= :start_time 
                  AND a.created_at < :end_time
            ");
            
            $stmt->execute([
                ':user_id' => $dispatcherId,
                ':start_time' => $workingDayStart,
                ':end_time' => $workingDayEnd
            ]);
            
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            
            $stats[$current->format('Y-m-d')] = [
                'calculations' => (int)$result['calculations'],
                'updates' => (int)$result['updates']
            ];
            
            $current->modify('+1 day');
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
                $isToday = $current->format('Y-m-d') === date('Y-m-d');
                $isFuture = $current > new \DateTime();
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
        // Get current month data
        $currentDate = new \DateTime();
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
            $isToday = $current->format('Y-m-d') === date('Y-m-d');
            $isFuture = $current > new \DateTime();
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