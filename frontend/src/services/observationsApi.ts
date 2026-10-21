import { apiClient } from './api';
import { Observation } from '../types';
import { PercentAnnotation } from './auditExecutionApi';

export interface ObservationFilters {
  category?: string;
  severity?: string;
  status?: string;
  locationId?: string;
  search?: string;
  /** Page size (server caps it at 200). */
  limit?: number;
  offset?: number;
}

export interface ObservationSummary {
  total: number;
  critical: number;
  /** Not yet resolved or closed. */
  open: number;
  kaizen: number;
}

export interface CreateObservationPayload {
  locationId: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  riskAssessment?: string;
  /** Photo as taken (data URL or uploaded file URL); omit when there is no photo. */
  beforePhotoUrl?: string;
  annotatedPhotoUrl?: string;
  annotationData?: PercentAnnotation[];
}

export interface UpdateObservationPayload {
  title?: string;
  description?: string;
  severity?: string;
  category?: string;
  status?: string;
  riskAssessment?: string;
}

export const observationsApi = {
  list: async (filters: ObservationFilters): Promise<Observation[]> => {
    const res = await apiClient.get<Observation[]>('/observations', { params: filters });
    return res.data;
  },
  summary: async (): Promise<ObservationSummary> => {
    const res = await apiClient.get<ObservationSummary>('/observations/summary');
    return res.data;
  },
  create: async (data: CreateObservationPayload): Promise<Observation> => {
    const res = await apiClient.post<Observation>('/observations', data);
    return res.data;
  },
  update: async (id: string, data: UpdateObservationPayload): Promise<Observation> => {
    const res = await apiClient.patch<Observation>(`/observations/${id}`, data);
    return res.data;
  },
};
