import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CreateLearnerDto } from './dto/create-learner.dto.js';
import { LearnersService } from './learners.service.js';

@ApiTags('learners')
@Controller('learners')
export class LearnersController {
  constructor(private readonly learners: LearnersService) {}

  @Post()
  @ApiOperation({
    summary: 'Start a journey from a question or a goal',
    description: 'Onboarding collects no grades, school or credentials (R1, R2).',
  })
  create(@Body() dto: CreateLearnerDto) {
    return this.learners.create(dto);
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Fetch a learner' })
  findOne(@Param('id') id: string) {
    return this.learners.findOne(id);
  }

  @Get(':id/export')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Everything recorded about a learner',
    description: 'R21. Excludes interpretations, which are not shown during the pilot.',
  })
  exportAll(@Param('id') id: string) {
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
  requestErasure(@Param('id') id: string) {
    return this.learners.requestErasure(id);
  }
}
