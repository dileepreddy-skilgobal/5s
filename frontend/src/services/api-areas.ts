import { apiClient } from './api';
import type { Location } from '../types';
import type {
  AssignRolePayload,
  CreateUserPayload,
  CreatedUser,
  LocationStandard,
  ManagedUser,
  NodeTypeOption,
  ScopedAssignment,
  UpdateUserPayload,
  UserListFilters,
} from '../types/areas';
import type { QrBatchItem, StandardDetail } from './masterDataApi';

/** Users, role scoping, organization unit types, area standards and standard revision review. */
export const areasApi = {
  // --- Users ---
  getUsers: async (filters: UserListFilters = {}): Promise<ManagedUser[]> => {
    const res = await apiClient.get('/users', { params: { search: filters.search || undefined, role: filters.role || undefined, status: filters.status || undefined } });
    return Array.isArray(res.data) ? res.data : [];
  },

  createUser: async (data: CreateUserPayload): Promise<CreatedUser> => {
    const res = await apiClient.post('/users', data);
    return res.data;
  },

  updateUser: async (id: string, data: UpdateUserPayload): Promise<ManagedUser> => {
    const res = await apiClient.patch(`/users/${encodeURIComponent(id)}`, data);
    return res.data;
  },

  /** Soft delete: the person stays attached to the records they created. */
  deleteUser: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${encodeURIComponent(id)}`);
  },

  resetPin: async (id: string, pin: string): Promise<{ id: string; pinSet: boolean }> => {
    const res = await apiClient.post(`/users/${encodeURIComponent(id)}/reset-pin`, { pin });
    return res.data;
  },

  assignRole: async (userId: string, data: AssignRolePayload): Promise<ScopedAssignment> => {
    const res = await apiClient.post(`/users/${encodeURIComponent(userId)}/roles`, data);
    return res.data;
  },

  // --- Organization ---
  getNodeTypes: async (): Promise<NodeTypeOption[]> => {
    const res = await apiClient.get('/organization/node-types');
    return Array.isArray(res.data) ? res.data : [];
  },

  // --- Locations ---
  /** `mine`: areas the caller owns or backs up, and those under the units their roles are limited to. */
  getLocations: async (filters: {
    search?: string;
    orgNodeId?: string;
    locationType?: string;
    riskLevel?: string;
    auditFrequency?: string;
    status?: string;
    ownerId?: string;
    mine?: boolean;
  }): Promise<Location[]> => {
    const { mine, ...rest } = filters;
    const res = await apiClient.get('/locations', { params: { ...rest, mine: mine ? '1' : undefined } });
    return Array.isArray(res.data) ? res.data : [];
  },

  /** Printable QR tags; `mine` limits them to the caller's areas (as on the locations list). */
  getQrTags: async (mine: boolean): Promise<QrBatchItem[]> => {
    const res = await apiClient.get('/locations/qr-batch', { params: { mine: mine ? '1' : undefined } });
    return Array.isArray(res.data) ? res.data : [];
  },

  // --- Standards ---
  getStandardsForLocation: async (locationId: string): Promise<LocationStandard[]> => {
    const res = await apiClient.get(`/standards/for-location/${encodeURIComponent(locationId)}`);
    return Array.isArray(res.data) ? res.data : [];
  },

  approveRevision: async (standardId: string, revisionId: string, comments?: string): Promise<StandardDetail> => {
    const res = await apiClient.post(`/standards/${encodeURIComponent(standardId)}/revisions/${encodeURIComponent(revisionId)}/approve`, { comments });
    return res.data;
  },

  rejectRevision: async (standardId: string, revisionId: string, reason: string): Promise<StandardDetail> => {
    const res = await apiClient.post(`/standards/${encodeURIComponent(standardId)}/revisions/${encodeURIComponent(revisionId)}/reject`, { reason });
    return res.data;
  },
};
