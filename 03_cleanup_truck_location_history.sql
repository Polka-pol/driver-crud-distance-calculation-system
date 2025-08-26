-- Cleanup script for truck_location_history table
-- Fixes truncated changed_by_user_id values and populates missing supabase_changed_by_id

-- Step 1: Analyze current data issues
SELECT 
    'Analysis of truck_location_history issues' as step,
    COUNT(*) as total_records,
    COUNT(CASE WHEN changed_by_user_id IS NULL THEN 1 END) as null_user_id,
    COUNT(CASE WHEN supabase_changed_by_id IS NULL OR supabase_changed_by_id = '' THEN 1 END) as empty_supabase_id,
    COUNT(CASE WHEN LENGTH(CAST(changed_by_user_id AS CHAR)) = 1 AND changed_by_user_id IS NOT NULL THEN 1 END) as potentially_truncated
FROM truck_location_history;

-- Step 2: Show sample problematic records
SELECT 
    'Sample problematic records' as step,
    id, truck_id, changed_by_user_id, supabase_changed_by_id, changed_by_username, created_at
FROM truck_location_history 
WHERE (
    (changed_by_user_id IS NULL AND (supabase_changed_by_id IS NULL OR supabase_changed_by_id = '')) OR
    (LENGTH(CAST(changed_by_user_id AS CHAR)) = 1 AND changed_by_user_id IS NOT NULL)
)
ORDER BY created_at DESC 
LIMIT 10;

-- Step 3: Attempt to fix records where we can match by username
-- This tries to populate missing user IDs by matching changed_by_username with users table
UPDATE truck_location_history tlh
JOIN users u ON tlh.changed_by_username = u.username
SET tlh.changed_by_user_id = u.id
WHERE tlh.changed_by_user_id IS NULL 
  AND tlh.changed_by_username IS NOT NULL 
  AND tlh.changed_by_username != '';

-- Step 4: Show how many records were fixed by username matching
SELECT 
    'Records fixed by username matching' as step,
    ROW_COUNT() as records_updated;

-- Step 5: For records that still have issues, try to identify patterns
SELECT 
    'Remaining issues analysis' as step,
    changed_by_username,
    COUNT(*) as count,
    MIN(created_at) as earliest_occurrence,
    MAX(created_at) as latest_occurrence
FROM truck_location_history 
WHERE (
    (changed_by_user_id IS NULL AND (supabase_changed_by_id IS NULL OR supabase_changed_by_id = '')) OR
    (LENGTH(CAST(changed_by_user_id AS CHAR)) = 1 AND changed_by_user_id IS NOT NULL)
)
GROUP BY changed_by_username
ORDER BY count DESC;

-- Step 6: For Supabase users that might exist in activity_logs, try to populate supabase_changed_by_id
-- This looks for recent activity_logs entries with the same username pattern
UPDATE truck_location_history tlh
JOIN (
    SELECT DISTINCT 
        al.supabase_user_id,
        u.username
    FROM activity_logs al
    JOIN users u ON al.user_id = u.id
    WHERE al.supabase_user_id IS NOT NULL 
      AND al.supabase_user_id != ''
      AND al.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
) recent_supabase ON tlh.changed_by_username = recent_supabase.username
SET tlh.supabase_changed_by_id = recent_supabase.supabase_user_id
WHERE (tlh.supabase_changed_by_id IS NULL OR tlh.supabase_changed_by_id = '')
  AND tlh.changed_by_username IS NOT NULL;

-- Step 7: Show final cleanup results
SELECT 
    'Final cleanup results' as step,
    COUNT(*) as total_records,
    COUNT(CASE WHEN changed_by_user_id IS NULL AND (supabase_changed_by_id IS NULL OR supabase_changed_by_id = '') THEN 1 END) as still_missing_user_info,
    COUNT(CASE WHEN changed_by_user_id IS NOT NULL THEN 1 END) as has_mysql_user_id,
    COUNT(CASE WHEN supabase_changed_by_id IS NOT NULL AND supabase_changed_by_id != '' THEN 1 END) as has_supabase_user_id
FROM truck_location_history;

-- Step 8: Create a backup table for records that couldn't be fixed (optional)
-- Uncomment the following lines if you want to keep a record of unfixable entries

-- CREATE TABLE truck_location_history_unfixable_backup AS
-- SELECT * FROM truck_location_history 
-- WHERE changed_by_user_id IS NULL 
--   AND (supabase_changed_by_id IS NULL OR supabase_changed_by_id = '')
--   AND changed_by_username IS NOT NULL;

-- Step 9: Show sample of successfully cleaned records
SELECT 
    'Sample cleaned records' as step,
    id, truck_id, changed_by_user_id, supabase_changed_by_id, changed_by_username, created_at
FROM truck_location_history 
WHERE changed_by_user_id IS NOT NULL OR (supabase_changed_by_id IS NOT NULL AND supabase_changed_by_id != '')
ORDER BY created_at DESC 
LIMIT 10;

-- Step 10: Verification queries to ensure data integrity
SELECT 
    'Data integrity check' as step,
    'Users with both MySQL and Supabase IDs' as description,
    COUNT(*) as count
FROM truck_location_history 
WHERE changed_by_user_id IS NOT NULL 
  AND supabase_changed_by_id IS NOT NULL 
  AND supabase_changed_by_id != '';

SELECT 
    'Data integrity check' as step,
    'Records with only MySQL user ID' as description,
    COUNT(*) as count
FROM truck_location_history 
WHERE changed_by_user_id IS NOT NULL 
  AND (supabase_changed_by_id IS NULL OR supabase_changed_by_id = '');

SELECT 
    'Data integrity check' as step,
    'Records with only Supabase user ID' as description,
    COUNT(*) as count
FROM truck_location_history 
WHERE changed_by_user_id IS NULL 
  AND supabase_changed_by_id IS NOT NULL 
  AND supabase_changed_by_id != '';
