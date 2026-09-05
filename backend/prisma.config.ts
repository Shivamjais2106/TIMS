import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration.
 *
 * The datasource URL lives here (not in schema.prisma) so that the same schema
 * can be pointed at local / staging / production PostGIS instances purely
 * through the DATABASE_URL environment variable.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/scripts/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
