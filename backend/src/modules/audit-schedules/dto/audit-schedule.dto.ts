import { IsString, IsNotEmpty, IsOptional, IsInt, IsArray, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateScheduleDto {
  @ApiProperty({ example: 'SCHED-BLR-WEEKLY-01' })
  @IsString()
  @IsNotEmpty()
  scheduleCode: string;

  @ApiProperty({ example: 'Weekly Plant 1 Autonomous 5S Routine' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'template-uuid' })
  @IsString()
  @IsNotEmpty()
  templateId: string;

  @ApiProperty({ example: 'template-version-uuid' })
  @IsString()
  @IsNotEmpty()
  templateVersionId: string;

  @ApiPropertyOptional({ example: 'ROUTINE', enum: ['ROUTINE', 'SELF', 'LAYERED', 'CROSS_FUNCTIONAL', 'MANAGEMENT', 'SURPRISE', 'CERTIFICATION', 'CAMPAIGN'] })
  @IsString()
  @IsOptional()
  auditType?: string;

  @ApiProperty({ example: 'PLANT', enum: ['ALL_AREAS', 'PLANT', 'DEPARTMENT', 'SPECIFIC_LOCATIONS'] })
  @IsString()
  @IsNotEmpty()
  targetType: string;

  @ApiPropertyOptional({ example: 'org-node-uuid' })
  @IsString()
  @IsOptional()
  targetOrgNodeId?: string;

  @ApiPropertyOptional({ example: ['location-uuid-1', 'location-uuid-2'] })
  @IsArray()
  @IsOptional()
  targetLocationIds?: string[];

  @ApiProperty({ example: 'WEEKLY', enum: ['ONCE', 'DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'CUSTOM_DAYS'] })
  @IsString()
  @IsNotEmpty()
  recurrence: string;

  @ApiPropertyOptional({ example: 7 })
  @IsInt()
  @IsOptional()
  recurrenceIntervalDays?: number;

  @ApiPropertyOptional({ example: 'user-uuid' })
  @IsString()
  @IsOptional()
  preferredAuditorId?: string;

  @ApiPropertyOptional({ example: 'DEPT_INDEPENDENCE', enum: ['ASSIGNED_AUDITOR', 'DEPT_INDEPENDENCE', 'ROUND_ROBIN', 'RANDOM'] })
  @IsString()
  @IsOptional()
  rotationRule?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @IsOptional()
  leadTimeDays?: number;
}

export class GenerateAuditsDto {
  @ApiPropertyOptional({ example: 14 })
  @IsInt()
  @IsOptional()
  daysAhead?: number;
}
