import { apiClient } from './api';
import type {
  CapaListQuery,
  CapaRecord,
  CapaTimelineEntry,
  ClosurePolicy,
  CloseRedTagRecordInput,
  CreateCapaInput,
  ObservationRecord,
  RedTagMetricsRecord,
  RedTagRecord,
  SubmitClosureInput,
} from '../types/capa';

/** Corrective actions, observations and red tags: endpoints beyond the shared api / capaApi helpers. */
export const capaApi = {
  // ---------- Corrective actions ----------
  list: async (query?: CapaListQuery): Promise<CapaRecord[]> => {
    const res = await apiClient.get('/corrective-actions', { params: query });
    return res.data;
  },
  get: async (id: string): Promise<CapaRecord> => {
    const res = await apiClient.get(`/corrective-actions/${id}`);
    return res.data;
  },
  /** Raise an action from an observation, a red tag, or standalone (management review). */
  create: async (data: CreateCapaInput): Promise<CapaRecord> => {
    const res = await apiClient.post('/corrective-actions', data);
    return res.data;
  },
  reassign: async (id: string, data: { assigneeId: string; reason?: string }): Promise<CapaRecord> => {
    const res = await apiClient.post(`/corrective-actions/${id}/reassign`, data);
    return res.data;
  },
  changeDueDate: async (id: string, data: { targetDate: string; reason: string }): Promise<CapaRecord> => {
    const res = await apiClient.post(`/corrective-actions/${id}/due-date`, data);
    return res.data;
  },
  timeline: async (id: string): Promise<CapaTimelineEntry[]> => {
    const res = await apiClient.get(`/corrective-actions/${id}/timeline`);
    return res.data;
  },
  closurePolicy: async (): Promise<ClosurePolicy> => {
    const res = await apiClient.get('/corrective-actions/closure-policy');
    return res.data;
  },
  submitClosure: async (id: string, data: SubmitClosureInput): Promise<CapaRecord> => {
    const res = await apiClient.post(`/corrective-actions/${id}/submit-closure`, data);
    return res.data;
  },
  /** A rejection must carry the reason (verificationNotes); the assignee sees it. */
  verify: async (id: string, data: { approved: boolean; verificationNotes?: string }): Promise<CapaRecord> => {
    const res = await apiClient.post(`/corrective-actions/${id}/verify`, data);
    return res.data;
  },
  /** Soft delete (programme managers; not for verified or closed actions). */
  remove: async (id: string): Promise<{ id: string; actionCode: string; deleted: boolean }> => {
    const res = await apiClient.delete(`/corrective-actions/${id}`);
    return res.data;
  },

  // ---------- Observations ----------
  getObservation: async (id: string): Promise<ObservationRecord> => {
    const res = await apiClient.get(`/observations/${id}`);
    return res.data;
  },

  // ---------- Red tags ----------
  listRedTags: async (): Promise<RedTagRecord[]> => {
    const res = await apiClient.get('/red-tags');
    return res.data;
  },
  redTagMetrics: async (): Promise<RedTagMetricsRecord> => {
    const res = await apiClient.get('/red-tags/metrics');
    return res.data;
  },
  getRedTag: async (id: string): Promise<RedTagRecord> => {
    const res = await apiClient.get(`/red-tags/${id}`);
    return res.data;
  },
  moveToHolding: async (id: string, holdingAreaId: string): Promise<RedTagRecord> => {
    const res = await apiClient.post(`/red-tags/${id}/move-to-holding`, { holdingAreaId });
    return res.data;
  },
  approveDisposition: async (id: string): Promise<RedTagRecord> => {
    const res = await apiClient.post(`/red-tags/${id}/disposition/approve`);
    return res.data;
  },
  rejectDisposition: async (id: string, reason: string): Promise<RedTagRecord> => {
    const res = await apiClient.post(`/red-tags/${id}/disposition/reject`, { reason });
    return res.data;
  },
  closeRedTag: async (id: string, data: CloseRedTagRecordInput): Promise<RedTagRecord> => {
    const res = await apiClient.post(`/red-tags/${id}/close`, data);
    return res.data;
  },
};
