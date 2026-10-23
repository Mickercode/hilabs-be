import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';

export const PHASES = ['discovery', 'osmotic', 'tailored', 'assessment'] as const;
export const GIM_DOMAINS = [
  'cognitive',
  'analytical',
  'creative',
  'emotional',
  'adaptive',
  'instinctive',
] as const;

export class StartStepDto {
  @ApiProperty({ enum: PHASES })
  @IsIn(PHASES as unknown as string[])
  phase!: (typeof PHASES)[number];

  @ApiPropertyOptional({ enum: GIM_DOMAINS })
  @IsIn(GIM_DOMAINS as unknown as string[])
  @IsOptional()
  gimDomain?: (typeof GIM_DOMAINS)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  taskId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  resourceId?: string;

  @ApiProperty({
    description:
      'Whether the learner chose this step rather than being sent to it. Volition is recorded, ' +
      'never assumed: it is the difference between a learner going deeper and a platform ' +
      'pushing them (5.1).',
  })
  @IsBoolean()
  chosenByLearner!: boolean;
}
