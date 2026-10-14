import React from 'react';
import { useApp } from '../../context/AppContext';
import { AccessDeniedPage } from './AccessDeniedPage';

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
  resourceName?: string;
}

export const RoleProtectedRoute: React.FC<RoleProtectedRouteProps> = ({
  children,
  allowedRoles,
  resourceName,
}) => {
  const { activeUserRole, currentUser } = useApp();

  const isSuper = currentUser?.isSuperAdmin === true || currentUser?.email === 'superadmin@skilglobal.com' || activeUserRole === 'SUPER_ADMIN';
  
  // Super Admin has master clearance on tenant resources, except tenant-restricted actions where specified
  if (isSuper && allowedRoles.includes('SUPER_ADMIN')) {
    return <>{children}</>;
  }

  // Check if caller's active role is in the authorized list
  const isAuthorized = allowedRoles.includes(activeUserRole);

  if (!isAuthorized) {
    return <AccessDeniedPage resourceName={resourceName} allowedRoles={allowedRoles} />;
  }

  return <>{children}</>;
};
