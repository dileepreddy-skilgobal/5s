import { Module } from '@nestjs/common';
import { AuditSchedulesService } from './audit-schedules.service';
import { AuditSchedulesController } from './audit-schedules.controller';

@Module({
  controllers: [AuditSchedulesController],
  providers: [AuditSchedulesService],
  exports: [AuditSchedulesService],
})
export class AuditSchedulesModule {}
