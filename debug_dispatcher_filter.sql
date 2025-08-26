-- Check current state of dispatcher IDs in Trucks table
SELECT 
    ID,
    TruckNumber,
    assigned_dispatcher_id,
    hold_dispatcher_id,
    hold_dispatcher_name
FROM Trucks 
WHERE assigned_dispatcher_id IS NOT NULL OR hold_dispatcher_id IS NOT NULL
LIMIT 10;

-- Check users table to see available dispatchers
SELECT 
    id as mysql_id,
    username,
    supabase_user_id,
    role
FROM users 
WHERE role = 'dispatcher';

-- Check data types of dispatcher columns
DESCRIBE Trucks;
