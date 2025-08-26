-- Debug script to check load offers in the database
-- This will help us understand why offers aren't showing in the UI

-- Check if any load offers exist
SELECT COUNT(*) AS total_offers FROM public.load_offers;

-- Check offers with mysql_truck_id
SELECT COUNT(*) AS offers_with_truck_id FROM public.load_offers WHERE mysql_truck_id IS NOT NULL;

-- Check offers with driver_user_id
SELECT COUNT(*) AS offers_with_driver_id FROM public.load_offers WHERE driver_user_id IS NOT NULL;

-- Check the most recent offers
SELECT 
  id,
  load_id,
  driver_user_id,
  mysql_truck_id,
  offer_status,
  created_at
FROM public.load_offers
ORDER BY created_at DESC
LIMIT 10;

-- Check if the loads exist
SELECT 
  id,
  origin_address,
  destination_address,
  created_by_dispatcher_id,
  created_at
FROM public.loads
ORDER BY created_at DESC
LIMIT 10;

-- Check if the loads are visible to the current user
SELECT EXISTS (
  SELECT 1 FROM public.loads 
  WHERE created_by_dispatcher_id = auth.uid()
) AS user_created_loads;

-- Check if the user is recognized as a dispatcher
SELECT public.is_dispatcher() AS is_dispatcher;

-- Check the current user's role
SELECT current_setting('request.jwt.claims', true)::jsonb->>'role' AS jwt_role;

