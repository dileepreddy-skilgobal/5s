import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantId, CurrentUserId } from '../../core/auth/current-user.decorator';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ObservationsService } from './observations.service';
import { CreateObservationDto, UpdateObservationDto } from './dto/observation.dto';

@ApiTags('Observations & Abnormalities')
@ApiBearerAuth()
@Controller('api/v1/observations')
export class ObservationsController {
  constructor(private readonly observationsService: ObservationsService) {}

  @Get()
  @ApiOperation({ summary: 'List observations (newest first). Optional limit (1-200) and offset page the list; without limit every match is returned.' })
  async list(
    @TenantId() tenantId: string,
    @Query('category') category?: string,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('locationId') locationId?: string,
    @Query('executionId') executionId?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('repeat') repeat?: string,
  ) {
    return this.observationsService.listObservations(tenantId, {
      category,
      severity,
      status,
      locationId,
      executionId,
      search,
      repeatOnly: repeat === '1' || repeat === 'true',
      limit: limit !== undefined ? Number(limit) : undefined,
      offset: offset !== undefined ? Number(offset) : undefined,
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Observation counts for the register header: total, critical, open (not resolved/closed), kaizen' })
  async summary(@TenantId() tenantId: string) {
    return this.observationsService.summary(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get observation details with photo evidence and linked CAPA' })
  async getById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.observationsService.getObservationById(tenantId, id);
  }

  @Post()
  @Roles(...RoleGroups.SHOPFLOOR_REPORTERS)
  @ApiOperation({ summary: 'Log a new shop-floor observation or abnormality' })
  async create(@TenantId() tenantId: string, @CurrentUserId() userId: string, @Body() dto: CreateObservationDto) {
    return this.observationsService.createObservation(tenantId, userId, dto);
  }

  @Patch(':id')
  @Roles(...RoleGroups.OBSERVATION_MANAGERS)
  @ApiOperation({ summary: 'Update observation' })
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateObservationDto,
  ) {
    return this.observationsService.updateObservation(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Delete observation' })
  async delete(@TenantId() tenantId: string, @CurrentUserId() actorId: string, @Param('id') id: string) {
    return this.observationsService.deleteObservation(tenantId, id, actorId);
  }
}
