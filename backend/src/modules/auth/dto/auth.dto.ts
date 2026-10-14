import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEmail, IsOptional, IsBoolean } from 'class-validator';

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
  @ApiProperty({ example: '5544' })
  @IsString()
  @IsNotEmpty()
  pin: string;

  @ApiPropertyOptional({ example: 'BADGE-OP-049' })
  @IsString()
  @IsOptional()
  badgeId?: string;

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
