import React, { Suspense, lazy } from 'react';
import { roleHomePath } from './constants/roles';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { Shell } from './components/layout/Shell';
import { ToastContainer } from './components/ui/Toast';
import { I18nProvider, useI18n } from './i18n';

// Authentication
const LoginPage = lazy(() => import('./pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const ForgotPasswordPage = lazy(() => import('./pages/auth/PasswordRecoveryPages').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/auth/PasswordRecoveryPages').then((m) => ({ default: m.ResetPasswordPage })));
const AccountSecurityPage = lazy(() => import('./pages/account/AccountSecurityPage').then((m) => ({ default: m.AccountSecurityPage })));

// Master & Governance Pages
const SuperAdminPage = lazy(() => import('./pages/super-admin/SuperAdminPage').then((m) => ({ default: m.SuperAdminPage })));
const OnboardingWizardPage = lazy(() => import('./pages/onboarding/OnboardingWizardPage').then((m) => ({ default: m.OnboardingWizardPage })));
const OrgHierarchyPage = lazy(() => import('./pages/organization/OrgHierarchyPage').then((m) => ({ default: m.OrgHierarchyPage })));
const RolesPermissionsPage = lazy(() => import('./pages/roles-permissions/RolesPermissionsPage').then((m) => ({ default: m.RolesPermissionsPage })));
const LocationsPage = lazy(() => import('./pages/locations/LocationsPage').then((m) => ({ default: m.LocationsPage })));
const LocationDetailPage = lazy(() => import('./pages/locations/LocationDetailPage').then((m) => ({ default: m.LocationDetailPage })));
const QrStudioPage = lazy(() => import('./pages/qr-studio/QrStudioPage').then((m) => ({ default: m.QrStudioPage })));
const ExcelImportPage = lazy(() => import('./pages/imports/ExcelImportPage').then((m) => ({ default: m.ExcelImportPage })));
const OrganizationSettingsPage = lazy(() => import('./pages/settings/OrganizationSettingsPage').then((m) => ({ default: m.OrganizationSettingsPage })));
const SubscriptionPage = lazy(() => import('./pages/subscription/SubscriptionPage').then((m) => ({ default: m.SubscriptionPage })));
const IntegrationsPage = lazy(() => import('./pages/integrations/IntegrationsPage').then((m) => ({ default: m.IntegrationsPage })));
const ActivityLogPage = lazy(() => import('./pages/activity-log/ActivityLogPage').then((m) => ({ default: m.ActivityLogPage })));

// Role-Tailored Action Hubs
const AreaOwnerDashboard = lazy(() => import('./pages/dashboard/AreaOwnerDashboard').then((m) => ({ default: m.AreaOwnerDashboard })));
const AuditorDashboard = lazy(() => import('./pages/dashboard/AuditorDashboard').then((m) => ({ default: m.AuditorDashboard })));

// Standards, Templates & Schedules Pages
const StandardsPage = lazy(() => import('./pages/standards/StandardsPage').then((m) => ({ default: m.StandardsPage })));
const StandardDetailPage = lazy(() => import('./pages/standards/StandardDetailPage').then((m) => ({ default: m.StandardDetailPage })));
const AuditTemplatesPage = lazy(() => import('./pages/templates/AuditTemplatesPage').then((m) => ({ default: m.AuditTemplatesPage })));
const TemplateBuilderPage = lazy(() => import('./pages/templates/TemplateBuilderPage').then((m) => ({ default: m.TemplateBuilderPage })));
const AuditSchedulesPage = lazy(() => import('./pages/schedules/AuditSchedulesPage').then((m) => ({ default: m.AuditSchedulesPage })));

// Operational Execution Pages
const MobileAuditExecutionPage = lazy(() => import('./pages/audit-execution/MobileAuditExecutionPage').then((m) => ({ default: m.MobileAuditExecutionPage })));
const ObservationsPage = lazy(() => import('./pages/observations/ObservationsPage').then((m) => ({ default: m.ObservationsPage })));
const CapaManagementPage = lazy(() => import('./pages/capa/CapaManagementPage').then((m) => ({ default: m.CapaManagementPage })));
const RedTagStudioPage = lazy(() => import('./pages/red-tags/RedTagStudioPage').then((m) => ({ default: m.RedTagStudioPage })));

// Analytics & Intelligence Pages
const MaturityHeatmapPage = lazy(() => import('./pages/analytics/MaturityHeatmapPage').then((m) => ({ default: m.MaturityHeatmapPage })));

// Reports & Export
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));

// Notifications
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));

// Training & Academy Pages
const TrainingAcademyPage = lazy(() => import('./pages/training/TrainingAcademyPage').then((m) => ({ default: m.TrainingAcademyPage })));

// Gamification, Trophies & Recognition
const UsersPage = lazy(() => import('./pages/users/UsersPage').then((m) => ({ default: m.UsersPage })));
const RecognitionPage = lazy(() => import('./pages/gamification/RecognitionPage').then((m) => ({ default: m.RecognitionPage })));

const PageLoadingFallback: React.FC = () => {
  const { t } = useI18n();
  return (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      flexDirection: 'column',
      gap: '14px',
    }}
  >
    <div
      style={{
        width: '36px',
        height: '36px',
        border: '3px solid var(--border-subtle)',
        borderTopColor: 'var(--color-primary)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }}
    />
    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
      {t('common.loading')}
    </span>
  </div>
  );
};

import { RoleProtectedRoute } from './components/auth/RoleProtectedRoute';
import { RoleGroups } from './constants/roleGroups';

const ACCOUNT_SECURITY_PATH = '/account/security';

