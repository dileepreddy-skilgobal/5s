import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { SessionService } from '../../core/auth/session.service';
import { TenantSettingsService } from '../../core/config/tenant-settings.service';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashToken,
  otpauthUri,
  verifyTotp,
} from '../../core/auth/totp';

/** TOTP enrolment, recovery codes and administrator reset. */
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly settings: TenantSettingsService,
  ) {}

  private async load(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, tenantId: true, mfaEnabled: true, mfaSecret: true, mfaPendingSecret: true, mfaRecoveryCodes: true, mfaEnabledAt: true, passwordHash: true, tenant: { select: { name: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async status(authUser: AuthenticatedUser) {
    const user = await this.load(authUser.userId);
    return {
      enabled: user.mfaEnabled,
      enabledAt: user.mfaEnabledAt,
      recoveryCodesRemaining: user.mfaEnabled ? (JSON.parse(user.mfaRecoveryCodes ?? '[]') as string[]).length : 0,
      required: authUser.mfaEnrollmentRequired || (await this.isRequired(authUser)),
    };
  }

  private async isRequired(authUser: AuthenticatedUser) {
    const isAdmin = authUser.isSuperAdmin || authUser.roles.includes('ORG_ADMIN');
    return isAdmin && (await this.settings.get(authUser.homeTenantId)).security.requireMfaForAdmins;
  }

  /** Starts enrolment: a new secret is kept pending until the user proves their app produces valid codes. */
  async setup(authUser: AuthenticatedUser) {
    const user = await this.load(authUser.userId);
    if (user.mfaEnabled) throw new ConflictException('Two-factor authentication is already enabled. Disable it first to enrol a new device.');
    const secret = generateTotpSecret();
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaPendingSecret: encryptSecret(secret) } });
    const uri = otpauthUri(secret, user.email, `5S ${user.tenant.name}`.slice(0, 60));
    return { secret, otpauthUri: uri, qrCodeDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) };
  }

  async enable(authUser: AuthenticatedUser, code: string) {
    const user = await this.load(authUser.userId);
    if (user.mfaEnabled) throw new ConflictException('Two-factor authentication is already enabled.');
    if (!user.mfaPendingSecret) throw new BadRequestException('Start the setup first.');
    const secret = decryptSecret(user.mfaPendingSecret);
    const step = verifyTotp(secret, code);
    if (step === null) throw new BadRequestException('That code is not valid. Check the time on your phone and try again.');
    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: true,
        mfaSecret: user.mfaPendingSecret,
        mfaPendingSecret: null,
        mfaLastUsedStep: step,
        mfaEnabledAt: new Date(),
        mfaRecoveryCodes: JSON.stringify(recoveryCodes.map((c) => hashToken(c))),
      },
    });
    return { enabled: true, recoveryCodes, message: 'Store these recovery codes somewhere safe. Each can be used once if you lose your phone.' };
  }

  private async assertCode(user: { id: string; mfaSecret: string | null }, code: string) {
    if (!user.mfaSecret || verifyTotp(decryptSecret(user.mfaSecret), code) === null) {
      throw new BadRequestException('That code is not valid.');
    }
  }

  async disable(authUser: AuthenticatedUser, password: string, code: string) {
    const user = await this.load(authUser.userId);
    if (!user.mfaEnabled) throw new ConflictException('Two-factor authentication is not enabled.');
    if (await this.isRequired(authUser)) {
      throw new ConflictException('Your organization requires administrators to use two-factor authentication.');
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) throw new BadRequestException('Password is incorrect.');
    await this.assertCode(user, code);
    await this.clear(user.id);
    return { enabled: false };
  }

  async regenerateRecoveryCodes(authUser: AuthenticatedUser, code: string) {
    const user = await this.load(authUser.userId);
    if (!user.mfaEnabled) throw new ConflictException('Two-factor authentication is not enabled.');
    await this.assertCode(user, code);
    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaRecoveryCodes: JSON.stringify(recoveryCodes.map((c) => hashToken(c))) } });
    return { recoveryCodes };
  }

  /** Administrator reset for a user who lost their device: MFA is removed and every session ends. */
  async adminReset(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } });
    if (!user) throw new NotFoundException(`User '${userId}' not found`);
    await this.clear(user.id);
    const revoked = await this.sessions.revokeAll(user.id, 'MFA_RESET_BY_ADMIN');
    return { mfaEnabled: false, sessionsRevoked: revoked };
  }

  private clear(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaPendingSecret: null, mfaRecoveryCodes: null, mfaLastUsedStep: null, mfaEnabledAt: null },
    });
  }
}
