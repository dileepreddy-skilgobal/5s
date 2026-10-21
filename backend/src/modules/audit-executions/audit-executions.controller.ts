import { Controller, Get, Post, Body, Param, Query, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantId, CurrentUserId, CurrentUser } from '../../core/auth/current-user.decorator';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
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
@ApiBearerAuth()
@Controller('api/v1/audit-executions')
export class AuditExecutionsController {
  constructor(private readonly auditExecutionsService: AuditExecutionsService) {}

  @Get()
  @ApiOperation({ summary: 'List audit executions' })
  async list(
    @TenantId() tenantId: string,
    @Query('locationId') locationId?: string,
    @Query('status') status?: string,
    @Query('auditorId') auditorId?: string,
    @Query('disputeStatus') disputeStatus?: string,
    @Query('auditType') auditType?: string,
  ) {
    return this.auditExecutionsService.listExecutions(tenantId, { locationId, status, auditorId, disputeStatus, auditType });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get execution details with full checklist answers' })
  async getById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.auditExecutionsService.getExecutionById(tenantId, id);
  }

  @Get(':id/report')
  @ApiOperation({ summary: 'Get complete formal audit report for printing & dual sign-off' })
  async getReport(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.auditExecutionsService.getAuditReport(tenantId, id);
  }

  @Post('start')
  @Roles(...RoleGroups.SELF_AUDITORS)
  @ApiOperation({ summary: 'Start (or resume) an audit: scheduled, ad-hoc or surprise; area owners may only self-audit areas they own' })
  async start(@TenantId() tenantId: string, @CurrentUser() actor: AuthenticatedUser, @Body() dto: StartExecutionDto) {
    return this.auditExecutionsService.startExecution(tenantId, actor, dto);
  }

  @Post(':id/draft')
  // Only the conducting auditor (or a programme manager) may change answers; area owners reach this for their self-audits
  @Roles(...RoleGroups.SELF_AUDITORS)
  @ApiOperation({ summary: 'Save audit draft answers' })
  async saveDraft(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveDraftDto,
  ) {
    return this.auditExecutionsService.saveDraft(tenantId, id, dto, actor);
  }

  @Post(':id/score-preview')
  @HttpCode(HttpStatus.OK)
  @Roles(...RoleGroups.SELF_AUDITORS)
  @ApiOperation({ summary: 'Score the given answers exactly as submission would (score, pillars, pass/fail, cap, findings); saves nothing' })
  async scorePreview(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveDraftDto,
  ) {
    return this.auditExecutionsService.previewScore(tenantId, id, dto, actor);
  }

  @Post(':id/submit')
  @Roles(...RoleGroups.SELF_AUDITORS)
  @ApiOperation({ summary: 'Submit audit, calculate final scores and auto-create CAPA actions' })
  async submit(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitAuditDto,
  ) {
    return this.auditExecutionsService.submitAudit(tenantId, id, dto, actor);
  }

  @Post(':id/acknowledge')
  @Roles(...RoleGroups.AUDITEES)
  @ApiOperation({ summary: 'Area Owner formal acknowledgement & digital sign-off on audit findings' })
  async acknowledge(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AcknowledgeAuditDto,
  ) {
    return this.auditExecutionsService.acknowledgeAudit(tenantId, id, dto, actor);
  }

  @Post(':id/dispute')
  @Roles(...RoleGroups.AUDITEES)
  @ApiOperation({ summary: 'Area Owner raises formal dispute on audit findings with counter-evidence' })
  async dispute(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DisputeAuditDto,
  ) {
    return this.auditExecutionsService.disputeAudit(tenantId, id, dto, actor);
  }

  @Post(':id/resolve-dispute')
  @Roles(...RoleGroups.DISPUTE_RESOLVERS)
  @ApiOperation({ summary: '5S Program Lead / Lead Auditor formal ruling on audit dispute' })
  async resolveDispute(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.auditExecutionsService.resolveDispute(tenantId, id, dto, actor);
  }

  @Delete(':id')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Delete audit execution' })
  async delete(@TenantId() tenantId: string, @CurrentUserId() actorId: string, @Param('id') id: string) {
    return this.auditExecutionsService.deleteExecution(tenantId, id, actorId);
  }
}
