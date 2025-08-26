-- Cleanup script: Remove all truck_extended_change entries from activity_logs
-- These are duplicate entries since detailed info is already in truck_location_history

-- 1. Check how many records will be deleted
SELECT COUNT(*) as records_to_delete 
FROM activity_logs 
WHERE action = 'truck_extended_change';

-- 2. Show sample records before deletion (optional)
SELECT id, action, details, created_at 
FROM activity_logs 
WHERE action = 'truck_extended_change' 
ORDER BY created_at DESC 
LIMIT 5;

-- 3. Delete all truck_extended_change records
DELETE FROM activity_logs 
WHERE action = 'truck_extended_change';

-- 4. Verify deletion
SELECT COUNT(*) as remaining_records 
FROM activity_logs 
WHERE action = 'truck_extended_change';
