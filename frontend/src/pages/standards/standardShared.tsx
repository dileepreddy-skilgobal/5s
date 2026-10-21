import React, { useRef } from 'react';
import { Location, OrgNode, ReferencePhoto, Standard, StandardRevision } from '../../types';
import { StandardRevisionDetail } from '../../types/areas';
import { BadgeVariant } from '../../constants/labels';
import { readFileAsDataUrl } from '../../services/masterDataApi';
import { Button } from '../../components/ui/Button';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';

export const fieldErrorStyle: React.CSSProperties = { fontSize: '12.5px', color: 'var(--color-danger)', marginTop: '4px' };

export const SCOPE_LABELS: Record<string, string> = {
  GLOBAL: 'Whole organization',
  PLANT: 'One plant',
  DEPARTMENT: 'One department',
  LOCATION_TYPE: 'One location type',
  SPECIFIC_LOCATION: 'One location',
};
/** Scopes a standard can be created or edited with (LOCATION_TYPE exists only in older data). */
export const EDITABLE_SCOPES = ['GLOBAL', 'PLANT', 'DEPARTMENT', 'SPECIFIC_LOCATION'];
export const scopeLabel = (code: string | null | undefined) => (code ? SCOPE_LABELS[code] ?? code : '—');

export const STANDARD_STATUS_LABELS: Record<Standard['status'], string> = {
  DRAFT: 'Awaiting approval',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};
export const standardStatusVariant = (s: string): BadgeVariant => (s === 'PUBLISHED' ? 'success' : s === 'DRAFT' ? 'warning' : 'neutral');

/** Where a scoped standard applies, e.g. "One plant: Pune". */
export const scopeTargetText = (std: Pick<Standard, 'scopeType' | 'targetOrgNode' | 'targetLocation'>) => {
  const target = std.targetLocation ? `${std.targetLocation.name} (${std.targetLocation.areaCode})` : std.targetOrgNode?.name;
  return target ? `${scopeLabel(std.scopeType)}: ${target}` : scopeLabel(std.scopeType);
};

export type RevisionState = 'IN_FORCE' | 'SUPERSEDED' | 'AWAITING' | 'REJECTED';
/** A revision rejected by an approver never applies; the author drafts a new one. */
export const isRejected = (rev: StandardRevision) => !!(rev as StandardRevisionDetail).rejectedAt;
export const revisionState = (rev: StandardRevision): RevisionState =>
  isRejected(rev) ? 'REJECTED' : !rev.approvedAt ? 'AWAITING' : rev.isCurrent ? 'IN_FORCE' : 'SUPERSEDED';
export const REVISION_STATE_LABELS: Record<RevisionState, string> = { IN_FORCE: 'In force', SUPERSEDED: 'Superseded', AWAITING: 'Awaiting approval', REJECTED: 'Rejected' };
export const REVISION_STATE_VARIANT: Record<RevisionState, BadgeVariant> = { IN_FORCE: 'success', SUPERSEDED: 'neutral', AWAITING: 'warning', REJECTED: 'danger' };

/** The approved revision in force, else the newest revision (a new standard awaiting approval). */
export const displayedRevision = (std: Standard): StandardRevision | null => {
  const revisions = std.revisions ?? [];
  return revisions.find((r) => r.isCurrent && r.approvedAt) ?? std.currentRevision ?? revisions[0] ?? null;
};
export const pendingRevision = (std: Standard): StandardRevision | null => (std.revisions ?? []).find((r) => !r.approvedAt && !isRejected(r)) ?? null;

/** Every photo of one kind on a revision (a standard may show several angles of the standard condition). */
export const photosOf = (rev: StandardRevision | null | undefined, type: ReferencePhoto['type']): ReferencePhoto[] =>
  (Array.isArray(rev?.referencePhotos) ? rev.referencePhotos : []).filter((p) => p.type === type && p.photoUrl);

export const photoOf = (rev: StandardRevision | null | undefined, type: ReferencePhoto['type']) => photosOf(rev, type)[0] ?? null;

/** Next revision number after "1.0" → "2.0"; anything unparseable gives an empty field for the user to fill. */
export const nextRevisionNumber = (current?: string | null) => {
  const n = parseFloat(current ?? '');
  return Number.isFinite(n) ? (Math.floor(n) + 1).toFixed(1) : '';
};

