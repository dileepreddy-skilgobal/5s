import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantId, CurrentUserId } from '../../core/auth/current-user.decorator';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { CreateLocationDto, UpdateLocationDto, CreateTimelineDto, UpdateTimelineDto, AddDocumentDto } from './dto/location.dto';

@ApiTags('Location & Area Master')
@ApiBearerAuth()
@Controller('api/v1/locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all locations with filtering and search' })
  getLocations(
    @TenantId() tenantId: string,
    @Query('search') search?: string,
    @Query('orgNodeId') orgNodeId?: string,
    @Query('locationType') locationType?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('auditFrequency') auditFrequency?: string,
    @Query('status') status?: string,
    @Query('ownerId') ownerId?: string,
    @Query('mine') mine?: string,
    @CurrentUserId() userId?: string,
  ) {
    return this.locationsService.getLocations(tenantId, {
      search,
      orgNodeId,
      locationType,
      riskLevel,
      auditFrequency,
      status,
      ownerId,
      // "My areas": areas the caller owns or backs up, plus those under the units their roles are limited to
      mineOf: mine === '1' || mine === 'true' ? userId : undefined,
    });
  }

  @Get('qr-batch')
  @ApiOperation({ summary: 'Get printable QR code data for multiple locations (mine=1: only the caller\'s areas)' })
  getBatchQrCodes(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Query('ids') ids?: string,
    @Query('mine') mine?: string,
  ) {
    const locationIds = ids ? ids.split(',').map((id) => id.trim()).filter(Boolean) : undefined;
    return this.locationsService.getBatchQrCodes(tenantId, locationIds, mine === '1' || mine === 'true' ? userId : undefined);
  }

  @Get('next-code')
  @ApiOperation({ summary: 'Generate next available sequential Location Area Code' })
  getNextCode(
    @TenantId() tenantId: string,
    @Query('orgNodeId') orgNodeId?: string,
  ) {
    return this.locationsService.generateNextLocationCode(tenantId, orgNodeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get centralized 7-tab Location Record by ID' })
  getLocationById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.locationsService.getLocationById(tenantId, id);
  }

  @Post()
  @Roles(...RoleGroups.LOCATION_EDITORS)
  @ApiOperation({ summary: 'Create new Area Master record' })
  createLocation(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Body() dto: CreateLocationDto,
  ) {
    return this.locationsService.createLocation(tenantId, dto, userId);
  }

  @Patch(':id')
  @Roles(...RoleGroups.LOCATION_EDITORS)
  @ApiOperation({ summary: 'Update Area Master record' })
  updateLocation(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationsService.updateLocation(tenantId, id, dto, userId);
  }

  @Delete(':id')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Delete Location' })
  deleteLocation(@TenantId() tenantId: string, @CurrentUserId() actorId: string, @Param('id') id: string) {
    return this.locationsService.deleteLocation(tenantId, id, actorId);
  }

  // --- Timelines ---

  @Post(':id/timelines')
  @Roles(...RoleGroups.AREA_MAINTAINERS)
  @ApiOperation({ summary: 'Add a 5S rollout timeline milestone' })
  createTimeline(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Param('id') locationId: string,
    @Body() dto: CreateTimelineDto,
  ) {
    return this.locationsService.createTimeline(tenantId, locationId, dto, userId);
  }

  @Patch(':id/timelines/:timelineId')
  @Roles(...RoleGroups.AREA_MAINTAINERS)
  @ApiOperation({ summary: 'Update 5S rollout timeline milestone' })
  updateTimeline(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Param('id') locationId: string,
    @Param('timelineId') timelineId: string,
    @Body() dto: UpdateTimelineDto,
  ) {
    return this.locationsService.updateTimeline(tenantId, locationId, timelineId, dto, userId);
  }

  @Delete(':id/timelines/:timelineId')
  @Roles(...RoleGroups.AREA_MAINTAINERS)
  @ApiOperation({ summary: 'Delete timeline milestone' })
  deleteTimeline(
    @TenantId() tenantId: string,
    @Param('id') locationId: string,
    @Param('timelineId') timelineId: string,
  ) {
    return this.locationsService.deleteTimeline(tenantId, locationId, timelineId);
  }

  // --- Documents ---

  @Post(':id/documents')
  @Roles(...RoleGroups.AREA_MAINTAINERS)
  @ApiOperation({ summary: 'Attach SOP / document to location' })
  addDocument(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Param('id') locationId: string,
    @Body() dto: AddDocumentDto,
  ) {
    return this.locationsService.addDocument(tenantId, locationId, dto, userId);
  }

  @Delete(':id/documents/:docId')
  @Roles(...RoleGroups.AREA_MAINTAINERS)
  @ApiOperation({ summary: 'Remove document from location' })
  deleteDocument(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Param('id') locationId: string,
    @Param('docId') docId: string,
  ) {
    return this.locationsService.deleteDocument(tenantId, locationId, docId, userId);
  }
}
