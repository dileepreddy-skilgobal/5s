import { Controller, Get, Post, Body, Query, Param, BadRequestException } from '@nestjs/common';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { CurrentUser, CurrentUserId, TenantId } from '../../core/auth/current-user.decorator';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { MetricsService } from './metrics.service';
import { RequiresFeature } from '../../core/subscription/subscription.guard';
import { GamificationService, KUDOS_POINTS } from './gamification.service';
import { AwardTrophyDto, GiveKudosDto } from './dto/analytics.dto';
import { DataScopeService, LocationScope } from './data-scope.service';

@ApiTags('Analytics, Maturity, Heat Maps & Gamification')
@ApiBearerAuth()
@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly metrics: MetricsService,
    private readonly gamification: GamificationService,
    private readonly dataScope: DataScopeService,
  ) {}

  /** Data scope of the caller for management reporting (plant / department heads see their sub-tree only). */
  private async scopeFor(user: AuthenticatedUser, tenantId: string, orgNodeId?: string): Promise<LocationScope> {
    const scope = await this.dataScope.resolve(user, tenantId, RoleGroups.SITE_LEADERS);
    await this.dataScope.assertNodeVisible(tenantId, orgNodeId || undefined, scope);
    return scope;
  }

  @Get('scope')
  @Roles(...RoleGroups.SITE_LEADERS)
  @ApiOperation({ summary: 'Org units the analytics of the caller are limited to (unrestricted = whole organization)' })
  getScope(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.dataScope.describe(user, tenantId, RoleGroups.SITE_LEADERS);
  }

  @Get('maturity')
  @Roles(...RoleGroups.SITE_LEADERS)
  @ApiOperation({ summary: 'Get overall 5S maturity index, level, radar breakdown, and historical trend' })
  async getMaturityOverview(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('timeframe') timeframe?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('orgNodeId') orgNodeId?: string,
  ) {
    const scope = await this.scopeFor(user, tenantId, orgNodeId);
    return this.analyticsService.getMaturityOverview(tenantId, timeframe, from, to, orgNodeId || undefined, scope);
  }

  @Get('summary')
  @Roles(...RoleGroups.SITE_LEADERS)
  @ApiOperation({ summary: 'Executive summary: 5S score and change vs the previous period, open / overdue actions, audits done vs planned, best and weakest areas' })
  async getExecutiveSummary(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('timeframe') timeframe?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('orgNodeId') orgNodeId?: string,
  ) {
    const scope = await this.scopeFor(user, tenantId, orgNodeId);
    return this.metrics.executiveSummary(tenantId, this.metrics.resolvePeriod(timeframe, from, to), orgNodeId || undefined, scope);
  }

  @Get('area-maturity')
  @Roles(...RoleGroups.SITE_LEADERS)
  @ApiOperation({ summary: 'Maturity level of every area from its average audit score in the period' })
  async getAreaMaturity(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('timeframe') timeframe?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('orgNodeId') orgNodeId?: string,
  ) {
    const scope = await this.scopeFor(user, tenantId, orgNodeId);
    return this.metrics.areaMaturity(tenantId, this.metrics.resolvePeriod(timeframe, from, to), orgNodeId || undefined, scope);
  }

  @Get('kpis')
  @RequiresFeature('ADVANCED_ANALYTICS')
  @Roles(...RoleGroups.SITE_LEADERS)
  @ApiOperation({ summary: 'Management KPIs: 5S score, adherence, on-time closure, overdue, repeat & critical observations, red-tag ageing, maturity' })
  async getKpis(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('timeframe') timeframe?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('orgNodeId') orgNodeId?: string,
  ) {
    const scope = await this.scopeFor(user, tenantId, orgNodeId);
    return this.metrics.kpis(tenantId, this.metrics.resolvePeriod(timeframe, from, to), orgNodeId || undefined, scope);
  }

  @Get('trend')
  @RequiresFeature('ADVANCED_ANALYTICS')
  @Roles(...RoleGroups.SITE_LEADERS)
  @ApiOperation({ summary: 'Monthly score trend (3/6/12 months or custom period)' })
  async getTrend(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('timeframe') timeframe?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('orgNodeId') orgNodeId?: string,
  ) {
    const scope = await this.scopeFor(user, tenantId, orgNodeId);
    return this.metrics.trend(tenantId, this.metrics.resolvePeriod(timeframe ?? '6M', from, to), orgNodeId || undefined, scope);
  }

  @Get('drilldown')
  @RequiresFeature('ADVANCED_ANALYTICS')
  @Roles(...RoleGroups.SITE_LEADERS)
  @ApiOperation({ summary: 'Drill down the org hierarchy: enterprise → plant → department → area' })
  async getDrilldown(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Query('orgNodeId') orgNodeId?: string) {
    const scope = await this.scopeFor(user, tenantId, orgNodeId);
    return this.metrics.drilldown(tenantId, orgNodeId || undefined, scope);
  }

  @Get('drilldown/locations/:locationId')
  @RequiresFeature('ADVANCED_ANALYTICS')
  @Roles(...RoleGroups.SITE_LEADERS)
  @ApiOperation({ summary: 'Drill down an area to its audits and observations' })
  async getLocationAudits(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId') locationId: string,
    @Query('timeframe') timeframe?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const scope = await this.dataScope.resolve(user, tenantId, RoleGroups.SITE_LEADERS);
    await this.dataScope.assertLocationVisible(tenantId, locationId, scope);
    return this.metrics.locationAudits(tenantId, locationId, this.metrics.resolvePeriod(timeframe ?? '12M', from, to));
  }

  @Get('benchmark')
  @RequiresFeature('ADVANCED_ANALYTICS')
  @Roles(...RoleGroups.SITE_LEADERS)
  @ApiOperation({ summary: 'Benchmark plants, departments or areas for a period, optionally within an org unit' })
  async getBenchmark(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('level') level?: string,
    @Query('timeframe') timeframe?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('orgNodeId') orgNodeId?: string,
  ) {
    const lvl = (level ?? 'DEPARTMENT').toUpperCase();
    if (!['PLANT', 'DEPARTMENT', 'AREA'].includes(lvl)) {
      throw new BadRequestException('level must be PLANT, DEPARTMENT or AREA');
    }
    const scope = await this.scopeFor(user, tenantId, orgNodeId);
    return this.metrics.benchmark(tenantId, lvl as 'PLANT' | 'DEPARTMENT' | 'AREA', this.metrics.resolvePeriod(timeframe, from, to), orgNodeId || undefined, scope);
  }

  @Get('certification')
  @RequiresFeature('ADVANCED_ANALYTICS')
  @Roles(...RoleGroups.SITE_LEADERS)
  @ApiOperation({ summary: 'Internal certification (Bronze/Silver/Gold/Platinum) per area from configured rules' })
  async getCertification(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Query('orgNodeId') orgNodeId?: string) {
    const scope = await this.scopeFor(user, tenantId, orgNodeId);
    return this.metrics.certification(tenantId, orgNodeId || undefined, scope);
  }

  @Get('heatmap')
  @Roles(...RoleGroups.SITE_LEADERS)
  @ApiOperation({ summary: 'Get 2D workstation 5S compliance heatmap matrix' })
  async get5SHeatmap(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Query('orgNodeId') orgNodeId?: string) {
    const scope = await this.scopeFor(user, tenantId, orgNodeId);
    return this.analyticsService.get5SHeatmap(tenantId, orgNodeId || undefined, scope);
  }

  @Get('leaderboard')
  @Roles(...RoleGroups.SITE_LEADERS)
  @ApiOperation({ summary: 'Passing areas with the best latest audit (champions) and areas needing attention, optionally within a plant or department' })
  async getLeaderboard(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Query('orgNodeId') orgNodeId?: string) {
    const scope = await this.scopeFor(user, tenantId, orgNodeId);
    return this.analyticsService.getLeaderboard(tenantId, orgNodeId || undefined, scope);
  }

  // ==========================================================================
  // GAMIFICATION, TROPHIES & ENGAGEMENT ENDPOINTS
  // ==========================================================================
  @Get('gamification/overview')
  @RequiresFeature('GAMIFICATION')
  @ApiOperation({ summary: 'XP, level, rank and point breakdown for the current user (or ?userId= in the same tenant)' })
  getGamificationOverview(
    @TenantId() tenantId: string,
    @CurrentUserId() currentUserId: string,
    @Query('userId') userId?: string,
  ) {
    return this.gamification.getOverview(tenantId, userId || currentUserId);
  }

  @Get('gamification/leaderboards')
  @RequiresFeature('GAMIFICATION')
  @ApiOperation({ summary: 'Area, department and individual leaderboards, most improved, best auditor, top red-tag contributor' })
  getGamificationLeaderboards(@TenantId() tenantId: string) {
    return this.gamification.getLeaderboards(tenantId);
  }

  @Get('gamification/trophies')
  @RequiresFeature('GAMIFICATION')
  @ApiOperation({ summary: 'Floating trophies with current holder and suggested contender, Hall of Fame and kudos feed' })
  getGamificationTrophies(@TenantId() tenantId: string) {
    return this.gamification.getTrophies(tenantId);
  }

  @Get('gamification/badges')
  @RequiresFeature('GAMIFICATION')
  @ApiOperation({ summary: 'Milestone badges with progress for the current user (or ?userId= in the same tenant)' })
  getGamificationBadges(
    @TenantId() tenantId: string,
    @CurrentUserId() currentUserId: string,
    @Query('userId') userId?: string,
  ) {
    return this.gamification.getBadges(tenantId, userId || currentUserId);
  }

  @Post('gamification/award-trophy')
  @RequiresFeature('GAMIFICATION')
  @Roles(...RoleGroups.RECOGNITION_AWARDERS)
  @ApiOperation({ summary: 'Award or hand over a floating trophy; the previous holder moves to the Hall of Fame' })
  awardTrophy(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Body() payload: AwardTrophyDto,
  ) {
    return this.gamification.awardTrophy(tenantId, userId, payload);
  }

  @Post('gamification/kudos')
  @RequiresFeature('GAMIFICATION')
  @Roles(...RoleGroups.SHOPFLOOR_REPORTERS)
  @ApiOperation({ summary: `Send peer recognition (+${KUDOS_POINTS} XP to the recipient)` })
  giveKudos(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Body() payload: GiveKudosDto,
  ) {
    return this.gamification.giveKudos(tenantId, userId, payload);
  }
}
