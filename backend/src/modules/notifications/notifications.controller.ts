import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../core/database/prisma.service';
import { CurrentUserId, TenantId } from '../../core/auth/current-user.decorator';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { EscalationScheduler } from '../../core/notifications/escalation.scheduler';
import { RegisterPushDeviceDto, UpdateNotificationPreferencesDto } from './dto/notifications.dto';
import { AllowWhenReadOnly } from '../../core/subscription/subscription.guard';

@ApiTags('Notifications')
@ApiBearerAuth()
// Read receipts, preferences and device registration are not data changes
@AllowWhenReadOnly()
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: EscalationScheduler,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My notifications, newest first' })
  async list(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const where = { tenantId, userId, ...(unreadOnly === 'true' ? { readAt: null } : {}) };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * size,
        take: size,
        select: { id: true, type: true, title: true, body: true, entityType: true, entityId: true, link: true, readAt: true, createdAt: true },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { tenantId, userId, readAt: null } }),
    ]);
    return { items, total, unread, page: p, pageSize: size };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Number of unread notifications (for the bell badge)' })
  async unreadCount(@TenantId() tenantId: string, @CurrentUserId() userId: string) {
    return { unread: await this.prisma.notification.count({ where: { tenantId, userId, readAt: null } }) };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  async readAll(@TenantId() tenantId: string, @CurrentUserId() userId: string) {
    const { count } = await this.prisma.notification.updateMany({ where: { tenantId, userId, readAt: null }, data: { readAt: new Date() } });
    return { marked: count };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark one notification as read' })
  async read(@TenantId() tenantId: string, @CurrentUserId() userId: string, @Param('id') id: string) {
    const { count } = await this.prisma.notification.updateMany({ where: { id, tenantId, userId }, data: { readAt: new Date() } });
    if (count === 0) throw new NotFoundException(`Notification '${id}' not found`);
    return { id, read: true };
  }

  @Get('preferences')
  @ApiOperation({ summary: 'My delivery preferences' })
  async preferences(@TenantId() tenantId: string, @CurrentUserId() userId: string) {
    return this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { emailNotifications: true, pushNotifications: true } });
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Turn email / push delivery on or off (in-app notifications are always kept)' })
  async updatePreferences(@TenantId() tenantId: string, @CurrentUserId() userId: string, @Body() dto: UpdateNotificationPreferencesDto) {
    await this.prisma.user.updateMany({ where: { id: userId, tenantId }, data: dto });
    return this.preferences(tenantId, userId);
  }

  @Post('devices')
  @ApiOperation({ summary: 'Register this mobile device for push notifications' })
  async registerDevice(@TenantId() tenantId: string, @CurrentUserId() userId: string, @Body() dto: RegisterPushDeviceDto) {
    // A token identifies one physical device; registering it again moves it to the signed-in user
    await this.prisma.pushDevice.upsert({
      where: { token: dto.token },
      create: { tenantId, userId, token: dto.token, platform: dto.platform },
      update: { tenantId, userId, platform: dto.platform, lastSeenAt: new Date() },
    });
    return { registered: true };
  }

  @Delete('devices/:token')
  @ApiOperation({ summary: 'Unregister a device (on sign-out)' })
  async unregisterDevice(@TenantId() tenantId: string, @CurrentUserId() userId: string, @Param('token') token: string) {
    const { count } = await this.prisma.pushDevice.deleteMany({ where: { token, tenantId, userId } });
    return { removed: count };
  }

  @Post('run-scheduler')
  @Roles(...RoleGroups.ORG_ADMINS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run the reminder / escalation scan now for this organization only (normally every 15 minutes)',
    description: 'Reminders already sent are not repeated. Returns how many notifications each check created.',
  })
  async runScheduler(@TenantId() tenantId: string) {
    return this.scheduler.scanTenantWithSummary(tenantId, new Date());
  }
}
