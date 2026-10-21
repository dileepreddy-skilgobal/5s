import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Building2, CreditCard, Plus, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api, getApiErrorMessage } from '../../services/api';
import { adminApi, PlatformMetricsDetail, PlatformTenantMetricsRow } from '../../services/adminApi';
import { PlatformPlanCatalogue, Tenant } from '../../types';
import { tenantStatusLabel } from '../../constants/labels';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Tabs } from '../../components/ui/Tabs';
import { TenantLogoUploader } from '../../components/common/TenantLogoUploader';
import {
  OrganizationsPanel,
  PlansPanel,
  PlatformInsightsPanel,
  PlatformSummary,
  SubscriptionEditTarget,
  TenantSubscriptionModal,
} from './PlatformConsole';

type ConsoleTab = 'organizations' | 'insights' | 'plans';

interface EditForm {
  name: string;
  industry: string;
  logo: string;
}

/** Platform operators: every organization, its subscription, and the plan catalogue. */
export const SuperAdminPage: React.FC = () => {
  const { tenants, refreshTenants, addToast } = useApp();

  const [activeTab, setActiveTab] = useState<ConsoleTab>('organizations');

  // Platform figures and plan catalogue (GET /platform/metrics, /platform/plans)
  const [metrics, setMetrics] = useState<PlatformMetricsDetail | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<PlatformPlanCatalogue | null>(null);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [subscriptionTarget, setSubscriptionTarget] = useState<SubscriptionEditTarget | null>(null);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      setMetrics(await adminApi.getPlatformMetrics());
    } catch (err) {
      setMetricsError(getApiErrorMessage(err, 'Could not load the platform figures.'));
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    setPlansError(null);
    try {
      setCatalogue(await api.getPlatformPlans());
    } catch (err) {
      setPlansError(getApiErrorMessage(err, 'Could not load the plan catalogue.'));
    } finally {
      setPlansLoading(false);
    }
  }, []);

  const reloadAll = useCallback(() => {
    refreshTenants();
    loadMetrics();
    loadPlans();
  }, [refreshTenants, loadMetrics, loadPlans]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  const planNames = useMemo<Record<string, string>>(
    () => Object.fromEntries((catalogue?.plans || []).map((p) => [p.code, p.name])),
    [catalogue],
  );

  const openSubscriptionEditor = (tenant: Tenant | null, row: PlatformTenantMetricsRow | null) => {
    const t = tenant ?? tenants.find((x) => x.id === row?.id) ?? null;
    const id = row?.id ?? t?.id;
    const name = row?.name ?? t?.name;
    if (!id || !name) return;
    setSubscriptionTarget({
      id,
      name,
      status: (row?.status ?? t?.status ?? 'ACTIVE') as SubscriptionEditTarget['status'],
      plan: row ? row.plan : catalogue?.plans?.find((p) => p.id === t?.planId)?.code ?? null,
      trialEndsAt: row ? row.trialEndsAt : t?.trialEndsAt ?? null,
      currentPeriodEnd: row ? row.currentPeriodEnd : t?.currentPeriodEnd ?? null,
      storageQuotaMb: row ? row.storageQuotaMb : t?.storageQuotaMb ?? null,
      // Only known when the tenant directory carries it; otherwise left unchanged unless typed
      billingEmail: t && 'billingEmail' in t ? t.billingEmail ?? null : undefined,
    });
  };

  const openSubscriptionById = (id: string) =>
    openSubscriptionEditor(tenants.find((t) => t.id === id) ?? null, metrics?.tenants.find((r) => r.id === id) ?? null);

  // --- Edit profile (name, industry, logo) ---
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [form, setForm] = useState<EditForm>({ name: '', industry: '', logo: '' });
  const [logoChanged, setLogoChanged] = useState(false);
  const [formErrors, setFormErrors] = useState<{ name?: string; industry?: string }>({});
  const [saving, setSaving] = useState(false);

  // Industry suggestions are the values organizations actually use (free text is allowed)
  const industryOptions = useMemo(
    () => Array.from(new Set(tenants.map((t) => (t.industry || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [tenants],
  );

  const openEdit = (t: Tenant) => {
    setEditing(t);
    setForm({ name: t.name, industry: t.industry || '', logo: t.logoUrl || '' });
    setLogoChanged(false);
    setFormErrors({});
  };

  const closeEdit = () => {
    if (saving) return;
    setEditing(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const name = form.name.trim();
    const industry = form.industry.trim();
    const errors: typeof formErrors = {};
    if (name.length < 2 || name.length > 120) errors.name = 'Enter a name of 2–120 characters.';
    if (!industry || industry.length > 80) errors.industry = 'Enter an industry of up to 80 characters.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const profile: { name?: string; industry?: string } = {};
      if (name !== editing.name) profile.name = name;
      if (industry !== (editing.industry || '')) profile.industry = industry;
      if (Object.keys(profile).length > 0) await adminApi.updateTenantProfile(editing.id, profile);
      // The logo is stored in the organization's own file storage
      if (logoChanged) await adminApi.setTenantLogo(editing.id, form.logo || null);
      addToast({ type: 'success', title: 'Organization updated', message: `${name} was saved.` });
      setEditing(null);
      refreshTenants();
      loadMetrics();
    } catch (err) {
      addToast({ type: 'error', title: 'Organization not saved', message: getApiErrorMessage(err, 'Could not update the organization.') });
    } finally {
      setSaving(false);
    }
  };

  // --- Suspend / reactivate ---
  const [suspendTarget, setSuspendTarget] = useState<Tenant | null>(null);
  const [suspending, setSuspending] = useState(false);
  const reactivating = suspendTarget?.status === 'SUSPENDED';

  const confirmSuspend = async () => {
    if (!suspendTarget) return;
    setSuspending(true);
    try {
      const updated = await adminApi.setTenantSuspended(suspendTarget.id, !reactivating);
      addToast({
        type: reactivating ? 'success' : 'warning',
        title: reactivating ? 'Organization reactivated' : 'Organization suspended',
        message: reactivating
          ? `${suspendTarget.name} is ${tenantStatusLabel(updated?.status || 'ACTIVE').toLowerCase()} again.`
          : `${suspendTarget.name} is suspended.`,
      });
      setSuspendTarget(null);
      refreshTenants();
      loadMetrics();
    } catch (err) {
      addToast({ type: 'error', title: 'Status not changed', message: getApiErrorMessage(err, 'Could not change the organization status.') });
    } finally {
      setSuspending(false);
    }
  };

  const consoleTabs = [
    { id: 'organizations', label: 'Organizations', icon: <Building2 size={16} />, badge: tenants.length },
    { id: 'insights', label: 'Insights', icon: <BarChart3 size={16} /> },
    { id: 'plans', label: 'Plans', icon: <CreditCard size={16} />, badge: catalogue?.plans?.length },
  ];


  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Platform console"
        description="Organizations, their subscriptions and the plan catalogue."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={reloadAll} disabled={metricsLoading && plansLoading}>
              Refresh
            </Button>
            <Link to="/onboarding" className="btn btn-primary">
              <Plus size={16} aria-hidden="true" /> New organization
            </Link>
          </>
        }
      />

      <PlatformSummary metrics={metrics} loading={metricsLoading} error={metricsError} />

      <Tabs tabs={consoleTabs} activeTab={activeTab} onChange={(tabId) => setActiveTab(tabId as ConsoleTab)} ariaLabel="Platform console sections" />

      {activeTab === 'organizations' && (
        <OrganizationsPanel
          tenants={tenants}
          metrics={metrics}
          planNames={planNames}
          onEdit={openEdit}
          onSubscription={(t, row) => openSubscriptionEditor(t, row)}
          onToggleSuspend={setSuspendTarget}
        />
      )}

      {activeTab === 'insights' && (
        <PlatformInsightsPanel
          metrics={metrics}
          loading={metricsLoading}
          error={metricsError}
          planNames={planNames}
          onReload={loadMetrics}
          onOpenSubscription={openSubscriptionById}
        />
      )}

      {activeTab === 'plans' && <PlansPanel catalogue={catalogue} loading={plansLoading} error={plansError} onReload={loadPlans} />}

      {/* Edit organization profile */}
      <Modal
        isOpen={!!editing}
        onClose={closeEdit}
        title={editing ? `Edit ${editing.name}` : 'Edit organization'}
        subtitle="Name, industry and logo. Plan, status and storage are changed with Subscription."
        maxWidth="600px"
        footer={
          <>
            <Button variant="secondary" onClick={closeEdit} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="tenant-edit-form" loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        <form id="tenant-edit-form" onSubmit={saveEdit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="tenant-edit-name">
              Organization name <span className="required" aria-hidden="true">*</span>
            </label>
            <input
              id="tenant-edit-name"
              type="text"
              className="form-input"
              value={form.name}
              maxLength={120}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              aria-invalid={!!formErrors.name}
              aria-describedby={formErrors.name ? 'tenant-edit-name-error' : undefined}
              required
            />
            {formErrors.name && (
              <span id="tenant-edit-name-error" className="form-error" role="alert">
                {formErrors.name}
              </span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="tenant-edit-slug">
              Slug
            </label>
            <input id="tenant-edit-slug" type="text" className="form-input" value={editing?.slug || ''} disabled aria-describedby="tenant-edit-slug-hint" style={{ cursor: 'not-allowed', fontFamily: 'var(--font-mono)' }} />
            <span id="tenant-edit-slug-hint" className="form-hint">The slug is used in sign-in and QR code links, so it cannot be changed.</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="tenant-edit-industry">
              Industry <span className="required" aria-hidden="true">*</span>
            </label>
            <input
              id="tenant-edit-industry"
              type="text"
              className="form-input"
              list="tenant-industry-options"
              value={form.industry}
              maxLength={80}
              onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
              aria-invalid={!!formErrors.industry}
              aria-describedby={formErrors.industry ? 'tenant-edit-industry-error' : 'tenant-edit-industry-hint'}
            />
            <datalist id="tenant-industry-options">
              {industryOptions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
            {formErrors.industry ? (
              <span id="tenant-edit-industry-error" className="form-error" role="alert">
                {formErrors.industry}
              </span>
            ) : (
              <span id="tenant-edit-industry-hint" className="form-hint">
                Pick one already in use or type a new one.
              </span>
            )}
          </div>

          <TenantLogoUploader
            value={form.logo}
            disabled={saving}
            onChange={(logo) => {
              setForm((f) => ({ ...f, logo }));
              setLogoChanged(true);
            }}
          />
        </form>
      </Modal>

      {/* Suspend / reactivate confirmation */}
      <ConfirmDialog
        isOpen={!!suspendTarget}
        title={reactivating ? `Reactivate ${suspendTarget?.name ?? ''}?` : `Suspend ${suspendTarget?.name ?? ''}?`}
        message={
          reactivating
            ? 'The organization returns to the status it had before it was suspended (active or trial). To change its plan or make a trial paid, use Subscription.'
            : 'Its users can no longer sign in or use the app or API until it is reactivated. Data is kept.'
        }
        confirmLabel={reactivating ? 'Reactivate' : 'Suspend'}
        tone={reactivating ? 'primary' : 'danger'}
        busy={suspending}
        onConfirm={confirmSuspend}
        onCancel={() => setSuspendTarget(null)}
      />

      <TenantSubscriptionModal
        target={subscriptionTarget}
        plans={catalogue?.plans || []}
        onClose={() => setSubscriptionTarget(null)}
        onSaved={() => {
          loadMetrics();
          loadPlans();
          refreshTenants();
        }}
      />
    </div>
  );
};
