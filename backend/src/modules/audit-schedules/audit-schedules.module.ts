import { Module } from '@nestjs/common';
import { AuditSchedulesService } from './audit-schedules.service';
import { AuditSchedulesController } from './audit-schedules.controller';
import { ScheduleGenerationScheduler } from './schedule-generation.scheduler';

@Module({
  controllers: [AuditSchedulesController],
  providers: [AuditSchedulesService, ScheduleGenerationScheduler],
  exports: [AuditSchedulesService],
})
export class AuditSchedulesModule {}
