import { IsString, IsNotEmpty, IsOptional, IsInt, IsArray, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({ example: 'SkilGlobal Manufacturing Ltd' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'skilglobal-mfg' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiPropertyOptional({ example: 'Manufacturing' })
  @IsString()
  @IsOptional()
  industry?: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 5120 })
  @IsInt()
  @IsOptional()
  storageQuotaMb?: number;
}

export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'SkilGlobal Manufacturing Corp' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'ACTIVE', enum: ['ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED'] })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: 'https://example.com/new-logo.png' })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 10240 })
  @IsInt()
  @IsOptional()
  storageQuotaMb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  hierarchyConfig?: string;

  @ApiPropertyOptional()
  @IsOptional()
  settings?: string;
}

export class OnboardingWizardDto {
  @ApiProperty({ example: 'Apex Aerospace Components' })
  @IsString()
  @IsNotEmpty()
  orgName: string;

  @ApiProperty({ example: 'apex-aerospace' })
  @IsString()
  @IsNotEmpty()
  orgSlug: string;

  @ApiPropertyOptional({ example: 'Aerospace & Defence' })
  @IsString()
  @IsOptional()
  industry?: string;

  @ApiPropertyOptional({ example: 'DISCRETE_MANUFACTURING' })
  @IsString()
  @IsOptional()
  presetHierarchy?: string;

  @ApiPropertyOptional({ example: ['Plant 1 (Bangalore)', 'Plant 2 (Hosur)'] })
  @IsArray()
  @IsOptional()
  sites?: string[];

  @ApiPropertyOptional({ example: ['Machining', 'Assembly', 'Quality Lab', 'Raw Material Store'] })
  @IsArray()
  @IsOptional()
  departments?: string[];

  @ApiPropertyOptional({ example: 'admin@apexaero.com' })
  @IsString()
  @IsOptional()
  adminEmail?: string;

  @ApiPropertyOptional({ example: 'Apex Admin' })
  @IsString()
  @IsOptional()
  adminName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsString()
  @IsOptional()
  logoUrl?: string;
}

