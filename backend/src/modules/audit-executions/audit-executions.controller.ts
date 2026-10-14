import { Controller, Get, Post, Body, Param, Query, Delete, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuditExecutionsService } from './audit-executions.service';
import {
  StartExecutionDto,
  SaveDraftDto,
  SubmitAuditDto,
  AcknowledgeAuditDto,
  DisputeAuditDto,
  ResolveDisputeDto,
} from './dto/audit-execution.dto';

@ApiTags('Audit Executions')
@Controller('api/v1/audit-executions')
export class AuditExecutionsController {
  constructor(private readonly auditExecutionsService: AuditExecutionsService) {}

  private extractTenantId(tenantHeader?: string): string {
    return tenantHeader || 'default-tenant-skilglobal';
  }

  @Get()
  @ApiOperation({ summary: 'List audit executions' })
  async list(
    @Headers('x-tenant-id') tenantId: string,
    @Query('locationId') locationId?: string,
    @Query('status') status?: string,
    @Query('auditorId') auditorId?: string,
  ) {
    return this.auditExecutionsService.listExecutions(this.extractTenantId(tenantId), { locationId, status, auditorId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get execution details with full checklist answers' })
  async getById(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.auditExecutionsService.getExecutionById(this.extractTenantId(tenantId), id);
  }

  @Get(':id/report')
  @ApiOperation({ summary: 'Get complete formal audit report for printing & dual sign-off' })
  async getReport(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.auditExecutionsService.getAuditReport(this.extractTenantId(tenantId), id);
  }

  @Post('start')
  @ApiOperation({ summary: 'Start a new audit execution session' })
  async start(@Headers('x-tenant-id') tenantId: string, @Body() dto: StartExecutionDto) {
    return this.auditExecutionsService.startExecution(this.extractTenantId(tenantId), null, dto);
  }

  @Post(':id/draft')
  @ApiOperation({ summary: 'Save audit draft answers' })
  async saveDraft(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: SaveDraftDto,
  ) {
    return this.auditExecutionsService.saveDraft(this.extractTenantId(tenantId), id, dto);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit audit, calculate final scores and auto-create CAPA actions' })
  async submit(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: SubmitAuditDto,
  ) {
    return this.auditExecutionsService.submitAudit(this.extractTenantId(tenantId), id, dto);
  }

  @Post(':id/acknowledge')
  @ApiOperation({ summary: 'Area Owner formal acknowledgement & digital sign-off on audit findings' })
  async acknowledge(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: AcknowledgeAuditDto,
  ) {
    return this.auditExecutionsService.acknowledgeAudit(this.extractTenantId(tenantId), id, dto);
  }

  @Post(':id/dispute')
  @ApiOperation({ summary: 'Area Owner raises formal dispute on audit findings with counter-evidence' })
  async dispute(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: DisputeAuditDto,
  ) {
    return this.auditExecutionsService.disputeAudit(this.extractTenantId(tenantId), id, dto);
  }

  @Post(':id/resolve-dispute')
  @ApiOperation({ summary: '5S Program Lead / Lead Auditor formal ruling on audit dispute' })
  async resolveDispute(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.auditExecutionsService.resolveDispute(this.extractTenantId(tenantId), id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete audit execution' })
  async delete(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.auditExecutionsService.deleteExecution(this.extractTenantId(tenantId), id);
  }
}
