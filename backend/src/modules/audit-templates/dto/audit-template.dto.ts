import { IsString, IsNotEmpty, IsOptional, IsInt, IsNumber, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTemplateDto {
  @ApiProperty({ example: 'TPL-5S-DISCRETE-01' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Discrete Manufacturing Comprehensive 5S Audit' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Standard operational 5S audit checklist covering S1-S5 and safety compliance.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'ROUTINE', enum: ['ROUTINE', 'SELF', 'LAYERED', 'CROSS_FUNCTIONAL', 'MANAGEMENT', 'SURPRISE', 'CERTIFICATION', 'CAMPAIGN'] })
  @IsString()
  @IsNotEmpty()
  auditType: string;

  @ApiPropertyOptional({ example: { S1: 20, S2: 20, S3: 20, S4: 20, S5: 20 } })
  @IsOptional()
  categoryScoringModel?: any;
}

export class CreateSectionDto {
  @ApiProperty({ example: '1S - Sort Physical Workspace Cleanout' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'Verification that unneeded items and clutter are segregated.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'S1_SORT', enum: ['S1_SORT', 'S2_SET_IN_ORDER', 'S3_SHINE', 'S4_STANDARDIZE', 'S5_SUSTAIN', 'S6_SAFETY'] })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @IsOptional()
  sortOrder?: number;
}

export class QuestionOptionDto {
  @ApiProperty({ example: 'Conforming (100%)' })
  @IsString()
  label: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  score: number;
}

export class CreateQuestionDto {
  @ApiProperty({ example: 'Q-SORT-01' })
  @IsString()
  @IsNotEmpty()
  questionCode: string;

  @ApiProperty({ example: 'Are all unnecessary tools, surplus parts, and scrap containers removed from the immediate workspace?' })
  @IsString()
  @IsNotEmpty()
  questionText: string;

  @ApiPropertyOptional({ example: 'Detailed notes on what constitutes non-compliance.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Inspect underneath work benches, conveyor feet, and equipment corners.' })
  @IsString()
  @IsOptional()
  guidance?: string;

  @ApiPropertyOptional({ example: 'standard-uuid' })
  @IsString()
  @IsOptional()
  standardId?: string;

  @ApiProperty({
    example: 'PASS_FAIL',
    enum: [
      'YES_NO',
      'PASS_FAIL',
      'NUMERIC_0_5',
      'NUMERIC_0_10',
      'PERCENTAGE',
      'MULTIPLE_CHOICE',
      'TEXT',
      'PHOTO',
      'CHECKLIST',
      'NOT_APPLICABLE',
    ],
  })
  @IsString()
  @IsNotEmpty()
  questionType: string;

  @ApiPropertyOptional()
  @IsOptional()
  options?: QuestionOptionDto[];

  @ApiPropertyOptional({ example: 1.0 })
  @IsNumber()
  @IsOptional()
  weightage?: number;

  @ApiPropertyOptional({ example: 'MODERATE', enum: ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'] })
  @IsString()
  @IsOptional()
  severity?: string;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isCritical?: boolean;

  @ApiPropertyOptional({ example: 70 })
  @IsInt()
  @IsOptional()
  scoreCapOnFail?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsInt()
  @IsOptional()
  requireEvidenceOnScoreBelow?: number;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  mandatoryEvidence?: boolean;

  @ApiPropertyOptional({ example: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158' })
  @IsString()
  @IsOptional()
  referencePhotoUrl?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @IsOptional()
  sortOrder?: number;
}

export class PublishVersionDto {
  @ApiPropertyOptional({ example: 'Published approved v1.0 version for site deployment' })
  @IsString()
  @IsOptional()
  changeSummary?: string;
}
