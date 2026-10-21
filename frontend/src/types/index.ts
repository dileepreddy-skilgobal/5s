export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'CANCELLED';
  logoUrl?: string;
  industry: string;
  subscriptionTier?: string;
  storageQuotaMb: number;
  storageUsedMb: number;
  /** Subscription fields (plans & billing); maintained in the platform console. */
  planId?: string | null;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  billingEmail?: string | null;
  hierarchyConfig?: string;
  settings?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    users: number;
    locations: number;
    orgNodes: number;
  };
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  phone?: string;
  jobTitle?: string;
  department?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'INVITED';
  isSuperAdmin: boolean;
  badgeId?: string | null;
  lastLoginAt?: string | null;
  /** Whether the user has two-factor authentication turned on (GET /users). */
  mfaEnabled?: boolean;
  createdAt: string;
  assignments?: {
    id: string;
    role: Role;
    orgNodeId?: string | null;
    validUntil?: string | null;
  }[];
}

export interface Role {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description?: string;
  isSystemDefault: boolean;
  permissions?: Permission[];
  _count?: {
    assignments: number;
  };
}

export interface Permission {
  id: string;
  tenantId: string;
  roleId: string;
  module: string;
  actions: string; // JSON array string
  scope: string;
}

export interface OrgNode {
  id: string;
  tenantId: string;
  parentId?: string | null;
  name: string;
  code: string;
  nodeType:
    | 'ENTERPRISE'
    | 'PLANT'
    | 'DIVISION'
    | 'DEPARTMENT'
    | 'SUB_DEPARTMENT'
    | 'PRODUCTION_LINE'
    | 'WORK_CELL'
    | 'BAY_STATION'
    | 'STORAGE_RACK'
    | 'WORKBENCH'
    | 'SUB_SECTION'
    | 'QUARANTINE_ZONE'
    | string;
  path: string;
  depth: number;
  sortOrder: number;
  status: string;
  qrCodeData?: string | null;
  parent?: {
    id: string;
    name: string;
    code: string;
    nodeType: string;
  };
  children?: OrgNode[];
  locations?: Location[];
  _count?: {
    locations: number;
    children: number;
  };
}

export interface CreateOrgNodePayload {
  name: string;
  code: string;
  nodeType: string;
  parentId?: string | null;
  sortOrder?: number;
  autoCreateLocation?: boolean;
  locationType?: string;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  auditFrequency?: 'DAILY' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'QUARTERLY';
  building?: string;
  floor?: string;
  description?: string;
  ownerId?: string;
}

export interface OrgTreeNode {
  id: string;
  name: string;
  code: string;
  nodeType: string;
  path: string;
  depth: number;
  sortOrder: number;
  status: string;
  parentId: string | null;
  children: OrgTreeNode[];
  locationCount: number;
  qrCodeData?: string | null;
}

export interface LocationTimeline {
  id: string;
  tenantId: string;
  locationId: string;
  milestoneName: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  progressPercent: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED';
  notes?: string;
  createdAt: string;
}

export interface LocationDocument {
  id: string;
  tenantId: string;
  locationId: string;
  title: string;
  docType: 'SOP' | 'CLEANING_STANDARD' | 'LAYOUT_MAP' | 'SAFETY_GUIDELINE' | 'OTHER';
  fileUrl: string;
  /** 0 for links to documents stored elsewhere. */
  fileSizeKb: number;
  version: string;
  uploadedById?: string | null;
  createdAt: string;
}

export interface LocationAuditLog {
  id: string;
  tenantId: string;
  locationId: string;
  userId?: string;
  actionType: string;
  details: string; // JSON string or plain narrative
  ipAddress?: string;
  createdAt: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    jobTitle?: string;
    department?: string;
  };
}

export interface Location {
  id: string;
  tenantId: string;
  orgNodeId: string;
  areaCode: string;
  name: string;
  locationType: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  auditFrequency: 'DAILY' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'QUARTERLY';
  building?: string;
  floor?: string;
  description?: string;
  heroPhotoUrl?: string;
  qrCodeData?: string;
  qrPngDataUrl?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'UNDER_MAINTENANCE';
  ownerId?: string;
  backupOwnerId?: string;
  createdAt: string;
  updatedAt: string;
  orgNode?: OrgNode;
  owner?: User;
  backupOwner?: User;
  timelines?: LocationTimeline[];
  documents?: LocationDocument[];
  auditLogs?: LocationAuditLog[];
}

export interface ImportError {
  rowNumber: number;
  field: string;
  value: any;
  message: string;
}

export interface DryRunResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: ImportError[];
  parsedData: any[];
  /** Plan limit message (users import) when the batch would exceed the plan. */
  limitWarning?: string;
}

// ==========================================
// STANDARDS, TEMPLATES & SCHEDULES INTERFACES
// ==========================================

export interface ReferencePhoto {
  type: 'STANDARD_CONDITION' | 'CURRENT_CONDITION';
  photoUrl: string;
  label?: string;
  description?: string;
}

export interface StandardRevision {
  id: string;
  standardId: string;
  revisionNumber: string;
  description: string;
  rules: string[];
  referencePhotos: ReferencePhoto[];
  videoUrl?: string | null;
  sopDocumentUrl?: string | null;
  effectiveDate: string;
  revisionComments?: string | null;
  authorId?: string | null;
  approvedById?: string | null;
  approvedAt?: string | null;
  approvalComments?: string | null;
  rejectedAt?: string | null;
  rejectedById?: string | null;
  rejectionReason?: string | null;
  isCurrent: boolean;
  createdAt: string;
  author?: { id: string; firstName: string; lastName: string; email?: string };
  approver?: { id: string; firstName: string; lastName: string; email?: string };
}

export interface Standard {
  id: string;
  tenantId: string;
  code: string;
  title: string;
  category: 'S1_SORT' | 'S2_SET_IN_ORDER' | 'S3_SHINE' | 'S4_STANDARDIZE' | 'S5_SUSTAIN' | 'S6_SAFETY';
  scopeType: 'GLOBAL' | 'PLANT' | 'DEPARTMENT' | 'LOCATION_TYPE' | 'SPECIFIC_LOCATION';
  targetOrgNodeId?: string | null;
  targetLocationId?: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  targetOrgNode?: OrgNode | null;
  targetLocation?: Location | null;
  revisions?: StandardRevision[];
  currentRevision?: StandardRevision | null;
}

