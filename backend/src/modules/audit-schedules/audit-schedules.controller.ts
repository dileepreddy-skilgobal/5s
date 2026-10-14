import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Headers, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuditSchedulesService } from './audit-schedules.service';
import { CreateScheduleDto } from './dto/audit-schedule.dto';
import { Roles } from '../../core/guards/roles.decorator';

@ApiTags('Audit Scheduling & Recurrence Engine')
@Controller('api/v1/audit-schedules')
export class AuditSchedulesController {
  constructor(private readonly schedulesService: AuditSchedulesService) {}

  private extractTenantId(tenantHeader?: string): string {
    return tenantHeader || 'default-tenant-skilglobal';
  }

  @Get()
  @ApiOperation({ summary: 'List all recurring audit schedules' })
  getSchedules(@Headers('x-tenant-id') tenantId: string) {
    return this.schedulesService.getSchedules(this.extractTenantId(tenantId));
  }

  @Get('instances')
  @ApiOperation({ summary: 'Get all scheduled audit instances (Calendar & Table View)' })
  getScheduledAudits(
    @Headers('x-tenant-id') tenantId: string,
    @Query('status') status?: string,
    @Query('auditorId') auditorId?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.schedulesService.getScheduledAudits(this.extractTenantId(tenantId), {
      status,
      auditorId,
      locationId,
    });
  }

  @Get('calendar/export.ics')
  @ApiOperation({ summary: 'Export universal iCalendar (.ics) file for Google Calendar, Apple Calendar, and Outlook' })
  async exportIcsCalendar(
    @Headers('x-tenant-id') tenantId: string,
    @Query('instanceId') instanceId?: string,
    @Res() res?: any,
  ) {
    const icsContent = await this.schedulesService.generateIcsCalendar(this.extractTenantId(tenantId), instanceId);
    if (res) {
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="5S-Audit-Schedules.ics"');
      return res.send(icsContent);
    }
    return icsContent;
  }

  @Post('calendar/gmail-sync')
  @ApiOperation({ summary: 'Sync scheduled audit instances with Gmail and Google Workspace Calendar' })
  syncGmailCalendar(
    @Headers('x-tenant-id') tenantId: string,
    @Body() payload: { instanceIds?: string[]; emailToSync?: string; notifyAttendees?: boolean },
  ) {
    return this.schedulesService.syncGmailCalendar(this.extractTenantId(tenantId), payload);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get schedule details with generated instances history' })
  getScheduleById(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.schedulesService.getScheduleById(this.extractTenantId(tenantId), id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Create recurring audit schedule with auditor rotation rules' })
  createSchedule(@Headers('x-tenant-id') tenantId: string, @Body() dto: CreateScheduleDto) {
    return this.schedulesService.createSchedule(this.extractTenantId(tenantId), dto);
  }

  @Post(':id/generate')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Trigger on-demand generation of scheduled audits for next cycle' })
  generateAudits(@Headers('x-tenant-id') tenantId: string, @Param('id') scheduleId: string) {
    return this.schedulesService.generateAuditsForSchedule(this.extractTenantId(tenantId), scheduleId);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Update audit schedule parameters' })
  updateSchedule(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.schedulesService.updateSchedule(this.extractTenantId(tenantId), id, data);
  }

  @Patch('instances/:instanceId')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Update scheduled audit instance (reassign auditor, change due date, update status)' })
  updateScheduledInstance(
    @Headers('x-tenant-id') tenantId: string,
    @Param('instanceId') instanceId: string,
    @Body() data: any,
  ) {
    return this.schedulesService.updateScheduledInstance(this.extractTenantId(tenantId), instanceId, data);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Delete audit schedule' })
  deleteSchedule(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.schedulesService.deleteSchedule(this.extractTenantId(tenantId), id);
  }
}
