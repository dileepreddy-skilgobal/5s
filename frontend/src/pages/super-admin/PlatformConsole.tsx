import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Building2,
  Clock,
  CreditCard,
  Download,
  Edit3,
  HardDrive,
  IndianRupee,
  Lock,
  Plus,
  Power,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api, getApiErrorMessage } from '../../services/api';
import { PlatformMetricsDetail, PlatformTenantMetricsRow } from '../../services/adminApi';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { humanize, tenantStatusLabel, tenantStatusVariant } from '../../constants/labels';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { SummaryCard, SummaryGrid } from '../../components/ui/SummaryCard';
import { FormField, SearchInput } from '../../components/ui/FormField';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/StateViews';
import { RowActionsMenu } from '../../components/ui/RowActionsMenu';
import { formatInr, formatInrCompact } from '../../constants/currency';
import { PlatformPlan, PlatformPlanCatalogue, PlanPayload, Tenant, TenantSubscriptionPayload, TenantSubscriptionStatus } from '../../types';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Plan prices and revenue are always in Indian rupees (the platform has one billing currency). */
export const formatMoney = (amount: number | null | undefined) => formatInr(amount);

export const formatMb = (mb: number | null | undefined) => {
  const v = Number(mb ?? 0);
  return v >= 1024 ? `${Math.round((v / 1024) * 10) / 10} GB` : `${Math.round(v * 10) / 10} MB`;
};

/** Whole days from now until the date (negative once it has passed). */
export const daysUntil = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.ceil((t - Date.now()) / 86400000);
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** yyyy-mm-dd for a date input, from an ISO timestamp (local date). */
const toDateInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** End of the chosen local day, as ISO (a trial / paid period runs through the whole day). */
const fromDateInput = (value: string) => new Date(`${value}T23:59:59`).toISOString();

const STATUSES: TenantSubscriptionStatus[] = ['ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED'];

const readOnlyLabel = (reason: string | null | undefined) =>
  reason === 'TRIAL_EXPIRED' ? 'Trial expired' : reason === 'SUBSCRIPTION_LAPSED' ? 'Subscription lapsed' : 'Read-only';

/** Short names for plan feature codes (the catalogue's labels are full descriptions). */
const FEATURE_NAMES: Record<string, string> = {
  ADVANCED_ANALYTICS: 'Advanced analytics',
  REPORTS_EXPORT: 'Report export',
  GAMIFICATION: 'Recognition',
  API_ACCESS: 'API keys',
  WEBHOOKS: 'Webhooks',
};
export const featureName = (code: string) => FEATURE_NAMES[code] ?? humanize(code);

/** Used with className="form-label" (label above the control). */
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '6px' };

// ---------------------------------------------------------------------------
// Headline figures (shown once, above the tabs)
// ---------------------------------------------------------------------------

const StatCard: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ReactNode }> = ({ label, value, sub, icon }) => (
  <SummaryCard label={label} value={value} hint={sub} icon={icon} tone="primary" />
);

export const PlatformSummary: React.FC<{ metrics: PlatformMetricsDetail | null; loading: boolean; error: string | null }> = ({ metrics, loading, error }) => {
  const totals = metrics?.totals;
  const hint = loading ? 'Loading…' : error ? 'Figures unavailable' : undefined;
  const active = metrics?.byStatus?.ACTIVE ?? 0;
  const trial = metrics?.byStatus?.TRIAL ?? 0;
  const storagePct = totals && totals.storageQuotaMb > 0 ? Math.min(100, Math.round((totals.storageMb / totals.storageQuotaMb) * 1000) / 10) : null;
  // Paying = active organizations whose plan has a price (trials and lapsed subscriptions add nothing)
  const paying = (metrics?.tenants || []).filter((t) => t.mrr > 0).length;
  const mrr = totals?.mrr ?? 0;
  return (
    <SummaryGrid min={165}>
      <StatCard
        label="Organizations"
        value={totals ? totals.tenants : '—'}
        sub={totals ? `${active} active · ${trial} on trial` : hint}
        icon={<Building2 size={18} />}
      />
      <StatCard
        label="MRR"
        value={totals ? <span title="Monthly recurring revenue at list price">{formatInr(mrr)}</span> : '—'}
        sub={totals ? `ARR ${formatInrCompact(mrr * 12)} · ${plural(paying, 'paying org', 'paying orgs')}` : hint}
        icon={<IndianRupee size={18} />}
      />
      <StatCard
        label="ARPA"
        value={totals ? <span title="Average revenue per paying organization, per month">{paying > 0 ? formatInr(Math.round(mrr / paying)) : '—'}</span> : '—'}
        sub={totals ? 'Avg. per paying org / month' : hint}
        icon={<TrendingUp size={18} />}
      />
      <StatCard
        label="Users"
        value={totals ? totals.users : '—'}
        sub={totals ? `${totals.activeUsers30d} signed in during the last 30 days` : hint}
        icon={<Users size={18} />}
      />
      <StatCard label="Audits" value={totals ? totals.audits30d : '—'} sub={totals ? 'Started in the last 30 days' : hint} icon={<Activity size={18} />} />
      <StatCard
        label="Storage used"
        value={totals ? formatMb(totals.storageMb) : '—'}
        sub={totals ? `of ${formatMb(totals.storageQuotaMb)} allocated${storagePct !== null ? ` (${storagePct}%)` : ''}` : hint}
        icon={<HardDrive size={18} />}
      />
    </SummaryGrid>
  );
};

// ---------------------------------------------------------------------------
// Organizations tab: the one tenant table, with every action
// ---------------------------------------------------------------------------

type SortKey = 'name' | 'status' | 'plan' | 'value' | 'users' | 'activity' | 'storage';

interface OrgRow {
  tenant: Tenant;
  metrics: PlatformTenantMetricsRow | null;
}

interface OrganizationsPanelProps {
  tenants: Tenant[];
  metrics: PlatformMetricsDetail | null;
  planNames: Record<string, string>;
  onEdit: (tenant: Tenant) => void;
  onSubscription: (tenant: Tenant, row: PlatformTenantMetricsRow | null) => void;
  onToggleSuspend: (tenant: Tenant) => void;
}

