import { Controller, Get, Post, Body, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics, Maturity, Heat Maps & Gamification')
@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  private extractTenantId(tenantHeader?: string): string {
    return tenantHeader || 'default-tenant-skilglobal';
  }

  @Get('maturity')
  @ApiOperation({ summary: 'Get overall 5S maturity index, level, radar breakdown, and historical trend' })
  getMaturityOverview(
    @Headers('x-tenant-id') tenantId: string,
    @Query('timeframe') timeframe?: string,
  ) {
    return this.analyticsService.getMaturityOverview(this.extractTenantId(tenantId), timeframe);
  }

  @Get('heatmap')
  @ApiOperation({ summary: 'Get 2D workstation 5S compliance heatmap matrix' })
  get5SHeatmap(@Headers('x-tenant-id') tenantId: string) {
    return this.analyticsService.get5SHeatmap(this.extractTenantId(tenantId));
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Get 5S plant champions and attention required workstations' })
  getLeaderboard(@Headers('x-tenant-id') tenantId: string) {
    return this.analyticsService.getLeaderboard(this.extractTenantId(tenantId));
  }

  // ==========================================================================
  // GAMIFICATION, TROPHIES & ENGAGEMENT ENDPOINTS
  // ==========================================================================
  @Get('gamification/overview')
  @ApiOperation({ summary: 'Get user 5S XP points, level, streak, and active monthly challenge' })
  getGamificationOverview(
    @Headers('x-tenant-id') tenantId: string,
    @Query('userId') userId?: string,
  ) {
    return this.analyticsService.getGamificationOverview(this.extractTenantId(tenantId), userId);
  }

  @Get('gamification/leaderboards')
  @ApiOperation({ summary: 'Get workstation, department, individual champions, and most improved leaderboards' })
  getGamificationLeaderboards(@Headers('x-tenant-id') tenantId: string) {
    return this.analyticsService.getGamificationLeaderboards(this.extractTenantId(tenantId));
  }

  @Get('gamification/trophies')
  @ApiOperation({ summary: 'Get active floating trophies, current holding workstations, and Hall of Fame history' })
  getGamificationTrophies(@Headers('x-tenant-id') tenantId: string) {
    return this.analyticsService.getTrophiesAndAwards(this.extractTenantId(tenantId));
  }

  @Get('gamification/badges')
  @ApiOperation({ summary: 'Get unlockable badges, milestone achievements, and XP progression' })
  getGamificationBadges(
    @Headers('x-tenant-id') tenantId: string,
    @Query('userId') userId?: string,
  ) {
    return this.analyticsService.getBadgesAndMilestones(this.extractTenantId(tenantId), userId);
  }

  @Post('gamification/award-trophy')
  @ApiOperation({ summary: 'Award or transfer a floating trophy to a winning workstation/team' })
  awardTrophy(
    @Headers('x-tenant-id') tenantId: string,
    @Body() payload: { trophyId: string; newLocationId: string; citation: string; awardedBy?: string },
  ) {
    return this.analyticsService.awardTrophy(this.extractTenantId(tenantId), payload);
  }

  @Post('gamification/kudos')
  @ApiOperation({ summary: 'Send peer recognition and +25 XP kudos' })
  giveKudos(
    @Headers('x-tenant-id') tenantId: string,
    @Body() payload: { toUser: string; category: string; message: string; points?: number; fromUser?: string },
  ) {
    return this.analyticsService.giveKudos(this.extractTenantId(tenantId), payload);
  }
}


