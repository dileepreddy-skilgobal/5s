import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../auth/auth.types';
import { Feature } from './plans';

export const REQUIRES_FEATURE = 'requiresFeature';
export const ALLOW_WHEN_READ_ONLY = 'allowWhenReadOnly';

/** The route needs a plan feature (e.g. ADVANCED_ANALYTICS). */
export const RequiresFeature = (feature: Feature) => SetMetadata(REQUIRES_FEATURE, feature);
/** State-changing routes that must keep working after a trial ends (sign-out, password, MFA, read receipts). */
export const AllowWhenReadOnly = () => SetMetadata(ALLOW_WHEN_READ_ONLY, true);

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Applies the tenant's subscription: plan features gate premium routes, and an expired trial or
 * lapsed subscription puts the organization in read-only mode (402). Platform super admins are exempt.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthenticatedUser | undefined;
    if (!user || user.isSuperAdmin || !user.subscription) return true;
    const targets = [context.getHandler(), context.getClass()];

    const feature = this.reflector.getAllAndOverride<Feature | undefined>(REQUIRES_FEATURE, targets);
    if (feature && !user.subscription.features.includes(feature)) {
      throw new ForbiddenException(`PLAN_FEATURE_REQUIRED: ${feature} is not included in your organization's plan. Contact your administrator to upgrade.`);
    }

    if (user.subscription.readOnly && !READ_METHODS.has(req.method) && !this.reflector.getAllAndOverride<boolean>(ALLOW_WHEN_READ_ONLY, targets)) {
      throw new HttpException(
        user.subscription.readOnlyReason === 'TRIAL_EXPIRED'
          ? 'TRIAL_EXPIRED: Your free trial has ended. Your data is available read-only until a subscription is activated.'
          : 'SUBSCRIPTION_LAPSED: Your subscription has lapsed. Your data is available read-only until it is renewed.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
