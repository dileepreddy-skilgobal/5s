import { apiClient } from './api';
import type { Location, ReferencePhoto, Standard } from '../types';

/** One printable QR tag from GET /locations/qr-batch. A tag that could not be generated has `qrDataUrl: null` and `error`. */
export interface QrBatchItem {
  id: string;
  areaCode: string;
  name: string;
  locationType: string;
  status: string;
  building: string | null;
  floor: string | null;
  orgNodeName: string | null;
  ownerName: string | null;
  qrDataUrl: string | null;
  /** The exact text encoded in the QR code. */
  qrPayload: string;
  error: string | null;
}

/** GET /users/roles/access-matrix: what each role may do, generated from the rules the API enforces. */
export interface AccessMatrix {
  roles: Array<{ code: string; name: string; description: string | null }>;
  rules: Array<{ group: string; module: string; action: string; roles: string[] }>;
  notes: string[];
}

export interface StandardPayload {
  code: string;
  title: string;
  category: string;
  scopeType: string;
  targetOrgNodeId?: string;
  targetLocationId?: string;
  description: string;
  rules: string[];
  referencePhotos?: ReferencePhoto[];
  videoUrl?: string;
  sopDocumentUrl?: string;
}

export interface StandardUpdatePayload {
  title?: string;
  category?: string;
  scopeType?: string;
  targetOrgNodeId?: string | null;
  targetLocationId?: string | null;
  status?: Standard['status'];
}

export interface StandardRevisionPayload {
  revisionNumber: string;
  description: string;
  rules: string[];
  referencePhotos?: ReferencePhoto[];
  videoUrl?: string;
  sopDocumentUrl?: string;
  revisionComments?: string;
}

/** Audit-template question linked to a standard (GET /standards/:id `questions`). */
export interface StandardLinkedQuestion {
  id: string;
  questionCode: string;
  questionText: string;
  section?: {
    id: string;
    title: string;
    templateVersion?: {
      id: string;
      versionNumber?: string;
      template?: { id: string; code: string; name: string; auditType: string };
    };
  };
}

export type StandardDetail = Standard & { questions?: StandardLinkedQuestion[] };

/** POST /locations and PATCH /locations/:id. `null` clears an optional reference (owner, backup owner). */
export interface LocationPayload {
  areaCode?: string;
  name?: string;
  orgNodeId?: string;
  locationType?: string;
  riskLevel?: string;
  auditFrequency?: string;
  status?: string;
  building?: string;
  floor?: string;
  description?: string;
  /** A data: URL uploads a new photo; '' removes it. */
  heroPhotoUrl?: string;
  ownerId?: string | null;
  backupOwnerId?: string | null;
}

export const masterDataApi = {
  createLocation: async (data: LocationPayload): Promise<Location> => {
    const res = await apiClient.post('/locations', data);
    return res.data;
  },

  updateLocation: async (id: string, data: LocationPayload): Promise<Location> => {
    const res = await apiClient.patch(`/locations/${id}`, data);
    return res.data;
  },

  getBatchQrCodes: async (ids?: string[]): Promise<QrBatchItem[]> => {
    const res = await apiClient.get('/locations/qr-batch', { params: { ids: ids?.length ? ids.join(',') : undefined } });
    return Array.isArray(res.data) ? res.data : [];
  },

  /** Moves an org node under another node, or to the top level when `newParentId` is null. */
  moveOrgNode: async (id: string, newParentId: string | null) => {
    const res = await apiClient.patch(`/organization/nodes/${id}/move`, { newParentId });
    return res.data;
  },

  getAccessMatrix: async (): Promise<AccessMatrix> => {
    const res = await apiClient.get('/users/roles/access-matrix');
    return res.data;
  },

  removeUserRole: async (userId: string, assignmentId: string): Promise<{ id: string; removed: boolean }> => {
    const res = await apiClient.delete(`/users/${userId}/roles/${assignmentId}`);
    return res.data;
  },

  getStandardById: async (id: string): Promise<StandardDetail> => {
    const res = await apiClient.get(`/standards/${id}`);
    return res.data;
  },

  createStandard: async (data: StandardPayload): Promise<StandardDetail> => {
    const res = await apiClient.post('/standards', data);
    return res.data;
  },

  updateStandard: async (id: string, data: StandardUpdatePayload): Promise<Standard> => {
    const res = await apiClient.patch(`/standards/${id}`, data);
    return res.data;
  },

  createStandardRevision: async (standardId: string, data: StandardRevisionPayload): Promise<StandardDetail> => {
    const res = await apiClient.post(`/standards/${standardId}/revisions`, data);
    return res.data;
  },
};

/** Reads a picked file as a data: URL; the API stores data: URLs as files and keeps the reference. */
export const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
