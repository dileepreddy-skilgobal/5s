/**
 * Mirror of the backend role matrix (backend/src/core/guards/role-groups.ts) — used only to hide
 * actions the user cannot perform. The server remains the authority and rejects anything else with 403.
 */
export const RoleGroups = {
  AUDIT_CONDUCTORS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AUDITOR'],
  AUDITEES: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AREA_OWNER'],
  SHOPFLOOR_REPORTERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AREA_OWNER', 'AUDITOR', 'EMPLOYEE'],
  RED_TAG_REVIEWERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AREA_OWNER'],
  RED_TAG_CLOSERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD'],
  ACTION_OWNERS: ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AUDITOR', 'AREA_OWNER'],
} as const satisfies Record<string, readonly string[]>;

export type RoleGroup = keyof typeof RoleGroups;
