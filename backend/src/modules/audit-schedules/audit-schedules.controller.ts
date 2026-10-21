import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Res, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantId, CurrentUserId } from '../../core/auth/current-user.decorator';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuditSchedulesService } from './audit-schedules.service';
import {
  CancelInstanceDto,
  CreateScheduleDto,
  RescheduleInstanceDto,
  UpdateScheduleDto,
  UpdateScheduledInstanceDto,
} from './dto/audit-schedule.dto';
import { Roles } from '../../core/guards/roles.decorator';

@ApiTags('Audit schedules')
@ApiBearerAuth()
@Controller('api/v1/audit-schedules')
export class AuditSchedulesController {
  constructor(private readonly schedulesService: AuditSchedulesService) {}

  @Get()
  @ApiOperation({ summary: 'List all recurring audit schedules' })
  getSchedules(@TenantId() tenantId: string) {
    return this.schedulesService.getSchedules(tenantId);
  }

  @Get('instances')
  @ApiOperation({ summary: 'Get all scheduled audit instances (Calendar & Table View)' })
  getScheduledAudits(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('auditorId') auditorId?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.schedulesService.getScheduledAudits(tenantId, {
      status,
      auditorId,
      locationId,
    });
  }

  @Get('instances/:instanceId')
  @ApiOperation({ summary: 'One scheduled audit instance with its location, auditor and template version' })
  getScheduledInstance(@TenantId() tenantId: string, @Param('instanceId', new ParseUUIDPipe()) instanceId: string) {
    return this.schedulesService.getScheduledInstance(tenantId, instanceId);
  }

  @Get('calendar/export.ics')
  @ApiOperation({ summary: 'Export universal iCalendar (.ics) file for Google Calendar, Apple Calendar, and Outlook' })
  async exportIcsCalendar(
    @TenantId() tenantId: string,
    @Query('instanceId') instanceId?: string,
    @Res() res?: any,
  ) {
    const icsContent = await this.schedulesService.generateIcsCalendar(tenantId, instanceId);
    if (res) {
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="5S-Audit-Schedules.ics"');
      return res.send(icsContent);
    }
    return icsContent;
  }

  @Post('generate-due')
  @HttpCode(HttpStatus.OK)
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Create the upcoming audits of every active schedule whose next cycle is within its lead time (same pass as the background generator)' })
  generateDue(@TenantId() tenantId: string) {
    return this.schedulesService.generateDueSchedules(tenantId);
  }

  @Post('instances/:instanceId/reschedule')
  @HttpCode(HttpStatus.OK)
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Move one scheduled audit that has not started to a new date' })
  rescheduleInstance(
    @TenantId() tenantId: string,
    @CurrentUserId() actorId: string,
    @Param('instanceId', new ParseUUIDPipe()) instanceId: string,
    @Body() dto: RescheduleInstanceDto,
  ) {
    return this.schedulesService.rescheduleInstance(tenantId, instanceId, dto, actorId);
  }

  @Post('instances/:instanceId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Cancel one scheduled audit that has not started (reason required)' })
  cancelInstance(
    @TenantId() tenantId: string,
    @CurrentUserId() actorId: string,
    @Param('instanceId', new ParseUUIDPipe()) instanceId: string,
    @Body() dto: CancelInstanceDto,
  ) {
    return this.schedulesService.cancelInstance(tenantId, instanceId, dto, actorId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get schedule details with generated instances history' })
  getScheduleById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.schedulesService.getScheduleById(tenantId, id);
  }

  @Post()
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Create recurring audit schedule with auditor rotation rules' })
  createSchedule(@TenantId() tenantId: string, @Body() dto: CreateScheduleDto) {
    return this.schedulesService.createSchedule(tenantId, dto);
  }

  @Post(':id/generate')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Trigger on-demand generation of scheduled audits for next cycle' })
  generateAudits(@TenantId() tenantId: string, @Param('id') scheduleId: string) {
    return this.schedulesService.generateAuditsForSchedule(tenantId, scheduleId);
  }

  @Patch(':id')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Update audit schedule parameters' })
  updateSchedule(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() data: UpdateScheduleDto,
  ) {
    return this.schedulesService.updateSchedule(tenantId, id, data);
  }

  @Patch('instances/:instanceId')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Update scheduled audit instance (reassign auditor, change due date, update status)' })
  updateScheduledInstance(
    @TenantId() tenantId: string,
    @Param('instanceId') instanceId: string,
    @Body() data: UpdateScheduledInstanceDto,
  ) {
    return this.schedulesService.updateScheduledInstance(tenantId, instanceId, data);
  }

  @Delete(':id')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Delete audit schedule' })
  deleteSchedule(@TenantId() tenantId: string, @CurrentUserId() actorId: string, @Param('id') id: string) {
    return this.schedulesService.deleteSchedule(tenantId, id, actorId);
  }
}
