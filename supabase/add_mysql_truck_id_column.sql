-- Add MySQL truck_id column to load_offers table
-- This allows creating offers for drivers who aren't registered in Supabase yet

-- Modify load_offers table to make driver_user_id nullable and add mysql_truck_id column
ALTER TABLE public.load_offers ALTER COLUMN driver_user_id DROP NOT NULL;
ALTER TABLE public.load_offers ADD COLUMN mysql_truck_id BIGINT;
COMMENT ON COLUMN public.load_offers.mysql_truck_id IS 'MySQL Trucks.ID reference for drivers not yet registered in Supabase';

-- Create index for performance
CREATE INDEX idx_load_offers_mysql_truck_id ON public.load_offers(mysql_truck_id);

-- Create function to get driver_user_id from mysql_truck_id (if mapping exists)
CREATE OR REPLACE FUNCTION public.get_driver_user_id(p_mysql_truck_id BIGINT)
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT auth_user_id 
    FROM public.driver_mapping 
    WHERE mysql_truck_id = p_mysql_truck_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically populate driver_user_id if mapping exists
CREATE OR REPLACE FUNCTION public.set_driver_user_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mysql_truck_id IS NOT NULL AND NEW.driver_user_id IS NULL THEN
    NEW.driver_user_id := public.get_driver_user_id(NEW.mysql_truck_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_driver_user_id_trigger
BEFORE INSERT OR UPDATE ON public.load_offers
FOR EACH ROW EXECUTE FUNCTION public.set_driver_user_id();

-- Update RLS policies to allow access based on mysql_truck_id
-- This ensures that when a driver registers, they can see their previous offers

-- Create a view to help with offer access
CREATE OR REPLACE VIEW public.driver_offers_view AS
SELECT lo.*
FROM public.load_offers lo
LEFT JOIN public.driver_mapping dm ON lo.mysql_truck_id = dm.mysql_truck_id
WHERE lo.driver_user_id IS NOT NULL OR lo.mysql_truck_id IS NOT NULL;

-- Create a function to check if a driver has access to an offer
CREATE OR REPLACE FUNCTION public.driver_has_offer_access(offer_id BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
  v_mysql_truck_id BIGINT;
  v_driver_user_id UUID;
BEGIN
  -- Get the offer's mysql_truck_id and driver_user_id
  SELECT mysql_truck_id, driver_user_id INTO v_mysql_truck_id, v_driver_user_id
  FROM public.load_offers
  WHERE id = offer_id;
  
  -- Direct match on driver_user_id
  IF v_driver_user_id = auth.uid() THEN
    RETURN TRUE;
  END IF;
  
  -- Check if current user is mapped to the mysql_truck_id
  IF v_mysql_truck_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.driver_mapping
      WHERE mysql_truck_id = v_mysql_truck_id AND auth_user_id = auth.uid()
    );
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update load_offers policy for drivers to use the new function
DROP POLICY IF EXISTS load_offers_select_driver ON public.load_offers;
CREATE POLICY load_offers_select_driver ON public.load_offers
  FOR SELECT USING (
    driver_user_id = auth.uid() OR 
    public.driver_has_offer_access(id)
  );

-- Create a function to create load offers with mysql_truck_id
CREATE OR REPLACE FUNCTION public.create_load_offer_with_truck_id(
  p_load_id BIGINT,
  p_mysql_truck_id BIGINT,
  p_driver_user_id UUID DEFAULT NULL,
  p_offer_status public.offer_status DEFAULT 'sent',
  p_driver_distance_miles NUMERIC DEFAULT NULL
)
RETURNS public.load_offers AS $$
DECLARE
  v_result public.load_offers;
BEGIN
  INSERT INTO public.load_offers (
    load_id,
    mysql_truck_id,
    driver_user_id,
    offer_status,
    driver_distance_miles,
    created_at
  ) VALUES (
    p_load_id,
    p_mysql_truck_id,
    p_driver_user_id,
    p_offer_status,
    p_driver_distance_miles,
    NOW()
  )
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
