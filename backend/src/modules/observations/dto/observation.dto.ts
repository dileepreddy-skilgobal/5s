import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateObservationDto {
  @IsString()
  locationId: string;

  @IsString()
  category: string; // S1_SORT, S2_SET_IN_ORDER, S3_SHINE, S4_STANDARDIZE, S5_SUSTAIN, S6_SAFETY

  @IsString()
  severity: string; // MINOR, MODERATE, MAJOR, CRITICAL, KAIZEN_OPPORTUNITY

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  beforePhotoUrl?: string;

  @IsOptional()
  @IsString()
  annotatedPhotoUrl?: string;

  @IsOptional()
  annotationData?: any; // JSON or string

  @IsOptional()
  @IsString()
  riskAssessment?: string;

  @IsOptional()
  tags?: string[] | string;
}

export class UpdateObservationDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  status?: string; // OPEN, ACTION_ASSIGNED, IN_PROGRESS, PENDING_VERIFICATION, RESOLVED, CLOSED

  @IsOptional()
  @IsString()
  riskAssessment?: string;

  @IsOptional()
  tags?: string[] | string;
}
