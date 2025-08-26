-- Fix for policy already exists error
-- Run this script first to clean up existing policies

-- Drop all existing policies to ensure clean state
DROP POLICY IF EXISTS loads_select_driver ON public.loads;
DROP POLICY IF EXISTS loads_select_dispatcher ON public.loads;
DROP POLICY IF EXISTS loads_select_dispatcher_simple ON public.loads;

-- Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS public.get_user_loads();
DROP FUNCTION IF EXISTS public.get_user_load_offers(BIGINT[]);
DROP FUNCTION IF EXISTS public.create_user_load(TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, UUID);

-- Drop view if it exists
DROP VIEW IF EXISTS public.user_loads;

-- Now you can run the main fix_recursion.sql script
