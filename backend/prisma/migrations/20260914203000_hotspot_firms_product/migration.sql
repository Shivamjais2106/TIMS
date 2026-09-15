-- ---------------------------------------------------------------------------
-- Record the exact FIRMS product each detection came from.
--
-- `hotspots.source` is a coarse enum with no NRT/SP distinction, so an archive
-- read was being stored as VIIRS_SNPP_NRT and was indistinguishable from a
-- near-real-time detection in the UI. This column keeps the verbatim product
-- string so provenance can be stated honestly.
-- ---------------------------------------------------------------------------

ALTER TABLE "hotspots" ADD COLUMN IF NOT EXISTS "firmsProduct" TEXT;

CREATE INDEX IF NOT EXISTS "hotspots_firmsProduct_idx" ON "hotspots"("firmsProduct");

-- Backfill from externalId, which is built as
--   "{PRODUCT}:{satellite}:{isoTimestamp}:{lat}:{lng}"
-- so the product is everything before the first colon. Guarded by the LIKE so
-- only rows in that format are touched.
UPDATE "hotspots"
SET "firmsProduct" = split_part("externalId", ':', 1)
WHERE "firmsProduct" IS NULL
  AND "externalId" IS NOT NULL
  AND "externalId" LIKE '%\_%:%';
