import { RoleGroups } from '../../core/guards/role-groups';

export type RoleGroupKey = keyof typeof RoleGroups;

export interface AccessRule {
  /** RoleGroups key the backend checks with @Roles. */
  group: RoleGroupKey;
  module: string;
  action: string;
  /** Role codes allowed (SUPER_ADMIN always passes and is not listed). */
  roles: string[];
}

/**
 * Plain-language description of every write rule in RoleGroups, grouped by module. This is what the API
 * actually enforces; the page that shows "who can do what" is generated from it so it can never drift.
 */
const RULES: Array<Omit<AccessRule, 'roles'>> = [
  { group: 'ORG_ADMINS', module: 'Organization & users', action: 'Manage the organization hierarchy, users, role assignments and bulk imports' },
  { group: 'ROLE_VIEWERS', module: 'Organization & users', action: 'View roles and who holds them' },
  { group: 'AUDIT_TRAIL_VIEWERS', module: 'Organization & users', action: 'View the activity log' },
  { group: 'LOCATION_EDITORS', module: 'Locations', action: 'Create and edit locations' },
  { group: 'AREA_MAINTAINERS', module: 'Locations', action: 'Maintain milestones, documents, evidence photos and daily routines (area owners: own areas only)' },
  { group: 'PROGRAM_MANAGERS', module: 'Standards & audit programme', action: 'Author standards, audit templates and schedules; delete operational records' },
  { group: 'STANDARD_APPROVERS', module: 'Standards & audit programme', action: 'Approve standards and standard revisions' },
  { group: 'AUDIT_CONDUCTORS', module: 'Audits', action: 'Conduct audits' },
  { group: 'SELF_AUDITORS', module: 'Audits', action: 'Start an audit (area owners: self-audits of their own areas only)' },
  { group: 'AUDITEES', module: 'Audits', action: 'Acknowledge or dispute an audit result' },
  { group: 'DISPUTE_RESOLVERS', module: 'Audits', action: 'Resolve disputed audits' },
  { group: 'SHOPFLOOR_REPORTERS', module: 'Observations & red tags', action: 'Report observations and red tags, give kudos' },
  { group: 'OBSERVATION_MANAGERS', module: 'Observations & red tags', action: 'Triage and update observations' },
  { group: 'RED_TAG_REVIEWERS', module: 'Observations & red tags', action: 'Review red tags and decide disposition' },
  { group: 'RED_TAG_CLOSERS', module: 'Observations & red tags', action: 'Close red tags (scrap / disposal)' },
  { group: 'ACTION_ASSIGNERS', module: 'Corrective actions', action: 'Raise corrective actions' },
  { group: 'ACTION_OWNERS', module: 'Corrective actions', action: 'Work on corrective actions (root cause, closure evidence)' },
  { group: 'ACTION_VERIFIERS', module: 'Corrective actions', action: 'Verify corrective-action closure' },
  { group: 'ACTION_CLOSERS', module: 'Corrective actions', action: 'Review effectiveness and close corrective actions' },
  { group: 'REPORT_VIEWERS', module: 'Reports & analytics', action: 'Run and export registers' },
  { group: 'SITE_LEADERS', module: 'Reports & analytics', action: 'View management analytics (maturity, heatmaps, leaderboards)' },
  { group: 'RECOGNITION_AWARDERS', module: 'Reports & analytics', action: 'Award trophies' },
];

export function accessRules(): AccessRule[] {
  const described = new Set(RULES.map((r) => r.group));
  // A group added to RoleGroups without a description above still shows up rather than silently missing
  const undescribed = (Object.keys(RoleGroups) as RoleGroupKey[])
    .filter((g) => !described.has(g))
    .map((g) => ({ group: g, module: 'Other', action: g.toLowerCase().replace(/_/g, ' ') }));
  return [...RULES, ...undescribed].map((r) => ({ ...r, roles: [...RoleGroups[r.group]] }));
}
