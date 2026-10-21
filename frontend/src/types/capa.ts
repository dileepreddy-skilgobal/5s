// Types for corrective actions (CAPA), observations and red tags that extend the shared models in ./index.
import type { CapaAction, CapaStep } from '../services/capaApi';
import type { Observation, RedTag, RedTagMetrics, User } from './index';

/** Where a corrective action came from (CorrectiveAction.source). */
export type ActionSource = 'AUDIT' | 'OBSERVATION' | 'RED_TAG' | 'MANAGEMENT_REVIEW';

export const ACTION_SOURCE_LABELS: Record<ActionSource, string> = {
  AUDIT: 'Audit finding',
  OBSERVATION: 'Observation',
  RED_TAG: 'Red tag',
  MANAGEMENT_REVIEW: 'Management review',
};

/** Workflow steps the server offers, including the manager-only reassign / reschedule steps. */
export type CapaWorkflowStep = CapaStep | 'REASSIGN' | 'RESCHEDULE';

/** A corrective action as returned by the CAPA endpoints, with its source and the caller's allowed steps. */
export interface CapaRecord extends Omit<CapaAction, 'allowedActions'> {
  allowedActions?: CapaWorkflowStep[];
  source?: ActionSource;
  redTagId?: string | null;
  /** Present on the detail endpoint when the action was raised from a red tag. */
  redTag?: { id: string; tagNumber: string; itemName: string; status: string } | null;
}

export interface CapaListQuery {
  status?: string;
  /** A user id, or `me` for the signed-in user. */
  assigneeId?: string;
  locationId?: string;
  isOverdue?: string;
  escalationTier?: string;
  severity?: string;
  source?: ActionSource;
  search?: string;
}

/** Body of POST /corrective-actions: exactly one origin (observation, red tag, or standalone with a location). */
export interface CreateCapaInput {
  observationId?: string;
  redTagId?: string;
  locationId?: string;
  source?: 'MANAGEMENT_REVIEW';
  severity?: string;
  category?: string;
  title: string;
  description: string;
  actionType?: string;
  assigneeId?: string;
  /** ISO date-time; omitted means the SLA for the severity decides. */
  targetDate?: string;
}

export interface SubmitClosureInput {
  closureNotes: string;
  afterPhotoUrl?: string;
  /** Required when there is no after photo (only if the organization allows that). */
  noPhotoJustification?: string;
}

export interface ClosurePolicy {
  allowClosureWithoutPhoto: boolean;
}

export type CapaTimelineKind =
  | 'CREATED'
  | 'STATUS_CHANGED'
  | 'REASSIGNED'
  | 'DUE_DATE_CHANGED'
  | 'ANALYSIS_UPDATED'
  | 'SUBMITTED'
  | 'VERIFIED'
  | 'VERIFICATION_REJECTED'
  | 'CLOSED'
  | 'REOPENED'
  | 'ESCALATED';

export interface CapaTimelineEntry {
  id: string;
  kind: CapaTimelineKind;
  at: string;
  actorId: string | null;
  actorName: string | null;
  fromStatus: string;
  toStatus: string;
  comment: string | null;
  fromAssigneeId: string | null;
  toAssigneeId: string | null;
  fromTargetDate: string | null;
  toTargetDate: string | null;
  reason: string | null;
  escalationTier: string | null;
}

// ---------- Observations ----------

export interface ObservationMedia {
  url: string;
  kind: 'PHOTO' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
  capturedAt?: string;
  latitude?: number;
  longitude?: number;
}

/** Observation with the evidence, location and repeat fields the API returns. */
export interface ObservationRecord extends Observation {
  mediaUrls?: ObservationMedia[];
  voiceNoteUrl?: string | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  gpsAccuracyM?: number | null;
  isRepeat?: boolean;
  repeatOfId?: string | null;
  /** Detail endpoint: the earlier observation this one repeats. */
  repeatOf?: { id: string; observationCode: string; title: string; createdAt: string } | null;
  /** Detail endpoint: a deleted corrective action still holds this observation. */
  hasDeletedAction?: boolean;
}

// ---------- Red tags ----------

/** Red tag with ageing against its decide-by date, the people involved and any linked corrective action. */
export interface RedTagRecord extends RedTag {
  isPastTarget?: boolean;
  daysPastTarget?: number;
  actualDispositionAction?: string | null;
  dispositionRejectionReason?: string | null;
  disposedBy?: User | null;
  correctiveAction?: { id: string; actionCode: string; status: string } | null;
}

export interface HoldingAreaMetrics {
  holdingAreaId: string | null;
  name: string;
  areaCode: string | null;
  openTags: number;
  pastTarget: number;
  totalValue: number;
}

export interface RedTagMetricsRecord extends RedTagMetrics {
  /** Open tags past their decide-by date. */
  pastTargetCount?: number;
  holdingAreaBreakdown?: HoldingAreaMetrics[];
}

export interface CloseRedTagRecordInput {
  actualDispositionAction?: string;
  closurePhotoUrl?: string;
  financialRecovered?: number;
}
