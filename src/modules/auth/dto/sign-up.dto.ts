import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Creating an account and starting a journey are one step: a learner begins with a question or
 * a goal, not a course (R1).
 *
 * There is no field here for grades, school, qualifications or employer, and there must never
 * be one (R2). "Where you've been doesn't limit where you can go" is a promise made on the
 * public site, and the absence of these fields is how it is kept.
 */
export class SignUpDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    minLength: 10,
    description:
      'At least ten characters. Length is the only rule: composition rules push people toward ' +
      'predictable substitutions and a password they cannot remember.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password!: string;

  @ApiPropertyOptional({ description: 'What the learner would like to be called.' })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  displayName?: string;

  @ApiProperty({
    description: 'What the learner wants to understand. A question or a goal, not a course.',
    example: 'Why do fixes at work so often make things worse?',
    minLength: 3,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  goal!: string;

  @ApiProperty({ enum: ['research_full', 'research_no_quotes'] })
  @IsIn(['research_full', 'research_no_quotes'])
  consentLevel!: 'research_full' | 'research_no_quotes';

  @ApiProperty({ description: 'Version of the consent document the learner agreed to.' })
  @IsString()
  @MaxLength(64)
  consentDocumentVersion!: string;

  @ApiPropertyOptional({
    description:
      'Whether the learner has worked in health care. A confound control for the far-transfer ' +
      'task, which sits in a clinical setting. Never used to select or stream anyone.',
  })
  @IsBoolean()
  @IsOptional()
  priorHealthCareExperience?: boolean;
}
