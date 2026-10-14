import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { Shell } from './components/layout/Shell';

// Authentication
const LoginPage = lazy(() => import('./pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));

// Master & Governance Pages
const SuperAdminPage = lazy(() => import('./pages/super-admin/SuperAdminPage').then((m) => ({ default: m.SuperAdminPage })));
const OnboardingWizardPage = lazy(() => import('./pages/onboarding/OnboardingWizardPage').then((m) => ({ default: m.OnboardingWizardPage })));
const OrgHierarchyPage = lazy(() => import('./pages/organization/OrgHierarchyPage').then((m) => ({ default: m.OrgHierarchyPage })));
const RolesPermissionsPage = lazy(() => import('./pages/roles-permissions/RolesPermissionsPage').then((m) => ({ default: m.RolesPermissionsPage })));
const LocationsPage = lazy(() => import('./pages/locations/LocationsPage').then((m) => ({ default: m.LocationsPage })));
const LocationDetailPage = lazy(() => import('./pages/locations/LocationDetailPage').then((m) => ({ default: m.LocationDetailPage })));
const QrStudioPage = lazy(() => import('./pages/qr-studio/QrStudioPage').then((m) => ({ default: m.QrStudioPage })));
const ExcelImportPage = lazy(() => import('./pages/imports/ExcelImportPage').then((m) => ({ default: m.ExcelImportPage })));

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

// Training & Academy Pages
const TrainingAcademyPage = lazy(() => import('./pages/training/TrainingAcademyPage').then((m) => ({ default: m.TrainingAcademyPage })));

// Gamification, Trophies & Recognition
const RecognitionPage = lazy(() => import('./pages/gamification/RecognitionPage').then((m) => ({ default: m.RecognitionPage })));

const PageLoadingFallback: React.FC = () => (
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
      Loading workspace...
    </span>
  </div>
);

import { RoleProtectedRoute } from './components/auth/RoleProtectedRoute';

const AppRoutes: React.FC = () => {
  const { isAuthenticated, activeUserRole, currentUser } = useApp();
  const location = useLocation();

  const getRoleHomePath = () => {
    const role = activeUserRole || currentUser?.primaryRole || 'ORG_ADMIN';
    if (role === 'SUPER_ADMIN') return '/super-admin';
    if (role === 'PLANT_HEAD') return '/analytics';
    if (role === 'COORDINATOR_5S') return '/schedules';
    if (role === 'DEPT_HEAD') return '/locations';
    if (role === 'AREA_OWNER') return '/area-owner-hub';
    if (role === 'AUDITOR' || role === 'EXTERNAL_AUDITOR') return '/auditor-hub';
    return '/organization';
  };

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

  return (
    <Shell>
      <Suspense fallback={<PageLoadingFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to={defaultHome} replace />} />
          
          {/* Role Action Hubs */}
          <Route
            path="/area-owner-hub"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'AREA_OWNER', 'DEPT_HEAD']} resourceName="Area Owner Action Hub">
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
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN']} resourceName="Organization Hierarchy">
                <OrgHierarchyPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/roles-permissions"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN']} resourceName="Roles & RBAC Matrix">
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
            path="/qr-studio"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S']} resourceName="QR Code Studio">
                <QrStudioPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/locations"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AREA_OWNER']} resourceName="Location & Area Master">
                <LocationsPage />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/locations/:id"
            element={
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AREA_OWNER']} resourceName="Location & Area Master">
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
              <RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD']} resourceName="Executive Analytics & Maturity Heatmap">
                <MaturityHeatmapPage />
              </RoleProtectedRoute>
            }
          />

          {/* Culture, Gamification & Recognition */}
          <Route path="/recognition" element={<RecognitionPage />} />
          <Route path="/gamification" element={<RecognitionPage />} />

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
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
};

