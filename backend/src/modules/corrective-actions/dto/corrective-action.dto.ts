import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class CreateActionDto {
  @IsString()
  observationId: string;

  @IsString()
  locationId: string;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  actionType?: string; // CORRECTIVE, PREVENTIVE, KAIZEN

  @IsOptional()
  @IsString()
  rootCauseCategory?: string; // MANPOWER, METHOD, MACHINE, MATERIAL, MEASUREMENT, ENVIRONMENT

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  targetDate?: string;

  @IsOptional()
  @IsNumber()
  slaHours?: number;
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
  actionType?: string;

  @IsOptional()
  @IsString()
  rootCauseCategory?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  targetDate?: string;

  @IsOptional()
  @IsString()
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
  rootCauseCategory?: string;
}

export class SubmitClosureDto {
  @IsString()
  closureNotes: string;

  @IsString()
  afterPhotoUrl: string;

  @IsOptional()
  @IsString()
  actorName?: string;
}

export class VerifyActionDto {
  @IsBoolean()
  approved: boolean;

  @IsOptional()
  @IsString()
  verificationNotes?: string;

  @IsOptional()
  @IsString()
  verifierName?: string;
}
