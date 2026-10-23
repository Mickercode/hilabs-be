import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export const SUPPORT_LEVELS = [
  'none',
  'companion_hints',
  'companion_explanation',
  'human_help',
  'unknown',
] as const;

export class AddDraftDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  learnerId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  taskId!: string;

  @ApiProperty({ description: "The learner's own writing." })
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiProperty({
    enum: SUPPORT_LEVELS,
    description:
      'How much help the learner had. Recorded on every draft, because telling latent capacity ' +
      'from a well-supported performance depends on it (4.4). "unknown" is a value, not a blank.',
  })
  @IsIn(SUPPORT_LEVELS as unknown as string[])
  supportLevel!: (typeof SUPPORT_LEVELS)[number];

  @ApiPropertyOptional({ enum: ['typed', 'spoken_transcript'] })
  @IsIn(['typed', 'spoken_transcript'])
  @IsOptional()
  inputMode?: 'typed' | 'spoken_transcript';

  @ApiPropertyOptional({ minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  timeOnTaskMinutes?: number;

  @ApiPropertyOptional({
    description: 'Conditions the work was done in. Depth cannot be read from output alone (6.4).',
  })
  @IsString()
  @IsOptional()
  conditionsNote?: string;
}