export interface QuestionOption {
  label: string;
  score: number;
}

export interface AuditTemplateQuestion {
  id: string;
  sectionId: string;
  questionCode: string;
  questionText: string;
  description?: string | null;
  guidance?: string | null;
  standardId?: string | null;
  questionType:
    | 'YES_NO'
    | 'PASS_FAIL'
    | 'NUMERIC_0_5'
    | 'NUMERIC_0_10'
    | 'PERCENTAGE'
    | 'MULTIPLE_CHOICE'
    | 'TEXT'
    | 'PHOTO'
    | 'CHECKLIST'
    | 'NOT_APPLICABLE';
  options?: QuestionOption[] | null;
  weightage: number;
  severity: 'MINOR' | 'MODERATE' | 'MAJOR' | 'CRITICAL';
  isCritical: boolean;
  scoreCapOnFail?: number | null;
  requireEvidenceOnScoreBelow?: number | null;
  mandatoryEvidence: boolean;
  referencePhotoUrl?: string | null;
  sortOrder: number;
  standard?: { id: string; code: string; title: string } | null;
}

export interface AuditTemplateSection {
  id: string;
  templateVersionId: string;
  title: string;
  description?: string | null;
  category: 'S1_SORT' | 'S2_SET_IN_ORDER' | 'S3_SHINE' | 'S4_STANDARDIZE' | 'S5_SUSTAIN' | 'S6_SAFETY';
  sortOrder: number;
  questions: AuditTemplateQuestion[];
  _count?: { questions: number };
}

export interface AuditTemplateVersion {
  id: string;
  templateId: string;
  versionNumber: string;
  changeSummary?: string | null;
  isPublished: boolean;
  publishedAt: string;
  publishedById?: string | null;
  createdAt: string;
  publisher?: { id: string; firstName: string; lastName: string } | null;
  sections: AuditTemplateSection[];
}

export interface AuditTemplate {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description?: string | null;
  auditType: 'ROUTINE' | 'SELF' | 'LAYERED' | 'CROSS_FUNCTIONAL' | 'MANAGEMENT' | 'SURPRISE' | 'CERTIFICATION' | 'CAMPAIGN';
  categoryScoringModel: { [category: string]: number };
  status: 'DRAFT' | 'ACTIVE' | 'DEPRECATED';
  /** Newest version (may be a draft). */
  latestVersion?: AuditTemplateVersion | null;
  hasPublishedVersion?: boolean;
  createdAt: string;
  updatedAt: string;
  versions?: AuditTemplateVersion[];
  currentVersion?: AuditTemplateVersion | null;
  totalQuestions?: number;
  versionCount?: number;
}

export interface ScheduledAuditInstance {
  id: string;
  tenantId: string;
  scheduleId?: string | null;
  auditCode: string;
  templateVersionId: string;
  locationId: string;
  auditorId?: string | null;
  auditType: string;
  plannedDate: string;
  dueDate: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'SUBMITTED' | 'OVERDUE' | 'CANCELLED';
  score?: number | null;
  notes?: string | null;
  location?: Location;
  auditor?: User | null;
  templateVersion?: {
    id: string;
    versionNumber: string;
    template: { id: string; name: string; code: string };
  };
}

export interface AuditSchedule {
  id: string;
  tenantId: string;
  scheduleCode: string;
  title: string;
  templateId: string;
  templateVersionId: string;
  auditType: string;
  targetType: 'ALL_AREAS' | 'PLANT' | 'DEPARTMENT' | 'SPECIFIC_LOCATIONS';
  targetOrgNodeId?: string | null;
  targetLocationIds: string[];
  recurrence: 'ONCE' | 'DAILY' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | 'CUSTOM_DAYS';
  recurrenceIntervalDays: number;
  preferredAuditorId?: string | null;
  rotationRule: 'ASSIGNED_AUDITOR' | 'DEPT_INDEPENDENCE' | 'ROUND_ROBIN' | 'RANDOM';
  startDate: string;
  endDate?: string | null;
  leadTimeDays: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  template?: AuditTemplate;
  templateVersion?: AuditTemplateVersion;
  preferredAuditor?: User | null;
  generatedInstances?: ScheduledAuditInstance[];
  _count?: { generatedInstances: number };
}

// ==========================================
// OPERATIONAL AUDIT EXECUTION INTERFACES
// ==========================================

export interface AuditAnswer {
  id: string;
  executionId: string;
  questionId: string;
  sectionId: string;
  score: number;
  maxScore: number;
  status: 'CONFORMING' | 'MINOR_NC' | 'MAJOR_NC' | 'CRITICAL_FAIL' | 'NOT_APPLICABLE';
  notes?: string | null;
  evidenceUrls: (string | { photoUrl: string; label?: string; annotationData?: any })[];
  voiceNoteUrl?: string | null;
  /** Finding severity the auditor chose; null means the question's default. */
  findingSeverity?: string | null;
  question?: AuditTemplateQuestion;
  createdAt: string;
}

export interface AuditExecution {
  id: string;
  tenantId: string;
  auditInstanceId?: string | null;
  locationId: string;
  templateId: string;
  templateVersionId: string;
  auditorId?: string | null;
  auditCode: string;
  auditType: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'DISPUTED' | 'VERIFIED' | 'REJECTED';
  startedAt: string;
  completedAt?: string | null;
  overallScore: number;
  maxPossibleScore: number;
  earnedScore: number;
  pillarScores: { [pillar: string]: number };
  isPassed: boolean;
  criticalFailureCount: number;
  summaryNotes?: string | null;
  auditorSignature?: string | null;
  auditorName?: string | null;

  // Area Owner Acknowledgement & Formal Sign-off
  acknowledgedAt?: string | null;
  acknowledgedById?: string | null;
  acknowledgedByName?: string | null;
  acknowledgementSignature?: string | null;
  acknowledgementNotes?: string | null;
  targetResolutionDate?: string | null;

  // Dispute & Contestation Workflow
  disputeStatus?: 'NONE' | 'DISPUTED' | 'RESOLVED_ACCEPTED' | 'RESOLVED_REJECTED' | null;
  disputedAt?: string | null;
  disputedById?: string | null;
  disputedByName?: string | null;
  disputeReason?: string | null;
  disputeNotes?: string | null;
  disputedQuestionIds?: string | string[] | null;
  counterEvidenceUrls?: string | string[] | null;
  disputeResolutionNotes?: string | null;
  disputeResolvedAt?: string | null;
  disputeResolvedById?: string | null;
  disputeResolvedByName?: string | null;

