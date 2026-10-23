import { Module } from '@nestjs/common';
import { CompanionController } from './companion.controller.js';
import { CompanionService } from './companion.service.js';

@Module({
  controllers: [CompanionController],
  providers: [CompanionService],
  exports: [CompanionService],
})
export class CompanionModule {}
