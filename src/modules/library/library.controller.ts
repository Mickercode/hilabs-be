import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto.js';
import { LibraryService } from './library.service.js';

@ApiTags('library')
@Controller('library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get('resources')
  @ApiOperation({ summary: 'Browse the curated library (R8)' })
  @ApiQuery({ name: 'phase', required: false, enum: ['osmotic', 'tailored', 'either'] })
  @ApiQuery({ name: 'concept', required: false, example: 'C4' })
  @ApiQuery({ name: 'practitionerOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'coreOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'lowBandwidthOnly', required: false, type: Boolean })
  list(
    @Query() page: PaginationDto,
    @Query('phase') phase?: 'osmotic' | 'tailored' | 'either',
    @Query('concept') concept?: string,
    @Query('practitionerOnly') practitionerOnly?: string,
    @Query('coreOnly') coreOnly?: string,
    @Query('lowBandwidthOnly') lowBandwidthOnly?: string,
  ) {
    return this.library.list(
      {
        phase,
        concept,
        practitionerOnly: practitionerOnly === 'true',
        coreOnly: coreOnly === 'true',
        lowBandwidthOnly: lowBandwidthOnly === 'true',
      },
      page.take,
      page.skip,
    );
  }

  @Get('resources/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'One resource' })
  findOne(@Param('id') id: string) {
    return this.library.findOne(id);
  }

  @Get('coverage')
  @ApiOperation({
    summary: 'Library coverage against its targets',
    description: 'Shows a gap before the pilot runs rather than after.',
  })
  coverage() {
    return this.library.coverage();
  }
}
