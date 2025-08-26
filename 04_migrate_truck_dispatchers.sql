-- Step 1: (Optional but Recommended) Back up your Trucks table before running this migration.

-- Step 2: Change the column type of assigned_dispatcher_id to store UUIDs.
-- If it's currently an INT, it needs to be changed to VARCHAR or a similar string type.
-- The exact syntax might vary based on your MySQL/MariaDB version.
ALTER TABLE Trucks MODIFY COLUMN assigned_dispatcher_id VARCHAR(36) NULL;

-- Step 3: Update assigned_dispatcher_id from MySQL user IDs to Supabase user UUIDs.
-- This query joins the Trucks table with the users table on the old MySQL ID
-- and updates the assigned_dispatcher_id with the corresponding supabase_user_id.
UPDATE Trucks t
JOIN users u ON t.assigned_dispatcher_id = CAST(u.id AS CHAR) COLLATE utf8mb4_unicode_ci
SET t.assigned_dispatcher_id = u.supabase_user_id
WHERE u.supabase_user_id IS NOT NULL AND u.supabase_user_id != '';

-- Step 4: (Verification) Check a few trucks to ensure the ID has been updated to a UUID format.
-- SELECT ID, TruckNumber, assigned_dispatcher_id FROM Trucks WHERE assigned_dispatcher_id IS NOT NULL LIMIT 10;
