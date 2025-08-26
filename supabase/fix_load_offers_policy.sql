-- Fix load_offers RLS policy to allow inserting with mysql_truck_id
-- This addresses the 42501 error: "new row violates row-level security policy for table "load_offers""

-- First, drop the existing insert policy if it exists
DROP POLICY IF EXISTS load_offers_insert_dispatcher ON public.load_offers;

-- Create a new insert policy that allows dispatchers to insert records with mysql_truck_id
CREATE POLICY load_offers_insert_dispatcher ON public.load_offers
  FOR INSERT WITH CHECK (
    -- Allow if user has dispatcher/admin role
    (COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') IN ('dispatcher', 'admin'))
    OR
    -- Allow if user created the load
    EXISTS (
      SELECT 1 FROM public.loads l 
      WHERE l.id = load_offers.load_id AND l.created_by_dispatcher_id = auth.uid()
    )
  );

-- Create a function to check if the current user is a dispatcher
CREATE OR REPLACE FUNCTION public.is_dispatcher()
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Try to get role from JWT claims
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  
  -- Check if role is dispatcher or admin
  IF v_role IN ('dispatcher', 'admin') THEN
    RETURN TRUE;
  END IF;
  
  -- If no role in JWT, check if user created any loads (implicit dispatcher)
  RETURN EXISTS (
    SELECT 1 FROM public.loads WHERE created_by_dispatcher_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the procedure if it exists to avoid the 'cannot change routine kind' error
DROP PROCEDURE IF EXISTS public.create_load_offers_with_truck_ids(BIGINT, BIGINT[]);

-- Create a function to create load offers with mysql_truck_id (for RPC calls)
CREATE OR REPLACE FUNCTION public.create_load_offers_with_truck_ids(
  p_load_id BIGINT,
  p_mysql_truck_ids BIGINT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_truck_id BIGINT;
  v_result JSONB;
  v_created_count INTEGER := 0;
  v_created_offers JSONB := '[]'::JSONB;
BEGIN
  -- Check if user is authorized (dispatcher or created the load)
  IF NOT public.is_dispatcher() AND NOT EXISTS (
    SELECT 1 FROM public.loads WHERE id = p_load_id AND created_by_dispatcher_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to create offers for this load';
  END IF;
  
  -- Insert offers for each truck ID
  FOREACH v_truck_id IN ARRAY p_mysql_truck_ids
  LOOP
    INSERT INTO public.load_offers (
      load_id,
      mysql_truck_id,
      driver_user_id,
      offer_status,
      created_at
    ) VALUES (
      p_load_id,
      v_truck_id,
      public.get_driver_user_id(v_truck_id),
      'sent',
      NOW()
    )
    RETURNING to_jsonb(load_offers.*) INTO v_result;
    
    v_created_offers := v_created_offers || v_result;
    v_created_count := v_created_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'created_count', v_created_count,
    'offers', v_created_offers
  );
END;
$$;
