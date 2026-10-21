import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { BulkImportService } from './bulk-import.service';

@Module({
  controllers: [ImportsController],
  providers: [BulkImportService],
})
export class ImportsModule {}
