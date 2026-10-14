import { IsString, IsNotEmpty, IsOptional, IsInt, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLocationDto {
  @ApiProperty({ example: 'org-node-uuid' })
  @IsString()
  @IsNotEmpty()
  orgNodeId: string;

  @ApiProperty({ example: 'LOC-BLR-P1-ASM01' })
  @IsString()
  @IsNotEmpty()
  areaCode: string;

  @ApiProperty({ example: 'Main Assembly Line 01' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'PRODUCTION_LINE', enum: ['PRODUCTION_LINE', 'WAREHOUSE_BAY', 'OFFICE_FLOOR', 'LABORATORY', 'RED_TAG_ZONE', 'WORKSHOP', 'UTILITY'] })
  @IsString()
  @IsNotEmpty()
  locationType: string;

  @ApiPropertyOptional({ example: 'MEDIUM', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @IsString()
  @IsOptional()
  riskLevel?: string;

  @ApiPropertyOptional({ example: 'WEEKLY', enum: ['DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY'] })
  @IsString()
  @IsOptional()
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

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  locationType?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  riskLevel?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
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

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'UNDER_MAINTENANCE'] })
  @IsString()
  @IsOptional()
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
  @IsOptional()
  progressPercent?: number;

  @ApiPropertyOptional({ example: 'NOT_STARTED', enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED'] })
  @IsString()
  @IsOptional()
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
  @IsDateString()
  @IsOptional()
  plannedStartDate?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  plannedEndDate?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  actualStartDate?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  actualEndDate?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  progressPercent?: number;

  @ApiPropertyOptional({ enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED'] })
  @IsString()
  @IsOptional()
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

  @ApiProperty({ example: 'SOP', enum: ['SOP', 'CLEANING_STANDARD', 'LAYOUT_MAP', 'SAFETY_GUIDELINE', 'OTHER'] })
  @IsString()
  @IsNotEmpty()
  docType: string;

  @ApiProperty({ example: 'https://storage.5s-saas.com/docs/sop-01.pdf' })
  @IsString()
  @IsNotEmpty()
  fileUrl: string;

  @ApiPropertyOptional({ example: 1024 })
  @IsInt()
  @IsOptional()
  fileSizeKb?: number;

  @ApiPropertyOptional({ example: '1.0' })
  @IsString()
  @IsOptional()
  version?: string;
}
