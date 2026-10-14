import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './core/database/database.module';
import { TenantMiddleware } from './core/context/tenant.middleware';
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

import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './core/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
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
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
