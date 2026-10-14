import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StandardsService } from './standards.service';
import { CreateStandardDto, CreateRevisionDto, ApproveRevisionDto } from './dto/standard.dto';

@ApiTags('5S Standards Management')
@Controller('api/v1/standards')
export class StandardsController {
  constructor(private readonly standardsService: StandardsService) {}

  private extractTenantId(tenantHeader?: string): string {
    return tenantHeader || 'default-tenant-skilglobal';
  }

  @Get()
  @ApiOperation({ summary: 'List all 5S standards with category and scope filters' })
  getStandards(
    @Headers('x-tenant-id') tenantId: string,
    @Query('category') category?: string,
    @Query('scopeType') scopeType?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.standardsService.getStandards(this.extractTenantId(tenantId), {
      category,
      scopeType,
      status,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get standard details with complete revision history and photo pairs' })
  getStandardById(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.standardsService.getStandardById(this.extractTenantId(tenantId), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update standard metadata and scope' })
  updateStandard(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.standardsService.updateStandard(this.extractTenantId(tenantId), id, data);
  }

  @Post()
  @ApiOperation({ summary: 'Author and publish a new 5S standard' })
  createStandard(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-id') userId: string,
    @Body() dto: CreateStandardDto,
  ) {
    return this.standardsService.createStandard(this.extractTenantId(tenantId), dto, userId);
  }

  @Post(':id/revisions')
  @ApiOperation({ summary: 'Draft a new version revision for an existing standard' })
  createRevision(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-id') userId: string,
    @Param('id') standardId: string,
    @Body() dto: CreateRevisionDto,
  ) {
    return this.standardsService.createRevision(this.extractTenantId(tenantId), standardId, dto, userId);
  }

  @Post(':id/revisions/:revisionId/approve')
  @ApiOperation({ summary: 'Approve and activate standard revision' })
  approveRevision(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-id') userId: string,
    @Param('id') standardId: string,
    @Param('revisionId') revisionId: string,
    @Body() dto: ApproveRevisionDto,
  ) {
    return this.standardsService.approveRevision(this.extractTenantId(tenantId), standardId, revisionId, dto, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete standard' })
  deleteStandard(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.standardsService.deleteStandard(this.extractTenantId(tenantId), id);
  }
}
