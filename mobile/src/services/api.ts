import {
  AuditExecution,
  AuditStatus,
  AuditSubmissionPayload,
  AuditTemplateSnapshot,
  FiveSCategory,
  AnnotationShape,
  LocationMaster,
  MediaKind,
  ObservationSeverity,
  QuestionAnswer,
  RedTagRecord,
  TemplateSection,
  TimelineStep,
} from '../types';
import { isPillar } from '../constants/pillars';
import { MAX_RATING } from './auditScoring';
import { apiRequest, uploadFile, UploadedFile } from './http';

// ---------------------------------------------------------------------------
// Server response shapes (only the fields the app reads)
// ---------------------------------------------------------------------------

interface ServerLocation {
  id: string;
  areaCode: string;
  name: string;
  building?: string | null;
  floor?: string | null;
  riskLevel: string;
  status: string;
  qrCodeData?: string | null;
  ownerId?: string | null;
  orgNode?: { name: string } | null;
  owner?: { firstName: string; lastName: string } | null;
}

interface ServerExecution {
  id: string;
  auditCode: string;
  status: string;
  overallScore?: number | null;
  pillarScores?: Record<string, number>;
  startedAt?: string | null;
  completedAt?: string | null;
  acknowledgedAt?: string | null;
  locationId: string;
  templateId: string;
  templateVersionId: string;
  auditInstanceId?: string | null;
  auditorId?: string | null;
  auditorName?: string | null;
  auditor?: { firstName: string; lastName: string } | null;
  location?: { name: string; areaCode: string; building?: string | null } | null;
  template?: { name: string; auditType?: string } | null;
  _count?: { observations?: number };
}

interface ServerInstance {
  id: string;
  auditCode: string;
  status: string;
  plannedDate: string;
  dueDate: string;
  locationId: string;
  auditorId?: string | null;
  templateVersionId: string;
  location?: { name: string; areaCode: string; orgNode?: { name: string } | null } | null;
  auditor?: { firstName: string; lastName: string } | null;
  templateVersion?: { id: string; versionNumber: string; template?: { id: string; name: string; code: string } } | null;
}

interface ServerQuestion {
  id: string;
  sectionId: string;
  questionCode: string;
  questionText: string;
  guidance?: string | null;
  description?: string | null;
  weightage: number;
  isCritical: boolean;
  scoreCapOnFail?: number | null;
  mandatoryEvidence: boolean;
  referencePhotoUrl?: string | null;
  questionType?: string | null;
}

interface ServerTemplateVersion {
  id: string;
  versionNumber: string;
  sections: Array<{ id: string; title: string; category: string; questions: ServerQuestion[] }>;
}

interface ServerTemplate {
  id: string;
  code: string;
  name: string;
  status: string;
  currentVersion?: ServerTemplateVersion | null;
}

interface ServerExecutionDetail extends ServerExecution {
  templateVersion: ServerTemplateVersion;
  template: { id: string; code: string; name: string };
  answers: Array<{ questionId: string; sectionId: string; score: number; maxScore: number; status: string; notes?: string | null }>;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '');
const formatTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined;

const STATUS_MAP: Record<string, { status: AuditStatus; badge: string }> = {
  IN_PROGRESS: { status: 'IN_PROGRESS', badge: 'In progress' },
  SUBMITTED: { status: 'PENDING_REVIEW', badge: 'Awaiting sign-off' },
  DISPUTED: { status: 'PENDING_REVIEW', badge: 'Disputed' },
  ACKNOWLEDGED: { status: 'COMPLETED', badge: 'Completed' },
};

const pillarScoresFrom = (raw?: Record<string, number>): Partial<Record<FiveSCategory, number>> => {
  const out: Partial<Record<FiveSCategory, number>> = {};
  Object.entries(raw || {}).forEach(([k, v]) => {
    if (isPillar(k) && typeof v === 'number') out[k] = Math.round(v);
  });
  return out;
};

