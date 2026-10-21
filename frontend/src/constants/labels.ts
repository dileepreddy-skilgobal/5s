/**
 * Display labels and badge colours for the codes the API returns. Use these instead of showing raw
 * codes ("S1_SORT", "PENDING_VERIFICATION") or keeping a private list in each page. The value lists
 * mirror backend/src/core/validation/domain-values.ts.
 */
export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral';

/** "PENDING_VERIFICATION" → "Pending verification" (fallback for codes without a label). */
export const humanize = (code: string | null | undefined): string => {
  if (!code) return '';
  const words = code.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const lookup = (map: Record<string, string>) => (code: string | null | undefined): string => (code ? map[code] ?? humanize(code) : '');

// --- 5S pillars -------------------------------------------------------------
export const PILLARS = ['S1_SORT', 'S2_SET_IN_ORDER', 'S3_SHINE', 'S4_STANDARDIZE', 'S5_SUSTAIN', 'S6_SAFETY'] as const;
export type PillarCode = (typeof PILLARS)[number];
export const PILLAR_LABELS: Record<PillarCode, string> = {
  S1_SORT: '1S Sort',
  S2_SET_IN_ORDER: '2S Set in order',
  S3_SHINE: '3S Shine',
  S4_STANDARDIZE: '4S Standardize',
  S5_SUSTAIN: '5S Sustain',
  S6_SAFETY: 'Safety',
};
export const PILLAR_VARIANT: Record<PillarCode, BadgeVariant> = {
  S1_SORT: 'warning',
  S2_SET_IN_ORDER: 'purple',
  S3_SHINE: 'success',
  S4_STANDARDIZE: 'info',
  S5_SUSTAIN: 'purple',
  S6_SAFETY: 'danger',
};
export const pillarLabel = lookup(PILLAR_LABELS);
export const pillarVariant = (code: string | null | undefined): BadgeVariant => PILLAR_VARIANT[code as PillarCode] ?? 'neutral';

// --- Severities ---------------------------------------------------------------
export const SEVERITY_LABELS: Record<string, string> = {
  MINOR: 'Minor',
  MODERATE: 'Moderate',
  MAJOR: 'Major',
  CRITICAL: 'Critical',
  KAIZEN_OPPORTUNITY: 'Kaizen opportunity',
};
export const severityLabel = lookup(SEVERITY_LABELS);
export const severityVariant = (code: string | null | undefined): BadgeVariant =>
  code === 'CRITICAL' || code === 'MAJOR' ? 'danger' : code === 'MODERATE' ? 'warning' : code === 'KAIZEN_OPPORTUNITY' ? 'purple' : 'info';

// --- Statuses -------------------------------------------------------------------
export const OBSERVATION_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  ACTION_ASSIGNED: 'Action assigned',
  IN_PROGRESS: 'In progress',
  PENDING_VERIFICATION: 'Pending verification',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};
export const observationStatusLabel = lookup(OBSERVATION_STATUS_LABELS);

export const ACTION_STATUS_LABELS: Record<string, string> = {
  PENDING_ACKNOWLEDGEMENT: 'Awaiting audit sign-off',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  PENDING_VERIFICATION: 'Pending verification',
  VERIFIED: 'Verified',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};
export const actionStatusLabel = lookup(ACTION_STATUS_LABELS);
export const actionStatusVariant = (code: string | null | undefined): BadgeVariant =>
  code === 'CLOSED' || code === 'VERIFIED' ? 'success' : code === 'REOPENED' ? 'danger' : code === 'PENDING_VERIFICATION' ? 'purple' : code === 'PENDING_ACKNOWLEDGEMENT' ? 'neutral' : 'warning';
/** Statuses in which an action is still being worked on. */
export const OPEN_ACTION_STATUSES = ['PENDING_ACKNOWLEDGEMENT', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'REOPENED'];

export const AUDIT_STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Awaiting sign-off',
  ACKNOWLEDGED: 'Acknowledged',
  DISPUTED: 'Disputed',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
};
export const auditStatusLabel = lookup(AUDIT_STATUS_LABELS);
export const auditStatusVariant = (code: string | null | undefined): BadgeVariant =>
  code === 'ACKNOWLEDGED' || code === 'VERIFIED' ? 'success' : code === 'DISPUTED' ? 'warning' : code === 'REJECTED' ? 'danger' : code === 'SUBMITTED' ? 'info' : 'neutral';

export const SCHEDULED_AUDIT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  COMPLETED: 'Completed',
  OVERDUE: 'Overdue',
  MISSED: 'Missed',
  CANCELLED: 'Cancelled',
};
export const scheduledAuditStatusLabel = lookup(SCHEDULED_AUDIT_STATUS_LABELS);
export const scheduledAuditStatusVariant = (code: string | null | undefined): BadgeVariant =>
  code === 'COMPLETED' || code === 'SUBMITTED' ? 'success' : code === 'OVERDUE' || code === 'MISSED' ? 'danger' : code === 'IN_PROGRESS' ? 'warning' : code === 'CANCELLED' ? 'neutral' : 'info';

