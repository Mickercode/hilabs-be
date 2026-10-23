import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Account } from '../../common/auth/current-account.decorator.js';
import { assertCanReachLearner, requireOwnLearnerId } from '../../common/auth/scope.js';
import type { CurrentAccount } from '../../common/auth/types.js';
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
  logIntervention(@Body() dto: LogInterventionDto, @Account() account: CurrentAccount) {
    return this.companion.logIntervention(requireOwnLearnerId(account), dto);
  }

  @Get('learners/:learnerId')
  @ApiParam({ name: 'learnerId', format: 'uuid' })
  @ApiOperation({ summary: 'Every intervention a learner received' })
  listForLearner(@Param('learnerId') learnerId: string, @Account() account: CurrentAccount) {
    assertCanReachLearner(account, learnerId);
    return this.companion.listForLearner(learnerId);
  }

  @Get('learners/:learnerId/help-profile')
  @ApiParam({ name: 'learnerId', format: 'uuid' })
  @ApiOperation({ summary: 'How much help a learner had, by kind' })
  helpProfile(@Param('learnerId') learnerId: string, @Account() account: CurrentAccount) {
    assertCanReachLearner(account, learnerId);
    return this.companion.helpProfile(learnerId);
  }
}
