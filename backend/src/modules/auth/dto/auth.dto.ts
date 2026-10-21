import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEmail, IsOptional, IsBoolean, Matches, MaxLength, ValidateIf } from 'class-validator';
import { PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_REGEX } from '../../../core/auth/credentials';

export class LoginDto {
  @ApiProperty({ example: 'admin@skilglobal.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Admin@123456' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({ example: 'skilglobal-mfg' })
  @IsString()
  @IsOptional()
  tenantSlug?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;
}

export class SsoLoginDto {
  @ApiProperty({ example: 'MICROSOFT_AZURE_AD', enum: ['MICROSOFT_AZURE_AD', 'GOOGLE_WORKSPACE', 'OKTA_SAML'] })
  @IsString()
  @IsNotEmpty()
  provider: string;

  @ApiPropertyOptional({ example: 'skilglobal-mfg' })
  @IsString()
  @IsOptional()
  tenantSlug?: string;

  @ApiPropertyOptional({ example: 'sso_auth_token_mock_payload' })
  @IsString()
  @IsOptional()
  ssoToken?: string;
}

export class PinLoginDto {
  @ApiProperty({ example: '5544', description: '4–8 digit operator PIN' })
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'PIN must be 4 to 8 digits' })
  pin: string;

  @ApiProperty({ example: 'BADGE-OP-049' })
  @IsString()
  @IsNotEmpty()
  badgeId: string;

  @ApiPropertyOptional({ example: 'LOC-BLR-MACH-CNC01' })
  @IsString()
  @IsOptional()
  workstationCode?: string;

  @ApiPropertyOptional({ example: 'skilglobal-mfg' })
  @IsString()
  @IsOptional()
  tenantSlug?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@skilglobal.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ example: 'skilglobal-mfg' })
  @IsString()
  @IsOptional()
  tenantSlug?: string;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ example: 'hi', nullable: true, description: 'UI language; null = organization default' })
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^[a-z]{2,3}(-[A-Z]{2})?$/, { message: 'locale must be a language code like en or hi-IN' })
  locale: string | null;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token from the emailed reset link' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;

  @ApiProperty({ example: 'N3w-Secure!Pass' })
  @IsString()
  @Matches(PASSWORD_POLICY_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  newPassword: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'N3w-Secure!Pass' })
  @IsString()
  @Matches(PASSWORD_POLICY_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  newPassword: string;
}

/** Second sign-in step: an authenticator code or, failing that, a one-time recovery code. */
export class MfaVerifyDto {
  @ApiProperty({ description: 'mfaToken returned by /auth/login when mfaRequired is true' })
  @IsString()
  @IsNotEmpty()
  mfaToken: string;

  @ApiPropertyOptional({ example: '123456' })
  @ValidateIf((o: MfaVerifyDto) => !o.recoveryCode)
  @Matches(/^\d{6}$/, { message: 'code must be the 6-digit number from your authenticator app' })
  code?: string;

  @ApiPropertyOptional({ example: 'A1B2C-3D4E5' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  recoveryCode?: string;
}

export class MfaCodeDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'code must be the 6-digit number from your authenticator app' })
  code: string;
}

export class MfaDisableDto extends MfaCodeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;
}
