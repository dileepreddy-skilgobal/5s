/**
 * Types for user management, role scoping, organization unit types and area standards (workstream "areas").
 * Shapes mirror the API responses of /users, /organization/node-types and /standards/for-location.
 */
import type { ReferencePhoto, Role, Standard, StandardRevision, User } from './index';

/** The organization unit a role assignment is limited to (null = the whole organization). */
export interface AssignmentScope {
  id: string;
  name: string;
  code: string;
  nodeType: string;
}

/** One role a user holds, with its optional unit scope and end date. */
export interface ScopedAssignment {
  id: string;
  roleId: string;
  orgNodeId: string | null;
  /** ISO date-time after which the assignment grants nothing; null = no end date. */
  validUntil: string | null;
  createdAt: string;
  role: Role;
  orgNode: AssignmentScope | null;
  /** True once validUntil has passed (the role is ignored at sign-in). */
  expired: boolean;
}

/** GET /users row: the public profile plus scoped assignments and whether an operator PIN is set. */
export type ManagedUser = Omit<User, 'assignments'> & {
  assignments: ScopedAssignment[];
  /** Only reported by GET /users (never the PIN itself). */
  hasPin?: boolean;
};

export interface UserListFilters {
  search?: string;
  role?: string;
  status?: User['status'];
}

/** POST /users. Without a password the server generates a one-time temporary password and returns it once. */
export interface CreateUserPayload {
  email: string;
  firstName: string;
  lastName: string;
  jobTitle?: string;
  department?: string;
  phone?: string;
  roleCode?: string;
  orgNodeId?: string;
  /** YYYY-MM-DD; required for EXTERNAL_AUDITOR. */
  roleValidUntil?: string;
  badgeId?: string;
  pin?: string;
}

/** PATCH /users/:id. An empty badgeId removes the badge. */
export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  department?: string;
  phone?: string;
  status?: User['status'];
  badgeId?: string;
}

export type CreatedUser = ManagedUser & { temporaryPassword?: string };

/** POST /users/:id/roles. */
export interface AssignRolePayload {
  roleId: string;
  orgNodeId?: string;
  /** YYYY-MM-DD; required for EXTERNAL_AUDITOR. */
  validUntil?: string;
}

/** GET /organization/node-types: the tenant's hierarchy levels first, then built-in unit types. */
export interface NodeTypeOption {
  code: string;
  label: string;
  configured: boolean;
  level: number | null;
}

/** A revision as returned by GET /standards/:id, including the approval and rejection details. */
export type StandardRevisionDetail = StandardRevision & {
  approvalComments?: string | null;
  rejectedAt?: string | null;
  rejectedById?: string | null;
  rejectionReason?: string | null;
  rejectedBy?: { id: string; firstName: string; lastName: string; email?: string } | null;
  referencePhotos: ReferencePhoto[];
};

/** GET /standards/for-location/:locationId: a published standard in force at the location. */
export type LocationStandard = Omit<Standard, 'revisions' | 'currentRevision'> & {
  /** Why it applies: organization-wide, through an organization unit above the location, or written for it. */
  appliesVia: 'ORGANIZATION' | 'ORG_UNIT' | 'LOCATION';
  currentRevision: StandardRevision;
};
