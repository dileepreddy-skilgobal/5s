import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  Layers,
  ShieldCheck,
  Building,
  MapPin,
  QrCode,
  FileSpreadsheet,
  Sparkles,
  Users,
  Compass,
  FileCheck,
  CheckCircle,
  BarChart3,
  ChevronRight,
  FileText,
  Calendar,
  AlertTriangle,
  Tag,
  LogOut,
  User,
  GraduationCap,
  LayoutDashboard,
  ClipboardCheck,
  ShieldAlert,
  Wrench,
  CheckSquare,
  Trophy,
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  disabled?: boolean;
  tag?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC = () => {
  const { currentUser, logout, activeUserRole } = useApp();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentRole = activeUserRole || currentUser?.primaryRole || 'ORG_ADMIN';

  // Generate dynamic, role-tailored navigation sections
  const getNavSections = (): NavSection[] => {
    if (currentRole === 'SUPER_ADMIN') {
      return [
        {
          title: 'PLATFORM GOVERNANCE',
          items: [
            { path: '/super-admin', label: 'Super Admin Console', icon: <ShieldCheck size={18} /> },
            { path: '/onboarding', label: 'Tenant Provisioning', icon: <Compass size={18} /> },
            { path: '/roles-permissions', label: 'Global RBAC Matrix', icon: <Users size={18} /> },
          ],
        },
        {
          title: 'GLOBAL BENCHMARKS',
          items: [
            { path: '/templates', label: 'Master 5S Templates', icon: <FileCheck size={18} /> },
            { path: '/training', label: '5S Training Academy', icon: <GraduationCap size={18} /> },
          ],
        },
      ];
    }

    if (currentRole === 'ORG_ADMIN') {
      return [
        {
          title: 'ORGANIZATION & RBAC',
          items: [
            { path: '/organization', label: 'Organization Hierarchy', icon: <Building size={18} /> },
            { path: '/roles-permissions', label: 'Roles & RBAC Matrix', icon: <Users size={18} /> },
            { path: '/locations', label: 'Location & Area Master', icon: <MapPin size={18} /> },
            { path: '/qr-studio', label: 'QR Code Studio', icon: <QrCode size={18} /> },
            { path: '/imports', label: 'Excel Bulk Ingestion', icon: <FileSpreadsheet size={18} /> },
          ],
        },
        {
          title: '5S PROGRAM GOVERNANCE',
          items: [
            { path: '/templates', label: 'Audit Template Builder', icon: <FileCheck size={18} /> },
            { path: '/schedules', label: 'Audit Schedules & Rotation', icon: <Calendar size={18} /> },
            { path: '/standards', label: '5S Standards Library', icon: <FileText size={18} /> },
          ],
        },
        {
          title: 'OPERATIONAL OVERSIGHT',
          items: [
            { path: '/capa', label: 'CAPA & SLA Escalation', icon: <Layers size={18} /> },
            { path: '/observations', label: 'Observations & Abnormalities', icon: <AlertTriangle size={18} /> },
            { path: '/red-tags', label: 'Red Tag & Holding Area', icon: <Tag size={18} /> },
          ],
        },
        {
          title: 'MATURITY & ENGAGEMENT',
          items: [
            { path: '/analytics', label: 'Maturity & Heat Maps', icon: <BarChart3 size={18} /> },
            { path: '/recognition', label: 'Trophies & Gamification', icon: <Trophy size={18} /> },
            { path: '/training', label: '5S Training & Academy', icon: <GraduationCap size={18} /> },
          ],
        },
      ];
    }

    if (currentRole === 'PLANT_HEAD') {
      return [
        {
          title: 'EXECUTIVE INTELLIGENCE',
          items: [
            { path: '/analytics', label: 'Maturity & Heat Maps', icon: <BarChart3 size={18} /> },
            { path: '/locations', label: 'Plant Areas & Workstations', icon: <MapPin size={18} /> },
          ],
        },
        {
          title: 'OPERATIONAL GOVERNANCE',
          items: [
            { path: '/capa', label: 'CAPA & SLA Escalation', icon: <Layers size={18} /> },
            { path: '/red-tags', label: 'Red Tag & Holding Area', icon: <Tag size={18} /> },
            { path: '/observations', label: 'Observations & Defects', icon: <AlertTriangle size={18} /> },
            { path: '/schedules', label: 'Audit Compliance & Schedules', icon: <Calendar size={18} /> },
          ],
        },
        {
          title: 'LEAN CULTURE & STANDARDS',
          items: [
            { path: '/recognition', label: '5S Trophies & Gamification', icon: <Trophy size={18} /> },
            { path: '/standards', label: '5S Standards Library', icon: <FileText size={18} /> },
            { path: '/training', label: '5S Training Academy', icon: <GraduationCap size={18} /> },
          ],
        },
      ];
    }

    if (currentRole === 'COORDINATOR_5S') {
      return [
        {
          title: '5S AUDIT PLANNING & ROTATION',
          items: [
            { path: '/schedules', label: 'Audit Schedules & Rotation', icon: <Calendar size={18} /> },
            { path: '/templates', label: 'Audit Template Builder', icon: <FileCheck size={18} /> },
            { path: '/standards', label: '5S Standards Library', icon: <FileText size={18} /> },
          ],
        },
        {
          title: 'REMEDIATION & DISCIPLINE',
          items: [
            { path: '/capa', label: 'CAPA & SLA Escalation', icon: <Layers size={18} /> },
            { path: '/red-tags', label: 'Red Tag & Holding Area', icon: <Tag size={18} /> },
            { path: '/observations', label: 'Observations & Abnormalities', icon: <AlertTriangle size={18} /> },
          ],
        },
        {
          title: 'PLANT AREAS & QR',
          items: [
            { path: '/locations', label: 'Location & Area Master', icon: <MapPin size={18} /> },
            { path: '/qr-studio', label: 'QR Code Studio', icon: <QrCode size={18} /> },
          ],
        },
        {
          title: 'CONTINUOUS IMPROVEMENT',
          items: [
            { path: '/analytics', label: 'Maturity & Heat Maps', icon: <BarChart3 size={18} /> },
            { path: '/recognition', label: 'Trophies & Gamification', icon: <Trophy size={18} /> },
            { path: '/training', label: '5S Training & Academy', icon: <GraduationCap size={18} /> },
          ],
        },
      ];
    }

    if (currentRole === 'DEPT_HEAD') {
      return [
        {
          title: 'DEPARTMENT GEMBA',
          items: [
            { path: '/area-owner-hub', label: 'Department Action Hub', icon: <LayoutDashboard size={18} /> },
            { path: '/locations', label: 'Department Areas & Stations', icon: <MapPin size={18} /> },
            { path: '/observations', label: 'Department Abnormalities', icon: <AlertTriangle size={18} /> },
          ],
        },
        {
          title: 'ACTION RESOLUTION',
          items: [
            { path: '/capa', label: 'CAPA Approvals & Root Cause', icon: <Layers size={18} /> },
            { path: '/red-tags', label: 'Red Tag Quarantine Area', icon: <Tag size={18} /> },
            { path: '/schedules', label: 'Department Audit Rounds', icon: <Calendar size={18} /> },
          ],
        },
        {
          title: 'STANDARDS & RECOGNITION',
          items: [
            { path: '/recognition', label: 'Team Points & Leaderboard', icon: <Trophy size={18} /> },
            { path: '/standards', label: '5S Standards Library', icon: <FileText size={18} /> },
            { path: '/training', label: '5S Training Academy', icon: <GraduationCap size={18} /> },
          ],
        },
      ];
    }

    if (currentRole === 'AREA_OWNER') {
      return [
        {
          title: 'MY WORKSTATION & GEMBA',
          items: [
            { path: '/area-owner-hub', label: 'Area Action Hub', icon: <LayoutDashboard size={18} /> },
            { path: '/locations', label: 'My Areas & Shadow Boards', icon: <MapPin size={18} /> },
          ],
        },
        {
          title: 'ACTION & DEFECT RESOLUTION',
          items: [
            { path: '/capa', label: 'My Assigned CAPAs & 5-Why', icon: <Layers size={18} /> },
            { path: '/observations', label: 'Workstation Abnormalities', icon: <AlertTriangle size={18} /> },
            { path: '/red-tags', label: 'Red Tag Holding Area', icon: <Tag size={18} /> },
          ],
        },
        {
          title: 'RECOGNITION & LEARNING',
          items: [
            { path: '/recognition', label: 'My Points & Trophies', icon: <Trophy size={18} /> },
            { path: '/standards', label: 'Visual 5S Standards', icon: <FileText size={18} /> },
            { path: '/training', label: '5S Training Academy', icon: <GraduationCap size={18} /> },
          ],
        },
      ];
    }

    if (currentRole === 'AUDITOR' || currentRole === 'EXTERNAL_AUDITOR') {
      return [
        {
          title: 'AUDITOR INSPECTION WORKSPACE',
          items: [
            { path: '/auditor-hub', label: 'Auditor Workspace', icon: <ClipboardCheck size={18} /> },
            { path: '/schedules', label: 'Audit Schedules & Rounds', icon: <Calendar size={18} /> },
          ],
        },
        {
          title: 'NON-CONFORMANCE & EVIDENCE',
          items: [
            { path: '/observations', label: 'Observations & Defect Log', icon: <AlertTriangle size={18} /> },
            { path: '/capa', label: 'CAPA Verification & Closure', icon: <Layers size={18} /> },
            { path: '/red-tags', label: 'Red Tag Quarantine Audit', icon: <Tag size={18} /> },
          ],
        },
        {
          title: 'STANDARDS & CAPABILITY',
          items: [
            { path: '/standards', label: '5S Standards Library', icon: <FileText size={18} /> },
            { path: '/templates', label: 'Audit Checklists & Templates', icon: <FileCheck size={18} /> },
            { path: '/recognition', label: 'Leaderboard & Recognition', icon: <Trophy size={18} /> },
            { path: '/training', label: 'Auditor Certification & Quiz', icon: <GraduationCap size={18} /> },
          ],
        },
      ];
    }

    // Default fallback
    return [
      {
        title: 'OPERATIONAL EXECUTION',
        items: [
          { path: '/observations', label: 'Observations & Defects', icon: <AlertTriangle size={18} /> },
          { path: '/capa', label: 'CAPA & SLA Actions', icon: <Layers size={18} /> },
          { path: '/red-tags', label: 'Red Tag & Holding Area', icon: <Tag size={18} /> },
          { path: '/standards', label: '5S Standards Library', icon: <FileText size={18} /> },
        ],
      },
    ];
  };

  const navSections = getNavSections();

  return (
    <aside
      className="app-sidebar"
      style={{
        width: 'var(--sidebar-width)',
        minWidth: 'var(--sidebar-width)',
        height: '100vh',
        background: 'var(--bg-sidebar)',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, #2563EB 0%, #1E3A8A 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(37, 99, 235, 0.4)',
          }}
        >
          <span style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.05em' }}>5S</span>
        </div>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
            SkilGlobal 5S
          </div>
        </div>
      </div>

      {/* Nav List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
        {navSections.map((section, idx) => (
          <div key={idx} style={{ marginBottom: '24px' }}>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--text-sidebar-muted)',
                letterSpacing: '0.08em',
                padding: '0 12px 8px 12px',
              }}
            >
              {section.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {section.items.map((item, itemIdx) => {
                if (item.disabled) {
                  return (
                    <div
                      key={itemIdx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '9px 12px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '13px',
                        color: 'rgba(255, 255, 255, 0.35)',
                        cursor: 'not-allowed',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-xs)',
                          background: 'rgba(255, 255, 255, 0.08)',
                          color: 'rgba(255, 255, 255, 0.5)',
                        }}
                      >
                        {item.tag || 'Module'}
                      </span>
                    </div>
                  );
                }

                return (
                  <NavLink
                    key={itemIdx}
                    to={item.path}
                    style={({ isActive }) => ({
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '9px 12px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? '#FFFFFF' : 'var(--text-sidebar)',
                      background: isActive ? 'var(--color-primary)' : 'transparent',
                      textDecoration: 'none',
                      transition: 'all var(--transition-fast)',
                    })}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {item.icon}
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-xs)',
                          background: 'rgba(255, 255, 255, 0.2)',
                          color: '#FFFFFF',
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* User info & Sign out Footer */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, var(--color-primary) 0%, #1d4ed8 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '11px',
              flexShrink: 0,
            }}
          >
            {currentUser?.fullName
              ? currentUser.fullName
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
              : '5S'}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#FFFFFF',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentUser?.fullName || 'Pooja Sharma'}
            </div>
            <div
              style={{
                fontSize: '10px',
                color: 'var(--text-sidebar-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentUser?.roleCode || activeUserRole}
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          title="Sign Out"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px',
            cursor: 'pointer',
            color: 'rgba(255, 255, 255, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
            e.currentTarget.style.color = '#ef4444';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
          }}
        >
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
};
