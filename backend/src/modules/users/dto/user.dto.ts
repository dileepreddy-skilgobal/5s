import { IsString, IsNotEmpty, IsOptional, IsEmail, IsIn, IsISO8601, Matches } from 'class-validator';
import { values } from '../../../core/validation/domain-values';
import {
  PASSWORD_POLICY_REGEX,
  PASSWORD_POLICY_MESSAGE,
  PIN_POLICY_REGEX,
  PIN_POLICY_MESSAGE,
} from '../../../core/auth/credentials';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'john.smith@skilglobal.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Smith' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional({ example: 'Assembly Line Supervisor' })
  @IsString()
  @IsOptional()
  jobTitle?: string;

  @ApiPropertyOptional({ example: 'Production' })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiPropertyOptional({ example: '+91 9876543210' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'AREA_OWNER' })
  @IsString()
  @IsOptional()
  roleCode?: string;

  @ApiPropertyOptional({ example: 'org-node-uuid', description: 'Limits the initial role to this organization unit and everything under it' })
  @IsString()
  @IsOptional()
  orgNodeId?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Initial role expires after this date (required for EXTERNAL_AUDITOR)' })
  @IsISO8601()
  @IsOptional()
  roleValidUntil?: string;

  @ApiPropertyOptional({ description: 'Initial password. If omitted, a one-time temporary password is generated and returned once.' })
  @IsString()
  @IsOptional()
  @Matches(PASSWORD_POLICY_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  password?: string;

  @ApiPropertyOptional({ example: 'BADGE-OP-049', description: 'Shop-floor badge used for PIN sign-in' })
  @IsString()
  @IsOptional()
  badgeId?: string;

  @ApiPropertyOptional({ example: '5544', description: '4–8 digit operator PIN (requires badgeId)' })
  @IsString()
  @IsOptional()
  @Matches(PIN_POLICY_REGEX, { message: PIN_POLICY_MESSAGE })
  pin?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  jobTitle?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  department?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ enum: values('USER_STATUSES') })
  @IsString()
  @IsOptional()
  @IsIn(values('USER_STATUSES'))
  status?: string;

  @ApiPropertyOptional({ description: 'New password (administrator reset)' })
  @IsString()
  @IsOptional()
  @Matches(PASSWORD_POLICY_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  password?: string;

  @ApiPropertyOptional({ example: 'BADGE-OP-049', description: 'Shop-floor badge used for PIN sign-in' })
  @IsString()
  @IsOptional()
  badgeId?: string;

  @ApiPropertyOptional({ example: '5544', description: '4–8 digit operator PIN (requires badgeId)' })
  @IsString()
  @IsOptional()
  @Matches(PIN_POLICY_REGEX, { message: PIN_POLICY_MESSAGE })
  pin?: string;
}

export class AssignRoleDto {
  @ApiProperty({ example: 'role-uuid' })
  @IsString()
  @IsNotEmpty()
  roleId: string;

  @ApiPropertyOptional({ example: 'org-node-uuid', description: 'Limits the role to this organization unit and everything under it' })
  @IsString()
  @IsOptional()
  orgNodeId?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'The assignment is ignored after this date (required for EXTERNAL_AUDITOR)' })
  @IsISO8601()
  @IsOptional()
  validUntil?: string;
}

/** POST /users/:id/reset-pin - sets a new operator PIN (the user must have a badge ID). */
export class ResetPinDto {
  @ApiProperty({ example: '5544', description: '4–8 digit operator PIN' })
  @IsString()
  @Matches(PIN_POLICY_REGEX, { message: PIN_POLICY_MESSAGE })
  pin: string;
}

/** GET /users filters; all optional. */
export class UserListQueryDto {
  @ApiPropertyOptional({ description: 'Matches name, email, job title, department or badge ID' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ example: 'AUDITOR', description: 'Role code the user holds' })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiPropertyOptional({ enum: values('USER_STATUSES') })
  @IsString()
  @IsOptional()
  @IsIn(values('USER_STATUSES'))
  status?: string;
}

