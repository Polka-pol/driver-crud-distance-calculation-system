-- Fix load_offers read policy to allow dispatchers to see offers with mysql_truck_id
-- This addresses the issue where offers created with mysql_truck_id don't appear in the UI

-- First, create a policy for dispatchers to read all offers
DROP POLICY IF EXISTS load_offers_select_dispatcher ON public.load_offers;
CREATE POLICY load_offers_select_dispatcher ON public.load_offers
  FOR SELECT USING (
    -- Allow if user has dispatcher/admin role
    public.is_dispatcher()
    OR
    -- Allow if user created the load
    EXISTS (
      SELECT 1 FROM public.loads l 
      WHERE l.id = load_offers.load_id AND l.created_by_dispatcher_id = auth.uid()
    )
  );

-- Update the driver policy to include mysql_truck_id access
DROP POLICY IF EXISTS load_offers_select_driver ON public.load_offers;
CREATE POLICY load_offers_select_driver ON public.load_offers
  FOR SELECT USING (
    -- Direct match on driver_user_id
    driver_user_id = auth.uid() 
    OR 
    -- Match through driver_mapping for mysql_truck_id
    EXISTS (
      SELECT 1 FROM public.driver_mapping dm
      WHERE dm.auth_user_id = auth.uid() AND dm.mysql_truck_id = load_offers.mysql_truck_id
    )
    OR
    -- Use the existing helper function
    public.driver_has_offer_access(id)
  );

-- Create a view to help debug offer visibility
CREATE OR REPLACE VIEW public.visible_load_offers AS
SELECT 
  lo.*,
  l.origin_address,
  l.destination_address,
  l.created_by_dispatcher_id,
  dm.auth_user_id AS mapped_driver_id
FROM 
  public.load_offers lo
LEFT JOIN 
  public.loads l ON lo.load_id = l.id
LEFT JOIN 
  public.driver_mapping dm ON lo.mysql_truck_id = dm.mysql_truck_id;

-- Grant access to the view
GRANT SELECT ON public.visible_load_offers TO authenticated;
