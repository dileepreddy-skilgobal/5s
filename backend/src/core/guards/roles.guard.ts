import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { AuthenticatedUser } from '../auth/auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no @Roles() decorator is specified on handler or controller class, any authenticated user may access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Identity comes exclusively from the verified access token (see JwtStrategy)
    const user = context.switchToHttp().getRequest().user as AuthenticatedUser | undefined;
    if (!user) {
      throw new ForbiddenException('Access Denied: Missing role authorization credentials.');
    }

    // Global Super Admin has unconstrained administrative clearance
    if (user.isSuperAdmin) {
      return true;
    }

    const hasRole = user.roles.some((role) => requiredRoles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException(
        `Access Denied: Your role does not possess required privilege [${requiredRoles.join(', ')}] for this operation.`,
      );
    }

    return true;
  }
}
