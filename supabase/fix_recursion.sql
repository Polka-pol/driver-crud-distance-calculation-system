-- Fix for infinite recursion in loads policy
-- This approach bypasses the problematic RLS policies by using direct SQL access

-- First, disable the problematic RLS policies that are causing recursion
DROP POLICY IF EXISTS loads_select_driver ON public.loads;
DROP POLICY IF EXISTS loads_select_dispatcher ON public.loads;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS loads_select_dispatcher_simple ON public.loads;

-- Create new, simpler policies that don't cause recursion
CREATE POLICY loads_select_dispatcher_simple ON public.loads
  FOR SELECT USING (
    (COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') IN ('dispatcher', 'admin'))
    AND created_by_dispatcher_id = auth.uid()
  );

-- Create a secure function that safely gets loads for a user based on their role
CREATE OR REPLACE FUNCTION public.get_user_loads()
RETURNS SETOF public.loads AS $$
DECLARE
  user_role TEXT;
  user_id UUID;
BEGIN
  -- Get current user ID
  user_id := auth.uid();
  
  -- Get user role from JWT claims
  user_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  
  -- For dispatchers/admins: return loads they created
  IF user_role IN ('dispatcher', 'admin') THEN
    RETURN QUERY
      SELECT * FROM public.loads
      WHERE created_by_dispatcher_id = user_id
      ORDER BY created_at DESC;
  -- For drivers: return loads they have offers for
  ELSE
    RETURN QUERY
      SELECT DISTINCT l.* FROM public.loads l
      JOIN public.load_offers lo ON lo.load_id = l.id
      WHERE lo.driver_user_id = user_id
      ORDER BY l.created_at DESC;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to safely create loads without triggering recursion
CREATE OR REPLACE FUNCTION public.create_user_load(
    p_origin_address TEXT,
    p_destination_address TEXT,
    p_weight NUMERIC,
    p_dimensions TEXT,
    p_proposed_cost_by_user NUMERIC,
    p_delivery_distance_miles NUMERIC,
    p_created_by_dispatcher_id UUID
)
RETURNS SETOF loads
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Only dispatchers and admins can create loads
    -- Get user role from JWT claims or from auth.users table
    
    -- Simplified role check that accepts any user with dispatcher in user_metadata.role
    DECLARE
        jwt_claims jsonb;
        jwt_user_metadata jsonb;
        jwt_app_metadata jsonb;
        user_metadata_role text;
        app_metadata_role text;
    BEGIN
        -- Get the JWT claims
        jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
        jwt_user_metadata := jwt_claims->'user_metadata';
        jwt_app_metadata := jwt_claims->'app_metadata';
        
        -- Extract roles from metadata
        user_metadata_role := jwt_user_metadata->>'role';
        app_metadata_role := jwt_app_metadata->>'role';
        
        -- Log for debugging
        RAISE LOG 'User check - JWT user_metadata.role: %, app_metadata.role: %', 
                 user_metadata_role, app_metadata_role;
        
        -- Accept if user has dispatcher or admin role in either metadata location
        IF user_metadata_role = 'dispatcher' OR 
           user_metadata_role = 'admin' OR 
           app_metadata_role = 'dispatcher' OR 
           app_metadata_role = 'admin' THEN
            -- User is authorized
            user_role := COALESCE(user_metadata_role, app_metadata_role, 'dispatcher');
            RAISE LOG 'User authorized with role: %', user_role;
        ELSE
            -- If not found in metadata, try the auth.users table as last resort
            SELECT role INTO user_role FROM auth.users WHERE id = auth.uid();
            
            IF user_role = 'dispatcher' OR user_role = 'admin' THEN
                RAISE LOG 'User authorized with database role: %', user_role;
            ELSE
                RAISE EXCEPTION 'Only dispatchers and admins can create loads. User has roles: user_metadata=%,app_metadata=%,db=%', 
                              user_metadata_role, app_metadata_role, user_role;
            END IF;
        END IF;
    END;
    
    -- Insert the load
    RETURN QUERY
    INSERT INTO loads (
        origin_address,
        destination_address,
        weight,
        dimensions,
        proposed_cost_by_user,
        delivery_distance_miles,
        created_by_dispatcher_id
    ) VALUES (
        p_origin_address,
        p_destination_address,
        p_weight,
        p_dimensions,
        p_proposed_cost_by_user,
        p_delivery_distance_miles,
        p_created_by_dispatcher_id
    )
    RETURNING *;
END;
$$;

-- Create a function to safely get load offers without recursion
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
  IF user_role IN ('dispatcher', 'admin') THEN
    RETURN QUERY
      SELECT * FROM public.load_offers
      WHERE load_id = ANY(p_load_ids)
      ORDER BY created_at DESC;
  -- For drivers: return only their offers
  ELSE
    RETURN QUERY
      SELECT * FROM public.load_offers
      WHERE load_id = ANY(p_load_ids)
      AND driver_user_id = user_id
      ORDER BY created_at DESC;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_loads() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_load_offers(BIGINT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_load(TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, UUID) TO authenticated;

-- Create a view that uses this function
DROP VIEW IF EXISTS public.user_loads;
CREATE VIEW public.user_loads AS
  SELECT * FROM public.get_user_loads();

-- Grant select permission on the view to authenticated users
GRANT SELECT ON public.user_loads TO authenticated;

-- Comments for documentation
COMMENT ON FUNCTION public.get_user_loads IS 'Safely gets loads for the current user based on their role without triggering recursive policy evaluation';
COMMENT ON VIEW public.user_loads IS 'View that returns loads accessible to the current user';
COMMENT ON FUNCTION public.get_user_load_offers IS 'Safely gets load offers for specified loads based on user role without triggering recursive policy evaluation';
