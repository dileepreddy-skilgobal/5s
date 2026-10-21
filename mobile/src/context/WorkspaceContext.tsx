import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AuditExecution,
  AuditSubmissionPayload,
  AuditTemplateSnapshot,
  LocationMaster,
  ObservationDraft,
  QuestionAnswer,
  RedTagRecord,
  SyncItem,
} from '../types';
import { ApiService, mapExecution, ServerExecution } from '../services/api';
import { ApiError, getErrorMessage } from '../services/http';
import { OfflineStorage } from '../services/offlineStorage';
import { Connectivity } from '../services/connectivity';
import { SyncResult, SyncService } from '../services/syncService';
import { useUser } from './UserContext';

/** Statuses shown first: work the user can act on. */
const STATUS_ORDER: Record<AuditExecution['status'], number> = { IN_PROGRESS: 0, SCHEDULED: 1, PENDING_REVIEW: 2, COMPLETED: 3 };

interface OpenAuditResult {
  audit: AuditExecution;
  template: AuditTemplateSnapshot;
}

interface WorkspaceContextValue {
  isOnline: boolean;
  isLoading: boolean;
  /** Set when the last refresh could not reach the server and cached data is shown. */
  loadError: string | null;
  lastSyncedAt: string | null;
  locations: LocationMaster[];
  audits: AuditExecution[];
  templates: AuditTemplateSnapshot[];
  redTags: RedTagRecord[];
  syncItems: SyncItem[];
  isSyncing: boolean;
  refresh: () => Promise<void>;
  /** Starts a planned or ad-hoc audit (online: on the server; offline: as a local draft synced later). */
  startAudit: (input: { location: LocationMaster; template: AuditTemplateSnapshot } | { scheduled: AuditExecution }) => Promise<OpenAuditResult>;
  /** Opens an existing audit with its template and any saved answers. */
  openAudit: (audit: AuditExecution) => Promise<OpenAuditResult>;
  saveDraft: (audit: AuditExecution, answers: Record<string, QuestionAnswer>) => Promise<void>;
  submitAudit: (audit: AuditExecution, payload: AuditSubmissionPayload) => Promise<SyncResult | null>;
  registerRedTag: (tag: RedTagRecord) => Promise<SyncResult | null>;
  /** Queues an abnormality report (media stays on the device until uploaded) and tries to send it now. */
  reportObservation: (draft: ObservationDraft, clientRequestId: string) => Promise<SyncResult | null>;
  /**
   * Called when a server image cannot be displayed: signed file links expire after a few hours, so
   * cached data is refreshed (at most every few minutes) when online.
   */
  reportBrokenImage: () => void;
  syncNow: () => Promise<SyncResult | null>;
  retrySyncItem: (id: string) => Promise<void>;
  discardSyncItem: (id: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

const localId = () => `local:${SyncService.newId()}`;

/** Minimum time between refreshes triggered by images that failed to load (expired signed links). */
const BROKEN_IMAGE_REFRESH_MS = 5 * 60 * 1000;

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, tenant, can, refreshStats } = useUser();
  const userId = currentUser.id;

  const [isOnline, setIsOnline] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationMaster[]>([]);
  const [audits, setAudits] = useState<AuditExecution[]>([]);
  const [templates, setTemplates] = useState<AuditTemplateSnapshot[]>([]);
  const [redTags, setRedTags] = useState<RedTagRecord[]>([]);
  const [syncItems, setSyncItems] = useState<SyncItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const wasOnline = useRef(true);
  const lastImageRefresh = useRef(0);

