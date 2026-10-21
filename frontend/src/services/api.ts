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
  LoginResult,
  MfaChallengeResponse,
  MfaVerifyPayload,
  MfaStatus,
  MfaSetupResponse,
  RecoveryCodesResponse,
  AuthSession,
  StorageUsage,
  TrainingCertificate,
  AcknowledgeAuditPayload,
  DisputeAuditPayload,
  ResolveDisputePayload,
  GamificationOverview,
  GamificationLeaderboards,
  TrophiesAndAwardsData,
  BadgesAndMilestonesData,
  FloatingTrophy,
  TrophyKey,
  KudosCategory,
  AnalyticsKpis,
  DrilldownData,
  LocationAuditDrilldown,
  BenchmarkRow,
  CertificationData,
  ActivityLogPage,
  ActivityLogQuery,
  ActivityLogFilters,
  ActivityChainVerification,
  OrganizationSettings,
  TenantSettings,
  UpdateSettingsPayload,
  NotificationPage,
  NotificationQuery,
  NotificationPreferences,
  ReportRegister,
  ReportPreview,
  ReportFilterValues,
  ReportExportFormat,
  SubscriptionSummary,
  PlatformPlanCatalogue,
  PlatformPlan,
  PlanPayload,
  TenantSubscriptionPayload,
  PlatformMetrics,
  SearchResponse,
  SearchResultType,
  DuplicateObservation,
  DuplicateRedTag,
  DuplicateLocation,
  OnboardingChecklist,
  ImportCatalogueEntry,
  BulkImportCommitResult,
  ReadOnlyReason,
  ApiKeyRecord,
  CreateApiKeyPayload,
  CreatedApiKey,
  WebhookEndpoint,
  CreateWebhookPayload,
  UpdateWebhookPayload,
  CreatedWebhook,
  WebhookSecretResponse,
  WebhookDelivery,
  WebhookTestResult,
} from '../types';

/** Period selection for analytics endpoints: a timeframe (30D, 90D, 3M, 6M, 12M, YTD) or a custom from/to. */
export type RoutineKind = 'KAMISHIBAI' | 'SHADOW_TOOL';
export type RoutineStatus = 'OK' | 'NOT_OK' | 'PRESENT' | 'MISSING' | 'DAMAGED';
export type FiveSCategory = 'S1_SORT' | 'S2_SET_IN_ORDER' | 'S3_SHINE' | 'S4_STANDARDIZE' | 'S5_SUSTAIN' | 'S6_SAFETY';

export interface RoutineItemRow {
  id: string;
  kind: RoutineKind;
  text: string;
  position: string | null;
  category: FiveSCategory;
  sortOrder: number;
  check: {
    status: RoutineStatus;
    note: string | null;
    observationId: string | null;
    checkedAt: string;
    checkedBy: string | null;
  } | null;
}

export interface RoutineDay {
  location: { id: string; name: string; areaCode: string };
  date: string;
  isToday: boolean;
  kamishibai: RoutineItemRow[];
  tools: RoutineItemRow[];
  summary: Record<'kamishibai' | 'tools', { total: number; done: number; issues: number }>;
}

export interface RoutineHistory {
  days: Array<{ date: string; kamishibai: { done: number; issues: number; total: number }; tools: { done: number; issues: number; total: number } }>;
  currentItems: { kamishibai: number; tools: number };
}

export interface LocationScorecard {
  audits: {
    windowDays: number;
    countInWindow: number;
    averageScore: number | null;
    maturity: { level: number; name: string; color: string } | null;
    latest: { id: string; auditCode: string; score: number; completedAt: string; auditorName: string | null } | null;
    pillars: Array<{ key: FiveSCategory; score: number | null }>;
  };
  work: { openActions: number; overdueActions: number; openObservations: number };
  evidence: { count: number };
}

export interface LocationEvidenceItem {
  id: string;
  source: 'UPLOAD' | 'CAPA';
  category: FiveSCategory;
  description: string;
  beforePhotoUrl: string;
  afterPhotoUrl: string;
  afterLabel: string | null;
  uploadedBy: string | null;
  uploadedById: string | null;
  createdAt: string;
  actionCode?: string;
}

export interface AnalyticsQuery {
  timeframe?: string;
  from?: string;
  to?: string;
  orgNodeId?: string;
}