export const OrganizationsPanel: React.FC<OrganizationsPanelProps> = ({ tenants, metrics, planNames, onEdit, onSubscription, onToggleSuspend }) => {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TenantSubscriptionStatus>('ALL');

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tenants.forEach((t) => {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    });
    return counts;
  }, [tenants]);

  const rows = useMemo(() => {
    const byId = new Map((metrics?.tenants || []).map((r) => [r.id, r]));
    const q = filter.trim().toLowerCase();
    const list: OrgRow[] = tenants
      .map((t) => ({ tenant: t, metrics: byId.get(t.id) ?? null }))
      .filter(({ tenant, metrics: m }) => {
        if (statusFilter !== 'ALL' && tenant.status !== statusFilter) return false;
        if (!q) return true;
        return [tenant.name, tenant.slug, tenant.industry, m?.plan ? planNames[m.plan] ?? m.plan : ''].some((v) => (v || '').toLowerCase().includes(q));
      });
    const value = ({ tenant, metrics: m }: OrgRow): string | number => {
      switch (sortKey) {
        case 'status':
          return tenant.status;
        case 'plan':
          return m?.plan ? planNames[m.plan] ?? m.plan : '';
        case 'users':
          return m?.users ?? tenant._count?.users ?? 0;
        case 'activity':
          return (m?.activeUsers30d ?? 0) * 100000 + (m?.audits30d ?? 0);
        case 'storage':
          return m?.storageMb ?? tenant.storageUsedMb ?? 0;
        case 'value':
          return m?.mrr ?? 0;
        default:
          return tenant.name.toLowerCase();
      }
    };
    return [...list].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [tenants, metrics, planNames, sortKey, sortDir, filter, statusFilter]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'status' || key === 'plan' ? 'asc' : 'desc');
    }
  };
  const SortTh: React.FC<{ k: SortKey; children: React.ReactNode; align?: 'left' | 'right' }> = ({ k, children, align = 'left' }) => (
    <th style={{ textAlign: align, whiteSpace: 'nowrap' }} aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
      >
        {children}
        {sortKey === k && (sortDir === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />)}
      </button>
    </th>
  );

  // Below this width the seven columns cannot all be shown side by side, so each organization becomes a card
  const compact = useMediaQuery('(max-width: 1279px)');

  // CSV of the rows as filtered and sorted (opens in Excel; amounts in rupees)
  const exportCsv = () => {
    const cell = (v: string | number | null | undefined) => {
      const text = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = ['Organization', 'Slug', 'Industry', 'Status', 'Plan', 'Monthly value (INR)', 'Trial ends', 'Paid through', 'Users', 'Areas', 'Signed in (30 days)', 'Audits (30 days)', 'Storage used (MB)', 'Storage quota (MB)', 'Created'];
    const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
    const lines = rows.map(({ tenant: t, metrics: m }) =>
      [
        t.name,
        t.slug,
        t.industry,
        tenantStatusLabel(t.status),
        m?.plan ? planNames[m.plan] ?? m.plan : '',
        m?.mrr ?? 0,
        day(m?.trialEndsAt ?? t.trialEndsAt),
        day(m?.currentPeriodEnd ?? t.currentPeriodEnd),
        m?.users ?? t._count?.users ?? 0,
        m?.locations ?? t._count?.locations ?? 0,
        m?.activeUsers30d ?? '',
        m?.audits30d ?? '',
        m?.storageMb ?? t.storageUsedMb ?? 0,
        m?.storageQuotaMb ?? t.storageQuotaMb ?? '',
        day(t.createdAt),
      ]
        .map(cell)
        .join(','),
    );
    // Byte-order mark so Excel opens the UTF-8 file correctly (names may be in any script)
    const blob = new Blob(['\uFEFF' + [header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `organizations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toolbar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <SearchInput
        label="Filter organizations"
        placeholder="Search organizations"
        title="Matches name, slug, industry or plan"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ width: '280px', maxWidth: '100%' }}
      />
      <Button size="sm" variant="secondary" icon={<Download size={16} />} onClick={exportCsv} disabled={rows.length === 0} title="Download the organizations shown as a CSV file">
        Export CSV
      </Button>
    </div>
  );

  const statusChips = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
      <div role="group" aria-label="Filter by status" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '6px' }}>
        {(['ALL', ...STATUSES] as const).map((st) => (
          <button key={st} type="button" className="pillar-tab-pill" aria-pressed={statusFilter === st} onClick={() => setStatusFilter(st)}>
            {st === 'ALL' ? 'All' : tenantStatusLabel(st)} <span className="tabular-nums" style={{ opacity: 0.7 }}>{st === 'ALL' ? tenants.length : statusCounts[st] ?? 0}</span>
          </button>
        ))}
      </div>
      <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }} aria-live="polite">
        Showing {rows.length} of {plural(tenants.length, 'organization')}
      </span>
    </div>
  );

  const empty = <EmptyState title={tenants.length === 0 ? 'No organizations yet.' : 'No organizations match the filters.'} icon={<Building2 size={28} />} />;

  if (compact) {
    return (
      <Card title="Organizations" subtitle="Plan, status and billing dates are changed with Subscription." actions={toolbar}>
        <div style={{ marginBottom: '16px' }}>{statusChips}</div>
        <FormField label="Sort by" style={{ maxWidth: '320px' }}>
          {(control) => (
            <div style={{ display: 'flex', gap: '8px' }}>
              <select {...control} className="form-select" value={sortKey} onChange={(e) => toggleSort(e.target.value as SortKey)}>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABELS[k]}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="secondary"
                icon={sortDir === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                aria-label={sortDir === 'asc' ? 'Ascending; switch to descending' : 'Descending; switch to ascending'}
                title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              />
            </div>
          )}
        </FormField>
        {rows.length === 0 ? (
          empty
        ) : (
          <ul className="grid-auto" style={{ '--min': '300px', listStyle: 'none', margin: '16px 0 0', padding: 0 } as React.CSSProperties}>
            {rows.map(({ tenant: t, metrics: m }) => (
              <li
                key={t.id}
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  minWidth: 0,
                }}
              >
                <OrgIdentity tenant={t} />
                <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px 12px', margin: 0 }}>
                  <div>
                    <dt style={cardLabelStyle}>Status</dt>
                    <dd style={{ margin: 0 }}>
                      <OrgStatus tenant={t} metrics={m} />
                    </dd>
                  </div>
                  <div>
                    <dt style={cardLabelStyle}>Plan</dt>
                    <dd style={{ margin: 0 }}>
                      <OrgPlan tenant={t} metrics={m} planNames={planNames} />
                    </dd>
                  </div>
                  <div>
                    <dt style={cardLabelStyle}>Monthly value</dt>
                    <dd style={{ margin: 0, fontSize: '13px' }}>
                      <OrgValue tenant={t} metrics={m} />
                    </dd>
                  </div>
                  <div>
                    <dt style={cardLabelStyle}>Users &amp; areas</dt>
                    <dd style={{ margin: 0, fontSize: '13px' }}>
                      <OrgUsage tenant={t} metrics={m} />
                    </dd>
                  </div>
                  <div>
                    <dt style={cardLabelStyle}>Last 30 days</dt>
                    <dd style={{ margin: 0, fontSize: '13px' }}>
                      <OrgActivity metrics={m} />
                    </dd>
                  </div>
                  <div>
                    <dt style={cardLabelStyle}>Storage</dt>
                    <dd style={{ margin: 0 }}>
                      <OrgStorage tenant={t} metrics={m} />
                    </dd>
                  </div>
                </dl>
                <OrgActions tenant={t} metrics={m} labelled onEdit={onEdit} onSubscription={onSubscription} onToggleSuspend={onToggleSuspend} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  return (
    <Card title="Organizations" subtitle="Sort by a column heading. Plan, status and billing dates are changed with Subscription." noPadding actions={toolbar}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>{statusChips}</div>
      <div className="enterprise-table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
        <table className="enterprise-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <SortTh k="name">Organization</SortTh>
              <SortTh k="status">Status</SortTh>
              <SortTh k="plan">Plan</SortTh>
              <SortTh k="value" align="right">
                Monthly value
              </SortTh>
              <SortTh k="users" align="right">
                Users &amp; areas
              </SortTh>
              <SortTh k="activity" align="right">
                Last 30 days
              </SortTh>
              <SortTh k="storage">Storage</SortTh>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8}>{empty}</td>
              </tr>
            ) : (
              rows.map(({ tenant: t, metrics: m }) => (
                <tr key={t.id}>
                  <td style={{ minWidth: '200px' }}>
                    <OrgIdentity tenant={t} />
                  </td>
                  <td style={{ minWidth: '140px' }}>
                    <OrgStatus tenant={t} metrics={m} />
                  </td>
                  <td>
                    <OrgPlan tenant={t} metrics={m} planNames={planNames} />
                  </td>
                  <td className="num" style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>
                    <OrgValue tenant={t} metrics={m} />
                  </td>
                  <td className="num" style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>
                    <OrgUsage tenant={t} metrics={m} />
                  </td>
                  <td className="num" style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>
                    <OrgActivity metrics={m} />
                  </td>
                  <td style={{ minWidth: '140px' }}>
                    <OrgStorage tenant={t} metrics={m} />
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <OrgActions tenant={t} metrics={m} onEdit={onEdit} onSubscription={onSubscription} onToggleSuspend={onToggleSuspend} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

const SORT_LABELS: Record<SortKey, string> = {
  name: 'Organization',
  status: 'Status',
  plan: 'Plan',
  value: 'Monthly value',
  users: 'Users',
  activity: 'Last 30 days',
  storage: 'Storage',
};

const cardLabelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' };

/** True while the media query matches (re-evaluated on resize). */
const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
};

const OrgIdentity: React.FC<{ tenant: Tenant }> = ({ tenant: t }) => {
  const { formatDate } = useI18n();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
      {t.logoUrl ? (
        // Logos are designed for light backgrounds
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            background: '#FFFFFF',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2px',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <img src={t.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
      ) : (
        <div
          aria-hidden="true"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-primary)',
            color: 'var(--text-on-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: '14px',
            flexShrink: 0,
          }}
        >
          {t.name.charAt(0)}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.35, overflowWrap: 'anywhere' }} title={`Created ${formatDate(t.createdAt)}`}>
          {t.name}
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
          <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{t.slug}</span>
          {t.industry ? ` · ${t.industry}` : ''}
        </div>
      </div>
    </div>
  );
};

interface OrgCellProps {
  tenant: Tenant;
  metrics: PlatformTenantMetricsRow | null;
}

const OrgStatus: React.FC<OrgCellProps> = ({ tenant: t, metrics: m }) => {
  const trialDays = daysUntil(m?.trialEndsAt ?? t.trialEndsAt ?? null);
  return (
    <>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Badge variant={tenantStatusVariant(t.status)} style={{ whiteSpace: 'nowrap' }}>
          {tenantStatusLabel(t.status)}
        </Badge>
        {m?.readOnly && (
          <Badge variant="danger" icon={<Lock size={12} aria-hidden="true" />} style={{ whiteSpace: 'nowrap' }}>
            {readOnlyLabel(m.readOnlyReason)}
          </Badge>
        )}
        {m?.churnRisk && <Badge variant="warning">No sign-ins in 30 days</Badge>}
      </div>
      {t.status === 'TRIAL' && trialDays !== null && (
        <div style={{ fontSize: '12.5px', color: trialDays <= 3 ? 'var(--color-warning)' : 'var(--text-tertiary)', marginTop: '3px' }}>
          {trialDays > 0 ? `${plural(trialDays, 'day')} left` : 'Trial ended'}
        </div>
      )}
    </>
  );
};

const OrgPlan: React.FC<OrgCellProps & { planNames: Record<string, string> }> = ({ tenant: t, metrics: m, planNames }) => {
  const { formatDate } = useI18n();
  const trialEnds = m?.trialEndsAt ?? t.trialEndsAt ?? null;
  const paidThrough = m?.currentPeriodEnd ?? t.currentPeriodEnd ?? null;
  return (
    <>
      {m?.plan ? (
        <Badge variant="info" style={{ whiteSpace: 'nowrap' }}>
          {planNames[m.plan] ?? m.plan}
        </Badge>
      ) : (
        <span style={{ color: 'var(--text-tertiary)' }}>{m ? 'No plan' : '—'}</span>
      )}
      <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '3px' }}>
        {t.status === 'TRIAL' ? (trialEnds ? `Trial until ${formatDate(trialEnds)}` : '') : paidThrough ? `Paid through ${formatDate(paidThrough)}` : ''}
      </div>
    </>
  );
};

/** List price the organization pays per month; trials and lapsed subscriptions show why they add nothing. */
const OrgValue: React.FC<OrgCellProps> = ({ tenant: t, metrics: m }) => {
  if (!m) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
  if (m.mrr > 0) {
    return (
      <>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatInr(m.mrr)}</span>
        <div style={{ color: 'var(--text-tertiary)' }}>per month</div>
      </>
    );
  }
  const reason = t.status === 'TRIAL' ? 'On trial' : m.readOnly ? 'Lapsed' : t.status === 'ACTIVE' ? (m.plan ? 'Free plan' : 'No plan') : 'Not billed';
  return <span style={{ color: 'var(--text-tertiary)' }}>{reason}</span>;
};

const OrgUsage: React.FC<OrgCellProps> = ({ tenant: t, metrics: m }) => (
  <>
    {plural(m?.users ?? t._count?.users ?? 0, 'user')}
    <div style={{ color: 'var(--text-secondary)' }}>{plural(m?.locations ?? t._count?.locations ?? 0, 'area')}</div>
  </>
);

const OrgActivity: React.FC<{ metrics: PlatformTenantMetricsRow | null }> = ({ metrics: m }) =>
  m ? (
    <>
      {m.activeUsers30d} signed in
      <div style={{ color: 'var(--text-secondary)' }}>{plural(m.audits30d, 'audit')}</div>
    </>
  ) : (
    <span style={{ color: 'var(--text-tertiary)' }}>—</span>
  );

const OrgStorage: React.FC<OrgCellProps> = ({ tenant: t, metrics: m }) => {
  // Stored-file totals (metrics) are exact; the tenant row is rounded up to whole MB
  const usedMb = m?.storageMb ?? t.storageUsedMb ?? 0;
  const quotaMb = m?.storageQuotaMb ?? t.storageQuotaMb ?? 0;
  const storagePct = quotaMb > 0 ? Math.min(100, (usedMb / quotaMb) * 100) : 0;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '2px 6px', fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '5px' }}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{formatMb(usedMb)}</span>
        <span style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{quotaMb > 0 ? `of ${formatMb(quotaMb)}` : 'no quota'}</span>
      </div>
      <ProgressBar value={storagePct} height={6} color={storagePct >= 90 ? 'danger' : storagePct >= 75 ? 'warning' : 'primary'} ariaLabel={`${t.name} storage used`} />
    </>
  );
};

interface OrgActionsProps extends OrgCellProps {
  /** Text labels next to the icons (cards); the table uses icon buttons with accessible names to stay narrow. */
  labelled?: boolean;
  onEdit: (tenant: Tenant) => void;
  onSubscription: (tenant: Tenant, row: PlatformTenantMetricsRow | null) => void;
  onToggleSuspend: (tenant: Tenant) => void;
}

const OrgActions: React.FC<OrgActionsProps> = ({ tenant: t, metrics: m, labelled = false, onEdit, onSubscription, onToggleSuspend }) => {
  const canSuspend = t.status === 'ACTIVE' || t.status === 'TRIAL';
  const canReactivate = t.status === 'SUSPENDED';
  const suspendLabel = canReactivate ? 'Reactivate' : 'Suspend';
  if (!labelled) {
    // Table: one visible primary action and the rest in a menu, so every row keeps the same width
    return (
      <div className="row-actions">
        <Button size="sm" variant="secondary" icon={<CreditCard size={16} />} onClick={() => onSubscription(t, m)} title="Plan, status, trial and paid-through dates, storage">
          Manage
        </Button>
        <RowActionsMenu
          label={`More actions for ${t.name}`}
          actions={[
            { label: 'Edit profile', icon: <Edit3 size={16} />, onSelect: () => onEdit(t) },
            { label: 'Subscription', icon: <CreditCard size={16} />, onSelect: () => onSubscription(t, m) },
            ...(canSuspend || canReactivate
              ? [{ label: `${suspendLabel} organization`, icon: <Power size={16} />, danger: canSuspend, separated: true, onSelect: () => onToggleSuspend(t) }]
              : []),
          ]}
        />
      </div>
    );
  }
  return (
    <div
      role="group"
      aria-label={`Actions for ${t.name}`}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: labelled ? 'flex-start' : 'flex-end', gap: '4px' }}
    >
      <Button size="sm" variant={labelled ? 'secondary' : 'ghost'} icon={<Edit3 size={16} />} onClick={() => onEdit(t)} aria-label={`Edit ${t.name}`} title="Name, industry and logo">
        {labelled ? 'Edit' : undefined}
      </Button>
      <Button
        size="sm"
        variant={labelled ? 'secondary' : 'ghost'}
        icon={<CreditCard size={16} />}
        onClick={() => onSubscription(t, m)}
        aria-label={`Subscription for ${t.name}`}
        title="Plan, status, trial and paid-through dates, storage"
      >
        {labelled ? 'Subscription' : undefined}
      </Button>
      {(canSuspend || canReactivate) && (
        <Button
          size="sm"
          variant={canReactivate ? 'secondary' : 'ghost'}
          icon={<Power size={16} color={canReactivate ? undefined : 'var(--color-danger)'} />}
          onClick={() => onToggleSuspend(t)}
          aria-label={`${suspendLabel} ${t.name}`}
          title={suspendLabel}
        >
          {labelled || canReactivate ? suspendLabel : undefined}
        </Button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Insights tab: distributions and lists that need attention
// ---------------------------------------------------------------------------

const Distribution: React.FC<{ title: string; data: Record<string, number> | null | undefined; total: number; label: (key: string) => string }> = ({ title, data, total, label }) => {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  return (
    <Card title={title}>
      {entries.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No organizations.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {entries.map(([key, count]) => {
            const pct = total ? Math.round((count / total) * 100) : 0;
            return (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '13px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{label(key)}</span>
                  <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {count} ({pct}%)
                  </span>
                </div>
                <ProgressBar value={pct} height={6} color="primary" ariaLabel={`${label(key)} share`} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

/** Monthly recurring revenue (list price) split by plan, largest first. */
const RevenueByPlan: React.FC<{ metrics: PlatformMetricsDetail; planNames: Record<string, string> }> = ({ metrics, planNames }) => {
  const byPlan = new Map<string, { mrr: number; orgs: number }>();
  metrics.tenants
    .filter((t) => t.mrr > 0)
    .forEach((t) => {
      const key = t.plan ?? 'NONE';
      const cur = byPlan.get(key) ?? { mrr: 0, orgs: 0 };
      byPlan.set(key, { mrr: cur.mrr + t.mrr, orgs: cur.orgs + 1 });
    });
  const entries = [...byPlan.entries()].sort((a, b) => b[1].mrr - a[1].mrr);
  const total = metrics.totals.mrr;
  return (
    <Card title="Monthly revenue by plan" subtitle={`${formatInr(total)} per month · ${formatInr(total * 12)} per year`}>
      {entries.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No paying organizations yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {entries.map(([plan, v]) => {
            const pct = total ? Math.round((v.mrr / total) * 100) : 0;
            const name = plan === 'NONE' ? 'No plan' : planNames[plan] ?? plan;
            return (
              <div key={plan}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '13px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {name} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>· {plural(v.orgs, 'organization')}</span>
                  </span>
                  <span className="tabular-nums" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {formatInr(v.mrr)} ({pct}%)
                  </span>
                </div>
                <ProgressBar value={pct} height={6} color="success" ariaLabel={`${name} share of monthly revenue`} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

const AttentionList: React.FC<{
  title: string;
  icon: React.ReactNode;
  empty: string;
  items: { id: string; name: string; detail: React.ReactNode }[];
  onOpen: (id: string) => void;
}> = ({ title, icon, empty, items, onOpen }) => (
  <Card
    header={
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {icon}
        <h3 className="card-title" style={{ margin: 0 }}>{title}</h3>
        <Badge variant="neutral">{items.length}</Badge>
      </div>
    }
  >
    {items.length === 0 ? (
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{empty}</div>
    ) : (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
        {items.map((i) => (
          <li key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '14px', minHeight: '32px' }}>
            <button
              type="button"
              onClick={() => onOpen(i.id)}
              style={{ font: 'inherit', background: 'none', border: 'none', padding: 0, color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer', textAlign: 'left', minWidth: 0, overflowWrap: 'anywhere' }}
            >
              {i.name}
            </button>
            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{i.detail}</span>
          </li>
        ))}
      </ul>
    )}
  </Card>
);

interface InsightsPanelProps {
  metrics: PlatformMetricsDetail | null;
  loading: boolean;
  error: string | null;
  planNames: Record<string, string>;
  onReload: () => void;
  onOpenSubscription: (tenantId: string) => void;
}

export const PlatformInsightsPanel: React.FC<InsightsPanelProps> = ({ metrics, loading, error, planNames, onReload, onOpenSubscription }) => {
  const { formatDate, formatDateTime } = useI18n();

  if (loading && !metrics) {
    return (
      <Card>
        <LoadingState label="Loading platform figures…" />
      </Card>
    );
  }
  if (error || !metrics) {
    return (
      <Card>
        <ErrorState message={error || 'Platform figures are unavailable.'} onRetry={onReload} />
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Figures as of {formatDateTime(metrics.generatedAt)}</span>

      <div className="grid-auto" style={{ '--min': '260px' } as React.CSSProperties}>
        <Distribution title="Organizations by status" data={metrics.byStatus} total={metrics.totals.tenants} label={tenantStatusLabel} />
        <Distribution title="Organizations by plan" data={metrics.byPlan} total={metrics.totals.tenants} label={(k) => (k === 'NONE' ? 'No plan' : planNames[k] ?? k)} />
        <RevenueByPlan metrics={metrics} planNames={planNames} />
      </div>

      <div className="grid-auto" style={{ '--min': '260px' } as React.CSSProperties}>
        <AttentionList
          title="Trials ending in 14 days"
          icon={<Clock size={18} color="var(--color-warning)" aria-hidden="true" />}
          empty="No trials ending soon."
          items={(metrics.trialsEndingIn14Days || []).map((t) => {
            const left = daysUntil(t.trialEndsAt) ?? 0;
            return { id: t.id, name: t.name, detail: `${formatDate(t.trialEndsAt)} (${left > 0 ? `${plural(left, 'day')} left` : 'today'})` };
          })}
          onOpen={onOpenSubscription}
        />
        <AttentionList
          title="Read-only organizations"
          icon={<Lock size={18} color="var(--color-danger)" aria-hidden="true" />}
          empty="No organization is read-only."
          items={(metrics.readOnlyTenants || []).map((t) => ({ id: t.id, name: t.name, detail: readOnlyLabel(t.reason) }))}
          onOpen={onOpenSubscription}
        />
        <AttentionList
          title="No sign-ins in 30 days"
          icon={<TrendingDown size={18} color="var(--color-danger)" aria-hidden="true" />}
          empty="Every active or trial organization had sign-ins in the last 30 days."
          items={(metrics.churnRisk || []).map((t) => ({ id: t.id, name: t.name, detail: plural(t.users, 'user') }))}
          onOpen={onOpenSubscription}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tenant subscription editor
// ---------------------------------------------------------------------------

export interface SubscriptionEditTarget {
  id: string;
  name: string;
  status: TenantSubscriptionStatus;
  plan: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  storageQuotaMb: number | null;
  /** undefined when not known (left unchanged unless edited). */
  billingEmail?: string | null;
}

interface TenantSubscriptionModalProps {
  target: SubscriptionEditTarget | null;
  plans: PlatformPlan[];
  onClose: () => void;
  onSaved: () => void;
}

export const TenantSubscriptionModal: React.FC<TenantSubscriptionModalProps> = ({ target, plans, onClose, onSaved }) => {
  const { addToast } = useApp();
  const [planCode, setPlanCode] = useState('');
  const [status, setStatus] = useState<TenantSubscriptionStatus>('ACTIVE');
  const [trialEndsAt, setTrialEndsAt] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [storage, setStorage] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [errors, setErrors] = useState<{ storage?: string; billingEmail?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setPlanCode(target.plan || '');
    setStatus(target.status);
    setTrialEndsAt(toDateInput(target.trialEndsAt));
    setPeriodEnd(toDateInput(target.currentPeriodEnd));
    setStorage(target.storageQuotaMb ? String(target.storageQuotaMb) : '');
    setBillingEmail(target.billingEmail || '');
    setErrors({});
  }, [target]);

  if (!target) return null;

  const selectedPlan = plans.find((p) => p.code === planCode);
  const planChanged = !!planCode && planCode !== (target.plan || '');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    const payload: TenantSubscriptionPayload = {};
    if (planChanged) payload.planCode = planCode;
    if (status !== target.status) payload.status = status;
    if (trialEndsAt !== toDateInput(target.trialEndsAt)) payload.trialEndsAt = trialEndsAt ? fromDateInput(trialEndsAt) : null;
    if (periodEnd !== toDateInput(target.currentPeriodEnd)) payload.currentPeriodEnd = periodEnd ? fromDateInput(periodEnd) : null;
    // A plan change resets the quota to the plan's (the field is emptied then); a value entered here overrides it
    if (storage.trim()) {
      const storageNum = Number(storage);
      if (!Number.isInteger(storageNum) || storageNum < 100 || storageNum > 10000000) {
        nextErrors.storage = 'Enter a whole number between 100 and 10,000,000 MB.';
      } else if (planChanged || storageNum !== target.storageQuotaMb) {
        payload.storageQuotaMb = storageNum;
      }
    }
    const email = billingEmail.trim();
    const initialEmail = (target.billingEmail || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.billingEmail = 'Enter a valid email address or leave it empty.';
    else if (target.billingEmail !== undefined ? email !== initialEmail : email !== '') payload.billingEmail = email || null;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await api.updateTenantSubscription(target.id, payload);
      addToast({ type: 'success', title: 'Subscription updated', message: `${target.name}'s subscription was saved.` });
      onSaved();
      onClose();
    } catch (err) {
      addToast({ type: 'error', title: 'Subscription not saved', message: getApiErrorMessage(err, 'Could not update the subscription.') });
    } finally {
      setSaving(false);
    }
  };

  const activePlans = plans.filter((p) => p.isActive || p.code === target.plan);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Subscription: ${target.name}`}
      subtitle="Plan, status and billing dates. There is no payment gateway; changes apply immediately."
      maxWidth="560px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="tenant-subscription-form" loading={saving}>
            Save subscription
          </Button>
        </>
      }
    >
      <form id="tenant-subscription-form" onSubmit={save} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
          <div>
            <label className="form-label" style={labelStyle} htmlFor="sub-plan">
              Plan
            </label>
            <select
              id="sub-plan"
              className="form-select"
              value={planCode}
              onChange={(e) => {
                setPlanCode(e.target.value);
                // Default to the new plan's quota; the admin can still type an override
                setStorage(e.target.value && e.target.value !== (target.plan || '') ? '' : target.storageQuotaMb ? String(target.storageQuotaMb) : '');
              }}
            >
              {!target.plan && <option value="">No plan</option>}
              {activePlans.map((p) => (
                <option key={p.code} value={p.code} disabled={!p.isActive}>
                  {p.name} · {formatInr(p.priceMonthly)}/month
                  {p.isActive ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" style={labelStyle} htmlFor="sub-status">
              Status
            </label>
            <select id="sub-status" className="form-select" value={status} onChange={(e) => setStatus(e.target.value as TenantSubscriptionStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tenantStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {selectedPlan && (
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: '12px',
              margin: 0,
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {[
              ['Price', `${formatInr(selectedPlan.priceMonthly)}/mo`],
              ['Users', selectedPlan.maxUsers ?? 'Unlimited'],
              ['Locations', selectedPlan.maxLocations ?? 'Unlimited'],
              ['Storage', formatMb(selectedPlan.storageQuotaMb)],
            ].map(([k, v]) => (
              <div key={k} style={{ minWidth: 0 }}>
                <dt style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{k}</dt>
                <dd className="tabular-nums" style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {planChanged && selectedPlan && (
          <div className="quick-tip-card">
            Switching to {selectedPlan.name} also sets storage to the plan quota ({formatMb(selectedPlan.storageQuotaMb)}) unless you override it below.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
          <div>
            <label className="form-label" style={labelStyle} htmlFor="sub-trial">
              Trial ends
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input id="sub-trial" type="date" className="form-input" value={trialEndsAt} onChange={(e) => setTrialEndsAt(e.target.value)} />
              <Button type="button" variant="ghost" size="sm" disabled={!trialEndsAt} onClick={() => setTrialEndsAt('')}>
                Clear
              </Button>
            </div>
            <span className="form-hint" style={{ display: 'block', marginTop: '6px' }}>Applies while the status is Trial.</span>
          </div>
          <div>
            <label className="form-label" style={labelStyle} htmlFor="sub-period">
              Paid through
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input id="sub-period" type="date" className="form-input" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              <Button type="button" variant="ghost" size="sm" disabled={!periodEnd} onClick={() => setPeriodEnd('')}>
                Clear
              </Button>
            </div>
            <span className="form-hint" style={{ display: 'block', marginTop: '6px' }}>Active organizations become read-only after this date plus the grace period.</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
          <div>
            <label className="form-label" style={labelStyle} htmlFor="sub-storage">
              Storage quota override (MB)
            </label>
            <input
              id="sub-storage"
              type="number"
              min={100}
              max={10000000}
              step={1}
              className="form-input"
              value={storage}
              onChange={(e) => setStorage(e.target.value)}
              placeholder={selectedPlan ? String(selectedPlan.storageQuotaMb) : 'Plan default'}
              aria-invalid={!!errors.storage}
              aria-describedby={errors.storage ? 'sub-storage-error' : undefined}
            />
            {errors.storage && (
              <span id="sub-storage-error" className="form-error" role="alert">
                {errors.storage}
              </span>
            )}
          </div>
          <div>
            <label className="form-label" style={labelStyle} htmlFor="sub-billing">
              Billing email
            </label>
            <input
              id="sub-billing"
              type="email"
              className="form-input"
              value={billingEmail}
              onChange={(e) => setBillingEmail(e.target.value)}
              aria-invalid={!!errors.billingEmail}
              aria-describedby={errors.billingEmail ? 'sub-billing-error' : 'sub-billing-hint'}
            />
            {errors.billingEmail ? (
              <span id="sub-billing-error" className="form-error" role="alert">
                {errors.billingEmail}
              </span>
            ) : (
              <span id="sub-billing-hint" className="form-hint">
                Leave empty to clear.
              </span>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Plans tab
// ---------------------------------------------------------------------------

interface PlanForm {
  code: string;
  name: string;
  description: string;
  priceMonthly: string;
  maxUsers: string;
  unlimitedUsers: boolean;
  maxLocations: string;
  unlimitedLocations: boolean;
  storageQuotaMb: string;
  features: string[];
  isActive: boolean;
  sortOrder: string;
}

const emptyPlanForm = (sortOrder = 0): PlanForm => ({
  code: '',
  name: '',
  description: '',
  priceMonthly: '0',
  maxUsers: '25',
  unlimitedUsers: false,
  maxLocations: '25',
  unlimitedLocations: false,
  storageQuotaMb: '5120',
  features: [],
  isActive: true,
  sortOrder: String(sortOrder),
});

const planToForm = (p: PlatformPlan): PlanForm => ({
  code: p.code,
  name: p.name,
  description: p.description || '',
  priceMonthly: String(p.priceMonthly ?? 0),
  maxUsers: p.maxUsers === null || p.maxUsers === undefined ? '' : String(p.maxUsers),
  unlimitedUsers: p.maxUsers === null || p.maxUsers === undefined,
  maxLocations: p.maxLocations === null || p.maxLocations === undefined ? '' : String(p.maxLocations),
  unlimitedLocations: p.maxLocations === null || p.maxLocations === undefined,
  storageQuotaMb: String(p.storageQuotaMb ?? ''),
  features: Array.isArray(p.features) ? p.features : [],
  isActive: p.isActive !== false,
  sortOrder: String(p.sortOrder ?? 0),
});

const PlanModal: React.FC<{
  open: boolean;
  editing: PlatformPlan | null;
  features: { code: string; label: string }[];
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}> = ({ open, editing, features, nextSortOrder, onClose, onSaved }) => {
  const { addToast } = useApp();
  const [form, setForm] = useState<PlanForm>(emptyPlanForm());
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(editing ? planToForm(editing) : emptyPlanForm(nextSortOrder));
      setProblem(null);
    }
  }, [open, editing, nextSortOrder]);

  const set = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const validate = (): string | null => {
    if (!editing && !/^[A-Z][A-Z0-9_]{1,29}$/.test(form.code)) return 'Code must be 2–30 upper-case letters, digits or underscores, starting with a letter.';
    if (form.name.trim().length < 2) return 'Name must be at least 2 characters.';
    const price = Number(form.priceMonthly);
    if (!Number.isFinite(price) || price < 0 || price > 100000000) return 'Price must be between ₹0 and ₹10,00,00,000 per month.';
    const intIn = (v: string, min: number, max: number) => Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max && v.trim() !== '';
    if (!form.unlimitedUsers && !intIn(form.maxUsers, 1, 1000000)) return 'Max users must be a whole number of at least 1, or Unlimited.';
    if (!form.unlimitedLocations && !intIn(form.maxLocations, 1, 1000000)) return 'Max locations must be a whole number of at least 1, or Unlimited.';
    if (!intIn(form.storageQuotaMb, 100, 10000000)) return 'Storage must be a whole number between 100 and 10,000,000 MB.';
    if (!intIn(form.sortOrder, 0, 1000)) return 'Sort order must be a whole number between 0 and 1000.';
    return null;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const issue = validate();
    setProblem(issue);
    if (issue) return;
    const payload: PlanPayload = {
      name: form.name.trim(),
      description: form.description.trim(),
      priceMonthly: Number(form.priceMonthly),
      currency: 'INR',
      maxUsers: form.unlimitedUsers ? null : Number(form.maxUsers),
      maxLocations: form.unlimitedLocations ? null : Number(form.maxLocations),
      storageQuotaMb: Number(form.storageQuotaMb),
      features: form.features,
      sortOrder: Number(form.sortOrder),
    };
    setSaving(true);
    try {
      if (editing) {
        await api.updatePlatformPlan(editing.code, { ...payload, isActive: form.isActive });
      } else {
        await api.createPlatformPlan({ ...payload, code: form.code });
      }
      addToast({
        type: 'success',
        title: editing ? 'Plan updated' : 'Plan created',
        message: editing ? `${form.name} saved. Limits apply immediately to subscribed organizations.` : `${form.name} is available.`,
      });
      onSaved();
      onClose();
    } catch (err) {
      addToast({ type: 'error', title: 'Plan not saved', message: getApiErrorMessage(err, 'Could not save the plan.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={editing ? `Edit plan: ${editing.name}` : 'Create plan'}
      subtitle={editing ? 'Changes to limits and features apply immediately to every organization on this plan.' : 'New plans can be assigned to organizations once saved.'}
      maxWidth="640px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="plan-form" loading={saving}>
            {editing ? 'Save plan' : 'Create plan'}
          </Button>
        </>
      }
    >
      <form id="plan-form" onSubmit={save} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {problem && (
          <div role="alert" style={{ fontSize: '13px', color: 'var(--color-danger)', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
            {problem}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: '16px' }}>
          <div>
            <label className="form-label" style={labelStyle} htmlFor="plan-code">
              Code <span className="required" aria-hidden="true">*</span>
            </label>
            <input
              id="plan-code"
              className="form-input"
              value={form.code}
              disabled={!!editing}
              maxLength={30}
              onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
              placeholder="GROWTH"
              required
            />
          </div>
          <div>
            <label className="form-label" style={labelStyle} htmlFor="plan-name">
              Name <span className="required" aria-hidden="true">*</span>
            </label>
            <input id="plan-name" className="form-input" value={form.name} maxLength={60} onChange={(e) => set('name', e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="form-label" style={labelStyle} htmlFor="plan-desc">
            Description
          </label>
          <textarea id="plan-desc" className="form-textarea" rows={2} maxLength={500} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
          <div>
            <label className="form-label" style={labelStyle} htmlFor="plan-price">
              Price per month (₹)
            </label>
            <div style={{ position: 'relative' }}>
              <span aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontWeight: 600, pointerEvents: 'none' }}>
                ₹
              </span>
              <input
                id="plan-price"
                type="number"
                min={0}
                step="1"
                inputMode="numeric"
                className="form-input"
                style={{ paddingLeft: '28px' }}
                value={form.priceMonthly}
                onChange={(e) => set('priceMonthly', e.target.value)}
                aria-describedby="plan-price-hint"
              />
            </div>
            <span id="plan-price-hint" className="form-hint" style={{ display: 'block', marginTop: '6px' }}>
              {Number.isFinite(Number(form.priceMonthly)) && form.priceMonthly.trim() !== ''
                ? `${formatInr(Number(form.priceMonthly))} per month · ${formatInr(Number(form.priceMonthly) * 12)} per year. Prices are in Indian rupees.`
                : 'Prices are in Indian rupees.'}
            </span>
          </div>
          <div>
            <label className="form-label" style={labelStyle} htmlFor="plan-storage">
              Storage (MB)
            </label>
            <input id="plan-storage" type="number" min={100} step={1} className="form-input" value={form.storageQuotaMb} onChange={(e) => set('storageQuotaMb', e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
          {(
            [
              ['maxUsers', 'unlimitedUsers', 'Max users'],
              ['maxLocations', 'unlimitedLocations', 'Max locations'],
            ] as const
          ).map(([key, flag, label]) => (
            <div key={key}>
              <label className="form-label" style={labelStyle} htmlFor={`plan-${key}`}>
                {label}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  id={`plan-${key}`}
                  type="number"
                  min={1}
                  step={1}
                  className="form-input"
                  value={form[flag] ? '' : form[key]}
                  disabled={form[flag]}
                  placeholder={form[flag] ? 'Unlimited' : ''}
                  onChange={(e) => set(key, e.target.value)}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', whiteSpace: 'nowrap', cursor: 'pointer', minHeight: '40px' }}>
                  <input type="checkbox" checked={form[flag]} onChange={(e) => set(flag, e.target.checked)} />
                  Unlimited
                </label>
              </div>
            </div>
          ))}
        </div>
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend className="form-label" style={labelStyle}>Features</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {features.map((f) => (
              <label key={f.code} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '14px', cursor: 'pointer', padding: '4px 0' }}>
                <input
                  type="checkbox"
                  style={{ marginTop: '3px' }}
                  checked={form.features.includes(f.code)}
                  onChange={(e) => set('features', e.target.checked ? [...form.features, f.code] : form.features.filter((c) => c !== f.code))}
                />
                <span>
                  <strong>{featureName(f.code)}</strong> <span style={{ color: 'var(--text-secondary)' }}>— {f.label}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px', alignItems: 'end' }}>
          <div>
            <label className="form-label" style={labelStyle} htmlFor="plan-sort">
              Sort order
            </label>
            <input id="plan-sort" type="number" min={0} max={1000} step={1} className="form-input" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          </div>
          {editing && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', minHeight: '40px' }}>
              <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
              Active (can be assigned to organizations)
            </label>
          )}
        </div>
      </form>
    </Modal>
  );
};

interface PlansPanelProps {
  catalogue: PlatformPlanCatalogue | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}

export const PlansPanel: React.FC<PlansPanelProps> = ({ catalogue, loading, error, onReload }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformPlan | null>(null);
  const plans = catalogue?.plans || [];
  const features = catalogue?.features || [];
  const featureLabel = (code: string) => features.find((f) => f.code === code)?.label || featureName(code);

  if (loading && !catalogue) {
    return (
      <Card>
        <LoadingState label="Loading plans…" />
      </Card>
    );
  }
  if (error || !catalogue) {
    return (
      <Card>
        <ErrorState message={error || 'Plans are unavailable.'} onRetry={onReload} />
      </Card>
    );
  }

  return (
    <>
      <Card
        title="Plan catalogue"
        subtitle="Prices, limits and features. Limit changes apply immediately to subscribed organizations."
        noPadding
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={16} />} loading={loading} onClick={onReload}>
              Refresh
            </Button>
            <Button
              size="sm"
              icon={<Plus size={16} />}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              New plan
            </Button>
          </>
        }
      >
        <div className="enterprise-table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
          <table className="enterprise-table" style={{ width: '100%', minWidth: '820px' }}>
            <thead>
              <tr>
                <th>Plan</th>
                <th className="num">Price / month</th>
                <th className="num">Users</th>
                <th className="num">Locations</th>
                <th className="num">Storage</th>
                <th>Features</th>
                <th className="num">Organizations</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {plans.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <EmptyState title="No plans yet." icon={<CreditCard size={28} />} />
                  </td>
                </tr>
              ) : (
                plans.map((p) => (
                  <tr key={p.code}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                      <span className="code-tag" style={{ display: 'inline-block', marginTop: '4px' }}>{p.code}</span>
                    </td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.priceMonthly > 0 ? formatMoney(p.priceMonthly) : 'Free'}</div>
                      {p.priceMonthly > 0 && <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{formatMoney(p.priceMonthly * 12)} / year</div>}
                    </td>
                    <td className="num">
                      {p.maxUsers ?? 'Unlimited'}
                    </td>
                    <td className="num">
                      {p.maxLocations ?? 'Unlimited'}
                    </td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {formatMb(p.storageQuotaMb)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {(p.features || []).length === 0 ? (
                          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Core only</span>
                        ) : (
                          (p.features || []).map((f) => (
                            <span key={f} title={featureLabel(f)} className="badge badge-info" style={{ whiteSpace: 'nowrap' }}>
                              {featureName(f)}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="num">
                      {p._count?.tenants ?? 0}
                    </td>
                    <td>
                      <Badge variant={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Edit3 size={16} />}
                        onClick={() => {
                          setEditing(p);
                          setModalOpen(true);
                        }}
                        aria-label={`Edit plan ${p.name}`}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <PlanModal
        open={modalOpen}
        editing={editing}
        features={features}
        nextSortOrder={plans.reduce((m, p) => Math.max(m, p.sortOrder ?? 0), 0) + 1}
        onClose={() => setModalOpen(false)}
        onSaved={onReload}
      />
    </>
  );
};
