import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../core/database/prisma.service';
import { CurrentUser, TenantId } from '../../core/auth/current-user.decorator';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantSettingsService } from '../../core/config/tenant-settings.service';
import { parseStoredSettings } from '../../core/config/tenant-settings';
import { titleSimilarity } from '../observations/repeat-detection';

const SEARCH_TYPES = ['locations', 'observations', 'actions', 'audits', 'redTags', 'standards', 'templates', 'users', 'orgUnits'] as const;
type SearchType = (typeof SEARCH_TYPES)[number];
const PER_TYPE = 6;
const DAY_MS = 86400000;
const OPEN_OBSERVATION_STATUSES = ['OPEN', 'ACTION_ASSIGNED', 'IN_PROGRESS', 'PENDING_VERIFICATION'];
const ACTIVE_RED_TAG_STATUSES = ['RED_TAGGED', 'IN_HOLDING_AREA', 'PENDING_DISPOSITION', 'DISPOSITION_APPROVED'];

/** Roles that may open each page a search hit links to (mirrors the route guards in frontend/src/App.tsx). */
const LOCATION_PAGE_ROLES = ['ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S', 'DEPT_HEAD', 'AREA_OWNER'];
const AUDITOR_HUB_ROLES = ['ORG_ADMIN', 'COORDINATOR_5S', 'AUDITOR', 'EXTERNAL_AUDITOR'];
const TEMPLATE_LIBRARY_ROLES = ['ORG_ADMIN', 'COORDINATOR_5S', 'AUDITOR', 'PLANT_HEAD'];

const hasAnyRole = (user: AuthenticatedUser, roles: readonly string[]) => user.isSuperAdmin || user.roles.some((r) => roles.includes(r));

/**
 * Result types the caller may see. People and org units link to administrator pages (and would expose
 * the staff directory), so they are limited to organization admins; templates and audits follow the
 * pages they open.
 */
const searchableTypes = (user: AuthenticatedUser): Set<SearchType> => {
  const types = new Set<SearchType>(['observations', 'actions', 'redTags', 'standards']);
  if (hasAnyRole(user, LOCATION_PAGE_ROLES)) types.add('locations');
  if (hasAnyRole(user, LOCATION_PAGE_ROLES) || hasAnyRole(user, AUDITOR_HUB_ROLES)) types.add('audits');
  if (hasAnyRole(user, TEMPLATE_LIBRARY_ROLES)) types.add('templates');
  if (hasAnyRole(user, RoleGroups.ORG_ADMINS)) {
    types.add('users');
    types.add('orgUnits');
  }
  return types;
};

interface SearchHit {
  type: SearchType;
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  link: string;
}

