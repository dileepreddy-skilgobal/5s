/**
 * Typed API calls for audit templates and schedules that services/api.ts does not cover
 * (or covers only with untyped payloads).
 */
import { apiClient } from './api';
import {
  AuditSchedule,
  AuditTemplate,
  AuditTemplateQuestion,
  AuditTemplateSection,
  AuditTemplateVersion,
  QuestionOption,
  ScheduledAuditInstance,
} from '../types';

export type TemplateStatus = AuditTemplate['status'];
export type PillarWeights = Record<string, number>;

/** GET /audit-templates and /audit-templates/:id also return the newest version (possibly a draft). */
export interface AuditTemplateDetail extends AuditTemplate {
  latestVersion?: AuditTemplateVersion | null;
  hasPublishedVersion?: boolean;
}

export interface CreateTemplatePayload {
  code: string;
  name: string;
  description?: string;
  auditType: string;
  categoryScoringModel?: PillarWeights;
}

export interface UpdateTemplatePayload {
  name?: string;
  description?: string;
  auditType?: string;
  status?: TemplateStatus;
  categoryScoringModel?: PillarWeights;
}

export interface SectionPayload {
  title?: string;
  description?: string;
  category?: AuditTemplateSection['category'];
  sortOrder?: number;
}

export interface QuestionPayload {
  questionCode?: string;
  questionText?: string;
  description?: string;
  guidance?: string;
  /** null unlinks the standard (updates only). */
  standardId?: string | null;
  questionType?: AuditTemplateQuestion['questionType'];
  options?: QuestionOption[];
  weightage?: number;
  severity?: AuditTemplateQuestion['severity'];
  isCritical?: boolean;
  scoreCapOnFail?: number | null;
  mandatoryEvidence?: boolean;
  sortOrder?: number;
}

export interface CreateSchedulePayload {
  title: string;
  templateId: string;
  auditType?: string;
  targetType: AuditSchedule['targetType'];
  targetOrgNodeId?: string;
  targetLocationIds?: string[];
  recurrence: AuditSchedule['recurrence'];
  /** Only for CUSTOM_DAYS; named recurrences use the server's interval. */
  recurrenceIntervalDays?: number;
  rotationRule?: AuditSchedule['rotationRule'];
  preferredAuditorId?: string;
  startDate?: string;
  leadTimeDays?: number;
}

export const auditPlanningApi = {
  getTemplates: async (filters?: { auditType?: string; status?: string; search?: string }): Promise<AuditTemplateDetail[]> => {
    const res = await apiClient.get('/audit-templates', { params: filters });
    return res.data;
  },
  getTemplate: async (id: string): Promise<AuditTemplateDetail> => {
    const res = await apiClient.get(`/audit-templates/${id}`);
    return res.data;
  },
  createTemplate: async (data: CreateTemplatePayload): Promise<AuditTemplateDetail> => {
    const res = await apiClient.post('/audit-templates', data);
    return res.data;
  },
  updateTemplate: async (id: string, data: UpdateTemplatePayload): Promise<AuditTemplate> => {
    const res = await apiClient.patch(`/audit-templates/${id}`, data);
    return res.data;
  },
  /** New draft version copied from the latest one (409 while a draft already exists). */
  createVersion: async (templateId: string): Promise<AuditTemplateDetail> => {
    const res = await apiClient.post(`/audit-templates/${templateId}/versions`);
    return res.data;
  },
  addSection: async (templateId: string, versionId: string, data: SectionPayload): Promise<AuditTemplateSection> => {
    const res = await apiClient.post(`/audit-templates/${templateId}/versions/${versionId}/sections`, data);
    return res.data;
  },
  updateSection: async (sectionId: string, data: SectionPayload): Promise<AuditTemplateSection> => {
    const res = await apiClient.patch(`/audit-templates/sections/${sectionId}`, data);
    return res.data;
  },
  deleteSection: async (sectionId: string): Promise<void> => {
    await apiClient.delete(`/audit-templates/sections/${sectionId}`);
  },
  addQuestion: async (sectionId: string, data: QuestionPayload): Promise<AuditTemplateQuestion> => {
    const res = await apiClient.post(`/audit-templates/sections/${sectionId}/questions`, data);
    return res.data;
  },
  updateQuestion: async (questionId: string, data: QuestionPayload): Promise<AuditTemplateQuestion> => {
    const res = await apiClient.patch(`/audit-templates/questions/${questionId}`, data);
    return res.data;
  },
  createSchedule: async (data: CreateSchedulePayload): Promise<AuditSchedule> => {
    const res = await apiClient.post('/audit-schedules', data);
    return res.data;
  },
  updateSchedule: async (id: string, data: { status?: AuditSchedule['status'] }): Promise<AuditSchedule> => {
    const res = await apiClient.patch(`/audit-schedules/${id}`, data);
    return res.data;
  },
  reassignInstance: async (instanceId: string, auditorId: string): Promise<ScheduledAuditInstance> => {
    const res = await apiClient.patch(`/audit-schedules/instances/${instanceId}`, { auditorId });
    return res.data;
  },
};
