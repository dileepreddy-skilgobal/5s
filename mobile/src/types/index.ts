/** 5S(+Safety) pillar codes, identical to the backend values. */
export type FiveSCategory = 'S1_SORT' | 'S2_SET_IN_ORDER' | 'S3_SHINE' | 'S4_STANDARDIZE' | 'S5_SUSTAIN' | 'S6_SAFETY';

/**
 * Mobile-facing audit lifecycle:
 * SCHEDULED (planned, not started) → IN_PROGRESS → PENDING_REVIEW (submitted / disputed, awaiting
 * area-owner sign-off) → COMPLETED (acknowledged).
 */
export type AuditStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'COMPLETED';

/** Finding severity as recorded against an answer; mapped to the backend answer status on submit. */
export type SeverityLevel = 'MINOR' | 'MODERATE' | 'MAJOR' | 'CRITICAL';

/** Backend answer status values. */
export type AnswerStatus = 'CONFORMING' | 'MINOR_NC' | 'MAJOR_NC' | 'CRITICAL_FAIL' | 'NOT_APPLICABLE';

/** Red-tag disposition actions, identical to the backend values. */
export type DispositionType =
  | 'DISPOSE_SCRAP'
  | 'RELOCATE'
  | 'REUSE'
  | 'RETURN_TO_VENDOR'
  | 'AUCTION_SELL'
  | 'REPAIR_RESTORE'
  | 'KEEP_JUSTIFIED';

/** Red-tag categories, identical to the backend values. */
export type RedTagCategory =
  | 'UNNEEDED_TOOL'
  | 'SURPLUS_INVENTORY'
  | 'BROKEN_EQUIPMENT'
  | 'SCRAP_WASTE'
  | 'UNLABELLED_MATERIAL'
  | 'EXPIRED_ITEM'
  | 'OTHER';

