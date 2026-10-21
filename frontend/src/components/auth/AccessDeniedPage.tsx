import React from 'react';
import { roleHomePath, roleLabel } from '../../constants/roles';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { PageHeader } from '../ui/PageHeader';
import { ShieldAlert, ArrowLeft, Home, Lock } from 'lucide-react';

interface AccessDeniedPageProps {
  resourceName?: string;
  allowedRoles?: string[];
}

export const AccessDeniedPage: React.FC<AccessDeniedPageProps> = ({
  resourceName = 'this corporate resource',
  allowedRoles = [],
}) => {
  const navigate = useNavigate();
  const { activeUserRole, currentUser } = useApp();

  const currentRoleName = roleLabel(activeUserRole);
  const allowedRoleNames = allowedRoles.filter((r) => r !== 'SUPER_ADMIN').map(roleLabel).join(', ');

  const getHomePath = () => roleHomePath(activeUserRole || currentUser?.primaryRole);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="You don't have access to this page"
        meta={<Badge variant="danger">No access</Badge>}
        description="Your role doesn't include this page. Ask your organization admin if you need it."
      />

      <div style={{ maxWidth: '640px', width: '100%' }}>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span
                aria-hidden="true"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-danger-bg)',
                  border: '1px solid var(--color-danger-border)',
                  color: 'var(--color-danger)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <ShieldAlert size={20} />
              </span>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55, minWidth: 0, overflowWrap: 'anywhere' }}>
                Your role (<strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{currentRoleName}</strong>) can't open{' '}
                <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{resourceName}</strong>. Ask your organization admin if you need it.
              </p>
            </div>

            {allowedRoles.length > 0 && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  <Lock size={14} aria-hidden="true" />
                  <span>Available to</span>
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>{allowedRoleNames}</div>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
                paddingTop: '16px',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>
                Go back
              </Button>
              <Button variant="primary" icon={<Home size={16} />} onClick={() => navigate(getHomePath())}>
                Go to my home page
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
