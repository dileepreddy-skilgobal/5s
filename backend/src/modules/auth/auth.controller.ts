import { Controller, Post, Get, Patch, Body, HttpCode, HttpStatus, Req, Delete, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { requestMeta } from '../../core/activity/activity-log.util';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import {
  LoginDto,
  SsoLoginDto,
  PinLoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  MfaVerifyDto,
  MfaCodeDto,
  MfaDisableDto,
  UpdatePreferencesDto,
} from './dto/auth.dto';
import { Public } from '../../core/auth/public.decorator';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { AllowDuringMfaEnrollment } from '../../core/auth/mfa-enrollment.guard';
import { AllowWhenReadOnly } from '../../core/subscription/subscription.guard';

/** Per-IP limits for credential endpoints (per minute); tunable for load tests via env. */
const signInLimit = () => Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? 10);
const recoveryLimit = () => Number(process.env.PASSWORD_RESET_RATE_LIMIT_PER_MINUTE ?? 5);
const SIGN_IN_THROTTLE = { default: { limit: signInLimit, ttl: 60000 } };
const RECOVERY_THROTTLE = { default: { limit: recoveryLimit, ttl: 60000 } };

@ApiTags('Authentication & Identity Federation')
// Signing in/out, passwords and MFA keep working when the organization is read-only
@AllowWhenReadOnly()
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
  ) {}

  @Public()
  @Throttle(SIGN_IN_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email & password (returns mfaRequired + mfaToken when two-factor is enabled)' })
  @ApiResponse({ status: 200, description: 'Session issued, or MFA challenge' })
  @ApiResponse({ status: 401, description: 'Invalid corporate credentials' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, requestMeta(req));
  }

  @Public()
  @Post('sso')
  @ApiOperation({ summary: 'Authenticate via Enterprise SSO (not yet configured — returns 501)' })
  ssoLogin(@Body() dto: SsoLoginDto) {
    return this.authService.ssoLogin(dto);
  }

  @Public()
  @Throttle(SIGN_IN_THROTTLE)
  @Post('pin-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Shopfloor quick sign-in using badge ID and operator PIN' })
  pinLogin(@Body() dto: PinLoginDto, @Req() req: Request) {
    return this.authService.pinLogin(dto, requestMeta(req));
  }

  @Public()
  @Throttle(SIGN_IN_THROTTLE)
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Second sign-in step: authenticator code or recovery code' })
  verifyMfa(@Body() dto: MfaVerifyDto, @Req() req: Request) {
    return this.authService.verifyMfa(dto, requestMeta(req));
  }

  @Public()
  @Throttle(RECOVERY_THROTTLE)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email a single-use password reset link (same response whether or not the account exists)' })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.forgotPassword(dto, requestMeta(req));
  }

  @Public()
  @Throttle(RECOVERY_THROTTLE)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password with the emailed token; signs out every device' })
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.authService.resetPassword(dto, requestMeta(req));
  }

  @Get('me')
  @ApiBearerAuth()
  @AllowDuringMfaEnrollment()
  @ApiOperation({ summary: 'Get current authenticated user session' })
  getCurrentSession(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getCurrentSession(user);
  }

  @Patch('me/preferences')
  @ApiBearerAuth()
  @AllowDuringMfaEnrollment()
  @ApiOperation({ summary: 'Update my personal preferences (UI language)' })
  updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePreferencesDto) {
    return this.authService.updatePreferences(user, dto.locale);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change my password (other devices are signed out)' })
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user, dto);
  }

  // ---------------------------------------------------------------------------
  // Sessions & devices
  // ---------------------------------------------------------------------------

  @Post('logout')
  @ApiBearerAuth()
  @AllowDuringMfaEnrollment()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out this device (the access token stops working immediately)' })
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @AllowDuringMfaEnrollment()
  @ApiOperation({ summary: 'My signed-in devices' })
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessions(user);
  }

  @Post('sessions/revoke-others')
  @ApiBearerAuth()
  @AllowDuringMfaEnrollment()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out every other device' })
  revokeOthers(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.revokeOtherSessions(user);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @AllowDuringMfaEnrollment()
  @ApiOperation({ summary: 'Sign out one of my devices' })
  revokeSession(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.authService.revokeSession(user, id);
  }

  // ---------------------------------------------------------------------------
  // Two-factor authentication (TOTP)
  // ---------------------------------------------------------------------------

  @Get('mfa')
  @ApiBearerAuth()
  @AllowDuringMfaEnrollment()
  @ApiOperation({ summary: 'My two-factor status' })
  mfaStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.mfaService.status(user);
  }

  @Post('mfa/setup')
  @ApiBearerAuth()
  @AllowDuringMfaEnrollment()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start enrolment: returns the secret, otpauth URI and a QR code image' })
  mfaSetup(@CurrentUser() user: AuthenticatedUser) {
    return this.mfaService.setup(user);
  }

  @Post('mfa/enable')
  @ApiBearerAuth()
  @AllowDuringMfaEnrollment()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm enrolment with a code; returns one-time recovery codes' })
  mfaEnable(@CurrentUser() user: AuthenticatedUser, @Body() dto: MfaCodeDto) {
    return this.mfaService.enable(user, dto.code);
  }

  @Post('mfa/disable')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Turn two-factor off (password + current code; not allowed when required by policy)' })
  mfaDisable(@CurrentUser() user: AuthenticatedUser, @Body() dto: MfaDisableDto) {
    return this.mfaService.disable(user, dto.password, dto.code);
  }

  @Post('mfa/recovery-codes')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replace my recovery codes (old ones stop working)' })
  regenerateRecoveryCodes(@CurrentUser() user: AuthenticatedUser, @Body() dto: MfaCodeDto) {
    return this.mfaService.regenerateRecoveryCodes(user, dto.code);
  }
}
