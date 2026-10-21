import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantId, CurrentUserId } from '../../core/auth/current-user.decorator';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { StandardsService } from './standards.service';
import { CreateStandardDto, CreateRevisionDto, ApproveRevisionDto, RejectRevisionDto, UpdateStandardDto } from './dto/standard.dto';

@ApiTags('5S Standards Management')
@ApiBearerAuth()
@Controller('api/v1/standards')
export class StandardsController {
  constructor(private readonly standardsService: StandardsService) {}

  @Get()
  @ApiOperation({ summary: 'List all 5S standards with category and scope filters' })
  getStandards(
    @TenantId() tenantId: string,
    @Query('category') category?: string,
    @Query('scopeType') scopeType?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.standardsService.getStandards(tenantId, {
      category,
      scopeType,
      status,
      search,
    });
  }

  @Get('for-location/:locationId')
  @ApiOperation({ summary: 'Published standards that apply to a location (organization-wide, its organization units, or the location itself)' })
  getStandardsForLocation(@TenantId() tenantId: string, @Param('locationId') locationId: string) {
    return this.standardsService.getStandardsForLocation(tenantId, locationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get standard details with complete revision history and photo pairs' })
  getStandardById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.standardsService.getStandardById(tenantId, id);
  }

  @Patch(':id')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Update standard metadata and scope' })
  updateStandard(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() data: UpdateStandardDto,
  ) {
    return this.standardsService.updateStandard(tenantId, id, data);
  }

  @Post()
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Author and publish a new 5S standard' })
  createStandard(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Body() dto: CreateStandardDto,
  ) {
    return this.standardsService.createStandard(tenantId, dto, userId);
  }

  @Post(':id/revisions')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Draft a new version revision for an existing standard' })
  createRevision(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Param('id') standardId: string,
    @Body() dto: CreateRevisionDto,
  ) {
    return this.standardsService.createRevision(tenantId, standardId, dto, userId);
  }

  @Post(':id/revisions/:revisionId/approve')
  @Roles(...RoleGroups.STANDARD_APPROVERS)
  @ApiOperation({ summary: 'Approve and activate standard revision' })
  approveRevision(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Param('id') standardId: string,
    @Param('revisionId') revisionId: string,
    @Body() dto: ApproveRevisionDto,
  ) {
    return this.standardsService.approveRevision(tenantId, standardId, revisionId, dto, userId);
  }

  @Post(':id/revisions/:revisionId/reject')
  @Roles(...RoleGroups.STANDARD_APPROVERS)
  @ApiOperation({ summary: 'Reject a revision awaiting approval (reason required); the revision in force is unchanged' })
  rejectRevision(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Param('id') standardId: string,
    @Param('revisionId') revisionId: string,
    @Body() dto: RejectRevisionDto,
  ) {
    return this.standardsService.rejectRevision(tenantId, standardId, revisionId, dto, userId);
  }

  @Delete(':id')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Delete standard' })
  deleteStandard(@TenantId() tenantId: string, @CurrentUserId() actorId: string, @Param('id') id: string) {
    return this.standardsService.deleteStandard(tenantId, id, actorId);
  }
}
