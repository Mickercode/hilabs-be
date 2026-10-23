import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Account } from '../../common/auth/current-account.decorator.js';
import { assertCanReachLearner, requireOwnLearnerId } from '../../common/auth/scope.js';
import type { CurrentAccount } from '../../common/auth/types.js';
import { AddDraftDto } from './dto/add-draft.dto.js';
import { PortfolioService } from './portfolio.service.js';

@ApiTags('portfolio')
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Post('drafts')
  @ApiOperation({
    summary: 'Save a draft',
    description: 'Every draft is kept as a new version. Nothing is overwritten (R14).',
  })
  addDraft(@Body() dto: AddDraftDto, @Account() account: CurrentAccount) {
    // The learner is the one holding the session, never one named in the body.
    return this.portfolio.addDraft(requireOwnLearnerId(account), dto);
  }

  @Get('learners/:learnerId')
  @ApiParam({ name: 'learnerId', format: 'uuid' })
  @ApiOperation({ summary: "Everything a learner has written" })
  listForLearner(@Param('learnerId') learnerId: string, @Account() account: CurrentAccount) {
    assertCanReachLearner(account, learnerId);
    return this.portfolio.listForLearner(learnerId);
  }

  @Get('learners/:learnerId/tasks/:taskId')
  @ApiParam({ name: 'learnerId', format: 'uuid' })
  @ApiParam({ name: 'taskId', format: 'uuid' })
  @ApiOperation({ summary: 'The draft history for one task' })
  listDrafts(
    @Param('learnerId') learnerId: string,
    @Param('taskId') taskId: string,
    @Account() account: CurrentAccount,
  ) {
    assertCanReachLearner(account, learnerId);
    return this.portfolio.listDrafts(learnerId, taskId);
  }
}
