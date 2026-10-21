import { IsString, IsOptional, IsBoolean, IsNumber, IsIn, IsDateString, Min, IsNotEmpty, MaxLength } from 'class-validator';
import { values } from '../../../core/validation/domain-values';
import { EmptyToUndefined } from '../../../core/validation/transforms';

/** Where a corrective action came from (CorrectiveAction.source). */
export const ACTION_SOURCES = ['AUDIT', 'OBSERVATION', 'RED_TAG', 'MANAGEMENT_REVIEW'] as const;
export type ActionSource = (typeof ACTION_SOURCES)[number];

/**
 * POST /corrective-actions. Exactly one origin is used, in this order:
 * - `observationId`: an existing finding or shop-floor observation (source AUDIT or OBSERVATION, derived);
 * - `redTagId`: a red tag (source RED_TAG; the location is the tag's);
 * - neither: a standalone action, e.g. from a management review (source MANAGEMENT_REVIEW; `locationId` required).
 * Red-tag and standalone actions get a finding record created for them so they follow the same workflow.
 */
export class CreateActionDto {
  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  observationId?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  redTagId?: string;

  /** Required unless the action is raised from a red tag (then the tag's location is used). */
  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  locationId?: string;

  /** Only MANAGEMENT_REVIEW may be chosen explicitly; other sources are derived from the origin. */
  @IsOptional()
  @IsString()
  @IsIn(['MANAGEMENT_REVIEW'])
  source?: string;

  /** Severity of the finding created for red-tag and standalone actions (sets the default SLA). */
  @IsOptional()
  @IsString()
  @IsIn(values('OBSERVATION_SEVERITIES'))
  severity?: string;

  /** 5S pillar of the finding created for standalone actions (red-tag actions are always Sort). */
  @IsOptional()
  @IsString()
  @IsIn(values('FIVE_S_CATEGORIES'))
  category?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  description: string;

  @IsOptional()
  @IsString()
  @IsIn(values('ACTION_TYPES'))
  actionType?: string;

  @IsOptional()
  @IsString()
  @IsIn(values('ROOT_CAUSE_CATEGORIES'))
  rootCauseCategory?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  slaHours?: number;
}

/** POST /corrective-actions/:id/reassign — hand the action to someone else (recorded in its history). */
export class ReassignActionDto {
  @IsString()
  @IsNotEmpty()
  assigneeId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** POST /corrective-actions/:id/due-date — move the target date (recorded in its history with the reason). */
export class ChangeDueDateDto {
  @IsDateString()
  targetDate: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

export class UpdateActionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(values('ACTION_TYPES'))
  actionType?: string;

  @IsOptional()
  @IsString()
  @IsIn(values('ROOT_CAUSE_CATEGORIES'))
  rootCauseCategory?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsString()
  @IsIn(values('ACTION_STATUSES'))
  status?: string;
}

export class Update5WhyDto {
  @IsOptional()
  @IsString()
  why1?: string;

  @IsOptional()
  @IsString()
  why2?: string;

  @IsOptional()
  @IsString()
  why3?: string;

  @IsOptional()
  @IsString()
  why4?: string;

  @IsOptional()
  @IsString()
  why5?: string;

  @IsOptional()
  @IsString()
  rootCauseConclusion?: string;

  @IsOptional()
  @IsString()
  solution?: string;

  @IsOptional()
  @IsString()
  preventiveAction?: string;

  @IsOptional()
  @IsString()
  verificationCriteria?: string;

  @IsOptional()
  @IsString()
  @IsIn(values('ROOT_CAUSE_CATEGORIES'))
  rootCauseCategory?: string;
}

export class SubmitClosureDto {
  @IsString()
  closureNotes: string;

  /**
   * Required, unless the tenant allows closure without a photo (setting capa.allowClosureWithoutPhoto);
   * then `noPhotoJustification` must explain why there is none.
   */
  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  afterPhotoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  noPhotoJustification?: string;
}

/** POST /corrective-actions/:id/close — effectiveness review after verification. */
export class CloseActionDto {
  @IsBoolean()
  effective: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  effectivenessReview: string;
}

export class VerifyActionDto {
  @IsBoolean()
  approved: boolean;

  /** Optional on approval; a rejection must give the reason (checked by the service so status conflicts win). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  verificationNotes?: string;
}