  /** Merges server audits with local drafts and pending submissions. */
  const composeAudits = useCallback(
    async (serverAudits: AuditExecution[]): Promise<AuditExecution[]> => {
      const [drafts, queue] = await Promise.all([OfflineStorage.getDrafts(userId), SyncService.getItems(userId)]);
      const pendingIds = new Set(queue.filter((q) => q.type === 'AUDIT_SUBMIT').map((q) => (q.type === 'AUDIT_SUBMIT' ? q.localAuditId : '')));
      const byId = new Map(serverAudits.map((a) => [a.id, a]));

      // Local drafts not yet on the server (started offline) or with unsent answers
      Object.values(drafts).forEach((d) => {
        const server = byId.get(d.id);
        if (server) {
          if (server.status === 'IN_PROGRESS') byId.set(d.id, { ...server, answers: d.answers });
        } else if (d.kind === 'LOCAL_DRAFT' || pendingIds.has(d.id)) {
          byId.set(d.id, d);
        }
      });
      // A scheduled audit started offline is represented by its local draft
      Object.values(drafts).forEach((d) => {
        if (d.scheduledInstanceId) byId.delete(`sched:${d.scheduledInstanceId}`);
      });

      return Array.from(byId.values())
        .map((a) => (pendingIds.has(a.id) ? { ...a, isOfflineSyncPending: true, status: 'PENDING_REVIEW' as const, statusBadge: 'Waiting to Sync' } : a))
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    },
    [userId],
  );

  const loadLocalRedTags = useCallback(async () => setRedTags(await OfflineStorage.getLocalRedTags(userId)), [userId]);

