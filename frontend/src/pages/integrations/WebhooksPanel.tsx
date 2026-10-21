import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { History, KeyRound, Pencil, Plus, Power, RefreshCw, RotateCcw, Send, Trash2, Webhook } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { api, getApiErrorMessage, isPlanFeatureRequiredError } from '../../services/api';
import { WebhookDelivery, WebhookEndpoint, WebhookTestResult } from '../../types';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Drawer } from '../../components/ui/Drawer';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/StateViews';
import { PlanUpgradeNotice } from '../../components/common/PlanUpgradeNotice';
import { CodeBlock, DELIVERY_STATUS_LABELS, FormError, SecretReveal, monoStyle, sectionHintStyle } from './integrationsShared';
import { humanize } from '../../constants/labels';

const ALL_EVENTS = '*';

const DELIVERY_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  SUCCESS: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
};

const SIGNATURE_SNIPPET = `// Express example: verify before trusting the payload
const crypto = require('crypto');

app.post('/hooks/5s', express.raw({ type: 'application/json' }), (req, res) => {
  const timestamp = req.get('X-5S-Timestamp');
  const signature = req.get('X-5S-Signature') || '';      // "sha256=<hex>"
  const rawBody = req.body.toString('utf8');               // exact bytes received

  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)      // your whsec_… secret
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest('hex');

  const valid = signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;  // 5 min

  if (!valid || !fresh) return res.sendStatus(401);

  const event = JSON.parse(rawBody);  // { id, event, occurredAt, tenantId, data }
  // Use X-5S-Delivery to ignore duplicates, then respond quickly with 2xx
  res.sendStatus(200);
});`;

interface WebhookForm {
  url: string;
  description: string;
  allEvents: boolean;
  events: string[];
}

const EMPTY_FORM: WebhookForm = { url: '', description: '', allEvents: false, events: [] };

/** "red_tag.closed" -> group "red_tag" (shown as "Red tag"). */
const groupEvents = (events: string[]) => {
  const groups = new Map<string, string[]>();
  events.forEach((e) => {
    const group = e.includes('.') ? e.split('.')[0] : 'other';
    groups.set(group, [...(groups.get(group) ?? []), e]);
  });
  return Array.from(groups.entries());
};

const groupLabel = (group: string) => {
  const text = group.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const isHttpsUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !!u.hostname;
  } catch {
    return false;
  }
};

