import { apiClient } from './api';
import type { CorrectiveAction } from '../types';

/** Workflow steps the signed-in user may take on an action, as computed by the server for each row. */
export type CapaStep = 'EDIT' | 'START' | 'ANALYSE' | 'SUBMIT_CLOSURE' | 'VERIFY' | 'CLOSE' | 'DELETE' | 'REASSIGN' | 'RESCHEDULE';

/** A corrective action as returned by the list/detail endpoints, with the caller's allowed steps. */
export interface CapaAction extends CorrectiveAction {
  allowedActions?: CapaStep[];
}

export interface CapaListFilters {
  status?: string;
  /** A user id, or `me` for the signed-in user. */
  assigneeId?: string;
  locationId?: string;
  isOverdue?: string;
  search?: string;
}

export interface FiveWhyInput {
  why1: string;
  why2: string;
  why3: string;
  why4: string;
  why5: string;
  rootCauseCategory: string;
  rootCauseConclusion: string;
  solution: string;
  preventiveAction: string;
  verificationCriteria: string;
}

export const capaApi = {
  list: async (filters?: CapaListFilters): Promise<CapaAction[]> => {
    const res = await apiClient.get('/corrective-actions', { params: filters });
    return res.data;
  },
  get: async (id: string): Promise<CapaAction> => {
    const res = await apiClient.get(`/corrective-actions/${id}`);
    return res.data;
  },
  update5Why: async (id: string, data: FiveWhyInput): Promise<CapaAction> => {
    const res = await apiClient.patch(`/corrective-actions/${id}/5-why`, data);
    return res.data;
  },
  /** The server records the signed-in user as the person who submitted the evidence. */
  submitClosure: async (id: string, data: { closureNotes: string; afterPhotoUrl: string }): Promise<CapaAction> => {
    const res = await apiClient.post(`/corrective-actions/${id}/submit-closure`, data);
    return res.data;
  },
  /** The server records the signed-in user as the verifier. */
  verify: async (id: string, data: { approved: boolean; verificationNotes?: string }): Promise<CapaAction> => {
    const res = await apiClient.post(`/corrective-actions/${id}/verify`, data);
    return res.data;
  },
  close: async (id: string, data: { effective: boolean; effectivenessReview: string }): Promise<CapaAction> => {
    const res = await apiClient.post(`/corrective-actions/${id}/close`, data);
    return res.data;
  },
};

/** Root cause (conclusion or at least one "why") and a solution must be on record before closure is submitted. */
export const hasRootCauseAndSolution = (a: CorrectiveAction['fiveWhyAnalysis'] | undefined): boolean => {
  if (!a) return false;
  const filled = (v?: string) => !!v && v.trim().length > 0;
  const rootCause = filled(a.rootCauseConclusion) || [a.why1, a.why2, a.why3, a.why4, a.why5].some(filled);
  return rootCause && filled(a.solution);
};
