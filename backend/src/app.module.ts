import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './core/database/database.module';
import { ActivityModule } from './core/activity/activity.module';
import { ActivityLogsModule } from './modules/activity-logs/activity-logs.module';
import { SettingsModule } from './modules/settings/settings.module';
import { NotificationsCoreModule } from './core/notifications/notifications.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { StorageModule } from './core/storage/storage.module';
import { FilesModule } from './modules/files/files.module';
import { MediaIngestInterceptor, SignedUrlInterceptor } from './core/storage/media.interceptors';
import { ActivityLogInterceptor } from './core/activity/activity-log.interceptor';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { LocationsModule } from './modules/locations/locations.module';
import { ImportsModule } from './modules/imports/imports.module';
import { StandardsModule } from './modules/standards/standards.module';
import { AuditTemplatesModule } from './modules/audit-templates/audit-templates.module';
import { AuditSchedulesModule } from './modules/audit-schedules/audit-schedules.module';
import { AuditExecutionsModule } from './modules/audit-executions/audit-executions.module';
import { ObservationsModule } from './modules/observations/observations.module';
import { CorrectiveActionsModule } from './modules/corrective-actions/corrective-actions.module';
import { RedTagsModule } from './modules/red-tags/red-tags.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { TrainingModule } from './modules/training/training.module';

import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { MfaEnrollmentGuard } from './core/auth/mfa-enrollment.guard';
import { SubscriptionGuard } from './core/subscription/subscription.guard';
import { SubscriptionModule } from './core/subscription/subscription.module';
import { PlatformModule } from './modules/platform/platform.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { IntegrationsCoreModule } from './core/integrations/integrations.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { RoutinesModule } from './modules/routines/routines.module';
import { LocationInsightsModule } from './modules/location-insights/location-insights.module';
import { JwtAuthGuard } from './core/auth/jwt-auth.guard';
import { RolesGuard } from './core/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Per-IP request budget; credential endpoints set stricter limits with @Throttle
    ThrottlerModule.forRoot([{ ttl: 60000, limit: () => Number(process.env.RATE_LIMIT_PER_MINUTE ?? 600) }]),
    DatabaseModule,
    ActivityModule,
    NotificationsCoreModule,
    StorageModule,
    SubscriptionModule,
    IntegrationsCoreModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    OrganizationModule,
    LocationsModule,
    ImportsModule,
    StandardsModule,
    AuditTemplatesModule,
    AuditSchedulesModule,
    AuditExecutionsModule,
    ObservationsModule,
    CorrectiveActionsModule,
    RedTagsModule,
    AnalyticsModule,
    TrainingModule,
    ActivityLogsModule,
    SettingsModule,
    NotificationsModule,
    ReportsModule,
    FilesModule,
    PlatformModule,
    WorkspaceModule,
    IntegrationsModule,
    RoutinesModule,
    LocationInsightsModule,
  ],
  providers: [
    // Order matters: rate limit, authenticate, authorize, then enforce MFA enrolment policy.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: MfaEnrollmentGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
    // Moves inline base64 media into file storage before validation, so the trail logs file references
    {
      provide: APP_INTERCEPTOR,
      useClass: MediaIngestInterceptor,
    },
    // Records every state-changing request in the tamper-evident activity trail
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityLogInterceptor,
    },
    // Signs file references in responses
    {
      provide: APP_INTERCEPTOR,
      useClass: SignedUrlInterceptor,
    },
  ],
})
export class AppModule {}
