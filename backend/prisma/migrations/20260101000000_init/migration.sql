-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('INDUSTRIAL_FIRE', 'GAS_FLARE', 'AGRICULTURAL_FIRE', 'FOREST_FIRE', 'MINING_ACTIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('REFINERY', 'PETROCHEMICAL', 'POWER_PLANT', 'STEEL', 'MINING', 'LNG_TERMINAL', 'OTHER');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "HotspotSource" AS ENUM ('VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT', 'LANDSAT_NRT', 'MANUAL', 'MOCK');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industrial_facilities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FacilityType" NOT NULL DEFAULT 'OTHER',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "operator" TEXT,
    "osmId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "industrial_facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotspots" (
    "id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "confidence" INTEGER NOT NULL,
    "brightnessTemperature" DOUBLE PRECISION NOT NULL,
    "eventType" "EventType" NOT NULL DEFAULT 'OTHER',
    "persistenceDays" INTEGER NOT NULL DEFAULT 1,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "source" "HotspotSource" NOT NULL DEFAULT 'MOCK',
    "frp" DOUBLE PRECISION,
    "satellite" TEXT,
    "dayNight" TEXT,
    "region" TEXT,
    "externalId" TEXT,
    "industrialFacilityId" TEXT,
    "distanceToFacilityM" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotspots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hotspotId" TEXT,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "industrial_facilities_osmId_key" ON "industrial_facilities"("osmId");

-- CreateIndex
CREATE INDEX "industrial_facilities_type_idx" ON "industrial_facilities"("type");

-- CreateIndex
CREATE INDEX "industrial_facilities_riskLevel_idx" ON "industrial_facilities"("riskLevel");

-- CreateIndex
CREATE INDEX "industrial_facilities_latitude_longitude_idx" ON "industrial_facilities"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "hotspots_externalId_key" ON "hotspots"("externalId");

-- CreateIndex
CREATE INDEX "hotspots_detectedAt_idx" ON "hotspots"("detectedAt");

-- CreateIndex
CREATE INDEX "hotspots_eventType_idx" ON "hotspots"("eventType");

-- CreateIndex
CREATE INDEX "hotspots_riskLevel_idx" ON "hotspots"("riskLevel");

-- CreateIndex
CREATE INDEX "hotspots_industrialFacilityId_idx" ON "hotspots"("industrialFacilityId");

-- CreateIndex
CREATE INDEX "hotspots_latitude_longitude_idx" ON "hotspots"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "alerts_isRead_idx" ON "alerts"("isRead");

-- CreateIndex
CREATE INDEX "alerts_severity_idx" ON "alerts"("severity");

-- CreateIndex
CREATE INDEX "alerts_createdAt_idx" ON "alerts"("createdAt");

-- CreateIndex
CREATE INDEX "alerts_hotspotId_idx" ON "alerts"("hotspotId");

-- AddForeignKey
ALTER TABLE "hotspots" ADD CONSTRAINT "hotspots_industrialFacilityId_fkey" FOREIGN KEY ("industrialFacilityId") REFERENCES "industrial_facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_hotspotId_fkey" FOREIGN KEY ("hotspotId") REFERENCES "hotspots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
