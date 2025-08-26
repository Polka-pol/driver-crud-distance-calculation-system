-- Phase 2: Fix user_id columns to allow NULL for Supabase-only users
-- This addresses the constraint violation: Column 'user_id' cannot be null

-- 1. Modify activity_logs.user_id to allow NULL
ALTER TABLE activity_logs 
MODIFY COLUMN user_id INT NULL;

-- 2. Modify distance_log.user_id to allow NULL  
ALTER TABLE distance_log 
MODIFY COLUMN user_id INT NULL;

-- 3. Modify truck_location_history.changed_by_user_id to allow NULL (if needed)
ALTER TABLE truck_location_history 
MODIFY COLUMN changed_by_user_id VARCHAR(36) NULL;

-- 4. Verify the changes (using DESCRIBE instead of INFORMATION_SCHEMA)
DESCRIBE activity_logs;
DESCRIBE distance_log;
DESCRIBE truck_location_history;

-- 5. Test insert for Supabase-only user
INSERT INTO activity_logs (user_id, supabase_user_id, action, details, created_at) 
VALUES (NULL, '550e8400-e29b-41d4-a716-446655440000', 'test_supabase_user', '{"test": true}', NOW());

INSERT INTO distance_log (user_id, supabase_user_id, source_address, total_origins, cache_hits, mapbox_requests, created_at)
VALUES (NULL, '550e8400-e29b-41d4-a716-446655440000', 'Test Address', 10, 5, 5, NOW());

-- 6. Verify test inserts worked
SELECT 'activity_logs' as table_name, COUNT(*) as supabase_records 
FROM activity_logs 
WHERE supabase_user_id IS NOT NULL AND user_id IS NULL
UNION ALL
SELECT 'distance_log', COUNT(*) 
FROM distance_log 
WHERE supabase_user_id IS NOT NULL AND user_id IS NULL;
