import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsIn,
  IsDateString,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { values } from '../../../core/validation/domain-values';
import { EmptyToUndefined } from '../../../core/validation/transforms';

export class StartExecutionDto {
  @IsOptional()
  @IsString()
  auditInstanceId?: string;

  @IsString()
  locationId: string;

  @IsString()
  templateId: string;

  @IsOptional()
  @IsString()
  templateVersionId?: string;

  @IsOptional()
  @IsString()
  @IsIn(values('AUDIT_TYPES'))
  auditType?: string;

  @IsOptional()
  @IsString()
  auditorName?: string;
}

export class AnswerItemDto {
  @IsString()
  questionId: string;

  @IsString()
  sectionId: string;

  /** Weighted points earned; the upper bound depends on the question's weightage (maxScore = weightage x 5). */
  @IsNumber()
  @Min(0)
  score: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxScore?: number;

  @IsOptional()
  @IsString()
  @IsIn(values('ANSWER_STATUSES'))
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Array of URL strings, or an already-serialised JSON string (the service accepts both). */
  @IsOptional()
  evidenceUrls?: string[] | string;

  @IsOptional()
  @IsString()
  voiceNoteUrl?: string;

  /**
   * Severity the auditor assigns to the finding this answer raises (web runner finding editor).
   * Optional: without it the server derives the severity from the status and the question's default.
   */
  @IsOptional()
  @IsString()
  @IsIn(values('QUESTION_SEVERITIES'))
  findingSeverity?: string;
}

export class SaveDraftDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerItemDto)
  answers: AnswerItemDto[];

  @IsOptional()
  @IsString()
  summaryNotes?: string;
}

export class SubmitAuditDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerItemDto)
  answers: AnswerItemDto[];

  @IsOptional()
  @IsString()
  summaryNotes?: string;

  @IsOptional()
  @IsString()
  auditorSignature?: string;

  @IsOptional()
  @IsString()
  auditorName?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsDateString()
  completedAt?: string;
}

export class AcknowledgeAuditDto {
  /** Ignored: the signatory is always the signed-in user (kept optional for older clients). */
  @IsOptional()
  @IsString()
  acknowledgedByName?: string;

  /** Ignored, see acknowledgedByName. */
  @IsOptional()
  @IsString()
  acknowledgedById?: string;

  @IsOptional()
  @IsString()
  acknowledgementSignature?: string;

  @IsString()
  acknowledgementNotes: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsDateString()
  targetResolutionDate?: string;
}

export class DisputeAuditDto {
  /** Ignored: the disputing party is always the signed-in user (kept optional for older clients). */
  @IsOptional()
  @IsString()
  disputedByName?: string;

  /** Ignored, see disputedByName. */
  @IsOptional()
  @IsString()
  disputedById?: string;

  @IsString()
  @IsIn(values('DISPUTE_REASONS'))
  disputeReason: string;

  @IsString()
  disputeNotes: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disputedQuestionIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  counterEvidenceUrls?: string[];
}

export class ResolveDisputeDto {
  @IsString()
  @IsIn(values('DISPUTE_DECISIONS'))
  decision: string;

  @IsString()
  resolutionNotes: string;

  @IsOptional()
  @IsString()
  resolvedByName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  adjustedScore?: number;
}
