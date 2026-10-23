import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer takes the connection URL from schema.prisma. The CLI reads it here, and
// the client gets it through a driver adapter in src/prisma/prisma.service.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
