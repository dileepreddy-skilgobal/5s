/**
 * Types for the audit workstream (templates, schedules, execution) that are not in types/index.ts.
 */
import { AuditSchedule, AuditTemplateQuestion } from './index';

/** Audit types the server accepts (backend DomainValues.AUDIT_TYPES). AD_HOC is legacy and not offered. */
export type AuditTypeCode =
  | 'ROUTINE'
  | 'SELF'
  | 'LAYERED'
  | 'CROSS_FUNCTIONAL'
  | 'MANAGEMENT'
  | 'SURPRISE'
  | 'CERTIFICATION'
  | 'CAMPAIGN';

export type FindingSeverity = AuditTemplateQuestion['severity'];

/** POST /audit-executions/:id/score-preview finding (MINOR is possible once questions carry their own severity). */
export interface FindingPreviewItem {
  questionId: string;
  severity: FindingSeverity;
}

/** PATCH /audit-schedules/:id — every field is optional. */
export interface UpdateSchedulePayload {
  title?: string;
  auditType?: AuditTypeCode;
  recurrence?: AuditSchedule['recurrence'];
  recurrenceIntervalDays?: number;
  rotationRule?: AuditSchedule['rotationRule'];
  /** null clears the fixed auditor. */
  preferredAuditorId?: string | null;
  targetType?: AuditSchedule['targetType'];
  targetOrgNodeId?: string | null;
  targetLocationIds?: string[];
  leadTimeDays?: number;
  /** Re-plans the next cycle. */
  nextRunAt?: string;
  status?: AuditSchedule['status'];
}

export interface RescheduleInstancePayload {
  plannedDate: string;
  dueDate?: string;
  reason?: string;
}

/** POST /audit-schedules/generate-due result. */
export interface GenerateDueResult {
  schedulesProcessed: number;
  createdCount: number;
  failures: Array<{ scheduleId: string; message: string }>;
}

/** POST /audit-schedules/:id/generate result. */
export interface GenerateScheduleResult {
  message: string;
  count: number;
  createdCount: number;
}

export interface StartAuditPayload {
  locationId: string;
  templateId: string;
  templateVersionId?: string;
  auditInstanceId?: string;
  auditType?: AuditTypeCode | string;
  auditorName?: string;
}

/** GET /audit-executions filters. */
export interface AuditExecutionFilters {
  locationId?: string;
  status?: string;
  auditorId?: string;
  /** DISPUTED, RESOLVED_ACCEPTED or RESOLVED_REJECTED. */
  disputeStatus?: string;
  auditType?: string;
}
