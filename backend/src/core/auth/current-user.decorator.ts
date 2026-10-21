import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedUser } from './auth.types';

function getAuthUser(ctx: ExecutionContext): AuthenticatedUser {
  const request = ctx.switchToHttp().getRequest();
  const user = request.user as AuthenticatedUser | undefined;
  if (!user) {
    throw new UnauthorizedException('Authentication required');
  }
  return user;
}

/** Full verified identity of the caller. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser =>
  getAuthUser(ctx),
);

/** Tenant the current request is scoped to. */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string =>
  getAuthUser(ctx).tenantId,
);

/** Id of the authenticated user. */
export const CurrentUserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string =>
  getAuthUser(ctx).userId,
);
