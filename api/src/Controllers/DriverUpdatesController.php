<?php

namespace App\Controllers;

use App\Core\Database;
use App\Core\Auth;
use App\Core\Logger;
use PDO;
use Exception;
use DateTime;

class DriverUpdatesController
{
    private static function sendResponse($data, $statusCode = 200)
    {
        http_response_code($statusCode);
        header('Content-Type: application/json');
        echo json_encode($data);
    }

    /**
     * Get driver status categorizations for daily updates and monthly review
     */
    public static function getDriverStatuses()
    {
        try {
            $pdo = Database::getConnection();
            $currentUser = Auth::getCurrentUser();
            
            // Get query parameters
            $view = $_GET['view'] ?? 'my'; // 'my', 'all', or 'unassigned'
            $tab = $_GET['tab'] ?? 'daily'; // 'daily' or 'monthly'
            
            $drivers = [];
            
            if ($tab === 'daily') {
                $drivers = self::getDailyUpdateStatuses($pdo, $currentUser, $view);
            } else if ($tab === 'monthly') {
                $drivers = self::getMonthlyReviewDrivers($pdo, $currentUser, $view);
            }
            
            self::sendResponse([
                'success' => true,
                'drivers' => $drivers,
                'view' => $view,
                'tab' => $tab
            ]);

        } catch (Exception $e) {
            Logger::error('Failed to get driver statuses', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            self::sendResponse([
                'success' => false, 
                'message' => 'Could not retrieve driver statuses'
            ], 500);
        }
    }

    /**
     * Get drivers categorized for daily updates
     */
    private static function getDailyUpdateStatuses($pdo, $currentUser, $view)
    {
        $today = date('Y-m-d');
        $now = date('Y-m-d H:i:s');
        
        // Base query
        $sql = "
            SELECT 
                ID,
                TruckNumber,
                DriverName,
                CellPhone,
                contactphone,
                Status,
                CityStateZip,
                WhenWillBeThere,
                assigned_dispatcher_id,
                no_need_update_until,
                no_need_update_reason,
                no_need_update_comment,
                updated_at
            FROM Trucks 
            WHERE 1=1
        ";
        
        $params = [];
        
        // Filter by dispatcher based on view
        if ($view === 'my' && $currentUser) {
            $sql .= " AND assigned_dispatcher_id = :dispatcher_id";
            $params['dispatcher_id'] = $currentUser->id;
        } elseif ($view === 'unassigned') {
            $sql .= " AND (assigned_dispatcher_id IS NULL OR assigned_dispatcher_id = '')";
        }
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $allDrivers = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $categorized = [
            'need_update' => [],
            'updated' => [],
            'no_need_update' => []
        ];
        
        foreach ($allDrivers as $driver) {
            $category = self::categorizeDriver($driver, $today, $now);
            $categorized[$category][] = $driver;
        }
        
        return $categorized;
    }

    /**
     * Get drivers who haven't updated in more than a month
     */
    private static function getMonthlyReviewDrivers($pdo, $currentUser, $view)
    {
        $oneMonthAgo = date('Y-m-d', strtotime('-30 days'));
        
        $sql = "
            SELECT 
                ID,
                TruckNumber,
                DriverName,
                CellPhone,
                contactphone,
                Status,
                CityStateZip,
                WhenWillBeThere,
                assigned_dispatcher_id,
                no_need_update_until,
                no_need_update_reason,
                no_need_update_comment,
                updated_at
            FROM Trucks 
            WHERE (WhenWillBeThere IS NULL OR WhenWillBeThere < :one_month_ago OR WhenWillBeThere = '')
        ";
        
        $params = ['one_month_ago' => $oneMonthAgo];
        
        // Filter by dispatcher based on view
        if ($view === 'my' && $currentUser) {
            $sql .= " AND assigned_dispatcher_id = :dispatcher_id";
            $params['dispatcher_id'] = $currentUser->id;
        } elseif ($view === 'unassigned') {
            $sql .= " AND (assigned_dispatcher_id IS NULL OR assigned_dispatcher_id = '')";
        }
        
        $sql .= " ORDER BY WhenWillBeThere ASC";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Categorize a single driver based on their status
     */
    private static function categorizeDriver($driver, $today, $now)
    {
        // Check if driver is marked as "no need update"
        if (!empty($driver['no_need_update_reason']) || 
            (!empty($driver['no_need_update_until']) && $driver['no_need_update_until'] >= $today)) {
            return 'no_need_update';
        }
        
        // Check if driver has updated (future date in WhenWillBeThere)
        if (!empty($driver['WhenWillBeThere'])) {
            $whenWillBeThere = $driver['WhenWillBeThere'];
            
            // Try to parse the datetime
            $parsedDateTime = self::parseWhenWillBeThereDateTime($whenWillBeThere);
            
            if ($parsedDateTime && $parsedDateTime >= $now) {
                return 'updated';
            }
        }
        
        // Check if driver updated after 6 AM today
        if (!empty($driver['WhenWillBeThere'])) {
            $whenWillBeThere = $driver['WhenWillBeThere'];
            $parsedDateTime = self::parseWhenWillBeThereDateTime($whenWillBeThere);
            
            if ($parsedDateTime) {
                $today6AM = $today . ' 06:00:00';
                
                // If driver updated after 6 AM today, they don't need update
                if ($parsedDateTime >= $today6AM) {
                    return 'updated';
                }
            }
        }
        
        // Default: needs update
        return 'need_update';
    }

    /**
     * Parse WhenWillBeThere date field which can be in various formats
     */
    private static function parseWhenWillBeThereDate($dateString)
    {
        if (empty($dateString)) {
            return null;
        }
        
        // Try different date formats
        $formats = [
            'Y-m-d H:i:s',
            'Y-m-d H:i',
            'Y-m-d',
            'd/m/Y H:i',
            'd/m/Y',
            'm/d/Y H:i',
            'm/d/Y'
        ];
        
        foreach ($formats as $format) {
            $date = \DateTime::createFromFormat($format, $dateString);
            if ($date !== false) {
                return $date->format('Y-m-d');
            }
        }
        
        // Try strtotime as fallback
        $timestamp = strtotime($dateString);
        if ($timestamp !== false) {
            return date('Y-m-d', $timestamp);
        }
        
        return null;
    }

    /**
     * Parse WhenWillBeThere datetime field with hours and minutes
     */
    private static function parseWhenWillBeThereDateTime($dateString)
    {
        if (empty($dateString)) {
            return null;
        }
        
        // Try different datetime formats
        $formats = [
            'Y-m-d H:i:s',
            'Y-m-d H:i',
            'Y-m-d',
            'd/m/Y H:i',
            'd/m/Y',
            'm/d/Y H:i',
            'm/d/Y'
        ];
        
        foreach ($formats as $format) {
            $date = \DateTime::createFromFormat($format, $dateString);
            if ($date !== false) {
                return $date->format('Y-m-d H:i:s');
            }
        }
        
        // Try strtotime as fallback
        $timestamp = strtotime($dateString);
        if ($timestamp !== false) {
            return date('Y-m-d H:i:s', $timestamp);
        }
        
        return null;
    }

    /**
     * Update driver's no_need_update status
     */
    public static function updateNoNeedStatus($truckId)
    {
        try {
            $pdo = Database::getConnection();
            $currentUser = Auth::getCurrentUser();
            
            // Get request data
            $input = json_decode(file_get_contents('php://input'), true);
            $reason = $input['reason'] ?? '';
            $until_date = $input['until_date'] ?? null;
            $comment = $input['comment'] ?? '';
            
            // Validate truck exists and user has access
            $checkSql = "SELECT ID, assigned_dispatcher_id FROM Trucks WHERE ID = :truck_id";
            $checkStmt = $pdo->prepare($checkSql);
            $checkStmt->execute(['truck_id' => $truckId]);
            $truck = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$truck) {
                self::sendResponse(['success' => false, 'message' => 'Truck not found'], 404);
                return;
            }
            
            // Check if user has permission (assigned dispatcher, manager, or admin)
            if ($currentUser->role !== 'admin' && $currentUser->role !== 'manager' && 
                $truck['assigned_dispatcher_id'] != $currentUser->id) {
                self::sendResponse(['success' => false, 'message' => 'Access denied'], 403);
                return;
            }
            
            // Update truck
            $updateSql = "
                UPDATE Trucks 
                SET 
                    no_need_update_reason = :reason,
                    no_need_update_until = :until_date,
                    no_need_update_comment = :comment,
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = :updated_by
                WHERE ID = :truck_id
            ";
            
            $updateStmt = $pdo->prepare($updateSql);
            $updateStmt->execute([
                'reason' => $reason,
                'until_date' => $until_date,
                'comment' => $comment,
                'updated_by' => $currentUser->fullName ?? $currentUser->username,
                'truck_id' => $truckId
            ]);
            
            Logger::info('Driver no_need_update status updated', [
                'truck_id' => $truckId,
                'reason' => $reason,
                'until_date' => $until_date,
                'updated_by' => $currentUser->fullName ?? $currentUser->username
            ]);
            
            self::sendResponse(['success' => true, 'message' => 'Status updated successfully']);

        } catch (Exception $e) {
            Logger::error('Failed to update driver no_need_update status', [
                'truck_id' => $truckId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            self::sendResponse([
                'success' => false, 
                'message' => 'Could not update status'
            ], 500);
        }
    }

    /**
     * Clear driver's no_need_update status
     */
    public static function clearNoNeedStatus($truckId)
    {
        try {
            $pdo = Database::getConnection();
            $currentUser = Auth::getCurrentUser();
            
            // Validate truck exists and user has access
            $checkSql = "SELECT ID, assigned_dispatcher_id FROM Trucks WHERE ID = :truck_id";
            $checkStmt = $pdo->prepare($checkSql);
            $checkStmt->execute(['truck_id' => $truckId]);
            $truck = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$truck) {
                self::sendResponse(['success' => false, 'message' => 'Truck not found'], 404);
                return;
            }
            
            // Check if user has permission
            if ($currentUser->role !== 'admin' && $currentUser->role !== 'manager' && 
                $truck['assigned_dispatcher_id'] != $currentUser->id) {
                self::sendResponse(['success' => false, 'message' => 'Access denied'], 403);
                return;
            }
            
            // Clear no_need_update fields
            $updateSql = "
                UPDATE Trucks 
                SET 
                    no_need_update_reason = NULL,
                    no_need_update_until = NULL,
                    no_need_update_comment = NULL,
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = :updated_by
                WHERE ID = :truck_id
            ";
            
            $updateStmt = $pdo->prepare($updateSql);
            $updateStmt->execute([
                'updated_by' => $currentUser->fullName ?? $currentUser->username,
                'truck_id' => $truckId
            ]);
            
            Logger::info('Driver no_need_update status cleared', [
                'truck_id' => $truckId,
                'updated_by' => $currentUser->fullName ?? $currentUser->username
            ]);
            
            self::sendResponse(['success' => true, 'message' => 'Status cleared successfully']);

        } catch (Exception $e) {
            Logger::error('Failed to clear driver no_need_update status', [
                'truck_id' => $truckId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            self::sendResponse([
                'success' => false, 
                'message' => 'Could not clear status'
            ], 500);
        }
    }

    /**
     * Auto-update driver statuses when page loads
     * - Change "Available on" status to "Available" if date is in the past
     * - Remove drivers from "No Need to Update" if no_need_update_until is in the past
     */
    public static function autoUpdateDriverStatuses()
    {
        try {
            $pdo = Database::getConnection();
            $currentUser = Auth::getCurrentUser();
            
            // Get query parameters
            $view = $_GET['view'] ?? 'my'; // 'my', 'all', or 'unassigned'
            
            $today = date('Y-m-d');
            $now = date('Y-m-d H:i:s');
            
            // Base query for trucks
            $sql = "
                SELECT 
                    ID,
                    TruckNumber,
                    DriverName,
                    Status,
                    WhenWillBeThere,
                    no_need_update_until,
                    assigned_dispatcher_id
                FROM Trucks 
                WHERE 1=1
            ";
            
            $params = [];
            
            // Filter by dispatcher based on view
            if ($view === 'my' && $currentUser) {
                $sql .= " AND assigned_dispatcher_id = :dispatcher_id";
                $params['dispatcher_id'] = $currentUser->id;
            } elseif ($view === 'unassigned') {
                $sql .= " AND (assigned_dispatcher_id IS NULL OR assigned_dispatcher_id = '')";
            }
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $drivers = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $updatedCount = 0;
            $clearedNoNeedCount = 0;
            
            foreach ($drivers as $driver) {
                $updates = [];
                $updateParams = ['truck_id' => $driver['ID']];
                
                // Check if status is "Available on" and date is in the past
                if (strpos($driver['Status'], 'Available on') === 0) {
                    $statusDateTime = self::parseWhenWillBeThereDateTime($driver['WhenWillBeThere']);
                    $today6AM = $today . ' 06:00:00';
                    
                    // Only change status if it's past 6 AM and the date is in the past
                    if ($statusDateTime && $statusDateTime < $now && $now >= $today6AM) {
                        $updates[] = "Status = 'Available'";
                        $updatedCount++;
                    }
                }
                
                // Check if no_need_update_until is in the past
                if (!empty($driver['no_need_update_until']) && $driver['no_need_update_until'] < $today) {
                    $updates[] = "no_need_update_reason = NULL";
                    $updates[] = "no_need_update_until = NULL";
                    $updates[] = "no_need_update_comment = NULL";
                    $clearedNoNeedCount++;
                }
                
                // Apply updates if any
                if (!empty($updates)) {
                    $updateSql = "UPDATE Trucks SET " . implode(', ', $updates) . 
                                " WHERE ID = :truck_id";
                    
                    $updateStmt = $pdo->prepare($updateSql);
                    $updateStmt->execute($updateParams);
                }
            }
            
            Logger::info('Auto-updated driver statuses', [
                'updated_status_count' => $updatedCount,
                'cleared_no_need_count' => $clearedNoNeedCount,
                'view' => $view,
                'triggered_by' => $currentUser->fullName ?? $currentUser->username ?? 'System'
            ]);
            
            self::sendResponse([
                'success' => true,
                'message' => 'Driver statuses auto-updated successfully',
                'updated_status_count' => $updatedCount,
                'cleared_no_need_count' => $clearedNoNeedCount
            ]);

        } catch (Exception $e) {
            Logger::error('Failed to auto-update driver statuses', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            self::sendResponse([
                'success' => false, 
                'message' => 'Could not auto-update driver statuses'
            ], 500);
        }
    }

    /**
     * Get driver updates heatmap data
     */
    public static function getDriverUpdatesHeatmap()
    {
        try {
            $pdo = Database::getConnection();
            $currentUser = Auth::getCurrentUser();
            
            // Get query parameters
            $view = $_GET['view'] ?? 'my'; // 'my', 'all', or 'unassigned'
            $month = $_GET['month'] ?? date('Y-m');
            
            // Parse month and year
            $date = DateTime::createFromFormat('Y-m', $month);
            if (!$date) {
                $date = new DateTime();
            }
            
            $year = $date->format('Y');
            $monthNum = $date->format('m');
            $monthName = $date->format('F');
            
            // Get all days in the month
            $daysInMonth = $date->format('t');
            $monthDays = [];
            
            for ($day = 1; $day <= $daysInMonth; $day++) {
                $currentDate = DateTime::createFromFormat('Y-m-d', "$year-$monthNum-" . sprintf('%02d', $day));
                $monthDays[] = [
                    'date' => $currentDate->format('Y-m-d'),
                    'day' => $day,
                    'is_today' => $currentDate->format('Y-m-d') === date('Y-m-d'),
                    'is_weekend' => in_array($currentDate->format('N'), ['6', '7']),
                    'is_future' => $currentDate->format('Y-m-d') > date('Y-m-d')
                ];
            }
            
            // Get all trucks for the view
            $sql = "
                SELECT 
                    ID,
                    TruckNumber,
                    DriverName,
                    assigned_dispatcher_id,
                    updated_at
                FROM Trucks 
                WHERE 1=1
            ";
            
            $params = [];
            
            // Filter by dispatcher based on view
            if ($view === 'my' && $currentUser) {
                $sql .= " AND assigned_dispatcher_id = :dispatcher_id";
                $params['dispatcher_id'] = $currentUser->id;
            } elseif ($view === 'unassigned') {
                $sql .= " AND (assigned_dispatcher_id IS NULL OR assigned_dispatcher_id = '')";
            }
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $trucks = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Get activity logs for truck updates in the specified month
            $startDate = "$year-$monthNum-01";
            $endDate = "$year-$monthNum-$daysInMonth";
            
            $activitySql = "
                SELECT 
                    al.details,
                    al.created_at,
                    al.user_id,
                    u.full_name,
                    u.username
                FROM activity_logs al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE al.action = 'truck_updated'
                AND DATE(al.created_at) BETWEEN :start_date AND :end_date
            ";
            
            $activityStmt = $pdo->prepare($activitySql);
            $activityStmt->execute([
                'start_date' => $startDate,
                'end_date' => $endDate
            ]);
            $activities = $activityStmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Process activities to count updates per day per truck
            $truckDailyUpdates = [];
            
            foreach ($activities as $activity) {
                $details = json_decode($activity['details'], true);
                if ($details && isset($details['truck_id'])) {
                    $truckId = $details['truck_id'];
                    $date = date('Y-m-d', strtotime($activity['created_at']));
                    
                    if (!isset($truckDailyUpdates[$truckId])) {
                        $truckDailyUpdates[$truckId] = [];
                    }
                    if (!isset($truckDailyUpdates[$truckId][$date])) {
                        $truckDailyUpdates[$truckId][$date] = 0;
                    }
                    $truckDailyUpdates[$truckId][$date]++;
                }
            }
            
            // Create heatmap data structure
            $heatmapData = [
                'month_name' => $monthName,
                'year' => $year,
                'month_days' => $monthDays,
                'truck_data' => []
            ];
            
            foreach ($trucks as $truck) {
                $dailyStats = [];
                $totalUpdates = 0; // Додаємо лічильник загальних оновлень
                
                foreach ($monthDays as $day) {
                    $date = $day['date'];
                    $updates = isset($truckDailyUpdates[$truck['ID']][$date]) ? $truckDailyUpdates[$truck['ID']][$date] : 0;
                    $totalUpdates += $updates; // Підраховуємо загальну кількість
                    
                    $dailyStats[$date] = [
                        'updates' => $updates,
                        'has_update' => $updates > 0
                    ];
                }
                
                $heatmapData['truck_data'][] = [
                    'id' => $truck['ID'],
                    'truck_number' => $truck['TruckNumber'],
                    'driver_name' => $truck['DriverName'],
                    'assigned_dispatcher_id' => $truck['assigned_dispatcher_id'],
                    'daily_stats' => $dailyStats,
                    'total_updates' => $totalUpdates // Додаємо загальну кількість оновлень
                ];
            }
            
            // Сортуємо водіїв за кількістю оновлень від більшого до меншого
            usort($heatmapData['truck_data'], function($a, $b) {
                return $b['total_updates'] - $a['total_updates'];
            });
            
            self::sendResponse([
                'success' => true,
                'heatmap_data' => $heatmapData
            ]);

        } catch (Exception $e) {
            Logger::error('Failed to get driver updates heatmap', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            self::sendResponse([
                'success' => false, 
                'message' => 'Could not retrieve heatmap data'
            ], 500);
        }
    }
}