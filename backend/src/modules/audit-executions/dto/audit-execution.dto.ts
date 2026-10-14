import { IsString, IsOptional, IsArray, IsNumber, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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
  auditType?: string; // ROUTINE, SELF, LAYERED, MANAGEMENT, SURPRISE, AD_HOC

  @IsOptional()
  @IsString()
  auditorName?: string;
}

export class AnswerItemDto {
  @IsString()
  questionId: string;

  @IsString()
  sectionId: string;

  @IsNumber()
  score: number;

  @IsOptional()
  @IsNumber()
  maxScore?: number;

  @IsOptional()
  @IsString()
  status?: string; // CONFORMING, MINOR_NC, MAJOR_NC, CRITICAL_FAIL, NOT_APPLICABLE

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  evidenceUrls?: string[] | any; // Array of strings or JSON

  @IsOptional()
  @IsString()
  voiceNoteUrl?: string;
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

  @IsOptional()
  @IsString()
  completedAt?: string;
}

export class AcknowledgeAuditDto {
  @IsString()
  acknowledgedByName: string;

  @IsOptional()
  @IsString()
  acknowledgedById?: string;

  @IsOptional()
  @IsString()
  acknowledgementSignature?: string;

  @IsString()
  acknowledgementNotes: string;

  @IsOptional()
  @IsString()
  targetResolutionDate?: string;
}

export class DisputeAuditDto {
  @IsString()
  disputedByName: string;

  @IsOptional()
  @IsString()
  disputedById?: string;

  @IsString()
  disputeReason: string; // SCHEDULED_CHANGEOVER, OUT_OF_SCOPE, INACCURATE_EVIDENCE, FORCE_MAJEURE, OTHER

  @IsString()
  disputeNotes: string;

  @IsOptional()
  @IsArray()
  disputedQuestionIds?: string[];

  @IsOptional()
  @IsArray()
  counterEvidenceUrls?: string[];
}

export class ResolveDisputeDto {
  @IsString()
  decision: string; // ACCEPT_DISPUTE, REJECT_DISPUTE

  @IsString()
  resolutionNotes: string;

  @IsOptional()
  @IsString()
  resolvedByName?: string;

  @IsOptional()
  @IsNumber()
  adjustedScore?: number;
}
