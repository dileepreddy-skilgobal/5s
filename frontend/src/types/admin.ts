import { EscalationSettings, GamificationLeaderboards, OrganizationSettings, TenantSettings, UpdateSettingsPayload } from './index';

/**
 * Types for the administration workstream (settings, notifications scheduler, onboarding, recognition)
 * that extend the shared types in ./index without changing them.
 */

/** Escalation settings including the digest schedule (backend: core/config/tenant-settings.ts). */
export interface AdminEscalationSettings extends EscalationSettings {
  /** Consolidated daily summary for plant / department heads, 5S coordinators and executives, scoped to their org node. */
  managerDigest: boolean;
  /** Local hour (0–23) from which the daily digests are sent, in `timeZone`. */
  digestHour: number;
  /** IANA time zone, e.g. Asia/Kolkata. */
  timeZone: string;
}

export interface CapaSettings {
  /** BRD §33 exception: actions may be closed without an after photo when a justification note is recorded. */
  allowClosureWithoutPhoto: boolean;
}

export interface GamificationSettings {
  /** Recognition (XP, badges, trophies, kudos) is optional per organization (BRD §55). */
  enabled: boolean;
  /** Show the ranking of individual people; area and department rankings stay visible. */
  showIndividualLeaderboard: boolean;
}

/** Platform defaults as returned by GET /settings/defaults. */
export interface AdminTenantSettings extends TenantSettings {
  escalation: AdminEscalationSettings;
  capa: CapaSettings;
  gamification: GamificationSettings;
}

/** GET /settings with every section this workstream adds. */
export interface AdminOrganizationSettings extends OrganizationSettings {
  escalation: AdminEscalationSettings;
  capa: CapaSettings;
  gamification: GamificationSettings;
}

/** PATCH /settings including the added sections. */
export interface AdminUpdateSettingsPayload extends Omit<UpdateSettingsPayload, 'escalation'> {
  escalation?: Partial<AdminEscalationSettings>;
  capa?: Partial<CapaSettings>;
  gamification?: Partial<GamificationSettings>;
}

/** Result of POST /notifications/run-scheduler ("Run reminders now"). */
export interface SchedulerRunSummary {
  notificationsCreated: number;
  /** Notifications created per check; only checks that created some are present. */
  byCheck: Partial<Record<SchedulerCheck, number>>;
  escalationTiersUpdated: number;
  actionsBecameOverdue: number;
  /** False before the configured digest hour, when no digest is sent yet today. */
  digestWindowOpen: boolean;
}

export type SchedulerCheck =
  | 'actionEscalation'
  | 'auditOverdue'
  | 'auditDueSoon'
  | 'criticalObservation'
  | 'redTagAgeing'
  | 'certificateExpiring'
  | 'trialEnding'
  | 'dailyDigest'
  | 'managerDigest';

/** POST /tenants/onboard body. */
export interface OnboardingPayload {
  orgName: string;
  orgSlug: string;
  industry?: string;
  logoUrl?: string;
  sites: string[];
  departments: string[];
  adminName: string;
  adminEmail: string;
  /** Create the starter 6S audit checklist (published). */
  starterTemplate?: boolean;
  /** Create starter workplace standards as drafts for review. */
  starterStandards?: boolean;
}

export interface OnboardingResult {
  message: string;
  tenantId: string;
  tenantSlug: string;
  adminEmail: string;
  /** Present only when a new admin account was provisioned. */
  adminTemporaryPassword?: string;
  sitesCreated: number;
  departmentsCreated: number;
  starterTemplateCreated?: boolean;
  starterStandardsCreated?: number;
}

/** GET /analytics/gamification/leaderboards, including the organization's visibility choice. */
export interface AdminGamificationLeaderboards extends GamificationLeaderboards {
  /** True when the organization hides the ranking of individual people. */
  individualLeaderboardHidden?: boolean;
}
