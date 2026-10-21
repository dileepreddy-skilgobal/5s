import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  IsArray,
  IsDateString,
  IsIn,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { values } from '../../../core/validation/domain-values';
import { EmptyToUndefined } from '../../../core/validation/transforms';

/** Upper bound for a schedule's lead time: audits are never created more than a quarter ahead. */
export const MAX_LEAD_TIME_DAYS = 90;

export class CreateScheduleDto {
  @ApiPropertyOptional({ example: 'SCHED-2026-0001', description: 'Generated as SCHED-<year>-<sequence> when omitted' })
  @EmptyToUndefined()
  @IsString()
  @IsOptional()
  scheduleCode?: string;

  @ApiProperty({ example: 'Weekly Plant 1 Autonomous 5S Routine' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'template-uuid' })
  @IsString()
  @IsNotEmpty()
  templateId: string;

  @ApiPropertyOptional({ example: 'template-version-uuid', description: 'Defaults to the latest published version of the template' })
  @IsString()
  @IsOptional()
  templateVersionId?: string;

  @ApiPropertyOptional({ example: 'ROUTINE', enum: values('AUDIT_TYPES') })
  @IsString()
  @IsOptional()
  @IsIn(values('AUDIT_TYPES'))
  auditType?: string;

  @ApiProperty({ example: 'PLANT', enum: values('SCHEDULE_TARGET_TYPES') })
  @IsString()
  @IsNotEmpty()
  @IsIn(values('SCHEDULE_TARGET_TYPES'))
  targetType: string;

  @ApiPropertyOptional({ example: 'org-node-uuid' })
  @IsString()
  @IsOptional()
  targetOrgNodeId?: string;

  @ApiPropertyOptional({ example: ['location-uuid-1', 'location-uuid-2'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetLocationIds?: string[];

  @ApiProperty({ example: 'WEEKLY', enum: values('RECURRENCES') })
  @IsString()
  @IsNotEmpty()
  @IsIn(values('RECURRENCES'))
  recurrence: string;

  @ApiPropertyOptional({ example: 7 })
  @IsInt()
  @Min(1)
  @IsOptional()
  recurrenceIntervalDays?: number;

  @ApiPropertyOptional({ example: 'user-uuid' })
  @IsString()
  @IsOptional()
  preferredAuditorId?: string;

  @ApiPropertyOptional({ example: 'DEPT_INDEPENDENCE', enum: values('ROTATION_RULES') })
  @IsString()
  @IsOptional()
  @IsIn(values('ROTATION_RULES'))
  rotationRule?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @EmptyToUndefined()
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: 2, description: 'Days before the planned date that the audit is created and assigned' })
  @IsInt()
  @Min(0)
  @Max(MAX_LEAD_TIME_DAYS)
  @IsOptional()
  leadTimeDays?: number;
}

/** PATCH /audit-schedules/:id — every field the service's updateSchedule reads; all optional. */
export class UpdateScheduleDto {
  @ApiPropertyOptional({ example: 'Weekly Plant 1 Autonomous 5S Routine' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ example: 'SURPRISE', enum: values('AUDIT_TYPES'), description: 'Applies to audits generated from now on' })
  @IsString()
  @IsOptional()
  @IsIn(values('AUDIT_TYPES'))
  auditType?: string;

  @ApiPropertyOptional({ example: 'WEEKLY', enum: values('RECURRENCES') })
  @IsString()
  @IsOptional()
  @IsIn(values('RECURRENCES'))
  recurrence?: string;

  @ApiPropertyOptional({ example: 7 })
  @IsInt()
  @Min(1)
  @IsOptional()
  recurrenceIntervalDays?: number;

  @ApiPropertyOptional({ example: 'DEPT_INDEPENDENCE', enum: values('ROTATION_RULES') })
  @IsString()
  @IsOptional()
  @IsIn(values('ROTATION_RULES'))
  rotationRule?: string;

  @ApiPropertyOptional({ example: 'user-uuid', nullable: true })
  @IsString()
  @IsOptional()
  preferredAuditorId?: string | null;

  @ApiPropertyOptional({ example: 'PLANT', enum: values('SCHEDULE_TARGET_TYPES') })
  @IsString()
  @IsOptional()
  @IsIn(values('SCHEDULE_TARGET_TYPES'))
  targetType?: string;

  @ApiPropertyOptional({ example: 'org-node-uuid', nullable: true })
  @IsString()
  @IsOptional()
  targetOrgNodeId?: string | null;

  @ApiPropertyOptional({ example: ['location-uuid-1'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetLocationIds?: string[];

  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @Min(0)
  @Max(MAX_LEAD_TIME_DAYS)
  @IsOptional()
  leadTimeDays?: number;

  @ApiPropertyOptional({ example: '2026-11-02T00:00:00.000Z', description: 'Planned date of the next cycle (re-plans the schedule)' })
  @EmptyToUndefined()
  @IsDateString()
  @IsOptional()
  nextRunAt?: string;

  @ApiPropertyOptional({ example: 'PAUSED', enum: values('SCHEDULE_STATUSES') })
  @IsString()
  @IsOptional()
  @IsIn(values('SCHEDULE_STATUSES'))
  status?: string;
}

/** PATCH /audit-schedules/instances/:instanceId — reassign auditor, reschedule, cancel. */
export class UpdateScheduledInstanceDto {
  @ApiPropertyOptional({ example: 'user-uuid', nullable: true })
  @IsString()
  @IsOptional()
  auditorId?: string | null;

  @ApiPropertyOptional({ example: '2026-10-20T00:00:00.000Z' })
  @EmptyToUndefined()
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional({ example: '2026-10-17T00:00:00.000Z' })
  @EmptyToUndefined()
  @IsDateString()
  @IsOptional()
  plannedDate?: string;

  @ApiPropertyOptional({ example: 'CANCELLED', enum: values('INSTANCE_MANUAL_STATUSES') })
  @IsString()
  @IsOptional()
  @IsIn(values('INSTANCE_MANUAL_STATUSES'))
  status?: string;

  @ApiPropertyOptional({ example: 'Rescheduled due to line changeover' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: 85 })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  score?: number;
}

/** POST /audit-schedules/instances/:instanceId/reschedule — move one audit to a new date. */
export class RescheduleInstanceDto {
  @ApiProperty({ example: '2026-10-24T00:00:00.000Z', description: 'New planned date' })
  @IsDateString()
  plannedDate: string;

  @ApiPropertyOptional({ example: '2026-10-27T00:00:00.000Z', description: 'New due date; defaults to the planned date plus the completion window' })
  @EmptyToUndefined()
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'Line changeover on the original date' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}

/** POST /audit-schedules/instances/:instanceId/cancel — a reason is mandatory for the audit trail. */
export class CancelInstanceDto {
  @ApiProperty({ example: 'Area shut down for maintenance this week' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
