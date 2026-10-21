import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, TenantId } from '../../core/auth/current-user.decorator';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { values } from '../../core/validation/domain-values';
import { LocationInsightsService } from './location-insights.service';

export class CreateLocationEvidenceDto {
  @IsIn(values('FIVE_S_CATEGORIES')) category: string;
  @IsString() @MinLength(5) @MaxLength(1000) description: string;
  /** Sent as a data: URL (stored by the media interceptor) or an already stored /api/v1/files/<id> reference */
  @IsString() beforePhotoUrl: string;
  @IsString() afterPhotoUrl: string;
  @IsOptional() @IsString() @MaxLength(60) afterLabel?: string;
}

@ApiTags('Location Insights')
@ApiBearerAuth()
@Controller('api/v1/locations/:locationId')
export class LocationInsightsController {
  constructor(private readonly insights: LocationInsightsService) {}

  @Get('scorecard')
  @ApiOperation({ summary: 'Area scorecard: 12-month average, maturity band, pillar breakdown, latest audit, open work, evidence count' })
  locationScorecard(@TenantId() tenantId: string, @Param('locationId', new ParseUUIDPipe()) locationId: string) {
    return this.insights.scorecard(tenantId, locationId);
  }

  @Get('evidence')
  @ApiOperation({ summary: 'Before / after improvement evidence: uploaded pairs and closed corrective actions with photos' })
  listLocationEvidence(@TenantId() tenantId: string, @Param('locationId', new ParseUUIDPipe()) locationId: string) {
    return this.insights.listEvidence(tenantId, locationId);
  }

  @Post('evidence')
  @Roles(...RoleGroups.AREA_MAINTAINERS)
  @ApiOperation({ summary: 'Add a before / after photo pair (area owner or supervisor)' })
  addLocationEvidence(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @Body() dto: CreateLocationEvidenceDto,
  ) {
    return this.insights.addEvidence(tenantId, locationId, actor, dto);
  }

  @Delete('evidence/:evidenceId')
  @Roles(...RoleGroups.AREA_MAINTAINERS)
  @ApiOperation({ summary: 'Remove an uploaded pair (uploader or supervisor); kept in history' })
  removeLocationEvidence(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @Param('evidenceId', new ParseUUIDPipe()) evidenceId: string,
  ) {
    return this.insights.removeEvidence(tenantId, locationId, evidenceId, actor);
  }
}
