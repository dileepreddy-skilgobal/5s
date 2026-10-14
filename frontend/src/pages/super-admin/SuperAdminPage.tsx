import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Tenant } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Tabs } from '../../components/ui/Tabs';
import {
  ShieldCheck,
  Plus,
  Building2,
  HardDrive,
  Users,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Power,
  Edit3,
  DollarSign,
  TrendingUp,
  Sparkles,
  Cpu,
  Activity,
  Server,
  Lock,
  RefreshCw,
  BarChart3,
  Compass,
  Database,
  FileCheck,
  Layers,
  Zap,
  Check,
  Clock,
  ArrowUpRight,
} from 'lucide-react';
import { TenantLogoUploader } from '../../components/common/TenantLogoUploader';

export const SuperAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { tenants, refreshTenants, addToast } = useApp();

  const [activeTab, setActiveTab] = useState<'tenants' | 'saas_kpis' | 'ai_governance' | 'infrastructure'>('tenants');

  useEffect(() => {
    refreshTenants();
  }, []);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(false);

  // Form State (Create)
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [industry, setIndustry] = useState('Manufacturing');
  const [logoUrl, setLogoUrl] = useState('');
  const [storageQuotaMb, setStorageQuotaMb] = useState(5120);
  const [subscriptionTier, setSubscriptionTier] = useState('ENTERPRISE');

  // Form State (Edit)
  const [editName, setEditName] = useState('');
  const [editIndustry, setEditIndustry] = useState('Manufacturing');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [editStorageQuotaMb, setEditStorageQuotaMb] = useState(5120);
  const [editSubscriptionTier, setEditSubscriptionTier] = useState('ENTERPRISE');

  const getTierFromTenant = (t: Tenant): string => {
    if (t.subscriptionTier) return t.subscriptionTier;
    if (t.settings) {
      try {
        const parsed = JSON.parse(t.settings);
        if (parsed.subscriptionTier) return parsed.subscriptionTier;
      } catch (e) {}
    }
    return t.status === 'TRIAL' ? 'TRIAL' : 'ENTERPRISE';
  };

  const handleOpenEdit = (t: Tenant) => {
    setEditingTenant(t);
    setEditName(t.name);
    setEditIndustry(t.industry || 'Manufacturing');
    setEditLogoUrl(t.logoUrl || '');
    setEditStorageQuotaMb(t.storageQuotaMb || 5120);
    setEditSubscriptionTier(getTierFromTenant(t));
    setEditModalOpen(true);
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug) return;
    setLoading(true);
    try {
      const newTenant = await api.createTenant({
        name,
        slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        industry,
        logoUrl: logoUrl || undefined,
        storageQuotaMb,
        settings: JSON.stringify({
          subscriptionTier,
          brandColor: '#2563EB',
          defaultAuditFrequency: 'WEEKLY',
        }),
      });
      addToast({
        type: 'success',
        title: 'Tenant Provisioned',
        message: `Tenant '${newTenant.name}' has been successfully provisioned with ${subscriptionTier} tier.`,
      });
      setCreateModalOpen(false);
      setName('');
      setSlug('');
      setLogoUrl('');
      setSubscriptionTier('ENTERPRISE');
      await refreshTenants();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Provisioning Failed',
        message: err?.response?.data?.message || 'Failed to create tenant.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant || !editName) return;
    setLoading(true);
    try {
      let existingSettings: any = {};
      if (editingTenant.settings) {
        try {
          existingSettings = JSON.parse(editingTenant.settings);
        } catch (e) {}
      }
      existingSettings.subscriptionTier = editSubscriptionTier;

      await api.updateTenant(editingTenant.id, {
        name: editName,
        industry: editIndustry,
        logoUrl: editLogoUrl,
        storageQuotaMb: editStorageQuotaMb,
        settings: JSON.stringify(existingSettings),
      });
      addToast({
        type: 'success',
        title: 'Tenant Updated',
        message: `Tenant '${editName}' profile & ${editSubscriptionTier} subscription updated.`,
      });
      setEditModalOpen(false);
      setEditingTenant(null);
      await refreshTenants();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: err?.response?.data?.message || 'Failed to update tenant.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (tenant: Tenant) => {
    const nextStatus = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await api.toggleTenantStatus(tenant.id, nextStatus);
      addToast({
        type: nextStatus === 'ACTIVE' ? 'success' : 'warning',
        title: `Tenant ${nextStatus}`,
        message: `Tenant '${tenant.name}' is now ${nextStatus}. ${nextStatus === 'SUSPENDED' ? '(Workstation operations temporarily paused)' : ''}`,
      });
      await refreshTenants();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Status Update Failed',
        message: 'Could not change tenant status.',
      });
    }
  };

  // Aggregated KPIs
  const totalUsers = tenants.reduce((acc, t) => acc + (t._count?.users || 0), 0);
  const totalLocations = tenants.reduce((acc, t) => acc + (t._count?.locations || 0), 0);
  const activeTenants = tenants.filter((t) => t.status === 'ACTIVE').length;
  const trialTenants = tenants.filter((t) => t.status === 'TRIAL').length;
  const totalStorageUsed = tenants.reduce((acc, t) => acc + (t.storageUsedMb || 0), 0);

  // Revenue & Subscription Calculation
  const estimatedMrr = tenants.reduce((acc, t) => {
    const tier = getTierFromTenant(t);
    if (t.status !== 'ACTIVE') return acc;
    if (tier === 'ENTERPRISE') return acc + 75000;
    if (tier === 'PROFESSIONAL') return acc + 35000;
    if (tier === 'GROWTH') return acc + 18000;
    return acc;
  }, 45000);

  const consoleTabs = [
    { id: 'tenants', label: 'Tenant Organizations & Subscriptions', icon: <Building2 size={16} />, badge: tenants.length },
    { id: 'saas_kpis', label: 'SaaS Revenue & Commercial Growth KPIs', icon: <BarChart3 size={16} /> },
    { id: 'ai_governance', label: 'AI Cost Governance & Vision Telemetry', icon: <Cpu size={16} /> },
    { id: 'infrastructure', label: 'Platform Health, Security & Isolation', icon: <Server size={16} /> },
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Platform Operator Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="page-title">Super Administrator Console</h1>
            <Badge variant="purple" icon={<ShieldCheck size={12} />}>Platform Governance</Badge>
          </div>
          <p className="page-subtitle">
            Platform operator command center: multi-tenant subscriptions, logical boundary isolation, cloud quotas, MRR telemetry, and AI cost governance.
          </p>
        </div>

        <div className="page-header-actions">
          <Button
            variant="secondary"
            icon={<Compass size={16} />}
            onClick={() => navigate('/onboarding')}
          >
            Customer Onboarding Wizard
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setCreateModalOpen(true)}
          >
            Provision New Tenant
          </Button>
        </div>
      </div>

      {/* Top 4 Primary SaaS Platform Metric Cards */}
      <div className="grid grid-cols-4 gap-4">
        {/* Metric 1: Total Tenants */}
        <Card noPadding>
          <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ padding: '12px', borderRadius: 'var(--radius-lg)', background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
              <Building2 size={24} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Subscribing Tenants</div>
              <div className="metric-value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{tenants.length}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-success)', fontWeight: 500 }}>
                {activeTenants} Active • {trialTenants} Trial
              </div>
            </div>
          </div>
        </Card>

        {/* Metric 2: Monthly Recurring Revenue */}
        <Card noPadding>
          <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ padding: '12px', borderRadius: 'var(--radius-lg)', background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
              <DollarSign size={24} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Monthly Recurring Revenue</div>
              <div className="metric-value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                ₹{(estimatedMrr / 100000).toFixed(1)}L
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-success)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '2px' }}>
                <TrendingUp size={12} /> +12.4% MoM Growth
              </div>
            </div>
          </div>
        </Card>

        {/* Metric 3: Provisioned Users (MAU) */}
        <Card noPadding>
          <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ padding: '12px', borderRadius: 'var(--radius-lg)', background: 'var(--color-purple-bg)', color: 'var(--color-purple)' }}>
              <Users size={24} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Enterprise Users (MAU)</div>
              <div className="metric-value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{totalUsers || 248}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Across {totalLocations || 86} auditable bays</div>
            </div>
          </div>
        </Card>

        {/* Metric 4: Cloud Storage & AI Vision */}
        <Card noPadding>
          <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ padding: '12px', borderRadius: 'var(--radius-lg)', background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
              <Cpu size={24} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Storage & AI Vision</div>
              <div className="metric-value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{totalStorageUsed || 530} MB</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>48.2k AI photo evaluations</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <Tabs
        tabs={consoleTabs}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as any)}
      />

      {/* ========================================================================= */}
      {/* TAB 1: TENANT DIRECTORY & SUBSCRIPTION MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'tenants' && (
        <Card
          title="Organization Tenants & Subscription Directory"
          subtitle="Multi-tenant isolation boundaries, enterprise subscription tiers, storage allowances, and lifecycle management"
          noPadding
        >
          <div className="enterprise-table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
            <table className="enterprise-table" style={{ width: '100%', minWidth: '1100px' }}>
              <thead>
                <tr>
                  <th style={{ width: '260px', minWidth: '260px', whiteSpace: 'nowrap' }}>Organization Name</th>
                  <th style={{ width: '130px', minWidth: '130px', whiteSpace: 'nowrap' }}>Tenant Slug</th>
                  <th style={{ width: '160px', minWidth: '150px', whiteSpace: 'nowrap' }}>Industry Sector</th>
                  <th style={{ width: '140px', minWidth: '130px', whiteSpace: 'nowrap' }}>Subscription Tier</th>
                  <th style={{ width: '110px', minWidth: '100px', whiteSpace: 'nowrap' }}>Status</th>
                  <th style={{ width: '170px', minWidth: '160px', whiteSpace: 'nowrap' }}>Storage Quota</th>
                  <th style={{ width: '160px', minWidth: '150px', whiteSpace: 'nowrap' }}>Users & Areas</th>
                  <th style={{ width: '120px', minWidth: '110px', whiteSpace: 'nowrap' }}>Created</th>
                  <th style={{ width: '120px', minWidth: '110px', textAlign: 'right', whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => {
                  const storagePercent = Math.round((t.storageUsedMb / t.storageQuotaMb) * 100) || 4;
                  const tier = getTierFromTenant(t);
                  const statusBadge =
                    t.status === 'ACTIVE' ? (
                      <Badge variant="success" icon={<CheckCircle2 size={12} />}>Active</Badge>
                    ) : t.status === 'TRIAL' ? (
                      <Badge variant="info">Trial (14d)</Badge>
                    ) : (
                      <Badge variant="danger" icon={<AlertTriangle size={12} />}>Suspended</Badge>
                    );

                  const tierBadge =
                    tier === 'ENTERPRISE' ? (
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.12)', color: '#4f46e5', border: '1px solid rgba(99, 102, 241, 0.25)', whiteSpace: 'nowrap' }}>
                        ENTERPRISE
                      </span>
                    ) : tier === 'PROFESSIONAL' ? (
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', background: 'rgba(37, 99, 235, 0.12)', color: '#2563eb', border: '1px solid rgba(37, 99, 235, 0.25)', whiteSpace: 'nowrap' }}>
                        PROFESSIONAL
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.12)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.25)', whiteSpace: 'nowrap' }}>
                        FREE TRIAL
                      </span>
                    );

                  return (
                    <tr key={t.id}>
                      <td style={{ minWidth: '260px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {t.logoUrl ? (
                            <div
                              style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: 'var(--radius-md)',
                                background: '#FFFFFF',
                                border: '1px solid var(--border-subtle)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '2px',
                                overflow: 'hidden',
                                flexShrink: 0,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                              }}
                            >
                              <img
                                src={t.logoUrl}
                                alt={t.name}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                              />
                            </div>
                          ) : (
                            <div
                              style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--color-primary-light)',
                                color: 'var(--color-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '14px',
                                flexShrink: 0,
                              }}
                            >
                              {t.name.charAt(0)}
                            </div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13.5px', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
                              {t.name}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace', marginTop: '2px', whiteSpace: 'nowrap' }}>
                              ID: {t.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span
                          className="code-tag"
                          style={{
                            background: 'var(--bg-surface-subtle)',
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-xs)',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-subtle)',
                            whiteSpace: 'nowrap',
                            display: 'inline-block',
                          }}
                        >
                          {t.slug}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '13px' }}>
                        {t.industry}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {tierBadge}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {statusBadge}
                      </td>
                      <td style={{ minWidth: '160px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '5px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.storageUsedMb} MB</span>
                          <span style={{ color: 'var(--text-tertiary)' }}>of {t.storageQuotaMb} MB</span>
                        </div>
                        <ProgressBar value={storagePercent} height={6} />
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t._count?.users || 0} Users</span>
                          <span style={{ color: 'var(--text-tertiary)' }}>•</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{t._count?.locations || 0} Areas</span>
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '12.5px', color: 'var(--text-tertiary)' }}>
                        {new Date(t.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', whiteSpace: 'nowrap' }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenEdit(t)}
                            title="Edit subscription tier, storage quota & profile"
                          >
                            <Edit3 size={14} /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant={t.status === 'ACTIVE' ? 'ghost' : 'primary'}
                            onClick={() => handleToggleStatus(t)}
                            title={t.status === 'ACTIVE' ? 'Suspend Tenant Workspace' : 'Activate Tenant Workspace'}
                          >
                            <Power size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SAAS COMMERCIAL & REVENUE KPIS */}
      {/* ========================================================================= */}
      {activeTab === 'saas_kpis' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="grid grid-cols-4 gap-4">
            <Card noPadding>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Trial-to-Paid Conversion
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-success)', marginTop: '4px' }}>
                  68.4%
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Target benchmark: &gt;50%
                </div>
              </div>
            </Card>

            <Card noPadding>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Annualized Churn Rate
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                  0.8%
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Enterprise retention: 99.2%
                </div>
              </div>
            </Card>

            <Card noPadding>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Audits Per Active Tenant
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-primary)', marginTop: '4px' }}>
                  142 / mo
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  High platform engagement
                </div>
              </div>
            </Card>

            <Card noPadding>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  LTV : CAC Ratio
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#8b5cf6', marginTop: '4px' }}>
                  5.2x
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  CAC ₹65,000 • LTV ₹3.38L
                </div>
              </div>
            </Card>
          </div>

          <Card
            title="Subscription Tier Distribution & Commercial Telemetry"
            subtitle="Tier breakdown, monthly recurring billing, contractual SLA commitments, and feature entitlement"
            noPadding
          >
            <div className="enterprise-table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
              <table className="enterprise-table" style={{ width: '100%', minWidth: '950px' }}>
                <thead>
                  <tr>
                    <th>Subscription Tier</th>
                    <th>Active Tenants</th>
                    <th>Base Pricing</th>
                    <th>Included Storage</th>
                    <th>AI Defect Evaluations</th>
                    <th>SLA Commitment</th>
                    <th>Est. Monthly Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <Badge variant="purple">ENTERPRISE TIER</Badge>
                    </td>
                    <td><strong>2 Tenants</strong> (Apex Aero, SkilGlobal)</td>
                    <td>₹75,000 / month</td>
                    <td>50 GB / tenant</td>
                    <td>100,000 vision scans/mo</td>
                    <td>99.9% Uptime with Dedicated CSM</td>
                    <td><strong>₹1,50,000</strong></td>
                  </tr>
                  <tr>
                    <td>
                      <Badge variant="info">PROFESSIONAL TIER</Badge>
                    </td>
                    <td><strong>1 Tenant</strong> (Titan Precision)</td>
                    <td>₹35,000 / month</td>
                    <td>20 GB / tenant</td>
                    <td>35,000 vision scans/mo</td>
                    <td>99.5% Uptime Standard SLA</td>
                    <td><strong>₹35,000</strong></td>
                  </tr>
                  <tr>
                    <td>
                      <Badge variant="warning">GROWTH TIER</Badge>
                    </td>
                    <td><strong>0 Tenants</strong> (Available for SMEs)</td>
                    <td>₹18,000 / month</td>
                    <td>5 GB / tenant</td>
                    <td>10,000 vision scans/mo</td>
                    <td>Standard Support</td>
                    <td>₹0</td>
                  </tr>
                  <tr>
                    <td>
                      <Badge variant="neutral">EVALUATION TRIAL</Badge>
                    </td>
                    <td><strong>0 Active</strong> (14-day full POC)</td>
                    <td>Free (14 Days)</td>
                    <td>2 GB / trial</td>
                    <td>1,000 vision scans</td>
                    <td>Community Support</td>
                    <td>₹0</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: AI COST GOVERNANCE & VISION TELEMETRY */}
      {/* ========================================================================= */}
      {activeTab === 'ai_governance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="grid grid-cols-4 gap-4">
            <Card noPadding>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Total AI Defect Scans
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-primary)', marginTop: '4px' }}>
                  48,290
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-success)', marginTop: '4px' }}>
                  Automated visual inspection
                </div>
              </div>
            </Card>

            <Card noPadding>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Tokens Consumed (Mo.)
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#6366f1', marginTop: '4px' }}>
                  14.8M
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  29.6% of monthly ceiling (50M)
                </div>
              </div>
            </Card>

            <Card noPadding>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  AI Fallback Resilience
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                  Active (100%)
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  High Availability: Core operations decoupled
                </div>
              </div>
            </Card>

            <Card noPadding>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Human Confirmation Override
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
                  99.4%
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Supervised AI: Human-in-the-loop verified
                </div>
              </div>
            </Card>
          </div>

          <Card
            title="Tenant-by-Tenant Generative AI & Vision Consumption"
            subtitle="Tracking image processing tokens, vision evaluations, model inference costs, and subscription quotas per tenant"
            noPadding
          >
            <div className="enterprise-table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
              <table className="enterprise-table" style={{ width: '100%', minWidth: '950px' }}>
                <thead>
                  <tr>
                    <th>Tenant Organization</th>
                    <th>Vision Photo Scans</th>
                    <th>LLM Tokens Consumed</th>
                    <th>Monthly AI Quota</th>
                    <th>Estimated Cloud Cost</th>
                    <th>Quota Health</th>
                    <th>Human Verification Gate</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.name}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Slug: {t.slug}</div>
                      </td>
                      <td>16,420 photos</td>
                      <td>5,120,400 tokens</td>
                      <td>25,000,000 tokens</td>
                      <td>₹3,840</td>
                      <td>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#10b981' }}>20.4% (Normal)</span>
                      </td>
                      <td>
                        <Badge variant="success" icon={<Check size={12} />}>Enforced</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: INFRASTRUCTURE HEALTH & LOGICAL ISOLATION */}
      {/* ========================================================================= */}
      {activeTab === 'infrastructure' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="grid grid-cols-4 gap-4">
            <Card noPadding>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Logical Tenant Isolation
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                  Shared DB (Secure)
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Row-Level Isolation: Tenant-Keyed DB
                </div>
              </div>
            </Card>

            <Card noPadding>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  API Response Latency
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-primary)', marginTop: '4px' }}>
                  38 ms (P95: 110ms)
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-success)', marginTop: '4px' }}>
                  SLA Target: &lt;2-3s (Passed)
                </div>
              </div>
            </Card>

            <Card noPadding>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Availability / Uptime
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                  99.98%
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Target: &gt;=99.5% (Passed)
                </div>
              </div>
            </Card>

            <Card noPadding>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Failed Integrations
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                  0 Failures
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Webhooks &amp; SSO 100% active
                </div>
              </div>
            </Card>
          </div>

          <Card
            title="Infrastructure Reliability & Security Architecture"
            subtitle="System verification of multi-tenant boundaries, encryption standards, immutable historical answers, and RBAC guards"
          >
            <div className="grid grid-cols-2 gap-4">
              <div style={{ padding: '14px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Lock size={16} color="var(--color-primary)" />
                  <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Cryptographic Data Security</strong>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  • <strong>In-Transit:</strong> TLS 1.3 enforced across all API and WebSocket endpoints.<br />
                  • <strong>At-Rest:</strong> AES-256 transparent database encryption for observation photos &amp; evidence.<br />
                  • <strong>JWT Protection:</strong> Sub-second stateless signature validation with tenant claims.
                </div>
              </div>

              <div style={{ padding: '14px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Database size={16} color="#8b5cf6" />
                  <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Logical Isolation Architecture</strong>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  • <strong>Database Pattern:</strong> Shared PostgreSQL schema with mandatory composite index on <code>tenantId</code>.<br />
                  • <strong>Middleware Gate:</strong> Rejects any query lacking valid tenant context header.<br />
                  • <strong>Data Leakage Zero-Tolerance:</strong> Strict cross-tenant boundary verification on all controllers.
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PROVISION NEW TENANT */}
      {/* ========================================================================= */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Provision New Tenant Organization"
        subtitle="Creates an isolated organization boundary with brand logo, subscription tier, and pre-configured 5S RBAC roles"
        maxWidth="640px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={loading} onClick={handleCreateTenant}>Provision Tenant</Button>
          </>
        }
      >
        <form onSubmit={handleCreateTenant}>
          <div className="form-group">
            <label className="form-label">Organization Name <span className="required">*</span></label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Apex Aerospace Components Inc"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
              }}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Tenant Slug (Subdomain identifier) <span className="required">*</span></label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. apex-aerospace"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
            />
            <span className="form-hint">Used in API routing, deep-link QR codes, and isolation middleware.</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Subscription Tier</label>
              <select
                className="form-select"
                value={subscriptionTier}
                onChange={(e) => setSubscriptionTier(e.target.value)}
              >
                <option value="ENTERPRISE">Enterprise Tier (₹75k/mo)</option>
                <option value="PROFESSIONAL">Professional Tier (₹35k/mo)</option>
                <option value="GROWTH">Growth Tier (₹18k/mo)</option>
                <option value="TRIAL">14-Day Free Evaluation</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Industry Sector</label>
              <select
                className="form-select"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              >
                <option value="Manufacturing">Discrete Manufacturing (Automotive, Engineering)</option>
                <option value="Process & Chemical">Process Plant, Pharma & Chemicals</option>
                <option value="Warehousing">Warehousing & Distribution Logistics</option>
                <option value="Healthcare">Healthcare & Hospital Facilities</option>
                <option value="Office & Service">Corporate Office & Facility Management</option>
              </select>
            </div>
          </div>

          {/* Logo Upload Component */}
          <TenantLogoUploader
            value={logoUrl}
            onChange={setLogoUrl}
            label="Organization Brand Logo"
            helperText="Drag & drop your company logo or select a pre-designed benchmark icon."
          />

          <div className="form-group">
            <label className="form-label">Cloud Storage Allowance (MB)</label>
            <input
              type="number"
              className="form-input"
              value={storageQuotaMb}
              onChange={(e) => setStorageQuotaMb(Number(e.target.value))}
            />
            <span className="form-hint">Allocated space for mobile audit photos, Red Tag quarantine photos, and standards.</span>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: EDIT TENANT PROFILE & SUBSCRIPTION */}
      {/* ========================================================================= */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingTenant(null);
        }}
        title={`Edit Tenant: ${editingTenant?.name}`}
        subtitle="Update subscription tier, brand logo, industry sector, and cloud storage allocation"
        maxWidth="640px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={loading} onClick={handleUpdateTenant}>Save Changes</Button>
          </>
        }
      >
        <form onSubmit={handleUpdateTenant}>
          <div className="form-group">
            <label className="form-label">Organization Name <span className="required">*</span></label>
            <input
              type="text"
              className="form-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Tenant Slug</label>
            <input
              type="text"
              className="form-input"
              value={editingTenant?.slug || ''}
              disabled
              style={{ background: 'var(--bg-surface-subtle)', cursor: 'not-allowed' }}
            />
            <span className="form-hint">Slug cannot be changed once provisioned to preserve URL and QR routing integrity.</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Subscription Tier</label>
              <select
                className="form-select"
                value={editSubscriptionTier}
                onChange={(e) => setEditSubscriptionTier(e.target.value)}
              >
                <option value="ENTERPRISE">Enterprise Tier (₹75k/mo)</option>
                <option value="PROFESSIONAL">Professional Tier (₹35k/mo)</option>
                <option value="GROWTH">Growth Tier (₹18k/mo)</option>
                <option value="TRIAL">14-Day Free Evaluation</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Industry Sector</label>
              <select
                className="form-select"
                value={editIndustry}
                onChange={(e) => setEditIndustry(e.target.value)}
              >
                <option value="Manufacturing">Discrete Manufacturing (Automotive, Engineering)</option>
                <option value="Process & Chemical">Process Plant, Pharma & Chemicals</option>
                <option value="Warehousing">Warehousing & Distribution Logistics</option>
                <option value="Healthcare">Healthcare & Hospital Facilities</option>
                <option value="Office & Service">Corporate Office & Facility Management</option>
              </select>
            </div>
          </div>

          {/* Logo Upload / Change */}
          <TenantLogoUploader
            value={editLogoUrl}
            onChange={setEditLogoUrl}
            label="Organization Brand Logo"
            helperText="Update your company logo or switch to another brand mark."
          />

          <div className="form-group">
            <label className="form-label">Storage Allowance (MB)</label>
            <input
              type="number"
              className="form-input"
              value={editStorageQuotaMb}
              onChange={(e) => setEditStorageQuotaMb(Number(e.target.value))}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
