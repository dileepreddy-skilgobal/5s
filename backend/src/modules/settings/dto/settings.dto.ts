import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { values } from '../../../core/validation/domain-values';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const RECIPIENTS = ['ASSIGNEE', 'AREA_OWNER', 'BACKUP_OWNER', 'AUDITOR', 'COORDINATOR_5S', 'DEPT_HEAD', 'PLANT_HEAD', 'ORG_ADMIN'];

export class MaturityBandDto {
  @IsInt() @Min(1) @Max(10) level: number;
  @IsString() @MinLength(1) @MaxLength(60) name: string;
  @IsString() @MaxLength(200) description: string;
  @IsNumber() @Min(0) @Max(100) minScore: number;
  @Matches(HEX_COLOR) color: string;
}

export class CertificationRuleDto {
  @IsIn(['PLATINUM', 'GOLD', 'SILVER', 'BRONZE']) name: 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE';
  @IsNumber() @Min(0) @Max(100) minAverageScore: number;
  @ValidateIf((_o, v) => v !== null) @IsNumber() @Min(0) @Max(100) maxRepeatRate: number | null;
  @ValidateIf((_o, v) => v !== null) @IsNumber() @Min(0) @Max(100) minOnTimeClosure: number | null;
  @ValidateIf((_o, v) => v !== null) @IsNumber() @Min(0) @Max(100) minAdherence: number | null;
  @IsInt() @Min(1) @Max(20) sustainedAudits: number;
}

export class AnalyticsSettingsDto {
  @IsOptional() @IsNumber() @Min(0) @Max(100) targetScore?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) passScore?: number;
  @IsOptional() @IsInt() @Min(1) @Max(730) repeatLookbackDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(36) certificationWindowMonths?: number;

  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(10)
  @ValidateNested({ each: true }) @Type(() => MaturityBandDto)
  maturityBands?: MaturityBandDto[];

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4)
  @ValidateNested({ each: true }) @Type(() => CertificationRuleDto)
  certificationRules?: CertificationRuleDto[];
}

export class ScoringSettingsDto {
  @IsOptional() @IsIn(['POOLED', 'PILLAR_WEIGHTED']) method?: 'POOLED' | 'PILLAR_WEIGHTED';
  @IsOptional() @IsNumber() @Min(0) @Max(100) criticalFailCap?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(100) findingThresholdPercent?: number;
}

export class SeverityHoursDto {
  @IsOptional() @IsInt() @Min(1) @Max(8760) CRITICAL?: number;
  @IsOptional() @IsInt() @Min(1) @Max(8760) MAJOR?: number;
  @IsOptional() @IsInt() @Min(1) @Max(8760) MODERATE?: number;
  @IsOptional() @IsInt() @Min(1) @Max(8760) MINOR?: number;
  @IsOptional() @IsInt() @Min(1) @Max(8760) KAIZEN_OPPORTUNITY?: number;
}

export class SlaSettingsDto {
  @ValidateNested() @Type(() => SeverityHoursDto) hoursBySeverity: SeverityHoursDto;
}

export class EscalationStepDto {
  @IsInt() @Min(-30) @Max(90) offsetDays: number;
  @IsArray() @ArrayMinSize(1) @IsIn(RECIPIENTS, { each: true }) notify: string[];
}

export class EscalationSettingsDto {
  @IsOptional() @IsArray() @ArrayMaxSize(10)
  @ValidateNested({ each: true }) @Type(() => EscalationStepDto)
  actionSteps?: EscalationStepDto[];

  @IsOptional() @IsArray() @IsIn(RECIPIENTS, { each: true }) overdueAuditNotify?: string[];
  @IsOptional() @IsBoolean() dailyDigest?: boolean;
  @IsOptional() @IsBoolean() managerDigest?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 23, description: 'Local hour from which the daily digests are sent' })
  @IsOptional() @IsInt() @Min(0) @Max(23) digestHour?: number;

  /** IANA zone; checked against the runtime's zone database by the controller. */
  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) @Matches(/^[A-Za-z][A-Za-z0-9_+\-\/]*$/, { message: 'timeZone must be an IANA time zone like Asia/Kolkata' })
  timeZone?: string;
}

const PREFIX = /^[A-Z][A-Z0-9]{1,9}$/;
const PREFIX_MESSAGE = 'Prefixes are 2–10 upper-case letters or digits, starting with a letter';

