-- Phase 3: Update Historical Data with Supabase User IDs
-- This script updates all existing records to use Supabase UUIDs

-- 1. Update activity_logs (14,625 records)
UPDATE activity_logs al 
JOIN users u ON al.user_id = u.id 
SET al.supabase_user_id = u.supabase_user_id 
WHERE u.supabase_user_id IS NOT NULL;

-- Verify activity_logs update
SELECT 
    COUNT(*) as total_logs,
    COUNT(supabase_user_id) as updated_logs,
    COUNT(*) - COUNT(supabase_user_id) as remaining_logs
FROM activity_logs;

-- 2. Update distance_log (3,230 records)
UPDATE distance_log dl 
JOIN users u ON dl.user_id = u.id 
SET dl.supabase_user_id = u.supabase_user_id 
WHERE u.supabase_user_id IS NOT NULL;

-- Verify distance_log update
SELECT 
    COUNT(*) as total_logs,
    COUNT(supabase_user_id) as updated_logs,
    COUNT(*) - COUNT(supabase_user_id) as remaining_logs
FROM distance_log;

-- 3. Update truck_location_history (2,690 records)
UPDATE truck_location_history tlh 
JOIN users u ON tlh.changed_by_user_id = u.id 
SET tlh.supabase_changed_by_id = u.supabase_user_id 
WHERE u.supabase_user_id IS NOT NULL;

-- Verify truck_location_history update
SELECT 
    COUNT(*) as total_records,
    COUNT(supabase_changed_by_id) as updated_records,
    COUNT(*) - COUNT(supabase_changed_by_id) as remaining_records
FROM truck_location_history;

-- 4. Update user_roles (5 records)
UPDATE user_roles ur 
JOIN users u ON ur.user_id = u.id 
SET ur.supabase_user_id = u.supabase_user_id 
WHERE u.supabase_user_id IS NOT NULL;

-- Verify user_roles update
SELECT 
    COUNT(*) as total_roles,
    COUNT(supabase_user_id) as updated_roles,
    COUNT(*) - COUNT(supabase_user_id) as remaining_roles
FROM user_roles;

-- 5. Final verification - show sample records from each table
SELECT 'activity_logs' as table_name, user_id, supabase_user_id, action, created_at
FROM activity_logs 
WHERE supabase_user_id IS NOT NULL 
ORDER BY created_at DESC 
LIMIT 3

UNION ALL

SELECT 'distance_log' as table_name, user_id, supabase_user_id, 
       CONCAT('distance_', id) as action, created_at
FROM distance_log 
WHERE supabase_user_id IS NOT NULL 
ORDER BY created_at DESC 
LIMIT 2;

-- 6. Show migration summary
SELECT 
    u.id as mysql_id,
    u.username,
    u.email,
    u.supabase_user_id,
    (SELECT COUNT(*) FROM activity_logs WHERE supabase_user_id = u.supabase_user_id) as activity_logs,
    (SELECT COUNT(*) FROM distance_log WHERE supabase_user_id = u.supabase_user_id) as distance_logs,
    (SELECT COUNT(*) FROM truck_location_history WHERE supabase_changed_by_id = u.supabase_user_id) as location_history,
    (SELECT COUNT(*) FROM user_roles WHERE supabase_user_id = u.supabase_user_id) as roles
FROM users u
WHERE u.supabase_user_id IS NOT NULL
ORDER BY u.id;
