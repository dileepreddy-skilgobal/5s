import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ApiKeysService } from '../integrations/api-keys.service';

/**
 * Global guard: every route requires a valid access token unless marked @Public().
 * Integrations may instead present an organization API key in the `X-API-Key` header.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeysService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const apiKey = req.headers['x-api-key'];
    if (typeof apiKey === 'string' && apiKey) {
      const user = await this.apiKeys.authenticate(apiKey, req.method, req.path);
      if (!user) throw new UnauthorizedException('Invalid, expired or revoked API key.');
      req.user = user;
      return true;
    }
    return (await super.canActivate(context)) as boolean;
  }
}
