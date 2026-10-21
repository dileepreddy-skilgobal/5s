import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../../services/api';
import { redTagApi, RED_TAG_UNITS, RED_TAG_UNIT_LABELS, RedTagUnit, CreateRedTagInput } from '../../services/redTagApi';
import { capaApi } from '../../services/api-capa';
import type { RedTagMetricsRecord, RedTagRecord } from '../../types/capa';
import { RaiseCapaModal, RaiseCapaOrigin } from '../capa/RaiseCapaModal';
import { useApp } from '../../context/AppContext';
import { useTerminology } from '../../hooks/useTerminology';
import { useI18n } from '../../i18n';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { SummaryCard, SummaryGrid, SummaryTone } from '../../components/ui/SummaryCard';
import { FormField, SearchInput, FilterBar } from '../../components/ui/FormField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/StateViews';
import { DuplicateNotice, DuplicateChecking, useDuplicateCheck } from '../../components/common/DuplicateNotice';
import { PhotoEvidenceField } from '../capa/PhotoEvidenceField';
import {
  BadgeVariant,
  RED_TAG_CATEGORY_LABELS,
  RED_TAG_STATUS_LABELS,
  CLOSED_RED_TAG_STATUSES,
  redTagCategoryLabel,
  redTagStatusLabel,
  actionStatusLabel,
  humanize,
} from '../../constants/labels';
import { RedTag, Location, ZoneRedTagMetrics, RedTagDisposition, KEEP_IN_SERVICE_DISPOSITIONS, User } from '../../types';
import {
  AlertOctagon,
  CalendarX,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
  List,
  MoveRight,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Wrench,
  XCircle,
} from 'lucide-react';

/** Decision codes offered for a tag; Scrap (sold or recycled as scrap) and Dispose (discarded as waste) are separate. */
type DecisionCode = RedTagDisposition | 'SCRAP_RECYCLE';

const DECISION_LABELS: Record<DecisionCode, string> = {
  SCRAP_RECYCLE: 'Scrap',
  DISPOSE_SCRAP: 'Dispose',
  RELOCATE: 'Relocate',
  REUSE: 'Reuse elsewhere',
  RETURN_TO_VENDOR: 'Return to vendor',
  AUCTION_SELL: 'Sell',
  REPAIR_RESTORE: 'Repair',
  KEEP_JUSTIFIED: 'Keep (justified)',
};
const decisionLabel = (code: string | null | undefined): string => (code && code in DECISION_LABELS ? DECISION_LABELS[code as DecisionCode] : humanize(code));

const DISPOSITION_OPTIONS: Array<{ value: DecisionCode; description: string }> = [
  { value: 'SCRAP_RECYCLE', description: 'Sell or recycle it as scrap material' },
  { value: 'DISPOSE_SCRAP', description: 'Discard it as waste (no recovery)' },
  { value: 'RELOCATE', description: 'Move it to the area that needs it' },
  { value: 'REUSE', description: 'Reuse it elsewhere in the organization' },
  { value: 'RETURN_TO_VENDOR', description: 'Return it to the supplier for credit or warranty' },
  { value: 'AUCTION_SELL', description: 'Sell it as surplus' },
  { value: 'REPAIR_RESTORE', description: 'Send it for repair, then back into use' },
  { value: 'KEEP_JUSTIFIED', description: 'Keep it, with a recorded justification' },
];

/** Categories offered for new tags (legacy codes stay filterable but are no longer assigned). */
const NEW_TAG_CATEGORIES = Object.keys(RED_TAG_CATEGORY_LABELS).filter((c) => c !== 'OBSOLETE_EQUIPMENT');

/** Statuses from which a reviewer may still cancel a tag (the server rejects it once a decision is approved). */
const CANCELLABLE_STATUSES: RedTag['status'][] = ['RED_TAGGED', 'IN_HOLDING_AREA', 'PENDING_DISPOSITION'];

const AGEING_TIER_LABELS: Record<RedTag['ageingTier'], string> = {
  '0_7_DAYS': '0–7 days',
  '8_14_DAYS': '8–14 days',
  '15_30_DAYS': '15–30 days',
  OVER_30_DAYS: 'Over 30 days',
};

const STATUS_VARIANT: Record<RedTag['status'], BadgeVariant> = {
  RED_TAGGED: 'danger',
  IN_HOLDING_AREA: 'warning',
  PENDING_DISPOSITION: 'purple',
  DISPOSITION_APPROVED: 'info',
  DISPOSED: 'success',
  RETURNED: 'success',
  CANCELLED: 'neutral',
};

/** Closing a tag with this disposition keeps the item in service (RETURNED) instead of disposing of it. */
const keepsInService = (value?: string | null): boolean => KEEP_IN_SERVICE_DISPOSITIONS.includes(value as RedTagDisposition);
const personName = (u?: Pick<User, 'firstName' | 'lastName'> | null): string => (u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '');
const isClosedTagStatus = (status: string): boolean => CLOSED_RED_TAG_STATUSES.includes(status);
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** Local calendar date as YYYY-MM-DD (toISOString would shift the day in IST). */
const localDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface NewTagForm {
  locationId: string;
  targetHoldingAreaId: string;
  itemName: string;
  itemDescription: string;
  category: string;
  quantity: string;
  unitOfMeasure: RedTagUnit;
  estimatedValue: string;
  reason: string;
  photoUrl: string;
  targetDispositionDate: string;
}

const emptyTagForm = (locationId = ''): NewTagForm => ({
  locationId,
  targetHoldingAreaId: '',
  itemName: '',
  itemDescription: '',
  category: 'UNNEEDED_TOOL',
  quantity: '1',
  unitOfMeasure: 'PCS',
  estimatedValue: '',
  reason: '',
  photoUrl: '',
  targetDispositionDate: '',
});

type FormErrors = Partial<Record<'locationId' | 'itemName' | 'reason' | 'quantity' | 'estimatedValue' | 'targetDispositionDate', string>>;