  location?: Location;
  template?: AuditTemplate;
  templateVersion?: AuditTemplateVersion;
  auditor?: User | null;
  answers?: AuditAnswer[];
  observations?: Observation[];
  _count?: { answers: number; observations: number };
}

export interface AcknowledgeAuditPayload {
  /** Ignored by the server, which records the signed-in user. */
  acknowledgedByName?: string;
  acknowledgedById?: string;
  acknowledgementSignature?: string;
  acknowledgementNotes: string;
  targetResolutionDate?: string;
}

export interface DisputeAuditPayload {
  /** Ignored by the server, which records the signed-in user. */
  disputedByName?: string;
  disputedById?: string;
  disputeReason: string;
  disputeNotes: string;
  disputedQuestionIds?: string[];
  counterEvidenceUrls?: string[];
}

export interface ResolveDisputePayload {
  decision: 'ACCEPT_DISPUTE' | 'REJECT_DISPUTE';
  resolutionNotes: string;
  resolvedByName?: string;
  adjustedScore?: number;
}

// ==========================================
// OBSERVATION & ABNORMALITY INTERFACES
// ==========================================

export interface PhotoAnnotation {
  type: 'circle' | 'arrow' | 'box' | 'text';
  x?: number;
  y?: number;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  width?: number;
  height?: number;
  radius?: number;
  color: string;
  text?: string;
}

