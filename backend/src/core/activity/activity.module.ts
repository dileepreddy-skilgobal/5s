import { Global, Module } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';

/** Provides the append-only activity trail to every module. */
@Global()
@Module({
  providers: [ActivityLogService],
  exports: [ActivityLogService],
})
export class ActivityModule {}