/** One month of the analytics trend; scores are null for months without audits. */
export interface AnalyticsTrendPoint {
  month: string;
  audits: number;
  overall: number | null;
  S1_SORT: number | null;
  S2_SET_IN_ORDER: number | null;
  S3_SHINE: number | null;
  S4_STANDARDIZE: number | null;
  S5_SUSTAIN: number | null;
  S6_SAFETY: number | null;
}

/** Base URL of the REST API (also shown in integration examples). */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Session token storage ---
// "Remember me" sessions persist in localStorage; otherwise the token lives only for the browser session.
const TOKEN_KEY = '5s_access_token';

const readStoredToken = (): string | null => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

let authToken: string | null = readStoredToken();
// Only platform super admins may operate on a tenant other than their own; the backend ignores this header for everyone else.
let tenantOverrideId: string | null = null;
let unauthorizedHandler: (() => void) | null = null;
let mfaEnrollmentHandler: (() => void) | null = null;
let readOnlyHandler: ((reason: ReadOnlyReason, message: string) => void) | null = null;

export const getAuthToken = (): string | null => authToken;

export const setAuthToken = (token: string | null, persist = false) => {
  authToken = token;
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (token) {
      (persist ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    }
  } catch {
    // Storage may be unavailable (private mode); the in-memory token still works for this tab.
  }
};

export const setApiTenantOverride = (tenantId: string | null) => {
  tenantOverrideId = tenantId;
};

/** Registers the callback invoked when the API rejects the session (expired or revoked token). */
export const onUnauthorized = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};

/** Registers the callback invoked when the API demands mandatory MFA enrolment (403 MFA_ENROLLMENT_REQUIRED). */
export const onMfaEnrollmentRequired = (handler: (() => void) | null) => {
  mfaEnrollmentHandler = handler;
};

/** Registers the callback invoked when the organization is read-only (402 TRIAL_EXPIRED / SUBSCRIPTION_LAPSED). */
export const onReadOnlyMode = (handler: ((reason: ReadOnlyReason, message: string) => void) | null) => {
  readOnlyHandler = handler;
};

export const MFA_ENROLLMENT_REQUIRED_CODE = 'MFA_ENROLLMENT_REQUIRED';

/** Machine-readable prefixes the backend puts in front of MFA, subscription and plan errors. */
const ERROR_CODE_PREFIX = /^(MFA_ENROLLMENT_REQUIRED|TRIAL_EXPIRED|SUBSCRIPTION_LAPSED|PLAN_FEATURE_REQUIRED|PLAN_LIMIT_REACHED):\s*/;

/** The raw backend message of an API error, joined when it is a validation list. */
const rawErrorMessage = (error: unknown): string => {
  const err = error as { response?: { data?: { message?: unknown } } };
  const message = err?.response?.data?.message;
  return Array.isArray(message) ? message.join(' ') : typeof message === 'string' ? message : '';
};

/** The read-only reason when the API refused a change because the trial ended or the subscription lapsed (402). */
export const getReadOnlyReason = (error: unknown): ReadOnlyReason | null => {
  const err = error as { response?: { status?: number } };
  if (err?.response?.status !== 402) return null;
  const text = rawErrorMessage(error);
  if (text.startsWith('TRIAL_EXPIRED')) return 'TRIAL_EXPIRED';
  if (text.startsWith('SUBSCRIPTION_LAPSED')) return 'SUBSCRIPTION_LAPSED';
  return null;
};

/** True when the endpoint needs a plan feature the organization does not have (403 PLAN_FEATURE_REQUIRED). */
export const isPlanFeatureRequiredError = (error: unknown): boolean => {
  const err = error as { response?: { status?: number } };
  return err?.response?.status === 403 && rawErrorMessage(error).startsWith('PLAN_FEATURE_REQUIRED');
};

/** Same as isPlanFeatureRequiredError, for requests made with responseType 'blob' (the body arrives as a Blob). */
export const isBlobPlanFeatureRequiredError = async (error: unknown): Promise<boolean> => {
  const err = error as { response?: { status?: number; data?: unknown } };
  if (err?.response?.status !== 403) return false;
  const data = err.response.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return String(parsed?.message ?? '').startsWith('PLAN_FEATURE_REQUIRED');
    } catch {
      return false;
    }
  }
  return isPlanFeatureRequiredError(error);
};

