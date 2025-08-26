-- Supabase Migration Schema for Connex Transport
-- Creates tables for loads, load_offers, offer_messages, and driver_mapping

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enums
CREATE TYPE public.offer_status AS ENUM (
  'sent',
  'viewed', 
  'driver_interested',
  'accepted',
  'rejected',
  'expired',
  'completed'
);

CREATE TYPE public.message_type AS ENUM (
  'text',
  'price_offer',
  'status_update',
  'system'
);

-- Loads table (dispatcher creates load with pickup/destination details)
CREATE TABLE public.loads (
  id BIGSERIAL PRIMARY KEY,
  origin_address TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  weight NUMERIC,
  dimensions TEXT,
  proposed_cost_by_user NUMERIC,
  delivery_distance_miles NUMERIC,
  created_by_dispatcher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Load offers (one record per driver per load)
CREATE TABLE public.load_offers (
  id BIGSERIAL PRIMARY KEY,
  load_id BIGINT NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  driver_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_status public.offer_status NOT NULL DEFAULT 'sent',
  driver_distance_miles NUMERIC,
  driver_proposed_cost NUMERIC,
  viewed_at TIMESTAMPTZ,
  price_proposed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one offer per driver per load
  UNIQUE(load_id, driver_user_id)
);

-- Offer messages (chat between dispatcher and driver for specific offer)
CREATE TABLE public.offer_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id BIGINT NOT NULL REFERENCES public.load_offers(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('driver', 'dispatcher')),
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message_type public.message_type NOT NULL DEFAULT 'text',
  message_text TEXT,
  price_amount NUMERIC,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Driver mapping (links Supabase auth.users to MySQL Trucks.ID)
CREATE TABLE public.driver_mapping (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mysql_truck_id BIGINT NOT NULL,
  driver_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one-to-one mapping
  UNIQUE(mysql_truck_id)
);

-- Indexes for performance
CREATE INDEX idx_loads_created_by ON public.loads(created_by_dispatcher_id);
CREATE INDEX idx_loads_created_at ON public.loads(created_at DESC);

CREATE INDEX idx_load_offers_load_id ON public.load_offers(load_id);
CREATE INDEX idx_load_offers_driver_user_id ON public.load_offers(driver_user_id);
CREATE INDEX idx_load_offers_status ON public.load_offers(offer_status);
CREATE INDEX idx_load_offers_created_at ON public.load_offers(created_at DESC);

CREATE INDEX idx_offer_messages_offer_id ON public.offer_messages(offer_id);
CREATE INDEX idx_offer_messages_created_at ON public.offer_messages(created_at ASC);
CREATE INDEX idx_offer_messages_unread ON public.offer_messages(offer_id, is_read) WHERE is_read = FALSE;

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_loads_updated_at
  BEFORE UPDATE ON public.loads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_load_offers_updated_at
  BEFORE UPDATE ON public.load_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_mapping ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Loads: Dispatchers can see all loads, drivers see loads they have offers for
CREATE POLICY loads_select_dispatcher ON public.loads
  FOR SELECT USING (
    COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') IN ('dispatcher', 'admin')
    OR created_by_dispatcher_id = auth.uid()
  );

CREATE POLICY loads_select_driver ON public.loads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.load_offers lo 
      WHERE lo.load_id = loads.id AND lo.driver_user_id = auth.uid()
    )
  );

CREATE POLICY loads_insert_dispatcher ON public.loads
  FOR INSERT WITH CHECK (
    COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') IN ('dispatcher', 'admin')
    OR created_by_dispatcher_id = auth.uid()
  );

-- Load offers: Drivers see only their offers, dispatchers see all
CREATE POLICY load_offers_select_driver ON public.load_offers
  FOR SELECT USING (driver_user_id = auth.uid());

CREATE POLICY load_offers_select_dispatcher ON public.load_offers
  FOR SELECT USING (
    COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') IN ('dispatcher', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.loads l 
      WHERE l.id = load_offers.load_id AND l.created_by_dispatcher_id = auth.uid()
    )
  );

CREATE POLICY load_offers_insert_dispatcher ON public.load_offers
  FOR INSERT WITH CHECK (
    COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') IN ('dispatcher', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.loads l 
      WHERE l.id = load_offers.load_id AND l.created_by_dispatcher_id = auth.uid()
    )
  );

CREATE POLICY load_offers_update_driver ON public.load_offers
  FOR UPDATE USING (driver_user_id = auth.uid())
  WITH CHECK (driver_user_id = auth.uid());

CREATE POLICY load_offers_update_dispatcher ON public.load_offers
  FOR UPDATE USING (
    COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') IN ('dispatcher', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.loads l 
      WHERE l.id = load_offers.load_id AND l.created_by_dispatcher_id = auth.uid()
    )
  );

-- Offer messages: Participants in the offer can see and send messages
CREATE POLICY offer_messages_select ON public.offer_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.load_offers lo
      JOIN public.loads l ON l.id = lo.load_id
      WHERE lo.id = offer_messages.offer_id
        AND (
          lo.driver_user_id = auth.uid()
          OR l.created_by_dispatcher_id = auth.uid()
          OR COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') IN ('dispatcher', 'admin')
        )
    )
  );

CREATE POLICY offer_messages_insert ON public.offer_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.load_offers lo
      JOIN public.loads l ON l.id = lo.load_id
      WHERE lo.id = offer_messages.offer_id
        AND (
          (offer_messages.sender_type = 'driver' AND lo.driver_user_id = auth.uid())
          OR (offer_messages.sender_type = 'dispatcher' AND (
            l.created_by_dispatcher_id = auth.uid()
            OR COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') IN ('dispatcher', 'admin')
          ))
        )
    )
  );

CREATE POLICY offer_messages_update ON public.offer_messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.load_offers lo
      JOIN public.loads l ON l.id = lo.load_id
      WHERE lo.id = offer_messages.offer_id
        AND (
          lo.driver_user_id = auth.uid()
          OR l.created_by_dispatcher_id = auth.uid()
          OR COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') IN ('dispatcher', 'admin')
        )
    )
  );

-- Driver mapping: Users can see their own mapping, dispatchers can see all
CREATE POLICY driver_mapping_select_own ON public.driver_mapping
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY driver_mapping_select_dispatcher ON public.driver_mapping
  FOR SELECT USING (
    COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') IN ('dispatcher', 'admin')
  );

-- Helper function to get current driver's MySQL truck ID
CREATE OR REPLACE FUNCTION public.current_driver_mysql_id()
RETURNS BIGINT AS $$
BEGIN
  RETURN (
    SELECT mysql_truck_id 
    FROM public.driver_mapping 
    WHERE auth_user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON TABLE public.loads IS 'Load details created by dispatchers';
COMMENT ON TABLE public.load_offers IS 'Offers sent to specific drivers for specific loads';
COMMENT ON TABLE public.offer_messages IS 'Chat messages between dispatcher and driver for specific offers';
COMMENT ON TABLE public.driver_mapping IS 'Maps Supabase auth users to MySQL truck IDs';
