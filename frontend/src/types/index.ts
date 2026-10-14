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
  createdAt: string;
  assignments?: {
    id: string;
    role: Role;
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
  fileSizeKb: number;
  version: string;
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
  acknowledgedByName: string;
  acknowledgedById?: string;
  acknowledgementSignature?: string;
  acknowledgementNotes: string;
  targetResolutionDate?: string;
}

export interface DisputeAuditPayload {
  disputedByName: string;
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
  escalationTier: 'NORMAL' | 'DUE_SOON' | 'ESCALATED_L1' | 'ESCALATED_L2';
  status: 'PENDING_ACKNOWLEDGEMENT' | 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'CLOSED' | 'REOPENED';
  closureNotes?: string | null;
  afterPhotoUrl?: string | null;
  closureSubmittedAt?: string | null;
  verifiedById?: string | null;
  verifiedAt?: string | null;
  verificationNotes?: string | null;
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
  dispositionAction?: 'DISPOSE_SCRAP' | 'RELOCATE' | 'RETURN_TO_VENDOR' | 'AUCTION_SELL' | 'REPAIR_RESTORE' | 'KEEP_JUSTIFIED' | null;
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
  score: number;
  target: number;
  status: 'TARGET_MET' | 'ON_TRACK' | 'ATTENTION_NEEDED' | 'PRIORITY_FOCUS';
  color: string;
}

export interface MonthlyTrendItem {
  month: string;
  overall: number;
  sort: number;
  order: number;
  shine: number;
  standardize: number;
  sustain: number;
  safety: number;
}

export interface MaturityOverview {
  timeframe: string;
  overallScore: number;
  targetScore: number;
  scoreDelta: string;
  level: {
    number: number;
    name: string;
    description: string;
    badgeColor: string;
  };
  kpis: {
    totalLocations: number;
    totalAuditsCompleted: number;
    auditComplianceRate: number;
    openAbnormalities: number;
    safetyIndex: number;
  };
  pillarBreakdown: PillarBreakdownItem[];
  monthlyTrends: MonthlyTrendItem[];
}

export interface HeatmapRow {
  id: string;
  areaCode: string;
  name: string;
  building: string;
  department: string;
  overallScore: number;
  pillars: {
    S1_SORT: number;
    S2_SET_IN_ORDER: number;
    S3_SHINE: number;
    S4_STANDARDIZE: number;
    S5_SUSTAIN: number;
    S6_SAFETY: number;
  };
  lastAuditDate: string;
  lastAuditor: string;
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
  streakDays: number;
  badge: string;
}

