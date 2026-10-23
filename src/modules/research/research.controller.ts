import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ResearchService } from './research.service.js';

// Never reachable from a learner-facing client: these endpoints expose GIM interpretations,
// which a learner must not see during the pilot (R16).
@Roles('researcher', 'admin')
@ApiTags('research')
@Controller('research')
export class ResearchController {
  constructor(private readonly research: ResearchService) {}

  @Get('rating-progress')
  @ApiOperation({ summary: 'How far the rating panel has got' })
  ratingProgress() {
    return this.research.ratingProgress();
  }

  @Get('marker-parity')
  @ApiOperation({
    summary: 'Redaction marker frequency by arm (R18)',
    description: 'A sharp difference between arms means the blind is leaking.',
  })
  markerParity() {
    return this.research.markerParity();
  }

  @Get('hypotheses/current')
  @ApiOperation({ summary: 'The current GIM interpretation per learner and type (R16)' })
  currentHypotheses() {
    return this.research.currentHypotheses();
  }

  @Get('hypotheses/missing-evidence')
  @ApiOperation({
    summary: 'Interpretations with no evidence behind them',
    description: 'Must always be empty. Anything here is a bug, not a data state.',
  })
  hypothesesMissingEvidence() {
    return this.research.hypothesesMissingEvidence();
  }

  @Get('disputes')
  @ApiOperation({ summary: 'Learner challenges to an interpretation (R15)' })
  disputes() {
    return this.research.disputes();
  }
}
