-- Debug version of get_user_load_offers with detailed logging
-- This will help trace the execution flow and identify why offers are not being returned.

CREATE OR REPLACE FUNCTION public.get_user_load_offers(p_load_ids bigint[])
RETURNS SETOF public.load_offers AS $$
DECLARE
  user_role TEXT;
  user_id UUID;
  is_disp BOOLEAN;
  offers_count INT;
BEGIN
  -- Log entry point and input parameters
  RAISE LOG '[get_user_load_offers] Starting execution for load_ids: %', p_load_ids;

  -- Get current user's ID and role
  user_id := auth.uid();
  user_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', 'not_found');
  is_disp := public.is_dispatcher();

  RAISE LOG '[get_user_load_offers] User ID: %, Role from JWT: %, is_dispatcher(): %', user_id, user_role, is_disp;

  -- For dispatchers/admins: return ALL offers for the specified loads they can see.
  IF user_role IN ('dispatcher', 'admin') OR is_disp THEN
    RAISE LOG '[get_user_load_offers] Executing DISPATCHER branch.';
    
    RETURN QUERY
      SELECT * FROM public.load_offers
      WHERE load_id = ANY(p_load_ids);

    -- Log the number of offers found for the dispatcher
    GET DIAGNOSTICS offers_count = ROW_COUNT;
    RAISE LOG '[get_user_load_offers] DISPATCHER branch found % offers.', offers_count;

  -- For drivers: return only their offers
  ELSE
    RAISE LOG '[get_user_load_offers] Executing DRIVER branch.';
    
    RETURN QUERY
      SELECT lo.*
      FROM public.load_offers lo
      LEFT JOIN public.driver_mapping dm ON lo.mysql_truck_id = dm.mysql_truck_id
      WHERE
        lo.load_id = ANY(p_load_ids) AND
        (lo.driver_user_id = user_id OR dm.auth_user_id = user_id);

    -- Log the number of offers found for the driver
    GET DIAGNOSTICS offers_count = ROW_COUNT;
    RAISE LOG '[get_user_load_offers] DRIVER branch found % offers.', offers_count;
  END IF;
  
  RAISE LOG '[get_user_load_offers] Finished execution.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_load_offers(bigint[]) TO authenticated;
