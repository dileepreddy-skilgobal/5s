import { IsString, IsNotEmpty, IsOptional, IsEmail, IsBoolean, IsArray } from 'class-validator';
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

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'INVITED'] })
  @IsString()
  @IsOptional()
  status?: string;
}

export class AssignRoleDto {
  @ApiProperty({ example: 'role-uuid' })
  @IsString()
  @IsNotEmpty()
  roleId: string;

  @ApiPropertyOptional({ example: 'org-node-uuid' })
  @IsString()
  @IsOptional()
  orgNodeId?: string;
}

export class UpdatePermissionDto {
  @ApiProperty({ example: 'LOCATIONS' })
  @IsString()
  @IsNotEmpty()
  module: string;

  @ApiProperty({ example: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT'] })
  @IsArray()
  actions: string[];

  @ApiPropertyOptional({ example: 'TENANT' })
  @IsString()
  @IsOptional()
  scope?: string;
}
