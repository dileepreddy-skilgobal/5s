import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantId, CurrentUserId } from '../../core/auth/current-user.decorator';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { CreateOrgNodeDto, UpdateOrgNodeDto, MoveOrgNodeDto } from './dto/organization.dto';

@ApiTags('Organization Hierarchy & Structure')
@ApiBearerAuth()
@Controller('api/v1/organization')
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Get('next-code')
  @ApiOperation({ summary: 'Generate next available sequential organization node code' })
  getNextCode(
    @TenantId() tenantId: string,
    @Query('nodeType') nodeType?: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.orgService.generateNextOrgNodeCode(tenantId, nodeType || 'SUB_SECTION', parentId);
  }

  @Get('node-types')
  @ApiOperation({ summary: "Unit types this organization may use: its configured hierarchy levels, then the built-in types" })
  getNodeTypes(@TenantId() tenantId: string) {
    return this.orgService.getNodeTypes(tenantId);
  }

  @Get('tree')
  @ApiOperation({ summary: 'Get nested organizational hierarchy tree' })
  getTree(@TenantId() tenantId: string) {
    return this.orgService.getTreeByTenant(tenantId);
  }

  @Get('nodes')
  @ApiOperation({ summary: 'Get all organization nodes in flat list' })
  getFlatNodes(@TenantId() tenantId: string) {
    return this.orgService.getAllNodesFlat(tenantId);
  }

  @Get('nodes/:id')
  @ApiOperation({ summary: 'Get organization node details by ID' })
  getNodeById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.orgService.getNodeById(tenantId, id);
  }

  @Post('nodes')
  @Roles(...RoleGroups.ORG_ADMINS)
  @ApiOperation({ summary: 'Create new organization node in hierarchy' })
  createNode(@TenantId() tenantId: string, @CurrentUserId() actorId: string, @Body() dto: CreateOrgNodeDto) {
    return this.orgService.createNode(tenantId, dto, actorId);
  }

  @Patch('nodes/:id')
  @Roles(...RoleGroups.ORG_ADMINS)
  @ApiOperation({ summary: 'Update organization node' })
  updateNode(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateOrgNodeDto) {
    return this.orgService.updateNode(tenantId, id, dto);
  }

  @Patch('nodes/:id/move')
  @Roles(...RoleGroups.ORG_ADMINS)
  @ApiOperation({ summary: 'Move node to a new parent in hierarchy tree' })
  moveNode(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: MoveOrgNodeDto) {
    return this.orgService.moveNode(tenantId, id, dto);
  }

  @Delete('nodes/:id')
  @Roles(...RoleGroups.ORG_ADMINS)
  @ApiOperation({ summary: 'Delete organization node' })
  deleteNode(@TenantId() tenantId: string, @CurrentUserId() actorId: string, @Param('id') id: string) {
    return this.orgService.deleteNode(tenantId, id, actorId);
  }
}
