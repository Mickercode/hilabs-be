import { Controller, Delete, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Account } from '../../common/auth/current-account.decorator.js';
import { assertCanReachLearner } from '../../common/auth/scope.js';
import type { CurrentAccount } from '../../common/auth/types.js';
import { LearnersService } from './learners.service.js';

@ApiTags('learners')
@Controller('learners')
export class LearnersController {
  constructor(private readonly learners: LearnersService) {}

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Fetch a learner' })
  findOne(@Param('id') id: string, @Account() account: CurrentAccount) {
    assertCanReachLearner(account, id);
    return this.learners.findOne(id);
  }

  @Get(':id/export')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Everything recorded about a learner',
    description: 'R21. Excludes interpretations, which are not shown during the pilot.',
  })
  exportAll(@Param('id') id: string, @Account() account: CurrentAccount) {
    assertCanReachLearner(account, id);
    return this.learners.exportAll(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Request erasure',
    description:
      'Opens a request. Nothing is deleted until it is authorised; the database refuses every delete until then (R21).',
  })
  requestErasure(@Param('id') id: string, @Account() account: CurrentAccount) {
    assertCanReachLearner(account, id);
    return this.learners.requestErasure(id);
  }
}