const executionTimeline = (e: ServerExecution): TimelineStep[] => [
  { label: 'Started', timestamp: formatTime(e.startedAt), isCompleted: !!e.startedAt, isActive: e.status === 'IN_PROGRESS' },
  {
    label: 'Submitted',
    timestamp: e.completedAt ? formatDate(e.completedAt) : 'Pending',
    isCompleted: !!e.completedAt,
    isActive: e.status === 'SUBMITTED',
  },
  {
    label: e.status === 'DISPUTED' ? 'Disputed' : 'Signed off',
    timestamp: e.acknowledgedAt ? formatDate(e.acknowledgedAt) : 'Pending',
    isCompleted: e.status === 'ACKNOWLEDGED',
    isActive: e.status === 'DISPUTED' || e.status === 'ACKNOWLEDGED',
  },
];

const personName = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}`.trim() : '');

export const mapExecution = (e: ServerExecution): AuditExecution => {
  const mapped = STATUS_MAP[e.status] ?? { status: 'IN_PROGRESS' as AuditStatus, badge: e.status };
  return {
    id: e.id,
    kind: 'EXECUTION',
    serverExecutionId: e.id,
    scheduledInstanceId: e.auditInstanceId ?? undefined,
    trackingNumber: e.auditCode,
    templateId: e.templateId,
    templateVersionId: e.templateVersionId,
    templateTitle: e.template?.name ?? '',
    locationId: e.locationId,
    locationName: e.location?.name ?? '',
    plantName: e.location?.building ?? '',
    auditorId: e.auditorId ?? null,
    auditorName: personName(e.auditor) || e.auditorName || '',
    category: e.location?.areaCode ?? '',
    status: mapped.status,
    statusBadge: mapped.badge,
    overallScore: e.status === 'IN_PROGRESS' ? null : e.overallScore ?? null,
    pillarScores: pillarScoresFrom(e.pillarScores),
    timeline: executionTimeline(e),
    answers: {},
    findingsCount: e._count?.observations ?? 0,
    scheduledDate: formatDate(e.startedAt),
    startedAt: formatTime(e.startedAt),
    completedAt: e.completedAt ?? undefined,
  };
};

const mapInstance = (i: ServerInstance): AuditExecution => ({
  id: `sched:${i.id}`,
  kind: 'SCHEDULED',
  scheduledInstanceId: i.id,
  trackingNumber: i.auditCode,
  templateId: i.templateVersion?.template?.id ?? '',
  templateVersionId: i.templateVersionId,
  templateTitle: i.templateVersion?.template?.name ?? '',
  locationId: i.locationId,
  locationName: i.location?.name ?? '',
  plantName: i.location?.orgNode?.name ?? '',
  auditorId: i.auditorId ?? null,
  auditorName: personName(i.auditor),
  category: i.location?.areaCode ?? '',
  status: 'SCHEDULED',
  statusBadge: 'Scheduled',
  overallScore: null,
  pillarScores: {},
  timeline: [
    { label: 'Planned', timestamp: formatDate(i.plannedDate), isCompleted: true, isActive: false },
    { label: 'Due', timestamp: formatDate(i.dueDate), isCompleted: false, isActive: true },
  ],
  answers: {},
  findingsCount: 0,
  scheduledDate: formatDate(i.plannedDate),
});

const toSnapshot = (template: { id: string; code: string; name: string }, version: ServerTemplateVersion): AuditTemplateSnapshot => ({
  templateId: template.id,
  templateVersionId: version.id,
  code: template.code,
  name: template.name,
  versionNumber: version.versionNumber,
  sections: version.sections
    .filter((s) => isPillar(s.category))
    .map(
      (s): TemplateSection => ({
        id: s.id,
        title: s.title,
        category: s.category as FiveSCategory,
        questions: s.questions.map((q) => ({
          id: q.id,
          sectionId: s.id,
          category: s.category as FiveSCategory,
          code: q.questionCode,
          text: q.questionText,
          guidance: q.guidance || q.description || null,
          weightage: q.weightage,
          isCritical: q.isCritical,
          scoreCapOnFail: q.scoreCapOnFail ?? null,
          mandatoryEvidence: q.mandatoryEvidence,
          referencePhotoUrl: q.referencePhotoUrl ?? null,
          questionType: q.questionType ?? null,
        })),
      }),
    ),
});

const SUBMITTED_STATUSES = new Set(['SUBMITTED', 'DISPUTED', 'ACKNOWLEDGED']);

/** Location health is derived from its latest submitted audit only; never estimated. */
const mapLocation = (l: ServerLocation, executions: ServerExecution[], tenantSlug: string): LocationMaster => {
  const latest = executions
    .filter((e) => e.locationId === l.id && SUBMITTED_STATUSES.has(e.status) && e.completedAt)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0];
  const score = latest?.overallScore ?? null;
  const status: LocationMaster['status'] =
    score === null ? 'NOT_AUDITED' : score >= 85 ? 'OPTIMAL' : score >= 70 ? 'ATTENTION' : 'CRITICAL';

  return {
    id: l.id,
    code: l.areaCode,
    name: l.name,
    plant: l.building || '',
    department: l.orgNode?.name || '',
    workstation: l.floor || '',
    qrCode: l.qrCodeData?.startsWith('5s://') ? l.qrCodeData : `5s://${tenantSlug}/locations/${l.areaCode}`,
    current5SScore: score === null ? null : Math.round(score),
    champion: personName(l.owner) || 'Unassigned',
    ownerId: l.ownerId ?? null,
    lastAuditDate: latest?.completedAt ? formatDate(latest.completedAt) : null,
    status,
    riskLevel: l.riskLevel,
  };
};

