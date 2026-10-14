import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CorrectiveActionsService } from './corrective-actions.service';
import { CreateActionDto, UpdateActionDto, Update5WhyDto, SubmitClosureDto, VerifyActionDto } from './dto/corrective-action.dto';

@ApiTags('Corrective & Preventive Actions (CAPA)')
@Controller('api/v1/corrective-actions')
export class CorrectiveActionsController {
  constructor(private readonly correctiveActionsService: CorrectiveActionsService) {}

  private extractTenantId(tenantHeader?: string): string {
    return tenantHeader || 'default-tenant-skilglobal';
  }

  @Get()
  @ApiOperation({ summary: 'List CAPA actions with SLA urgency filter' })
  async list(
    @Headers('x-tenant-id') tenantId: string,
    @Query('status') status?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('locationId') locationId?: string,
    @Query('isOverdue') isOverdue?: string,
    @Query('escalationTier') escalationTier?: string,
    @Query('search') search?: string,
  ) {
    return this.correctiveActionsService.listActions(this.extractTenantId(tenantId), {
      status,
      assigneeId,
      locationId,
      isOverdue,
      escalationTier,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CAPA details with 5-Why analysis and immutable history log' })
  async getById(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.correctiveActionsService.getActionById(this.extractTenantId(tenantId), id);
  }

  @Post()
  @ApiOperation({ summary: 'Create manual CAPA action' })
  async create(@Headers('x-tenant-id') tenantId: string, @Body() dto: CreateActionDto) {
    return this.correctiveActionsService.createAction(this.extractTenantId(tenantId), null, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update CAPA action' })
  async update(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateActionDto,
  ) {
    return this.correctiveActionsService.updateAction(this.extractTenantId(tenantId), id, dto);
  }

  @Patch(':id/5-why')
  @ApiOperation({ summary: 'Update 5-Why root cause analysis' })
  async update5Why(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: Update5WhyDto,
  ) {
    return this.correctiveActionsService.update5Why(this.extractTenantId(tenantId), id, dto);
  }

  @Post(':id/submit-closure')
  @ApiOperation({ summary: 'Submit closure evidence (After photo & notes) for verification' })
  async submitClosure(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: SubmitClosureDto,
  ) {
    return this.correctiveActionsService.submitClosure(this.extractTenantId(tenantId), id, null, dto);
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Independent verification sign-off (Approve or Reject & Reopen)' })
  async verify(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: VerifyActionDto,
  ) {
    return this.correctiveActionsService.verifyAction(this.extractTenantId(tenantId), id, null, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete CAPA action' })
  async delete(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.correctiveActionsService.deleteAction(this.extractTenantId(tenantId), id);
  }
}
