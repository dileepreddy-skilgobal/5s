/**
 * The single list of roles shown in the UI: display name, accent colour, home page and the short
 * description used in the role switcher. Access rules live in roleGroups.ts (mirroring the backend).
 */
export interface RoleMeta {
  code: string;
  label: string;
  color: string;
  homePath: string;
  subtitle: string;
}

export const ROLES: RoleMeta[] = [
  { code: 'SUPER_ADMIN', label: 'Super admin', color: '#ef4444', homePath: '/super-admin', subtitle: 'Organizations and plans' },
  { code: 'ORG_ADMIN', label: 'Organization admin', color: '#6366f1', homePath: '/organization', subtitle: 'Organization set-up and settings' },
  { code: 'PLANT_HEAD', label: 'Plant head', color: '#3b82f6', homePath: '/analytics', subtitle: 'Plant scores and analytics' },
  { code: 'COORDINATOR_5S', label: '5S coordinator', color: '#8b5cf6', homePath: '/schedules', subtitle: 'Audit schedules and the 5S program' },
  { code: 'DEPT_HEAD', label: 'Department head', color: '#a855f7', homePath: '/area-owner-hub', subtitle: 'Department areas and actions' },
  { code: 'AREA_OWNER', label: 'Area owner', color: '#f59e0b', homePath: '/area-owner-hub', subtitle: 'My areas, daily checks and actions' },
  { code: 'AUDITOR', label: 'Auditor', color: '#10b981', homePath: '/auditor-hub', subtitle: 'Audit rounds and verification' },
  { code: 'EXTERNAL_AUDITOR', label: 'External auditor', color: '#14b8a6', homePath: '/auditor-hub', subtitle: 'Independent assessments' },
  { code: 'EXECUTIVE', label: 'Executive', color: '#0f766e', homePath: '/analytics', subtitle: 'Organization performance (view only)' },
  { code: 'EMPLOYEE', label: 'Employee', color: '#64748b', homePath: '/observations', subtitle: 'Report abnormalities' },
];

const BY_CODE = new Map(ROLES.map((r) => [r.code, r]));

export const roleMeta = (code: string | null | undefined): RoleMeta | undefined => (code ? BY_CODE.get(code) : undefined);

/** Display name for a role code ("COORDINATOR_5S" → "5S coordinator"). */
export const roleLabel = (code: string | null | undefined): string => roleMeta(code)?.label ?? (code ? code.replace(/_/g, ' ').toLowerCase() : '');

/** Where a role lands after sign-in; anyone without a dedicated hub goes to abnormality reporting. */
export const roleHomePath = (code: string | null | undefined): string => roleMeta(code)?.homePath ?? '/observations';