export const RED_TAG_STATUS_LABELS: Record<string, string> = {
  RED_TAGGED: 'Tagged',
  IN_HOLDING_AREA: 'In holding area',
  PENDING_DISPOSITION: 'Awaiting decision',
  DISPOSITION_APPROVED: 'Decision approved',
  DISPOSED: 'Disposed',
  RETURNED: 'Returned to use',
  CANCELLED: 'Cancelled',
};
export const redTagStatusLabel = lookup(RED_TAG_STATUS_LABELS);
export const CLOSED_RED_TAG_STATUSES = ['DISPOSED', 'RETURNED', 'CANCELLED'];

export const RED_TAG_CATEGORY_LABELS: Record<string, string> = {
  UNNEEDED_TOOL: 'Unneeded tool',
  SURPLUS_INVENTORY: 'Surplus inventory',
  BROKEN_EQUIPMENT: 'Broken equipment',
  SCRAP_WASTE: 'Scrap / waste',
  UNLABELLED_MATERIAL: 'Unlabelled material',
  EXPIRED_ITEM: 'Expired item',
  OTHER: 'Other',
  OBSOLETE_EQUIPMENT: 'Obsolete equipment', // older tags
};
export const redTagCategoryLabel = lookup(RED_TAG_CATEGORY_LABELS);

export const DISPOSITION_LABELS: Record<string, string> = {
  DISPOSE_SCRAP: 'Dispose',
  RELOCATE: 'Relocate',
  REUSE: 'Reuse elsewhere',
  RETURN_TO_VENDOR: 'Return to vendor',
  AUCTION_SELL: 'Sell',
  REPAIR_RESTORE: 'Repair',
  KEEP_JUSTIFIED: 'Keep (justified)',
  SCRAP_RECYCLE: 'Scrap',
};
export const dispositionLabel = lookup(DISPOSITION_LABELS);

// --- Master data ------------------------------------------------------------------
export const LOCATION_TYPE_LABELS: Record<string, string> = {
  PRODUCTION_LINE: 'Production line',
  WAREHOUSE_BAY: 'Warehouse bay',
  OFFICE_FLOOR: 'Office',
  LABORATORY: 'Laboratory',
  RED_TAG_ZONE: 'Red-tag zone',
  WORKSHOP: 'Workshop',
  UTILITY: 'Utility',
};
export const locationTypeLabel = lookup(LOCATION_TYPE_LABELS);

export const RISK_LABELS: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' };
export const riskLabel = lookup(RISK_LABELS);
export const riskVariant = (code: string | null | undefined): BadgeVariant =>
  code === 'CRITICAL' ? 'danger' : code === 'HIGH' ? 'warning' : code === 'MEDIUM' ? 'info' : 'success';

export const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  FORTNIGHTLY: 'Fortnightly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUALLY: 'Annually',
};
export const frequencyLabel = lookup(FREQUENCY_LABELS);

export const LOCATION_STATUS_LABELS: Record<string, string> = { ACTIVE: 'Active', INACTIVE: 'Inactive', UNDER_MAINTENANCE: 'Under maintenance' };
export const locationStatusLabel = lookup(LOCATION_STATUS_LABELS);

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  SOP: 'SOP',
  CLEANING_STANDARD: 'Cleaning schedule',
  LAYOUT_MAP: 'Layout map',
  SAFETY_GUIDELINE: 'Safety guideline',
  OTHER: 'Other',
};
export const documentTypeLabel = lookup(DOCUMENT_TYPE_LABELS);

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  YES_NO: 'Yes / No',
  PASS_FAIL: 'Pass / Fail',
  NUMERIC_0_5: 'Score 0–5',
  NUMERIC_0_10: 'Score 0–10',
  PERCENTAGE: 'Percentage',
  MULTIPLE_CHOICE: 'Multiple choice',
  TEXT: 'Text',
  PHOTO: 'Photo',
  CHECKLIST: 'Checklist',
  NOT_APPLICABLE: 'Not applicable',
};
export const questionTypeLabel = lookup(QUESTION_TYPE_LABELS);

// --- Platform ------------------------------------------------------------------------
export const TENANT_STATUS_LABELS: Record<string, string> = { ACTIVE: 'Active', TRIAL: 'Trial', SUSPENDED: 'Suspended', CANCELLED: 'Cancelled' };
export const tenantStatusLabel = lookup(TENANT_STATUS_LABELS);
export const tenantStatusVariant = (code: string | null | undefined): BadgeVariant =>
  code === 'ACTIVE' ? 'success' : code === 'TRIAL' ? 'info' : code === 'SUSPENDED' ? 'warning' : 'neutral';

export const CERTIFICATION_LEVEL_LABELS: Record<string, string> = { BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', PLATINUM: 'Platinum', NONE: 'Not certified' };
export const certificationLevelLabel = lookup(CERTIFICATION_LEVEL_LABELS);
