import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RedTagsService } from './red-tags.service';
import { CreateRedTagDto, UpdateRedTagDto, SubmitDispositionDto, CloseRedTagDto } from './dto/red-tag.dto';

@ApiTags('Red Tag Management Hub')
@Controller('api/v1/red-tags')
export class RedTagsController {
  constructor(private readonly redTagsService: RedTagsService) {}

  private extractTenantId(tenantHeader?: string): string {
    return tenantHeader || 'default-tenant-skilglobal';
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get Red Tag high-level summary KPIs and ageing distribution' })
  async getMetrics(@Headers('x-tenant-id') tenantId: string) {
    return this.redTagsService.getMetrics(this.extractTenantId(tenantId));
  }

  @Get()
  @ApiOperation({ summary: 'List Red Tag records with filters' })
  async list(
    @Headers('x-tenant-id') tenantId: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('locationId') locationId?: string,
    @Query('holdingAreaId') holdingAreaId?: string,
    @Query('ageingTier') ageingTier?: string,
    @Query('search') search?: string,
  ) {
    return this.redTagsService.listRedTags(this.extractTenantId(tenantId), {
      status,
      category,
      locationId,
      holdingAreaId,
      ageingTier,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Red Tag details with printable QR tag' })
  async getById(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.redTagsService.getRedTagById(this.extractTenantId(tenantId), id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new physical/digital Red Tag' })
  async create(@Headers('x-tenant-id') tenantId: string, @Body() dto: CreateRedTagDto) {
    return this.redTagsService.createRedTag(this.extractTenantId(tenantId), null, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Red Tag attributes' })
  async update(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRedTagDto,
  ) {
    return this.redTagsService.updateRedTag(this.extractTenantId(tenantId), id, dto);
  }

  @Post(':id/disposition')
  @ApiOperation({ summary: 'Submit disposition decision and supervisor approval' })
  async submitDisposition(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: SubmitDispositionDto,
  ) {
    return this.redTagsService.submitDisposition(this.extractTenantId(tenantId), id, null, dto);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Finalize Red Tag physical disposal / scrap closure' })
  async closeRedTag(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: CloseRedTagDto,
  ) {
    return this.redTagsService.closeRedTag(this.extractTenantId(tenantId), id, null, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete Red Tag record' })
  async delete(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.redTagsService.deleteRedTag(this.extractTenantId(tenantId), id);
  }
}
