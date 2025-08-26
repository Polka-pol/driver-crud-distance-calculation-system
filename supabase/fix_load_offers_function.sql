-- Fix the get_user_load_offers function to handle mysql_truck_id
-- This addresses the issue where offers created with mysql_truck_id don't appear in the UI

-- Update the function to include mysql_truck_id for dispatchers
CREATE OR REPLACE FUNCTION public.get_user_load_offers(p_load_ids BIGINT[])
RETURNS SETOF public.load_offers AS $$
DECLARE
  user_role TEXT;
  user_id UUID;
BEGIN
  -- Get current user ID
  user_id := auth.uid();
  
  -- Get user role from JWT claims
  user_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  
  -- For dispatchers/admins: return all offers for the specified loads
  -- This includes offers with mysql_truck_id
  IF user_role IN ('dispatcher', 'admin') OR public.is_dispatcher() THEN
    RETURN QUERY
      SELECT * FROM public.load_offers
      WHERE load_id = ANY(p_load_ids)
      ORDER BY created_at DESC;
  -- For drivers: return their offers (including those linked by mysql_truck_id)
  ELSE
    RETURN QUERY
      SELECT lo.* FROM public.load_offers lo
      LEFT JOIN public.driver_mapping dm ON lo.mysql_truck_id = dm.mysql_truck_id
      WHERE lo.load_id = ANY(p_load_ids)
      AND (
        lo.driver_user_id = user_id 
        OR 
        dm.auth_user_id = user_id
      )
      ORDER BY lo.created_at DESC;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_load_offers(BIGINT[]) TO authenticated;

-- Comment for documentation
COMMENT ON FUNCTION public.get_user_load_offers IS 'Safely gets load offers for specified loads based on user role without triggering recursive policy evaluation. Handles both driver_user_id and mysql_truck_id.';
