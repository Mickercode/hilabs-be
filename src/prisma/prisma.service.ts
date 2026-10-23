import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * The client is generated from the live database (`npm run db:pull`), never the other way
 * round. db/schema.sql owns the shape, including the triggers and CHECKs that carry the
 * research design, so nothing here should ever call `prisma migrate`.
 *
 * Prisma 7 connects through a driver adapter rather than a URL in schema.prisma.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('app.databaseUrl');
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Erases a learner and everything recorded about them (R21).
   *
   * The delete order is a foreign-key dependency order and lives in the database as
   * `hilabs_erase_learner`, so that there is exactly one copy of it. Do not reimplement it
   * here: a TypeScript copy drifts from the schema the first time a table is added.
   */
  async eraseLearner(learnerId: string): Promise<void> {
    await this.$executeRaw`SELECT hilabs_erase_learner(${learnerId}::uuid)`;
  }
}
