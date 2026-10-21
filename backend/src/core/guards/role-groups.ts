/**
 * Central role matrix for write operations.
 *
 * Conventions:
 * - Read endpoints (GET) are open to every authenticated user of the tenant; data is tenant-scoped by the services.
 * - SUPER_ADMIN (platform flag) always passes RolesGuard and is therefore not listed here.
 * - EXTERNAL_AUDITOR is a read-only assessment role and is intentionally absent from every write group.
 */
export const RoleGroups = {
  /** Tenant configuration: org hierarchy, users, RBAC, bulk imports. */
  ORG_ADMINS: ['ORG_ADMIN'],

  /** Run and export registers (audits, observations, actions, red tags, audit plan, locations). */
  REPORT_VIEWERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AUDITOR', 'EXECUTIVE'],

  /** Read the tamper-evident activity trail. */
  AUDIT_TRAIL_VIEWERS: ['ORG_ADMIN'],

  /** View role definitions and their permissions. */
  ROLE_VIEWERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S'],

  /** 5S programme governance: templates, schedules, standards authoring, deletions of operational records. */
  PROGRAM_MANAGERS: ['ORG_ADMIN', 'COORDINATOR_5S'],

  /** Management reporting (maturity, heatmaps, leaderboards). Mirrors the /analytics route. Read-only; EXECUTIVE is a
   * view-only leadership role (BRD 9.9) and is in no write group. */
  SITE_LEADERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'EXECUTIVE'],

  /** Location master create / update. */
  LOCATION_EDITORS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD'],

  /** Day-to-day area upkeep: implementation timelines and area documents. */
  AREA_MAINTAINERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AREA_OWNER'],

  /** Approve standard revisions. */
  STANDARD_APPROVERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S'],

  /** Conduct audits. Area owners are excluded to keep audits independent of the audited area. */
  AUDIT_CONDUCTORS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AUDITOR'],

  /** Start an audit run. Area owners may only run SELF audits of areas they own (enforced by the service). */
  SELF_AUDITORS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AUDITOR', 'AREA_OWNER'],

  /** Audited parties: acknowledge or dispute an audit result. */
  AUDITEES: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AREA_OWNER'],

  /** Arbitrate disputed audits. */
  DISPUTE_RESOLVERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S'],

  /** Any tenant member who may report on the shop floor (observations, red tags, kudos). */
  SHOPFLOOR_REPORTERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AREA_OWNER', 'AUDITOR', 'EMPLOYEE'],

  /** Triage and update observations. */
  OBSERVATION_MANAGERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AREA_OWNER', 'AUDITOR'],

  /** Raise corrective actions. */
  ACTION_ASSIGNERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AUDITOR'],

  /** Work on corrective actions (root cause, closure evidence). */
  ACTION_OWNERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AUDITOR', 'AREA_OWNER'],

  /** Independently verify corrective-action closure. */
  ACTION_VERIFIERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AUDITOR'],

  /** Effectiveness review that closes a verified corrective action. */
  ACTION_CLOSERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD'],

  /** Review red tags and decide disposition. */
  RED_TAG_REVIEWERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AREA_OWNER'],

  /** Final red-tag closure (scrap / disposal). */
  RED_TAG_CLOSERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD'],

  /** Award floating trophies. */
  RECOGNITION_AWARDERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S'],
} as const satisfies Record<string, readonly string[]>;
