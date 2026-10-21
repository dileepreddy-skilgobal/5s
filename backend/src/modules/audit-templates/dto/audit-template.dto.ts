import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  IsBoolean,
  IsArray,
  IsObject,
  IsIn,
  Min,
  Max,
  ValidateNested,
  ArrayNotEmpty,
  ArrayUnique,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { values } from '../../../core/validation/domain-values';

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

  @ApiProperty({ example: 'ROUTINE', enum: values('AUDIT_TYPES') })
  @IsString()
  @IsNotEmpty()
  @IsIn(values('AUDIT_TYPES'))
  auditType: string;

  @ApiPropertyOptional({ example: { S1: 20, S2: 20, S3: 20, S4: 20, S5: 20 } })
  @IsObject()
  @IsOptional()
  categoryScoringModel?: Record<string, any>;
}

/** PATCH /audit-templates/:id - template metadata and scoring model; all optional. */
export class UpdateTemplateDto {
  @ApiPropertyOptional({ example: 'Discrete Manufacturing Comprehensive 5S Audit' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Standard operational 5S audit checklist.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'ROUTINE', enum: values('AUDIT_TYPES') })
  @IsString()
  @IsOptional()
  @IsIn(values('AUDIT_TYPES'))
  auditType?: string;

  @ApiPropertyOptional({ example: 'ACTIVE', enum: values('TEMPLATE_STATUSES') })
  @IsString()
  @IsOptional()
  @IsIn(values('TEMPLATE_STATUSES'))
  status?: string;

  @ApiPropertyOptional({ example: { S1: 20, S2: 20, S3: 20, S4: 20, S5: 20 } })
  @IsObject()
  @IsOptional()
  categoryScoringModel?: Record<string, any>;
}

/** POST /audit-templates/:id/clone */
export class CloneTemplateDto {
  @ApiProperty({ example: 'TPL-5S-DISCRETE-02' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: 'Discrete Manufacturing 5S Audit (Plant 2)' })
  @IsString()
  @IsOptional()
  name?: string;
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

  @ApiProperty({ example: 'S1_SORT', enum: values('FIVE_S_CATEGORIES') })
  @IsString()
  @IsNotEmpty()
  @IsIn(values('FIVE_S_CATEGORIES'))
  category: string;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

/** PATCH /audit-templates/sections/:sectionId - all optional. */
export class UpdateSectionDto {
  @ApiPropertyOptional({ example: '1S - Sort Physical Workspace Cleanout' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ example: 'Verification that unneeded items and clutter are segregated.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'S1_SORT', enum: values('FIVE_S_CATEGORIES') })
  @IsString()
  @IsOptional()
  @IsIn(values('FIVE_S_CATEGORIES'))
  category?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class QuestionOptionDto {
  @ApiProperty({ example: 'Conforming (100%)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
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

  @ApiProperty({ example: 'PASS_FAIL', enum: values('QUESTION_TYPES') })
  @IsString()
  @IsNotEmpty()
  @IsIn(values('QUESTION_TYPES'))
  questionType: string;

  @ApiPropertyOptional({ type: [QuestionOptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  @IsOptional()
  options?: QuestionOptionDto[];

  @ApiPropertyOptional({ example: 1.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  weightage?: number;

  @ApiPropertyOptional({ example: 'MODERATE', enum: values('QUESTION_SEVERITIES') })
  @IsString()
  @IsOptional()
  @IsIn(values('QUESTION_SEVERITIES'))
  severity?: string;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isCritical?: boolean;

  @ApiPropertyOptional({ example: 70, description: 'Overall score cap (%) applied when this critical question fails' })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  scoreCapOnFail?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsInt()
  @Min(0)
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
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

/**
 * PATCH /audit-templates/questions/:questionId - all optional. `standardId`, `scoreCapOnFail` and
 * `requireEvidenceOnScoreBelow` may be sent as null to clear them.
 */
export class UpdateQuestionDto {
  @ApiPropertyOptional({ example: 'Q-SORT-01' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  questionCode?: string;

  @ApiPropertyOptional({ example: 'Are all unnecessary tools removed from the immediate workspace?' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  questionText?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  guidance?: string;

  @ApiPropertyOptional({ example: 'standard-uuid', nullable: true })
  @IsString()
  @IsOptional()
  standardId?: string | null;

  @ApiPropertyOptional({ example: 'PASS_FAIL', enum: values('QUESTION_TYPES') })
  @IsString()
  @IsOptional()
  @IsIn(values('QUESTION_TYPES'))
  questionType?: string;

  @ApiPropertyOptional({ type: [QuestionOptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  @IsOptional()
  options?: QuestionOptionDto[];

  @ApiPropertyOptional({ example: 1.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  weightage?: number;

  @ApiPropertyOptional({ example: 'MODERATE', enum: values('QUESTION_SEVERITIES') })
  @IsString()
  @IsOptional()
  @IsIn(values('QUESTION_SEVERITIES'))
  severity?: string;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isCritical?: boolean;

  @ApiPropertyOptional({ example: 70, nullable: true })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  scoreCapOnFail?: number | null;

  @ApiPropertyOptional({ example: 3, nullable: true })
  @IsInt()
  @Min(0)
  @IsOptional()
  requireEvidenceOnScoreBelow?: number | null;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  mandatoryEvidence?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  referencePhotoUrl?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

/** POST /audit-templates/sections/:sectionId/questions/reorder — every question of the section, in the new order. */
export class ReorderQuestionsDto {
  @ApiProperty({ example: ['question-uuid-2', 'question-uuid-1'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  questionIds: string[];
}

export class PublishVersionDto {
  @ApiPropertyOptional({ example: 'Published approved v1.0 version for site deployment' })
  @IsString()
  @IsOptional()
  changeSummary?: string;
}
