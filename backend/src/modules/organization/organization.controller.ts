import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { CreateOrgNodeDto, UpdateOrgNodeDto, MoveOrgNodeDto } from './dto/organization.dto';

@ApiTags('Organization Hierarchy & Structure')
@Controller('api/v1/organization')
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  private extractTenantId(tenantHeader?: string): string {
    return tenantHeader || 'default-tenant-skilglobal';
  }

  @Get('next-code')
  @ApiOperation({ summary: 'Generate next available sequential organization node code' })
  getNextCode(
    @Headers('x-tenant-id') tenantId: string,
    @Query('nodeType') nodeType?: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.orgService.generateNextOrgNodeCode(this.extractTenantId(tenantId), nodeType || 'SUB_SECTION', parentId);
  }

  @Get('tree')
  @ApiOperation({ summary: 'Get nested organizational hierarchy tree' })
  getTree(@Headers('x-tenant-id') tenantId: string) {
    return this.orgService.getTreeByTenant(this.extractTenantId(tenantId));
  }

  @Get('nodes')
  @ApiOperation({ summary: 'Get all organization nodes in flat list' })
  getFlatNodes(@Headers('x-tenant-id') tenantId: string) {
    return this.orgService.getAllNodesFlat(this.extractTenantId(tenantId));
  }

  @Get('nodes/:id')
  @ApiOperation({ summary: 'Get organization node details by ID' })
  getNodeById(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.orgService.getNodeById(this.extractTenantId(tenantId), id);
  }

  @Post('nodes')
  @ApiOperation({ summary: 'Create new organization node in hierarchy' })
  createNode(@Headers('x-tenant-id') tenantId: string, @Body() dto: CreateOrgNodeDto) {
    return this.orgService.createNode(this.extractTenantId(tenantId), dto);
  }

  @Patch('nodes/:id')
  @ApiOperation({ summary: 'Update organization node' })
  updateNode(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string, @Body() dto: UpdateOrgNodeDto) {
    return this.orgService.updateNode(this.extractTenantId(tenantId), id, dto);
  }

  @Patch('nodes/:id/move')
  @ApiOperation({ summary: 'Move node to a new parent in hierarchy tree' })
  moveNode(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string, @Body() dto: MoveOrgNodeDto) {
    return this.orgService.moveNode(this.extractTenantId(tenantId), id, dto);
  }

  @Delete('nodes/:id')
  @ApiOperation({ summary: 'Delete organization node' })
  deleteNode(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.orgService.deleteNode(this.extractTenantId(tenantId), id);
  }
}
