import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Lock, Mail, RefreshCw, XCircle } from 'lucide-react';
import { getApiErrorMessage } from '../../services/api';
import { adminApi, SubscriptionSummaryDetail } from '../../services/adminApi';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { tenantStatusLabel, tenantStatusVariant } from '../../constants/labels';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { PageHeader } from '../../components/ui/PageHeader';
import { LoadingState, ErrorState } from '../../components/ui/StateViews';
import { salesMailto, SALES_EMAIL } from '../../components/common/PlanUpgradeNotice';
import { UsageMeter } from '../../types';
import { formatInr } from '../../constants/currency';

/** Plan prices are always in Indian rupees. */
const formatPrice = (amount: number | null | undefined) => formatInr(amount);

const formatMb = (mb: number) => (mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${Math.round(mb * 10) / 10} MB`);

const UsageRow: React.FC<{ label: string; meter: UsageMeter | null | undefined; format?: (n: number) => string }> = ({ label, meter, format = (n) => String(n) }) => {
  const used = Number(meter?.used ?? 0);
  const limit = meter?.limit ?? null;
  const percent = limit ? Math.round((used / limit) * 100) : 0;
  const shown = Math.min(100, percent);
  const color = limit === null ? 'primary' : percent >= 100 ? 'danger' : percent >= 80 ? 'warning' : 'success';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '14px', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
        <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{format(used)}</strong> of {limit === null ? 'unlimited' : format(limit)}
          {limit !== null && ` (${percent}%)`}
        </span>
      </div>
      {limit === null ? (
        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>No limit on your plan</div>
      ) : (
        <>
          <ProgressBar value={shown} color={color} height={8} ariaLabel={`${label} used`} />
          {percent >= 80 && (
            <div style={{ fontSize: '12.5px', color: percent >= 100 ? 'var(--color-danger)' : 'var(--color-warning)', fontWeight: 600 }}>
              {percent >= 100 ? 'Limit reached' : 'Close to the limit'}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/** Organization administrators: plan, trial / paid-through dates, usage against limits and included features. */
export const SubscriptionPage: React.FC = () => {
  const { refreshSubscription, currentUser } = useApp();
  const { formatDate } = useI18n();
  const [data, setData] = useState<SubscriptionSummaryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminApi.getSubscription());
      // Keep the global banners in sync with what this page shows
      if (!currentUser?.isSuperAdmin) refreshSubscription().catch(() => undefined);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load the subscription.'));
    } finally {
      setLoading(false);
    }
  }, [refreshSubscription, currentUser?.isSuperAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const plan = data?.plan ?? null;
  const dateOrDash = (value: string | null | undefined) => (value ? formatDate(value) || '—' : '—');
  const upgradeHref = salesMailto(
    `Subscription upgrade: ${data?.organization ?? ''}`.trim(),
    `Organization: ${data?.organization ?? ''}\nCurrent plan: ${plan?.name ?? 'none'}\n\nWe would like to discuss upgrading our plan.`,
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Plan & Usage"
        description="Your plan, its limits and what is included."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={16} />} disabled={loading} onClick={load}>
              Refresh
            </Button>
            {/* Only offered when a higher plan exists */}
            {data?.upgradeAvailable && (
              <a href={upgradeHref} className="btn btn-primary">
                <Mail size={16} aria-hidden="true" /> Contact sales to upgrade
              </a>
            )}
          </>
        }
      />

      {loading && !data ? (
        <Card>
          <LoadingState label="Loading subscription…" />
        </Card>
      ) : error || !data ? (
        <Card>
          <ErrorState message={error || 'Subscription details are unavailable.'} onRetry={load} />
        </Card>
      ) : (
        <>
          {data.readOnly && (
            <div
              role="alert"
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                padding: '16px 20px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-danger-bg)',
                border: '1px solid var(--color-danger-border)',
                fontSize: '13px',
                color: 'var(--text-primary)',
              }}
            >
              <Lock size={16} color="var(--color-danger)" aria-hidden="true" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span>
                <strong>Read-only mode.</strong>{' '}
                {data.readOnlyReason === 'TRIAL_EXPIRED'
                  ? 'Your free trial has ended. Your data is available read-only until a subscription is activated.'
                  : 'Your subscription has lapsed. Your data is available read-only until it is renewed.'}{' '}
                Contact <a href={upgradeHref}>{SALES_EMAIL}</a>.
              </span>
            </div>
          )}

          <div className="grid-auto" style={{ '--min': '320px', gap: '24px' } as React.CSSProperties}>
            {/* Current plan: highlighted (pale blue, blue border) */}
            <section
              aria-labelledby="current-plan-title"
              className="card"
              style={{ background: 'var(--bg-pale)', borderColor: 'var(--color-primary)', boxShadow: 'inset 0 0 0 1px var(--color-primary)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <span
                    aria-hidden="true"
                    style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--color-info-border)', color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    <CreditCard size={20} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <h2 id="current-plan-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)', margin: 0 }}>
                      Current plan
                    </h2>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.organization}</div>
                  </div>
                </div>
                <Badge variant={tenantStatusVariant(data.status)}>{tenantStatusLabel(data.status)}</Badge>
              </div>
              {plan ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{plan.name}</div>
                    <div>
                      <span className="tabular-nums" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatPrice(plan.priceMonthly)}</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}> / month</span>
                    </div>
                  </div>
                  {plan.description && <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{plan.description}</p>}
                </div>
              ) : (
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>No plan is assigned. All features are currently available.</p>
              )}
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px 16px', margin: 0, paddingTop: '16px', borderTop: '1px solid var(--color-info-border)', fontSize: '14px' }}>
                {data.status === 'TRIAL' ? (
                  <div>
                    <dt className="metric-label">Trial ends</dt>
                    <dd style={{ margin: '4px 0 0', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {dateOrDash(data.trialEndsAt)}
                      {typeof data.trialDaysLeft === 'number' && (
                        <span style={{ fontWeight: 400, color: data.trialDaysLeft <= 7 ? 'var(--color-warning)' : 'var(--text-secondary)' }}>
                          {' '}
                          ({data.trialDaysLeft > 0 ? `${data.trialDaysLeft} day${data.trialDaysLeft === 1 ? '' : 's'} left` : 'ended'})
                        </span>
                      )}
                    </dd>
                  </div>
                ) : (
                  <div>
                    <dt className="metric-label">Paid through</dt>
                    <dd style={{ margin: '4px 0 0', color: 'var(--text-primary)', fontWeight: 600 }}>{dateOrDash(data.currentPeriodEnd)}</dd>
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <dt className="metric-label">Billing contact</dt>
                  <dd style={{ margin: '4px 0 0', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{data.billingEmail || '—'}</dd>
                </div>
              </dl>
            </section>

            {/* Usage */}
            <Card title="Usage" subtitle="Against your plan limits">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <UsageRow label="Active users" meter={data.usage?.users} />
                <UsageRow label="Locations" meter={data.usage?.locations} />
                <UsageRow label="Storage" meter={data.usage?.storageMb} format={formatMb} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Audits this month</span>
                  <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {data.usage?.auditsThisMonth ?? 0}
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* Features */}
          <Card title="Features" subtitle="What your plan includes">
            <ul className="grid-auto" style={{ '--min': '280px', gap: '0 24px', listStyle: 'none', margin: 0, padding: 0 } as React.CSSProperties}>
              {(data.features || []).map((f) => (
                <li
                  key={f.code}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)', minWidth: 0 }}
                >
                  {f.included ? (
                    <CheckCircle2 size={18} color="var(--color-success)" aria-hidden="true" style={{ flexShrink: 0 }} />
                  ) : (
                    <XCircle size={18} color="var(--text-tertiary)" aria-hidden="true" style={{ flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0, fontSize: '14px', fontWeight: 500, color: f.included ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{f.label}</div>
                  <Badge variant={f.included ? 'success' : 'neutral'}>{f.included ? 'Included' : 'Not included'}</Badge>
                </li>
              ))}
            </ul>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '16px 0 0' }}>
              Plan changes and renewals are arranged with our team; there is no online payment. Write to <a href={upgradeHref}>{SALES_EMAIL}</a>.
            </p>
          </Card>
        </>
      )}
    </div>
  );
};
