import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { api, getApiErrorMessage } from '../../services/api';
import { masterDataApi, LocationPayload, readFileAsDataUrl } from '../../services/masterDataApi';
import { Location, OrgNode, User } from '../../types';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { DuplicateNotice, DuplicateChecking, useDuplicateCheck } from '../../components/common/DuplicateNotice';
import { FREQUENCY_LABELS, LOCATION_STATUS_LABELS, LOCATION_TYPE_LABELS, RISK_LABELS } from '../../constants/labels';
import { ImagePlus, Trash2 } from 'lucide-react';

/** Audit frequencies a location accepts (backend AUDIT_FREQUENCIES); ANNUALLY is a schedule recurrence only. */
export const LOCATION_FREQUENCIES = ['DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY'];
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export const fieldErrorStyle: React.CSSProperties = { fontSize: '12.5px', color: 'var(--color-danger)', marginTop: '4px' };

interface FormState {
  areaCode: string;
  name: string;
  orgNodeId: string;
  locationType: string;
  riskLevel: string;
  auditFrequency: string;
  status: string;
  ownerId: string;
  backupOwnerId: string;
  building: string;
  floor: string;
  description: string;
  /** Current photo reference, a new data: URL, or '' for none. */
  heroPhotoUrl: string;
}

type Errors = Partial<Record<'areaCode' | 'name' | 'orgNodeId' | 'backupOwnerId' | 'photo' | 'form', string>>;

const fromLocation = (loc: Location | null | undefined, defaultNodeId: string): FormState => ({
  areaCode: loc?.areaCode ?? '',
  name: loc?.name ?? '',
  orgNodeId: loc?.orgNodeId ?? defaultNodeId,
  locationType: loc?.locationType ?? 'PRODUCTION_LINE',
  riskLevel: loc?.riskLevel ?? 'MEDIUM',
  auditFrequency: loc?.auditFrequency ?? 'WEEKLY',
  status: loc?.status ?? 'ACTIVE',
  ownerId: loc?.ownerId ?? '',
  backupOwnerId: loc?.backupOwnerId ?? '',
  building: loc?.building ?? '',
  floor: loc?.floor ?? '',
  description: loc?.description ?? '',
  heroPhotoUrl: loc?.heroPhotoUrl ?? '',
});

interface LocationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The location being edited; omitted to create a new one. */
  location?: Location | null;
  orgNodes: OrgNode[];
  users: User[];
  onSaved: (location: Location) => void;
}

