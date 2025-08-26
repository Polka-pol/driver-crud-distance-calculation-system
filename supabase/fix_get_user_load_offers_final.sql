-- Final fix for the get_user_load_offers function
-- This version correctly handles roles for both dispatchers and drivers.

CREATE OR REPLACE FUNCTION public.get_user_load_offers(p_load_ids bigint[])
RETURNS SETOF public.load_offers AS $$
DECLARE
  user_role TEXT;
  user_id UUID;
  is_disp BOOLEAN;
BEGIN
  -- Get current user's ID and role
  user_id := auth.uid();
  user_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  is_disp := public.is_dispatcher(); -- Also check using the dedicated function for safety

  -- For dispatchers/admins: return ALL offers for the specified loads they can see.
  -- This is the key fix: explicitly check the role.
  IF user_role IN ('dispatcher', 'admin') OR is_disp THEN
    RETURN QUERY
      SELECT * FROM public.load_offers
      WHERE load_id = ANY(p_load_ids);

  -- For drivers: return only their offers, checking both direct user_id
  -- and through the mysql_truck_id mapping.
  ELSE
    RETURN QUERY
      SELECT lo.*
      FROM public.load_offers lo
      LEFT JOIN public.driver_mapping dm ON lo.mysql_truck_id = dm.mysql_truck_id
      WHERE
        lo.load_id = ANY(p_load_ids) AND
        (lo.driver_user_id = user_id OR dm.auth_user_id = user_id);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_load_offers(bigint[]) TO authenticated;

-- Add a comment for documentation
COMMENT ON FUNCTION public.get_user_load_offers IS 'Safely gets load offers for specified loads. For dispatchers, it returns all offers. For drivers, it returns only their own offers, resolving via driver_user_id or mysql_truck_id.';
