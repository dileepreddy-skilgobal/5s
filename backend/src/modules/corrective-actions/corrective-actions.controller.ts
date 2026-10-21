import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantId, CurrentUserId, CurrentUser } from '../../core/auth/current-user.decorator';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { CorrectiveActionsService } from './corrective-actions.service';
import {
  CreateActionDto,
  UpdateActionDto,
  Update5WhyDto,
  SubmitClosureDto,
  VerifyActionDto,
  CloseActionDto,
  ReassignActionDto,
  ChangeDueDateDto,
} from './dto/corrective-action.dto';

@ApiTags('Corrective & Preventive Actions (CAPA)')
@ApiBearerAuth()
@Controller('api/v1/corrective-actions')
export class CorrectiveActionsController {
  constructor(private readonly correctiveActionsService: CorrectiveActionsService) {}

  @Get()
  @ApiOperation({ summary: 'List CAPA actions (assigneeId=me for your own); each row carries the allowedActions of the caller' })
  async list(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('locationId') locationId?: string,
    @Query('isOverdue') isOverdue?: string,
    @Query('escalationTier') escalationTier?: string,
    @Query('search') search?: string,
    @Query('severity') severity?: string,
    @Query('source') source?: string,
  ) {
    return this.correctiveActionsService.listActions(tenantId, actor, {
      status,
      assigneeId,
      locationId,
      isOverdue,
      escalationTier,
      search,
      severity,
      source,
    });
  }

  @Get('closure-policy')
  @ApiOperation({ summary: 'Closure rules of the organization (e.g. whether an action may be closed without an after photo)' })
  async closurePolicy(@TenantId() tenantId: string) {
    return this.correctiveActionsService.getClosurePolicy(tenantId);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'History of the action, oldest first: status changes, reassignments, due-date changes, verification' })
  async timeline(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.correctiveActionsService.getTimeline(tenantId, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CAPA details with 5-Why analysis, history log and the allowedActions of the caller' })
  async getById(@TenantId() tenantId: string, @CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.correctiveActionsService.getActionById(tenantId, id, actor);
  }

  @Post()
  @Roles(...RoleGroups.ACTION_ASSIGNERS)
  @ApiOperation({ summary: 'Raise a CAPA from an observation (observationId), a red tag (redTagId) or standalone (locationId, management review)' })
  async create(@TenantId() tenantId: string, @CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateActionDto) {
    return this.correctiveActionsService.createAction(tenantId, actor, dto);
  }

  @Patch(':id')
  @Roles(...RoleGroups.ACTION_OWNERS)
  @ApiOperation({ summary: 'Update CAPA action' })
  async update(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateActionDto,
  ) {
    return this.correctiveActionsService.updateAction(tenantId, id, dto, actor);
  }

  @Post(':id/reassign')
  @Roles(...RoleGroups.ACTION_ASSIGNERS)
  @ApiOperation({ summary: 'Reassign the action to another user (recorded in its history)' })
  async reassign(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReassignActionDto,
  ) {
    return this.correctiveActionsService.reassignAction(tenantId, id, actor, dto);
  }

  @Post(':id/due-date')
  @Roles(...RoleGroups.ACTION_ASSIGNERS)
  @ApiOperation({ summary: 'Change the due date with a reason (recorded in its history)' })
  async changeDueDate(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeDueDateDto,
  ) {
    return this.correctiveActionsService.changeDueDate(tenantId, id, actor, dto);
  }

  @Patch(':id/5-why')
  @Roles(...RoleGroups.ACTION_OWNERS)
  @ApiOperation({ summary: 'Update 5-Why root cause analysis' })
  async update5Why(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: Update5WhyDto,
  ) {
    return this.correctiveActionsService.update5Why(tenantId, id, dto, actor);
  }

  @Post(':id/submit-closure')
  @Roles(...RoleGroups.ACTION_OWNERS)
  @ApiOperation({ summary: 'Submit closure evidence (after photo & notes) for verification; requires a recorded root cause and solution' })
  async submitClosure(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitClosureDto,
  ) {
    return this.correctiveActionsService.submitClosure(tenantId, id, actor, dto);
  }

  @Post(':id/verify')
  @Roles(...RoleGroups.ACTION_VERIFIERS)
  @ApiOperation({ summary: 'Independent verification sign-off (Approve or Reject & Reopen)' })
  async verify(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VerifyActionDto,
  ) {
    return this.correctiveActionsService.verifyAction(tenantId, id, actor, dto);
  }

  @Post(':id/close')
  @Roles(...RoleGroups.ACTION_CLOSERS)
  @ApiOperation({ summary: 'Effectiveness review: close a verified action, or reopen it if the fix did not hold' })
  async close(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CloseActionDto,
  ) {
    return this.correctiveActionsService.closeAction(tenantId, id, actor, dto);
  }

  @Delete(':id')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Delete CAPA action' })
  async delete(@TenantId() tenantId: string, @CurrentUserId() actorId: string, @Param('id') id: string) {
    return this.correctiveActionsService.deleteAction(tenantId, id, actorId);
  }
}
