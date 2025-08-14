<?php

namespace App\Controllers;

use App\Core\Database;
use App\Core\Logger;
use App\Core\EDTTimeConverter;
use PDO;

class DashboardController
{
    private static function sendResponse($data, $statusCode = 200)
    {
        http_response_code($statusCode);
        header('Content-Type: application/json');
        echo json_encode($data);
    }

    public static function getAnalytics()
    {
        try {
            $pdo = Database::getConnection();

            // =========================================================
            // 1. User & Truck Summary Statistics
            // =========================================================
            $userStatsStmt = $pdo->query("
                SELECT 
                    (SELECT COUNT(*) FROM users) as total_users,
                    role, 
                    COUNT(*) as count 
                FROM users 
                GROUP BY role
            ");
            $userStatsRows = $userStatsStmt->fetchAll(PDO::FETCH_ASSOC);
            $totalUsers = 0;
            $usersByRole = [];
            if (!empty($userStatsRows)) {
                $totalUsers = $userStatsRows[0]['total_users'];
                foreach ($userStatsRows as $row) {
                    $usersByRole[$row['role']] = (int)$row['count'];
                }
            }

            try {
                $totalTrucks = (int)$pdo->query("SELECT COUNT(*) FROM Trucks")->fetchColumn();
            } catch (\Exception $e) {
                $totalTrucks = 0;
            }

            // =========================================================
            // 2. All-Time Activity Statistics (Optimized)
            // Use distance_log for cache/mapbox stats, activity_logs only for user queries
            // =========================================================
            // Calculate seven days ago in EDT timezone
            $sevenDaysAgoDateTime = new \DateTimeImmutable(\App\Core\TimeService::nowUtc()->format('Y-m-d H:i:s'), new \DateTimeZone('UTC'));
            $sevenDaysAgoDateTime->modify('-7 days');
            $sevenDaysAgo = $sevenDaysAgoDateTime->format('Y-m-d H:i:s');

            $activityCountsStmt = $pdo->prepare("
                SELECT 
                    COUNT(CASE WHEN action = 'distance_batch_calculated' 
                          AND (JSON_EXTRACT(details, '$.query_type') = 'optimized_with_turf' 
                               OR JSON_EXTRACT(details, '$.query_type') = 'cache_check_with_stats')
                          THEN 1 END) as distance_calcs_count,
                    COUNT(CASE WHEN action = 'truck_updated' THEN 1 END) as truck_updates_count
                FROM activity_logs 
                WHERE created_at >= ?
            ");
            $activityCountsStmt->execute([$sevenDaysAgo]);
            $activityCounts = $activityCountsStmt->fetch(PDO::FETCH_ASSOC);

            // Get cache/mapbox statistics from distance_log table for all time
            $distanceStatsStmt = $pdo->query("
                SELECT 
                    SUM(total_origins) as total_origins_checked,
                    SUM(cache_hits) as cache_hits,
                    SUM(mapbox_requests) as mapbox_requests
                FROM distance_log 
            ");
            $distanceStats = $distanceStatsStmt->fetch(PDO::FETCH_ASSOC);

            $distanceCalcsCount = (int)$activityCounts['distance_calcs_count'];
            $truckUpdatesCount = (int)$activityCounts['truck_updates_count'];
            $totalOriginsChecked = (int)($distanceStats['total_origins_checked'] ?? 0);
            $cacheHits = (int)($distanceStats['cache_hits'] ?? 0);
            $mapboxRequests = (int)($distanceStats['mapbox_requests'] ?? 0);

            // =========================================================
            // 3. Live Feed - Recent Activities with detailed info (last 50)
            // Exclude individual cache/mapbox records, show aggregated distance info
            // =========================================================
            $recentActivitiesStmt = $pdo->query("
                SELECT a.action, a.details, a.created_at, a.user_id, u.username, u.full_name, u.role 
                FROM activity_logs a
                JOIN users u ON a.user_id = u.id
                WHERE a.action NOT IN ('distance_calculation_cached', 'distance_calculation_mapbox')
                ORDER BY a.created_at DESC
                LIMIT 50
            ");
            $recentActivitiesRaw = $recentActivitiesStmt->fetchAll(PDO::FETCH_ASSOC);

            // Process activities for Live Feed with enhanced details
            $recentActivities = [];
            foreach ($recentActivitiesRaw as $activity) {
                // Convert created_at (UTC) -> App TZ ISO for consistent client parsing
                $createdAtIso = null;
                try {
                    $createdAtIso = \App\Core\TimeService::convertUtcToAppTz(
                        new \DateTimeImmutable($activity['created_at'], new \DateTimeZone('UTC'))
                    )->format(DATE_ATOM);
                } catch (\Throwable $e) {
                    $createdAtIso = $activity['created_at'];
                }
                $processedActivity = [
                    'action' => $activity['action'],
                    'username' => $activity['username'],
                    'full_name' => $activity['full_name'],
                    'role' => $activity['role'],
                    'created_at' => $createdAtIso,
                    'summary' => self::generateActivitySummary($activity, $pdo)
                ];
                $recentActivities[] = $processedActivity;
            }

            // =========================================================
            // 4. User Daily Stats for Today
            // =========================================================
            // Get today's start in EDT timezone
            $todayStart = \App\Core\TimeService::startOfDayAppTz(\App\Core\TimeService::nowAppTz())->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
            $userDailyStatsStmt = $pdo->prepare("
                SELECT
                    u.username,
                    u.full_name,
                    u.role,
                    MIN(a.created_at) as first_activity_today,
                    MAX(a.created_at) as last_activity_today,
                    COUNT(CASE WHEN a.action = 'distance_batch_calculated' 
                          AND (JSON_EXTRACT(a.details, '$.query_type') = 'optimized_with_turf' 
                               OR JSON_EXTRACT(a.details, '$.query_type') = 'cache_check_with_stats')
                          THEN 1 END) as distance_calcs_today,
                    COUNT(CASE WHEN a.action = 'truck_updated' THEN 1 END) as truck_updates_today,
                    COUNT(CASE WHEN a.action = 'truck_created' THEN 1 END) as truck_creates_today,
                    COUNT(CASE WHEN a.action = 'user_created' THEN 1 END) as user_creates_today
                FROM users u
                LEFT JOIN activity_logs a ON u.id = a.user_id AND a.created_at >= :today
                GROUP BY u.id, u.username, u.full_name, u.role
                ORDER BY distance_calcs_today DESC, u.username
            ");
            $userDailyStatsStmt->execute([':today' => $todayStart]);
            $userDailyStats = $userDailyStatsStmt->fetchAll(PDO::FETCH_ASSOC);
            // Normalize first/last activity timestamps to App TZ ISO
            foreach ($userDailyStats as &$row) {
                foreach (['first_activity_today', 'last_activity_today'] as $key) {
                    if (!empty($row[$key])) {
                        try {
                            $row[$key] = \App\Core\TimeService::convertUtcToAppTz(
                                new \DateTimeImmutable($row[$key], new \DateTimeZone('UTC'))
                            )->format(DATE_ATOM);
                        } catch (\Throwable $e) {
                            // leave as is
                        }
                    }
                }
            }
            unset($row);

            // =========================================================
            // 5. Most Active Users (Last 7 Days)
            // =========================================================
            $topUsersStmt = $pdo->prepare("
                SELECT 
                    u.username,
                    u.full_name,
                    u.role,
                    COUNT(a.action) as total_activities,
                    MAX(a.created_at) as last_activity
                FROM users u
                JOIN activity_logs a ON u.id = a.user_id
                WHERE a.created_at >= ?
                GROUP BY u.id, u.username, u.full_name, u.role
                ORDER BY total_activities DESC
                LIMIT 5
            ");
            $topUsersStmt->execute([$sevenDaysAgo]);
            $topUsers = $topUsersStmt->fetchAll(PDO::FETCH_ASSOC);

            // =========================================================
            // 6. Database Analytics (for DatabaseAnalytics component)
            // Use data already fetched in activityCounts for better performance
            // =========================================================

            // Get cache statistics from actual existing tables
            $totalCachedDistances = (int)$pdo->query("SELECT COUNT(*) FROM driver_distances")->fetchColumn();
            $totalCachedGeocoding = (int)$pdo->query("SELECT COUNT(*) FROM geocoding_cache")->fetchColumn();
            $totalCachedAutofill = (int)$pdo->query("SELECT COUNT(*) FROM address_cache")->fetchColumn();

            // For DatabaseAnalytics, we'll use distance_log table which has accurate statistics
            $dailyTrendsStmt = $pdo->prepare("
                SELECT
                    DATE(dl.created_at) as date,
                    COUNT(dl.id) as queries,
                    SUM(dl.total_origins) as total_origins_checked,
                    SUM(dl.cache_hits) as cache_hits,
                    SUM(dl.mapbox_requests) as mapbox_requests
                FROM distance_log dl
                WHERE dl.created_at >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
                GROUP BY date
                ORDER BY date ASC
            ");
            $dailyTrendsStmt->execute();
            $dailyTrends = $dailyTrendsStmt->fetchAll(PDO::FETCH_ASSOC);

            // Use distance_log for accurate user statistics
            $userStatsDbStmt = $pdo->prepare("
                SELECT
                    u.username,
                    u.role,
                    COUNT(dl.id) as queries_made,
                    SUM(dl.cache_hits) as cache_hits_used,
                    SUM(dl.mapbox_requests) as mapbox_requests_used,
                    SUM(dl.total_origins) as total_origins_checked
                FROM users u
                LEFT JOIN distance_log dl ON u.id = dl.user_id
                WHERE dl.created_at >= ?
                GROUP BY u.id, u.username, u.role
                HAVING queries_made > 0
                ORDER BY queries_made DESC
            ");
            $userStatsDbStmt->execute([$sevenDaysAgo]);
            $userStatsDb = $userStatsDbStmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($userStatsDb as &$user) {
                $totalDistanceRequests = $user['cache_hits_used'] + $user['mapbox_requests_used'];
                $user['avg_cache_efficiency'] = $totalDistanceRequests > 0 ?
                    round(($user['cache_hits_used'] / $totalDistanceRequests) * 100) : 0;
                // Ensure all values are integers
                $user['queries_made'] = (int)$user['queries_made'];
                $user['cache_hits_used'] = (int)$user['cache_hits_used'];
                $user['mapbox_requests_used'] = (int)$user['mapbox_requests_used'];
                $user['total_origins_checked'] = (int)$user['total_origins_checked'];
            }
            unset($user);

            // Assemble the data
            $analytics = [
                'summary' => [
                    'total_users' => $totalUsers,
                    'total_trucks' => $totalTrucks,
                    'distance_calcs_7d' => $distanceCalcsCount,
                    'truck_updates_7d' => $truckUpdatesCount,
                ],
                'users_by_role' => $usersByRole,
                'recent_activity' => $recentActivities,
                'user_daily_stats' => $userDailyStats,
                'top_users_7d' => $topUsers,
                'db_analytics' => [
                    'week' => [
                        'total_queries' => (int)$activityCounts['distance_calcs_count'],
                        'total_origins_checked' => $totalOriginsChecked,
                        'cache_hits' => $cacheHits,
                        'mapbox_requests' => $mapboxRequests,
                    ],
                    'extended' => [
                        'total_cached_distances' => $totalCachedDistances,
                        'total_cached_geocoding' => $totalCachedGeocoding,
                        'total_cached_autofill' => $totalCachedAutofill,
                        'daily_trends' => $dailyTrends,
                        'user_stats' => $userStatsDb,
                    ]
                ]
            ];

            self::sendResponse($analytics);
        } catch (\Exception $e) {
            Logger::error('Failed to get dashboard analytics', ['error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Could not retrieve analytics data.'], 500);
        }
    }

    public static function getSessionManagement()
    {
        try {
            $pdo = Database::getConnection();

            // Get active users based on recent activity (last 4 hours = active session) in EDT
            $activeThresholdDateTime = new \DateTimeImmutable(\App\Core\TimeService::nowUtc()->format('Y-m-d H:i:s'), new \DateTimeZone('UTC'));
            $activeThresholdDateTime->modify('-4 hours');
            $activeThreshold = $activeThresholdDateTime->format('Y-m-d H:i:s');

            $activeSessions = $pdo->prepare("
                SELECT 
                    u.id,
                    u.username,
                    u.full_name,
                    u.role,
                    u.mobile_number,
                    MAX(a.created_at) as last_activity,
                    CASE 
                        WHEN MAX(a.created_at) >= ? THEN 'active'
                        WHEN MAX(a.created_at) >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 'idle'
                        ELSE 'offline'
                    END as status
                FROM users u
                LEFT JOIN activity_logs a ON u.id = a.user_id AND DATE(a.created_at) = CURDATE()
                GROUP BY u.id, u.username, u.full_name, u.role, u.mobile_number
                ORDER BY last_activity DESC
            ");
            $activeSessions->execute([$activeThreshold]);
            $sessions = $activeSessions->fetchAll(PDO::FETCH_ASSOC);

            // Calculate session statistics
            $totalSessions = count($sessions);
            $activeSessions = 0;
            $idleSessions = 0;
            $offlineSessions = 0;
            $sessionDurations = [];

            foreach ($sessions as &$session) {
                switch ($session['status']) {
                    case 'active':
                        $activeSessions++;
                        break;
                    case 'idle':
                        $idleSessions++;
                        break;
                    case 'offline':
                        $offlineSessions++;
                        break;
                }

                // Calculate session duration (time since last activity)
                if ($session['last_activity']) {
                    $lastActivity = new \DateTime($session['last_activity']);
                    $now = new \DateTimeImmutable(\App\Core\TimeService::nowUtc()->format('Y-m-d H:i:s'), new \DateTimeZone('UTC'));
                    $duration = $now->diff($lastActivity);

                    if ($duration->days > 0) {
                        $session['session_duration'] = $duration->days . 'd ' . $duration->h . 'h';
                        $session['duration_minutes'] = ($duration->days * 1440) + ($duration->h * 60) + $duration->i;
                    } else {
                        $session['session_duration'] = $duration->h . 'h ' . $duration->i . 'm';
                        $session['duration_minutes'] = ($duration->h * 60) + $duration->i;
                    }
                } else {
                    $session['session_duration'] = 'Never logged in';
                    $session['duration_minutes'] = 0;
                }

                // Format last activity using active App Timezone
                if ($session['last_activity']) {
                    $lastActivityDateTime = new \DateTime($session['last_activity']);
                    $lastActivityDateTime->setTimezone(\App\Core\TimeService::getActiveTimezone());
                    $session['last_activity_formatted'] = $lastActivityDateTime->format('M j, H:i');
                } else {
                    $session['last_activity_formatted'] = 'Never';
                }
            }

            // Get today's login/activity stats
            $todayStats = $pdo->query("
                SELECT 
                    COUNT(DISTINCT user_id) as unique_users_today,
                    COUNT(*) as total_activities_today,
                    AVG(user_activity_count.activity_count) as avg_activities_per_user
                FROM (
                    SELECT user_id, COUNT(*) as activity_count
                    FROM activity_logs 
                    WHERE DATE(created_at) = CURDATE()
                    GROUP BY user_id
                ) as user_activity_count
            ")->fetch(PDO::FETCH_ASSOC);

            $sessionStats = [
                'total_users' => $totalSessions,
                'active_sessions' => $activeSessions,
                'idle_sessions' => $idleSessions,
                'offline_sessions' => $offlineSessions,
                'unique_users_today' => (int)($todayStats['unique_users_today'] ?? 0),
                'total_activities_today' => (int)($todayStats['total_activities_today'] ?? 0),
                'avg_activities_per_user' => round($todayStats['avg_activities_per_user'] ?? 0, 1)
            ];

            self::sendResponse([
                'sessions' => $sessions,
                'stats' => $sessionStats
            ]);
        } catch (\Exception $e) {
            Logger::error('Failed to get session management data', ['error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Could not retrieve session data.'], 500);
        }
    }

    public static function logoutUser()
    {
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            $userId = $input['user_id'] ?? null;
            $adminUserId = $input['admin_user_id'] ?? null;

            if (!$userId || !$adminUserId) {
                self::sendResponse(['success' => false, 'message' => 'User ID and Admin User ID are required.'], 400);
                return;
            }

            // Prevent admin from logging out themselves
            if ($userId == $adminUserId) {
                self::sendResponse(['success' => false, 'message' => 'You cannot logout yourself.'], 400);
                return;
            }

            $pdo = Database::getConnection();

            // Get user info for logging
            $userStmt = $pdo->prepare("SELECT username, full_name FROM users WHERE id = ?");
            $userStmt->execute([$userId]);
            $user = $userStmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                self::sendResponse(['success' => false, 'message' => 'User not found.'], 404);
                return;
            }

            // Get admin info for logging
            $adminStmt = $pdo->prepare("SELECT username FROM users WHERE id = ?");
            $adminStmt->execute([$adminUserId]);
            $admin = $adminStmt->fetch(PDO::FETCH_ASSOC);

            // Log the forced logout activity
            $logStmt = $pdo->prepare("
                INSERT INTO activity_logs (user_id, action, details, created_at) 
                VALUES (?, 'user_logged_out_by_admin', ?, NOW())
            ");
            $details = json_encode([
                'forced_logout' => true,
                'logged_out_by' => $admin['username'] ?? 'Unknown Admin',
                'target_user' => $user['username'],
                'target_user_full_name' => $user['full_name'],
                'logout_time' => \App\Core\TimeService::nowUtc()->format('Y-m-d H:i:s')
            ]);
            $logStmt->execute([$userId, $details]);

            // Also log for the admin who performed the action
            $adminLogStmt = $pdo->prepare("
                INSERT INTO activity_logs (user_id, action, details, created_at) 
                VALUES (?, 'admin_logged_out_user', ?, NOW())
            ");
            $adminDetails = json_encode([
                'target_user_id' => $userId,
                'target_user' => $user['username'],
                'target_user_full_name' => $user['full_name'],
                'action_time' => \App\Core\TimeService::nowUtc()->format('Y-m-d H:i:s')
            ]);
            $adminLogStmt->execute([$adminUserId, $adminDetails]);



            self::sendResponse([
                'success' => true,
                'message' => "User '{$user['username']}' has been logged out successfully.",
                'logged_out_user' => $user['username']
            ]);
        } catch (\Exception $e) {
            Logger::error('Failed to logout user', ['error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Could not logout user.'], 500);
        }
    }

    /**
     * Return recent RBAC-related audit logs
     */
    public static function getRbacLogs()
    {
        try {
            $pdo = Database::getConnection();
            $stmt = $pdo->query("
                SELECT a.action, a.details, a.created_at, a.user_id, u.username, u.full_name
                FROM activity_logs a
                LEFT JOIN users u ON a.user_id = u.id
                WHERE a.action IN (
                    'rbac_role_created',
                    'rbac_role_updated',
                    'rbac_role_deleted',
                    'rbac_role_permissions_set'
                )
                ORDER BY a.created_at DESC
                LIMIT 200
            ");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $logs = [];
            foreach ($rows as $row) {
                $createdAtIso = null;
                try {
                    $createdAtIso = \App\Core\TimeService::convertUtcToAppTz(
                        new \DateTimeImmutable($row['created_at'], new \DateTimeZone('UTC'))
                    )->format(DATE_ATOM);
                } catch (\Throwable $e) {
                    $createdAtIso = $row['created_at'];
                }
                $details = [];
                if (!empty($row['details'])) {
                    try {
                        $details = json_decode($row['details'], true) ?: [];
                    } catch (\Throwable $e) {
                        $details = [];
                    }
                }
                $logs[] = [
                    'action' => $row['action'],
                    'actor_username' => $row['username'],
                    'actor_full_name' => $row['full_name'],
                    'created_at' => $createdAtIso,
                    'details' => $details,
                ];
            }

            self::sendResponse(['success' => true, 'data' => $logs]);
        } catch (\Exception $e) {
            Logger::error('Failed to fetch RBAC logs', ['error' => $e->getMessage()]);
            self::sendResponse(['success' => false, 'message' => 'Could not retrieve RBAC logs.'], 500);
        }
    }

    public static function getDatabaseAnalytics()
    {
        // This method is no longer needed as its logic is merged into getAnalytics()
        // It will be removed along with its route.
        self::sendResponse(['success' => false, 'message' => 'This endpoint is deprecated.'], 410);
    }

    /**
     * Generate detailed summary for activity based on action type
     */
    private static function generateActivitySummary($activity, $pdo = null)
    {
        $action = $activity['action'];
        $details = $activity['details'] ? json_decode($activity['details'], true) : [];

        switch ($action) {
            case 'distance_batch_calculated':
                $destination = $details['destination'] ?? 'Unknown destination';
                $totalDrivers = $details['total_drivers'] ?? 0;
                $cacheHits = $details['cache_hits'] ?? 0;
                $mapboxRequests = $details['mapbox_requests'] ?? 0;
                $queryType = $details['query_type'] ?? 'unknown';

                // Show different info based on query type
                if ($queryType === 'optimized_with_turf') {
                    $preliminaryCalculations = $details['preliminary_calculations'] ?? 0;
                    $cacheEfficiency = $totalDrivers > 0 ? round(($cacheHits / $totalDrivers) * 100) : 0;
                    $cacheInfo = " ({$totalDrivers} drivers: {$cacheHits} cached, {$preliminaryCalculations} approx, {$mapboxRequests} exact - {$cacheEfficiency}% cache efficiency)";
                } elseif ($queryType === 'cache_check_with_stats') {
                    $cacheEfficiency = $totalDrivers > 0 ? round(($cacheHits / $totalDrivers) * 100) : 0;
                    $cacheInfo = " ({$totalDrivers} drivers: {$cacheHits} cached, {$mapboxRequests} from Mapbox - {$cacheEfficiency}% cache efficiency)";
                } else {
                    $successRate = $details['success_rate'] ?? 0;
                    $cacheInfo = " ({$cacheHits} cached, {$mapboxRequests} from Mapbox, {$successRate}% success)";
                }

                return "📍 " . self::truncateAddress($destination) . $cacheInfo;

            case 'distance_calculation_cached':
                $from = $details['origin_address'] ?? 'Unknown origin';
                $to = $details['destination_address'] ?? 'Unknown destination';
                $distance = isset($details['distance_meters']) ? round($details['distance_meters'] / 1609.34) . ' mi' : 'N/A';
                return "Cache hit: " . self::truncateAddress($from) . " → " . self::truncateAddress($to) . " ({$distance})";

            case 'distance_calculation_mapbox':
                $from = $details['origin_address'] ?? 'Unknown origin';
                $to = $details['destination_address'] ?? 'Unknown destination';
                $distance = isset($details['distance_meters']) ? round($details['distance_meters'] / 1609.34) . ' mi' : 'N/A';
                return "Mapbox API: " . self::truncateAddress($from) . " → " . self::truncateAddress($to) . " ({$distance})";

            case 'truck_updated':
                $truckId = $details['truck_id'] ?? 'Unknown';
                $truckNumber = $details['truck_number'] ?? 'unknown';
                $fields = $details['updated_fields'] ?? [];
                $fieldsText = is_array($fields) ? implode(', ', $fields) : 'multiple fields';
                $truckDisplay = $truckNumber !== 'unknown' ? $truckNumber : "#{$truckId}";
                return "Updated truck {$truckDisplay}: {$fieldsText}";

            case 'truck_created':
                $truckId = $details['truck_id'] ?? 'Unknown';
                $truckNumber = $details['truck_number'] ?? 'unknown';
                $truckDisplay = $truckNumber !== 'unknown' ? $truckNumber : "#{$truckId}";
                return "Created new truck {$truckDisplay}";

            case 'truck_deleted':
                $truckId = $details['truck_id'] ?? 'Unknown';
                $truckNumber = $details['truck_number'] ?? 'unknown';
                $truckDisplay = $truckNumber !== 'unknown' ? $truckNumber : "#{$truckId}";
                return "Deleted truck {$truckDisplay}";

            case 'truck_location_changed':
                $truckId = $details['truck_id'] ?? 'Unknown';
                $truckNumber = $details['truck_number'] ?? 'unknown';
                $oldLocation = $details['old_location'] ?? 'Unknown location';
                $newLocation = $details['new_location'] ?? 'Unknown location';
                $truckDisplay = $truckNumber !== 'unknown' ? $truckNumber : "#{$truckId}";
                return "🚚 Truck {$truckDisplay} location changed: {$oldLocation} → {$newLocation}";

            case 'user_created':
                $username = $details['username'] ?? 'Unknown';
                return "Created new user: {$username}";

            case 'user_updated':
                $userId = $details['user_id'] ?? 'Unknown';
                $fields = $details['updated_fields'] ?? [];
                $fieldsText = is_array($fields) ? implode(', ', $fields) : 'profile';
                return "Updated user #{$userId}: {$fieldsText}";

            case 'user_login_success':
                return 'Successfully logged in';

            case 'statistics_reset':
                return 'Reset system statistics';

            case 'test_analytics_created':
                return 'Created test analytics data';

            default:
                return ucfirst(str_replace('_', ' ', $action));
        }
    }

    /**
     * Truncate address for display in activity feed
     */
    private static function truncateAddress($address, $maxLength = 30)
    {
        if (strlen($address) <= $maxLength) {
            return $address;
        }
        return substr($address, 0, $maxLength - 3) . '...';
    }
}
