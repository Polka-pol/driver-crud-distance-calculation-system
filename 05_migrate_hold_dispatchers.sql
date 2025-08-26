-- Step 1: Change the column type of hold_dispatcher_id to store UUIDs.
ALTER TABLE Trucks MODIFY COLUMN hold_dispatcher_id VARCHAR(36) NULL;

-- Step 2: Update hold_dispatcher_id from MySQL user IDs to Supabase user UUIDs.
-- Only update records where hold_dispatcher_id is a valid MySQL user ID (not 0 or empty)
UPDATE Trucks t
JOIN users u ON t.hold_dispatcher_id = CAST(u.id AS CHAR) COLLATE utf8mb4_unicode_ci
SET t.hold_dispatcher_id = u.supabase_user_id
WHERE t.hold_dispatcher_id IS NOT NULL 
  AND t.hold_dispatcher_id != '0'
  AND t.hold_dispatcher_id != ''
  AND u.supabase_user_id IS NOT NULL 
  AND u.supabase_user_id != '';

-- Step 3: Clean up invalid hold_dispatcher_id values (0 or empty strings)
UPDATE Trucks 
SET hold_dispatcher_id = NULL 
WHERE hold_dispatcher_id = '0' OR hold_dispatcher_id = '';

-- Step 4: (Verification) Check a few trucks to ensure hold_dispatcher_id has been updated to UUID format.
-- SELECT ID, TruckNumber, hold_dispatcher_id, hold_dispatcher_name FROM Trucks WHERE hold_dispatcher_id IS NOT NULL LIMIT 10;
