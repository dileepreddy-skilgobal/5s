import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  // Management registers reuse the analytics metrics and the plant / department data scope
  imports: [AnalyticsModule],
  controllers: [ReportsController],
})
export class ReportsModule {}
