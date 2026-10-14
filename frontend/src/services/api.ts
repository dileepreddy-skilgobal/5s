import axios from 'axios';
import {
  Tenant,
  User,
  Role,
  OrgNode,
  OrgTreeNode,
  CreateOrgNodePayload,
  Location,
  LocationTimeline,
  LocationDocument,
  DryRunResult,
  Standard,
  StandardRevision,
  AuditTemplate,
  AuditTemplateSection,
  AuditTemplateQuestion,
  AuditSchedule,
  ScheduledAuditInstance,
  AuditExecution,
  Observation,
  CorrectiveAction,
  RedTag,
  RedTagMetrics,
  MaturityOverview,
  HeatmapData,
  LeaderboardData,
  AuthResponse,
  AuthUser,
  TrainingCourse,
  QuizQuestion,
  QuizSubmissionResult,
  TrainingCertificate,
  AcknowledgeAuditPayload,
  DisputeAuditPayload,
  ResolveDisputePayload,
  GamificationOverview,
  GamificationLeaderboards,
  TrophiesAndAwardsData,
  BadgesAndMilestonesData,
  FloatingTrophy,
} from '../types';

const API_BASE_URL = 'http://localhost:3001/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const getInitialTenantId = () => {
  try {
    const saved = localStorage.getItem('5s_active_tenant');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.id) return parsed.id;
      if (parsed && parsed.slug) return parsed.slug;
    }
  } catch (e) {}
  return '39aa6fa6-fb16-44f6-81cf-05f3670f1df6';
};

let currentTenantId = getInitialTenantId();
let currentUserId: string | undefined = undefined;
let currentRole: string = localStorage.getItem('5s_active_user_role') || 'ORG_ADMIN';
let authToken: string | null = localStorage.getItem('5s_access_token');

export const setApiTenantContext = (tenantId: string, userId?: string, role?: string) => {
  currentTenantId = tenantId;
  currentUserId = userId;
  if (role) {
    currentRole = role;
    localStorage.setItem('5s_active_user_role', role);
  }
};

export const setApiUserRole = (role: string) => {
  currentRole = role;
  localStorage.setItem('5s_active_user_role', role);
};

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    localStorage.setItem('5s_access_token', token);
  } else {
    localStorage.removeItem('5s_access_token');
  }
};

