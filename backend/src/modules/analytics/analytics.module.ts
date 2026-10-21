import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { MetricsService } from './metrics.service';
import { GamificationService } from './gamification.service';
import { DataScopeService } from './data-scope.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, MetricsService, GamificationService, DataScopeService],
  exports: [AnalyticsService, MetricsService, DataScopeService],
})
export class AnalyticsModule {}
