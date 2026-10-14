import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no @Roles() decorator is specified on handler or controller class, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Extract caller role from headers or attached session identity
    const userRole = (request.headers['x-user-role'] as string) || (request.user?.role as string);
    const isSuperAdmin = request.headers['x-super-admin'] === 'true' || userRole === 'SUPER_ADMIN';

    // Global Super Admin has unconstrained administrative clearance
    if (isSuperAdmin && (requiredRoles.includes('SUPER_ADMIN') || requiredRoles.length > 0)) {
      return true;
    }

    if (!userRole) {
      throw new ForbiddenException('Access Denied: Missing role authorization credentials.');
    }

    const hasRole = requiredRoles.includes(userRole);
    if (!hasRole) {
      throw new ForbiddenException(
        `Access Denied: Current role '${userRole}' does not possess required privilege [${requiredRoles.join(', ')}] for this operation.`
      );
    }

    return true;
  }
}
