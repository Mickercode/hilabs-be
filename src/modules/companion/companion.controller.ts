import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CompanionService } from './companion.service.js';
import { LogInterventionDto } from './dto/log-intervention.dto.js';

@ApiTags('companion')
@Controller('companion')
export class CompanionController {
  constructor(private readonly companion: CompanionService) {}

  @Post('interventions')
  @ApiOperation({
    summary: 'Record a companion intervention',
    description:
      'Every hint, explanation and example is logged, so the evaluation can separate the ' +
      "learner's work from the help they had (R11, 4.4).",
  })
  logIntervention(@Body() dto: LogInterventionDto) {
    return this.companion.logIntervention(dto);
  }

  @Get('learners/:learnerId')
  @ApiParam({ name: 'learnerId', format: 'uuid' })
  @ApiOperation({ summary: 'Every intervention a learner received' })
  listForLearner(@Param('learnerId') learnerId: string) {
    return this.companion.listForLearner(learnerId);
  }

  @Get('learners/:learnerId/help-profile')
  @ApiParam({ name: 'learnerId', format: 'uuid' })
  @ApiOperation({ summary: 'How much help a learner had, by kind' })
  helpProfile(@Param('learnerId') learnerId: string) {
    return this.companion.helpProfile(learnerId);
  }
}
