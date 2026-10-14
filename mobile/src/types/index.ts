export type FiveSCategory = 'S1' | 'S2' | 'S3' | 'S4' | 'S5';

export type AuditStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'COMPLETED';

export type SeverityLevel = 'MINOR' | 'MODERATE' | 'MAJOR' | 'CRITICAL';

export type DispositionType =
  | 'KEEP'
  | 'RELOCATE'
  | 'REPAIR'
  | 'REUSE'
  | 'RETURN'
  | 'SELL'
  | 'SCRAP'
  | 'DISPOSE';

export interface TimelineStep {
  label: string;
  timestamp?: string;
  isCompleted: boolean;
  isActive: boolean;
}

export interface FiveSQuestion {
  id: string;
  category: FiveSCategory;
  categoryName: string;
  title: string;
  question: string;
  guidance: string;
  weightage: number;
  isCritical: boolean;
  standardImageUrl?: string;
}

export interface PhotoAnnotation {
  id: string;
  type: 'arrow' | 'box' | 'circle' | 'text';
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
  uri: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
  annotations: PhotoAnnotation[];
  caption?: string;
}

export interface QuestionAnswer {
  questionId: string;
  category: FiveSCategory;
  score: number; // 0 to 5 or binary
  maxScore: number;
  isNa: boolean;
  comment: string;
  evidence: EvidencePhoto[];
  observationCreated?: boolean;
}

export interface Observation {
  id: string;
  auditId: string;
  questionId: string;
  category: FiveSCategory;
  areaId: string;
  areaName: string;
  description: string;
  severity: SeverityLevel;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  assignedTo: string;
  targetDate: string;
  rootCauseCategory?: string;
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'CLOSED';
  evidencePhotos: string[];
}

export interface RedTagRecord {
  id: string;
  tagNumber: string;
  areaId: string;
  areaName: string;
  itemName: string;
  quantity: number;
  reason: string;
  taggedBy: string;
  tagDate: string;
  disposition: DispositionType;
  photoUri?: string;
  estimatedValue?: number;
  targetDate: string;
  status: 'ACTIVE' | 'DISPOSED' | 'CLOSED';
}

export interface LocationMaster {
  id: string;
  code: string;
  name: string;
  plant: string;
  department: string;
  workstation: string;
  qrCode: string;
  current5SScore: number;
  champion: string;
  lastAuditDate: string;
  status: 'OPTIMAL' | 'ATTENTION' | 'CRITICAL';
  expectedItems: { name: string; standardQty: number; currentQty: number }[];
}

export interface AuditExecution {
  id: string;
  trackingNumber: string; // e.g. #AUD-762910
  templateId: string;
  templateTitle: string;
  locationId: string;
  locationName: string;
  plantName: string;
  auditorId: string;
  auditorName: string;
  category: string; // e.g. "Electronics Assembly" or "Tool Crib"
  status: AuditStatus;
  statusBadge: string;
  overallScore: number; // 0 - 100%
  pillarScores: Record<FiveSCategory, number>;
  timeline: TimelineStep[];
  answers: Record<string, QuestionAnswer>;
  observations: Observation[];
  auditorSignature?: string;
  areaOwnerSignature?: string;
  scheduledDate: string;
  startedAt?: string;
  completedAt?: string;
  isOfflineSyncPending?: boolean;
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
  auditsCompletedCount?: number;
  averageScore?: number;
  capasClosedCount?: number;
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

