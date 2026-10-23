import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export const DEPTH_EVENT_TYPES = [
  'extension_taken',
  'retry_after_failure',
  'question_asked',
  'time_on_task',
] as const;

export class RecordDepthEventDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  taskId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  journeyStepId?: string;

  @ApiProperty({
    enum: DEPTH_EVENT_TYPES,
    description:
      'Depth-seeking behaviour: an optional extension taken, a retry after failing, a question ' +
      'asked, or time spent. Recorded, never shown back to the learner during the pilot (R6).',
  })
  @IsIn(DEPTH_EVENT_TYPES as unknown as string[])
  type!: (typeof DEPTH_EVENT_TYPES)[number];

  @ApiPropertyOptional({ description: 'Required when type is time_on_task.' })
  @IsInt()
  @Min(0)
  @IsOptional()
  valueSeconds?: number;

  @ApiPropertyOptional({ description: 'Idle gaps over five minutes, excluded and recorded.' })
  @IsInt()
  @Min(0)
  @IsOptional()
  idleExcludedSeconds?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  detail?: string;
}