/** Cross-module search for the command bar (tenant-scoped, soft-deleted records excluded). */
@ApiTags('Search & Productivity')
@ApiBearerAuth()
@Controller('api/v1/search')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Search locations, observations, actions, audits, red tags, standards, templates, users and org units',
    description: 'Only result types whose pages the caller can open are searched (people and org units: organization admins).',
  })
  async search(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser, @Query('q') q = '', @Query('types') types?: string) {
    const term = q.trim();
    if (term.length < 2) throw new BadRequestException('Type at least 2 characters');
    if (term.length > 100) throw new BadRequestException('Search text is too long');
    const allowed = searchableTypes(user);
    const requested: readonly SearchType[] = types
      ? types.split(',').map((t) => t.trim()).filter((t): t is SearchType => (SEARCH_TYPES as readonly string[]).includes(t))
      : SEARCH_TYPES;
    const wanted = new Set<SearchType>(requested.filter((t) => allowed.has(t)));
    const canOpenLocations = hasAnyRole(user, LOCATION_PAGE_ROLES);
    const isProgramManager = hasAnyRole(user, RoleGroups.PROGRAM_MANAGERS);
    const like = { contains: term, mode: 'insensitive' as const };
    const take = PER_TYPE;
    const run = <T>(type: SearchType, fn: () => Promise<T[]>): Promise<T[]> => (wanted.has(type) ? fn() : Promise.resolve([]));

    const [locations, observations, actions, audits, redTags, standards, templates, users, orgUnits] = await Promise.all([
      run('locations', () => this.prisma.location.findMany({ where: { tenantId, OR: [{ areaCode: like }, { name: like }] }, take, select: { id: true, areaCode: true, name: true, status: true } })),
      run('observations', () => this.prisma.observation.findMany({ where: { tenantId, OR: [{ observationCode: like }, { title: like }] }, take, orderBy: { createdAt: 'desc' }, select: { id: true, observationCode: true, title: true, status: true } })),
      run('actions', () => this.prisma.correctiveAction.findMany({ where: { tenantId, OR: [{ actionCode: like }, { title: like }] }, take, orderBy: { createdAt: 'desc' }, select: { id: true, actionCode: true, title: true, status: true } })),
      run('audits', () => this.prisma.auditExecution.findMany({ where: { tenantId, auditCode: like }, take, orderBy: { startedAt: 'desc' }, select: { id: true, auditCode: true, status: true, overallScore: true, locationId: true, location: { select: { name: true } } } })),
      run('redTags', () => this.prisma.redTag.findMany({ where: { tenantId, OR: [{ tagNumber: like }, { itemName: like }] }, take, orderBy: { taggedDate: 'desc' }, select: { id: true, tagNumber: true, itemName: true, status: true } })),
      run('standards', () => this.prisma.standard.findMany({ where: { tenantId, OR: [{ code: like }, { title: like }] }, take, select: { id: true, code: true, title: true, status: true } })),
      run('templates', () => this.prisma.auditTemplate.findMany({ where: { tenantId, OR: [{ code: like }, { name: like }] }, take, select: { id: true, code: true, name: true, status: true } })),
      run('users', () => this.prisma.user.findMany({ where: { tenantId, status: 'ACTIVE', OR: [{ firstName: like }, { lastName: like }, { email: like }] }, take, select: { id: true, firstName: true, lastName: true, email: true, jobTitle: true } })),
      run('orgUnits', () => this.prisma.orgNode.findMany({ where: { tenantId, OR: [{ code: like }, { name: like }] }, take, select: { id: true, code: true, name: true, nodeType: true } })),
    ]);

    const hits: SearchHit[] = [
      ...locations.map((l) => ({ type: 'locations' as const, id: l.id, title: l.name, subtitle: l.areaCode, status: l.status, link: `/locations/${l.id}` })),
      ...observations.map((o) => ({ type: 'observations' as const, id: o.id, title: o.title, subtitle: o.observationCode, status: o.status, link: `/observations?id=${o.id}` })),
      ...actions.map((a) => ({ type: 'actions' as const, id: a.id, title: a.title, subtitle: a.actionCode, status: a.status, link: `/capa?id=${a.id}` })),
      ...audits.map((a) => ({ type: 'audits' as const, id: a.id, title: a.auditCode, subtitle: `${a.location.name}${a.status === 'IN_PROGRESS' ? '' : ` · ${a.overallScore}%`}`, status: a.status, link: canOpenLocations ? `/locations/${a.locationId}` : '/auditor-hub' })),
      ...redTags.map((t) => ({ type: 'redTags' as const, id: t.id, title: t.itemName, subtitle: t.tagNumber, status: t.status, link: `/red-tags?id=${t.id}` })),
      ...standards.map((s) => ({ type: 'standards' as const, id: s.id, title: s.title, subtitle: s.code, status: s.status, link: `/standards/${s.id}` })),
      ...templates.map((t) => ({ type: 'templates' as const, id: t.id, title: t.name, subtitle: t.code, status: t.status, link: isProgramManager ? `/templates/${t.id}/builder` : '/templates' })),
      ...users.map((u) => ({ type: 'users' as const, id: u.id, title: `${u.firstName} ${u.lastName}`, subtitle: u.jobTitle ?? u.email, status: null, link: '/roles-permissions' })),
      ...orgUnits.map((n) => ({ type: 'orgUnits' as const, id: n.id, title: n.name, subtitle: `${n.code} · ${n.nodeType}`, status: null, link: '/organization' })),
    ];
    return { query: term, total: hits.length, results: hits };
  }
}

