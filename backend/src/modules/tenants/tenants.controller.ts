import { Controller, Get, Post, Patch, Param, Body, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateTenantDto, OnboardingWizardDto } from './dto/tenant.dto';

import { Roles } from '../../core/guards/roles.decorator';

@ApiTags('Tenants & Super Admin')
@Roles('SUPER_ADMIN')
@Controller('api/v1/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new tenant organization' })
  createTenant(@Body() dto: CreateTenantDto, @Headers('x-user-id') userId?: string) {
    return this.tenantsService.createTenant(dto, userId);
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
  updateTenant(@Param('id') id: string, @Body() dto: UpdateTenantDto, @Headers('x-user-id') userId?: string) {
    return this.tenantsService.updateTenant(id, dto, userId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Toggle tenant status (ACTIVE / SUSPENDED / TRIAL)' })
  toggleStatus(@Param('id') id: string, @Body('status') status: string, @Headers('x-user-id') userId?: string) {
    return this.tenantsService.toggleStatus(id, status, userId);
  }

  @Post('onboard')
  @ApiOperation({ summary: 'Guided Onboarding Wizard for instant tenant bootstrapping' })
  executeOnboarding(@Body() dto: OnboardingWizardDto, @Headers('x-user-id') userId?: string) {
    return this.tenantsService.executeOnboarding(dto, userId);
  }
}