const AppRoutes: React.FC = () => {
  const { isAuthenticated, isSessionLoading, activeUserRole, currentUser, mfaEnrollmentRequired, currentTenant } = useApp();
  const location = useLocation();

  const getRoleHomePath = () => roleHomePath(activeUserRole || currentUser?.primaryRole);

  // Wait for a stored session to be verified before deciding where to route
  if (isSessionLoading) {
    return <PageLoadingFallback />;
  }

  // Public password-recovery pages work whether or not someone is signed in on this browser
  if (location.pathname === '/forgot-password' || location.pathname === '/reset-password') {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        {location.pathname === '/forgot-password' ? <ForgotPasswordPage /> : <ResetPasswordPage />}
      </Suspense>
    );
  }

  if (location.pathname === '/login') {
    if (isAuthenticated) {
      return <Navigate to={getRoleHomePath()} replace />;
    }
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <LoginPage />
      </Suspense>
    );
  }

  // If not authenticated, redirect to /login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const defaultHome = getRoleHomePath();

  // Mandatory MFA enrolment: only the account security page (and sign-out) is available until enrolled
  if (mfaEnrollmentRequired && location.pathname !== ACCOUNT_SECURITY_PATH) {
    return <Navigate to={ACCOUNT_SECURITY_PATH} replace />;
  }

  return (
    <Shell>
      {/* Keyed on the organization so every page reloads its data when a super admin switches organization */}
      <Suspense key={currentTenant?.id ?? 'none'} fallback={<PageLoadingFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to={defaultHome} replace />} />
          
          {/* Role Action Hubs */}
          <Route
            path="/area-owner-hub"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'AREA_OWNER', 'DEPT_HEAD']} resourceName="Area action hub">
                <AreaOwnerDashboard />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/auditor-hub"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR', 'EXTERNAL_AUDITOR', 'COORDINATOR_5S']} resourceName="Auditor Inspection Workspace">
                <AuditorDashboard />
              </RoleProtectedRoute>
            }
          />

          {/* Super Admin & System Onboarding */}
          <Route
            path="/super-admin"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN']} resourceName="Super Administrator Console">
                <SuperAdminPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/onboarding"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN']} resourceName="Tenant Onboarding Wizard">
                <OnboardingWizardPage />
              </RoleProtectedRoute>
            }
          />

          {/* Organization & Master Administration */}
          <Route
            path="/organization"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', ...RoleGroups.SITE_LEADERS]} resourceName="Organization Hierarchy">
                <OrgHierarchyPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', ...RoleGroups.ORG_ADMINS]} resourceName="Users">
                <UsersPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/roles-permissions"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', ...RoleGroups.ROLE_VIEWERS]} resourceName="Roles & RBAC Matrix">
                <RolesPermissionsPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/imports"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN']} resourceName="Excel Bulk Ingestion">
                <ExcelImportPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/activity-log"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN']} resourceName="Activity Log">
                <ActivityLogPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN']} resourceName="Organization Settings">
                <OrganizationSettingsPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/integrations"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN']} resourceName="Integrations">
                <IntegrationsPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/subscription"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN']} resourceName="Plan & Usage">
                <SubscriptionPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/qr-studio"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD']} resourceName="QR codes">
                <QrStudioPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/locations"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AREA_OWNER', 'EXECUTIVE']} resourceName="Location & Area Master">
                <LocationsPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/locations/:id"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AREA_OWNER', 'EXECUTIVE']} resourceName="Location & Area Master">
                <LocationDetailPage />
              </RoleProtectedRoute>
            }
          />

          {/* Standards & Templates */}
          <Route
            path="/templates/:id/builder"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S']} resourceName="Audit Template Builder">
                <TemplateBuilderPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/templates"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S', 'AUDITOR', 'PLANT_HEAD']} resourceName="Audit Templates Library">
                <AuditTemplatesPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/schedules"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S', 'AUDITOR', 'PLANT_HEAD', 'DEPT_HEAD']} resourceName="Audit Schedules & Rotation">
                <AuditSchedulesPage />
              </RoleProtectedRoute>
            }
          />
          <Route path="/standards" element={<StandardsPage />} />
          <Route path="/standards/:id" element={<StandardDetailPage />} />

          {/* Operational Execution */}
          <Route path="/mobile-audit" element={<MobileAuditExecutionPage />} />
          <Route path="/mobile-audit/:instanceId" element={<MobileAuditExecutionPage />} />
          <Route path="/observations" element={<ObservationsPage />} />
          <Route path="/capa" element={<CapaManagementPage />} />
          <Route path="/red-tags" element={<RedTagStudioPage />} />

          {/* Analytics & Executive Intelligence */}
          <Route
            path="/analytics"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', ...RoleGroups.SITE_LEADERS]} resourceName="Executive Analytics & Maturity Heatmap">
                <MaturityHeatmapPage />
              </RoleProtectedRoute>
            }
          />

          {/* Registers & Export */}
          <Route
            path="/reports"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', ...RoleGroups.REPORT_VIEWERS]} resourceName="Reports & Export">
                <ReportsPage />
              </RoleProtectedRoute>
            }
          />

          {/* Personal account security (any signed-in user) */}
          <Route path={ACCOUNT_SECURITY_PATH} element={<AccountSecurityPage />} />

          {/* Personal notification inbox (any signed-in user) */}
          <Route path="/notifications" element={<NotificationsPage />} />

          {/* Culture, Gamification & Recognition */}
          <Route path="/recognition" element={<RecognitionPage />} />
          <Route path="/gamification" element={<Navigate to="/recognition" replace />} />

          {/* Knowledge & Training Academy */}
          <Route path="/training" element={<TrainingAcademyPage />} />

          <Route path="*" element={<Navigate to={defaultHome} replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <I18nProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <ToastContainer />
      </I18nProvider>
    </AppProvider>
  );
};

