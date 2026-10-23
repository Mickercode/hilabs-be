import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import configuration from './config/configuration.js';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { CompanionModule } from './modules/companion/companion.module.js';
import { DiscoveryModule } from './modules/discovery/discovery.module.js';
import { JourneyModule } from './modules/journey/journey.module.js';
import { LearnersModule } from './modules/learners/learners.module.js';
import { LibraryModule } from './modules/library/library.module.js';
import { PortfolioModule } from './modules/portfolio/portfolio.module.js';
import { ResearchModule } from './modules/research/research.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,

    // Domain modules, in the order a learner meets them.
    LearnersModule,
    DiscoveryModule,
    LibraryModule,
    JourneyModule,
    PortfolioModule,
    CompanionModule,

    // The researcher side. Never reachable from a learner-facing client.
    ResearchModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
