-- CreateEnum
CREATE TYPE "ThermalClass" AS ENUM ('POSSIBLE_INDUSTRIAL_FIRE', 'POSSIBLE_VEGETATION_FIRE', 'POSSIBLE_AGRICULTURAL_BURN', 'POSSIBLE_PERSISTENT_THERMAL_SOURCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ClassificationPath" AS ENUM ('ML_SERVICE', 'RULE_FALLBACK', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "EmergencyFacilityType" AS ENUM ('HOSPITAL', 'FIRE_STATION', 'SCHOOL', 'POLICE', 'SHELTER', 'WATER_SOURCE');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DataSourceStatus" AS ENUM ('LIVE', 'CREDENTIALS_REQUIRED', 'UNAVAILABLE', 'DEMO');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('QUEUED', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "reasons" TEXT[],
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "status" "AlertStatus" NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "hotspots" ADD COLUMN     "classificationPath" "ClassificationPath" NOT NULL DEFAULT 'UNCLASSIFIED',
ADD COLUMN     "classifiedAt" TIMESTAMP(3),
ADD COLUMN     "inBhopalBoundary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "instrument" TEXT,
ADD COLUMN     "mlClass" "ThermalClass",
ADD COLUMN     "mlConfidence" DOUBLE PRECISION,
ADD COLUMN     "modelVersion" TEXT;

-- CreateTable
CREATE TABLE "administrative_boundaries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "osmId" TEXT,
    "simplifiedGeoJson" JSONB,
    "minLng" DOUBLE PRECISION NOT NULL,
    "minLat" DOUBLE PRECISION NOT NULL,
    "maxLng" DOUBLE PRECISION NOT NULL,
    "maxLat" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "license" TEXT,
    "attribution" TEXT,
    "retrievedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_boundaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_facilities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EmergencyFacilityType" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "capacity" TEXT,
    "phone" TEXT,
    "operator" TEXT,
    "ownership" TEXT,
    "osmId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'OpenStreetMap',
    "sourceUrl" TEXT,
    "lastVerified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weather_observations" (
    "id" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "temperatureC" DOUBLE PRECISION,
    "humidityPct" DOUBLE PRECISION,
    "windSpeedMs" DOUBLE PRECISION,
    "windDirectionDeg" DOUBLE PRECISION,
    "rainfallMm" DOUBLE PRECISION,
    "warning" TEXT,
    "provider" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weather_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" TEXT NOT NULL,
    "hotspotId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "level" "RiskLevel" NOT NULL,
    "reasons" TEXT[],
    "components" JSONB NOT NULL,
    "weights" JSONB NOT NULL,
    "nearestHospitalM" DOUBLE PRECISION,
    "nearestFireStationM" DOUBLE PRECISION,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_sources" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "DataSourceStatus" NOT NULL DEFAULT 'UNAVAILABLE',
    "updateFrequency" TEXT,
    "officialUrl" TEXT,
    "license" TEXT,
    "attribution" TEXT,
    "isGovernment" BOOLEAN NOT NULL DEFAULT false,
    "statusNote" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncRecords" INTEGER,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'QUEUED',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "parameters" JSONB,
    "summary" JSONB,
    "hotspotCount" INTEGER NOT NULL DEFAULT 0,
    "alertCount" INTEGER NOT NULL DEFAULT 0,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "administrative_boundaries_osmId_key" ON "administrative_boundaries"("osmId");

-- CreateIndex
CREATE INDEX "administrative_boundaries_level_idx" ON "administrative_boundaries"("level");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_boundaries_name_level_key" ON "administrative_boundaries"("name", "level");

-- CreateIndex
CREATE UNIQUE INDEX "emergency_facilities_osmId_key" ON "emergency_facilities"("osmId");

-- CreateIndex
CREATE INDEX "emergency_facilities_type_idx" ON "emergency_facilities"("type");

-- CreateIndex
CREATE INDEX "emergency_facilities_latitude_longitude_idx" ON "emergency_facilities"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "weather_observations_observedAt_idx" ON "weather_observations"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "weather_observations_provider_observedAt_latitude_longitude_key" ON "weather_observations"("provider", "observedAt", "latitude", "longitude");

-- CreateIndex
CREATE INDEX "risk_assessments_hotspotId_idx" ON "risk_assessments"("hotspotId");

-- CreateIndex
CREATE INDEX "risk_assessments_assessedAt_idx" ON "risk_assessments"("assessedAt");

-- CreateIndex
CREATE INDEX "risk_assessments_level_idx" ON "risk_assessments"("level");

-- CreateIndex
CREATE UNIQUE INDEX "data_sources_key_key" ON "data_sources"("key");

-- CreateIndex
CREATE INDEX "data_sources_status_idx" ON "data_sources"("status");

-- CreateIndex
CREATE INDEX "reports_kind_idx" ON "reports"("kind");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_createdAt_idx" ON "reports"("createdAt");

-- CreateIndex
CREATE INDEX "alerts_status_idx" ON "alerts"("status");

-- CreateIndex
CREATE INDEX "hotspots_mlClass_idx" ON "hotspots"("mlClass");

-- CreateIndex
CREATE INDEX "hotspots_inBhopalBoundary_idx" ON "hotspots"("inBhopalBoundary");

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_hotspotId_fkey" FOREIGN KEY ("hotspotId") REFERENCES "hotspots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- TIMS Bhopal pilot — PostGIS layer
--
-- Prisma cannot model a `geometry` column, so the authoritative Bhopal polygon
-- is added here and only ever touched through raw SQL. Everything else follows
-- the functional-index convention established in
-- 20260101000100_postgis_geospatial: index the exact expression the queries use.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS postgis;

-- The real administrative polygon. MultiPolygon because districts may be
-- discontiguous; single polygons are wrapped with ST_Multi on insert.
ALTER TABLE "administrative_boundaries"
    ADD COLUMN IF NOT EXISTS "geom" geometry(MultiPolygon, 4326);

-- Point-in-polygon geofencing: ST_Within(hotspot_point, boundary.geom).
CREATE INDEX IF NOT EXISTS "administrative_boundaries_geom_idx"
    ON "administrative_boundaries"
    USING GIST ("geom");

-- Emergency facilities are queried the same two ways as industrial ones:
-- "nearest hospital / fire station" (geography, KNN) and impact-zone
-- containment (planar geometry).
CREATE INDEX IF NOT EXISTS "emergency_facilities_geog_idx"
    ON "emergency_facilities"
    USING GIST ((ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography));

CREATE INDEX IF NOT EXISTS "emergency_facilities_geom_idx"
    ON "emergency_facilities"
    USING GIST ((ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)));

-- Convenience view mirroring hotspots_geo / industrial_facilities_geo.
CREATE OR REPLACE VIEW "emergency_facilities_geo" AS
SELECT
    e.*,
    ST_SetSRID(ST_MakePoint(e."longitude", e."latitude"), 4326)::geography AS geog
FROM "emergency_facilities" e;