/** Org units that fit a scope; falls back to every unit when none has the matching type. */
export const targetNodesFor = (scope: string, nodes: OrgNode[]) => {
  const types = scope === 'PLANT' ? ['PLANT'] : scope === 'DEPARTMENT' ? ['DEPARTMENT', 'SUB_DEPARTMENT'] : [];
  const matching = nodes.filter((n) => types.includes(n.nodeType));
  return matching.length ? matching : nodes;
};

export interface PhotoValue {
  photoUrl: string;
  description: string;
}

export const emptyPhoto = (): PhotoValue => ({ photoUrl: '', description: '' });

/** Form values for every photo of one kind; at least one (empty) slot so the upload control shows. */
export const photoValuesOf = (rev: StandardRevision | null | undefined, type: ReferencePhoto['type']): PhotoValue[] => {
  const photos = photosOf(rev, type).map((p) => ({ photoUrl: p.photoUrl, description: p.description ?? '' }));
  return photos.length ? photos : [emptyPhoto()];
};

/** Builds the reference photo list from the form (several per kind); photos left empty are not sent. */
export const toReferencePhotos = (standardPhotos: PhotoValue[], defectPhotos: PhotoValue[]): ReferencePhoto[] => {
  const build = (values: PhotoValue[], type: ReferencePhoto['type'], label: string): ReferencePhoto[] =>
    values
      .filter((v) => v.photoUrl)
      .map((v, i, all) => ({ type, photoUrl: v.photoUrl, label: all.length > 1 ? `${label} ${i + 1}` : label, description: v.description.trim() || undefined }));
  return [...build(standardPhotos, 'STANDARD_CONDITION', 'Standard condition'), ...build(defectPhotos, 'CURRENT_CONDITION', 'Defect example')];
};

/** Most photos of one kind per revision (keeps revisions light enough for phones on the shop floor). */
export const MAX_PHOTOS_PER_KIND = 6;

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** One reference photo: upload from the device, preview, remove, and a short description of what it shows. */
export const PhotoField: React.FC<{
  id: string;
  label: string;
  tone: 'success' | 'danger';
  value: PhotoValue;
  onChange: (value: PhotoValue) => void;
  onError: (message: string | null) => void;
}> = ({ id, label, tone, value, onChange, onError }) => {
  const input = useRef<HTMLInputElement>(null);
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return onError('Choose an image file (JPG, PNG or WebP).');
    if (file.size > MAX_PHOTO_BYTES) return onError('A photo can be at most 8 MB.');
    try {
      onChange({ ...value, photoUrl: await readFileAsDataUrl(file) });
      onError(null);
    } catch {
      onError('The photo could not be read.');
    }
  };
  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
      <span id={`${id}-label`} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
        <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: 'var(--radius-full)', background: tone === 'success' ? 'var(--color-success)' : 'var(--color-danger)' }} />
        {label}
      </span>
      <ImageWithFallback src={value.photoUrl || undefined} alt={label} aspectRatio="4 / 3" emptyText="No photo" />
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input ref={input} type="file" accept="image/*" style={{ display: 'none' }} onChange={pick} aria-labelledby={`${id}-label`} />
        <Button type="button" size="sm" variant="secondary" icon={<ImagePlus size={16} />} onClick={() => input.current?.click()}>
          {value.photoUrl ? 'Replace' : 'Upload photo'}
        </Button>
        {value.photoUrl && (
          <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={16} />} onClick={() => onChange({ ...value, photoUrl: '' })}>
            Remove
          </Button>
        )}
      </div>
      <label className="form-label" htmlFor={`${id}-description`} style={{ marginBottom: 0 }}>What it shows</label>
      <input id={`${id}-description`} type="text" className="form-input" maxLength={300} value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} />
    </div>
  );
};

/** Several photos of one kind (e.g. the standard condition from different angles); always at least one slot. */
export const PhotoListField: React.FC<{
  id: string;
  label: string;
  tone: 'success' | 'danger';
  values: PhotoValue[];
  onChange: (values: PhotoValue[]) => void;
  onError: (message: string | null) => void;
}> = ({ id, label, tone, values, onChange, onError }) => {
  const list = values.length ? values : [emptyPhoto()];
  const canAdd = list.length < MAX_PHOTOS_PER_KIND && list.every((v) => v.photoUrl);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
      {list.map((value, idx) => (
        <div key={idx} style={{ position: 'relative', minWidth: 0 }}>
          <PhotoField
            id={`${id}-${idx}`}
            label={list.length > 1 ? `${label} ${idx + 1}` : label}
            tone={tone}
            value={value}
            onChange={(v) => onChange(list.map((x, i) => (i === idx ? v : x)))}
            onError={onError}
          />
          {list.length > 1 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={<X size={16} />}
              aria-label={`Remove ${label.toLowerCase()} ${idx + 1}`}
              title="Remove this photo"
              onClick={() => onChange(list.filter((_, i) => i !== idx))}
              style={{ position: 'absolute', top: '6px', right: '6px' }}
            />
          )}
        </div>
      ))}
      {canAdd && (
        <Button type="button" size="sm" variant="secondary" icon={<Plus size={16} />} onClick={() => onChange([...list, emptyPhoto()])}>
          Add another photo
        </Button>
      )}
    </div>
  );
};

