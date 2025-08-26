-- Phase 1: Prepare Database for Supabase Migration
-- Add supabase_user_id columns to all tables with user references

-- 1. Add supabase_user_id to activity_logs
ALTER TABLE activity_logs 
ADD COLUMN supabase_user_id VARCHAR(36) NULL 
AFTER user_id,
ADD INDEX idx_activity_logs_supabase_user_id (supabase_user_id);

-- 2. Add supabase_user_id to distance_log  
ALTER TABLE distance_log 
ADD COLUMN supabase_user_id VARCHAR(36) NULL 
AFTER user_id,
ADD INDEX idx_distance_log_supabase_user_id (supabase_user_id);

-- 3. Add supabase_changed_by_id to truck_location_history
ALTER TABLE truck_location_history 
ADD COLUMN supabase_changed_by_id VARCHAR(36) NULL 
AFTER changed_by_user_id,
ADD INDEX idx_truck_history_supabase_user_id (supabase_changed_by_id);

-- 4. Add supabase_user_id to user_roles
ALTER TABLE user_roles 
ADD COLUMN supabase_user_id VARCHAR(36) NULL 
AFTER user_id,
ADD INDEX idx_user_roles_supabase_user_id (supabase_user_id);

-- 5. Verify the changes
SELECT 'activity_logs' as table_name, COUNT(*) as record_count FROM activity_logs
UNION ALL
SELECT 'distance_log', COUNT(*) FROM distance_log  
UNION ALL
SELECT 'truck_location_history', COUNT(*) FROM truck_location_history
UNION ALL
SELECT 'user_roles', COUNT(*) FROM user_roles;

-- Show current users for migration reference
SELECT id, username, email, full_name, role, supabase_user_id 
FROM users 
ORDER BY id;
