import { IsString, IsNotEmpty, IsOptional, IsInt, IsDateString, IsIn, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { values } from '../../../core/validation/domain-values';
import { EmptyToUndefined } from '../../../core/validation/transforms';

export class CreateLocationDto {
  @ApiProperty({ example: 'org-node-uuid' })
  @IsString()
  @IsNotEmpty()
  orgNodeId: string;

  @ApiPropertyOptional({ example: 'LOC-BLR-P1-ASM01', description: 'Generated from the org node when omitted' })
  @IsString()
  @IsOptional()
  areaCode?: string;

  @ApiProperty({ example: 'Main Assembly Line 01' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'PRODUCTION_LINE', enum: values('LOCATION_TYPES') })
  @IsString()
  @IsNotEmpty()
  @IsIn(values('LOCATION_TYPES'))
  locationType: string;

  @ApiPropertyOptional({ example: 'MEDIUM', enum: values('RISK_LEVELS') })
  @IsString()
  @IsOptional()
  @IsIn(values('RISK_LEVELS'))
  riskLevel?: string;

  @ApiPropertyOptional({ example: 'WEEKLY', enum: values('AUDIT_FREQUENCIES') })
  @IsString()
  @IsOptional()
  @IsIn(values('AUDIT_FREQUENCIES'))
  auditFrequency?: string;

  @ApiPropertyOptional({ example: 'Building A' })
  @IsString()
  @IsOptional()
  building?: string;

  @ApiPropertyOptional({ example: 'Ground Floor' })
  @IsString()
  @IsOptional()
  floor?: string;

  @ApiPropertyOptional({ example: 'Automated assembly station with shadow boards and dedicated cleaning trolley' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'user-uuid' })
  @IsString()
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional({ example: 'user-uuid' })
  @IsString()
  @IsOptional()
  backupOwnerId?: string;

  @ApiPropertyOptional({ example: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158' })
  @IsString()
  @IsOptional()
  heroPhotoUrl?: string;
}

export class UpdateLocationDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  orgNodeId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ enum: values('LOCATION_TYPES') })
  @IsString()
  @IsOptional()
  @IsIn(values('LOCATION_TYPES'))
  locationType?: string;

  @ApiPropertyOptional({ enum: values('RISK_LEVELS') })
  @IsString()
  @IsOptional()
  @IsIn(values('RISK_LEVELS'))
  riskLevel?: string;

  @ApiPropertyOptional({ enum: values('AUDIT_FREQUENCIES') })
  @IsString()
  @IsOptional()
  @IsIn(values('AUDIT_FREQUENCIES'))
  auditFrequency?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  building?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  floor?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  backupOwnerId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  heroPhotoUrl?: string;

  @ApiPropertyOptional({ enum: values('LOCATION_STATUSES') })
  @IsString()
  @IsOptional()
  @IsIn(values('LOCATION_STATUSES'))
  status?: string;
}

export class CreateTimelineDto {
  @ApiProperty({ example: '1S Sorting Campaign' })
  @IsString()
  @IsNotEmpty()
  milestoneName: string;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  @IsDateString()
  plannedStartDate: string;

  @ApiProperty({ example: '2026-10-15T00:00:00.000Z' })
  @IsDateString()
  plannedEndDate: string;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  progressPercent?: number;

  @ApiPropertyOptional({ example: 'NOT_STARTED', enum: values('TIMELINE_STATUSES') })
  @IsString()
  @IsOptional()
  @IsIn(values('TIMELINE_STATUSES'))
  status?: string;

  @ApiPropertyOptional({ example: 'Initial sorting of unneeded tools and expired work orders' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateTimelineDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  milestoneName?: string;

  @ApiPropertyOptional()
  @EmptyToUndefined()
  @IsDateString()
  @IsOptional()
  plannedStartDate?: string;

  @ApiPropertyOptional()
  @EmptyToUndefined()
  @IsDateString()
  @IsOptional()
  plannedEndDate?: string;

  @ApiPropertyOptional()
  @EmptyToUndefined()
  @IsDateString()
  @IsOptional()
  actualStartDate?: string;

  @ApiPropertyOptional()
  @EmptyToUndefined()
  @IsDateString()
  @IsOptional()
  actualEndDate?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  progressPercent?: number;

  @ApiPropertyOptional({ enum: values('TIMELINE_STATUSES') })
  @IsString()
  @IsOptional()
  @IsIn(values('TIMELINE_STATUSES'))
  status?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class AddDocumentDto {
  @ApiProperty({ example: 'Standard Operating Procedure - Workstation 5S' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'SOP', enum: values('DOCUMENT_TYPES') })
  @IsString()
  @IsNotEmpty()
  @IsIn(values('DOCUMENT_TYPES'))
  docType: string;

  @ApiProperty({ example: 'https://storage.5s-saas.com/docs/sop-01.pdf' })
  @IsString()
  @IsNotEmpty()
  fileUrl: string;

  @ApiPropertyOptional({ example: 1024 })
  @IsInt()
  @Min(0)
  @IsOptional()
  fileSizeKb?: number;

  @ApiPropertyOptional({ example: '1.0' })
  @IsString()
  @IsOptional()
  version?: string;
}
