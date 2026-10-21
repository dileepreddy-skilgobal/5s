import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { LocationInsightsController } from './location-insights.controller';
import { LocationInsightsService } from './location-insights.service';

@Module({
  imports: [AnalyticsModule],
  controllers: [LocationInsightsController],
  providers: [LocationInsightsService],
})
export class LocationInsightsModule {}
