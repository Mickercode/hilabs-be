import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { StartStepDto } from './dto/start-step.dto.js';
import { JourneyService } from './journey.service.js';

@ApiTags('journey')
@Controller('journey')
export class JourneyController {
  constructor(private readonly journey: JourneyService) {}

  @Post('steps')
  @ApiOperation({ summary: 'Open a journey step, recording whether the learner chose it' })
  startStep(@Body() dto: StartStepDto) {
    return this.journey.startStep(dto);
  }

  @Patch('steps/:id/end')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Close a journey step' })
  endStep(@Param('id') id: string) {
    return this.journey.endStep(id);
  }

  @Get('learners/:learnerId')
  @ApiParam({ name: 'learnerId', format: 'uuid' })
  @ApiOperation({ summary: 'The path a learner has taken through the phases' })
  listForLearner(@Param('learnerId') learnerId: string) {
    return this.journey.listForLearner(learnerId);
  }

  @Get('learners/:learnerId/volition')
  @ApiParam({ name: 'learnerId', format: 'uuid' })
  @ApiOperation({ summary: 'How many steps the learner chose rather than was sent to' })
  volition(@Param('learnerId') learnerId: string) {
    return this.journey.volition(learnerId);
  }
}
