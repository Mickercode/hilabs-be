import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Account } from '../../common/auth/current-account.decorator.js';
import { assertCanReachLearner, requireOwnLearnerId } from '../../common/auth/scope.js';
import type { CurrentAccount } from '../../common/auth/types.js';
import { StartStepDto } from './dto/start-step.dto.js';
import { JourneyService } from './journey.service.js';

@ApiTags('journey')
@Controller('journey')
export class JourneyController {
  constructor(private readonly journey: JourneyService) {}

  @Post('steps')
  @ApiOperation({ summary: 'Open a journey step, recording whether the learner chose it' })
  startStep(@Body() dto: StartStepDto, @Account() account: CurrentAccount) {
    return this.journey.startStep(requireOwnLearnerId(account), dto);
  }

  @Patch('steps/:id/end')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Close a journey step' })
  endStep(@Param('id') id: string, @Account() account: CurrentAccount) {
    return this.journey.endStep(account, id);
  }

  @Get('learners/:learnerId')
  @ApiParam({ name: 'learnerId', format: 'uuid' })
  @ApiOperation({ summary: 'The path a learner has taken through the phases' })
  listForLearner(@Param('learnerId') learnerId: string, @Account() account: CurrentAccount) {
    assertCanReachLearner(account, learnerId);
    return this.journey.listForLearner(learnerId);
  }

  @Get('learners/:learnerId/volition')
  @ApiParam({ name: 'learnerId', format: 'uuid' })
  @ApiOperation({ summary: 'How many steps the learner chose rather than was sent to' })
  volition(@Param('learnerId') learnerId: string, @Account() account: CurrentAccount) {
    assertCanReachLearner(account, learnerId);
    return this.journey.volition(learnerId);
  }
}
