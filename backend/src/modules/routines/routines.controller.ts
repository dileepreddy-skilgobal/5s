import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { CurrentUser, TenantId } from '../../core/auth/current-user.decorator';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { values } from '../../core/validation/domain-values';
import { RoutinesService, RoutineKind } from './routines.service';

export class CreateRoutineItemDto {
  @IsIn(['KAMISHIBAI', 'SHADOW_TOOL']) kind: RoutineKind;
  @IsString() @MinLength(3) @MaxLength(200) text: string;
  @IsOptional() @IsString() @MaxLength(60) position?: string;
  @IsOptional() @IsIn(values('FIVE_S_CATEGORIES')) category?: string;
}

export class UpdateRoutineItemDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) text?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(60) position?: string | null;
  @IsOptional() @IsIn(values('FIVE_S_CATEGORIES')) category?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}

export class RecordRoutineCheckDto {
  @IsUUID() itemId: string;
  @IsIn(['OK', 'NOT_OK', 'PRESENT', 'MISSING', 'DAMAGED']) status: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsBoolean() raiseObservation?: boolean;
}

@ApiTags('Daily Area Routine')
@ApiBearerAuth()
@Controller('api/v1/locations/:locationId/routine')
export class RoutinesController {
  constructor(private readonly routines: RoutinesService) {}

  @Get()
  @ApiOperation({ summary: "A day's Kamishibai checks and shadow-board tools with their results (default: today)" })
  routineDay(@TenantId() tenantId: string, @Param('locationId', new ParseUUIDPipe()) locationId: string, @Query('date') date?: string) {
    return this.routines.day(tenantId, locationId, date);
  }

  @Get('history')
  @ApiOperation({ summary: 'Daily completion and issues for the last N days (default 30, max 180)' })
  routineHistory(@TenantId() tenantId: string, @Param('locationId', new ParseUUIDPipe()) locationId: string, @Query('days') days?: string) {
    return this.routines.history(tenantId, locationId, days ? Number(days) || 30 : 30);
  }

  @Put('checks')
  @Roles(...RoleGroups.AREA_MAINTAINERS)
  @ApiOperation({ summary: "Record today's result for one item; optionally raise an observation for a failure" })
  recordRoutineCheck(@TenantId() tenantId: string, @CurrentUser() actor: AuthenticatedUser, @Param('locationId', new ParseUUIDPipe()) locationId: string, @Body() dto: RecordRoutineCheckDto) {
    return this.routines.record(tenantId, locationId, actor, dto);
  }

  @Post('items')
  @Roles(...RoleGroups.AREA_MAINTAINERS)
  @ApiOperation({ summary: 'Add a Kamishibai check or a shadow-board tool to this location' })
  addRoutineItem(@TenantId() tenantId: string, @CurrentUser() actor: AuthenticatedUser, @Param('locationId', new ParseUUIDPipe()) locationId: string, @Body() dto: CreateRoutineItemDto) {
    return this.routines.addItem(tenantId, locationId, actor, dto);
  }

  @Post('items/defaults')
  @Roles(...RoleGroups.AREA_MAINTAINERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Load the five standard daily checks (one per 5S pillar + safety) for a location without checks' })
  addDefaultRoutineItems(@TenantId() tenantId: string, @CurrentUser() actor: AuthenticatedUser, @Param('locationId', new ParseUUIDPipe()) locationId: string) {
    return this.routines.addDefaults(tenantId, locationId, actor);
  }

  @Patch('items/:itemId')
  @Roles(...RoleGroups.AREA_MAINTAINERS)
  @ApiOperation({ summary: 'Edit a check or tool' })
  updateRoutineItem(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateRoutineItemDto,
  ) {
    return this.routines.updateItem(tenantId, locationId, itemId, actor, dto);
  }

  @Delete('items/:itemId')
  @Roles(...RoleGroups.AREA_MAINTAINERS)
  @ApiOperation({ summary: 'Retire a check or tool (past results are kept)' })
  retireRoutineItem(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ) {
    return this.routines.retireItem(tenantId, locationId, itemId, actor);
  }
}