export interface Observation {
  id: string;
  tenantId: string;
  observationCode: string;
  executionId?: string | null;
  answerId?: string | null;
  locationId: string;
  category: 'S1_SORT' | 'S2_SET_IN_ORDER' | 'S3_SHINE' | 'S4_STANDARDIZE' | 'S5_SUSTAIN' | 'S6_SAFETY';
  severity: 'MINOR' | 'MODERATE' | 'MAJOR' | 'CRITICAL' | 'KAIZEN_OPPORTUNITY';
  title: string;
  description: string;
  beforePhotoUrl?: string | null;
  annotatedPhotoUrl?: string | null;
  annotationData?: PhotoAnnotation[] | string | null;
  status: 'OPEN' | 'ACTION_ASSIGNED' | 'IN_PROGRESS' | 'PENDING_VERIFICATION' | 'RESOLVED' | 'CLOSED';
  riskAssessment?: string | null;
  tags: string[];
  loggedById?: string | null;
  location?: Location;
  loggedBy?: User | null;
  correctiveAction?: CorrectiveAction | null;
  execution?: { id: string; auditCode: string; startedAt: string; overallScore: number } | null;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// CORRECTIVE & PREVENTIVE ACTION (CAPA) INTERFACES
// ==========================================

export interface FiveWhyAnalysis {
  why1?: string;
  why2?: string;
  why3?: string;
  why4?: string;
  why5?: string;
  rootCause?: string;
  rootCauseConclusion?: string;
  solution?: string;
  preventiveAction?: string;
  verificationCriteria?: string;
}

export interface ActionHistoryLog {
  id: string;
  actionId: string;
  actorId?: string | null;
  actorName?: string | null;
  fromStatus: string;
  toStatus: string;
  comment?: string | null;
  createdAt: string;
}

export interface CorrectiveAction {
  id: string;
  tenantId: string;
  actionCode: string;
  observationId: string;
  locationId: string;
  title: string;
  description: string;
  actionType: 'CORRECTIVE' | 'PREVENTIVE' | 'KAIZEN';
  rootCauseCategory: 'MANPOWER' | 'METHOD' | 'MACHINE' | 'MATERIAL' | 'MEASUREMENT' | 'ENVIRONMENT';
  fiveWhyAnalysis: FiveWhyAnalysis;
  assigneeId?: string | null;
  assignedById?: string | null;
  targetDate: string;
  slaHours: number;
  isOverdue: boolean;
  escalationTier: 'NORMAL' | 'DUE_SOON' | 'ESCALATED_L1' | 'ESCALATED_L2' | 'ESCALATED_L3';
  /** Where the action came from: an audit finding, a shop-floor observation, a red tag or a management review. */
  source?: 'AUDIT' | 'OBSERVATION' | 'RED_TAG' | 'MANAGEMENT_REVIEW';
  redTagId?: string | null;
  status: 'PENDING_ACKNOWLEDGEMENT' | 'ASSIGNED' | 'IN_PROGRESS' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'CLOSED' | 'REOPENED';
  /** Workflow steps the signed-in user may take on this action (computed by the server's own checks). */
  allowedActions?: Array<'EDIT' | 'START' | 'ANALYSE' | 'SUBMIT_CLOSURE' | 'VERIFY' | 'CLOSE' | 'DELETE' | 'REASSIGN' | 'RESCHEDULE'>;
  closureNotes?: string | null;
  afterPhotoUrl?: string | null;
  closureSubmittedAt?: string | null;
  verifiedById?: string | null;
  verifiedAt?: string | null;
  verificationNotes?: string | null;
  /** Effectiveness review completed (VERIFIED -> CLOSED). */
  closedAt?: string | null;
  closedById?: string | null;
  /** Latest effectiveness review; kept when the action was reopened because the fix did not hold. */
  effectivenessReview?: string | null;
  reopenCount: number;
  location?: Location;
  assignee?: User | null;
  assignedBy?: User | null;
  verifiedBy?: User | null;
  observation?: Observation;
  history?: ActionHistoryLog[];
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// RED TAG MANAGEMENT INTERFACES
// ==========================================

export type RedTagDisposition =
  | 'DISPOSE_SCRAP'
  | 'RELOCATE'
  | 'REUSE'
  | 'RETURN_TO_VENDOR'
  | 'AUCTION_SELL'
  | 'REPAIR_RESTORE'
  | 'KEEP_JUSTIFIED';

/** Closing a tag with one of these dispositions keeps the item in service (status RETURNED, not DISPOSED). */
export const KEEP_IN_SERVICE_DISPOSITIONS: readonly RedTagDisposition[] = ['RELOCATE', 'REUSE', 'REPAIR_RESTORE', 'KEEP_JUSTIFIED'];

export interface RedTag {
  id: string;
  tenantId: string;
  tagNumber: string;
  qrCodeUrl?: string | null;
  locationId: string;
  targetHoldingAreaId?: string | null;
  itemName: string;
  itemDescription?: string | null;
  category: 'UNNEEDED_TOOL' | 'SURPLUS_INVENTORY' | 'BROKEN_EQUIPMENT' | 'SCRAP_WASTE' | 'UNLABELLED_MATERIAL' | 'EXPIRED_ITEM' | 'OTHER';
  quantity: number;
  unitOfMeasure: 'PCS' | 'KG' | 'BOXES' | 'PALLETS' | 'SETS';
  estimatedValue?: number | null;
  taggedById?: string | null;
  taggedDate: string;
  reason: string;
  photoUrl?: string | null;
  status: 'RED_TAGGED' | 'IN_HOLDING_AREA' | 'PENDING_DISPOSITION' | 'DISPOSITION_APPROVED' | 'DISPOSED' | 'RETURNED' | 'CANCELLED';
  dispositionAction?: RedTagDisposition | null;
  dispositionJustification?: string | null;
  targetDispositionDate?: string | null;
  actualDispositionDate?: string | null;
  disposedById?: string | null;
  supervisorApprovedById?: string | null;
  financialRecovered?: number | null;
  closurePhotoUrl?: string | null;
  ageingDays: number;
  ageingTier: '0_7_DAYS' | '8_14_DAYS' | '15_30_DAYS' | 'OVER_30_DAYS';
  location?: Location;
  holdingArea?: Location | null;
  taggedBy?: User | null;
  supervisorApprovedBy?: User | null;
  createdAt: string;
  updatedAt: string;
  actualDispositionAction?: string | null;
  dispositionRejectionReason?: string | null;
}

export interface ZoneRedTagMetrics {
  locationId: string;
  locationName: string;
  areaCode: string;
  building?: string | null;
  totalTags: number;
  activeTags: number;
  inHolding: number;
  pendingDisposition: number;
  disposed: number;
  overdueCount: number;
  totalValue: number;
  recoveredValue: number;
}

export interface RedTagMetrics {
  totalTags: number;
  inHolding: number;
  pendingDisposition: number;
  disposed: number;
  overdueCount: number;
  totalValue: number;
  recoveredValue: number;
  ageingDistribution: {
    under7Days: number;
    days8To14: number;
    days15To30: number;
    over30Days: number;
  };
  zoneBreakdown?: ZoneRedTagMetrics[];
}

export interface PillarBreakdownItem {
  pillar: string;
  name: string;
  /** null when no audits in the period */
  score: number | null;
  target: number;
  status: 'TARGET_MET' | 'ON_TRACK' | 'ATTENTION_NEEDED' | 'PRIORITY_FOCUS' | 'NO_DATA';
  color: string;
}

/** Scores are null for months without completed audits. */
export interface MonthlyTrendItem {
  month: string;
  audits: number;
  overall: number | null;
  sort: number | null;
  order: number | null;
  shine: number | null;
  standardize: number | null;
  sustain: number | null;
  safety: number | null;
}

export interface AnalyticsPeriod {
  from: string;
  to: string;
  label: string;
}

export interface MaturityOverview {
  timeframe: string;
  period: AnalyticsPeriod;
  overallScore: number | null;
  targetScore: number;
  scoreDelta: string;
  level: {
    number: number;
    name: string;
    description: string;
    badgeColor: string;
  } | null;
  kpis: {
    totalLocations: number;
    totalAuditsCompleted: number;
    auditComplianceRate: number | null;
    openAbnormalities: number;
    safetyIndex: number | null;
  };
  pillarBreakdown: PillarBreakdownItem[];
  monthlyTrends: MonthlyTrendItem[];
}

export type PillarKey = 'S1_SORT' | 'S2_SET_IN_ORDER' | 'S3_SHINE' | 'S4_STANDARDIZE' | 'S5_SUSTAIN' | 'S6_SAFETY';
export type PillarScores = Record<PillarKey, number | null>;

export interface HeatmapRow {
  id: string;
  areaCode: string;
  name: string;
  building: string;
  department: string;
  plant: string;
  orgNodeId: string;
  /** null when the area has never been audited */
  overallScore: number | null;
  pillars: PillarScores;
  lastAuditDate: string | null;
  lastAuditor: string | null;
  lastAuditId: string | null;
  openCapaCount: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface HeatmapData {
  pillars: Array<{ key: string; label: string; sub: string }>;
  rows: HeatmapRow[];
}

export interface ChampionItem {
  rank: number;
  id: string;
  name: string;
  areaCode: string;
  department: string;
  overallScore: number;
  /** Consecutive passing audits ending with the latest one */
  passingAuditStreak: number;
  badge: string;
}

export interface AttentionItem {
  rank: number;
  id: string;
  name: string;
  areaCode: string;
  department: string;
  overallScore: number | null;
  openCapaCount: number;
  weakestPillar: string | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface LeaderboardData {
  champions: ChampionItem[];
  attentionRequired: AttentionItem[];
}

// --- Management KPIs, drill-down, benchmarking, certification ---
export interface AnalyticsKpis {
  period: AnalyticsPeriod;
  fiveSScore: number | null;
  previousPeriodScore: number | null;
  scoreChange: number | null;
  targetScore: number;
  pillarScores: PillarScores;
  maturity: { level: number; name: string; description: string; minScore: number; color: string } | null;
  audits: { completed: number; scheduledDue: number; scheduledCompleted: number; adherencePercent: number | null };
  actions: {
    open: number;
    overdue: number;
    overduePercent: number | null;
    closedInPeriod: number;
    onTimeClosurePercent: number | null;
    averageClosureDays: number | null;
  };
  observations: {
    total: number;
    repeat: number;
    repeatPercent: number | null;
    critical: number;
    openCritical: number;
    byCategory: Record<string, number>;
  };
  redTags: {
    pending: number;
    pendingEstimatedValue: number;
    ageing: { days0to7: number; days8to14: number; days15to30: number; over30: number };
  };
  locations: { total: number; audited: number };
}

export interface DrilldownAggregate {
  score: number | null;
  locationCount: number;
  auditedCount: number;
  openActions: number;
}

export interface DrilldownData {
  node: ({ id: string; name: string; nodeType: string } & DrilldownAggregate) | null;
  breadcrumb: Array<{ id: string; name: string; nodeType: string }>;
  children: Array<{ id: string; name: string; code: string; nodeType: string } & DrilldownAggregate>;
  locations: Array<{ id: string; areaCode: string; name: string; score: number | null; lastAuditDate: string | null; openCapaCount: number }>;
}

export interface BenchmarkRow {
  /** null when the group has no audits in the period */
  rank: number | null;
  key: string;
  name: string;
  score: number | null;
  audits: number;
  locations: number;
  openActions: number;
  observations: number;
  repeatPercent: number | null;
}

export interface LocationAuditDrilldown {
  location: { id: string; name: string; areaCode: string };
  audits: Array<{
    id: string;
    auditCode: string;
    status: string;
    overallScore: number;
    completedAt: string;
    auditorName: string | null;
    observations: Array<{ id: string; observationCode: string; title: string; severity: string; status: string; category: string; isRepeat: boolean }>;
  }>;
}

export type CertificationLevel = 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE';

export interface CertificationData {
  windowMonths: number;
  rules: Array<{
    name: CertificationLevel;
    minAverageScore: number;
    maxRepeatRate: number | null;
    minOnTimeClosure: number | null;
    minAdherence: number | null;
    sustainedAudits: number;
  }>;
  summary: Record<CertificationLevel | 'NONE', number>;
  locations: Array<{
    locationId: string;
    areaCode: string;
    name: string;
    department: string;
    certification: CertificationLevel | null;
    averageScore: number | null;
    auditsInWindow: number;
    repeatPercent: number | null;
    onTimeClosurePercent: number | null;
    adherencePercent: number | null;
  }>;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle: string;
  department: string;
  roleCode?: string;
  employeeId?: string;
  phone?: string;
  avatarUrl?: string;
  isSuperAdmin: boolean;
  /** Personal UI language (BCP 47, e.g. "hi"); null = follow the organization default. */
  locale?: string | null;
  primaryRole: string;
  roles: Array<{
    code: string;
    name: string;
    description?: string;
    permissions: Array<{ module: string; actions: string[]; scope: string }>;
  }>;
}

export interface AuthResponse {
  success: boolean;
  authMethod: string;
  accessToken: string;
  user: AuthUser;
  tenant: Tenant;
  expiresInSeconds: number;
  /** Whether the user has two-factor authentication turned on. */
  mfaEnabled?: boolean;
  /** Organization policy requires this administrator to enrol in MFA before using anything else. */
  mfaEnrollmentRequired?: boolean;
}

/** Second sign-in step: returned by /auth/login and /auth/pin-login instead of a session when MFA is on. */
export interface MfaChallengeResponse {
  success?: boolean;
  mfaRequired: true;
  mfaToken: string;
  expiresInSeconds: number;
}

export type LoginResult = AuthResponse | MfaChallengeResponse;

export interface MfaVerifyPayload {
  mfaToken: string;
  code?: string;
  recoveryCode?: string;
}

export interface MfaStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
  /** Organization policy requires this user to keep MFA on. */
  required: boolean;
}

export interface MfaSetupResponse {
  secret: string;
  otpauthUri: string;
  qrCodeDataUrl: string;
}

export interface RecoveryCodesResponse {
  recoveryCodes: string[];
  message?: string;
}

/** A signed-in device (server-side session). */
export interface AuthSession {
  id: string;
  authMethod: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  current: boolean;
}

export interface StorageUsage {
  driver: string;
  files: number;
  usedBytes: number;
  quotaBytes: number;
  usedPercent: number | null;
}

// --- Training certificates (courses, progress and the quiz are typed in services/trainingApi.ts) ---
export type TrainingCertificateStatus = 'VALID' | 'EXPIRED' | 'REVOKED';

export interface TrainingCertificate {
  /** Public certificate code, e.g. CERT-5S-8A4F21C0 (used in URLs and for revocation). */
  certificateId: string;
  userId: string;
  traineeName: string;
  traineeEmail: string;
  tenantId: string;
  scorePercent: number;
  issueDate: string;
  validUntil: string;
  credentialTitle: string;
  status: TrainingCertificateStatus;
  /** When the certificate was revoked (null unless REVOKED). */
  revokedAt?: string | null;
  verificationUrl: string;
  /** Configured in organization settings; may be empty. */
  authorizedSignatures: Array<{ name: string; title: string }>;
}

// --- 5S Gamification, Trophies & Recognition (derived from real activity) ---
export interface GamificationSeason {
  from: string;
  to: string;
}

export interface GamificationLevel {
  levelNumber: number;
  title: string;
  badgeColor: string;
  /** null at the top level */
  nextLevelTitle: string | null;
  pointsToNextLevel: number | null;
  progressPercent: number;
}

export interface PointsBreakdownItem {
  rule: string;
  label: string;
  count: number;
  points: number;
}

export interface GamificationUserStats {
  currentPoints: number;
  currentLevel: GamificationLevel;
  /** Best run of consecutive passing audits across owned areas; null when the user owns no area */
  passingAuditStreak: number | null;
  /** null until the user has earned points this season */
  plantRank: number | null;
  totalParticipants: number;
  kpis: {
    auditsConducted: number;
    actionsClosedOnTime: number;
    observationsReported: number;
    redTagsRaised: number;
    kudosReceived: number;
    floatingTrophiesHeld: number;
  };
  pointsBreakdown: PointsBreakdownItem[];
}

export interface PointRuleItem {
  action: string;
  points: string;
  category: string;
}

export interface GamificationOverview {
  season: GamificationSeason;
  userStats: GamificationUserStats;
  pointRulesQuickGuide: PointRuleItem[];
  /** Points a kudos gives its recipient. */
  kudosPoints: number;
}

export interface WorkstationLeaderboardItem {
  rank: number;
  id: string;
  name: string;
  areaCode: string;
  department: string;
  areaOwner: string | null;
  points: number;
  overallScore: number | null;
  passingAuditStreak: number;
  trophyBadge: string | null;
  /** Percent of corrective actions verified on time this season */
  capaClosureRate: number | null;
  trend: 'UP' | 'DOWN' | 'STABLE' | null;
  overdueActions: number;
}

export interface DepartmentLeaderboardItem {
  rank: number;
  department: string;
  avgScore: number | null;
  totalPoints: number;
  activeTrophies: number;
  /** Audit adherence percent this season */
  complianceRate: number | null;
}

export interface IndividualChampionItem {
  rank: number;
  userId: string;
  name: string;
  role: string;
  department: string;
  points: number;
  badgesCount: number;
  tier: string;
}

export interface MostImprovedArea {
  locationId: string;
  areaName: string;
  department: string;
  previousScore: number;
  currentScore: number;
  delta: number;
}

export interface TopContributor {
  userId: string;
  name: string;
  department: string;
  count: number;
}

export interface GamificationLeaderboards {
  season: GamificationSeason;
  workstationsLeaderboard: WorkstationLeaderboardItem[];
  departmentLeaderboard: DepartmentLeaderboardItem[];
  individualChampions: IndividualChampionItem[];
  mostImproved: MostImprovedArea | null;
  bestAuditor: TopContributor | null;
  topRedTagContributor: TopContributor | null;
  zeroOverdueAreas: Array<{ id: string; name: string; areaCode: string; department: string }>;
}

export type TrophyKey = 'GOLDEN_BROOM' | 'PLANT_EXCELLENCE' | 'KAIZEN_SHIELD' | 'SAFETY_VANGUARD';

export interface FloatingTrophyHolder {
  locationId: string;
  locationName: string;
  areaCode: string;
  department: string;
  teamLead: string | null;
  heldSince: string;
  retentionStreakDays: number;
  averageScore: number | null;
}

export interface TrophyContender {
  locationId: string;
  locationName: string;
  areaCode: string;
  department: string;
  /** The value the trophy ranks on (e.g. 3S average, on-time actions) */
  metric: number;
}

export interface FloatingTrophy {
  id: TrophyKey;
  title: string;
  subtitle: string;
  iconType: 'BROOM' | 'CUP' | 'SHIELD' | 'STAR';
  tier: 'GOLD' | 'PLATINUM' | 'SILVER' | 'BRONZE';
  evaluationPeriod: 'MONTHLY' | 'QUARTERLY';
  currentHolder: FloatingTrophyHolder | null;
  /** Best-qualifying area against the trophy criteria right now */
  suggestedContender: TrophyContender | null;
  criteria: string[];
  nextEvaluationDate: string;
  totalPastHolders: number;
}

export interface TrophyHallOfFameItem {
  id: string;
  trophyId: TrophyKey;
  trophyTitle: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  /** ISO timestamp. */
  awardedDate: string;
  winningLocation: string;
  department: string;
  teamLead: string | null;
  auditScore: number | null;
  citation: string;
}

export type KudosCategory = '5S_EXCELLENCE' | 'TEAMWORK' | 'CLEAN_STREAK' | 'RAPID_CAPA' | 'SAFETY_FIRST' | 'KAIZEN_INNOVATION';

export interface KudosItem {
  id: string;
  fromUserId: string;
  fromUser: string;
  toUserId: string;
  toUser: string;
  category: KudosCategory;
  message: string;
  points: number;
  createdAt: string;
}

export interface TrophiesAndAwardsData {
  floatingTrophies: FloatingTrophy[];
  hallOfFame: TrophyHallOfFameItem[];
  kudosFeed: KudosItem[];
}

export interface AchievementBadge {
  id: string;
  title: string;
  category: 'SUSTAIN' | 'SPEED' | 'SORT' | 'SAFETY' | 'AUDIT' | 'OBSERVATION' | 'RECOGNITION';
  tier: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  icon: string;
  description: string;
  unlocked: boolean;
  unlockedDate: string | null;
  progress: {
    current: number;
    target: number;
    percent: number;
  };
}

export interface BadgesAndMilestonesData {
  badges: AchievementBadge[];
  unlockedCount: number;
  totalBadges: number;
}





// --- Activity trail ---
export type ActivityOutcome = 'SUCCESS' | 'FAILURE';

/** A single field change recorded by the server: value before and after the action. */
export interface ActivityFieldChange {
  from: unknown;
  to: unknown;
}

export interface ActivityLogChanges {
  diff?: Record<string, ActivityFieldChange>;
  /** Sanitized request payload; secrets arrive as "[REDACTED]" and long values as "[N characters]". */
  request?: unknown;
  method?: string;
  identifier?: string;
}

export interface ActivityLogEntry {
  id: string;
  sequence: number;
  createdAt: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  outcome: ActivityOutcome;
  statusCode: number | null;
  summary: string;
  changes: ActivityLogChanges | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ActivityLogPage {
  items: ActivityLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ActivityLogQuery {
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  outcome?: ActivityOutcome;
  /** ISO date-time lower bound (inclusive). */
  from?: string;
  /** ISO date-time upper bound (inclusive). */
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ActivityLogFilters {
  actions: string[];
  entityTypes: string[];
}

export interface ActivityChainVerification {
  valid: boolean;
  entriesChecked: number;
  brokenAtSequence: number | null;
  problem: string | null;
}

// --- Organization settings ---
export type AuditFrequency = 'DAILY' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'QUARTERLY';
export type ScoringMethod = 'POOLED' | 'PILLAR_WEIGHTED';
export type SettingsSeverity = 'CRITICAL' | 'MAJOR' | 'MODERATE' | 'MINOR' | 'KAIZEN_OPPORTUNITY';
export type EscalationRecipient = 'ASSIGNEE' | 'AREA_OWNER' | 'BACKUP_OWNER' | 'AUDITOR' | 'COORDINATOR_5S' | 'DEPT_HEAD' | 'PLANT_HEAD' | 'ORG_ADMIN';
// CertificationLevel is defined with the certification analytics types above
export type TermKey = 'location' | 'observation' | 'correctiveAction' | 'redTag' | 'audit' | 'auditor' | 'areaOwner';
export type NumberingKey = 'audit' | 'scheduledAudit' | 'observation' | 'action' | 'redTag';

export interface SettingsMaturityBand {
  level: number;
  name: string;
  description: string;
  /** Minimum average audit score (percent) for this level. */
  minScore: number;
  color: string;
}

export interface SettingsCertificationRule {
  name: CertificationLevel;
  minAverageScore: number;
  /** null = not assessed */
  maxRepeatRate: number | null;
  minOnTimeClosure: number | null;
  minAdherence: number | null;
  sustainedAudits: number;
}

export interface AnalyticsSettings {
  targetScore: number;
  passScore: number;
  repeatLookbackDays: number;
  certificationWindowMonths: number;
  maturityBands: SettingsMaturityBand[];
  certificationRules: SettingsCertificationRule[];
}

export interface ScoringSettings {
  method: ScoringMethod;
  criticalFailCap: number;
  findingThresholdPercent: number;
}

export interface SlaSettings {
  hoursBySeverity: Record<SettingsSeverity, number>;
}

export interface EscalationStep {
  /** Days relative to the due date: negative = before, 0 = on the day, positive = overdue by. */
  offsetDays: number;
  notify: EscalationRecipient[];
}

export interface EscalationSettings {
  actionSteps: EscalationStep[];
  overdueAuditNotify: EscalationRecipient[];
  dailyDigest: boolean;
}

export type NumberingSettings = Record<NumberingKey, string>;
export type TerminologySettings = Record<TermKey, string>;

export interface CompetencySettings {
  requireCertifiedAuditors: boolean;
  quizPassPercent: number;
  certificateValidityMonths: number;
  certificateTitle: string;
  signatories: Array<{ name: string; title: string }>;
}

/** Effective configuration (platform defaults merged with the organization's overrides). */
export interface TenantSettings {
  brandColor: string;
  /** Default UI language for users who have not chosen one (BCP 47, e.g. en, hi). */
  defaultLocale?: string;
  defaultAuditFrequency: AuditFrequency | string;
  analytics: AnalyticsSettings;
  scoring: ScoringSettings;
  sla: SlaSettings;
  escalation: EscalationSettings;
  numbering: NumberingSettings;
  terminology: TerminologySettings;
  competency: CompetencySettings;
  security: SecuritySettings;
}

export interface SecuritySettings {
  /** Organization administrators must use TOTP two-factor authentication. */
  requireMfaForAdmins: boolean;
}

/** GET /settings also returns the organization hierarchy level names. */
export interface OrganizationSettings extends TenantSettings {
  hierarchyLevels: string[];
}

/** PATCH /settings: any subset; nested objects merge key by key, arrays replace. */
export interface UpdateSettingsPayload {
  brandColor?: string;
  defaultLocale?: string;
  defaultAuditFrequency?: string;
  hierarchyLevels?: string[];
  analytics?: Partial<AnalyticsSettings>;
  scoring?: Partial<ScoringSettings>;
  sla?: { hoursBySeverity: Partial<Record<SettingsSeverity, number>> };
  escalation?: Partial<EscalationSettings>;
  numbering?: Partial<NumberingSettings>;
  terminology?: Partial<TerminologySettings>;
  competency?: Partial<CompetencySettings>;
  security?: Partial<SecuritySettings>;
}

// ==========================================
// NOTIFICATIONS
// ==========================================

export type NotificationType =
  | 'ACTION_ASSIGNED'
  | 'ACTION_DUE_SOON'
  | 'ACTION_DUE'
  | 'ACTION_OVERDUE'
  | 'ACTION_SUBMITTED'
  | 'ACTION_VERIFIED'
  | 'ACTION_REOPENED'
  | 'ACTION_CLOSED'
  | 'AUDIT_SUBMITTED'
  | 'AUDIT_DISPUTED'
  | 'AUDIT_ACKNOWLEDGED'
  | 'AUDIT_DISPUTE_RESOLVED'
  | 'AUDIT_ASSIGNED'
  | 'AUDIT_OVERDUE'
  | 'RED_TAG_APPROVAL_NEEDED'
  | 'KUDOS_RECEIVED'
  | 'TROPHY_AWARDED'
  | 'DAILY_DIGEST'
  | 'AUDIT_DUE_SOON'
  | 'OBSERVATION_CRITICAL'
  | 'RED_TAG_OVERDUE'
  | 'CERTIFICATE_EXPIRING'
  | 'MANAGER_DIGEST'
  | 'TRIAL_ENDING';

export interface AppNotification {
  id: string;
  /** One of NotificationType; kept open so new server types still render. */
  type: NotificationType | string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  /** App path such as "/capa?id=..." (may include a query string), or null. */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: AppNotification[];
  total: number;
  unread: number;
  page: number;
  pageSize: number;
}

export interface NotificationQuery {
  unreadOnly?: boolean;
  page?: number;
  /** Max 100. */
  pageSize?: number;
}

export interface NotificationPreferences {
  emailNotifications: boolean;
  pushNotifications: boolean;
}

// ==========================================
// REPORTS & EXPORT
// ==========================================

export type ReportColumnType = 'text' | 'number' | 'date' | 'datetime' | 'percent' | 'boolean';

export type ReportFilterKey =
  | 'from'
  | 'to'
  | 'locationId'
  | 'orgNodeId'
  | 'status'
  | 'severity'
  | 'category'
  | 'assigneeId'
  | 'overdueOnly';

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
  /** Relative width used by the PDF exporter. */
  width: number;
}

export interface ReportRegister {
  key: string;
  title: string;
  description: string;
  /** Label of the date the from/to filters apply to, or null when the register has no date filter. */
  dateFilter: string | null;
  filters: ReportFilterKey[];
  columns: ReportColumn[];
}

export type ReportRow = Record<string, string | number | boolean | null>;

export interface ReportPreview {
  register: string;
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  total: number;
  truncated: boolean;
}

/** Query filters for GET /reports/:key (dates as YYYY-MM-DD). */
export interface ReportFilterValues {
  from?: string;
  to?: string;
  locationId?: string;
  orgNodeId?: string;
  status?: string;
  severity?: string;
  category?: string;
  assigneeId?: string;
  overdueOnly?: boolean;
}

export type ReportExportFormat = 'csv' | 'xlsx' | 'pdf';

// ==========================================
// SUBSCRIPTION, PLANS & PLATFORM CONSOLE
// ==========================================

export type PlanFeatureCode = 'ADVANCED_ANALYTICS' | 'REPORTS_EXPORT' | 'GAMIFICATION' | 'API_ACCESS' | 'WEBHOOKS' | string;
export type ReadOnlyReason = 'TRIAL_EXPIRED' | 'SUBSCRIPTION_LAPSED';
export type TenantSubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'CANCELLED';

export interface SubscriptionPlanInfo {
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  currency: string;
  /** null = unlimited */
  maxUsers: number | null;
  maxLocations: number | null;
  storageQuotaMb: number;
  features: PlanFeatureCode[];
}

export interface UsageMeter {
  used: number;
  /** null = unlimited */
  limit: number | null;
}

/** GET /subscription (organization administrators). */
export interface SubscriptionSummary {
  organization: string;
  status: TenantSubscriptionStatus;
  plan: SubscriptionPlanInfo | null;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  currentPeriodEnd: string | null;
  billingEmail: string | null;
  readOnly: boolean;
  readOnlyReason: ReadOnlyReason | null;
  usage: {
    users: UsageMeter;
    locations: UsageMeter;
    storageMb: UsageMeter;
    auditsThisMonth: number;
  };
  features: { code: PlanFeatureCode; label: string; included: boolean }[];
}

export interface PlatformPlan extends SubscriptionPlanInfo {
  id: string;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
  _count?: { tenants: number };
}

/** GET /platform/plans */
export interface PlatformPlanCatalogue {
  features: { code: PlanFeatureCode; label: string }[];
  plans: PlatformPlan[];
}

export interface PlanPayload {
  code?: string;
  name?: string;
  description?: string;
  priceMonthly?: number;
  currency?: string;
  maxUsers?: number | null;
  maxLocations?: number | null;
  storageQuotaMb?: number;
  features?: string[];
  isActive?: boolean;
  sortOrder?: number;
}

export interface TenantSubscriptionPayload {
  planCode?: string;
  status?: TenantSubscriptionStatus;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  storageQuotaMb?: number;
  billingEmail?: string | null;
}

export interface PlatformTenantRow {
  id: string;
  name: string;
  slug: string;
  status: TenantSubscriptionStatus;
  plan: string | null;
  readOnly: boolean;
  readOnlyReason: ReadOnlyReason | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  users: number;
  activeUsers30d: number;
  audits30d: number;
  locations: number;
  storageMb: number;
  storageQuotaMb: number;
  mrr: number;
  churnRisk: boolean;
  createdAt: string;
}

/** GET /platform/metrics */
export interface PlatformMetrics {
  generatedAt: string;
  totals: { tenants: number; mrr: number; users: number; activeUsers30d: number; audits30d: number; storageMb: number };
  byStatus: Record<string, number>;
  byPlan: Record<string, number>;
  trialsEndingIn14Days: { id: string; name: string; trialEndsAt: string }[];
  readOnlyTenants: { id: string; name: string; reason: ReadOnlyReason | null }[];
  churnRisk: { id: string; name: string; users: number }[];
  tenants: PlatformTenantRow[];
}

// ==========================================
// SEARCH, DUPLICATES & ONBOARDING CHECKLIST
// ==========================================

export type SearchResultType = 'locations' | 'observations' | 'actions' | 'audits' | 'redTags' | 'standards' | 'templates' | 'users' | 'orgUnits';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  link: string;
}

export interface SearchResponse {
  query: string;
  total: number;
  results: SearchResult[];
}

export interface DuplicateObservation {
  id: string;
  observationCode: string;
  title: string;
  category?: string;
  severity?: string;
  status: string;
  createdAt?: string;
  similarity: number;
}

export interface DuplicateRedTag {
  id: string;
  tagNumber: string;
  itemName: string;
  quantity?: number;
  status: string;
  taggedDate?: string;
  similarity: number;
}

export interface DuplicateLocation {
  id: string;
  areaCode: string;
  name: string;
  status: string;
  similarity: number;
}

export interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  done: boolean;
  progress?: number;
  /** Null for steps only an organization admin can complete (adminOnly). */
  link: string | null;
  actionLabel: string | null;
  adminOnly?: boolean;
}

export interface OnboardingChecklist {
  organization?: string;
  completed: number;
  total: number;
  percent: number;
  steps: OnboardingStep[];
}

// ==========================================
// BULK IMPORTS (users, questions, standards, actions)
// ==========================================

export type BulkImportKind = 'locations' | 'users' | 'questions' | 'standards' | 'actions' | string;

export interface ImportColumnDef {
  header: string;
  key: string;
  required: boolean;
  description: string;
  example: string;
}

export interface ImportCatalogueEntry {
  kind: BulkImportKind;
  title: string;
  columns: ImportColumnDef[];
}

export interface BulkImportCommitResult {
  kind?: string;
  created: number;
  invitationsSent?: number;
}

// ==========================================
// INTEGRATIONS (API keys & webhooks)
// ==========================================

/** Roles an API key may act as (backend API_KEY_ROLES). */
export type ApiKeyRole = 'ORG_ADMIN' | 'PLANT_HEAD' | 'COORDINATOR_5S' | 'DEPT_HEAD' | 'AUDITOR' | 'EXTERNAL_AUDITOR';
export type ApiKeyStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface ApiKeyRecord {
  id: string;
  name: string;
  /** First characters of the key, for recognising it; the secret itself is never returned again. */
  prefix: string;
  roleCode: ApiKeyRole | string;
  readOnly: boolean;
  status: ApiKeyStatus | string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreateApiKeyPayload {
  name: string;
  roleCode: ApiKeyRole;
  readOnly: boolean;
  /** ISO date-time in the future; omitted = never expires. */
  expiresAt?: string;
}

/** POST /api-keys: the full key is included in this response only. */
export interface CreatedApiKey extends ApiKeyRecord {
  key: string;
  notice?: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  /** Subscribed event names; "*" = every event. */
  events: string[];
  isActive: boolean;
  consecutiveFailures: number;
  disabledReason: string | null;
  lastDeliveryAt: string | null;
  createdAt: string;
}

export interface CreateWebhookPayload {
  url: string;
  description?: string;
  events: string[];
}

export interface UpdateWebhookPayload {
  url?: string;
  description?: string;
  events?: string[];
  isActive?: boolean;
}

/** POST /webhooks: the signing secret is included in this response only. */
export interface CreatedWebhook extends WebhookEndpoint {
  secret: string;
  notice?: string;
}

export interface WebhookSecretResponse {
  id: string;
  secret: string;
  notice?: string;
}

export type WebhookDeliveryStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface WebhookDelivery {
  id: string;
  event: string;
  status: WebhookDeliveryStatus | string;
  attempts: number;
  nextAttemptAt: string | null;
  responseStatus: number | null;
  error: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

/** POST /webhooks/:id/test: outcome of the signed "ping" sent synchronously. */
export interface WebhookTestResult {
  id?: string;
  status: WebhookDeliveryStatus | string;
  responseStatus: number | null;
  error: string | null;
}
