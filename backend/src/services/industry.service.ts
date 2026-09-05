import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../utils/ApiError';
import type {
  CreateIndustryInput,
  ListIndustriesQuery,
  UpdateIndustryInput,
} from '../validators/industry.schema';

const withCounts = {
  _count: { select: { hotspots: true } },
} satisfies Prisma.IndustrialFacilityInclude;

export type FacilityWithCount = Prisma.IndustrialFacilityGetPayload<{ include: typeof withCounts }>;
export type Facility = Prisma.IndustrialFacilityGetPayload<Record<string, never>>;

function buildWhere(query: ListIndustriesQuery): Prisma.IndustrialFacilityWhereInput {
  const where: Prisma.IndustrialFacilityWhereInput = {};
  if (query.type) where.type = query.type;
  if (query.riskLevel) where.riskLevel = query.riskLevel;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { location: { contains: query.search, mode: 'insensitive' } },
      { operator: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export async function listIndustries(query: ListIndustriesQuery): Promise<{
  items: Array<Facility | FacilityWithCount>;
  total: number;
}> {
  const where = buildWhere(query);

  const [items, total] = await Promise.all([
    prisma.industrialFacility.findMany({
      where,
      ...(query.withHotspotCount ? { include: withCounts } : {}),
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.industrialFacility.count({ where }),
  ]);

  return { items, total };
}

export async function getIndustryById(id: string) {
  const facility = await prisma.industrialFacility.findUnique({
    where: { id },
    include: {
      _count: { select: { hotspots: true } },
      hotspots: {
        orderBy: { detectedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          latitude: true,
          longitude: true,
          detectedAt: true,
          eventType: true,
          riskLevel: true,
          riskScore: true,
          confidence: true,
          brightnessTemperature: true,
          persistenceDays: true,
          distanceToFacilityM: true,
        },
      },
    },
  });

  if (!facility) throw ApiError.notFound(`Industrial facility ${id} not found`);
  return facility;
}

export async function createIndustry(input: CreateIndustryInput): Promise<Facility> {
  return prisma.industrialFacility.create({ data: input });
}

export async function updateIndustry(id: string, input: UpdateIndustryInput): Promise<Facility> {
  const existing = await prisma.industrialFacility.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound(`Industrial facility ${id} not found`);
  return prisma.industrialFacility.update({ where: { id }, data: input });
}

export async function deleteIndustry(id: string): Promise<void> {
  const existing = await prisma.industrialFacility.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound(`Industrial facility ${id} not found`);
  // Hotspots keep their history; the relation is set to NULL by the FK rule.
  await prisma.industrialFacility.delete({ where: { id } });
}

/** Facilities ranked by recent thermal activity — dashboard summary panel. */
export async function getFacilitySummary(limit = 6) {
  const [byType, topFacilities, total] = await Promise.all([
    prisma.industrialFacility.groupBy({ by: ['type'], _count: { _all: true } }),
    prisma.industrialFacility.findMany({
      include: withCounts,
      orderBy: { hotspots: { _count: 'desc' } },
      take: limit,
    }),
    prisma.industrialFacility.count(),
  ]);

  return {
    total,
    byType: byType.map((row) => ({ type: row.type, count: row._count._all })),
    topFacilities: topFacilities.map((facility) => ({
      id: facility.id,
      name: facility.name,
      type: facility.type,
      location: facility.location,
      riskLevel: facility.riskLevel,
      latitude: facility.latitude,
      longitude: facility.longitude,
      hotspotCount: facility._count.hotspots,
    })),
  };
}
