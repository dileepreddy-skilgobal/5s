/**
 * Audit workstream API calls not covered by services/api.ts, auditPlanningApi.ts or auditExecutionApi.ts:
 * schedule editing, rescheduling / cancelling one audit, due-schedule generation, question reordering,
 * filtered audit results and starting audits with an explicit audit type.
 */
import { apiClient } from './api';
import { AuditExecution, AuditSchedule, AuditTemplateQuestion, ScheduledAuditInstance } from '../types';
import {
  AuditExecutionFilters,
  GenerateDueResult,
  GenerateScheduleResult,
  RescheduleInstancePayload,
  StartAuditPayload,
  UpdateSchedulePayload,
} from '../types/audits';

export const auditsApi = {
  updateSchedule: async (id: string, data: UpdateSchedulePayload): Promise<AuditSchedule> => {
    const res = await apiClient.patch<AuditSchedule>(`/audit-schedules/${id}`, data);
    return res.data;
  },
  generateSchedule: async (id: string): Promise<GenerateScheduleResult> => {
    const res = await apiClient.post<GenerateScheduleResult>(`/audit-schedules/${id}/generate`);
    return res.data;
  },
  /** Runs the background generator's pass for this organization now. */
  generateDue: async (): Promise<GenerateDueResult> => {
    const res = await apiClient.post<GenerateDueResult>('/audit-schedules/generate-due');
    return res.data;
  },
  rescheduleInstance: async (instanceId: string, data: RescheduleInstancePayload): Promise<ScheduledAuditInstance> => {
    const res = await apiClient.post<ScheduledAuditInstance>(`/audit-schedules/instances/${instanceId}/reschedule`, data);
    return res.data;
  },
  cancelInstance: async (instanceId: string, reason: string): Promise<ScheduledAuditInstance> => {
    const res = await apiClient.post<ScheduledAuditInstance>(`/audit-schedules/instances/${instanceId}/cancel`, { reason });
    return res.data;
  },
  reorderQuestions: async (sectionId: string, questionIds: string[]): Promise<AuditTemplateQuestion[]> => {
    const res = await apiClient.post<AuditTemplateQuestion[]>(`/audit-templates/sections/${sectionId}/questions/reorder`, { questionIds });
    return res.data;
  },
  getExecutions: async (filters?: AuditExecutionFilters): Promise<AuditExecution[]> => {
    const res = await apiClient.get<AuditExecution[]>('/audit-executions', { params: filters });
    return res.data;
  },
  startAudit: async (data: StartAuditPayload): Promise<AuditExecution> => {
    const res = await apiClient.post<AuditExecution>('/audit-executions/start', data);
    return res.data;
  },
};
