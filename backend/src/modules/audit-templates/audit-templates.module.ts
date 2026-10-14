import { Module } from '@nestjs/common';
import { AuditTemplatesService } from './audit-templates.service';
import { AuditTemplatesController } from './audit-templates.controller';

@Module({
  controllers: [AuditTemplatesController],
  providers: [AuditTemplatesService],
  exports: [AuditTemplatesService],
})
export class AuditTemplatesModule {}
