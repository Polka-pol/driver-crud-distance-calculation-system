# Supabase Infinite Recursion Fix Instructions

This document provides instructions for fixing the infinite recursion error in Supabase RLS policies that was causing 500 Internal Server Errors when fetching loads.

## Problem Description

The application was encountering an infinite recursion error in the Supabase Row Level Security (RLS) policies for the `loads` table. This occurred because:

1. The RLS policy for drivers to view loads checked if they had offers for those loads
2. The RLS policy for load_offers had a similar check that referenced the loads table
3. This circular reference caused infinite recursion during policy evaluation

## Solution

We've implemented a two-part solution:

1. **SQL Functions and Views**: Created secure SQL functions that bypass the problematic RLS policies
2. **Frontend Client Updates**: Modified the Supabase client to use these functions instead of direct table queries

## Implementation Steps

### 1. Apply the SQL Fixes to Supabase

If this is your first time running the script, follow these steps:

1. Log in to your Supabase dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `supabase/fix_recursion.sql`
4. Run the script

If you encounter an error like `ERROR: 42710: policy "loads_select_dispatcher_simple" for table "loads" already exists`, follow these steps instead:

1. First run the cleanup script:
   - Copy and paste the contents of `supabase/fix_policy_error.sql`
   - Run this script to drop existing policies and functions
2. Then run the main script:
   - Copy and paste the contents of `supabase/fix_recursion.sql`
   - Run this script to create the updated policies and functions

The script will:
- Drop the problematic RLS policies causing recursion
- Create a simpler policy for dispatchers
- Create secure functions to safely get loads and offers based on user role
- Create a view that uses these functions

### 2. Frontend Changes (Already Applied)

The frontend code has been updated to:
- Use the `user_loads` view instead of directly querying the `loads` table
- Use the `get_user_load_offers` function to fetch offers without triggering recursion
- Explicitly specify fields to select to avoid any potential issues

## Verification

After applying these changes:

1. Log in as a dispatcher and verify you can see your loads without 500 errors
2. Log in as a driver and verify you can see loads you have offers for
3. Check the browser console for any errors related to Supabase queries

## Troubleshooting

If issues persist:

1. Run the SQL script in the Supabase SQL Editor
   - **Important**: The functions must be created in the correct order (as they appear in the script)
   - If you encounter errors about functions not existing, make sure to run the entire script at once
2. Verify the SQL functions and view were created successfully
3. Ensure the frontend is using the updated endpoints
4. Clear browser cache and reload the application

## Technical Details

### SQL Functions Created

1. `get_user_loads()`: Returns loads accessible to the current user based on their role
2. `get_user_load_offers(p_load_ids BIGINT[])`: Returns offers for specified loads based on user role
3. `create_user_load(...)`: Creates a new load without triggering recursion
   - Includes improved role checking from JWT claims and user table
   - Specifically checks for 'dispatcher' or 'admin' roles in user_metadata.role and app_metadata.role
   - Falls back to checking the auth.users table if role not found in metadata
   - Provides detailed error messages with role information for troubleshooting

### Views Created

1. `user_loads`: View that returns loads accessible to the current user

### RLS Policy Changes

1. Removed `loads_select_driver` and `loads_select_dispatcher` policies
2. Added a simpler `loads_select_dispatcher_simple` policy
