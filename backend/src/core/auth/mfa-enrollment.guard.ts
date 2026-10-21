import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from './auth.types';

export const ALLOW_DURING_MFA_ENROLLMENT = 'allowDuringMfaEnrollment';
/** Routes an administrator may use before completing mandatory MFA enrolment (profile, MFA setup, sign-out). */
export const AllowDuringMfaEnrollment = () => SetMetadata(ALLOW_DURING_MFA_ENROLLMENT, true);

/** Enforces the tenant policy "administrators must use MFA" once the user is authenticated. */
@Injectable()
export class MfaEnrollmentGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user as AuthenticatedUser | undefined;
    if (!user?.mfaEnrollmentRequired) return true;
    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_DURING_MFA_ENROLLMENT, [context.getHandler(), context.getClass()]);
    if (allowed) return true;
    throw new ForbiddenException('MFA_ENROLLMENT_REQUIRED: Your organization requires administrators to set up two-factor authentication before continuing.');
  }
}