apiClient.interceptors.request.use((config) => {
  if (currentTenantId) {
    config.headers['x-tenant-id'] = currentTenantId;
  }
  if (currentUserId) {
    config.headers['x-user-id'] = currentUserId;
  }
  if (currentRole) {
    config.headers['x-user-role'] = currentRole;
    if (currentRole === 'SUPER_ADMIN') {
      config.headers['x-super-admin'] = 'true';
    }
  }
  if (authToken) {
    config.headers['Authorization'] = `Bearer ${authToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    if (response.data && response.data.success !== undefined && response.data.data !== undefined) {
      return { ...response, data: response.data.data };
    }
    return response;
  },
  (error) => {
    return Promise.reject(error);
  },
);

export const api = {
  // --- Tenants & Super Admin ---
  getTenants: async (): Promise<Tenant[]> => {
    const res = await apiClient.get('/tenants');
    return res.data;
  },
  getTenantById: async (id: string): Promise<Tenant> => {
    const res = await apiClient.get(`/tenants/${id}`);
    return res.data;
  },
  createTenant: async (data: Partial<Tenant>): Promise<Tenant> => {
    const res = await apiClient.post('/tenants', data);
    return res.data;
  },
  updateTenant: async (id: string, data: Partial<Tenant>): Promise<Tenant> => {
    const res = await apiClient.patch(`/tenants/${id}`, data);
    return res.data;
  },
  toggleTenantStatus: async (id: string, status: string): Promise<Tenant> => {
    const res = await apiClient.patch(`/tenants/${id}/status`, { status });
    return res.data;
  },
  executeOnboarding: async (data: any) => {
    const res = await apiClient.post('/tenants/onboard', data);
    return res.data;
  },

  // --- Users & Roles ---
  getUsers: async (): Promise<User[]> => {
    const res = await apiClient.get('/users');
    return res.data;
  },
  createUser: async (data: Partial<User> & { roleCode?: string }): Promise<User> => {
    const res = await apiClient.post('/users', data);
    return res.data;
  },
  updateUser: async (id: string, data: Partial<User>): Promise<User> => {
    const res = await apiClient.patch(`/users/${id}`, data);
    return res.data;
  },
  deleteUser: async (id: string) => {
    const res = await apiClient.delete(`/users/${id}`);
    return res.data;
  },
  getRoles: async (): Promise<Role[]> => {
    const res = await apiClient.get('/users/roles/all');
    return res.data;
  },
  getRoleById: async (id: string): Promise<Role> => {
    const res = await apiClient.get(`/users/roles/${id}`);
    return res.data;
  },
  updateRolePermissions: async (roleId: string, permissions: any[]): Promise<Role> => {
    const res = await apiClient.patch(`/users/roles/${roleId}/permissions`, permissions);
    return res.data;
  },
  assignRole: async (userId: string, roleId: string, orgNodeId?: string) => {
    const res = await apiClient.post(`/users/${userId}/roles`, { roleId, orgNodeId });
    return res.data;
  },

  // --- Organization Hierarchy ---
  getOrgTree: async (): Promise<OrgTreeNode[]> => {
    const res = await apiClient.get('/organization/tree');
    return res.data;
  },
  getOrgNodes: async (): Promise<OrgNode[]> => {
    const res = await apiClient.get('/organization/nodes');
    return res.data;
  },
  getOrgNodeById: async (id: string): Promise<OrgNode> => {
    const res = await apiClient.get(`/organization/nodes/${id}`);
    return res.data;
  },
  createOrgNode: async (data: Partial<OrgNode> | CreateOrgNodePayload): Promise<OrgNode> => {
    const res = await apiClient.post('/organization/nodes', data);
    return res.data;
  },
  updateOrgNode: async (id: string, data: Partial<OrgNode>): Promise<OrgNode> => {
    const res = await apiClient.patch(`/organization/nodes/${id}`, data);
    return res.data;
  },
  moveOrgNode: async (id: string, newParentId: string): Promise<OrgNode> => {
    const res = await apiClient.patch(`/organization/nodes/${id}/move`, { newParentId });
    return res.data;
  },
  getNextOrgNodeCode: async (nodeType?: string, parentId?: string): Promise<string> => {
    const res = await apiClient.get('/organization/next-code', { params: { nodeType, parentId } });
    return res.data;
  },
  deleteOrgNode: async (id: string) => {
    const res = await apiClient.delete(`/organization/nodes/${id}`);
    return res.data;
  },

  // --- Locations Master ---
  getNextLocationCode: async (orgNodeId?: string): Promise<string> => {
    const res = await apiClient.get('/locations/next-code', { params: { orgNodeId } });
    return res.data;
  },
  getLocations: async (filters?: {
    search?: string;
    orgNodeId?: string;
    locationType?: string;
    riskLevel?: string;
    auditFrequency?: string;
    status?: string;
  }): Promise<Location[]> => {
    const res = await apiClient.get('/locations', { params: filters });
    return res.data;
  },
  getLocationById: async (id: string): Promise<Location> => {
    const res = await apiClient.get(`/locations/${id}`);
    return res.data;
  },
  createLocation: async (data: Partial<Location>): Promise<Location> => {
    const res = await apiClient.post('/locations', data);
    return res.data;
  },
  updateLocation: async (id: string, data: Partial<Location>): Promise<Location> => {
    const res = await apiClient.patch(`/locations/${id}`, data);
    return res.data;
  },
  deleteLocation: async (id: string) => {
    const res = await apiClient.delete(`/locations/${id}`);
    return res.data;
  },
  getBatchQrCodes: async (ids?: string[]) => {
    const res = await apiClient.get('/locations/qr-batch', {
      params: { ids: ids?.join(',') },
    });
    return res.data;
  },

  // --- Location Timelines ---
  createTimeline: async (locationId: string, data: Partial<LocationTimeline>): Promise<LocationTimeline> => {
    const res = await apiClient.post(`/locations/${locationId}/timelines`, data);
    return res.data;
  },
  updateTimeline: async (
    locationId: string,
    timelineId: string,
    data: Partial<LocationTimeline>,
  ): Promise<LocationTimeline> => {
    const res = await apiClient.patch(`/locations/${locationId}/timelines/${timelineId}`, data);
    return res.data;
  },
  deleteTimeline: async (locationId: string, timelineId: string) => {
    const res = await apiClient.delete(`/locations/${locationId}/timelines/${timelineId}`);
    return res.data;
  },

  // --- Location Documents ---
  addDocument: async (locationId: string, data: Partial<LocationDocument>): Promise<LocationDocument> => {
    const res = await apiClient.post(`/locations/${locationId}/documents`, data);
    return res.data;
  },
  deleteDocument: async (locationId: string, docId: string) => {
    const res = await apiClient.delete(`/locations/${locationId}/documents/${docId}`);
    return res.data;
  },

  // --- Bulk Excel Import ---
  downloadLocationTemplateUrl: () => `${API_BASE_URL}/imports/template/locations`,
  validateDryRunFile: async (file: File): Promise<DryRunResult> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post('/imports/locations/dry-run', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  commitBatchLocations: async (rows: any[]) => {
    const res = await apiClient.post('/imports/locations/commit', { rows });
    return res.data;
  },

  // ==========================================
  // STANDARDS & REVISIONS API
  // ==========================================
  getStandards: async (filters?: {
    category?: string;
    scopeType?: string;
    status?: string;
    search?: string;
  }): Promise<Standard[]> => {
    const res = await apiClient.get('/standards', { params: filters });
    return res.data;
  },
  getStandardById: async (id: string): Promise<Standard> => {
    const res = await apiClient.get(`/standards/${id}`);
    return res.data;
  },
  createStandard: async (data: any): Promise<Standard> => {
    const res = await apiClient.post('/standards', data);
    return res.data;
  },
  updateStandard: async (id: string, data: any): Promise<Standard> => {
    const res = await apiClient.patch(`/standards/${id}`, data);
    return res.data;
  },
  createStandardRevision: async (standardId: string, data: any): Promise<Standard> => {
    const res = await apiClient.post(`/standards/${standardId}/revisions`, data);
    return res.data;
  },
  approveStandardRevision: async (standardId: string, revisionId: string, comments?: string): Promise<Standard> => {
    const res = await apiClient.post(`/standards/${standardId}/revisions/${revisionId}/approve`, { comments });
    return res.data;
  },
  deleteStandard: async (id: string) => {
    const res = await apiClient.delete(`/standards/${id}`);
    return res.data;
  },

  // ==========================================
  // AUDIT TEMPLATES API
  // ==========================================
  getAuditTemplates: async (filters?: {
    auditType?: string;
    status?: string;
    search?: string;
  }): Promise<AuditTemplate[]> => {
    const res = await apiClient.get('/audit-templates', { params: filters });
    return res.data;
  },
  getAuditTemplateById: async (id: string): Promise<AuditTemplate> => {
    const res = await apiClient.get(`/audit-templates/${id}`);
    return res.data;
  },
  createAuditTemplate: async (data: any): Promise<AuditTemplate> => {
    const res = await apiClient.post('/audit-templates', data);
    return res.data;
  },
  updateAuditTemplate: async (id: string, data: any): Promise<AuditTemplate> => {
    const res = await apiClient.patch(`/audit-templates/${id}`, data);
    return res.data;
  },
  cloneAuditTemplate: async (id: string, code: string, name?: string): Promise<AuditTemplate> => {
    const res = await apiClient.post(`/audit-templates/${id}/clone`, { code, name });
    return res.data;
  },
  addTemplateSection: async (templateId: string, versionId: string, data: any): Promise<AuditTemplateSection> => {
    const res = await apiClient.post(`/audit-templates/${templateId}/versions/${versionId}/sections`, data);
    return res.data;
  },
  updateTemplateSection: async (sectionId: string, data: any): Promise<AuditTemplateSection> => {
    const res = await apiClient.patch(`/audit-templates/sections/${sectionId}`, data);
    return res.data;
  },
  addTemplateQuestion: async (sectionId: string, data: any): Promise<AuditTemplateQuestion> => {
    const res = await apiClient.post(`/audit-templates/sections/${sectionId}/questions`, data);
    return res.data;
  },
  updateTemplateQuestion: async (questionId: string, data: any): Promise<AuditTemplateQuestion> => {
    const res = await apiClient.patch(`/audit-templates/questions/${questionId}`, data);
    return res.data;
  },
  publishTemplateVersion: async (templateId: string, versionId: string, changeSummary?: string): Promise<any> => {
    const res = await apiClient.post(`/audit-templates/${templateId}/versions/${versionId}/publish`, { changeSummary });
    return res.data;
  },
  deleteTemplateQuestion: async (questionId: string) => {
    const res = await apiClient.delete(`/audit-templates/questions/${questionId}`);
    return res.data;
  },
  deleteAuditTemplate: async (id: string) => {
    const res = await apiClient.delete(`/audit-templates/${id}`);
    return res.data;
  },

  // ==========================================
  // AUDIT SCHEDULES & RECURRENCE API
  // ==========================================
  getAuditSchedules: async (): Promise<AuditSchedule[]> => {
    const res = await apiClient.get('/audit-schedules');
    return res.data;
  },
  getAuditScheduleById: async (id: string): Promise<AuditSchedule> => {
    const res = await apiClient.get(`/audit-schedules/${id}`);
    return res.data;
  },
  createAuditSchedule: async (data: any): Promise<AuditSchedule> => {
    const res = await apiClient.post('/audit-schedules', data);
    return res.data;
  },
  updateAuditSchedule: async (id: string, data: any): Promise<AuditSchedule> => {
    const res = await apiClient.patch(`/audit-schedules/${id}`, data);
    return res.data;
  },
  generateAuditsForSchedule: async (scheduleId: string): Promise<any> => {
    const res = await apiClient.post(`/audit-schedules/${scheduleId}/generate`);
    return res.data;
  },
  getScheduledAuditInstances: async (filters?: {
    status?: string;
    auditorId?: string;
    locationId?: string;
  }): Promise<ScheduledAuditInstance[]> => {
    const res = await apiClient.get('/audit-schedules/instances', { params: filters });
    return res.data;
  },
  updateScheduledAuditInstance: async (instanceId: string, data: any): Promise<ScheduledAuditInstance> => {
    const res = await apiClient.patch(`/audit-schedules/instances/${instanceId}`, data);
    return res.data;
  },
  exportIcsCalendar: async (instanceId?: string): Promise<string> => {
    const res = await apiClient.get('/audit-schedules/calendar/export.ics', {
      params: { instanceId },
      responseType: 'text',
    });
    return res.data;
  },
  syncGmailCalendar: async (payload: {
    instanceIds?: string[];
    emailToSync?: string;
    notifyAttendees?: boolean;
  }): Promise<{
    success: boolean;
    syncedCount: number;
    syncedEmail: string;
    syncedAt: string;
    googleCalendarUrls: Array<{ instanceId: string; auditCode: string; title: string; plannedDate: string; googleCalendarUrl: string }>;
    message: string;
  }> => {
    const res = await apiClient.post('/audit-schedules/calendar/gmail-sync', payload);
    return res.data;
  },
  deleteAuditSchedule: async (id: string) => {
    const res = await apiClient.delete(`/audit-schedules/${id}`);
    return res.data;
  },

  // ==========================================
  // AUDIT EXECUTIONS API
  // ==========================================
  getAuditExecutions: async (filters?: {
    locationId?: string;
    status?: string;
    auditorId?: string;
  }): Promise<AuditExecution[]> => {
    const res = await apiClient.get('/audit-executions', { params: filters });
    return res.data;
  },
  getAuditExecutionById: async (id: string): Promise<AuditExecution> => {
    const res = await apiClient.get(`/audit-executions/${id}`);
    return res.data;
  },
  startAuditExecution: async (data: {
    locationId: string;
    templateId: string;
    templateVersionId?: string;
    auditInstanceId?: string;
    auditType?: string;
    auditorName?: string;
  }): Promise<AuditExecution> => {
    const res = await apiClient.post('/audit-executions/start', data);
    return res.data;
  },
  saveAuditDraft: async (id: string, data: {
    answers: any[];
    summaryNotes?: string;
  }): Promise<AuditExecution> => {
    const res = await apiClient.post(`/audit-executions/${id}/draft`, data);
    return res.data;
  },
  submitAuditExecution: async (id: string, data: {
    answers: any[];
    summaryNotes?: string;
    auditorSignature?: string;
    auditorName?: string;
    completedAt?: string;
  }): Promise<AuditExecution> => {
    const res = await apiClient.post(`/audit-executions/${id}/submit`, data);
    return res.data;
  },
  acknowledgeAuditExecution: async (
    id: string,
    data: AcknowledgeAuditPayload,
  ): Promise<AuditExecution> => {
    const res = await apiClient.post(`/audit-executions/${id}/acknowledge`, data);
    return res.data;
  },
  disputeAuditExecution: async (
    id: string,
    data: DisputeAuditPayload,
  ): Promise<AuditExecution> => {
    const res = await apiClient.post(`/audit-executions/${id}/dispute`, data);
    return res.data;
  },
  resolveAuditDispute: async (
    id: string,
    data: ResolveDisputePayload,
  ): Promise<AuditExecution> => {
    const res = await apiClient.post(`/audit-executions/${id}/resolve-dispute`, data);
    return res.data;
  },
  getAuditReport: async (id: string): Promise<AuditExecution> => {
    const res = await apiClient.get(`/audit-executions/${id}/report`);
    return res.data;
  },
  deleteAuditExecution: async (id: string) => {
    const res = await apiClient.delete(`/audit-executions/${id}`);
    return res.data;
  },

  // ==========================================
  // OBSERVATIONS & ABNORMALITIES API
  // ==========================================
  getObservations: async (filters?: {
    category?: string;
    severity?: string;
    status?: string;
    locationId?: string;
    executionId?: string;
    search?: string;
  }): Promise<Observation[]> => {
    const res = await apiClient.get('/observations', { params: filters });
    return res.data;
  },
  getObservationById: async (id: string): Promise<Observation> => {
    const res = await apiClient.get(`/observations/${id}`);
    return res.data;
  },
  createObservation: async (data: any): Promise<Observation> => {
    const res = await apiClient.post('/observations', data);
    return res.data;
  },
  updateObservation: async (id: string, data: any): Promise<Observation> => {
    const res = await apiClient.patch(`/observations/${id}`, data);
    return res.data;
  },
  deleteObservation: async (id: string) => {
    const res = await apiClient.delete(`/observations/${id}`);
    return res.data;
  },

  // ==========================================
  // CORRECTIVE ACTIONS (CAPA) API
  // ==========================================
  getCorrectiveActions: async (filters?: {
    status?: string;
    assigneeId?: string;
    locationId?: string;
    isOverdue?: string;
    escalationTier?: string;
    search?: string;
  }): Promise<CorrectiveAction[]> => {
    const res = await apiClient.get('/corrective-actions', { params: filters });
    return res.data;
  },
  getCorrectiveActionById: async (id: string): Promise<CorrectiveAction> => {
    const res = await apiClient.get(`/corrective-actions/${id}`);
    return res.data;
  },
  createCorrectiveAction: async (data: any): Promise<CorrectiveAction> => {
    const res = await apiClient.post('/corrective-actions', data);
    return res.data;
  },
  updateCorrectiveAction: async (id: string, data: any): Promise<CorrectiveAction> => {
    const res = await apiClient.patch(`/corrective-actions/${id}`, data);
    return res.data;
  },
  update5WhyAnalysis: async (id: string, data: any): Promise<CorrectiveAction> => {
    const res = await apiClient.patch(`/corrective-actions/${id}/5-why`, data);
    return res.data;
  },
  submitActionClosure: async (id: string, data: {
    closureNotes: string;
    afterPhotoUrl: string;
    actorName?: string;
  }): Promise<CorrectiveAction> => {
    const res = await apiClient.post(`/corrective-actions/${id}/submit-closure`, data);
    return res.data;
  },
  verifyCorrectiveAction: async (id: string, data: {
    approved: boolean;
    verificationNotes?: string;
    verifierName?: string;
  }): Promise<CorrectiveAction> => {
    const res = await apiClient.post(`/corrective-actions/${id}/verify`, data);
    return res.data;
  },
  deleteCorrectiveAction: async (id: string) => {
    const res = await apiClient.delete(`/corrective-actions/${id}`);
    return res.data;
  },

  // ==========================================
  // RED TAG MANAGEMENT HUB API
  // ==========================================
  getRedTags: async (filters?: {
    status?: string;
    category?: string;
    locationId?: string;
    holdingAreaId?: string;
    ageingTier?: string;
    search?: string;
  }): Promise<RedTag[]> => {
    const res = await apiClient.get('/red-tags', { params: filters });
    return res.data;
  },
  getRedTagMetrics: async (): Promise<RedTagMetrics> => {
    const res = await apiClient.get('/red-tags/metrics');
    return res.data;
  },
  getRedTagById: async (id: string): Promise<RedTag> => {
    const res = await apiClient.get(`/red-tags/${id}`);
    return res.data;
  },
  createRedTag: async (data: any): Promise<RedTag> => {
    const res = await apiClient.post('/red-tags', data);
    return res.data;
  },
  updateRedTag: async (id: string, data: any): Promise<RedTag> => {
    const res = await apiClient.patch(`/red-tags/${id}`, data);
    return res.data;
  },
  submitRedTagDisposition: async (id: string, data: {
    dispositionAction: string;
    dispositionJustification: string;
    supervisorApproved?: boolean;
    supervisorName?: string;
  }): Promise<RedTag> => {
    const res = await apiClient.post(`/red-tags/${id}/disposition`, data);
    return res.data;
  },
  closeRedTag: async (id: string, data: {
    closurePhotoUrl?: string;
    financialRecovered?: number;
    notes?: string;
  }): Promise<RedTag> => {
    const res = await apiClient.post(`/red-tags/${id}/close`, data);
    return res.data;
  },
  deleteRedTag: async (id: string) => {
    const res = await apiClient.delete(`/red-tags/${id}`);
    return res.data;
  },

  // Analytics & 5S Maturity Heatmap
  getMaturityOverview: async (timeframe: string = '90D'): Promise<MaturityOverview> => {
    const res = await apiClient.get('/analytics/maturity', { params: { timeframe } });
    return res.data?.data || res.data;
  },
  get5SHeatmap: async (): Promise<HeatmapData> => {
    const res = await apiClient.get('/analytics/heatmap');
    return res.data?.data || res.data;
  },
  getLeaderboard: async (): Promise<LeaderboardData> => {
    const res = await apiClient.get('/analytics/leaderboard');
    return res.data?.data || res.data;
  },

  // Authentication & Identity Federation
  login: async (payload: { email: string; password: string; tenantSlug?: string; rememberMe?: boolean }): Promise<AuthResponse> => {
    const res = await apiClient.post('/auth/login', payload);
    return res.data;
  },
  ssoLogin: async (payload: { provider: string; tenantSlug?: string; ssoToken?: string }): Promise<AuthResponse> => {
    const res = await apiClient.post('/auth/sso', payload);
    return res.data;
  },
  pinLogin: async (payload: { pin: string; badgeId?: string; workstationCode?: string; tenantSlug?: string }): Promise<AuthResponse> => {
    const res = await apiClient.post('/auth/pin-login', payload);
    return res.data;
  },
  forgotPassword: async (payload: { email: string; tenantSlug?: string }): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post('/auth/forgot-password', payload);
    return res.data;
  },
  getCurrentSession: async (): Promise<AuthResponse> => {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },

  // 5S Training Academy & Onboarding Quiz
  getTrainingCourses: async (): Promise<TrainingCourse[]> => {
    const res = await apiClient.get('/training/courses');
    return res.data?.data || res.data;
  },
  getTrainingCourseById: async (id: string): Promise<TrainingCourse> => {
    const res = await apiClient.get(`/training/courses/${id}`);
    return res.data?.data || res.data;
  },
  getQuizQuestions: async (): Promise<QuizQuestion[]> => {
    const res = await apiClient.get('/training/quiz');
    return res.data?.data || res.data;
  },
  submitQuiz: async (payload: { answers: Record<string, number>; traineeName?: string; traineeEmail?: string }): Promise<QuizSubmissionResult> => {
    const res = await apiClient.post('/training/quiz/submit', payload);
    return res.data?.data || res.data;
  },
  getCertificate: async (id: string): Promise<TrainingCertificate> => {
    const res = await apiClient.get(`/training/certificate/${id}`);
    return res.data?.data || res.data;
  },

  // 5S Gamification, Trophies & Recognition
  getGamificationOverview: async (): Promise<GamificationOverview> => {
    const res = await apiClient.get('/analytics/gamification/overview');
    return res.data?.data || res.data;
  },
  getGamificationLeaderboards: async (): Promise<GamificationLeaderboards> => {
    const res = await apiClient.get('/analytics/gamification/leaderboards');
    return res.data?.data || res.data;
  },
  getGamificationTrophies: async (): Promise<TrophiesAndAwardsData> => {
    const res = await apiClient.get('/analytics/gamification/trophies');
    return res.data?.data || res.data;
  },
  getGamificationBadges: async (): Promise<BadgesAndMilestonesData> => {
    const res = await apiClient.get('/analytics/gamification/badges');
    return res.data?.data || res.data;
  },
  awardTrophy: async (payload: { trophyId: string; newLocationId: string; citation: string; awardedBy?: string }) => {
    const res = await apiClient.post('/analytics/gamification/award-trophy', payload);
    return res.data?.data || res.data;
  },
  giveKudos: async (payload: { toUser: string; category: string; message: string; points?: number; fromUser?: string }) => {
    const res = await apiClient.post('/analytics/gamification/kudos', payload);
    return res.data?.data || res.data;
  },
};


