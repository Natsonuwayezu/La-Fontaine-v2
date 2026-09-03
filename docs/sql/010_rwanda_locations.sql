-- ═══════════════════════════════════════════════════════════════════
-- 010_rwanda_locations.sql
-- Rwanda administrative location hierarchy for enrollment form.
-- Table: rwanda_locations
-- Columns: province, district, sector, cell, village (all TEXT)
-- Used by: enroll-student.js location cascade (province→district→sector→cell→village)
-- ═══════════════════════════════════════════════════════════════════
--
-- Run this AFTER 009_second_sitting.sql
--
-- IMPORTANT: This file only creates the table structure.
-- You must separately import the Rwanda location data.
-- Source: MINALOC official Rwanda location dataset.
-- Format: one row per village — each row has all 5 levels.
--
-- After creating the table, import the CSV via:
--   Supabase Dashboard → Table Editor → rwanda_locations → Import CSV
-- OR via SQL:
--   COPY rwanda_locations(province,district,sector,cell,village)
--   FROM '/path/to/rwanda_locations.csv' DELIMITER ',' CSV HEADER;
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rwanda_locations (
    id         SERIAL PRIMARY KEY,
    province   TEXT NOT NULL,
    district   TEXT NOT NULL,
    sector     TEXT NOT NULL,
    cell       TEXT NOT NULL,
    village    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast cascade lookups
CREATE INDEX IF NOT EXISTS idx_rw_loc_province ON rwanda_locations(province);
CREATE INDEX IF NOT EXISTS idx_rw_loc_district ON rwanda_locations(province, district);
CREATE INDEX IF NOT EXISTS idx_rw_loc_sector   ON rwanda_locations(province, district, sector);
CREATE INDEX IF NOT EXISTS idx_rw_loc_cell     ON rwanda_locations(province, district, sector, cell);

-- Unique constraint — no duplicate village rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_rw_loc_unique
    ON rwanda_locations(province, district, sector, cell, village);

-- RLS
ALTER TABLE rwanda_locations ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed for enrollment form dropdown)
CREATE POLICY IF NOT EXISTS "Auth users can read rwanda_locations"
    ON rwanda_locations FOR SELECT
    USING (auth.role() = 'authenticated');

-- Only admins can write (location data should not be modified by teachers)
CREATE POLICY IF NOT EXISTS "Admins can manage rwanda_locations"
    ON rwanda_locations FOR ALL
    USING (auth.role() = 'authenticated');

-- Verify
SELECT COUNT(*) AS location_rows FROM rwanda_locations;