// ---------------------------------------------------------------------------
// Observations & notifications
// ---------------------------------------------------------------------------

/** Body of POST /observations. */
export interface CreateObservationBody {
  locationId: string;
  category: FiveSCategory;
  severity: ObservationSeverity;
  title: string;
  description: string;
  beforePhotoUrl?: string;
  annotationData?: AnnotationShape[];
  mediaUrls?: Array<{ url: string; kind: MediaKind; capturedAt?: string; latitude?: number; longitude?: number }>;
  voiceNoteUrl?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAccuracyM?: number;
  clientRequestId?: string;
}

export interface CreatedObservation {
  id: string;
  observationCode: string;
  status: string;
}

/** Open observation at the same location that looks like the one being reported (advisory). */
export interface DuplicateCandidate {
  id: string;
  observationCode: string;
  title: string;
  status: string;
  similarity: number;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: AppNotification[];
  total: number;
  unread: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const ApiService = {
  /** Locations with health derived from real audit results. */
  async getLocations(tenantSlug: string, executions: ServerExecution[]): Promise<LocationMaster[]> {
    const list = await apiRequest<ServerLocation[]>('/locations?status=ACTIVE');
    return list.map((l) => mapLocation(l, executions, tenantSlug));
  },

  getRawExecutions: () => apiRequest<ServerExecution[]>('/audit-executions'),

  getScheduledInstances: () => apiRequest<ServerInstance[]>('/audit-schedules/instances?status=SCHEDULED'),

  mapScheduledInstances: (list: ServerInstance[]) => list.map(mapInstance),

  /** Snapshots of all active templates (current published version with sections and questions). */
  async getTemplateSnapshots(): Promise<AuditTemplateSnapshot[]> {
    const list = await apiRequest<ServerTemplate[]>('/audit-templates?status=ACTIVE');
    const details = await Promise.all(list.map((t) => apiRequest<ServerTemplate>(`/audit-templates/${t.id}`)));
    return details
      .filter((t) => t.currentVersion && t.currentVersion.sections.some((s) => s.questions.length > 0))
      .map((t) => toSnapshot(t, t.currentVersion as ServerTemplateVersion));
  },

  /** Full execution with its exact template version and saved answers (for resuming an audit). */
  async getExecutionForResume(executionId: string): Promise<{ template: AuditTemplateSnapshot; answers: Record<string, QuestionAnswer> }> {
    const d = await apiRequest<ServerExecutionDetail>(`/audit-executions/${executionId}`);
    const template = toSnapshot(d.template, d.templateVersion);
    const categoryByQuestion = new Map(template.sections.flatMap((s) => s.questions.map((q) => [q.id, q] as const)));
    const answers: Record<string, QuestionAnswer> = {};
    for (const a of d.answers) {
      const q = categoryByQuestion.get(a.questionId);
      if (!q) continue;
      const isNa = a.status === 'NOT_APPLICABLE';
      answers[q.id] = {
        questionId: q.id,
        sectionId: q.sectionId,
        category: q.category,
        score: isNa || !q.weightage ? 0 : Math.round(Math.min(MAX_RATING, a.score / q.weightage)),
        isNa,
        comment: a.notes ?? '',
        evidence: [],
      };
    }
    return { template, answers };
  },

  startExecution: (body: { locationId: string; templateId: string; templateVersionId: string; auditInstanceId?: string; auditorName?: string }) =>
    apiRequest<ServerExecution>('/audit-executions/start', { method: 'POST', body }),

  submitExecution: (executionId: string, payload: AuditSubmissionPayload) =>
    apiRequest<ServerExecution>(`/audit-executions/${executionId}/submit`, { method: 'POST', body: payload }),

  createRedTag: (tag: RedTagRecord) =>
    apiRequest<{ id: string; tagNumber: string; status: string }>('/red-tags', {
      method: 'POST',
      body: {
        locationId: tag.areaId,
        itemName: tag.itemName,
        itemDescription: tag.itemDescription || undefined,
        category: tag.category,
        quantity: tag.quantity,
        unitOfMeasure: 'PCS',
        estimatedValue: tag.estimatedValue,
        reason: tag.reason,
        photoUrl: tag.photoDataUrl,
      },
    }),

  /** Uploads a media file (video, audio, extra photos) before it is referenced in a record. */
  uploadMedia: (file: { uri: string; name: string; type: string }): Promise<UploadedFile> => uploadFile(file),

  /** Creates an observation; a retry with the same clientRequestId returns the original. */
  createObservation: (body: CreateObservationBody) =>
    apiRequest<CreatedObservation>('/observations', { method: 'POST', body, timeoutMs: 60000 }),

  findDuplicateObservations: (q: { locationId: string; title: string; category?: string }) => {
    const params = new URLSearchParams({ locationId: q.locationId, title: q.title });
    if (q.category) params.set('category', q.category);
    return apiRequest<DuplicateCandidate[]>(`/duplicates/observations?${params.toString()}`, { timeoutMs: 8000 });
  },

  getNotifications: (page = 1, pageSize = 30, unreadOnly = false) =>
    apiRequest<NotificationPage>(`/notifications?page=${page}&pageSize=${pageSize}${unreadOnly ? '&unreadOnly=true' : ''}`),

  getUnreadNotificationCount: () => apiRequest<{ unread: number }>('/notifications/unread-count', { timeoutMs: 8000 }),

  markNotificationRead: (id: string) => apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),

  markAllNotificationsRead: () => apiRequest<{ marked: number }>('/notifications/read-all', { method: 'POST' }),

  submitRedTagDisposition: (redTagId: string, tag: RedTagRecord) =>
    apiRequest(`/red-tags/${redTagId}/disposition`, {
      method: 'POST',
      body: {
        dispositionAction: tag.disposition,
        dispositionJustification: tag.dispositionJustification || tag.reason,
        supervisorApproved: tag.approveDisposition === true,
      },
    }),
};

export type { ServerExecution };
