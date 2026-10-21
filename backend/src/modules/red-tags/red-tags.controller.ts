import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantId, CurrentUserId, CurrentUser } from '../../core/auth/current-user.decorator';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { RedTagsService } from './red-tags.service';
import { CreateRedTagDto, UpdateRedTagDto, SubmitDispositionDto, CloseRedTagDto, MoveToHoldingDto, RejectDispositionDto } from './dto/red-tag.dto';

@ApiTags('Red Tag Management Hub')
@ApiBearerAuth()
@Controller('api/v1/red-tags')
export class RedTagsController {
  constructor(private readonly redTagsService: RedTagsService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Get Red Tag high-level summary KPIs and ageing distribution' })
  async getMetrics(@TenantId() tenantId: string) {
    return this.redTagsService.getMetrics(tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'List Red Tag records with filters' })
  async list(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('locationId') locationId?: string,
    @Query('holdingAreaId') holdingAreaId?: string,
    @Query('ageingTier') ageingTier?: string,
    @Query('search') search?: string,
    @Query('overdue') overdue?: string,
  ) {
    return this.redTagsService.listRedTags(tenantId, {
      status,
      category,
      locationId,
      holdingAreaId,
      ageingTier,
      search,
      overdue: overdue === '1' || overdue === 'true',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Red Tag details with printable QR tag' })
  async getById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.redTagsService.getRedTagById(tenantId, id);
  }

  @Post()
  @Roles(...RoleGroups.SHOPFLOOR_REPORTERS)
  @ApiOperation({ summary: 'Create new physical/digital Red Tag' })
  async create(@TenantId() tenantId: string, @CurrentUserId() userId: string, @Body() dto: CreateRedTagDto) {
    return this.redTagsService.createRedTag(tenantId, userId, dto);
  }

  @Patch(':id')
  @Roles(...RoleGroups.RED_TAG_REVIEWERS)
  @ApiOperation({ summary: 'Update Red Tag attributes' })
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRedTagDto,
  ) {
    return this.redTagsService.updateRedTag(tenantId, id, dto);
  }

  @Post(':id/disposition')
  @Roles(...RoleGroups.RED_TAG_REVIEWERS)
  @ApiOperation({ summary: 'Submit disposition decision and supervisor approval' })
  async submitDisposition(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitDispositionDto,
  ) {
    return this.redTagsService.submitDisposition(tenantId, id, actor, dto);
  }

  @Post(':id/move-to-holding')
  @Roles(...RoleGroups.RED_TAG_REVIEWERS)
  @ApiOperation({ summary: 'Record that the item was moved to a red-tag holding area' })
  async moveToHolding(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: MoveToHoldingDto) {
    return this.redTagsService.moveToHolding(tenantId, id, dto);
  }

  @Post(':id/disposition/approve')
  @Roles(...RoleGroups.RED_TAG_CLOSERS)
  @ApiOperation({ summary: 'Supervisor approves the proposed disposition decision' })
  async approveDisposition(@TenantId() tenantId: string, @CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.redTagsService.approveDisposition(tenantId, id, actor);
  }

  @Post(':id/disposition/reject')
  @Roles(...RoleGroups.RED_TAG_CLOSERS)
  @ApiOperation({ summary: 'Supervisor rejects the proposed disposition decision with a reason' })
  async rejectDisposition(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectDispositionDto,
  ) {
    return this.redTagsService.rejectDisposition(tenantId, id, actor, dto);
  }

  @Post(':id/close')
  @Roles(...RoleGroups.RED_TAG_CLOSERS)
  @ApiOperation({ summary: 'Finalize Red Tag physical disposal / scrap closure' })
  async closeRedTag(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: CloseRedTagDto,
  ) {
    return this.redTagsService.closeRedTag(tenantId, id, userId, dto);
  }

  @Delete(':id')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Delete Red Tag record' })
  async delete(@TenantId() tenantId: string, @CurrentUserId() actorId: string, @Param('id') id: string) {
    return this.redTagsService.deleteRedTag(tenantId, id, actorId);
  }
}
