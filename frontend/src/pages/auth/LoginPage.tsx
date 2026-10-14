import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import {
  Layers,
  ShieldCheck,
  Lock,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  Building,
  QrCode,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Smartphone,
  Globe,
  Users,
  Compass,
  FileCheck,
  Award,
  Zap,
  HelpCircle,
  Hash,
  LayoutDashboard,
  ClipboardCheck,
  ShieldAlert,
  BarChart3,
  Calendar,
  Tag,
  CheckSquare,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    login,
    loginWithSso,
    loginWithPin,
    tenants,
    currentTenant,
    setCurrentTenant,
    addToast,
    setActiveUserRole,
  } = useApp();

  // Auth Mode: 'PORTALS' | 'PASSWORD' | 'SSO' | 'PIN'
  const [authMode, setAuthMode] = useState<'PORTALS' | 'PASSWORD' | 'SSO' | 'PIN'>('PORTALS');

  // Selected Portal Filter in Portals Tab
  const [selectedPortalCategory, setSelectedPortalCategory] = useState<'ALL' | 'OWNER' | 'TENANT' | 'AREA' | 'AUDITOR'>('ALL');

  // Form State
  const [email, setEmail] = useState('admin@skilglobal.com');
  const [password, setPassword] = useState('Admin@123456');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);

  // Shopfloor PIN State
  const [pin, setPin] = useState('5544');
  const [badgeId, setBadgeId] = useState('BADGE-OP-049');

  // Forgot Password Modal
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSubmitted, setResetSubmitted] = useState(false);

  // Hero Spotlight Index
  const [activeSlide, setActiveSlide] = useState(0);

  const heroSlides = [
    {
      title: 'Digital 5S Visual Workplace Governance',
      desc: 'Define standards, conduct mobile audits with photographic evidence, and eliminate paper checklists.',
      badge: 'Standardization',
      stat: '94.2%',
      statLabel: 'Audit Adherence',
    },
    {
      title: 'Red Tag Quarantine & Financial Recovery',
      desc: 'Enforce 48h ageing disposition workflows, scrap evaluation, and capital recovery across bays.',
      badge: 'Discipline',
      stat: '₹4.8L',
      statLabel: 'Recovered Capital',
    },
    {
      title: 'Continuous Intelligence & Operational Heatmaps',
      desc: 'Benchmarking across plants, autonomous audit rotators, and multi-facility compliance radar.',
      badge: 'Intelligence',
      stat: '0%',
      statLabel: 'Repeat Abnormalities',
    },
  ];

  // 4 Primary Enterprise Login Portals
  const enterprisePortals = [
    {
      id: 'platform-owner',
      category: 'OWNER',
      roleCode: 'SUPER_ADMIN',
      title: '5S Platform Owner',
      subtitle: 'Global Super Administrator',
      name: 'Vikram Malhotra',
      email: 'superadmin@skilglobal.com',
      badgeText: 'PLATFORM GOVERNANCE',
      badgeColor: '#ef4444',
      badgeBg: 'rgba(239, 68, 68, 0.1)',
      icon: <ShieldCheck size={20} color="#ef4444" />,
      targetPath: '/super-admin',
      capabilities: [
        'Multi-tenant provisioning & cloud quotas',
        'Global master standards & templates',
        'Cross-enterprise intelligence & telemetry',
      ],
      description: 'Full oversight across all industrial tenants, subscriptions, database schemas, and global standards.',
    },
    {
      id: 'tenant-admin',
      category: 'TENANT',
      roleCode: 'ORG_ADMIN',
      title: 'Tenant Enterprise Admin',
      subtitle: 'VP Operational Excellence / Plant Head',
      name: 'Pooja Sharma',
      email: 'admin@skilglobal.com',
      badgeText: 'TENANT OPERATIONS',
      badgeColor: '#6366f1',
      badgeBg: 'rgba(99, 102, 241, 0.1)',
      icon: <Building size={20} color="#6366f1" />,
      targetPath: '/locations',
      capabilities: [
        'Plant & bay hierarchy with QR Studio',
        'Audit schedule matrix & auto-rotations',
        'CAPA SLA escalation & maturity heatmaps',
      ],
      description: 'Comprehensive plant management, location masters, checklist designers, and departmental benchmarks.',
    },
    {
      id: 'area-owner',
      category: 'AREA',
      roleCode: 'AREA_OWNER',
      title: 'Area Owner / Line Supervisor',
      subtitle: 'CNC Machining Bay A Lead',
      name: 'Arun Patel',
      email: 'owner.cnc01@skilglobal.com',
      badgeText: 'WORKSTATION GEMBA',
      badgeColor: '#f59e0b',
      badgeBg: 'rgba(245, 158, 11, 0.1)',
      icon: <LayoutDashboard size={20} color="#f59e0b" />,
      targetPath: '/area-owner-hub',
      capabilities: [
        'Pending audit report sign-offs & dual dispute',
        'Assigned CAPAs & 5-Why root cause analysis',
        'Daily 5-minute Kamishibai shift checklists',
      ],
      description: 'Dedicated operator workstation dashboard to resolve abnormalities, sign off audits, and maintain shadow boards.',
    },
    {
      id: 'certified-auditor',
      category: 'AUDITOR',
      roleCode: 'AUDITOR',
      title: 'Certified Shop-Floor Auditor',
      subtitle: 'Lead Quality & Safety Assessor',
      name: 'Amit Joshi',
      email: 'auditor.internal@skilglobal.com',
      badgeText: 'INSPECTION WORKSPACE',
      badgeColor: '#10b981',
      badgeBg: 'rgba(16, 185, 129, 0.1)',
      icon: <ClipboardCheck size={20} color="#10b981" />,
      targetPath: '/auditor-hub',
      capabilities: [
        'Scheduled rounds & mobile QR audit runner',
        'Photo evidence markup with defect grading',
        'Auditor certification status & scorecard',
      ],
      description: 'Streamlined auditor workspace for running shop-floor inspections, non-conformance logging, and real-time scoring.',
    },
  ];

  const handlePortalLogin = async (portal: typeof enterprisePortals[0]) => {
    setLoading(true);
    try {
      await login({
        email: portal.email,
        password: 'Admin@123456',
        tenantSlug: currentTenant?.slug || 'skilglobal-mfg',
        rememberMe: true,
      });
      setActiveUserRole(portal.roleCode);
      navigate(portal.targetPath);
    } catch (err: any) {
      console.error(err);
      addToast({
        type: 'error',
        title: 'Login Error',
        message: 'Could not complete portal authentication.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      const res = await login({
        email,
        password,
        tenantSlug: currentTenant?.slug || 'skilglobal-mfg',
        rememberMe,
      });

      // Role destination determination
      const userRole = res?.user?.primaryRole || (res?.user as any)?.roleCode || 'ORG_ADMIN';
      setActiveUserRole(userRole);

      if (userRole === 'SUPER_ADMIN') {
        navigate('/super-admin');
      } else if (userRole === 'AREA_OWNER') {
        navigate('/area-owner-hub');
      } else if (userRole === 'AUDITOR' || userRole === 'EXTERNAL_AUDITOR') {
        navigate('/auditor-hub');
      } else {
        navigate('/locations');
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Sign In Failed',
        message: err?.response?.data?.message || 'Invalid credentials. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSsoSubmit = async (provider: string) => {
    setLoading(true);
    try {
      await loginWithSso(provider, currentTenant?.slug || 'skilglobal-mfg');
      navigate('/locations');
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'SSO Sign In Failed',
        message: 'Could not complete identity federation callback.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) return;
    setLoading(true);
    try {
      await loginWithPin(pin, badgeId, undefined, currentTenant?.slug || 'skilglobal-mfg');
      setActiveUserRole('AREA_OWNER');
      navigate('/area-owner-hub');
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'PIN Login Failed',
        message: 'Invalid workstation PIN or badge ID.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResetSubmitted(true);
    setTimeout(() => {
      setResetSubmitted(false);
      setForgotPasswordOpen(false);
      addToast({
        type: 'success',
        title: 'Reset Link Dispatched',
        message: `Password reset verification link has been sent to ${resetEmail || email}`,
      });
    }, 1200);
  };

  const filteredPortals = selectedPortalCategory === 'ALL'
    ? enterprisePortals
    : enterprisePortals.filter(p => p.category === selectedPortalCategory);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        background: 'var(--bg-app)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* LEFT HERO PANEL (Industrial Visual Showcase & Trust) */}
      <div
        style={{
          flex: 0.95,
          background: 'linear-gradient(145deg, #0F172A 0%, #1E293B 45%, #0B1120 100%)',
          color: '#FFFFFF',
          padding: '48px 56px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
        }}
        className="login-hero-panel"
      >
        {/* Ambient Glows */}
        <div
          style={{
            position: 'absolute',
            top: '-15%',
            left: '-10%',
            width: '450px',
            height: '450px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(37, 99, 235, 0.25) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-10%',
            right: '-10%',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Top: Brand Header */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 20px rgba(37, 99, 235, 0.4)',
                fontWeight: 900,
                fontSize: '22px',
                color: '#FFFFFF',
                letterSpacing: '-0.05em',
              }}
            >
              5S
            </div>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
                SkilGlobal 5S Enterprise
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                Multi-Tenant Workplace Organisation & Visual Governance
              </div>
            </div>
          </div>
        </div>

        {/* Center: Mission & Feature Spotlight Carousel */}
        <div style={{ position: 'relative', zIndex: 2, margin: '48px 0' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(37, 99, 235, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              padding: '4px 12px',
              borderRadius: '100px',
              marginBottom: '16px',
            }}
          >
            <Sparkles size={14} color="#60A5FA" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#93C5FD' }}>
              {heroSlides[activeSlide].badge} Benchmark
            </span>
          </div>

          <h2
            style={{
              fontSize: '30px',
              fontWeight: 800,
              lineHeight: 1.25,
              letterSpacing: '-0.03em',
              color: '#FFFFFF',
              marginBottom: '16px',
            }}
          >
            {heroSlides[activeSlide].title}
          </h2>

          <p
            style={{
              fontSize: '14.5px',
              color: '#CBD5E1',
              lineHeight: 1.6,
              maxWidth: '500px',
              marginBottom: '28px',
            }}
          >
            {heroSlides[activeSlide].desc}
          </p>

          {/* Slide Indicator Dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {heroSlides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSlide(idx)}
                style={{
                  width: activeSlide === idx ? '28px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: activeSlide === idx ? '#3B82F6' : 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.25s ease',
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>

        {/* Bottom Feature Badges */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', gap: '20px' }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: '11px', color: '#94A3B8' }}>Platform Uptime</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#10B981' }}>99.98%</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: '11px', color: '#94A3B8' }}>Security Protocol</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#60A5FA' }}>SOC2 / ISO 27001</div>
          </div>
        </div>
      </div>

      {/* RIGHT AUTH PANEL (Dedicated Login Portals & Methods) */}
      <div
        style={{
          flex: 1.15,
          background: 'var(--bg-surface)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '40px 36px',
          overflowY: 'auto',
          maxHeight: '100vh',
        }}
      >
        <div style={{ width: '100%', maxWidth: '580px' }}>
          {/* Header Title */}
          <div style={{ marginBottom: '20px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
              Access 5S Enterprise Platform
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Select your role portal or sign in with credentials to access your designated workspace.
            </p>
          </div>

          {/* Active Tenant Selector Pill */}
          <div
            style={{
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Building size={15} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', fontWeight: 700 }}>
                  Active Tenant Workspace
                </div>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentTenant?.name || 'SkilGlobal Precision Manufacturing'}
                </div>
              </div>
            </div>

            {tenants.length > 1 && (
              <select
                className="form-select"
                value={currentTenant?.id || ''}
                onChange={(e) => {
                  const t = tenants.find((item) => item.id === e.target.value);
                  if (t) setCurrentTenant(t);
                }}
                style={{ width: 'auto', fontSize: '11px', height: '28px', padding: '2px 24px 2px 8px' }}
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.slug}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Auth Mode Tabs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '4px',
              background: 'var(--bg-surface-subtle)',
              padding: '4px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              marginBottom: '20px',
            }}
          >
            {[
              { id: 'PORTALS', label: 'Role Portals', icon: <Users size={13} /> },
              { id: 'PASSWORD', label: 'Password', icon: <Lock size={13} /> },
              { id: 'SSO', label: 'SSO Login', icon: <Globe size={13} /> },
              { id: 'PIN', label: 'Floor PIN', icon: <Hash size={13} /> },
            ].map((tab) => {
              const isActive = authMode === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setAuthMode(tab.id as any)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 6px',
                    fontSize: '12px',
                    fontWeight: isActive ? 700 : 500,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: isActive ? 'var(--bg-surface)' : 'transparent',
                    color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)',
                    boxShadow: isActive ? 'var(--shadow-xs)' : 'none',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: DEDICATED ROLE PORTALS (PRIMARY UX) */}
          {authMode === 'PORTALS' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Select a portal below to sign in directly into that persona's view:
                </span>
              </div>

              {/* 4 Portals Grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredPortals.map((portal) => (
                  <div
                    key={portal.id}
                    onClick={() => handlePortalLogin(portal)}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '14px 16px',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                    className="persona-card-hover"
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: 'var(--radius-md)',
                            background: portal.badgeBg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {portal.icon}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {portal.title}
                            </span>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                color: portal.badgeColor,
                                background: portal.badgeBg,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                border: `1px solid ${portal.badgeColor}30`,
                              }}
                            >
                              {portal.badgeText}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {portal.name} • {portal.subtitle}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={loading}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          background: 'var(--bg-surface-subtle)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: portal.badgeColor,
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        <span>Enter View</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>

                    <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', lineHeight: 1.4, borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                      <strong>Key Functions:</strong> {portal.capabilities.join(' • ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: EMAIL & PASSWORD */}
          {authMode === 'PASSWORD' && (
            <form onSubmit={handlePasswordSubmit} className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Corporate Email Address</label>
                <div style={{ position: 'relative' }}>
                  <Mail
                    size={16}
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-tertiary)',
                    }}
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="form-control"
                    style={{ paddingLeft: '36px' }}
                  />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      setForgotPasswordOpen(true);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-primary)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      padding: 0,
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <KeyRound
                    size={16}
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-tertiary)',
                    }}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="form-control"
                    style={{ paddingLeft: '36px', paddingRight: '36px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-tertiary)',
                      cursor: 'pointer',
                      padding: '4px',
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="rememberMe" style={{ fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  Keep me signed in on this workstation (30 days)
                </label>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={loading}
                style={{ width: '100%', marginTop: '8px' }}
              >
                {loading ? 'Authenticating...' : 'Sign In to 5S Platform'}
              </Button>
            </form>
          )}

          {/* TAB 3: ENTERPRISE SSO */}
          {authMode === 'SSO' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '4px' }}>
                Authenticate with your corporate identity provider. Access permissions and department assignments are synchronized automatically.
              </div>

              {/* Microsoft Azure AD */}
              <button
                type="button"
                onClick={() => handleSsoSubmit('MICROSOFT_AZURE_AD')}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '11px 16px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 23 23">
                  <path fill="#f35325" d="M1 1h10v10H1z"/>
                  <path fill="#81bc06" d="M12 1h10v10H12z"/>
                  <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                  <path fill="#ffba08" d="M12 12h10v10H12z"/>
                </svg>
                Sign in with Microsoft 365 / Azure AD
              </button>

              {/* Google Workspace */}
              <button
                type="button"
                onClick={() => handleSsoSubmit('GOOGLE_WORKSPACE')}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '11px 16px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.4 8.9 5 12 5z"/>
                  <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"/>
                  <path fill="#FBBC05" d="M5.3 14.7c-.2-.7-.4-1.4-.4-2.2 0-.8.1-1.5.4-2.2L1.6 7.4C.6 9.4 0 11.6 0 14c0 2.4.6 4.6 1.6 6.6l3.7-2.9z"/>
                  <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.4-6.7-5.3L1.6 16c1.9 3.8 5.8 7 10.4 7z"/>
                </svg>
                Sign in with Google Workspace
              </button>

              {/* Okta / SAML 2.0 */}
              <button
                type="button"
                onClick={() => handleSsoSubmit('OKTA_SAML')}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '11px 16px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <ShieldCheck size={18} color="#007DC1" />
                Sign in with Okta / SAML 2.0
              </button>
            </div>
          )}

          {/* TAB 4: SHOPFLOOR QUICK PIN */}
          {authMode === 'PIN' && (
            <form onSubmit={handlePinSubmit} className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Designed for shared shop-floor tablets and machine touchscreens. Fast-tracks Area Owner Action Hub and Kamishibai inspections.
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Operator Passcode PIN (4 Digits)</label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="form-control"
                  style={{ fontSize: '22px', textAlign: 'center', letterSpacing: '0.4em', fontWeight: 800 }}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Workstation / RFID Badge ID (Optional)</label>
                <input
                  type="text"
                  value={badgeId}
                  onChange={(e) => setBadgeId(e.target.value)}
                  placeholder="e.g. BADGE-OP-049"
                  className="form-control"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={loading}
                icon={<Smartphone size={16} />}
                style={{ width: '100%' }}
              >
                {loading ? 'Validating PIN...' : 'Start Shopfloor Session'}
              </Button>
            </form>
          )}

          {/* Footer Assistance */}
          <div style={{ marginTop: '28px', textAlign: 'center', fontSize: '12px', color: 'var(--text-tertiary)' }}>
            Need assistance signing in? Contact your organization's 5S Administrator or{' '}
            <a href="mailto:support@skilglobal.com" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}>
              IT Helpdesk
            </a>
          </div>
        </div>
      </div>

      {/* FORGOT PASSWORD MODAL */}
      <Modal
        isOpen={forgotPasswordOpen}
        onClose={() => setForgotPasswordOpen(false)}
        title="Reset Corporate Password"
        subtitle="We will dispatch a secure 1-time verification link to your email"
        maxWidth="440px"
      >
        <form onSubmit={handleForgotPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Corporate Email Address</label>
            <input
              type="email"
              required
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="name@company.com"
              className="form-control"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button variant="secondary" type="button" onClick={() => setForgotPasswordOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={resetSubmitted}>
              {resetSubmitted ? 'Dispatching Link...' : 'Send Reset Link'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
