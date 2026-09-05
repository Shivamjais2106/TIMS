-- ---------------------------------------------------------------------------
-- TIMS — PostGIS geospatial layer
--
-- Prisma stores latitude/longitude as plain DOUBLE PRECISION columns. This
-- migration adds the PostGIS extension plus *functional* GiST indexes over the
-- geography point derived from those columns.
--
-- Why functional indexes instead of a real geometry column?
--   * No schema drift: Prisma never sees a column it cannot model, so
--     `prisma migrate dev` stays clean.
--   * ST_SetSRID / ST_MakePoint / ::geography are all IMMUTABLE, so PostgreSQL
--     can index the expression and use it for ST_DWithin / KNN (<->) queries.
--
-- Every geospatial query in src/services/geo.service.ts uses this exact
-- expression, so the planner matches it against these indexes.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS postgis;

-- Radius search / distance ordering over hotspots.
CREATE INDEX IF NOT EXISTS "hotspots_geog_idx"
    ON "hotspots"
    USING GIST ((ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography));

-- Nearest-facility lookups for a given hotspot.
CREATE INDEX IF NOT EXISTS "industrial_facilities_geog_idx"
    ON "industrial_facilities"
    USING GIST ((ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography));

-- Planar geometry indexes: used by point-in-polygon (ST_Contains / ST_Within)
-- queries where a geography cast would be unnecessarily expensive.
CREATE INDEX IF NOT EXISTS "hotspots_geom_idx"
    ON "hotspots"
    USING GIST ((ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)));

CREATE INDEX IF NOT EXISTS "industrial_facilities_geom_idx"
    ON "industrial_facilities"
    USING GIST ((ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)));

-- ---------------------------------------------------------------------------
-- Convenience views. These expose a ready-made `geog` column so ad-hoc SQL and
-- future services (including the AI/ML service) can join on geography without
-- repeating the ST_MakePoint expression.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW "hotspots_geo" AS
SELECT
    h.*,
    ST_SetSRID(ST_MakePoint(h."longitude", h."latitude"), 4326)::geography AS geog
FROM "hotspots" h;

CREATE OR REPLACE VIEW "industrial_facilities_geo" AS
SELECT
    f.*,
    ST_SetSRID(ST_MakePoint(f."longitude", f."latitude"), 4326)::geography AS geog
FROM "industrial_facilities" f;