export const WebhooksPanel: React.FC = () => {
  const { addToast } = useApp();
  const { formatDateTime, formatRelative, formatNumber } = useI18n();
  const [hooks, setHooks] = useState<WebhookEndpoint[]>([]);
  const [catalogue, setCatalogue] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planLocked, setPlanLocked] = useState(false);

  // Create / edit
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookEndpoint | null>(null);
  const [form, setForm] = useState<WebhookForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Secret shown once (after create / rotate)
  const [secret, setSecret] = useState<{ title: string; endpoint: string; value: string } | null>(null);

  // Row actions
  const [busy, setBusy] = useState<{ id: string; action: 'test' | 'toggle' | 'rotate' | 'delete' } | null>(null);
  const [testResults, setTestResults] = useState<Record<string, WebhookTestResult & { at: number }>>({});

  // Deliveries drawer
  const [deliveriesFor, setDeliveriesFor] = useState<WebhookEndpoint | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveriesError, setDeliveriesError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, events] = await Promise.all([api.getWebhooks(), api.getWebhookEvents()]);
      setHooks(list);
      setCatalogue(events);
      setPlanLocked(false);
    } catch (err) {
      if (isPlanFeatureRequiredError(err)) setPlanLocked(true);
      else setError(getApiErrorMessage(err, 'Could not load webhooks.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handlePlanError = (err: unknown): boolean => {
    if (!isPlanFeatureRequiredError(err)) return false;
    setEditorOpen(false);
    setPlanLocked(true);
    return true;
  };

  // --- Create / edit -----------------------------------------------------------------------------
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditorOpen(true);
  };

  const openEdit = (hook: WebhookEndpoint) => {
    const events = Array.isArray(hook.events) ? hook.events : [];
    setEditing(hook);
    setForm({
      url: hook.url || '',
      description: hook.description || '',
      allEvents: events.includes(ALL_EVENTS),
      events: events.filter((e) => e !== ALL_EVENTS),
    });
    setFormError(null);
    setEditorOpen(true);
  };

  const toggleEvent = (event: string) =>
    setForm((f) => ({ ...f, events: f.events.includes(event) ? f.events.filter((e) => e !== event) : [...f.events, event] }));

  const toggleGroup = (events: string[], on: boolean) =>
    setForm((f) => ({ ...f, events: on ? Array.from(new Set([...f.events, ...events])) : f.events.filter((e) => !events.includes(e)) }));

  const validateForm = (): string | null => {
    const url = form.url.trim();
    if (!url) return 'Enter the endpoint URL.';
    if (!isHttpsUrl(url)) return 'The URL must be a valid https:// address.';
    if (url.length > 500) return 'The URL must be 500 characters or fewer.';
    if (form.description.trim().length > 200) return 'The description must be 200 characters or fewer.';
    if (!form.allEvents && form.events.length === 0) return 'Choose at least one event, or subscribe to all events.';
    return null;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateForm();
    if (problem) {
      setFormError(problem);
      return;
    }
    const url = form.url.trim();
    const description = form.description.trim();
    const events = form.allEvents ? [ALL_EVENTS] : [...form.events].sort();
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await api.updateWebhook(editing.id, { url, description, events });
        addToast({ type: 'success', title: 'Webhook updated', message: url });
        setEditorOpen(false);
      } else {
        const created = await api.createWebhook({ url, events, ...(description ? { description } : {}) });
        setEditorOpen(false);
        if (created?.secret) setSecret({ title: 'Webhook created', endpoint: created.url || url, value: created.secret });
      }
      load();
    } catch (err) {
      // Server validation (private address, unresolvable host, unknown events…) is shown in the form
      if (!handlePlanError(err)) setFormError(getApiErrorMessage(err, 'Could not save the webhook.'));
    } finally {
      setSaving(false);
    }
  };

  // --- Row actions -------------------------------------------------------------------------------
  const runTest = async (hook: WebhookEndpoint) => {
    setBusy({ id: hook.id, action: 'test' });
    try {
      const result = await api.testWebhook(hook.id);
      const outcome: WebhookTestResult = result ?? { status: 'FAILED', responseStatus: null, error: 'No result returned' };
      setTestResults((prev) => ({ ...prev, [hook.id]: { ...outcome, at: Date.now() } }));
      const ok = outcome.status === 'SUCCESS';
      addToast({
        type: ok ? 'success' : 'warning',
        title: ok ? 'Test delivered' : 'Test delivery failed',
        message: ok
          ? `Your endpoint answered ${outcome.responseStatus ?? '2xx'}.`
          : `${outcome.error || (outcome.responseStatus ? `HTTP ${outcome.responseStatus}` : 'No response from the endpoint.')}${
              outcome.status === 'PENDING' ? ' It will be retried automatically.' : ''
            }`,
      });
      load();
    } catch (err) {
      if (!handlePlanError(err)) addToast({ type: 'error', title: 'Test not sent', message: getApiErrorMessage(err, 'Could not send the test event.') });
    } finally {
      setBusy(null);
    }
  };

  // Row action waiting for confirmation (replaces window.confirm)
  const [pendingConfirm, setPendingConfirm] = useState<{ kind: 'disable' | 'rotate' | 'delete'; hook: WebhookEndpoint } | null>(null);

  const toggleActive = (hook: WebhookEndpoint) => {
    if (hook.isActive) {
      setPendingConfirm({ kind: 'disable', hook });
      return;
    }
    applyToggle(hook);
  };

  const applyToggle = async (hook: WebhookEndpoint) => {
    const next = !hook.isActive;
    setBusy({ id: hook.id, action: 'toggle' });
    try {
      await api.updateWebhook(hook.id, { isActive: next });
      addToast({ type: 'success', title: next ? 'Webhook enabled' : 'Webhook disabled', message: hook.url });
      await load();
    } catch (err) {
      if (!handlePlanError(err)) addToast({ type: 'error', title: 'Webhook not changed', message: getApiErrorMessage(err, 'Could not update the webhook.') });
    } finally {
      setBusy(null);
    }
  };

  const rotate = async (hook: WebhookEndpoint) => {
    setBusy({ id: hook.id, action: 'rotate' });
    try {
      const res = await api.rotateWebhookSecret(hook.id);
      if (res?.secret) setSecret({ title: 'New signing secret', endpoint: hook.url, value: res.secret });
    } catch (err) {
      if (!handlePlanError(err)) addToast({ type: 'error', title: 'Secret not rotated', message: getApiErrorMessage(err, 'Could not rotate the signing secret.') });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (hook: WebhookEndpoint) => {
    setBusy({ id: hook.id, action: 'delete' });
    try {
      await api.deleteWebhook(hook.id);
      addToast({ type: 'success', title: 'Webhook deleted', message: hook.url });
      if (deliveriesFor?.id === hook.id) setDeliveriesFor(null);
      await load();
    } catch (err) {
      if (!handlePlanError(err)) addToast({ type: 'error', title: 'Webhook not deleted', message: getApiErrorMessage(err, 'Could not delete the webhook.') });
    } finally {
      setBusy(null);
    }
  };

  // --- Deliveries --------------------------------------------------------------------------------
  const loadDeliveries = useCallback(async (hookId: string) => {
    setDeliveriesLoading(true);
    setDeliveriesError(null);
    try {
      setDeliveries(await api.getWebhookDeliveries(hookId));
    } catch (err) {
      setDeliveriesError(getApiErrorMessage(err, 'Could not load deliveries.'));
    } finally {
      setDeliveriesLoading(false);
    }
  }, []);

  const openDeliveries = (hook: WebhookEndpoint) => {
    setDeliveries([]);
    setDeliveriesFor(hook);
    loadDeliveries(hook.id);
  };

  const retry = async (delivery: WebhookDelivery) => {
    if (!deliveriesFor) return;
    setRetryingId(delivery.id);
    try {
      await api.retryWebhookDelivery(delivery.id);
      addToast({ type: 'success', title: 'Delivery queued', message: 'It will be sent again within a few seconds.' });
      await loadDeliveries(deliveriesFor.id);
    } catch (err) {
      addToast({ type: 'error', title: 'Retry not queued', message: getApiErrorMessage(err, 'Could not retry the delivery.') });
    } finally {
      setRetryingId(null);
    }
  };

  const groupedCatalogue = useMemo(() => groupEvents(catalogue), [catalogue]);

  if (planLocked) {
    return (
      <PlanUpgradeNotice
        feature="Webhooks"
        description="Webhooks push 5S events (new observations, closed actions, submitted audits…) to your other systems as they happen. Webhooks are not included in your organization's current plan."
      />
    );
  }

  const confirmCopy = pendingConfirm
    ? {
        disable: {
          title: 'Disable webhook?',
          message: `Disable deliveries to ${pendingConfirm.hook.url}? Events that happen while it is disabled are not queued for it.`,
          label: 'Disable',
        },
        rotate: {
          title: 'Rotate signing secret?',
          message: `Issue a new signing secret for ${pendingConfirm.hook.url}? The current secret stops working immediately, so update your receiver right away.`,
          label: 'Rotate secret',
        },
        delete: {
          title: 'Delete webhook?',
          message: `Delete the webhook ${pendingConfirm.hook.url} and its delivery history? This cannot be undone.`,
          label: 'Delete webhook',
        },
      }[pendingConfirm.kind]
    : null;

  const runConfirmed = () => {
    if (!pendingConfirm) return;
    const { kind, hook } = pendingConfirm;
    setPendingConfirm(null);
    if (kind === 'disable') applyToggle(hook);
    else if (kind === 'rotate') rotate(hook);
    else remove(hook);
  };

  const isBusy = (id: string, action?: 'test' | 'toggle' | 'rotate' | 'delete') => busy?.id === id && (!action || busy.action === action);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card
        title="Webhook endpoints"
        subtitle={loading ? 'Loading…' : `${hooks.length} endpoint${hooks.length === 1 ? '' : 's'}`}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={16} />} onClick={load} disabled={loading}>
              Refresh
            </Button>
            <Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={openCreate} disabled={loading && catalogue.length === 0}>
              Add endpoint
            </Button>
          </>
        }
        noPadding
      >
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading && hooks.length === 0 ? (
          <LoadingState label="Loading webhooks…" />
        ) : hooks.length === 0 ? (
          <EmptyState
            icon={<Webhook size={28} />}
            title="No webhook endpoints yet"
            description="Add an https endpoint to receive signed event notifications."
          />
        ) : (
          <div>
            {hooks.map((hook) => {
              const events = Array.isArray(hook.events) ? hook.events : [];
              const all = events.includes(ALL_EVENTS);
              const test = testResults[hook.id];
              const failures = Number(hook.consecutiveFailures) || 0;
              return (
                <div key={hook.id} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <code style={{ ...monoStyle, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{hook.url}</code>
                        <Badge variant={hook.isActive ? 'success' : 'neutral'}>{hook.isActive ? 'Active' : 'Disabled'}</Badge>
                        {failures > 0 && (
                          <Badge variant="danger">
                            {formatNumber(failures)} consecutive failure{failures === 1 ? '' : 's'}
                          </Badge>
                        )}
                      </div>
                      {hook.description && <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>{hook.description}</div>}
                      {hook.disabledReason && (
                        <div style={{ fontSize: '13px', color: 'var(--color-danger)', marginTop: '4px' }}>{hook.disabledReason}. Fix the receiver, then enable it again.</div>
                      )}
                    </div>
                    <div role="group" aria-label={`Actions for ${hook.url}`} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <Button variant="secondary" size="sm" icon={<Send size={16} />} loading={isBusy(hook.id, 'test')} disabled={!!busy || !hook.isActive} onClick={() => runTest(hook)} title={hook.isActive ? 'Send a signed "ping" event now' : 'Enable the endpoint to test it'}>
                        Send test
                      </Button>
                      <Button variant="secondary" size="sm" icon={<History size={16} />} onClick={() => openDeliveries(hook)}>
                        Deliveries
                      </Button>
                      <Button variant="ghost" size="sm" icon={<Pencil size={16} />} disabled={!!busy} onClick={() => openEdit(hook)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" icon={<Power size={16} />} loading={isBusy(hook.id, 'toggle')} disabled={!!busy} onClick={() => toggleActive(hook)}>
                        {hook.isActive ? 'Disable' : 'Enable'}
                      </Button>
                      <Button variant="ghost" size="sm" icon={<KeyRound size={16} />} loading={isBusy(hook.id, 'rotate')} disabled={!!busy} onClick={() => setPendingConfirm({ kind: 'rotate', hook })}>
                        Rotate secret
                      </Button>
                      <Button variant="danger" size="sm" icon={<Trash2 size={16} />} loading={isBusy(hook.id, 'delete')} disabled={!!busy} onClick={() => setPendingConfirm({ kind: 'delete', hook })} aria-label={`Delete ${hook.url}`}>
                        Delete
                      </Button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {all ? (
                      <Badge variant="purple">All events</Badge>
                    ) : events.length === 0 ? (
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No events</span>
                    ) : (
                      events.map((e) => (
                        <span key={e} className="badge badge-neutral" style={{ ...monoStyle, fontSize: '12px' }}>{e}</span>
                      ))
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    <span title={formatDateTime(hook.lastDeliveryAt) || undefined}>
                      Last delivery: {hook.lastDeliveryAt ? formatRelative(hook.lastDeliveryAt) : 'never'}
                    </span>
                    <span>Created {formatDateTime(hook.createdAt) || '—'}</span>
                    {test && (
                      <span style={{ color: test.status === 'SUCCESS' ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>
                        Last test: {test.status === 'SUCCESS' ? 'delivered' : 'failed'}
                        {test.responseStatus ? ` (HTTP ${test.responseStatus})` : ''}
                        {test.status !== 'SUCCESS' && test.error ? ` — ${test.error}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Verifying signatures" subtitle="Every delivery is a signed JSON POST">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={sectionHintStyle}>Each request carries these headers:</p>
          <ul style={{ ...sectionHintStyle, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <li><code style={monoStyle}>X-5S-Event</code> — the event name, e.g. <code style={monoStyle}>observation.created</code> (<code style={monoStyle}>ping</code> for tests)</li>
            <li><code style={monoStyle}>X-5S-Delivery</code> — unique delivery id; the same id is reused on retries, so use it to ignore duplicates</li>
            <li><code style={monoStyle}>X-5S-Timestamp</code> — Unix time in seconds when the request was signed</li>
            <li>
              <code style={monoStyle}>X-5S-Signature</code> — <code style={monoStyle}>sha256=&lt;hex&gt;</code>, where hex = HMAC-SHA256(secret,{' '}
              <code style={monoStyle}>{'${timestamp}.${rawBody}'}</code>)
            </li>
          </ul>
          <p style={sectionHintStyle}>
            Compute the HMAC over the exact raw body you received (before any JSON parsing), compare in constant time and reject old timestamps to
            stop replays.
          </p>
          <CodeBlock label="Node.js" code={SIGNATURE_SNIPPET} />
          <p style={sectionHintStyle}>
            Respond with any 2xx status within 10 seconds. Failed deliveries are retried after 1 minute, 5 minutes, 30 minutes, 2 hours and 12
            hours, then marked failed (you can retry them from the deliveries list). After 20 consecutive failed deliveries the endpoint is
            disabled automatically; enabling it again resets the count.
          </p>
        </div>
      </Card>

      {/* Create / edit */}
      <Modal
        isOpen={editorOpen}
        onClose={() => !saving && setEditorOpen(false)}
        title={editing ? 'Edit webhook' : 'Add webhook endpoint'}
        subtitle={editing ? editing.url : 'A signing secret is generated and shown once after saving.'}
        maxWidth="680px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="webhook-form" loading={saving}>
              {editing ? 'Save changes' : 'Create webhook'}
            </Button>
          </>
        }
      >
        <form id="webhook-form" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="webhook-url">
              Endpoint URL<span className="required" aria-hidden="true"> *</span>
            </label>
            <input
              id="webhook-url"
              type="url"
              aria-required="true"
              className="form-input"
              value={form.url}
              maxLength={500}
              autoFocus
              placeholder="https://example.com/hooks/5s"
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              style={monoStyle}
            />
            <div className="form-hint">
              Must be a public https address. Private, internal and loopback addresses are refused.
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="webhook-description">Description (optional)</label>
            <input
              id="webhook-description"
              className="form-input"
              value={form.description}
              maxLength={200}
              placeholder="e.g. Sync closed actions to the maintenance system"
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div role="group" aria-labelledby="webhook-events-label">
            <div id="webhook-events-label" className="form-label" style={{ marginBottom: '6px' }}>Events</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', marginBottom: '12px' }}>
              <input type="checkbox" checked={form.allEvents} onChange={(e) => setForm({ ...form, allEvents: e.target.checked })} />
              <span>
                <strong>All events</strong> <span style={{ color: 'var(--text-secondary)' }}>(including events added in future releases)</span>
              </span>
            </label>
            {!form.allEvents && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '10px' }}>
                {groupedCatalogue.length === 0 && <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>The event list could not be loaded.</div>}
                {groupedCatalogue.map(([group, events]) => {
                  const selected = events.filter((e) => form.events.includes(e)).length;
                  return (
                    <fieldset key={group} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '8px 12px', margin: 0, minWidth: 0 }}>
                      <legend style={{ padding: '0 4px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={selected === events.length}
                            ref={(el) => {
                              if (el) el.indeterminate = selected > 0 && selected < events.length;
                            }}
                            onChange={(e) => toggleGroup(events, e.target.checked)}
                          />
                          {groupLabel(group)}
                        </label>
                      </legend>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {events.map((event) => (
                          <label key={event} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer', minHeight: '28px', wordBreak: 'break-all' }}>
                            <input type="checkbox" checked={form.events.includes(event)} onChange={() => toggleEvent(event)} />
                            <span style={monoStyle}>{event}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            )}
          </div>
          <FormError message={formError} />
        </form>
      </Modal>

      {/* Secret shown once */}
      <Modal
        isOpen={!!secret}
        onClose={() => setSecret(null)}
        title={secret?.title || 'Signing secret'}
        subtitle={secret?.endpoint}
        maxWidth="600px"
        footer={
          <Button variant="primary" onClick={() => setSecret(null)}>
            I have stored the secret
          </Button>
        }
      >
        {secret && (
          <SecretReveal
            label="Signing secret"
            value={secret.value}
            warning={
              <>
                <strong>Copy this secret now — you won't see it again.</strong> Your receiver needs it to verify the X-5S-Signature header. If it
                is lost, rotate the secret to get a new one.
              </>
            }
          />
        )}
      </Modal>

      {/* Deliveries */}
      <Drawer
        isOpen={!!deliveriesFor}
        onClose={() => setDeliveriesFor(null)}
        title="Recent deliveries"
        subtitle={deliveriesFor ? `${deliveriesFor.url} · last 50` : undefined}
        width="560px"
        footer={
          <Button variant="secondary" size="sm" icon={<RefreshCw size={16} />} disabled={!deliveriesFor || deliveriesLoading} onClick={() => deliveriesFor && loadDeliveries(deliveriesFor.id)}>
            Refresh
          </Button>
        }
      >
        {deliveriesError ? (
          <ErrorState message={deliveriesError} onRetry={() => deliveriesFor && loadDeliveries(deliveriesFor.id)} />
        ) : deliveriesLoading && deliveries.length === 0 ? (
          <LoadingState label="Loading deliveries…" />
        ) : deliveries.length === 0 ? (
          <EmptyState title="No deliveries yet" description="Send a test event to try the endpoint." icon={<History size={28} />} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', opacity: deliveriesLoading ? 0.6 : 1 }}>
            {deliveries.map((d) => (
              <div key={d.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <code style={{ ...monoStyle, fontSize: '12.5px', fontWeight: 600 }}>{d.event}</code>
                    <Badge variant={DELIVERY_VARIANT[d.status] ?? 'neutral'}>{DELIVERY_STATUS_LABELS[d.status] ?? humanize(d.status)}</Badge>
                  </div>
                  {d.status === 'FAILED' && (
                    <Button variant="secondary" size="sm" icon={<RotateCcw size={16} />} loading={retryingId === d.id} disabled={!!retryingId} onClick={() => retry(d)}>
                      Retry
                    </Button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  <span>Created {formatDateTime(d.createdAt) || '—'}</span>
                  <span>
                    {formatNumber(Number(d.attempts) || 0)} attempt{Number(d.attempts) === 1 ? '' : 's'}
                  </span>
                  {d.responseStatus !== null && d.responseStatus !== undefined && <span>HTTP {d.responseStatus}</span>}
                  {d.deliveredAt && <span>Delivered {formatDateTime(d.deliveredAt)}</span>}
                  {d.status === 'PENDING' && d.nextAttemptAt && <span>Next attempt {formatRelative(d.nextAttemptAt)}</span>}
                </div>
                {d.error && (
                  <div style={{ ...monoStyle, fontSize: '12.5px', color: 'var(--color-danger)', wordBreak: 'break-word' }}>{d.error}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        isOpen={!!pendingConfirm}
        title={confirmCopy?.title || ''}
        message={confirmCopy?.message || ''}
        confirmLabel={confirmCopy?.label}
        tone="danger"
        onConfirm={runConfirmed}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
};