/** Create a location, or edit an existing one's details (including the baseline photo shown on its page). */
export const LocationFormModal: React.FC<LocationFormModalProps> = ({ isOpen, onClose, location, orgNodes, users, onSaved }) => {
  const editing = !!location;
  const [form, setForm] = useState<FormState>(() => fromLocation(location, orgNodes[0]?.id ?? ''));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const formId = editing ? 'location-edit-form' : 'location-create-form';

  // Fresh form each time the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setForm(fromLocation(location, orgNodes[0]?.id ?? ''));
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, location?.id]);

  // The first org unit may arrive after the dialog opened
  useEffect(() => {
    if (isOpen && !editing && !form.orgNodeId && orgNodes[0]) setForm((f) => ({ ...f, orgNodeId: orgNodes[0].id }));
  }, [isOpen, editing, form.orgNodeId, orgNodes]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const dupName = form.name.trim();
  const duplicateCheck = useDuplicateCheck(
    isOpen && !editing && dupName.length >= 3 ? `${form.orgNodeId}|${dupName.toLowerCase()}` : '',
    async () =>
      (await api.findDuplicateLocations({ name: dupName, orgNodeId: form.orgNodeId || undefined })).map((d) => ({
        id: d.id,
        code: d.areaCode,
        title: d.name,
        status: d.status,
        similarity: d.similarity,
        link: `/locations/${d.id}`,
      })),
  );

  const suggestCode = async () => {
    try {
      const code = await api.getNextLocationCode(form.orgNodeId || undefined);
      if (code) set('areaCode', code);
    } catch (err) {
      setErrors((e) => ({ ...e, areaCode: getApiErrorMessage(err, 'No code could be suggested; leave it blank to generate one.') }));
    }
  };

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrors((x) => ({ ...x, photo: 'Choose an image file (JPG, PNG or WebP).' }));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setErrors((x) => ({ ...x, photo: 'The photo can be at most 8 MB.' }));
      return;
    }
    try {
      set('heroPhotoUrl', await readFileAsDataUrl(file));
      setErrors((x) => ({ ...x, photo: undefined }));
    } catch {
      setErrors((x) => ({ ...x, photo: 'The photo could not be read.' }));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    if (!form.name.trim()) next.name = 'Enter a name.';
    if (!form.orgNodeId) next.orgNodeId = 'Choose the organization unit.';
    if (form.backupOwnerId && form.backupOwnerId === form.ownerId) next.backupOwnerId = 'The backup owner must be a different person.';
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload: LocationPayload = {
      name: form.name.trim(),
      orgNodeId: form.orgNodeId,
      locationType: form.locationType,
      riskLevel: form.riskLevel,
      auditFrequency: form.auditFrequency,
      building: form.building.trim(),
      floor: form.floor.trim(),
      description: form.description.trim(),
    };
    // Only send the photo when it changed (an unchanged value is a signed URL)
    if (form.heroPhotoUrl !== (location?.heroPhotoUrl ?? '')) payload.heroPhotoUrl = form.heroPhotoUrl;

    setSaving(true);
    try {
      let saved: Location;
      if (editing && location) {
        saved = await masterDataApi.updateLocation(location.id, {
          ...payload,
          status: form.status,
          ownerId: form.ownerId || null,
          backupOwnerId: form.backupOwnerId || null,
        });
      } else {
        saved = await masterDataApi.createLocation({
          ...payload,
          areaCode: form.areaCode.trim() ? form.areaCode.trim().toUpperCase() : undefined,
          ownerId: form.ownerId || undefined,
          backupOwnerId: form.backupOwnerId || undefined,
        });
      }
      onSaved(saved);
    } catch (err) {
      const message = getApiErrorMessage(err, editing ? 'The location could not be saved.' : 'The location could not be created.');
      if (isAxiosError(err) && err.response?.status === 409) setErrors({ areaCode: message });
      else setErrors({ form: message });
    } finally {
      setSaving(false);
    }
  };

  const ownerOptions = users.map((u) => (
    <option key={u.id} value={u.id}>
      {u.firstName} {u.lastName}{u.jobTitle ? ` (${u.jobTitle})` : ''}
    </option>
  ));

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !saving && onClose()}
      title={editing ? 'Edit location details' : 'New location'}
      subtitle={editing ? location?.areaCode : 'Each location gets a QR tag and the standard 5S milestones.'}
      maxWidth="640px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} loading={saving} disabled={!editing && orgNodes.length === 0}>
            {editing ? 'Save changes' : 'Create location'}
          </Button>
        </>
      }
    >
      {!editing && orgNodes.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
          Locations belong to a unit of the organization structure. <Link to="/organization">Set up the structure</Link> first.
        </p>
      ) : (
        <form id={formId} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-section-title" style={{ margin: 0 }}>Identity</div>
          {!editing && (
            <div className="form-group">
              <label className="form-label" htmlFor="loc-area-code">Area code</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="loc-area-code"
                  type="text"
                  className="form-input"
                  value={form.areaCode}
                  onChange={(e) => set('areaCode', e.target.value)}
                  aria-invalid={!!errors.areaCode}
                  aria-describedby={errors.areaCode ? 'loc-area-code-error' : 'loc-area-code-hint'}
                />
                <Button type="button" variant="secondary" onClick={suggestCode} style={{ flexShrink: 0 }}>Suggest</Button>
              </div>
              {errors.areaCode ? (
                <div id="loc-area-code-error" className="form-error" style={fieldErrorStyle}>{errors.areaCode}</div>
              ) : (
                <span id="loc-area-code-hint" className="form-hint">Printed on the QR tag. Leave blank to generate one; it cannot be changed later.</span>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="loc-name">Name <span className="required">*</span></label>
            <input
              id="loc-name"
              type="text"
              className="form-input"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'loc-name-error' : undefined}
            />
            {errors.name && <div id="loc-name-error" className="form-error" style={fieldErrorStyle}>{errors.name}</div>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="loc-node">Organization unit <span className="required">*</span></label>
            <select
              id="loc-node"
              className="form-select"
              value={form.orgNodeId}
              onChange={(e) => set('orgNodeId', e.target.value)}
              aria-invalid={!!errors.orgNodeId}
              aria-describedby={errors.orgNodeId ? 'loc-node-error' : undefined}
            >
              {!form.orgNodeId && <option value="">Choose a unit</option>}
              {orgNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {'— '.repeat(n.depth ?? 0)}{n.name} ({n.code})
                </option>
              ))}
            </select>
            {errors.orgNodeId && <div id="loc-node-error" className="form-error" style={fieldErrorStyle}>{errors.orgNodeId}</div>}
          </div>

          {!editing && (
            <>
              <DuplicateChecking active={duplicateCheck.loading} />
              <DuplicateNotice matches={duplicateCheck.matches} description="locations in this unit" />
            </>
          )}

          <div className="form-section-title" style={{ margin: 0 }}>Classification, ownership and place</div>
          <div className="grid-auto" style={{ ['--min' as string]: '220px', gap: '16px' } as React.CSSProperties}>
            <div className="form-group">
              <label className="form-label" htmlFor="loc-type">Type</label>
              <select id="loc-type" className="form-select" value={form.locationType} onChange={(e) => set('locationType', e.target.value)}>
                {Object.entries(LOCATION_TYPE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="loc-risk">Risk level</label>
              <select id="loc-risk" className="form-select" value={form.riskLevel} onChange={(e) => set('riskLevel', e.target.value)}>
                {Object.entries(RISK_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="loc-frequency">Audit frequency</label>
              <select id="loc-frequency" className="form-select" value={form.auditFrequency} onChange={(e) => set('auditFrequency', e.target.value)}>
                {LOCATION_FREQUENCIES.map((code) => <option key={code} value={code}>{FREQUENCY_LABELS[code]}</option>)}
              </select>
            </div>
            {editing && (
              <div className="form-group">
                <label className="form-label" htmlFor="loc-status">Status</label>
                <select id="loc-status" className="form-select" value={form.status} onChange={(e) => set('status', e.target.value)} aria-describedby="loc-status-hint">
                  {Object.entries(LOCATION_STATUS_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                </select>
                <span id="loc-status-hint" className="form-hint">Inactive locations stay in history but are no longer planned for audits.</span>
              </div>
            )}
            <div className="form-group">
              <label className="form-label" htmlFor="loc-owner">Area owner</label>
              <select id="loc-owner" className="form-select" value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
                <option value="">Unassigned</option>
                {ownerOptions}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="loc-backup-owner">Backup owner</label>
              <select
                id="loc-backup-owner"
                className="form-select"
                value={form.backupOwnerId}
                onChange={(e) => set('backupOwnerId', e.target.value)}
                aria-invalid={!!errors.backupOwnerId}
                aria-describedby={errors.backupOwnerId ? 'loc-backup-owner-error' : undefined}
              >
                <option value="">None</option>
                {ownerOptions}
              </select>
              {errors.backupOwnerId && <div id="loc-backup-owner-error" className="form-error" style={fieldErrorStyle}>{errors.backupOwnerId}</div>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="loc-building">Building</label>
              <input id="loc-building" type="text" className="form-input" value={form.building} onChange={(e) => set('building', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="loc-floor">Floor</label>
              <input id="loc-floor" type="text" className="form-input" value={form.floor} onChange={(e) => set('floor', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="loc-description">Description</label>
            <textarea id="loc-description" className="form-textarea" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>

          <div className="form-section-title" style={{ margin: 0 }}>Photo</div>
          <div className="form-group">
            <span className="form-label" id="loc-photo-label">Baseline photo</span>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: '160px', maxWidth: '100%' }}>
                <ImageWithFallback src={form.heroPhotoUrl || undefined} alt={`Baseline photo of ${form.name || 'the location'}`} aspectRatio="4 / 3" emptyText="No photo yet" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <input ref={photoInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickPhoto} aria-labelledby="loc-photo-label" />
                <Button type="button" size="sm" variant="secondary" icon={<ImagePlus size={14} />} onClick={() => photoInput.current?.click()}>
                  {form.heroPhotoUrl ? 'Replace photo' : 'Upload photo'}
                </Button>
                {form.heroPhotoUrl && (
                  <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => set('heroPhotoUrl', '')}>
                    Remove photo
                  </Button>
                )}
              </div>
            </div>
            {errors.photo ? (
              <div className="form-error" style={fieldErrorStyle}>{errors.photo}</div>
            ) : (
              <span className="form-hint">A photo of the area in its agreed 5S condition, shown at the top of the location page.</span>
            )}
          </div>

          {errors.form && <p role="alert" className="form-error" style={{ margin: 0 }}>{errors.form}</p>}
        </form>
      )}
    </Modal>
  );
};