  const reloadQueue = useCallback(async () => setSyncItems(await SyncService.getItems(userId)), [userId]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const online = await Connectivity.isOnline();
      setIsOnline(online);

      if (online) {
        try {
          const [rawExecutions, instances, templateList] = await Promise.all([
            ApiService.getRawExecutions(),
            ApiService.getScheduledInstances(),
            ApiService.getTemplateSnapshots(),
          ]);
          const locationList = await ApiService.getLocations(tenant.slug, rawExecutions);

          // Conductors see their own audits; area owners see audits of the areas they own
          const ownedLocationIds = new Set(locationList.filter((l) => l.ownerId === userId).map((l) => l.id));
          const relevant = (e: ServerExecution) =>
            e.auditorId === userId || (!can('AUDIT_CONDUCTORS') && ownedLocationIds.has(e.locationId));
          const serverAudits = [
            ...rawExecutions.filter(relevant).map(mapExecution),
            ...(can('AUDIT_CONDUCTORS') ? ApiService.mapScheduledInstances(instances.filter((i) => i.auditorId === userId)) : []),
          ];

          const composed = await composeAudits(serverAudits);
          const now = new Date().toISOString();
          await Promise.all([
            OfflineStorage.saveLocations(userId, locationList),
            OfflineStorage.saveAudits(userId, serverAudits),
            OfflineStorage.saveTemplates(userId, templateList),
            OfflineStorage.saveLastSyncedAt(userId, now),
          ]);
          setLocations(locationList);
          setAudits(composed);
          setTemplates(templateList);
          setLastSyncedAt(now);
          setLoadError(null);
          refreshStats(composed);
          return;
        } catch (err) {
          if (!(err instanceof ApiError && err.isNetworkError)) {
            setLoadError(getErrorMessage(err, 'Could not load data from the server.'));
          } else {
            setLoadError('Server unreachable — showing data saved on this device.');
          }
        }
      }

      // Offline (or server unreachable): last data saved on this device
      const [cachedLocations, cachedAudits, cachedTemplates, syncedAt] = await Promise.all([
        OfflineStorage.getLocations(userId),
        OfflineStorage.getAudits(userId),
        OfflineStorage.getTemplates(userId),
        OfflineStorage.getLastSyncedAt(userId),
      ]);
      const composed = await composeAudits(cachedAudits);
      setLocations(cachedLocations);
      setAudits(composed);
      setTemplates(cachedTemplates);
      setLastSyncedAt(syncedAt);
      refreshStats(composed);
      if (!online) setLoadError(null);
    } finally {
      await Promise.all([reloadQueue(), loadLocalRedTags()]);
      setIsLoading(false);
    }
  }, [can, composeAudits, loadLocalRedTags, refreshStats, reloadQueue, tenant.slug, userId]);

  const syncNow = useCallback(async (): Promise<SyncResult | null> => {
    if (!(await Connectivity.isOnline())) {
      setIsOnline(false);
      return null;
    }
    setIsSyncing(true);
    try {
      const result = await SyncService.process(userId);
      if (result.synced > 0) await refresh();
      else await reloadQueue();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [refresh, reloadQueue, userId]);

  // Initial load, then automatic sync whenever connectivity is restored
  useEffect(() => {
    OfflineStorage.removeLegacyData();
    refresh().then(() => syncNow());
    const unsubscribe = Connectivity.subscribe((online) => {
      setIsOnline(online);
      if (online && !wasOnline.current) {
        syncNow();
      }
      wasOnline.current = online;
    });
    return unsubscribe;
    // Run once per signed-in user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const templateForVersion = useCallback(
    (versionId: string) => templates.find((t) => t.templateVersionId === versionId) ?? null,
    [templates],
  );

  const openAudit = useCallback(
    async (audit: AuditExecution): Promise<OpenAuditResult> => {
      const drafts = await OfflineStorage.getDrafts(userId);
      const draft = drafts[audit.id];
      const cachedTemplate = templateForVersion(audit.templateVersionId);

      if (audit.kind === 'EXECUTION' && audit.serverExecutionId && (await Connectivity.isOnline())) {
        // The server copy defines the exact template version; local unsent answers take precedence
        const resumed = await ApiService.getExecutionForResume(audit.serverExecutionId);
        return { audit: { ...audit, answers: { ...resumed.answers, ...(draft?.answers ?? {}) } }, template: resumed.template };
      }
      if (!cachedTemplate) {
        throw new ApiError(0, 'This audit template is not available offline. Connect to the network and try again.');
      }
      return { audit: { ...audit, answers: draft?.answers ?? audit.answers }, template: cachedTemplate };
    },
    [templateForVersion, userId],
  );

  const startAudit = useCallback<WorkspaceContextValue['startAudit']>(
    async (input) => {
      const isScheduled = 'scheduled' in input;
      const base = isScheduled
        ? {
            locationId: input.scheduled.locationId,
            templateId: input.scheduled.templateId,
            templateVersionId: input.scheduled.templateVersionId,
            auditInstanceId: input.scheduled.scheduledInstanceId,
          }
        : {
            locationId: input.location.id,
            templateId: input.template.templateId,
            templateVersionId: input.template.templateVersionId,
          };
      const auditorName = `${currentUser.firstName} ${currentUser.lastName}`;

      if (await Connectivity.isOnline()) {
        const started = mapExecution(await ApiService.startExecution({ ...base, auditorName }));
        const opened = await openAudit(started);
        setAudits((prev) => [started, ...prev.filter((a) => a.id !== started.id && a.id !== `sched:${base.auditInstanceId}`)]);
        return opened;
      }

      // Offline: run the audit as a local draft; it is started on the server when it syncs
      const template = templateForVersion(base.templateVersionId);
      if (!template) {
        throw new ApiError(0, 'This audit template is not available offline. Connect to the network to start this audit.');
      }
      const location = locations.find((l) => l.id === base.locationId);
      const draft: AuditExecution = {
        id: localId(),
        kind: 'LOCAL_DRAFT',
        scheduledInstanceId: base.auditInstanceId,
        trackingNumber: isScheduled ? input.scheduled.trackingNumber : 'New audit (offline)',
        templateId: template.templateId,
        templateVersionId: template.templateVersionId,
        templateTitle: template.name,
        locationId: base.locationId,
        locationName: location?.name ?? (isScheduled ? input.scheduled.locationName : ''),
        plantName: location?.plant ?? '',
        auditorId: userId,
        auditorName,
        category: location?.code ?? '',
        status: 'IN_PROGRESS',
        statusBadge: 'In Progress (offline)',
        overallScore: null,
        pillarScores: {},
        timeline: [],
        answers: {},
        findingsCount: 0,
        scheduledDate: new Date().toLocaleDateString('en-GB'),
        startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      await OfflineStorage.saveDraft(userId, draft);
      setAudits((prev) => [draft, ...prev.filter((a) => a.id !== `sched:${base.auditInstanceId}`)]);
      return { audit: draft, template };
    },
    [currentUser.firstName, currentUser.lastName, locations, openAudit, templateForVersion, userId],
  );

  const saveDraft = useCallback(
    async (audit: AuditExecution, answers: Record<string, QuestionAnswer>) => {
      const updated = { ...audit, answers };
      await OfflineStorage.saveDraft(userId, updated);
      setAudits((prev) => prev.map((a) => (a.id === audit.id ? updated : a)));
    },
    [userId],
  );

  const submitAudit = useCallback(
    async (audit: AuditExecution, payload: AuditSubmissionPayload): Promise<SyncResult | null> => {
      await OfflineStorage.saveDraft(userId, audit);
      await SyncService.enqueue({
        id: SyncService.newId(),
        type: 'AUDIT_SUBMIT',
        userId,
        createdAt: new Date().toISOString(),
        attempts: 0,
        state: 'PENDING',
        label: `Audit ${audit.trackingNumber} — ${audit.locationName}`,
        localAuditId: audit.id,
        serverExecutionId: audit.serverExecutionId,
        start: {
          locationId: audit.locationId,
          templateId: audit.templateId,
          templateVersionId: audit.templateVersionId,
          auditInstanceId: audit.scheduledInstanceId,
        },
        submit: payload,
      });
      const result = await syncNow();
      if (!result) await refresh();
      return result;
    },
    [refresh, syncNow, userId],
  );

  const registerRedTag = useCallback(
    async (tag: RedTagRecord): Promise<SyncResult | null> => {
      const local = await OfflineStorage.getLocalRedTags(userId);
      await OfflineStorage.saveLocalRedTags(userId, [{ ...tag, status: 'PENDING_SYNC' as const }, ...local].slice(0, 100));
      await SyncService.enqueue({
        id: SyncService.newId(),
        type: 'RED_TAG_CREATE',
        userId,
        createdAt: new Date().toISOString(),
        attempts: 0,
        state: 'PENDING',
        label: `Red tag — ${tag.itemName} (${tag.areaName})`,
        tag,
      });
      const result = await syncNow();
      await Promise.all([reloadQueue(), loadLocalRedTags()]);
      return result;
    },
    [loadLocalRedTags, reloadQueue, syncNow, userId],
  );

  const reportObservation = useCallback(
    async (draft: ObservationDraft, clientRequestId: string): Promise<SyncResult | null> => {
      await SyncService.enqueue({
        id: SyncService.newId(),
        type: 'OBSERVATION_CREATE',
        userId,
        createdAt: new Date().toISOString(),
        attempts: 0,
        state: 'PENDING',
        label: `Abnormality — ${draft.title} (${draft.locationName})`,
        clientRequestId,
        observation: draft,
      });
      const result = await syncNow();
      await reloadQueue();
      return result;
    },
    [reloadQueue, syncNow, userId],
  );

  const reportBrokenImage = useCallback(() => {
    const now = Date.now();
    if (now - lastImageRefresh.current < BROKEN_IMAGE_REFRESH_MS) return;
    lastImageRefresh.current = now;
    Connectivity.isOnline().then((online) => {
      if (online) refresh();
    });
  }, [refresh]);

  const retrySyncItem = useCallback(
    async (id: string) => {
      await SyncService.retry(id);
      await syncNow();
    },
    [syncNow],
  );

  const discardSyncItem = useCallback(
    async (id: string) => {
      await SyncService.discard(id);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      isOnline,
      isLoading,
      loadError,
      lastSyncedAt,
      locations,
      audits,
      templates,
      redTags,
      syncItems,
      isSyncing,
      refresh,
      startAudit,
      openAudit,
      saveDraft,
      submitAudit,
      registerRedTag,
      reportObservation,
      reportBrokenImage,
      syncNow,
      retrySyncItem,
      discardSyncItem,
    }),
    [
      isOnline, isLoading, loadError, lastSyncedAt, locations, audits, templates, redTags, syncItems, isSyncing,
      refresh, startAudit, openAudit, saveDraft, submitAudit, registerRedTag, reportObservation, reportBrokenImage, syncNow,
      retrySyncItem, discardSyncItem,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = (): WorkspaceContextValue => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return ctx;
};
