-- ========================================================
-- SUPABASE DATABASE SETUP FOR DEER LAKE COLLABORATION (V1.5.0)
-- Run this script in your Supabase SQL Editor.
-- ========================================================

-- 1. Create the cadet_locations table (Drop if exists to ensure clean schema update)
DROP TABLE IF EXISTS public.cadet_locations CASCADE;

CREATE TABLE public.cadet_locations (
    id TEXT PRIMARY KEY,                       -- Unique session/device ID generated client-side
    dispatcher_id TEXT NOT NULL,               -- The auth user ID (UUID) of the dispatcher tracking this cadet
    name TEXT NOT NULL,                        -- Call sign or name (e.g., "Safety Boat 1")
    latitude DOUBLE PRECISION NOT NULL,       -- Current GPS Latitude
    longitude DOUBLE PRECISION NOT NULL,      -- Current GPS Longitude
    status TEXT NOT NULL DEFAULT 'active',     -- 'active', 'training', 'sos'
    accuracy DOUBLE PRECISION,                 -- GPS accuracy in meters
    icon_type TEXT NOT NULL DEFAULT 'blip',    -- 'blip', 'boat', 'truck', 'user', 'anchor', 'medical', 'warning'
    icon_color TEXT NOT NULL DEFAULT 'green',  -- 'green', 'red', 'blue', 'orange', 'purple', 'yellow', 'white'
    party_type TEXT NOT NULL DEFAULT 'Party',  -- 'Boat', 'Vehicle', 'On Foot', 'Aircraft'
    party_size INTEGER NOT NULL DEFAULT 1,     -- Number of people in the party
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create a function to auto-update the updated_at column
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_cadet_locations_modtime
    BEFORE UPDATE ON public.cadet_locations
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- 3. Enable row-level security (RLS) and allow public read / authenticated write policies
ALTER TABLE public.cadet_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read" ON public.cadet_locations;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.cadet_locations;
DROP POLICY IF EXISTS "Allow authenticated update" ON public.cadet_locations;
DROP POLICY IF EXISTS "Allow authenticated delete" ON public.cadet_locations;
DROP POLICY IF EXISTS "Allow select for matching dispatcher" ON public.cadet_locations;
DROP POLICY IF EXISTS "Allow public insert" ON public.cadet_locations;
DROP POLICY IF EXISTS "Allow public update" ON public.cadet_locations;
DROP POLICY IF EXISTS "Allow public delete" ON public.cadet_locations;

-- Anyone can SELECT/READ cadet locations (necessary for upserts from anonymous field clients to succeed)
CREATE POLICY "Allow public read" 
    ON public.cadet_locations FOR SELECT 
    USING (true);

-- Anyone can INSERT locations (allowing anonymous cadet connections)
CREATE POLICY "Allow public insert" 
    ON public.cadet_locations FOR INSERT 
    WITH CHECK (true);

-- Anyone can UPDATE their own location (identified by the unique row ID)
CREATE POLICY "Allow public update" 
    ON public.cadet_locations FOR UPDATE 
    USING (true)
    WITH CHECK (true);

-- Anyone can DELETE their location row when stopping transmission
CREATE POLICY "Allow public delete" 
    ON public.cadet_locations FOR DELETE 
    USING (true);

-- 4. Enable Supabase Realtime for this table
-- This allows clients to stream insert/update/delete events in real-time.
ALTER PUBLICATION supabase_realtime ADD TABLE public.cadet_locations;
