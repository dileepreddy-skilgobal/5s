import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { CreateLocationDto, UpdateLocationDto, CreateTimelineDto, UpdateTimelineDto, AddDocumentDto } from './dto/location.dto';

@ApiTags('Location & Area Master')
@Controller('api/v1/locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  private extractTenantId(tenantHeader?: string): string {
    return tenantHeader || 'default-tenant-skilglobal';
  }

  @Get()
  @ApiOperation({ summary: 'List all locations with filtering and search' })
  getLocations(
    @Headers('x-tenant-id') tenantId: string,
    @Query('search') search?: string,
    @Query('orgNodeId') orgNodeId?: string,
    @Query('locationType') locationType?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('auditFrequency') auditFrequency?: string,
    @Query('status') status?: string,
  ) {
    return this.locationsService.getLocations(this.extractTenantId(tenantId), {
      search,
      orgNodeId,
      locationType,
      riskLevel,
      auditFrequency,
      status,
    });
  }

  @Get('qr-batch')
  @ApiOperation({ summary: 'Get printable QR code data for multiple locations' })
  getBatchQrCodes(@Headers('x-tenant-id') tenantId: string, @Query('ids') ids?: string) {
    const locationIds = ids ? ids.split(',') : undefined;
    return this.locationsService.getBatchQrCodes(this.extractTenantId(tenantId), locationIds);
  }

  @Get('next-code')
  @ApiOperation({ summary: 'Generate next available sequential Location Area Code' })
  getNextCode(
    @Headers('x-tenant-id') tenantId: string,
    @Query('orgNodeId') orgNodeId?: string,
  ) {
    return this.locationsService.generateNextLocationCode(this.extractTenantId(tenantId), orgNodeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get centralized 7-tab Location Record by ID' })
  getLocationById(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.locationsService.getLocationById(this.extractTenantId(tenantId), id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new Area Master record' })
  createLocation(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-id') userId: string,
    @Body() dto: CreateLocationDto,
  ) {
    return this.locationsService.createLocation(this.extractTenantId(tenantId), dto, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Area Master record' })
  updateLocation(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationsService.updateLocation(this.extractTenantId(tenantId), id, dto, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete Location' })
  deleteLocation(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.locationsService.deleteLocation(this.extractTenantId(tenantId), id);
  }

  // --- Timelines ---

  @Post(':id/timelines')
  @ApiOperation({ summary: 'Add a 5S rollout timeline milestone' })
  createTimeline(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-id') userId: string,
    @Param('id') locationId: string,
    @Body() dto: CreateTimelineDto,
  ) {
    return this.locationsService.createTimeline(this.extractTenantId(tenantId), locationId, dto, userId);
  }

  @Patch(':id/timelines/:timelineId')
  @ApiOperation({ summary: 'Update 5S rollout timeline milestone' })
  updateTimeline(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-id') userId: string,
    @Param('id') locationId: string,
    @Param('timelineId') timelineId: string,
    @Body() dto: UpdateTimelineDto,
  ) {
    return this.locationsService.updateTimeline(this.extractTenantId(tenantId), locationId, timelineId, dto, userId);
  }

  @Delete(':id/timelines/:timelineId')
  @ApiOperation({ summary: 'Delete timeline milestone' })
  deleteTimeline(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') locationId: string,
    @Param('timelineId') timelineId: string,
  ) {
    return this.locationsService.deleteTimeline(this.extractTenantId(tenantId), locationId, timelineId);
  }

  // --- Documents ---

  @Post(':id/documents')
  @ApiOperation({ summary: 'Attach SOP / document to location' })
  addDocument(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') locationId: string,
    @Body() dto: AddDocumentDto,
  ) {
    return this.locationsService.addDocument(this.extractTenantId(tenantId), locationId, dto);
  }

  @Delete(':id/documents/:docId')
  @ApiOperation({ summary: 'Remove document from location' })
  deleteDocument(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') locationId: string,
    @Param('docId') docId: string,
  ) {
    return this.locationsService.deleteDocument(this.extractTenantId(tenantId), locationId, docId);
  }
}
