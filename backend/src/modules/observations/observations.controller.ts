import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ObservationsService } from './observations.service';
import { CreateObservationDto, UpdateObservationDto } from './dto/observation.dto';

@ApiTags('Observations & Abnormalities')
@Controller('api/v1/observations')
export class ObservationsController {
  constructor(private readonly observationsService: ObservationsService) {}

  private extractTenantId(tenantHeader?: string): string {
    return tenantHeader || 'default-tenant-skilglobal';
  }

  @Get()
  @ApiOperation({ summary: 'List all observations and non-conformances' })
  async list(
    @Headers('x-tenant-id') tenantId: string,
    @Query('category') category?: string,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('locationId') locationId?: string,
    @Query('executionId') executionId?: string,
    @Query('search') search?: string,
  ) {
    return this.observationsService.listObservations(this.extractTenantId(tenantId), {
      category,
      severity,
      status,
      locationId,
      executionId,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get observation details with photo evidence and linked CAPA' })
  async getById(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.observationsService.getObservationById(this.extractTenantId(tenantId), id);
  }

  @Post()
  @ApiOperation({ summary: 'Log a new shop-floor observation or abnormality' })
  async create(@Headers('x-tenant-id') tenantId: string, @Body() dto: CreateObservationDto) {
    return this.observationsService.createObservation(this.extractTenantId(tenantId), null, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update observation' })
  async update(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateObservationDto,
  ) {
    return this.observationsService.updateObservation(this.extractTenantId(tenantId), id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete observation' })
  async delete(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.observationsService.deleteObservation(this.extractTenantId(tenantId), id);
  }
}
