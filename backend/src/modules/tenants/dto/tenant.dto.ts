import { IsString, IsNotEmpty, IsOptional, IsInt, IsArray, IsIn, IsBoolean, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { values } from '../../../core/validation/domain-values';

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
  @Min(100)
  @Max(10000000)
  @IsOptional()
  storageQuotaMb?: number;
}

export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'SkilGlobal Manufacturing Corp' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Manufacturing' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @IsOptional()
  industry?: string;

  /** Only suspend / reactivate transitions are accepted here (see PATCH /tenants/:id/status). */
  @ApiPropertyOptional({ example: 'SUSPENDED', enum: values('TENANT_STATUSES') })
  @IsString()
  @IsOptional()
  @IsIn(values('TENANT_STATUSES'))
  status?: string;

  @ApiPropertyOptional({ description: 'A stored file reference or image upload (data URL); empty string removes the logo', example: '/api/v1/files/<id>' })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 10240 })
  @IsInt()
  @Min(100)
  @Max(10000000)
  @IsOptional()
  storageQuotaMb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  hierarchyConfig?: string;

  @ApiPropertyOptional()
  @IsOptional()
  settings?: string;
}

/**
 * PATCH /tenants/:id/status — SUSPENDED suspends an ACTIVE or TRIAL organization; ACTIVE or TRIAL reactivates
 * a suspended one, restoring the status it had before it was suspended.
 */
export class UpdateTenantStatusDto {
  @ApiProperty({ example: 'SUSPENDED', enum: values('TENANT_STATUSES') })
  @IsString()
  @IsIn(values('TENANT_STATUSES'))
  status: string;
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
  @IsString({ each: true })
  @IsOptional()
  sites?: string[];

  @ApiPropertyOptional({ example: ['Machining', 'Assembly', 'Quality Lab', 'Raw Material Store'] })
  @IsArray()
  @IsString({ each: true })
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

  @ApiPropertyOptional({ example: true, description: 'Create a starter 6S audit checklist (1S–6S, two questions each) as a published template' })
  @IsBoolean()
  @IsOptional()
  starterTemplate?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Create starter workplace standards (walkways, cleaning, emergency access) as drafts for review' })
  @IsBoolean()
  @IsOptional()
  starterStandards?: boolean;
}

