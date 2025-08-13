-- Optional cleanup script for old logging records
-- Run this ONLY if you want to remove old records that don't have the new extended fields
-- BACKUP YOUR DATA BEFORE RUNNING THIS SCRIPT!

-- 1. Check how many old records exist (records without extended fields)
SELECT 
    COUNT(*) as old_records_count,
    'Records with only location changes (no extended fields)' as description
FROM truck_location_history 
WHERE old_whenwillbethere IS NULL 
  AND new_whenwillbethere IS NULL 
  AND old_status IS NULL 
  AND new_status IS NULL 
  AND changed_fields IS NULL;

-- 2. Preview old records before deletion (optional)
-- SELECT * FROM truck_location_history 
-- WHERE old_whenwillbethere IS NULL 
--   AND new_whenwillbethere IS NULL 
--   AND old_status IS NULL 
--   AND new_status IS NULL 
--   AND changed_fields IS NULL
-- ORDER BY created_at DESC
-- LIMIT 10;

-- 3. UNCOMMENT THE FOLLOWING LINE ONLY IF YOU WANT TO DELETE OLD RECORDS
-- WARNING: This will permanently delete old logging records!
-- DELETE FROM truck_location_history 
-- WHERE old_whenwillbethere IS NULL 
--   AND new_whenwillbethere IS NULL 
--   AND old_status IS NULL 
--   AND new_status IS NULL 
--   AND changed_fields IS NULL;

-- 4. Alternative: Keep old records but mark them as legacy
-- UPDATE truck_location_history 
-- SET changed_fields = '["location"]'
-- WHERE old_whenwillbethere IS NULL 
--   AND new_whenwillbethere IS NULL 
--   AND old_status IS NULL 
--   AND new_status IS NULL 
--   AND changed_fields IS NULL;
