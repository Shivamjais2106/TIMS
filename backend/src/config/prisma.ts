import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from './env';

/**
 * Single shared PrismaClient. Prisma 7 runs on the query compiler, so a driver
 * adapter (node-postgres here) is required — this also means the same
 * connection pool is available for the raw PostGIS SQL in geo.service.ts.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: env.isDevelopment ? ['warn', 'error'] : ['error'],
  });

if (!env.isProduction) {
  // Prevents a new pool per hot-reload during development.
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
