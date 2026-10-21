import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { CurrentUserId, TenantId } from '../../core/auth/current-user.decorator';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateTenantDto, OnboardingWizardDto, UpdateTenantStatusDto } from './dto/tenant.dto';

import { Roles } from '../../core/guards/roles.decorator';

@ApiTags('Tenants & Super Admin')
@ApiBearerAuth()
@Roles('SUPER_ADMIN')
@Controller('api/v1/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new tenant organization' })
  createTenant(@Body() dto: CreateTenantDto, @CurrentUserId() userId: string, @TenantId() tenantId: string) {
    return this.tenantsService.createTenant(dto, { userId, tenantId });
  }

  @Get()
  @ApiOperation({ summary: 'List all tenants (Super Admin console)' })
  getAllTenants() {
    return this.tenantsService.getAllTenants();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant details by ID' })
  getTenantById(@Param('id') id: string) {
    return this.tenantsService.getTenantById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update tenant organization settings' })
  updateTenant(@Param('id') id: string, @Body() dto: UpdateTenantDto, @CurrentUserId() userId: string, @TenantId() tenantId: string) {
    return this.tenantsService.updateTenant(id, dto, { userId, tenantId });
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Suspend an ACTIVE / TRIAL organization, or reactivate a suspended one to its previous status' })
  toggleStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto, @CurrentUserId() userId: string) {
    return this.tenantsService.toggleStatus(id, dto.status, userId);
  }

  @Post('onboard')
  @ApiOperation({ summary: 'Guided Onboarding Wizard for instant tenant bootstrapping' })
  executeOnboarding(@Body() dto: OnboardingWizardDto, @CurrentUserId() userId: string, @TenantId() tenantId: string) {
    return this.tenantsService.executeOnboarding(dto, { userId, tenantId });
  }
}