export interface TimelineStep {
  label: string;
  timestamp?: string;
  isCompleted: boolean;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Audit templates (snapshot of a published template version, cached for offline use)
// ---------------------------------------------------------------------------

export interface TemplateQuestion {
  id: string;
  sectionId: string;
  category: FiveSCategory;
  code: string;
  text: string;
  guidance?: string | null;
  weightage: number;
  isCritical: boolean;
  /** Score cap (percent) applied to the whole audit when this critical question fails. */
  scoreCapOnFail?: number | null;
  mandatoryEvidence: boolean;
  referencePhotoUrl?: string | null;
  /** Template question type (YES_NO, PASS_FAIL, NUMERIC_0_5, …). Missing on templates cached by older app versions. */
  questionType?: string | null;
}

export interface TemplateSection {
  id: string;
  title: string;
  category: FiveSCategory;
  questions: TemplateQuestion[];
}

export interface AuditTemplateSnapshot {
  templateId: string;
  templateVersionId: string;
  code: string;
  name: string;
  versionNumber: string;
  sections: TemplateSection[];
}

// ---------------------------------------------------------------------------
// Audit execution
// ---------------------------------------------------------------------------

/**
 * A shape drawn on an evidence photo. With `unit: 'pct'` ALL geometry is a percentage of the photo
 * (the server only burns pct shapes into the image):
 * - `x, y`: top-left for a box, centre for a circle, anchor (top-left of the label) for text
 * - `width, height`: percent of the image width / height (box)
 * - `radius`: percent of the image WIDTH (circle)
 * - `fromX, fromY, toX, toY`: arrow tail and tip
 * Shapes saved by earlier builds have no `unit` (box size / circle radius in canvas pixels).
 */
export interface PhotoAnnotation {
  id: string;
  type: 'arrow' | 'box' | 'circle' | 'text';
  unit?: 'pct';
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
  radius?: number;
  width?: number;
  height?: number;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  text?: string;
  color?: string;
}

export interface EvidencePhoto {
  id: string;
  /** Local file URI used for display on the device. */
  uri: string;
  /** Compressed JPEG data URL sent to the server (photos are stored inline by the API). */
  dataUrl?: string;
  timestamp: string;
  annotations: PhotoAnnotation[];
  caption?: string;
}

/** A non-conformance raised against a question; the server turns it into an observation + CAPA. */
export interface AnswerFinding {
  severity: SeverityLevel;
  description: string;
}

export interface QuestionAnswer {
  questionId: string;
  sectionId: string;
  category: FiveSCategory;
  /** Raw rating 0–5 (weighted by the question weightage when submitted). */
  score: number;
  isNa: boolean;
  comment: string;
  evidence: EvidencePhoto[];
  finding?: AnswerFinding;
}

export interface AuditExecution {
  /** Stable local identifier: server execution id, `sched:<instanceId>` or `local:<uuid>`. */
  id: string;
  /** Where this record comes from: a planned (not started) audit, a server execution or an offline draft. */
  kind: 'SCHEDULED' | 'EXECUTION' | 'LOCAL_DRAFT';
  serverExecutionId?: string;
  scheduledInstanceId?: string;
  trackingNumber: string;
  templateId: string;
  templateVersionId: string;
  templateTitle: string;
  locationId: string;
  locationName: string;
  plantName: string;
  auditorId: string | null;
  auditorName: string;
  category: string;
  status: AuditStatus;
  statusBadge: string;
  /** Final or live score in percent; null when not yet scored. */
  overallScore: number | null;
  pillarScores: Partial<Record<FiveSCategory, number>>;
  timeline: TimelineStep[];
  answers: Record<string, QuestionAnswer>;
  findingsCount: number;
  auditorSignature?: string;
  scheduledDate: string;
  startedAt?: string;
  completedAt?: string;
  isOfflineSyncPending?: boolean;
}

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------

export interface RedTagRecord {
  id: string;
  tagNumber: string;
  areaId: string;
  areaName: string;
  itemName: string;
  itemDescription?: string;
  category: RedTagCategory;
  quantity: number;
  reason: string;
  taggedBy: string;
  tagDate: string;
  disposition?: DispositionType;
  dispositionJustification?: string;
  /** Supervisor approves the proposed disposition immediately (supervisor roles only). */
  approveDisposition?: boolean;
  photoUri?: string;
  photoDataUrl?: string;
  estimatedValue?: number;
  status: 'PENDING_SYNC' | 'ACTIVE' | 'DISPOSED' | 'CLOSED';
}

export interface LocationMaster {
  id: string;
  /** Area code, e.g. LOC-BLR-MACH-CNC01. */
  code: string;
  name: string;
  plant: string;
  department: string;
  workstation: string;
  /** Payload encoded in the location's QR code. */
  qrCode: string;
  /** Latest submitted audit score; null when the area has not been audited. */
  current5SScore: number | null;
  champion: string;
  ownerId: string | null;
  lastAuditDate: string | null;
  status: 'OPTIMAL' | 'ATTENTION' | 'CRITICAL' | 'NOT_AUDITED';
  riskLevel: string;
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  roleName: string;
  tenantId: string;
  tenantName: string;
  plantName: string;
}

export interface TenantProfile {
  id: string;
  name: string;
  slug: string;
  industry: string;
  status: string;
  plantName: string;
  defaultAuditFrequency: string;
}

// ---------------------------------------------------------------------------
// Offline sync
// ---------------------------------------------------------------------------

/** Annotation as sent to the server (drawing fields only). */
export type AnnotationShape = Omit<PhotoAnnotation, 'id'>;

/** Evidence sent with an answer: a photo URL, or a photo with pct shapes the server burns into a copy. */
export type EvidenceSubmission = string | { photoUrl: string; annotations: AnnotationShape[] };

export interface AuditSubmissionPayload {
  answers: Array<{
    questionId: string;
    sectionId: string;
    score: number;
    maxScore: number;
    status: AnswerStatus;
    notes?: string;
    evidenceUrls: EvidenceSubmission[];
  }>;
  summaryNotes?: string;
  auditorSignature: string;
  auditorName: string;
  completedAt: string;
}

// ---------------------------------------------------------------------------
// Observations (abnormality reports)
// ---------------------------------------------------------------------------

/** Observation severity, identical to the backend values. */
export type ObservationSeverity = 'MINOR' | 'MODERATE' | 'MAJOR' | 'CRITICAL' | 'KAIZEN_OPPORTUNITY';

export type MediaKind = 'PHOTO' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';

/** A media file kept on the device until it has been uploaded with POST /files. */
export interface LocalMedia {
  id: string;
  kind: MediaKind;
  /** File in the app's document directory (native) or a blob/data URI (web preview). */
  localUri: string;
  mimeType: string;
  fileName: string;
  capturedAt?: string;
  durationSec?: number;
  latitude?: number;
  longitude?: number;
  /** Server file URL once uploaded (persisted so a retry does not upload again). */
  uploadedUrl?: string;
}

export interface GpsFix {
  latitude: number;
  longitude: number;
  accuracyM?: number;
}

/** Everything needed to create an observation; stored in the sync queue until it is sent. */
export interface ObservationDraft {
  locationId: string;
  locationName: string;
  category: FiveSCategory;
  severity: ObservationSeverity;
  title: string;
  description: string;
  /** Main ("before") photo with percent-based shapes the server burns into an annotated copy. */
  photo?: LocalMedia & { annotations: PhotoAnnotation[] };
  /** Additional photos / videos (max 10). */
  media: LocalMedia[];
  voiceNote?: LocalMedia;
  gps?: GpsFix;
}

export type SyncItem =
  | {
      id: string;
      type: 'AUDIT_SUBMIT';
      userId: string;
      createdAt: string;
      attempts: number;
      lastError?: string;
      /** PENDING items are retried automatically; FAILED items were rejected by the server and need attention. */
      state: 'PENDING' | 'FAILED';
      label: string;
      localAuditId: string;
      serverExecutionId?: string;
      start: { locationId: string; templateId: string; templateVersionId: string; auditInstanceId?: string };
      submit: AuditSubmissionPayload;
    }
  | {
      id: string;
      type: 'RED_TAG_CREATE';
      userId: string;
      createdAt: string;
      attempts: number;
      lastError?: string;
      state: 'PENDING' | 'FAILED';
      label: string;
      /** Set once the tag exists on the server (so a retry only repeats the disposition step). */
      serverRedTagId?: string;
      tag: RedTagRecord;
    }
  | {
      id: string;
      type: 'OBSERVATION_CREATE';
      userId: string;
      createdAt: string;
      attempts: number;
      lastError?: string;
      state: 'PENDING' | 'FAILED';
      label: string;
      /** Idempotency key generated when the user tapped Submit; a retry returns the original observation. */
      clientRequestId: string;
      observation: ObservationDraft;
    };

export type BootstrapStep =
  | 'STORAGE_INIT'
  | 'TENANT_VALIDATION'
  | 'CONNECTIVITY_CHECK'
  | 'MASTER_DATA_HYDRATION'
  | 'READY'
  | 'ERROR';

export interface BootstrapState {
  step: BootstrapStep;
  progress: number; // 0 to 100
  title: string;
  description: string;
  isReady: boolean;
  isOfflineMode: boolean;
  error?: string;
  deviceType: 'phone' | 'tablet' | 'desktop';
  orientation: 'portrait' | 'landscape';
}