export interface AttentionItem {
  rank: number;
  id: string;
  name: string;
  areaCode: string;
  department: string;
  overallScore: number;
  openCapaCount: number;
  weakestPillar: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface LeaderboardData {
  champions: ChampionItem[];
  attentionRequired: AttentionItem[];
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
  primaryRole: string;
  roles: Array<{
    code: string;
    name: string;
    description?: string;
    permissions: Array<{ resource: string; action: string }>;
  }>;
}

export interface AuthResponse {
  success: boolean;
  authMethod: string;
  accessToken: string;
  user: AuthUser;
  tenant: Tenant;
  expiresInSeconds: number;
}

// --- 5S Training Academy & Quiz ---
export interface TrainingChapter {
  time: string;
  title: string;
  description: string;
}

export interface TrainingCourse {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: 'FOUNDATIONS' | 'AUDITING' | 'RCA_CAPA' | 'RED_TAG';
  durationMinutes: number;
  videoUrl: string;
  thumbnailUrl: string;
  badgeText: string;
  chapters: TrainingChapter[];
  keyTakeaways: string[];
  jobAidTitle: string;
  jobAidUrl: string;
}

export interface QuizQuestion {
  id: string;
  category: '1S' | '2S' | '3S' | '4S' | '5S' | 'AUDIT' | 'CAPA' | 'SAFETY' | 'RED_TAG';
  question: string;
  scenario?: string;
  options: string[];
  explanation?: string;
  points: number;
}

export interface QuizQuestionResult {
  questionId: string;
  question: string;
  selectedAnswer: number;
  correctAnswer: number;
  isCorrect: boolean;
  explanation: string;
}

export interface TrainingCertificate {
  certificateId: string;
  traineeName: string;
  traineeEmail: string;
  tenantId: string;
  scorePercent: number;
  issueDate: string;
  validUntil: string;
  credentialTitle: string;
  verificationUrl: string;
  authorizedSignatures: Array<{ name: string; title: string }>;
}

export interface QuizSubmissionResult {
  passed: boolean;
  percentage: number;
  score: number;
  maxScore: number;
  correctCount: number;
  totalQuestions: number;
  results: QuizQuestionResult[];
  certificate?: TrainingCertificate | null;
}

// --- 5S Gamification, Trophies & Recognition ---
export interface GamificationLevel {
  levelNumber: number;
  title: string;
  badgeColor: string;
  nextLevelTitle: string;
  pointsToNextLevel: number;
  progressPercent: number;
}

export interface GamificationUserStats {
  currentPoints: number;
  currentLevel: GamificationLevel;
  cleanStreakDays: number;
  plantRank: number;
  totalParticipants: number;
  kpis: {
    capasClearedUnder24h: number;
    auditsPassedAbove90: number;
    kaizenIdeasSubmitted: number;
    floatingTrophiesHeld: number;
  };
}

export interface GamificationActiveChallenge {
  title: string;
  deadline: string;
  description: string;
  bonusPoints: number;
  rewardBadge: string;
  currentProgressPercent: number;
}

export interface PointRuleItem {
  action: string;
  points: string;
  category: string;
}

export interface GamificationOverview {
  userStats: GamificationUserStats;
  activeChallenge: GamificationActiveChallenge;
  pointRulesQuickGuide: PointRuleItem[];
}

export interface WorkstationLeaderboardItem {
  rank: number;
  id: string;
  name: string;
  areaCode: string;
  department: string;
  areaOwner: string;
  points: number;
  overallScore: number;
  streakDays: number;
  trophyBadge: string | null;
  capaClosureRate: string;
  trend: 'UP' | 'DOWN' | 'STABLE';
}

export interface DepartmentLeaderboardItem {
  rank: number;
  department: string;
  avgScore: number;
  totalPoints: number;
  activeTrophies: number;
  complianceRate: string;
}

export interface IndividualChampionItem {
  rank: number;
  name: string;
  role: string;
  department: string;
  points: number;
  badgesCount: number;
  tier: string;
}

export interface MostImprovedArea {
  areaName: string;
  department: string;
  previousScore: number;
  currentScore: number;
  deltaPercent: string;
  keyAchievement: string;
  turnaroundBonusPoints: number;
}

export interface GamificationLeaderboards {
  workstationsLeaderboard: WorkstationLeaderboardItem[];
  departmentLeaderboard: DepartmentLeaderboardItem[];
  individualChampions: IndividualChampionItem[];
  mostImproved: MostImprovedArea;
}

export interface FloatingTrophyHolder {
  locationId: string;
  locationName: string;
  areaCode: string;
  department: string;
  teamLead: string;
  heldSince: string;
  retentionStreakDays: number;
  averageScore: number;
}

export interface FloatingTrophy {
  id: string;
  title: string;
  subtitle: string;
  iconType: 'BROOM' | 'CUP' | 'SHIELD' | 'STAR';
  tier: 'GOLD' | 'PLATINUM' | 'SILVER' | 'BRONZE';
  evaluationPeriod: 'BI_WEEKLY' | 'MONTHLY' | 'QUARTERLY';
  currentHolder: FloatingTrophyHolder;
  criteria: string[];
  nextEvaluationDate: string;
  totalPastHolders: number;
}

export interface TrophyHallOfFameItem {
  id: string;
  trophyId: string;
  trophyTitle: string;
  period: string;
  awardedDate: string;
  winningLocation: string;
  department: string;
  teamLead: string;
  teamMembers: string[];
  auditScore: number;
  citation: string;
}

export interface KudosItem {
  id: string;
  fromUser: string;
  toUser: string;
  category: string;
  message: string;
  points: number;
  timestamp: string;
}

export interface TrophiesAndAwardsData {
  floatingTrophies: FloatingTrophy[];
  hallOfFame: TrophyHallOfFameItem[];
  kudosFeed: KudosItem[];
}

export interface AchievementBadge {
  id: string;
  title: string;
  category: 'SUSTAIN' | 'SPEED' | 'SORT' | 'SAFETY' | 'INNOVATION' | 'AUDIT';
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
  xpReward: number;
}

export interface BadgesAndMilestonesData {
  badges: AchievementBadge[];
  unlockedCount: number;
  totalBadges: number;
}




