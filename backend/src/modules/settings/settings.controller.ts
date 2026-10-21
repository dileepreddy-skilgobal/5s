import { BadRequestException, Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantSettingsService } from '../../core/config/tenant-settings.service';
import { DEFAULT_TENANT_SETTINGS, isValidTimeZone } from '../../core/config/tenant-settings';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { CurrentUserId, TenantId } from '../../core/auth/current-user.decorator';
import { PrismaService } from '../../core/database/prisma.service';
import { FilesService } from '../../core/storage/files.service';
import { resolveTenantLogo } from '../tenants/tenant-logo';
import { SetLogoDto, UpdateSettingsDto } from './dto/settings.dto';

@ApiTags('Organization Settings')
@ApiBearerAuth()
@Controller('api/v1/settings')
export class SettingsController {
  constructor(
    private readonly settings: TenantSettingsService,
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Effective configuration of the current organization (defaults merged with overrides)' })
  get(@TenantId() tenantId: string) {
    return this.settings.getWithHierarchy(tenantId);
  }

  @Get('defaults')
  @ApiOperation({ summary: 'Platform default configuration, for "reset to default" in the settings UI' })
  defaults() {
    return DEFAULT_TENANT_SETTINGS;
  }

  @Patch()
  @Roles(...RoleGroups.ORG_ADMINS)
  @ApiOperation({ summary: 'Update organization configuration (scoring, SLA, escalation, numbering, terminology, competency, analytics, CAPA, recognition, hierarchy)' })
  async update(@TenantId() tenantId: string, @Body() dto: UpdateSettingsDto) {
    // Cross-field rules the DTO cannot express
    if (dto.analytics?.maturityBands && !dto.analytics.maturityBands.some((b) => b.minScore === 0)) {
      throw new BadRequestException('Maturity bands must include a band starting at 0 so every score has a level.');
    }
    if (dto.analytics?.maturityBands) {
      const levels = dto.analytics.maturityBands.map((b) => b.level);
      if (new Set(levels).size !== levels.length) throw new BadRequestException('Maturity band levels must be unique.');
    }
    if (dto.analytics?.certificationRules) {
      const names = dto.analytics.certificationRules.map((r) => r.name);
      if (new Set(names).size !== names.length) throw new BadRequestException('Each certification level may be defined only once.');
    }
    if (dto.escalation?.actionSteps) {
      const offsets = dto.escalation.actionSteps.map((s) => s.offsetDays);
      if (new Set(offsets).size !== offsets.length) throw new BadRequestException('Escalation steps must have distinct day offsets.');
      dto.escalation.actionSteps.sort((a, b) => a.offsetDays - b.offsetDays);
    }
    if (dto.escalation?.timeZone !== undefined && !isValidTimeZone(dto.escalation.timeZone)) {
      throw new BadRequestException(`Unknown time zone '${dto.escalation.timeZone}'. Use an IANA name such as Asia/Kolkata or Europe/London.`);
    }
    if (dto.numbering) {
      const prefixes = Object.values({ ...(await this.settings.get(tenantId)).numbering, ...dto.numbering });
      if (new Set(prefixes).size !== prefixes.length) throw new BadRequestException('Document number prefixes must be distinct.');
    }
    return this.settings.update(tenantId, { ...dto });
  }

  @Put('logo')
  @Roles(...RoleGroups.ORG_ADMINS)
  @ApiOperation({ summary: 'Set or remove the organization logo (image up to 2 MB, kept in file storage)' })
  async updateLogo(@TenantId() tenantId: string, @CurrentUserId() userId: string, @Body() dto: SetLogoDto) {
    // MediaIngestInterceptor has already moved an inline upload into file storage; only the reference is kept
    const logoUrl = await resolveTenantLogo(this.prisma, this.files, { callerTenantId: tenantId, targetTenantId: tenantId, uploadedById: userId, value: dto.logo ?? null });
    const tenant = await this.prisma.tenant.update({ where: { id: tenantId }, data: { logoUrl: logoUrl ?? null }, select: { logoUrl: true } });
    return { logoUrl: tenant.logoUrl };
  }
}