/** Advisory duplicate checks shown before a record is created (creation is never blocked). */
@ApiTags('Search & Productivity')
@ApiBearerAuth()
@Controller('api/v1/duplicates')
export class DuplicatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: TenantSettingsService,
  ) {}

  @Get('observations')
  @ApiOperation({ summary: 'Open observations at the same location that look like the one being reported' })
  async observations(@TenantId() tenantId: string, @Query('locationId') locationId: string, @Query('title') title = '', @Query('category') category?: string) {
    if (!locationId || title.trim().length < 3) throw new BadRequestException('locationId and a title of at least 3 characters are required');
    const { repeatLookbackDays } = (await this.settings.get(tenantId)).analytics;
    const candidates = await this.prisma.observation.findMany({
      where: {
        tenantId,
        locationId,
        status: { in: OPEN_OBSERVATION_STATUSES },
        createdAt: { gte: new Date(Date.now() - repeatLookbackDays * DAY_MS) },
        ...(category ? { category } : {}),
      },
      select: { id: true, observationCode: true, title: true, category: true, severity: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return candidates
      .map((c) => ({ ...c, similarity: Math.round(titleSimilarity(c.title, title) * 100) / 100 }))
      .filter((c) => c.similarity >= 0.5)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }

  @Get('red-tags')
  @ApiOperation({ summary: 'Active red tags at the location for a similar item' })
  async redTags(@TenantId() tenantId: string, @Query('locationId') locationId: string, @Query('itemName') itemName = '') {
    if (!locationId || itemName.trim().length < 3) throw new BadRequestException('locationId and an item name of at least 3 characters are required');
    const tags = await this.prisma.redTag.findMany({
      where: { tenantId, locationId, status: { in: ACTIVE_RED_TAG_STATUSES } },
      select: { id: true, tagNumber: true, itemName: true, quantity: true, status: true, taggedDate: true },
      take: 200,
    });
    return tags
      .map((t) => ({ ...t, similarity: Math.round(titleSimilarity(t.itemName, itemName) * 100) / 100 }))
      .filter((t) => t.similarity >= 0.5 || t.itemName.trim().toLowerCase() === itemName.trim().toLowerCase())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }

  @Get('locations')
  @ApiOperation({ summary: 'Existing locations with a similar name (optionally within the same org unit)' })
  async locations(@TenantId() tenantId: string, @Query('name') name = '', @Query('orgNodeId') orgNodeId?: string) {
    if (name.trim().length < 3) throw new BadRequestException('name of at least 3 characters is required');
    const locs = await this.prisma.location.findMany({
      where: { tenantId, ...(orgNodeId ? { orgNodeId } : {}) },
      select: { id: true, areaCode: true, name: true, status: true },
    });
    return locs
      .map((l) => ({ ...l, similarity: Math.round(titleSimilarity(l.name, name) * 100) / 100 }))
      .filter((l) => l.similarity >= 0.6 || l.name.trim().toLowerCase() === name.trim().toLowerCase())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }
}

interface ChecklistStep {
  key: string;
  title: string;
  description: string;
  done: boolean;
  progress?: number;
  link: string;
  actionLabel: string;
  /** The step's page is open to organization admins only. */
  adminOnly?: boolean;
}

/** Setup progress for a new organization, computed from what actually exists. */
@ApiTags('Search & Productivity')
@ApiBearerAuth()
@Controller('api/v1/onboarding')
export class OnboardingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('checklist')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Go-live checklist: each step is complete when the corresponding data exists' })
  async checklist(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    const [tenant, plants, units, locations, ownedLocations, users, auditors, standards, templatesWithQuestions, schedules, audits, me] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { logoUrl: true, name: true, settings: true } }),
      this.prisma.orgNode.count({ where: { tenantId, nodeType: 'PLANT' } }),
      this.prisma.orgNode.count({ where: { tenantId, nodeType: { notIn: ['ENTERPRISE', 'PLANT'] } } }),
      this.prisma.location.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.location.count({ where: { tenantId, status: 'ACTIVE', ownerId: { not: null } } }),
      this.prisma.user.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.userRoleAssignment.count({ where: { tenantId, role: { code: { in: ['AUDITOR', 'COORDINATOR_5S'] } } } }),
      this.prisma.standard.count({ where: { tenantId } }),
      this.prisma.auditTemplate.count({ where: { tenantId, versions: { some: { sections: { some: { questions: { some: {} } } } } } } }),
      this.prisma.auditSchedule.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.auditExecution.count({ where: { tenantId, status: { in: ['SUBMITTED', 'DISPUTED', 'ACKNOWLEDGED'] } } }),
      this.prisma.user.findUnique({ where: { id: user.userId }, select: { mfaEnabled: true } }),
    ]);
    const isOrgAdmin = hasAnyRole(user, RoleGroups.ORG_ADMINS);
    // Defaults work out of the box, so these steps count as done once an administrator has saved the section
    const stored = parseStoredSettings(tenant?.settings);
    const scoringReviewed = !!stored.scoring || stored.analytics?.passScore !== undefined;
    const escalationReviewed = !!stored.escalation || !!stored.sla;
    const steps: ChecklistStep[] = [
      { key: 'branding', title: 'Add your organization logo', description: 'Shown on reports, certificates and the app header.', done: !!tenant?.logoUrl, link: '/settings', actionLabel: 'Open settings', adminOnly: true },
      { key: 'hierarchy', title: 'Build the organization structure', description: 'At least one plant and its departments or areas.', done: plants > 0 && units > 0, link: '/organization', actionLabel: 'Open structure', adminOnly: true },
      {
        key: 'locations',
        title: 'Register audit locations',
        description: 'Areas, lines and stores that will be audited.',
        done: locations > 0,
        // Coordinators add locations one by one; bulk import is for organization admins
        link: isOrgAdmin ? '/imports' : '/locations',
        actionLabel: isOrgAdmin ? 'Import locations' : 'Open locations',
      },
      {
        key: 'owners',
        title: 'Assign an owner to every location',
        description: 'Owners receive findings and corrective actions.',
        done: locations > 0 && ownedLocations === locations,
        progress: locations ? Math.round((ownedLocations / locations) * 100) : 0,
        link: '/locations',
        actionLabel: 'Assign owners',
      },
      { key: 'team', title: 'Invite your team', description: 'Add users individually or import them; each receives a welcome email.', done: users > 1, link: '/imports', actionLabel: 'Import users', adminOnly: true },
      { key: 'auditors', title: 'Nominate auditors', description: 'At least one auditor or 5S coordinator.', done: auditors > 0, link: '/roles-permissions', actionLabel: 'Assign roles', adminOnly: true },
      {
        key: 'scoring',
        title: 'Confirm scoring rules',
        description: 'Pass mark, target score, scoring method and the critical-fail cap. Saving the Scoring settings completes this step.',
        done: scoringReviewed,
        link: '/settings?section=scoring',
        actionLabel: 'Review scoring',
        adminOnly: true,
      },
      {
        key: 'escalation',
        title: 'Confirm action deadlines and escalation',
        description: 'SLA per severity and who is reminded as actions fall behind. Saving the SLA or Escalation settings completes this step.',
        done: escalationReviewed,
        link: '/settings?section=escalation',
        actionLabel: 'Review escalation',
        adminOnly: true,
      },
      { key: 'standards', title: 'Publish your 5S standards', description: 'The reference each audit question is judged against.', done: standards > 0, link: '/standards', actionLabel: 'Add standards' },
      { key: 'template', title: 'Prepare an audit checklist', description: 'A template with questions (or import questions from Excel).', done: templatesWithQuestions > 0, link: '/templates', actionLabel: 'Open templates' },
      { key: 'schedule', title: 'Schedule recurring audits', description: 'Upcoming audits are generated from the schedule.', done: schedules > 0, link: '/schedules', actionLabel: 'Create schedule' },
      { key: 'firstAudit', title: 'Complete the first audit', description: 'Use the web app, or the mobile app (which also works offline).', done: audits > 0, link: '/auditor-hub', actionLabel: 'Start an audit' },
      {
        key: 'security',
        title: isOrgAdmin ? 'Protect your administrator account' : 'Protect your account',
        description: 'Turn on two-factor authentication.',
        done: !!me?.mfaEnabled,
        link: '/account/security',
        actionLabel: 'Set up 2FA',
      },
    ];
    // Steps on administrator-only pages stay in the list (they are part of go-live) but carry no link for others
    const visibleSteps = steps.map(({ adminOnly, ...step }) => {
      const askAdmin = !!adminOnly && !isOrgAdmin;
      return { ...step, link: askAdmin ? null : step.link, actionLabel: askAdmin ? null : step.actionLabel, adminOnly: askAdmin };
    });
    const completed = visibleSteps.filter((s) => s.done).length;
    return { organization: tenant?.name, completed, total: visibleSteps.length, percent: Math.round((completed / visibleSteps.length) * 100), steps: visibleSteps };
  }
}
