import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Onboarding asks for a question or a goal, and nothing else about a learner's past (R1, R2).
 *
 * There is deliberately no field here for grades, school, qualifications or employer. Do not add
 * one: "where you've been doesn't limit where you can go" is a promise made on the public site,
 * and the absence of these columns is how it is kept.
 */
export class CreateLearnerDto {
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

  @ApiProperty({
    description: 'Consent level agreed at sign-up. Recorded as an immutable consent event.',
    enum: ['research_full', 'research_no_quotes'],
  })
  @IsIn(['research_full', 'research_no_quotes'])
  consentLevel!: 'research_full' | 'research_no_quotes';

  @ApiProperty({ description: 'Version of the consent document the learner agreed to.' })
  @IsString()
  @MaxLength(64)
  consentDocumentVersion!: string;

  @ApiPropertyOptional({
    description:
      'Whether the learner has worked in health care. A confound control for the far-transfer ' +
      'assessment task, which sits in a clinical setting. Never used to select or stream anyone.',
  })
  @IsBoolean()
  @IsOptional()
  priorHealthCareExperience?: boolean;
}