/** Editable list of rule statements (at least one row is always shown). */
export const RulesEditor: React.FC<{ rules: string[]; onChange: (rules: string[]) => void; error?: string; idPrefix: string }> = ({ rules, onChange, error, idPrefix }) => (
  <div className="form-group">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
      <span className="form-label" id={`${idPrefix}-rules-label`} style={{ margin: 0 }}>Rules <span className="required">*</span></span>
      <Button type="button" size="sm" variant="secondary" icon={<Plus size={16} />} onClick={() => onChange([...rules, ''])}>
        Add rule
      </Button>
    </div>
    <div role="group" aria-labelledby={`${idPrefix}-rules-label`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {rules.map((rule, idx) => (
        <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span aria-hidden="true" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-tertiary)', width: '20px', flexShrink: 0 }}>{idx + 1}.</span>
          <input
            type="text"
            value={rule}
            aria-label={`Rule ${idx + 1}`}
            onChange={(e) => onChange(rules.map((r, i) => (i === idx ? e.target.value : r)))}
            className="form-input"
          />
          {rules.length > 1 && (
            <Button type="button" size="sm" variant="ghost" icon={<X size={16} />} aria-label={`Remove rule ${idx + 1}`} title="Remove rule" onClick={() => onChange(rules.filter((_, i) => i !== idx))} style={{ flexShrink: 0 }} />
          )}
        </div>
      ))}
    </div>
    {error && <div role="alert" className="form-error" style={fieldErrorStyle}>{error}</div>}
  </div>
);

/** Target select for the plant / department / location scopes. */
export const ScopeTargetField: React.FC<{
  id: string;
  scope: string;
  orgNodes: OrgNode[];
  locations: Location[];
  targetOrgNodeId: string;
  targetLocationId: string;
  onChange: (next: { targetOrgNodeId: string; targetLocationId: string }) => void;
  error?: string;
}> = ({ id, scope, orgNodes, locations, targetOrgNodeId, targetLocationId, onChange, error }) => {
  if (scope === 'PLANT' || scope === 'DEPARTMENT') {
    return (
      <div className="form-group">
        <label className="form-label" htmlFor={id}>{scope === 'PLANT' ? 'Plant' : 'Department'} <span className="required">*</span></label>
        <select id={id} className="form-select" value={targetOrgNodeId} onChange={(e) => onChange({ targetOrgNodeId: e.target.value, targetLocationId: '' })} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}>
          <option value="">Choose…</option>
          {targetNodesFor(scope, orgNodes).map((n) => <option key={n.id} value={n.id}>{n.name} ({n.code})</option>)}
        </select>
        {error && <div id={`${id}-error`} className="form-error" style={fieldErrorStyle}>{error}</div>}
      </div>
    );
  }
  if (scope === 'SPECIFIC_LOCATION') {
    return (
      <div className="form-group">
        <label className="form-label" htmlFor={id}>Location <span className="required">*</span></label>
        <select id={id} className="form-select" value={targetLocationId} onChange={(e) => onChange({ targetOrgNodeId: '', targetLocationId: e.target.value })} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}>
          <option value="">Choose…</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.areaCode})</option>)}
        </select>
        {error && <div id={`${id}-error`} className="form-error" style={fieldErrorStyle}>{error}</div>}
      </div>
    );
  }
  return null;
};

/** Validates the scope target the backend requires; returns an error message or null. */
export const scopeTargetError = (scope: string, targetOrgNodeId: string, targetLocationId: string) =>
  (scope === 'PLANT' || scope === 'DEPARTMENT') && !targetOrgNodeId
    ? `Choose the ${scope === 'PLANT' ? 'plant' : 'department'}.`
    : scope === 'SPECIFIC_LOCATION' && !targetLocationId
      ? 'Choose the location.'
      : null;

export const isHttpUrl = (v: string) => /^https?:\/\/\S+$/i.test(v.trim());
