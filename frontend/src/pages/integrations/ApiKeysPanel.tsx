import React, { useCallback, useEffect, useState } from 'react';
import { Ban, KeyRound, Plus, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { API_BASE_URL, api, getApiErrorMessage, isPlanFeatureRequiredError } from '../../services/api';
import { ApiKeyRecord, ApiKeyRole, CreatedApiKey } from '../../types';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/StateViews';
import { PlanUpgradeNotice } from '../../components/common/PlanUpgradeNotice';
import { API_KEY_STATUS_LABELS, CodeBlock, FormError, SecretReveal, monoStyle, sectionHintStyle } from './integrationsShared';
import { humanize } from '../../constants/labels';

/** Mirrors backend API_KEY_ROLES (core/integrations/api-keys.service.ts). */
export const API_KEY_ROLES: Array<{ value: ApiKeyRole; label: string }> = [
  { value: 'ORG_ADMIN', label: 'Org admin' },
  { value: 'PLANT_HEAD', label: 'Plant head' },
  { value: 'COORDINATOR_5S', label: '5S coordinator' },
  { value: 'DEPT_HEAD', label: 'Department head' },
  { value: 'AUDITOR', label: 'Auditor' },
  { value: 'EXTERNAL_AUDITOR', label: 'External auditor' },
];

const roleLabel = (code: string) => API_KEY_ROLES.find((r) => r.value === code)?.label ?? code;

/** Path prefixes an API key is refused on (backend BLOCKED_PATHS). */
const BLOCKED_AREAS = ['/auth', '/api-keys', '/webhooks', '/settings', '/platform', '/notifications'];

const STATUS_VARIANT: Record<string, 'success' | 'neutral' | 'warning'> = { ACTIVE: 'success', REVOKED: 'neutral', EXPIRED: 'warning' };

interface KeyForm {
  name: string;
  roleCode: ApiKeyRole;
  readOnly: boolean;
  /** yyyy-mm-dd from the date input; empty = never expires. */
  expiresOn: string;
}

const EMPTY_FORM: KeyForm = { name: '', roleCode: 'AUDITOR', readOnly: true, expiresOn: '' };

const isoDay = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const ApiKeysPanel: React.FC = () => {
  const { addToast } = useApp();
  const { formatDate, formatDateTime, formatRelative } = useI18n();
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planLocked, setPlanLocked] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<KeyForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await api.getApiKeys());
      setPlanLocked(false);
    } catch (err) {
      if (isPlanFeatureRequiredError(err)) setPlanLocked(true);
      else setError(getApiErrorMessage(err, 'Could not load API keys.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setCreated(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (creating) return;
    setModalOpen(false);
    // The key is gone for good once the dialog closes
    setCreated(null);
  };

  const validate = (): string | null => {
    const name = form.name.trim();
    if (name.length < 2 || name.length > 80) return 'Name must be 2–80 characters.';
    if (form.expiresOn && form.expiresOn <= isoDay()) return 'The expiry date must be in the future.';
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      // End of the chosen day in the user's time zone
      const expiresAt = form.expiresOn ? new Date(`${form.expiresOn}T23:59:59`).toISOString() : undefined;
      const res = await api.createApiKey({ name: form.name.trim(), roleCode: form.roleCode, readOnly: form.readOnly, ...(expiresAt ? { expiresAt } : {}) });
      if (!res?.key) throw new Error('The server did not return the new key.');
      setCreated(res);
      load();
    } catch (err) {
      if (isPlanFeatureRequiredError(err)) {
        setModalOpen(false);
        setPlanLocked(true);
      } else {
        setFormError(getApiErrorMessage(err, (err as Error)?.message || 'Could not create the API key.'));
      }
    } finally {
      setCreating(false);
    }
  };

  // Key waiting for the revoke confirmation
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRecord | null>(null);

  const revoke = async (key: ApiKeyRecord) => {
    setRevokeTarget(null);
    setRevokingId(key.id);
    try {
      await api.revokeApiKey(key.id);
      addToast({ type: 'success', title: 'API key revoked', message: `"${key.name}" can no longer be used.` });
      await load();
    } catch (err) {
      addToast({ type: 'error', title: 'API key not revoked', message: getApiErrorMessage(err, 'Could not revoke the API key.') });
    } finally {
      setRevokingId(null);
    }
  };

  if (planLocked) {
    return (
      <PlanUpgradeNotice
        feature="API access"
        description="API keys let other systems read and update your 5S data. API access is not included in your organization's current plan."
      />
    );
  }

  const curlExample = (key: string) => `curl -H "X-API-Key: ${key}" ${API_BASE_URL}/locations`;
  const activeCount = keys.filter((k) => k.status === 'ACTIVE').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card
        title="API keys"
        subtitle={loading ? 'Loading…' : `${activeCount} active of ${keys.length}`}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={16} />} onClick={load} disabled={loading}>
              Refresh
            </Button>
            <Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={openCreate}>
              Create API key
            </Button>
          </>
        }
        noPadding
      >
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading && keys.length === 0 ? (
          <LoadingState label="Loading API keys…" />
        ) : keys.length === 0 ? (
          <EmptyState
            icon={<KeyRound size={28} />}
            title="No API keys yet"
            description="Create a key to connect an ERP, BI tool or script to your 5S data."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="enterprise-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Acts as</th>
                  <th>Access</th>
                  <th>Status</th>
                  <th>Last used</th>
                  <th>Expires</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const inactive = k.status !== 'ACTIVE';
                  return (
                    <tr key={k.id} style={{ opacity: inactive ? 0.65 : 1 }}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{k.name || '—'}</td>
                      <td>
                        <code className="code-tag">{k.prefix ? `${k.prefix}…` : '—'}</code>
                      </td>
                      <td>{roleLabel(k.roleCode)}</td>
                      <td>
                        <Badge variant={k.readOnly ? 'info' : 'purple'}>{k.readOnly ? 'Read-only' : 'Read & write'}</Badge>
                      </td>
                      <td>
                        <Badge variant={STATUS_VARIANT[k.status] ?? 'neutral'}>{API_KEY_STATUS_LABELS[k.status] ?? humanize(k.status)}</Badge>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }} title={formatDateTime(k.lastUsedAt) || undefined}>{k.lastUsedAt ? formatRelative(k.lastUsedAt) : 'Never'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{k.expiresAt ? formatDate(k.expiresAt) : 'Never'}</td>
                      <td style={{ whiteSpace: 'nowrap' }} title={formatDateTime(k.createdAt) || undefined}>{formatDate(k.createdAt) || '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {k.status === 'ACTIVE' ? (
                          <Button variant="danger" size="sm" icon={<Ban size={16} />} loading={revokingId === k.id} onClick={() => setRevokeTarget(k)} aria-label={`Revoke ${k.name || 'API key'}`}>
                            Revoke
                          </Button>
                        ) : (
                          <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Using an API key">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={sectionHintStyle}>
            Send the key in the <code style={monoStyle}>X-API-Key</code> header. A key acts with the permissions of the role chosen when it was
            created, within your organization only; read-only keys can only make GET requests. Revoke a key as soon as it is no longer needed.
          </p>
          <p style={sectionHintStyle}>
            For security, API keys cannot reach identity, settings or key-management endpoints:{' '}
            {BLOCKED_AREAS.map((path, i) => (
              <React.Fragment key={path}>
                {i > 0 && ', '}
                <code style={monoStyle}>{path}</code>
              </React.Fragment>
            ))}
            . Those stay limited to signed-in administrators.
          </p>
          <CodeBlock label="Example" code={curlExample('<your-api-key>')} />
        </div>
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={created ? 'API key created' : 'Create API key'}
        subtitle={created ? created.name : 'The key is shown once, right after it is created.'}
        maxWidth="620px"
        footer={
          created ? (
            <Button variant="primary" onClick={closeModal}>
              I have stored the key
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={closeModal} disabled={creating}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="api-key-form" loading={creating}>
                Create key
              </Button>
            </>
          )
        }
      >
        {created ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <SecretReveal
              label="API key"
              value={created.key}
              warning={
                <>
                  <strong>Copy this key now — you won't see it again.</strong> Only a short prefix ({created.prefix || '—'}…) is stored for
                  display. If the key is lost, revoke it and create a new one.
                </>
              }
            />
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Acts as <strong>{roleLabel(created.roleCode)}</strong>, {created.readOnly ? 'read-only' : 'read & write'},{' '}
              {created.expiresAt ? `expires ${formatDate(created.expiresAt)}` : 'never expires'}.
            </div>
            <CodeBlock label="Try it" code={curlExample(created.key)} />
          </div>
        ) : (
          <form id="api-key-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="api-key-name">
                Name<span className="required" aria-hidden="true"> *</span>
              </label>
              <input
                id="api-key-name"
                className="form-input"
                aria-required="true"
                value={form.name}
                maxLength={80}
                autoFocus
                placeholder="e.g. Power BI dashboard"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <div className="form-hint">Who or what uses this key, so you can recognise it later.</div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="api-key-role">Acts as role</label>
              <select
                id="api-key-role"
                className="form-select"
                value={form.roleCode}
                onChange={(e) => setForm({ ...form, roleCode: e.target.value as ApiKeyRole })}
              >
                {API_KEY_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <div className="form-hint">
                The key gets this role's permissions. Choose the least powerful role that does the job.
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', color: 'var(--text-primary)', cursor: 'pointer', padding: '12px 16px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <input
                type="checkbox"
                checked={form.readOnly}
                onChange={(e) => setForm({ ...form, readOnly: e.target.checked })}
                style={{ marginTop: '3px' }}
              />
              <span>
                <strong>Read-only</strong>
                <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Only GET requests are allowed. Untick to let the integration create and update records.
                </span>
              </span>
            </label>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="api-key-expiry">Expires on (optional)</label>
              <input
                id="api-key-expiry"
                type="date"
                className="form-input"
                min={isoDay(1)}
                value={form.expiresOn}
                onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
              />
              <div className="form-hint">Leave empty for a key that never expires.</div>
            </div>
            <FormError message={formError} />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!revokeTarget}
        title="Revoke API key?"
        message={revokeTarget ? `Revoke the API key "${revokeTarget.name}"? Integrations using it stop working immediately. This cannot be undone.` : ''}
        confirmLabel="Revoke key"
        tone="danger"
        onConfirm={() => revokeTarget && revoke(revokeTarget)}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
};
