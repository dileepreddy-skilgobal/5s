import { Module } from '@nestjs/common';
import { AuditExecutionsController } from './audit-executions.controller';
import { AuditExecutionsService } from './audit-executions.service';

@Module({
  controllers: [AuditExecutionsController],
  providers: [AuditExecutionsService],
  exports: [AuditExecutionsService],
})
export class AuditExecutionsModule {}
