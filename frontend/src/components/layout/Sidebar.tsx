import React, { useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { roleLabel } from '../../constants/roles';
import { MessageKey, useI18n } from '../../i18n';
import {
  Layers,
  ShieldCheck,
  Building,
  MapPin,
  QrCode,
  FileSpreadsheet,
  Users,
  Compass,
  FileCheck,
  BarChart3,
  FileText,
  Calendar,
  AlertTriangle,
  Tag,
  LogOut,
  X,
  GraduationCap,
  LayoutDashboard,
  ClipboardCheck,
  Trophy,
  History,
  Settings,
  FileBarChart,
  CreditCard,
  Plug,
  UserCog,
} from 'lucide-react';
import { useRecognitionSettings } from '../../pages/gamification/recognitionSettings';

interface NavItem {
  path: string;
  /** Translated with the organization's terminology (see nav.* in src/i18n/messages). */
  labelKey: MessageKey;
  icon: React.ReactNode;
}

interface NavSection {
  titleKey: MessageKey;
  items: NavItem[];
}

/**
 * Menu labels in sentence case ("Corrective Actions" → "Corrective actions"). Terminology terms arrive
 * title-cased; acronyms (all capitals, e.g. "CAPA", "5S") are kept as written.
 */
const sentenceCase = (label: string): string =>
  label
    .split(' ')
    .map((word, i) => (i === 0 || word === word.toUpperCase() ? word : word.toLowerCase()))
    .join(' ');

interface SidebarProps {
  /** Drawer state on narrow screens (always visible from 1024px up). */
  open?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ open = false, onClose }) => {
  const { currentUser, logout, activeUserRole, can } = useApp();
  // Recognition can be switched off per organization (Settings → Recognition)
  const { settings: recognition, loaded: recognitionLoaded } = useRecognitionSettings();
  const recognitionHidden = recognitionLoaded && !recognition.enabled;
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // The drawer closes after navigating and on Escape
  useEffect(() => {
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentRole = activeUserRole || currentUser?.primaryRole || 'ORG_ADMIN';

  // Activity trail is restricted to org admins (super admins pass too); the route and API enforce the same rule
  const activityLogItems: NavItem[] = can('AUDIT_TRAIL_VIEWERS')
    ? [{ path: '/activity-log', labelKey: 'nav.activityLog', icon: <History size={18} /> }]
    : [];

  // Organization configuration is edited by org admins only (route and PATCH /settings enforce the same rule)
  const settingsItems: NavItem[] = can('ORG_ADMINS')
    ? [
        { path: '/settings', labelKey: 'nav.orgSettings', icon: <Settings size={18} /> },
        { path: '/integrations', labelKey: 'nav.integrations', icon: <Plug size={18} /> },
        // Plan & usage belongs to the organization; platform super admins manage plans in their console
        ...(currentUser?.isSuperAdmin ? [] : [{ path: '/subscription', labelKey: 'nav.planUsage' as const, icon: <CreditCard size={18} /> }]),
      ]
    : [];

  // Registers & export for report viewers (route and API enforce the same group)
  const reportItems: NavItem[] = can('REPORT_VIEWERS')
    ? [{ path: '/reports', labelKey: 'nav.reportsExport', icon: <FileBarChart size={18} /> }]
    : [];

  // Generate role-tailored navigation sections; each page keeps the same plain label for every role
  const getNavSections = (): NavSection[] => {
    const item = {
      actionHub: { path: '/area-owner-hub', labelKey: 'nav.actionHub', icon: <LayoutDashboard size={18} /> },
      auditorHub: { path: '/auditor-hub', labelKey: 'nav.home', icon: <ClipboardCheck size={18} /> },
      organizations: { path: '/super-admin', labelKey: 'nav.organizations', icon: <ShieldCheck size={18} /> },
      newOrganization: { path: '/onboarding', labelKey: 'nav.newOrganization', icon: <Compass size={18} /> },
      organization: { path: '/organization', labelKey: 'nav.organization', icon: <Building size={18} /> },
      users: { path: '/users', labelKey: 'nav.users', icon: <UserCog size={18} /> },
      roles: { path: '/roles-permissions', labelKey: 'nav.rolesPermissions', icon: <Users size={18} /> },
      locations: { path: '/locations', labelKey: 'nav.locations', icon: <MapPin size={18} /> },
      qrCodes: { path: '/qr-studio', labelKey: 'nav.qrCodes', icon: <QrCode size={18} /> },
      bulkImport: { path: '/imports', labelKey: 'nav.bulkImport', icon: <FileSpreadsheet size={18} /> },
      standards: { path: '/standards', labelKey: 'nav.standards', icon: <FileText size={18} /> },
      templates: { path: '/templates', labelKey: 'nav.auditTemplates', icon: <FileCheck size={18} /> },
      schedules: { path: '/schedules', labelKey: 'nav.auditSchedules', icon: <Calendar size={18} /> },
      observations: { path: '/observations', labelKey: 'nav.observations', icon: <AlertTriangle size={18} /> },
      actions: { path: '/capa', labelKey: 'nav.correctiveActions', icon: <Layers size={18} /> },
      redTags: { path: '/red-tags', labelKey: 'nav.redTags', icon: <Tag size={18} /> },
      analytics: { path: '/analytics', labelKey: 'nav.analytics', icon: <BarChart3 size={18} /> },
      recognition: { path: '/recognition', labelKey: 'nav.recognition', icon: <Trophy size={18} /> },
      training: { path: '/training', labelKey: 'nav.training', icon: <GraduationCap size={18} /> },
    } satisfies Record<string, NavItem>;

    if (currentRole === 'SUPER_ADMIN') {
      return [
        {
          titleKey: 'navSection.platform',
          items: [item.organizations, item.newOrganization, item.roles, ...settingsItems, ...activityLogItems],
        },
        { titleKey: 'navSection.program', items: [item.templates, item.training] },
      ];
    }

    if (currentRole === 'ORG_ADMIN') {
      return [
        {
          titleKey: 'navSection.setup',
          items: [item.organization, item.users, item.roles, item.locations, item.qrCodes, item.bulkImport, ...settingsItems, ...activityLogItems],
        },
        { titleKey: 'navSection.program', items: [item.templates, item.schedules, item.standards] },
        { titleKey: 'navSection.followUp', items: [item.actions, item.observations, item.redTags] },
        { titleKey: 'navSection.results', items: [item.analytics, ...reportItems, item.recognition, item.training] },
      ];
    }

    if (currentRole === 'PLANT_HEAD') {
      return [
        { titleKey: 'navSection.results', items: [item.analytics, ...reportItems] },
        { titleKey: 'navSection.areas', items: [item.organization, item.locations, item.qrCodes, item.roles] },
        { titleKey: 'navSection.followUp', items: [item.actions, item.redTags, item.observations, item.schedules, item.templates] },
        { titleKey: 'navSection.learning', items: [item.recognition, item.standards, item.training] },
      ];
    }

    if (currentRole === 'COORDINATOR_5S') {
      return [
        { titleKey: 'navSection.program', items: [item.schedules, item.templates, item.standards] },
        { titleKey: 'navSection.followUp', items: [item.actions, item.redTags, item.observations] },
        { titleKey: 'navSection.areas', items: [item.organization, item.locations, item.qrCodes, item.roles] },
        { titleKey: 'navSection.results', items: [item.analytics, ...reportItems, item.recognition, item.training] },
      ];
    }

    if (currentRole === 'DEPT_HEAD') {
      return [
        { titleKey: 'navSection.myWork', items: [item.actionHub, item.locations, item.qrCodes, item.observations] },
        { titleKey: 'navSection.followUp', items: [item.actions, item.redTags, item.schedules] },
        { titleKey: 'navSection.results', items: [item.analytics, ...reportItems, item.organization] },
        { titleKey: 'navSection.learning', items: [item.recognition, item.standards, item.training] },
      ];
    }

    if (currentRole === 'AREA_OWNER') {
      return [
        { titleKey: 'navSection.myWork', items: [item.actionHub, item.locations] },
        { titleKey: 'navSection.followUp', items: [item.actions, item.observations, item.redTags] },
        { titleKey: 'navSection.learning', items: [item.recognition, item.standards, item.training] },
      ];
    }

    if (currentRole === 'AUDITOR' || currentRole === 'EXTERNAL_AUDITOR') {
      return [
        // The schedules page is not open to external auditors (see App.tsx)
        { titleKey: 'navSection.auditing', items: [item.auditorHub, ...(currentRole === 'AUDITOR' ? [item.schedules] : [])] },
        { titleKey: 'navSection.followUp', items: [item.observations, item.actions, item.redTags, ...reportItems] },
        {
          titleKey: 'navSection.learning',
          items: [item.standards, ...(currentRole === 'AUDITOR' ? [item.templates] : []), item.recognition, item.training],
        },
      ];
    }

    if (currentRole === 'EXECUTIVE') {
      // View-only leadership role (BRD 9.9): dashboards, registers and the areas behind them
      return [
        { titleKey: 'navSection.results', items: [item.analytics, ...reportItems, item.recognition] },
        { titleKey: 'navSection.areas', items: [item.organization, item.locations, item.standards] },
      ];
    }

    // Default fallback (employees and any custom role)
    return [
      { titleKey: 'navSection.myWork', items: [item.observations, item.actions, item.redTags, item.standards] },
      { titleKey: 'navSection.learning', items: [item.recognition, item.training] },
    ];
  };

  // Labels are translated; configurable nouns follow the organization's terminology (e.g. a renamed 'Red Tag')
  const navSections = getNavSections().map((section) => ({
    title: t(section.titleKey),
    items: section.items
      .filter((item) => !(recognitionHidden && item.path === '/recognition'))
      .map((item) => ({ ...item, label: sentenceCase(t(item.labelKey)) })),
  }));

  const initials = currentUser?.fullName
    ? currentUser.fullName
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
    : '5S';

  return (
    <aside className={`app-sidebar${open ? ' is-open' : ''}`} aria-label={t('common.navigation')}>
      {/* Brand block: lines up with the blue top bar to form one brand band */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark" aria-hidden="true">
          5S
        </div>
        <div className="sidebar-brand-name">SkilGlobal 5S</div>
        <button type="button" className="app-menu-button btn btn-ghost btn-sm btn-icon sidebar-brand-close" onClick={onClose} aria-label={t('common.closeMenu')}>
          <X size={18} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {navSections.map((section) => (
          <div key={section.title} className="sidebar-section">
            <div className="sidebar-section-title">{section.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {section.items.map((item) => (
                <NavLink key={item.path} to={item.path} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Signed-in user and sign out */}
      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
          <div className="sidebar-avatar" aria-hidden="true">
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="sidebar-user-name">{currentUser?.fullName}</div>
            <div className="sidebar-user-role">{roleLabel(activeUserRole || currentUser?.roleCode)}</div>
          </div>
        </div>
        <button type="button" onClick={handleLogout} title={t('nav.signOut')} aria-label={t('nav.signOut')} className="sidebar-signout">
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
};