/** True when a plan limit (users / locations) prevented the change (403 PLAN_LIMIT_REACHED). */
export const isPlanLimitReachedError = (error: unknown): boolean => {
  const err = error as { response?: { status?: number } };
  return err?.response?.status === 403 && rawErrorMessage(error).startsWith('PLAN_LIMIT_REACHED');
};

/** True for the 403 the backend returns while an administrator still has to enrol in MFA. */
export const isMfaEnrollmentRequiredError = (error: unknown): boolean => {
  const err = error as { response?: { status?: number; data?: { message?: unknown } } };
  if (err?.response?.status !== 403) return false;
  const message = err.response.data?.message;
  const text = Array.isArray(message) ? message.join(' ') : String(message ?? '');
  return text.startsWith(MFA_ENROLLMENT_REQUIRED_CODE);
};

/** Sign-in steps whose 401 means "wrong credentials", not "your session ended". */
const CREDENTIAL_ENDPOINTS = ['/auth/login', '/auth/pin-login', '/auth/sso', '/auth/mfa/verify', '/auth/forgot-password', '/auth/reset-password', '/auth/logout'];

const isCredentialEndpoint = (url: unknown): boolean => {
  const path = String(url || '').split('?')[0];
  return CREDENTIAL_ENDPOINTS.some((p) => path === p || path.endsWith(p));
};

/** Narrows a sign-in response to the MFA challenge variant. */
export const isMfaChallenge = (res: LoginResult | null | undefined): res is MfaChallengeResponse =>
  !!res && (res as MfaChallengeResponse).mfaRequired === true && !(res as AuthResponse).accessToken;

apiClient.interceptors.request.use((config) => {
  if (authToken) {
    config.headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (tenantOverrideId) {
    config.headers['x-tenant-id'] = tenantOverrideId;
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
    const status = error?.response?.status;
    // The token this request was sent with; a late 401 from a previous session must not sign out a newer one
    const headers = error?.config?.headers || {};
    const sentAuth = String(headers.Authorization || headers.authorization || '');
    const sentWithCurrentToken = !!authToken && sentAuth === `Bearer ${authToken}`;
    // Credential failures on the sign-in endpoints are handled by their forms, not as an expired session
    if (status === 401 && sentWithCurrentToken && !isCredentialEndpoint(error?.config?.url)) {
      unauthorizedHandler?.();
    } else if (sentWithCurrentToken && isMfaEnrollmentRequiredError(error)) {
      mfaEnrollmentHandler?.();
    } else if (sentWithCurrentToken) {
      // Trial ended / subscription lapsed: the organization is read-only until the subscription is renewed
      const reason = getReadOnlyReason(error);
      if (reason) readOnlyHandler?.(reason, rawErrorMessage(error).replace(ERROR_CODE_PREFIX, ''));
    }
    return Promise.reject(error);
  },
);

/** Extracts the user-facing message from an API error (backend envelope first, then network fallback). */
export const getApiErrorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  const err = error as { response?: { status?: number; data?: { message?: string | string[] } }; message?: string };
  if (err?.response?.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  const message = err?.response?.data?.message;
  if (Array.isArray(message)) return message.join('. ');
  // MFA / subscription / plan errors carry a machine-readable prefix; show only the human part
  if (typeof message === 'string' && message) return message.replace(ERROR_CODE_PREFIX, '');
  if (!err?.response && err?.message === 'Network Error') return 'Unable to reach the server. Check your connection and try again.';
  return fallback;
};


/**
 * Like getApiErrorMessage, for requests made with responseType 'blob': the error body arrives as a Blob,
 * so the JSON envelope has to be read out of it first.
 */
export const getBlobApiErrorMessage = async (error: unknown, fallback = 'Something went wrong. Please try again.'): Promise<string> => {
  const err = error as { response?: { data?: unknown } };
  const data = err?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return getApiErrorMessage({ response: { data: parsed } }, fallback);
    } catch {
      return fallback;
    }
  }
  return getApiErrorMessage(error, fallback);
};

