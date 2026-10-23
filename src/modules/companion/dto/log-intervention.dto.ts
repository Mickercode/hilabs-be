import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export const INTERVENTION_TYPES = [
  'hint',
  'explanation',
  'example',
  'question',
  'draft_edit_suggestion',
] as const;

export class LogInterventionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  learnerId!: string;

  @ApiProperty({ enum: ['discovery', 'osmotic', 'tailored', 'assessment'] })
  @IsIn(['discovery', 'osmotic', 'tailored', 'assessment'])
  phase!: 'discovery' | 'osmotic' | 'tailored' | 'assessment';

  @ApiProperty({ enum: INTERVENTION_TYPES })
  @IsIn(INTERVENTION_TYPES as unknown as string[])
  type!: (typeof INTERVENTION_TYPES)[number];

  @ApiProperty({ description: 'What the companion actually said.' })
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The library resource behind an explanation. Required for type=explanation: the companion ' +
      'cites the source of anything it explains, so the learner can check it, and it never ' +
      'invents one. The database enforces this.',
  })
  @IsUUID()
  @IsOptional()
  resourceId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  journeyStepId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  workSampleId?: string;

  @ApiPropertyOptional({ description: 'Which model produced it, for later analysis.' })
  @IsString()
  @IsOptional()
  modelId?: string;
}