export const RedTagStudioPage: React.FC = () => {
  const { addToast, can } = useApp();
  const { relabel } = useTerminology();
  const { formatDate, formatNumber } = useI18n();
  const money = (v: number | null | undefined) => `₹${formatNumber(v ?? 0)}`;

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [redTags, setRedTags] = useState<RedTagRecord[]>([]);
  const [metrics, setMetrics] = useState<RedTagMetricsRecord | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);

  // Deep links: ?id=<tagId> highlights a tag; ?status= and ?overdue=1 preset the filters; ?new=1&locationId= opens the quick form
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedTagId = searchParams.get('id');
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // View & filters
  const [selectedZoneId, setSelectedZoneId] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'ZONE_GROUPED' | 'MASTER_TABLE'>('ZONE_GROUPED');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>(() => searchParams.get('status') || 'ALL');
  const [pastTargetOnly, setPastTargetOnly] = useState<boolean>(() => searchParams.get('overdue') === '1' || searchParams.get('overdue') === 'true');
  const [selectedAgeingTier, setSelectedAgeingTier] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [collapsedZones, setCollapsedZones] = useState<Record<string, boolean>>({});

  // Create
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [newTag, setNewTag] = useState<NewTagForm>(emptyTagForm());
  const [createErrors, setCreateErrors] = useState<FormErrors>({});
  const [creating, setCreating] = useState<boolean>(false);

  // Disposition
  const [selectedTagForDisp, setSelectedTagForDisp] = useState<RedTag | null>(null);
  const [dispAction, setDispAction] = useState<DecisionCode>('SCRAP_RECYCLE');
  const [dispJustification, setDispJustification] = useState<string>('');
  const [dispError, setDispError] = useState<string>('');
  const [supervisorApproved, setSupervisorApproved] = useState<boolean>(false);
  const [submittingDisp, setSubmittingDisp] = useState<boolean>(false);

  // Supervisor review of a proposed decision
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [tagToReject, setTagToReject] = useState<RedTagRecord | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [rejectError, setRejectError] = useState<string>('');
  const [rejecting, setRejecting] = useState<boolean>(false);

  // Move to a holding area
  const [tagToMove, setTagToMove] = useState<RedTagRecord | null>(null);
  const [moveHoldingId, setMoveHoldingId] = useState<string>('');
  const [moveError, setMoveError] = useState<string>('');
  const [moving, setMoving] = useState<boolean>(false);

  // Raise a corrective action from a tag
  const [raiseOrigin, setRaiseOrigin] = useState<RaiseCapaOrigin | null>(null);

  // Close
  const [selectedTagForClose, setSelectedTagForClose] = useState<RedTag | null>(null);
  const [actualDisposition, setActualDisposition] = useState<string>('');
  const [financialRecovered, setFinancialRecovered] = useState<string>('');
  const [closurePhotoUrl, setClosurePhotoUrl] = useState<string>('');
  const [closeErrors, setCloseErrors] = useState<{ photo?: string; recovered?: string }>({});
  const [closing, setClosing] = useState<boolean>(false);

  // Cancel
  const [tagToCancel, setTagToCancel] = useState<RedTag | null>(null);
  const [cancelling, setCancelling] = useState<boolean>(false);

  // Printable tag (loaded by id so the QR code always carries the tag link)
  const [printTag, setPrintTag] = useState<RedTagRecord | null>(null);
  const [printLoadingId, setPrintLoadingId] = useState<string | null>(null);

  const holdingAreas = useMemo(() => locations.filter((l) => l.locationType === 'RED_TAG_ZONE'), [locations]);
  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  // Advisory duplicate check while raising a new tag (never blocks submission)
  const dupItemName = newTag.itemName.trim();
  const duplicateCheck = useDuplicateCheck(
    createOpen && newTag.locationId && dupItemName.length >= 3 ? `${newTag.locationId}|${dupItemName.toLowerCase()}` : '',
    async () =>
      (await api.findDuplicateRedTags({ locationId: newTag.locationId, itemName: dupItemName })).map((d) => ({
        id: d.id,
        code: d.tagNumber,
        title: d.quantity ? `${d.itemName} (qty ${d.quantity})` : d.itemName,
        status: d.status,
        similarity: d.similarity,
        link: `/red-tags?id=${d.id}`,
      })),
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [tagsRes, metricsRes, locsRes] = await Promise.all([capaApi.listRedTags(), capaApi.redTagMetrics(), api.getLocations()]);
      setRedTags(tagsRes);
      setMetrics(metricsRes);
      setLocations(locsRes);
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Could not load the red tag register.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refreshMetrics = async () => {
    try {
      setMetrics(await capaApi.redTagMetrics());
    } catch {
      // The register itself is already updated; the KPIs refresh on the next load
    }
  };

  // Handled once per linked id (reloads after workflow actions must not re-scroll or re-warn)
  const handledLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!linkedTagId) {
      handledLinkRef.current = null;
      setHighlightId(null);
      return;
    }
    if (loading || loadError || handledLinkRef.current === linkedTagId) return;
    handledLinkRef.current = linkedTagId;
    const target = redTags.find((t) => t.id === linkedTagId);
    if (!target) {
      setHighlightId(null);
      addToast({ type: 'warning', title: 'Red tag not found', message: 'The linked red tag is no longer available to you.' });
      return;
    }
    // Clear filters that could hide it, expand its zone, then bring it into view once rendered
    setSelectedZoneId('ALL');
    setSelectedCategory('ALL');
    setSelectedStatus('ALL');
    setSelectedAgeingTier('ALL');
    setPastTargetOnly(false);
    setSearchQuery('');
    setCollapsedZones((prev) => ({ ...prev, [target.locationId]: false }));
    setHighlightId(target.id);
    window.setTimeout(() => {
      document.getElementById(`red-tag-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedTagId, loading, loadError]);

  const highlightStyle = (id: string): React.CSSProperties =>
    id === highlightId ? { outline: '2px solid var(--color-primary)', outlineOffset: '2px', boxShadow: '0 0 0 6px var(--color-primary-light)' } : {};

  // Workflow responses carry the tag's own fields; keep list-only details (linked action) the response may lack
  const replaceTag = (updated: RedTagRecord) => setRedTags((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));

  // ---------- Create ----------
  const openCreate = (locationId = selectedZoneId !== 'ALL' ? selectedZoneId : '') => {
    setNewTag(emptyTagForm(locationId));
    setCreateErrors({});
    setCreateOpen(true);
  };

  // Quick tag from an area page: /red-tags?new=1&locationId=<id> opens the form for that location
  const wantsQuickCreate = searchParams.get('new') === '1';
  const quickLocationId = searchParams.get('locationId');
  useEffect(() => {
    if (!wantsQuickCreate || loading || locations.length === 0) return;
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    next.delete('locationId');
    setSearchParams(next, { replace: true });
    if (!can('SHOPFLOOR_REPORTERS')) {
      addToast({ type: 'warning', title: 'Not available', message: 'Your role cannot raise red tags.' });
      return;
    }
    openCreate(quickLocationId && locations.some((l) => l.id === quickLocationId) ? quickLocationId : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsQuickCreate, loading, locations]);

  const handleCreateRedTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    const errors: FormErrors = {};
    const quantity = Number(newTag.quantity);
    const value = newTag.estimatedValue === '' ? undefined : Number(newTag.estimatedValue);
    if (!newTag.locationId) errors.locationId = 'Choose where the item was found.';
    if (!newTag.itemName.trim()) errors.itemName = 'Enter the item name.';
    if (!newTag.reason.trim()) errors.reason = 'Say why the item is tagged.';
    if (!Number.isInteger(quantity) || quantity < 1) errors.quantity = 'Enter a whole number of 1 or more.';
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) errors.estimatedValue = 'Enter 0 or more.';
    if (newTag.targetDispositionDate && newTag.targetDispositionDate < localDateKey(new Date())) errors.targetDispositionDate = 'Choose today or a later date.';
    setCreateErrors(errors);
    if (Object.keys(errors).length) return;

    const payload: CreateRedTagInput = {
      locationId: newTag.locationId,
      targetHoldingAreaId: newTag.targetHoldingAreaId || undefined,
      itemName: newTag.itemName.trim(),
      itemDescription: newTag.itemDescription.trim() || undefined,
      category: newTag.category,
      quantity,
      unitOfMeasure: newTag.unitOfMeasure,
      estimatedValue: value,
      reason: newTag.reason.trim(),
      photoUrl: newTag.photoUrl || undefined,
      targetDispositionDate: newTag.targetDispositionDate || undefined,
    };

    setCreating(true);
    try {
      const created = await redTagApi.create(payload);
      setRedTags((prev) => [created, ...prev]);
      setCreateOpen(false);
      addToast({ type: 'success', title: 'Red tag created', message: `${created.tagNumber} is registered. Print the tag to attach it to the item.` });
      await refreshMetrics();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not create the red tag', message: getApiErrorMessage(err, 'Could not create the red tag.') });
    } finally {
      setCreating(false);
    }
  };

  // ---------- Disposition ----------
  const openDisposition = (tag: RedTag) => {
    setSelectedTagForDisp(tag);
    const current = DISPOSITION_OPTIONS.find((o) => o.value === tag.dispositionAction);
    setDispAction(current ? current.value : 'SCRAP_RECYCLE');
    setDispJustification(tag.dispositionJustification || '');
    setDispError('');
    setSupervisorApproved(can('RED_TAG_CLOSERS'));
  };

  const handleSubmitDisposition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTagForDisp || submittingDisp) return;
    if (!dispJustification.trim()) {
      setDispError('Explain why this decision is right for the item.');
      return;
    }
    setDispError('');
    setSubmittingDisp(true);
    try {
      const updated = await redTagApi.submitDisposition(selectedTagForDisp.id, {
        dispositionAction: dispAction,
        dispositionJustification: dispJustification.trim(),
        supervisorApproved: can('RED_TAG_CLOSERS') && supervisorApproved,
      });
      replaceTag(updated);
      setSelectedTagForDisp(null);
      addToast(
        updated.status === 'DISPOSITION_APPROVED'
          ? { type: 'success', title: 'Decision approved', message: `${updated.tagNumber}: ${decisionLabel(updated.dispositionAction)} is approved and can be carried out.` }
          : { type: 'success', title: 'Decision proposed', message: `${updated.tagNumber}: ${decisionLabel(updated.dispositionAction)} was sent to a supervisor for approval.` },
      );
      await refreshMetrics();
    } catch (err) {
      addToast({ type: 'error', title: 'Decision not saved', message: getApiErrorMessage(err, 'Could not save the decision.') });
    } finally {
      setSubmittingDisp(false);
    }
  };

  // ---------- Supervisor review ----------
  const handleApprove = async (tag: RedTagRecord) => {
    if (approvingId) return;
    setApprovingId(tag.id);
    try {
      const updated = await capaApi.approveDisposition(tag.id);
      replaceTag(updated);
      addToast({ type: 'success', title: 'Decision approved', message: `${updated.tagNumber}: ${decisionLabel(updated.dispositionAction)} can be carried out.` });
      await refreshMetrics();
    } catch (err) {
      addToast({ type: 'error', title: 'Not approved', message: getApiErrorMessage(err, 'Could not approve the decision.') });
    } finally {
      setApprovingId(null);
    }
  };

  const openReject = (tag: RedTagRecord) => {
    setTagToReject(tag);
    setRejectReason('');
    setRejectError('');
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagToReject || rejecting) return;
    if (!rejectReason.trim()) {
      setRejectError('Give the reason, so a better decision can be proposed.');
      return;
    }
    setRejecting(true);
    try {
      const updated = await capaApi.rejectDisposition(tagToReject.id, rejectReason.trim());
      replaceTag(updated);
      setTagToReject(null);
      addToast({ type: 'warning', title: 'Decision rejected', message: `${updated.tagNumber} needs a new decision.` });
      await refreshMetrics();
    } catch (err) {
      addToast({ type: 'error', title: 'Not rejected', message: getApiErrorMessage(err, 'Could not reject the decision.') });
    } finally {
      setRejecting(false);
    }
  };

  // ---------- Move to holding area ----------
  const openMove = (tag: RedTagRecord) => {
    setTagToMove(tag);
    setMoveHoldingId(tag.targetHoldingAreaId ?? '');
    setMoveError('');
  };

  const handleMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagToMove || moving) return;
    if (!moveHoldingId) {
      setMoveError('Choose the holding area.');
      return;
    }
    setMoving(true);
    try {
      const updated = await capaApi.moveToHolding(tagToMove.id, moveHoldingId);
      replaceTag(updated);
      setTagToMove(null);
      addToast({ type: 'success', title: 'Moved to holding area', message: `${updated.tagNumber} is in ${updated.holdingArea?.name ?? 'the holding area'}.` });
      await refreshMetrics();
    } catch (err) {
      addToast({ type: 'error', title: 'Not moved', message: getApiErrorMessage(err, 'Could not record the move.') });
    } finally {
      setMoving(false);
    }
  };

  // ---------- Close ----------
  const openClose = (tag: RedTag) => {
    setSelectedTagForClose(tag);
    setActualDisposition(tag.dispositionAction ?? '');
    setFinancialRecovered(tag.financialRecovered ? String(tag.financialRecovered) : '');
    setClosurePhotoUrl('');
    setCloseErrors({});
  };

  const handleCloseRedTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTagForClose || closing) return;
    const photoRequired = !keepsInService(actualDisposition || selectedTagForClose.dispositionAction);
    const recovered = financialRecovered === '' ? undefined : Number(financialRecovered);
    const errors: { photo?: string; recovered?: string } = {};
    if (photoRequired && !closurePhotoUrl) errors.photo = 'Add a photo showing the item was disposed of.';
    if (recovered !== undefined && (!Number.isFinite(recovered) || recovered < 0)) errors.recovered = 'Enter 0 or more.';
    setCloseErrors(errors);
    if (errors.photo || errors.recovered) return;

    setClosing(true);
    try {
      const updated = await capaApi.closeRedTag(selectedTagForClose.id, {
        financialRecovered: recovered,
        closurePhotoUrl: closurePhotoUrl || undefined,
        // Only sent when it differs from the approved decision
        actualDispositionAction: actualDisposition && actualDisposition !== selectedTagForClose.dispositionAction ? actualDisposition : undefined,
      });
      replaceTag(updated);
      setSelectedTagForClose(null);
      addToast(
        updated.status === 'RETURNED'
          ? { type: 'success', title: 'Red tag closed', message: `${updated.tagNumber} is closed and the item stays in use (${decisionLabel(updated.actualDispositionAction ?? updated.dispositionAction)}).` }
          : {
              type: 'success',
              title: 'Red tag closed',
              message: `${updated.tagNumber} is closed as disposed${updated.financialRecovered ? `, ${money(updated.financialRecovered)} recovered` : ''}.`,
            },
      );
      await refreshMetrics();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not close the red tag', message: getApiErrorMessage(err, 'Could not close the red tag.') });
    } finally {
      setClosing(false);
    }
  };

  // ---------- Cancel ----------
  const handleCancelTag = async () => {
    if (!tagToCancel || cancelling) return;
    setCancelling(true);
    try {
      const updated = await redTagApi.cancel(tagToCancel.id);
      replaceTag(updated);
      setTagToCancel(null);
      addToast({ type: 'success', title: 'Red tag cancelled', message: `${updated.tagNumber} was cancelled.` });
      await refreshMetrics();
    } catch (err) {
      addToast({ type: 'error', title: 'Could not cancel the red tag', message: getApiErrorMessage(err, 'Could not cancel the red tag.') });
    } finally {
      setCancelling(false);
    }
  };

  // ---------- Print ----------
  const openPrint = async (tag: RedTag) => {
    if (printLoadingId) return;
    setPrintLoadingId(tag.id);
    try {
      setPrintTag(await capaApi.getRedTag(tag.id));
    } catch (err) {
      addToast({ type: 'error', title: 'Could not load the tag', message: getApiErrorMessage(err, 'Could not load the printable tag.') });
    } finally {
      setPrintLoadingId(null);
    }
  };

  // ---------- Derived data ----------
  const filteredTags = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return redTags.filter((t) => {
      if (selectedZoneId !== 'ALL' && t.locationId !== selectedZoneId) return false;
      if (selectedCategory !== 'ALL' && t.category !== selectedCategory) return false;
      if (selectedStatus !== 'ALL' && t.status !== selectedStatus) return false;
      if (selectedAgeingTier !== 'ALL' && t.ageingTier !== selectedAgeingTier) return false;
      if (pastTargetOnly && !t.isPastTarget) return false;
      if (!q) return true;
      return [t.tagNumber, t.itemName, t.itemDescription, t.reason, t.location?.name, t.location?.areaCode, t.holdingArea?.name].some(
        (v) => typeof v === 'string' && v.toLowerCase().includes(q),
      );
    });
  }, [redTags, selectedZoneId, selectedCategory, selectedStatus, selectedAgeingTier, pastTargetOnly, searchQuery]);

  // Zone figures come from the server metrics (one source); selecting a zone never hides the other cards
  const zoneMetrics: ZoneRedTagMetrics[] = useMemo(
    () => (metrics?.zoneBreakdown ?? []).filter((z) => z.totalTags > 0).sort((a, b) => b.activeTags - a.activeTags || a.locationName.localeCompare(b.locationName)),
    [metrics],
  );
  const zoneMetricById = useMemo(() => new Map(zoneMetrics.map((z) => [z.locationId, z])), [zoneMetrics]);

  /** Zones that have at least one tag matching the filters, in the zone-card order. */
  const zoneSections = useMemo(() => {
    const byZone = new Map<string, RedTagRecord[]>();
    for (const t of filteredTags) byZone.set(t.locationId, [...(byZone.get(t.locationId) ?? []), t]);
    const order = new Map(zoneMetrics.map((z, i) => [z.locationId, i]));
    return Array.from(byZone.entries())
      .map(([locationId, items]) => ({ locationId, items, sample: items[0] }))
      .sort((a, b) => (order.get(a.locationId) ?? 999) - (order.get(b.locationId) ?? 999));
  }, [filteredTags, zoneMetrics]);

  const zonesWithOpenTags = zoneMetrics.filter((z) => z.activeTags > 0).length;
  const overdueCount = metrics?.overdueCount ?? 0;

  // ---------- Rendering helpers ----------
  const getAgeingBadge = (tag: RedTagRecord) => {
    const days = tag.ageingDays;
    if (tag.status === 'CANCELLED') return <Badge variant="neutral">Cancelled</Badge>;
    if (tag.status === 'DISPOSED') return <Badge variant="neutral">Disposed after {plural(days, 'day')}</Badge>;
    if (tag.status === 'RETURNED') return <Badge variant="neutral">Returned after {plural(days, 'day')}</Badge>;
    // Past its decide-by date is the overdue signal; the age is in the label
    if (tag.isPastTarget) {
      return (
        <Badge variant="danger" icon={<CalendarX size={11} />}>
          {plural(days, 'day')} · {plural(tag.daysPastTarget ?? 1, 'day')} past decide-by
        </Badge>
      );
    }
    if (days > 30) {
      return (
        <Badge variant="danger" icon={<AlertOctagon size={11} />}>
          {plural(days, 'day')} (over 30)
        </Badge>
      );
    }
    return (
      <Badge variant={days >= 15 ? 'warning' : 'info'} icon={<Clock size={11} />}>
        {plural(days, 'day')}
      </Badge>
    );
  };

  const getStatusBadge = (status: RedTag['status']) => <Badge variant={STATUS_VARIANT[status] ?? 'neutral'}>{redTagStatusLabel(status)}</Badge>;

  const renderTagActions = (tag: RedTagRecord, compact = false) => (
    <>
      <Button type="button" variant="secondary" size="sm" icon={<Printer size={13} />} onClick={() => openPrint(tag)} loading={printLoadingId === tag.id}>
        {compact ? 'Print' : 'Print tag'}
      </Button>
      {can('RED_TAG_REVIEWERS') && (tag.status === 'RED_TAGGED' || tag.status === 'IN_HOLDING_AREA') && (
        <Button type="button" variant="secondary" size="sm" icon={<MoveRight size={13} />} onClick={() => openMove(tag)}>
          {tag.status === 'IN_HOLDING_AREA' ? 'Change holding area' : 'Move to holding area'}
        </Button>
      )}
      {can('RED_TAG_CLOSERS') && tag.status === 'PENDING_DISPOSITION' && (
        <>
          <Button type="button" variant="primary" size="sm" icon={<ShieldCheck size={13} />} onClick={() => void handleApprove(tag)} loading={approvingId === tag.id} disabled={!!approvingId && approvingId !== tag.id}>
            Approve decision
          </Button>
          <Button type="button" variant="secondary" size="sm" icon={<ShieldX size={13} />} onClick={() => openReject(tag)}>
            Reject decision
          </Button>
        </>
      )}
      {can('RED_TAG_REVIEWERS') && !isClosedTagStatus(tag.status) && (
        <Button type="button" variant="secondary" size="sm" onClick={() => openDisposition(tag)}>
          {tag.dispositionAction ? 'Change decision' : 'Decide'}
        </Button>
      )}
      {can('RED_TAG_CLOSERS') && tag.status === 'DISPOSITION_APPROVED' && (
        <Button type="button" variant="primary" size="sm" icon={<CheckCircle2 size={13} />} onClick={() => openClose(tag)}>
          {keepsInService(tag.dispositionAction) ? 'Close, item stays' : 'Close as disposed'}
        </Button>
      )}
      {can('RED_TAG_REVIEWERS') && CANCELLABLE_STATUSES.includes(tag.status) && (
        <Button type="button" variant="ghost" size="sm" icon={<XCircle size={13} />} onClick={() => setTagToCancel(tag)}>
          Cancel tag
        </Button>
      )}
      {can('ACTION_ASSIGNERS') && tag.status !== 'CANCELLED' && (!tag.correctiveAction || tag.correctiveAction.status === 'CLOSED') && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<Wrench size={13} />}
          onClick={() =>
            setRaiseOrigin({ kind: 'redTag', redTagId: tag.id, code: tag.tagNumber, itemName: tag.itemName, reason: tag.reason, locationName: tag.location?.name ?? null })
          }
        >
          Raise corrective action
        </Button>
      )}
    </>
  );

  /** Who tagged, who approved, what was finally done, and any linked corrective action. */
  const renderPeople = (tag: RedTagRecord) => (
    <>
      <dt>Tagged by</dt>
      <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>{personName(tag.taggedBy) || '—'}</dd>
      {tag.supervisorApprovedBy && (
        <>
          <dt>Approved by</dt>
          <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>{personName(tag.supervisorApprovedBy)}</dd>
        </>
      )}
      {tag.actualDispositionDate && (
        <>
          <dt>Closed</dt>
          <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
            {formatDate(tag.actualDispositionDate)}
            {tag.disposedBy ? ` · ${personName(tag.disposedBy)}` : ''}
          </dd>
        </>
      )}
      {tag.actualDispositionAction && tag.actualDispositionAction !== tag.dispositionAction && (
        <>
          <dt>Actually done</dt>
          <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>{decisionLabel(tag.actualDispositionAction)}</dd>
        </>
      )}
      {tag.correctiveAction && (
        <>
          <dt>Corrective action</dt>
          <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600 }}>
            <Link to={`/capa?id=${tag.correctiveAction.id}`} style={{ color: 'var(--color-primary)' }}>
              {tag.correctiveAction.actionCode}
            </Link>{' '}
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>({actionStatusLabel(tag.correctiveAction.status)})</span>
          </dd>
        </>
      )}
    </>
  );

  const pill: React.CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    padding: '4px 10px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12.5px',
  };

  const pastTargetCount = metrics?.pastTargetCount ?? 0;
  const kpis: Array<{ label: string; value: string; icon: React.ReactNode; tone: SummaryTone; selected?: boolean; onClick?: () => void }> = [
    { label: 'Zones with open tags', value: String(zonesWithOpenTags), icon: <Layers size={18} />, tone: 'primary' },
    { label: 'Value on hold (open tags)', value: money(metrics?.totalValue), icon: <Clock size={18} />, tone: 'warning' },
    { label: 'Value recovered', value: money(metrics?.recoveredValue), icon: <CheckCircle2 size={18} />, tone: 'success' },
    {
      label: 'Past decide-by date',
      value: plural(pastTargetCount, 'item'),
      icon: <CalendarX size={18} />,
      tone: pastTargetCount > 0 ? 'danger' : 'neutral',
      selected: pastTargetOnly,
      onClick: () => setPastTargetOnly((v) => !v),
    },
    {
      label: 'Open for over 30 days',
      value: plural(overdueCount, 'item'),
      icon: <AlertOctagon size={18} />,
      tone: overdueCount > 0 ? 'danger' : 'neutral',
      selected: selectedAgeingTier === 'OVER_30_DAYS',
      onClick: () => setSelectedAgeingTier((t) => (t === 'OVER_30_DAYS' ? 'ALL' : 'OVER_30_DAYS')),
    },
  ];
  const holdingBreakdown = metrics?.holdingAreaBreakdown ?? [];

  const hasData = redTags.length > 0;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title={relabel('Red tags')}
        description="Items removed from work areas during Sort (1S), grouped by zone, from tagging to a decision and closure."
        actions={
          <>
            <div role="group" aria-label="Layout" style={{ display: 'flex', gap: '4px' }}>
              <button type="button" className="pillar-tab-pill" aria-pressed={viewMode === 'ZONE_GROUPED'} onClick={() => setViewMode('ZONE_GROUPED')}>
                <Layers size={14} aria-hidden="true" /> By zone
              </button>
              <button type="button" className="pillar-tab-pill" aria-pressed={viewMode === 'MASTER_TABLE'} onClick={() => setViewMode('MASTER_TABLE')}>
                <List size={14} aria-hidden="true" /> Table
              </button>
            </div>
            <Button type="button" variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => loadData()} loading={loading}>
              Refresh
            </Button>
            {can('SHOPFLOOR_REPORTERS') && (
              <Button type="button" variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => openCreate()}>
                New red tag
              </Button>
            )}
          </>
        }
      />

      {loading && !hasData ? (
        <Card>
          <LoadingState label="Loading red tags…" />
        </Card>
      ) : loadError ? (
        <Card>
          <ErrorState message={loadError} onRetry={() => loadData()} />
        </Card>
      ) : !hasData ? (
        <Card>
          <EmptyState
            title="No red tags yet"
            description="Tag items that are not needed in a work area so they can be decided on and removed."
            action={
              can('SHOPFLOOR_REPORTERS') ? (
                <Button type="button" size="sm" icon={<Plus size={14} />} onClick={() => openCreate()}>
                  New red tag
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <SummaryGrid>
            {kpis.map((k) => (
              <SummaryCard key={k.label} label={k.label} value={k.value} icon={k.icon} tone={k.tone} selected={k.selected} onClick={k.onClick} />
            ))}
          </SummaryGrid>

          {/* Where open items wait for a decision */}
          {holdingBreakdown.length > 0 && (
            <section aria-labelledby="red-tag-holding-heading" className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <h2 id="red-tag-holding-heading" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
                Open items by holding area
              </h2>
              <div className="enterprise-table-container">
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th scope="col">Holding area</th>
                      <th scope="col" className="num">
                        Open tags
                      </th>
                      <th scope="col" className="num">
                        Past decide-by
                      </th>
                      <th scope="col" className="num">
                        Value on hold
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdingBreakdown.map((h) => (
                      <tr key={h.holdingAreaId ?? 'none'}>
                        <td>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{h.holdingAreaId ? h.name : 'Not yet moved'}</span>
                          {h.areaCode && <span className="code-tag" style={{ marginLeft: '8px' }}>{h.areaCode}</span>}
                        </td>
                        <td className="num">{h.openTags}</td>
                        <td className="num" style={{ color: h.pastTarget > 0 ? 'var(--color-danger)' : undefined, fontWeight: h.pastTarget > 0 ? 600 : undefined }}>
                          {h.pastTarget}
                        </td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>{money(h.totalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Zone selector */}
          <section aria-labelledby="red-tag-zones-heading">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '8px', minHeight: '32px' }}>
              <h2 id="red-tag-zones-heading" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Zones
              </h2>
              {selectedZoneId !== 'ALL' && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedZoneId('ALL')}>
                  Show all zones
                </Button>
              )}
            </div>
            <div className="grid-auto" style={{ ['--min' as string]: '240px', gap: '12px' } as React.CSSProperties}>
              {[{ id: 'ALL', name: 'All zones', code: '', open: zoneMetrics.reduce((n, z) => n + z.activeTags, 0), overdue: overdueCount, value: metrics?.totalValue ?? 0 }]
                .concat(zoneMetrics.map((z) => ({ id: z.locationId, name: z.locationName || '—', code: z.areaCode, open: z.activeTags, overdue: z.overdueCount, value: z.totalValue })))
                .map((z) => {
                  const selected = selectedZoneId === z.id;
                  return (
                    <button
                      key={z.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedZoneId(selected && z.id !== 'ALL' ? 'ALL' : z.id)}
                      className={`summary-card is-clickable${selected ? ' is-selected' : ''}`}
                      style={{ gap: '8px' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', width: '100%' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={z.name}>
                          {z.name}
                        </span>
                        {z.code && <span className="code-tag" style={{ flexShrink: 0 }}>{z.code}</span>}
                      </span>
                      <span style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <Badge variant={z.open > 0 ? 'info' : 'neutral'}>{plural(z.open, 'open tag')}</Badge>
                        {z.overdue > 0 && (
                          <Badge variant="danger" icon={<AlertOctagon size={11} />}>
                            {z.overdue} over 30 days
                          </Badge>
                        )}
                      </span>
                      <span style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                        <span>Value on hold</span>
                        <strong style={{ color: z.value > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{money(z.value)}</strong>
                      </span>
                    </button>
                  );
                })}
            </div>
          </section>

          {/* Filters */}
          <FilterBar label="Filter red tags">
            <SearchInput label="Search red tags" placeholder="Search by tag number, item, zone or reason" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <select className="form-select" aria-label="Category" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              <option value="ALL">All categories</option>
              {Object.keys(RED_TAG_CATEGORY_LABELS).map((c) => (
                <option key={c} value={c}>
                  {redTagCategoryLabel(c)}
                </option>
              ))}
            </select>
            <select className="form-select" aria-label="Status" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
              <option value="ALL">All statuses</option>
              {Object.keys(RED_TAG_STATUS_LABELS).map((s) => (
                <option key={s} value={s}>
                  {redTagStatusLabel(s)}
                </option>
              ))}
            </select>
            <select className="form-select" aria-label="Age" value={selectedAgeingTier} onChange={(e) => setSelectedAgeingTier(e.target.value)}>
              <option value="ALL">Any age</option>
              {(Object.keys(AGEING_TIER_LABELS) as RedTag['ageingTier'][]).map((t) => (
                <option key={t} value={t}>
                  {AGEING_TIER_LABELS[t]}
                </option>
              ))}
            </select>
            <label htmlFor="rt-past-target" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', minHeight: '40px', cursor: 'pointer' }}>
              <input id="rt-past-target" type="checkbox" checked={pastTargetOnly} onChange={(e) => setPastTargetOnly(e.target.checked)} />
              Past decide-by date
            </label>
          </FilterBar>

          {filteredTags.length === 0 ? (
            <Card>
              <EmptyState title="No red tags match" description="Try another zone, or clear the search and filters." />
            </Card>
          ) : viewMode === 'ZONE_GROUPED' ? (
            /* Zone view: only zones with matching tags */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {zoneSections.map(({ locationId, items, sample }) => {
                const zm = zoneMetricById.get(locationId);
                const loc = locationById.get(locationId);
                const zoneName = zm?.locationName || sample.location?.name || loc?.name || '—';
                const building = zm?.building ?? sample.location?.building ?? loc?.building ?? null;
                const isCollapsed = !!collapsedZones[locationId];
                const panelId = `red-tag-zone-${locationId}`;
                return (
                  <section key={locationId} className="card" style={{ padding: 0, overflow: 'hidden' }} aria-label={zoneName}>
                    <div
                      style={{
                        padding: '16px 20px',
                        background: 'var(--bg-surface)',
                        borderBottom: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`${isCollapsed ? 'Show' : 'Hide'} tags in ${zoneName}`}
                          aria-expanded={!isCollapsed}
                          aria-controls={panelId}
                          onClick={() => setCollapsedZones((prev) => ({ ...prev, [locationId]: !prev[locationId] }))}
                          icon={isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {(zm?.areaCode || sample.location?.areaCode) && <span className="code-tag">{zm?.areaCode || sample.location?.areaCode}</span>}
                            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                              {[building, loc?.floor].filter(Boolean).join(' • ') || '—'}
                            </span>
                          </div>
                          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '4px 0 0 0', overflowWrap: 'anywhere' }}>{zoneName}</h3>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={pill}>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Value on hold</span>
                          <strong style={{ color: 'var(--text-primary)' }}>{money(zm?.totalValue)}</strong>
                        </div>
                        {(zm?.recoveredValue ?? 0) > 0 && (
                          <div style={pill}>
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Recovered</span>
                            <strong style={{ color: 'var(--color-success)' }}>{money(zm?.recoveredValue)}</strong>
                          </div>
                        )}
                        <Badge variant="neutral">{plural(items.length, 'tag')} shown</Badge>
                        {can('SHOPFLOOR_REPORTERS') && (
                          <Button type="button" size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => openCreate(locationId)}>
                            Tag an item here
                          </Button>
                        )}
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div id={panelId} style={{ padding: '16px 20px 20px', background: 'var(--bg-surface-subtle)', borderTop: '1px solid var(--border-subtle)' }}>
                        <div className="grid-auto" style={{ ['--min' as string]: 'min(300px, 100%)', gap: '16px' } as React.CSSProperties}>
                          {items.map((tag) => (
                            <article
                              key={tag.id}
                              id={`red-tag-${tag.id}`}
                              className="card"
                              style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0, ...highlightStyle(tag.id) }}
                            >
                              <div style={{ position: 'relative' }}>
                                <ImageWithFallback src={tag.photoUrl} emptyText="No photo" height="150px" allowZoom alt={`Photo of ${tag.itemName}`} />
                                <span className="code-tag" style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 2, background: 'var(--bg-surface)' }}>
                                  {tag.tagNumber}
                                </span>
                                <span style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 2 }}>{getAgeingBadge(tag)}</span>
                              </div>

                              <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                                  <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0, color: 'var(--text-primary)', lineHeight: 1.4, minWidth: 0, overflowWrap: 'anywhere' }}>{tag.itemName}</h4>
                                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{tag.estimatedValue != null ? money(tag.estimatedValue) : '—'}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Estimated value</div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                  <Badge variant="neutral">{redTagCategoryLabel(tag.category)}</Badge>
                                  <Badge variant="neutral">
                                    {tag.quantity} {RED_TAG_UNIT_LABELS[tag.unitOfMeasure as RedTagUnit]?.toLowerCase() ?? tag.unitOfMeasure}
                                  </Badge>
                                  {getStatusBadge(tag.status)}
                                </div>

                                {tag.itemDescription && <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>{tag.itemDescription}</p>}

                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                                  <strong>Reason:</strong> {tag.reason}
                                </p>

                                {tag.dispositionRejectionReason && tag.status !== 'DISPOSITION_APPROVED' && !isClosedTagStatus(tag.status) && (
                                  <div role="note" style={{ padding: '8px 10px', background: 'var(--color-danger-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', fontSize: '12.5px' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>Decision rejected: </span>
                                    <span style={{ color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{tag.dispositionRejectionReason}</span>
                                  </div>
                                )}

                                {tag.dispositionAction && (
                                  <div style={{ padding: '8px 10px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: '12.5px' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Decision: </span>
                                    <span>{decisionLabel(tag.dispositionAction)}</span>
                                    <span style={{ color: 'var(--text-tertiary)' }}>{keepsInService(tag.dispositionAction) ? ' · item stays in use' : ' · item leaves the site'}</span>
                                    {tag.dispositionJustification && <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>“{tag.dispositionJustification}”</div>}
                                  </div>
                                )}

                                {tag.closurePhotoUrl && (
                                  <div>
                                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Closure photo</div>
                                    <ImageWithFallback src={tag.closurePhotoUrl} height="90px" allowZoom alt={`Closure photo of ${tag.itemName}`} />
                                  </div>
                                )}

                                <dl style={{ margin: 0, marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: '12.5px', color: 'var(--text-secondary)' }} className="keep-cols">
                                  <dt>Holding area</dt>
                                  <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>{tag.holdingArea?.name ?? 'Not yet moved'}</dd>
                                  <dt>Tagged</dt>
                                  <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>{formatDate(tag.taggedDate)}</dd>
                                  {renderPeople(tag)}
                                  {tag.targetDispositionDate && !isClosedTagStatus(tag.status) && (
                                    <>
                                      <dt>Decide by</dt>
                                      <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>{formatDate(tag.targetDispositionDate)}</dd>
                                    </>
                                  )}
                                  {tag.financialRecovered ? (
                                    <>
                                      <dt>Recovered</dt>
                                      <dd style={{ margin: 0, textAlign: 'right', fontWeight: 600, color: 'var(--color-success)' }}>{money(tag.financialRecovered)}</dd>
                                    </>
                                  ) : null}
                                </dl>

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{renderTagActions(tag)}</div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <Card noPadding>
              <div className="enterprise-table-container">
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th scope="col">Tag</th>
                      <th scope="col">Zone</th>
                      <th scope="col">Item</th>
                      <th scope="col">Category</th>
                      <th scope="col">Quantity</th>
                      <th scope="col">Estimated value</th>
                      <th scope="col">Age</th>
                      <th scope="col">Status</th>
                      <th scope="col">Holding area</th>
                      <th scope="col">People</th>
                      <th scope="col" style={{ textAlign: 'right' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTags.map((tag) => (
                      <tr key={tag.id} id={`red-tag-${tag.id}`} style={highlightStyle(tag.id)}>
                        <td>
                          <span className="code-tag">{tag.tagNumber}</span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tag.location?.name ?? '—'}</div>
                          {tag.location?.areaCode && <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{tag.location.areaCode}</div>}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tag.itemName}</td>
                        <td>
                          <Badge variant="neutral">{redTagCategoryLabel(tag.category)}</Badge>
                        </td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          {tag.quantity} {RED_TAG_UNIT_LABELS[tag.unitOfMeasure as RedTagUnit]?.toLowerCase() ?? tag.unitOfMeasure}
                        </td>
                        <td className="num" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{tag.estimatedValue != null ? money(tag.estimatedValue) : '—'}</td>
                        <td>{getAgeingBadge(tag)}</td>
                        <td>{getStatusBadge(tag.status)}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{tag.holdingArea?.name ?? 'Not yet moved'}</td>
                        <td style={{ fontSize: '12.5px', color: 'var(--text-secondary)', minWidth: '160px' }}>
                          <div>Tagged by {personName(tag.taggedBy) || '—'}</div>
                          {tag.supervisorApprovedBy && <div>Approved by {personName(tag.supervisorApprovedBy)}</div>}
                          {tag.actualDispositionDate && <div>Closed {formatDate(tag.actualDispositionDate)}</div>}
                          {tag.correctiveAction && (
                            <div>
                              <Link to={`/capa?id=${tag.correctiveAction.id}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                                {tag.correctiveAction.actionCode}
                              </Link>
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap', minWidth: '180px' }}>{renderTagActions(tag, true)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Modal: new red tag */}
      <Modal
        isOpen={createOpen}
        onClose={() => {
          if (!creating) setCreateOpen(false);
        }}
        title="New red tag"
        subtitle="Record an item that is not needed where it was found."
        maxWidth="640px"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" form="red-tag-create-form" variant="primary" icon={<Plus size={16} />} loading={creating}>
              Create red tag
            </Button>
          </>
        }
      >
        <form id="red-tag-create-form" onSubmit={handleCreateRedTag} noValidate style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="form-section-title" style={{ marginTop: 0 }}>Where and what</div>
          <FormField label="Where was it found?" required error={createErrors.locationId}>
            {(p) => (
              <select {...p} className="form-select" value={newTag.locationId} onChange={(e) => setNewTag({ ...newTag, locationId: e.target.value })}>
                <option value="">Choose a location</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.areaCode} — {l.name}
                    {l.building ? ` (${l.building})` : ''}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField
            label="Holding area"
            hint={holdingAreas.length === 0 ? 'No red-tag holding areas are set up yet.' : 'Choose one if the item has already been moved to a red-tag holding area.'}
          >
            {(p) => (
              <select {...p} className="form-select" value={newTag.targetHoldingAreaId} onChange={(e) => setNewTag({ ...newTag, targetHoldingAreaId: e.target.value })}>
                <option value="">Not yet moved (stays where it was found)</option>
                {holdingAreas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.areaCode} — {l.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="Item name" required error={createErrors.itemName}>
            {(p) => (
              <input
                {...p}
                type="text"
                className="form-input"
                placeholder="e.g. Spare torque wrench"
                value={newTag.itemName}
                onChange={(e) => setNewTag({ ...newTag, itemName: e.target.value })}
              />
            )}
          </FormField>

          <DuplicateChecking active={duplicateCheck.loading} />
          <DuplicateNotice matches={duplicateCheck.matches} description="active red tags at this location" />

          <FormField label="Description">
            {(p) => (
              <textarea
                {...p}
                rows={2}
                className="form-textarea"
                placeholder="Size, model, condition, markings…"
                value={newTag.itemDescription}
                onChange={(e) => setNewTag({ ...newTag, itemDescription: e.target.value })}
              />
            )}
          </FormField>

          <div className="form-section-title">Quantity and value</div>
          <div className="grid-cols-2" style={{ display: 'grid', gap: '0 16px' }}>
            <FormField label="Category" required>
              {(p) => (
                <select {...p} className="form-select" value={newTag.category} onChange={(e) => setNewTag({ ...newTag, category: e.target.value })}>
                  {NEW_TAG_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {redTagCategoryLabel(c)}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="Estimated value (₹)" error={createErrors.estimatedValue}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  inputMode="decimal"
                  className="form-input"
                  min={0}
                  step="0.01"
                  placeholder="Optional"
                  value={newTag.estimatedValue}
                  onChange={(e) => setNewTag({ ...newTag, estimatedValue: e.target.value })}
                />
              )}
            </FormField>
            <FormField label="Quantity" error={createErrors.quantity}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  className="form-input"
                  min={1}
                  step={1}
                  value={newTag.quantity}
                  onChange={(e) => setNewTag({ ...newTag, quantity: e.target.value })}
                />
              )}
            </FormField>
            <FormField label="Unit">
              {(p) => (
                <select {...p} className="form-select" value={newTag.unitOfMeasure} onChange={(e) => setNewTag({ ...newTag, unitOfMeasure: e.target.value as RedTagUnit })}>
                  {RED_TAG_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {RED_TAG_UNIT_LABELS[u]}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>

          <div className="form-section-title">Reason and follow-up</div>
          <FormField label="Why is it tagged?" required error={createErrors.reason}>
            {(p) => (
              <textarea
                {...p}
                rows={3}
                className="form-textarea"
                placeholder="Why is this item not needed here (unused, broken, surplus, unlabelled)?"
                value={newTag.reason}
                onChange={(e) => setNewTag({ ...newTag, reason: e.target.value })}
              />
            )}
          </FormField>

          <FormField label="Decide by" error={createErrors.targetDispositionDate} hint="Leave empty to use 14 days from today.">
            {(p) => (
              <input
                {...p}
                type="date"
                className="form-input"
                min={localDateKey(new Date())}
                value={newTag.targetDispositionDate}
                onChange={(e) => setNewTag({ ...newTag, targetDispositionDate: e.target.value })}
              />
            )}
          </FormField>

          <PhotoEvidenceField
            id="rt-photo"
            label="Photo of the item"
            value={newTag.photoUrl}
            onChange={(url) => setNewTag((prev) => ({ ...prev, photoUrl: url }))}
            onError={(message) => addToast({ type: 'warning', title: 'Photo not attached', message })}
            hint="Optional, but it helps reviewers decide."
            previewAlt="Photo of the tagged item"
          />
        </form>
      </Modal>

      {/* Modal: disposition decision */}
      <Modal
        isOpen={!!selectedTagForDisp}
        onClose={() => {
          if (!submittingDisp) setSelectedTagForDisp(null);
        }}
        title={`Decide what happens to ${selectedTagForDisp?.tagNumber ?? ''}`}
        maxWidth="600px"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setSelectedTagForDisp(null)} disabled={submittingDisp}>
              Cancel
            </Button>
            <Button type="submit" form="red-tag-disposition-form" variant="primary" loading={submittingDisp}>
              {can('RED_TAG_CLOSERS') && supervisorApproved ? 'Approve decision' : 'Send for approval'}
            </Button>
          </>
        }
      >
        {selectedTagForDisp && (
          <form id="red-tag-disposition-form" onSubmit={handleSubmitDisposition} noValidate style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 14px', marginBottom: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-pale)', border: '1px solid var(--color-info-border)', fontSize: '13px' }}>
              <div>
                <strong>Zone:</strong> {selectedTagForDisp.location?.name ?? '—'}
                {selectedTagForDisp.location?.areaCode ? ` (${selectedTagForDisp.location.areaCode})` : ''}
              </div>
              <div style={{ marginTop: '2px' }}>
                <strong>Item:</strong> {selectedTagForDisp.itemName} ({selectedTagForDisp.quantity} {RED_TAG_UNIT_LABELS[selectedTagForDisp.unitOfMeasure as RedTagUnit]?.toLowerCase() ?? selectedTagForDisp.unitOfMeasure}) · Value{' '}
                <strong>{selectedTagForDisp.estimatedValue != null ? money(selectedTagForDisp.estimatedValue) : '—'}</strong>
              </div>
            </div>

            <FormField
              label="Decision"
              required
              hint={
                keepsInService(dispAction)
                  ? 'When closed, the item stays in use and the tag ends as returned.'
                  : 'When closed, the item leaves the site and the tag ends as disposed. A photo is needed to close it.'
              }
            >
              {(p) => (
                <select
                  {...p}
                  className="form-select"
                  value={dispAction}
                  onChange={(e) => setDispAction(DISPOSITION_OPTIONS.find((o) => o.value === e.target.value)?.value ?? 'SCRAP_RECYCLE')}
                >
                  {DISPOSITION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {DECISION_LABELS[o.value]} — {o.description}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField label="Justification" required error={dispError}>
              {(p) => (
                <textarea
                  {...p}
                  rows={3}
                  className="form-textarea"
                  placeholder="Why this decision: who needs it, vendor agreement, scrap quote…"
                  value={dispJustification}
                  onChange={(e) => setDispJustification(e.target.value)}
                />
              )}
            </FormField>

            {can('RED_TAG_CLOSERS') ? (
              <label htmlFor="rt-sup-approved" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 600, minHeight: '40px', cursor: 'pointer' }}>
                <input type="checkbox" id="rt-sup-approved" checked={supervisorApproved} onChange={(e) => setSupervisorApproved(e.target.checked)} />
                Approve this decision now (supervisor)
              </label>
            ) : (
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>A supervisor will be asked to approve this decision.</div>
            )}
          </form>
        )}
      </Modal>

      {/* Modal: close tag */}
      <Modal
        isOpen={!!selectedTagForClose}
        onClose={() => {
          if (!closing) setSelectedTagForClose(null);
        }}
        title={`${selectedTagForClose && keepsInService(selectedTagForClose.dispositionAction) ? 'Close tag, item stays in use' : 'Close tag as disposed'}: ${selectedTagForClose?.tagNumber ?? ''}`}
        maxWidth="560px"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setSelectedTagForClose(null)} disabled={closing}>
              Cancel
            </Button>
            <Button type="submit" form="red-tag-close-form" variant="primary" icon={<CheckCircle2 size={16} />} loading={closing}>
              Close red tag
            </Button>
          </>
        }
      >
        {selectedTagForClose && (
          <form id="red-tag-close-form" onSubmit={handleCloseRedTag} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-pale)', border: '1px solid var(--color-info-border)', fontSize: '13px', lineHeight: 1.5 }}>
              {keepsInService(selectedTagForClose.dispositionAction) ? (
                <>
                  Confirm that <strong>{selectedTagForClose.itemName}</strong> ({selectedTagForClose.location?.name ?? '—'}) was handled as approved —{' '}
                  <strong>{decisionLabel(selectedTagForClose.dispositionAction)}</strong> — and stays in use. The tag closes as <strong>returned</strong>.
                </>
              ) : (
                <>
                  Confirm that <strong>{selectedTagForClose.itemName}</strong> ({selectedTagForClose.location?.name ?? '—'}) was handled as approved —{' '}
                  <strong>{decisionLabel(selectedTagForClose.dispositionAction)}</strong>. The tag closes as <strong>disposed</strong>.
                </>
              )}
            </div>

            <FormField
              label="What was actually done"
              hint={
                actualDisposition && actualDisposition !== selectedTagForClose.dispositionAction
                  ? keepsInService(actualDisposition)
                    ? 'Differs from the approved decision. The item stays in use; the tag closes as returned.'
                    : 'Differs from the approved decision. The item leaves the site; the tag closes as disposed.'
                  : 'As approved, unless you choose otherwise.'
              }
              style={{ marginBottom: 0 }}
            >
              {(p) => (
                <select {...p} className="form-select" value={actualDisposition} onChange={(e) => setActualDisposition(e.target.value)}>
                  {DISPOSITION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {DECISION_LABELS[o.value]}
                      {o.value === selectedTagForClose.dispositionAction ? ' (approved)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <PhotoEvidenceField
              id="rt-closure-photo"
              label={keepsInService(actualDisposition || selectedTagForClose.dispositionAction) ? 'Photo (optional)' : 'Photo of the disposal'}
              required={!keepsInService(actualDisposition || selectedTagForClose.dispositionAction)}
              value={closurePhotoUrl}
              onChange={(url) => {
                setClosurePhotoUrl(url);
                if (url) setCloseErrors((prev) => ({ ...prev, photo: undefined }));
              }}
              onError={(message) => addToast({ type: 'warning', title: 'Photo not attached', message })}
              error={closeErrors.photo}
              previewAlt={`Closure photo for ${selectedTagForClose.tagNumber}`}
            />

            <FormField label="Amount recovered (₹)" error={closeErrors.recovered} style={{ marginBottom: 0 }}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  inputMode="decimal"
                  className="form-input"
                  min={0}
                  step="0.01"
                  placeholder="Optional, e.g. scrap sale or vendor credit"
                  value={financialRecovered}
                  onChange={(e) => setFinancialRecovered(e.target.value)}
                />
              )}
            </FormField>
          </form>
        )}
      </Modal>

      {/* Modal: move to a holding area */}
      <Modal
        isOpen={!!tagToMove}
        onClose={() => {
          if (!moving) setTagToMove(null);
        }}
        title={`Move ${tagToMove?.tagNumber ?? ''} to a holding area`}
        subtitle={tagToMove ? `${tagToMove.itemName}, found at ${tagToMove.location?.name ?? '—'}` : undefined}
        maxWidth="520px"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setTagToMove(null)} disabled={moving}>
              Cancel
            </Button>
            <Button type="submit" form="red-tag-move-form" variant="primary" icon={<MoveRight size={16} />} loading={moving}>
              Record move
            </Button>
          </>
        }
      >
        <form id="red-tag-move-form" onSubmit={handleMove} noValidate>
          <FormField
            label="Holding area"
            required
            error={moveError || undefined}
            hint={holdingAreas.length === 0 ? 'No red-tag holding areas are set up yet, so all locations are listed.' : undefined}
            style={{ marginBottom: 0 }}
          >
            {(p) => (
              <select
                {...p}
                className="form-select"
                value={moveHoldingId}
                onChange={(e) => {
                  setMoveHoldingId(e.target.value);
                  if (e.target.value) setMoveError('');
                }}
              >
                <option value="">Choose a holding area</option>
                {(holdingAreas.length > 0 ? holdingAreas : locations)
                  .filter((l) => l.id !== tagToMove?.locationId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.areaCode} — {l.name}
                    </option>
                  ))}
              </select>
            )}
          </FormField>
        </form>
      </Modal>

      {/* Modal: supervisor rejects a proposed decision */}
      <Modal
        isOpen={!!tagToReject}
        onClose={() => {
          if (!rejecting) setTagToReject(null);
        }}
        title={`Reject decision for ${tagToReject?.tagNumber ?? ''}`}
        subtitle={tagToReject ? `Proposed: ${decisionLabel(tagToReject.dispositionAction)}` : undefined}
        maxWidth="520px"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setTagToReject(null)} disabled={rejecting}>
              Cancel
            </Button>
            <Button type="submit" form="red-tag-reject-form" variant="danger" icon={<ShieldX size={16} />} loading={rejecting}>
              Reject decision
            </Button>
          </>
        }
      >
        <form id="red-tag-reject-form" onSubmit={handleReject} noValidate>
          {tagToReject?.dispositionJustification && (
            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <strong>Justification given:</strong> {tagToReject.dispositionJustification}
            </p>
          )}
          <FormField label="Reason" required error={rejectError || undefined} hint="Shown on the tag so a better decision can be proposed." style={{ marginBottom: 0 }}>
            {(p) => (
              <textarea
                {...p}
                rows={3}
                className="form-textarea"
                maxLength={1000}
                placeholder="e.g. Still usable: relocate it to the assembly line instead of scrapping it"
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  if (e.target.value.trim()) setRejectError('');
                }}
              />
            )}
          </FormField>
        </form>
      </Modal>

      <RaiseCapaModal
        isOpen={!!raiseOrigin}
        origin={raiseOrigin}
        onClose={() => setRaiseOrigin(null)}
        onCreated={(created) => {
          const tagId = raiseOrigin?.kind === 'redTag' ? raiseOrigin.redTagId : null;
          setRaiseOrigin(null);
          if (tagId) {
            setRedTags((prev) => prev.map((t) => (t.id === tagId ? { ...t, correctiveAction: { id: created.id, actionCode: created.actionCode, status: created.status } } : t)));
          }
        }}
      />

      {/* Confirm: cancel tag */}
      <ConfirmDialog
        isOpen={!!tagToCancel}
        title={`Cancel red tag ${tagToCancel?.tagNumber ?? ''}?`}
        message={
          <>
            Use this when the tag was raised by mistake or the item is needed where it is. {tagToCancel?.itemName} will be closed as cancelled. This cannot be undone.
          </>
        }
        confirmLabel="Cancel tag"
        cancelLabel="Keep tag"
        tone="danger"
        busy={cancelling}
        onConfirm={() => void handleCancelTag()}
        onCancel={() => {
          if (!cancelling) setTagToCancel(null);
        }}
      />

      {/* Modal: printable red tag */}
      <Modal isOpen={!!printTag} onClose={() => setPrintTag(null)} title="Print red tag" maxWidth="520px">
        {printTag && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            {/* Printed sheet: always dark text on white paper */}
            <div
              className="printable-red-tag"
              style={{ width: '100%', border: '4px solid #DC2626', borderRadius: '8px', background: '#FFFFFF', color: '#000000', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'Inter, sans-serif' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #DC2626', paddingBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ background: '#DC2626', color: '#FFFFFF', padding: '4px 12px', fontWeight: 900, fontSize: '18px', letterSpacing: '0.05em' }}>5S RED TAG</div>
                <div style={{ fontSize: '16px', fontWeight: 800 }}>{printTag.tagNumber}</div>
              </div>

              <div className="keep-cols" style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                {printTag.qrCodeUrl && <img src={printTag.qrCodeUrl} alt={`QR code linking to red tag ${printTag.tagNumber}`} style={{ width: '110px', height: '110px', border: '1px solid #000' }} />}
                <div style={{ flex: 1, minWidth: '180px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>
                    <strong>Zone:</strong> {printTag.location?.name ?? '—'}
                    {printTag.location?.areaCode ? ` (${printTag.location.areaCode})` : ''}
                  </div>
                  <div>
                    <strong>Item:</strong> {printTag.itemName}
                  </div>
                  <div>
                    <strong>Category:</strong> {redTagCategoryLabel(printTag.category)}
                  </div>
                  <div>
                    <strong>Quantity:</strong> {printTag.quantity} {RED_TAG_UNIT_LABELS[printTag.unitOfMeasure as RedTagUnit]?.toLowerCase() ?? printTag.unitOfMeasure}
                  </div>
                  <div>
                    <strong>Estimated value:</strong> {printTag.estimatedValue != null ? money(printTag.estimatedValue) : '—'}
                  </div>
                  <div>
                    <strong>Tagged:</strong> {formatDate(printTag.taggedDate)}
                  </div>
                  {printTag.targetDispositionDate && (
                    <div>
                      <strong>Decide by:</strong> {formatDate(printTag.targetDispositionDate)}
                    </div>
                  )}
                  {printTag.dispositionAction && (
                    <div>
                      <strong>Decision:</strong> {decisionLabel(printTag.dispositionAction)}
                    </div>
                  )}
                  {printTag.actualDispositionDate && (
                    <div>
                      <strong>Closed:</strong> {formatDate(printTag.actualDispositionDate)}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ borderTop: '1px dashed #DC2626', paddingTop: '8px', fontSize: '11px' }}>
                <strong>Reason:</strong> {printTag.reason}
              </div>

              <div className="keep-cols" style={{ borderTop: '1px solid #000000', paddingTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '10px' }}>
                {/* Names are printed when known; the lines stay for a handwritten signature */}
                <div>Tagged by: {personName(printTag.taggedBy) || '__________________'}</div>
                <div>Supervisor: {personName(printTag.supervisorApprovedBy) || '__________________'}</div>
              </div>
            </div>

            <div className="no-print" style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button type="button" variant="secondary" onClick={() => setPrintTag(null)}>
                Close
              </Button>
              <Button type="button" variant="primary" icon={<Printer size={16} />} onClick={() => window.print()}>
                Print
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