/** Reads the filename from a Content-Disposition header (plain or RFC 5987 form). */
const filenameFromDisposition = (header: unknown): string | null => {
  if (typeof header !== 'string' || !header) return null;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star && star[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // fall through to the plain form
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain && plain[1] ? plain[1].trim() : null;
};

/** Drops empty filter values so they are not sent as empty query parameters. */
const reportParams = (filters: ReportFilterValues): Record<string, string> => {
  const out: Record<string, string> = {};
  (Object.keys(filters) as (keyof ReportFilterValues)[]).forEach((k) => {
    const v = filters[k];
    if (k === 'overdueOnly') {
      if (v === true) out.overdueOnly = 'true';
    } else if (typeof v === 'string' && v.trim()) {
      out[k] = v.trim();
    }
  });
  return out;
};

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
  executeOnboarding: async (data: {
    orgName: string;
    orgSlug: string;
    industry?: string;
    logoUrl?: string;
    sites: string[];
    departments: string[];
    adminName: string;
    adminEmail: string;
  }): Promise<{
    message: string;
    tenantId: string;
    tenantSlug: string;
    adminEmail: string;
    /** Present only when a new admin account was provisioned. */
    adminTemporaryPassword?: string;
    sitesCreated: number;
    departmentsCreated: number;
  }> => {
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
  assignRole: async (userId: string, roleId: string, orgNodeId?: string) => {
    const res = await apiClient.post(`/users/${userId}/roles`, { roleId, orgNodeId });
    return res.data;
  },

  // --- Activity Trail (tamper-evident audit log) ---
  getActivityLogs: async (params: ActivityLogQuery = {}): Promise<ActivityLogPage> => {
    const res = await apiClient.get('/activity-logs', { params });
    return res.data?.data || res.data;
  },
  getActivityLogFilters: async (): Promise<ActivityLogFilters> => {
    const res = await apiClient.get('/activity-logs/filters');
    return res.data?.data || res.data;
  },
  verifyActivityLog: async (): Promise<ActivityChainVerification> => {
    const res = await apiClient.get('/activity-logs/verify');
    return res.data?.data || res.data;
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
  getScheduledAuditInstance: async (instanceId: string): Promise<ScheduledAuditInstance> => {
    const res = await apiClient.get(`/audit-schedules/instances/${encodeURIComponent(instanceId)}`);
    return res.data?.data || res.data;
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
  deleteRedTag: async (id: string) => {
    const res = await apiClient.delete(`/red-tags/${id}`);
    return res.data;
  },

  // Analytics & 5S Maturity Heatmap
  getMaturityOverview: async (timeframe: string = '90D'): Promise<MaturityOverview> => {
    const res = await apiClient.get('/analytics/maturity', { params: { timeframe } });
    return res.data?.data || res.data;
  },
  get5SHeatmap: async (orgNodeId?: string): Promise<HeatmapData> => {
    const res = await apiClient.get('/analytics/heatmap', { params: { orgNodeId } });
    return res.data?.data || res.data;
  },
  getAnalyticsKpis: async (params: AnalyticsQuery = {}): Promise<AnalyticsKpis> => {
    const res = await apiClient.get('/analytics/kpis', { params });
    return res.data?.data || res.data;
  },
  getAnalyticsTrend: async (params: AnalyticsQuery = {}): Promise<AnalyticsTrendPoint[]> => {
    const res = await apiClient.get('/analytics/trend', { params });
    return res.data?.data || res.data;
  },
  getAnalyticsDrilldown: async (orgNodeId?: string): Promise<DrilldownData> => {
    const res = await apiClient.get('/analytics/drilldown', { params: { orgNodeId } });
    return res.data?.data || res.data;
  },
  getLocationAuditDrilldown: async (locationId: string, timeframe = '12M'): Promise<LocationAuditDrilldown> => {
    const res = await apiClient.get(`/analytics/drilldown/locations/${locationId}`, { params: { timeframe } });
    return res.data?.data || res.data;
  },
  getAnalyticsBenchmark: async (level: 'PLANT' | 'DEPARTMENT' | 'AREA', timeframe = '90D'): Promise<BenchmarkRow[]> => {
    const res = await apiClient.get('/analytics/benchmark', { params: { level, timeframe } });
    return res.data?.data || res.data;
  },
  getCertification: async (): Promise<CertificationData> => {
    const res = await apiClient.get('/analytics/certification');
    return res.data?.data || res.data;
  },

  // Authentication & Identity Federation
  login: async (payload: { email: string; password: string; tenantSlug?: string; rememberMe?: boolean }): Promise<LoginResult> => {
    const res = await apiClient.post('/auth/login', payload);
    return res.data;
  },
  ssoLogin: async (payload: { provider: string; tenantSlug?: string; ssoToken?: string }): Promise<AuthResponse> => {
    const res = await apiClient.post('/auth/sso', payload);
    return res.data;
  },
  pinLogin: async (payload: { pin: string; badgeId: string; workstationCode?: string; tenantSlug?: string }): Promise<LoginResult> => {
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
  /** Second sign-in step (authenticator code or recovery code). */
  verifyMfa: async (payload: MfaVerifyPayload): Promise<AuthResponse> => {
    const res = await apiClient.post('/auth/mfa/verify', payload);
    return res.data;
  },
  resetPassword: async (payload: { token: string; newPassword: string }): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post('/auth/reset-password', payload);
    return res.data;
  },
  changePassword: async (payload: { currentPassword: string; newPassword: string }): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.post('/auth/change-password', payload);
    return res.data;
  },
  /**
   * Revokes a session server-side. The token is passed explicitly so this can run after local state has been
   * cleared; a failure here never blocks signing out locally.
   */
  logout: async (token?: string | null): Promise<void> => {
    const bearer = token ?? authToken;
    if (!bearer) return;
    await apiClient.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${bearer}` } });
  },
  /** Personal preferences of the signed-in user. `locale: null` = follow the organization default. */
  updateMyPreferences: async (payload: { locale: string | null }): Promise<{ locale: string | null }> => {
    const res = await apiClient.patch('/auth/me/preferences', payload);
    return res.data;
  },
  getSessions: async (): Promise<AuthSession[]> => {
    const res = await apiClient.get('/auth/sessions');
    return Array.isArray(res.data) ? res.data : [];
  },
  revokeSession: async (id: string): Promise<void> => {
    await apiClient.delete(`/auth/sessions/${id}`);
  },
  revokeOtherSessions: async (): Promise<{ revoked: number }> => {
    const res = await apiClient.post('/auth/sessions/revoke-others');
    return res.data;
  },
  getMfaStatus: async (): Promise<MfaStatus> => {
    const res = await apiClient.get('/auth/mfa');
    return res.data;
  },
  setupMfa: async (): Promise<MfaSetupResponse> => {
    const res = await apiClient.post('/auth/mfa/setup');
    return res.data;
  },
  enableMfa: async (code: string): Promise<RecoveryCodesResponse> => {
    const res = await apiClient.post('/auth/mfa/enable', { code });
    return res.data;
  },
  disableMfa: async (payload: { password: string; code: string }): Promise<{ enabled: boolean }> => {
    const res = await apiClient.post('/auth/mfa/disable', payload);
    return res.data;
  },
  regenerateRecoveryCodes: async (code: string): Promise<RecoveryCodesResponse> => {
    const res = await apiClient.post('/auth/mfa/recovery-codes', { code });
    return res.data;
  },
  /** Org admins: sign a user out of every device. */
  revokeUserSessions: async (userId: string): Promise<{ sessionsRevoked: number }> => {
    const res = await apiClient.post(`/users/${userId}/revoke-sessions`);
    return res.data;
  },
  /** Org admins: remove a user's two-factor enrolment (also signs them out everywhere). */
  resetUserMfa: async (userId: string): Promise<{ mfaEnabled: boolean; sessionsRevoked: number }> => {
    const res = await apiClient.post(`/users/${userId}/reset-mfa`);
    return res.data;
  },
  /** Program managers: file storage used by the organization against its quota. */
  getStorageUsage: async (): Promise<StorageUsage> => {
    const res = await apiClient.get('/files/usage');
    return res.data;
  },

  // Training certificates (courses, progress and the quiz are in trainingApi.ts)
  getCertificate: async (id: string): Promise<TrainingCertificate> => {
    const res = await apiClient.get(`/training/certificate/${encodeURIComponent(id)}`);
    return res.data?.data || res.data;
  },
  getMyCertificates: async (): Promise<TrainingCertificate[]> => {
    const res = await apiClient.get('/training/certificates/me');
    return res.data?.data || res.data;
  },
  /** Organization competency register (program managers). */
  getCertificates: async (userId?: string): Promise<TrainingCertificate[]> => {
    const res = await apiClient.get('/training/certificates', { params: userId ? { userId } : undefined });
    return res.data?.data || res.data;
  },
  /** Org admins only. */
  revokeCertificate: async (certificateId: string): Promise<TrainingCertificate> => {
    const res = await apiClient.post(`/training/certificates/${encodeURIComponent(certificateId)}/revoke`);
    return res.data?.data || res.data;
  },

  // Location scorecard and before / after evidence
  getLocationScorecard: async (locationId: string): Promise<LocationScorecard> => {
    const res = await apiClient.get(`/locations/${encodeURIComponent(locationId)}/scorecard`);
    return res.data?.data || res.data;
  },
  getLocationEvidence: async (locationId: string): Promise<LocationEvidenceItem[]> => {
    const res = await apiClient.get(`/locations/${encodeURIComponent(locationId)}/evidence`);
    return res.data?.data || res.data;
  },
  addLocationEvidence: async (
    locationId: string,
    payload: { category: FiveSCategory; description: string; beforePhotoUrl: string; afterPhotoUrl: string; afterLabel?: string },
  ): Promise<LocationEvidenceItem> => {
    const res = await apiClient.post(`/locations/${encodeURIComponent(locationId)}/evidence`, payload);
    return res.data?.data || res.data;
  },
  removeLocationEvidence: async (locationId: string, evidenceId: string): Promise<{ id: string; removed: boolean }> => {
    const res = await apiClient.delete(`/locations/${encodeURIComponent(locationId)}/evidence/${encodeURIComponent(evidenceId)}`);
    return res.data?.data || res.data;
  },

  // Daily area routine (Kamishibai checks + shadow-board tools)
  getRoutineDay: async (locationId: string, date?: string): Promise<RoutineDay> => {
    const res = await apiClient.get(`/locations/${encodeURIComponent(locationId)}/routine`, { params: date ? { date } : undefined });
    return res.data?.data || res.data;
  },
  getRoutineHistory: async (locationId: string, days = 30): Promise<RoutineHistory> => {
    const res = await apiClient.get(`/locations/${encodeURIComponent(locationId)}/routine/history`, { params: { days } });
    return res.data?.data || res.data;
  },
  recordRoutineCheck: async (
    locationId: string,
    payload: { itemId: string; status: RoutineStatus; note?: string; raiseObservation?: boolean },
  ): Promise<RoutineDay> => {
    const res = await apiClient.put(`/locations/${encodeURIComponent(locationId)}/routine/checks`, payload);
    return res.data?.data || res.data;
  },
  addRoutineItem: async (
    locationId: string,
    payload: { kind: RoutineKind; text: string; position?: string; category?: FiveSCategory },
  ): Promise<RoutineItemRow> => {
    const res = await apiClient.post(`/locations/${encodeURIComponent(locationId)}/routine/items`, payload);
    return res.data?.data || res.data;
  },
  addDefaultRoutineItems: async (locationId: string): Promise<RoutineItemRow[]> => {
    const res = await apiClient.post(`/locations/${encodeURIComponent(locationId)}/routine/items/defaults`);
    return res.data?.data || res.data;
  },
  updateRoutineItem: async (
    locationId: string,
    itemId: string,
    payload: { text?: string; position?: string | null; category?: FiveSCategory; sortOrder?: number },
  ): Promise<RoutineItemRow> => {
    const res = await apiClient.patch(`/locations/${encodeURIComponent(locationId)}/routine/items/${encodeURIComponent(itemId)}`, payload);
    return res.data?.data || res.data;
  },
  retireRoutineItem: async (locationId: string, itemId: string): Promise<{ id: string; retired: boolean }> => {
    const res = await apiClient.delete(`/locations/${encodeURIComponent(locationId)}/routine/items/${encodeURIComponent(itemId)}`);
    return res.data?.data || res.data;
  },

  // Organization settings
  getSettings: async (): Promise<OrganizationSettings> => {
    const res = await apiClient.get('/settings');
    return res.data?.data || res.data;
  },
  getDefaultSettings: async (): Promise<TenantSettings> => {
    const res = await apiClient.get('/settings/defaults');
    return res.data?.data || res.data;
  },
  /** Org admins only. Any subset of sections; returns the full effective settings. */
  updateSettings: async (data: UpdateSettingsPayload): Promise<OrganizationSettings> => {
    const res = await apiClient.patch('/settings', data);
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
  awardTrophy: async (payload: { trophyId: TrophyKey; newLocationId: string; citation: string }) => {
    const res = await apiClient.post('/analytics/gamification/award-trophy', payload);
    return res.data?.data || res.data;
  },
  /** The sender is the signed-in user; the XP awarded is fixed by the server. */
  giveKudos: async (payload: { toUserId: string; category: KudosCategory; message: string }) => {
    const res = await apiClient.post('/analytics/gamification/kudos', payload);
    return res.data?.data || res.data;
  },

  // --- In-app notifications (signed-in user's own) ---
  getNotifications: async (query: NotificationQuery = {}): Promise<NotificationPage> => {
    const params: Record<string, string | number> = {};
    if (query.unreadOnly !== undefined) params.unreadOnly = query.unreadOnly ? 'true' : 'false';
    if (query.page) params.page = query.page;
    if (query.pageSize) params.pageSize = Math.min(100, query.pageSize);
    const res = await apiClient.get('/notifications', { params });
    return res.data;
  },
  getUnreadNotificationCount: async (): Promise<number> => {
    const res = await apiClient.get('/notifications/unread-count');
    return Number(res.data?.unread) || 0;
  },
  markNotificationRead: async (id: string): Promise<void> => {
    await apiClient.post(`/notifications/${encodeURIComponent(id)}/read`);
  },
  markAllNotificationsRead: async (): Promise<{ marked: number }> => {
    const res = await apiClient.post('/notifications/read-all');
    return res.data;
  },
  getNotificationPreferences: async (): Promise<NotificationPreferences> => {
    const res = await apiClient.get('/notifications/preferences');
    return res.data;
  },
  updateNotificationPreferences: async (data: Partial<NotificationPreferences>): Promise<NotificationPreferences> => {
    const res = await apiClient.patch('/notifications/preferences', data);
    return res.data;
  },

  /** On-screen preview: first 200 rows plus the total match count. */
  getReportPreview: async (key: string, filters: ReportFilterValues = {}): Promise<ReportPreview> => {
    const res = await apiClient.get(`/reports/${encodeURIComponent(key)}`, { params: { ...reportParams(filters), format: 'json' } });
    return res.data;
  },
  /** Downloads an export file; errors carry a Blob body (use getBlobApiErrorMessage). */
  downloadReport: async (key: string, format: ReportExportFormat, filters: ReportFilterValues = {}): Promise<{ blob: Blob; filename: string }> => {
    const res = await apiClient.get(`/reports/${encodeURIComponent(key)}`, {
      params: { ...reportParams(filters), format },
      responseType: 'blob',
    });
    // Content-Disposition is only readable cross-origin when the API exposes it; fall back to the server's naming
    const filename =
      filenameFromDisposition(res.headers?.['content-disposition']) || `${key}-${new Date().toISOString().slice(0, 10)}.${format}`;
    return { blob: res.data as Blob, filename };
  },

  // --- Subscription (organization administrators) ---
  getSubscription: async (): Promise<SubscriptionSummary> => {
    const res = await apiClient.get('/subscription');
    return res.data;
  },

  getPlatformPlans: async (): Promise<PlatformPlanCatalogue> => {
    const res = await apiClient.get('/platform/plans');
    return res.data;
  },
  createPlatformPlan: async (data: PlanPayload): Promise<PlatformPlan> => {
    const res = await apiClient.post('/platform/plans', data);
    return res.data;
  },
  updatePlatformPlan: async (code: string, data: PlanPayload): Promise<PlatformPlan> => {
    const res = await apiClient.patch(`/platform/plans/${encodeURIComponent(code)}`, data);
    return res.data;
  },
  updateTenantSubscription: async (tenantId: string, data: TenantSubscriptionPayload): Promise<unknown> => {
    const res = await apiClient.patch(`/platform/tenants/${encodeURIComponent(tenantId)}/subscription`, data);
    return res.data;
  },

  // --- Global search, duplicate hints, onboarding checklist ---
  search: async (q: string, types?: SearchResultType[]): Promise<SearchResponse> => {
    const res = await apiClient.get('/search', { params: { q, ...(types && types.length ? { types: types.join(',') } : {}) } });
    return res.data;
  },
  findDuplicateObservations: async (params: { locationId: string; title: string; category?: string }): Promise<DuplicateObservation[]> => {
    const res = await apiClient.get('/duplicates/observations', { params });
    return Array.isArray(res.data) ? res.data : [];
  },
  findDuplicateRedTags: async (params: { locationId: string; itemName: string }): Promise<DuplicateRedTag[]> => {
    const res = await apiClient.get('/duplicates/red-tags', { params });
    return Array.isArray(res.data) ? res.data : [];
  },
  findDuplicateLocations: async (params: { name: string; orgNodeId?: string }): Promise<DuplicateLocation[]> => {
    const res = await apiClient.get('/duplicates/locations', { params });
    return Array.isArray(res.data) ? res.data : [];
  },
  getOnboardingChecklist: async (): Promise<OnboardingChecklist> => {
    const res = await apiClient.get('/onboarding/checklist');
    return res.data;
  },

  // --- Bulk imports: users, questions, standards, actions ---
  getImportCatalogue: async (): Promise<ImportCatalogueEntry[]> => {
    const res = await apiClient.get('/imports/catalogue');
    return Array.isArray(res.data) ? res.data : [];
  },
  /** Downloads an import template through the authenticated client; errors carry a Blob body. */
  downloadImportTemplate: async (kind: string): Promise<Blob> => {
    const res = await apiClient.get(`/imports/template/${encodeURIComponent(kind)}`, { responseType: 'blob' });
    return res.data;
  },
  bulkImportDryRunFile: async (kind: string, file: File): Promise<DryRunResult> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post(`/imports/${encodeURIComponent(kind)}/dry-run`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  bulkImportDryRunRows: async (kind: string, rows: Record<string, string>[]): Promise<DryRunResult> => {
    const res = await apiClient.post(`/imports/${encodeURIComponent(kind)}/dry-run`, { rows });
    return res.data;
  },
  bulkImportCommit: async (kind: string, rows: Record<string, string>[]): Promise<BulkImportCommitResult> => {
    const res = await apiClient.post(`/imports/${encodeURIComponent(kind)}/commit`, { rows });
    return res.data;
  },
  // --- Integrations: API keys (plan feature API_ACCESS) and webhooks (plan feature WEBHOOKS); org admins only ---
  getApiKeys: async (): Promise<ApiKeyRecord[]> => {
    const res = await apiClient.get('/api-keys');
    return Array.isArray(res.data) ? res.data : [];
  },
  /** The returned `key` is shown once and can never be read again. */
  createApiKey: async (data: CreateApiKeyPayload): Promise<CreatedApiKey> => {
    const res = await apiClient.post('/api-keys', data);
    return res.data;
  },
  revokeApiKey: async (id: string): Promise<{ id: string; revoked: boolean }> => {
    const res = await apiClient.delete(`/api-keys/${encodeURIComponent(id)}`);
    return res.data;
  },
  getWebhooks: async (): Promise<WebhookEndpoint[]> => {
    const res = await apiClient.get('/webhooks');
    return Array.isArray(res.data) ? res.data : [];
  },
  getWebhookEvents: async (): Promise<string[]> => {
    const res = await apiClient.get('/webhooks/events');
    return Array.isArray(res.data?.events) ? res.data.events : [];
  },
  /** The returned `secret` is shown once. */
  createWebhook: async (data: CreateWebhookPayload): Promise<CreatedWebhook> => {
    const res = await apiClient.post('/webhooks', data);
    return res.data;
  },
  updateWebhook: async (id: string, data: UpdateWebhookPayload): Promise<WebhookEndpoint> => {
    const res = await apiClient.patch(`/webhooks/${encodeURIComponent(id)}`, data);
    return res.data;
  },
  deleteWebhook: async (id: string): Promise<{ id: string; deleted: boolean }> => {
    const res = await apiClient.delete(`/webhooks/${encodeURIComponent(id)}`);
    return res.data;
  },
  rotateWebhookSecret: async (id: string): Promise<WebhookSecretResponse> => {
    const res = await apiClient.post(`/webhooks/${encodeURIComponent(id)}/rotate-secret`);
    return res.data;
  },
  testWebhook: async (id: string): Promise<WebhookTestResult | null> => {
    const res = await apiClient.post(`/webhooks/${encodeURIComponent(id)}/test`);
    return res.data ?? null;
  },
  getWebhookDeliveries: async (id: string): Promise<WebhookDelivery[]> => {
    const res = await apiClient.get(`/webhooks/${encodeURIComponent(id)}/deliveries`);
    return Array.isArray(res.data) ? res.data : [];
  },
  retryWebhookDelivery: async (deliveryId: string): Promise<{ id: string; status: string }> => {
    const res = await apiClient.post(`/webhooks/deliveries/${encodeURIComponent(deliveryId)}/retry`);
    return res.data;
  },
};
