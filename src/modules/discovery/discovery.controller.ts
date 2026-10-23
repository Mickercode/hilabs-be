import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { DiscoveryService } from './discovery.service.js';
import { RecordDepthEventDto } from './dto/record-depth-event.dto.js';

@ApiTags('discovery')
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('challenges')
  @ApiOperation({ summary: 'The six Discovery challenges, one per GIM domain (R4)' })
  listChallenges() {
    return this.discovery.listChallenges();
  }

  @Post('depth-events')
  @ApiOperation({ summary: 'Record depth-seeking behaviour (R6)' })
  recordDepthEvent(@Body() dto: RecordDepthEventDto) {
    return this.discovery.recordDepthEvent(dto);
  }

  @Get('learners/:learnerId/summary')
  @ApiParam({ name: 'learnerId', format: 'uuid' })
  @ApiOperation({
    summary: 'Depth-event counts for a learner',
    description: 'Researcher view only. Hidden from learners during the pilot (R16).',
  })
  summary(@Param('learnerId') learnerId: string) {
    return this.discovery.summary(learnerId);
  }
}