export class NumberingSettingsDto {
  @IsOptional() @Matches(PREFIX, { message: PREFIX_MESSAGE }) audit?: string;
  @IsOptional() @Matches(PREFIX, { message: PREFIX_MESSAGE }) scheduledAudit?: string;
  @IsOptional() @Matches(PREFIX, { message: PREFIX_MESSAGE }) observation?: string;
  @IsOptional() @Matches(PREFIX, { message: PREFIX_MESSAGE }) action?: string;
  @IsOptional() @Matches(PREFIX, { message: PREFIX_MESSAGE }) redTag?: string;
}

export class TerminologyDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) location?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) observation?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) correctiveAction?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) redTag?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) audit?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) auditor?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) areaOwner?: string;
}

export class SignatoryDto {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsString() @MinLength(1) @MaxLength(80) title: string;
}

export class CompetencySettingsDto {
  @IsOptional() @IsBoolean() requireCertifiedAuditors?: boolean;
  @IsOptional() @IsInt() @Min(50) @Max(100) quizPassPercent?: number;
  @IsOptional() @IsInt() @Min(1) @Max(60) certificateValidityMonths?: number;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) certificateTitle?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(3)
  @ValidateNested({ each: true }) @Type(() => SignatoryDto)
  signatories?: SignatoryDto[];
}

export class SecuritySettingsDto {
  @IsOptional() @IsBoolean() requireMfaForAdmins?: boolean;
}

export class CapaSettingsDto {
  @IsOptional() @IsBoolean() allowClosureWithoutPhoto?: boolean;
}

export class GamificationSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() showIndividualLeaderboard?: boolean;
}

/** PATCH /settings — every section is optional; supplied keys replace the stored values. */
export class UpdateSettingsDto {
  /** Kept for API compatibility; not used by any screen or document. */
  @ApiPropertyOptional({ example: '#1E3A8A', deprecated: true })
  @IsOptional() @Matches(HEX_COLOR, { message: 'brandColor must be a hex colour like #1E3A8A' })
  brandColor?: string;

  @ApiPropertyOptional({ example: 'en', description: 'Default UI language (BCP 47)' })
  @IsOptional() @Matches(/^[a-z]{2,3}(-[A-Z]{2})?$/, { message: 'defaultLocale must be a language code like en or hi-IN' })
  defaultLocale?: string;

  @ApiPropertyOptional({ enum: values('AUDIT_FREQUENCIES') })
  @IsOptional() @IsIn(values('AUDIT_FREQUENCIES'))
  defaultAuditFrequency?: string;

  @ApiPropertyOptional({ example: ['Organization', 'Plant', 'Department', 'Area'] })
  @IsOptional() @IsArray() @ArrayMinSize(2) @ArrayMaxSize(8)
  @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(30, { each: true })
  hierarchyLevels?: string[];

  @IsOptional() @ValidateNested() @Type(() => AnalyticsSettingsDto) analytics?: AnalyticsSettingsDto;
  @IsOptional() @ValidateNested() @Type(() => ScoringSettingsDto) scoring?: ScoringSettingsDto;
  @IsOptional() @ValidateNested() @Type(() => SlaSettingsDto) sla?: SlaSettingsDto;
  @IsOptional() @ValidateNested() @Type(() => EscalationSettingsDto) escalation?: EscalationSettingsDto;
  @IsOptional() @ValidateNested() @Type(() => NumberingSettingsDto) numbering?: NumberingSettingsDto;
  @IsOptional() @ValidateNested() @Type(() => TerminologyDto) terminology?: TerminologyDto;
  @IsOptional() @ValidateNested() @Type(() => CompetencySettingsDto) competency?: CompetencySettingsDto;
  @IsOptional() @ValidateNested() @Type(() => SecuritySettingsDto) security?: SecuritySettingsDto;
  @IsOptional() @ValidateNested() @Type(() => CapaSettingsDto) capa?: CapaSettingsDto;
  @IsOptional() @ValidateNested() @Type(() => GamificationSettingsDto) gamification?: GamificationSettingsDto;
}

/** PUT /settings/logo — the organization logo as an image upload (data URL) or null to remove it. */
export class SetLogoDto {
  @ApiPropertyOptional({ nullable: true, description: 'data:image/png;base64,… (stored as a file), a stored /api/v1/files/<id> reference, or null to remove the logo' })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(2048)
  logo: string | null;
}
