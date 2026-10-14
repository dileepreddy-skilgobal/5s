import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ShieldAlert, ArrowLeft, Home, Lock } from 'lucide-react';

interface AccessDeniedPageProps {
  resourceName?: string;
  allowedRoles?: string[];
}

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  SUPER_ADMIN: 'SaaS Super Administrator',
  ORG_ADMIN: 'Organization Administrator',
  PLANT_HEAD: 'Plant Head / Director',
  COORDINATOR_5S: '5S Lean Coordinator',
  DEPT_HEAD: 'Department Head',
  AREA_OWNER: 'Area Owner / Cell Leader',
  AUDITOR: 'Certified 5S Auditor',
  EXTERNAL_AUDITOR: 'External 5S Consultant',
};

export const AccessDeniedPage: React.FC<AccessDeniedPageProps> = ({
  resourceName = 'this corporate resource',
  allowedRoles = [],
}) => {
  const navigate = useNavigate();
  const { activeUserRole, currentUser } = useApp();

  const currentRoleName = ROLE_DISPLAY_NAMES[activeUserRole] || activeUserRole;
  const allowedRoleNames = allowedRoles.map((r) => ROLE_DISPLAY_NAMES[r] || r).join(', ');

  const getHomePath = () => {
    if (activeUserRole === 'SUPER_ADMIN') return '/super-admin';
    if (activeUserRole === 'AREA_OWNER') return '/area-owner-hub';
    if (activeUserRole === 'AUDITOR' || activeUserRole === 'EXTERNAL_AUDITOR') return '/auditor-hub';
    return '/locations';
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '70vh',
        padding: '24px',
      }}
    >
      <Card noPadding>
        <div
          style={{
            maxWidth: '560px',
            padding: '36px 32px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              color: 'var(--color-danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(239, 68, 68, 0.15)',
            }}
          >
            <ShieldAlert size={32} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
              <Badge variant="danger">403 Restricted</Badge>
              <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                Enterprise Access Control
              </span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Access Permission Denied
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.5 }}>
              Your current profile role <strong>({currentRoleName})</strong> is not authorized to access <strong>{resourceName}</strong>.
            </p>
          </div>

          {allowedRoles.length > 0 && (
            <div
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
                fontSize: '12px',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: '4px' }}>
                <Lock size={13} />
                <span>Required Clearance:</span>
              </div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {allowedRoleNames}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px', width: '100%', justifyContent: 'center' }}>
            <Button
              variant="secondary"
              icon={<ArrowLeft size={15} />}
              onClick={() => navigate(-1)}
            >
              Go Back
            </Button>
            <Button
              variant="primary"
              icon={<Home size={15} />}
              onClick={() => navigate(getHomePath())}
            >
              Return to Workspace
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
