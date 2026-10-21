/**
 * Demo data: one company, one plant, four areas.
 *
 * SkilGlobal Precision Manufacturing Ltd runs the Bengaluru Plant with two departments:
 *   - Machining: CNC Machining Cell and Tool Crib (area owner Arun Patel, department head Suresh Menon)
 *   - Assembly:  Assembly Line 1 and Packing & Dispatch (area owner Deepa Krishnan; Packing also holds red-tagged items)
 *
 * Who is who (password for everyone: Admin@123456):
 *   Vikram Malhotra  superadmin@skilglobal.com         platform super admin
 *   Pooja Sharma     admin@skilglobal.com              organization admin
 *   Rajesh Kumar     planthead.blr@skilglobal.com      plant head (Bengaluru Plant)
 *   Sneha Reddy      coordinator.5s@skilglobal.com     5S coordinator: owns standards, raises and verifies actions
 *   Suresh Menon     depthead.machining@skilglobal.com head of Machining
 *   Arun Patel       owner.cnc01@skilglobal.com        area owner, Machining (badge BADGE-OP-049, PIN 5544)
 *   Deepa Krishnan   owner.asm01@skilglobal.com        area owner, Assembly (badge BADGE-OP-050, PIN 6655)
 *   Amit Joshi       auditor.lead@skilglobal.com       auditor: does the monthly audits (badge BADGE-AUD-001, PIN 7766)
 *   Kavita Iyer      executive@skilglobal.com          executive (read-only dashboards)
 *   Ravi Singh       operator.ravi@skilglobal.com      assembly operator: reports problems he sees
 *
 * Story: Amit audits all four areas once a month with the '5S Area Audit'. Scores improved over the last three
 * months and this month's audits are planned. Open work: a few observations, four corrective actions (one of
 * them overdue) and four red tags at different stages. Recognition: three floating trophies are held (with past
 * holders in the hall of fame) and colleagues have sent each other a dozen kudos over the last two months.
 *
 * Photos: every area, finding, fix, standard and red tag has an illustrated sample photo (see seed-images.ts), stored
 * like an upload (file storage + StoredFile row with a thumbnail), and the organization has a logo.
 *
 * Re-runnable: everything except the subscription plan catalogue is wiped first.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import sharp = require('../src/core/storage/sharp');
import { createStorageDriver } from '../src/core/storage/storage.driver';
import { FILE_PATH } from '../src/core/storage/files.service';
import { MAX_RATING, ScoringQuestion, scoreAudit } from '../src/modules/audit-executions/scoring';
import { renderLogo, renderScene, SceneName } from './seed-images';

const prisma = new PrismaClient();

const DAY_MS = 86400000;
const now = new Date();

/** `days` from now (negative = in the past), optionally at a fixed local hour. */
function daysFromNow(days: number, hour?: number): Date {
  const d = new Date(now.getTime() + days * DAY_MS);
  if (hour !== undefined) d.setHours(hour, 0, 0, 0);
  return d;
}

/** A day in the month `monthsAgo` calendar months before this one. */
function dayInPastMonth(monthsAgo: number, day: number, hour: number, minute = 0): Date {
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo, day, hour, minute, 0, 0);
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const storage = createStorageDriver();

/**
 * Stores an image the way an upload is stored (same key layout, thumbnail and StoredFile row as FilesService.store)
 * and returns the canonical reference that records hold.
 */
async function storeImage(tenantId: string, uploadedById: string | null, buffer: Buffer, contentType: 'image/jpeg' | 'image/png', originalName: string, source: string, createdAt = now): Promise<string> {
  const id = randomUUID();
  const extension = contentType === 'image/png' ? 'png' : 'jpg';
  const key = `${tenantId}/${createdAt.getUTCFullYear()}/${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}/${id}.${extension}`;
  const meta = await sharp(buffer).metadata();
  const thumb = await sharp(buffer).resize({ width: 320, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
  await storage.put(`${key}.thumb.webp`, thumb, 'image/webp');
  await storage.put(key, buffer, contentType);
  await prisma.storedFile.create({
    data: {
      id,
      tenantId,
      storageKey: key,
      thumbnailKey: `${key}.thumb.webp`,
      originalName,
      contentType,
      sizeBytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      width: meta.width ?? null,
      height: meta.height ?? null,
      uploadedById,
      source,
      createdAt,
    },
  });
  return `${FILE_PATH}${id}`;
}

/**
 * Next code for a numbering prefix, in the same format the app generates
 * (`<KIND>-<first 4 letters/digits of the area code>-<year>-<0001>`), so new records continue the sequence.
 */
const sequences = new Map<string, number>();
function nextCode(kind: string, areaCode: string, at: Date): string {
  const fragment = areaCode.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase() || 'LOC';
  const prefix = `${kind}-${fragment}-${at.getFullYear()}-`;
  const n = (sequences.get(prefix) ?? 0) + 1;
  sequences.set(prefix, n);
  return `${prefix}${String(n).padStart(4, '0')}`;
}

/** Every table except "Plan" (the subscription plan catalogue) and "ActivityLog" (append-only: a trigger rejects TRUNCATE). */
const TABLES_TO_WIPE = [
  'Tenant', 'User', 'Role', 'Permission', 'UserRoleAssignment', 'OrgNode', 'Location', 'LocationTimeline',
  'LocationDocument', 'LocationEvidence', 'LocationAuditLog', 'Standard', 'StandardRevision', 'AuditTemplate',
  'AuditTemplateVersion', 'AuditTemplateSection', 'AuditTemplateQuestion', 'AuditSchedule', 'ScheduledAuditInstance',
  'AuditExecution', 'AuditAnswer', 'Observation', 'CorrectiveAction', 'ActionHistoryLog', 'RedTag', 'TrophyAward',
  'Kudos', 'TrainingCertificate', 'TrainingProgress', 'Notification', 'PushDevice', 'StoredFile', 'AuthSession',
  'PasswordResetToken', 'ApiKey', 'WebhookEndpoint', 'WebhookDelivery', 'JobLease', 'RoutineItem', 'RoutineCheck',
];

interface UserSeed {
  key: string;
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: string;
  roleCode: string;
  isSuperAdmin?: boolean;
  badgeId?: string;
  pin?: string;
  /** Org node the role applies to (line managers see only their part of the organization). */
  scopeNode?: 'plant' | 'machining';
}

interface QuestionSeed {
  code: string;
  text: string;
  guidance: string;
  type: 'YES_NO' | 'NUMERIC_0_5';
  severity: 'MINOR' | 'MODERATE' | 'MAJOR' | 'CRITICAL';
  isCritical?: boolean;
  scoreCapOnFail?: number;
  standardKey?: string;
}

interface SectionSeed {
  category: string;
  title: string;
  description: string;
  questions: QuestionSeed[];
}

interface SeededQuestion {
  id: string;
  code: string;
  sectionId: string;
  category: string;
  type: QuestionSeed['type'];
  severity: QuestionSeed['severity'];
  isCritical: boolean;
}

async function main() {
  console.log('Seeding demo data for SkilGlobal Precision Manufacturing Ltd...');

  // ---------------------------------------------------------------- 1. Wipe
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES_TO_WIPE.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);

  // ---------------------------------------------------------------- 2. Tenant
  // Plans are created by the API on first start; link the Enterprise plan when it already exists
  const plan = await prisma.plan.findUnique({ where: { code: 'ENTERPRISE' } });
  const tenant = await prisma.tenant.create({
    data: {
      name: 'SkilGlobal Precision Manufacturing Ltd',
      slug: 'skilglobal-mfg',
      status: 'ACTIVE',
      industry: 'Manufacturing',
      planId: plan?.id ?? null,
      ...(plan ? { storageQuotaMb: plan.storageQuotaMb } : {}),
      billingEmail: 'admin@skilglobal.com',
      hierarchyConfig: JSON.stringify(['Org', 'Plant', 'Department', 'Area', 'Zone', 'Workstation']),
      settings: JSON.stringify({
        brandColor: '#1E3A8A',
        defaultAuditFrequency: 'MONTHLY',
      }),
    },
  });
  const tenantId = tenant.id;

  // ---------------------------------------------------------------- 3. Roles
  const rolesData = [
    { code: 'SUPER_ADMIN', name: 'SaaS Super Administrator', desc: 'Full multi-tenant governance.' },
    { code: 'ORG_ADMIN', name: 'Organisation Administrator', desc: 'Full administrative control.' },
    { code: 'PLANT_HEAD', name: 'Plant Head / Site Director', desc: 'Site-level visibility.' },
    { code: 'COORDINATOR_5S', name: '5S Program Coordinator', desc: 'Governance and standard authoring.' },
    { code: 'DEPT_HEAD', name: 'Department Head', desc: 'Department compliance management.' },
    { code: 'AREA_OWNER', name: 'Area / Zone Owner', desc: 'Accountable for daily 5S standards.' },
    { code: 'AUDITOR', name: 'Certified 5S Auditor', desc: 'Conducts mobile audits and logs findings.' },
    { code: 'EMPLOYEE', name: 'Shop-Floor Employee', desc: 'Report abnormalities.' },
    { code: 'EXTERNAL_AUDITOR', name: 'External Consultant', desc: 'Read-only assessment.' },
    { code: 'EXECUTIVE', name: 'Executive Management', desc: 'Read-only dashboards, summaries and comparisons.' },
  ];
  const roleIds = new Map<string, string>();
  for (const r of rolesData) {
    const role = await prisma.role.create({
      data: { tenantId, code: r.code, name: r.name, description: r.desc, isSystemDefault: true },
    });
    roleIds.set(r.code, role.id);
  }

  // ---------------------------------------------------------------- 4. Organization
  const company = await prisma.orgNode.create({
    data: { tenantId, name: 'SkilGlobal Precision Manufacturing Ltd', code: 'SKILGLOBAL', nodeType: 'ENTERPRISE', path: `/${tenantId}/SKILGLOBAL/`, depth: 0 },
  });
  const plant = await prisma.orgNode.create({
    data: { tenantId, parentId: company.id, name: 'Bengaluru Plant', code: 'BLR-PLANT-01', nodeType: 'PLANT', path: `${company.path}BLR-PLANT-01/`, depth: 1, sortOrder: 1 },
  });
  const machining = await prisma.orgNode.create({
    data: { tenantId, parentId: plant.id, name: 'Machining', code: 'BLR-DEPT-MACH', nodeType: 'DEPARTMENT', path: `${plant.path}BLR-DEPT-MACH/`, depth: 2, sortOrder: 1 },
  });
  const assembly = await prisma.orgNode.create({
    data: { tenantId, parentId: plant.id, name: 'Assembly', code: 'BLR-DEPT-ASM', nodeType: 'DEPARTMENT', path: `${plant.path}BLR-DEPT-ASM/`, depth: 2, sortOrder: 2 },
  });
  const scopeNodes = { plant: plant.id, machining: machining.id };

  // ---------------------------------------------------------------- 5. Users
  const passwordHash = await bcrypt.hash('Admin@123456', 10);
  const usersData: UserSeed[] = [
    { key: 'vikram', email: 'superadmin@skilglobal.com', firstName: 'Vikram', lastName: 'Malhotra', jobTitle: 'Platform Administrator', department: 'IT', roleCode: 'SUPER_ADMIN', isSuperAdmin: true },
    { key: 'pooja', email: 'admin@skilglobal.com', firstName: 'Pooja', lastName: 'Sharma', jobTitle: 'Operations Excellence Manager', department: 'Operations', roleCode: 'ORG_ADMIN' },
    { key: 'rajesh', email: 'planthead.blr@skilglobal.com', firstName: 'Rajesh', lastName: 'Kumar', jobTitle: 'Plant Head', department: 'Bengaluru Plant', roleCode: 'PLANT_HEAD', scopeNode: 'plant' },
    { key: 'sneha', email: 'coordinator.5s@skilglobal.com', firstName: 'Sneha', lastName: 'Reddy', jobTitle: '5S Coordinator', department: 'Continuous Improvement', roleCode: 'COORDINATOR_5S' },
    { key: 'suresh', email: 'depthead.machining@skilglobal.com', firstName: 'Suresh', lastName: 'Menon', jobTitle: 'Machining Manager', department: 'Machining', roleCode: 'DEPT_HEAD', scopeNode: 'machining' },
    { key: 'arun', email: 'owner.cnc01@skilglobal.com', firstName: 'Arun', lastName: 'Patel', jobTitle: 'CNC Team Leader', department: 'Machining', roleCode: 'AREA_OWNER', badgeId: 'BADGE-OP-049', pin: '5544' },
    { key: 'deepa', email: 'owner.asm01@skilglobal.com', firstName: 'Deepa', lastName: 'Krishnan', jobTitle: 'Assembly Team Leader', department: 'Assembly', roleCode: 'AREA_OWNER', badgeId: 'BADGE-OP-050', pin: '6655' },
    { key: 'amit', email: 'auditor.lead@skilglobal.com', firstName: 'Amit', lastName: 'Joshi', jobTitle: '5S Auditor', department: 'Quality', roleCode: 'AUDITOR', badgeId: 'BADGE-AUD-001', pin: '7766' },
    { key: 'kavita', email: 'executive@skilglobal.com', firstName: 'Kavita', lastName: 'Iyer', jobTitle: 'Chief Operating Officer', department: 'Management', roleCode: 'EXECUTIVE' },
    { key: 'ravi', email: 'operator.ravi@skilglobal.com', firstName: 'Ravi', lastName: 'Singh', jobTitle: 'Assembly Operator', department: 'Assembly', roleCode: 'EMPLOYEE' },
  ];
  const userIds = new Map<string, string>();
  const userNames = new Map<string, string>();
  for (const u of usersData) {
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        jobTitle: u.jobTitle,
        department: u.department,
        status: 'ACTIVE',
        isSuperAdmin: u.isSuperAdmin ?? false,
        ...(u.badgeId && u.pin ? { badgeId: u.badgeId, pinHash: await bcrypt.hash(u.pin, 10) } : {}),
      },
    });
    await prisma.userRoleAssignment.create({
      data: { tenantId, userId: user.id, roleId: roleIds.get(u.roleCode), orgNodeId: u.scopeNode ? scopeNodes[u.scopeNode] : null },
    });
    userIds.set(u.key, user.id);
    userNames.set(u.key, `${u.firstName} ${u.lastName}`);
  }
  const uid = (key: string) => userIds.get(key);
  const uname = (key: string) => userNames.get(key);

  // ---------------------------------------------------------------- Photos and logo
  /** One stored file per sample photo; records showing the same scene share it. */
  const photoRefs = new Map<SceneName, string>();
  const photo = async (scene: SceneName, uploadedBy: string, source: string, at: Date): Promise<string> => {
    if (!photoRefs.has(scene)) {
      photoRefs.set(scene, await storeImage(tenantId, uid(uploadedBy), await renderScene(scene), 'image/jpeg', `${scene}.jpg`, source, at));
    }
    return photoRefs.get(scene);
  };
  const logoUrl = await storeImage(tenantId, uid('pooja'), await renderLogo(), 'image/png', 'skilglobal-logo.png', 'tenants.logoUrl');
  await prisma.tenant.update({ where: { id: tenantId }, data: { logoUrl } });

  // ---------------------------------------------------------------- 6. Locations
  const setupDate = dayInPastMonth(4, 1, 9);
  const locationSeeds = [
    {
      key: 'cnc', areaCode: 'LOC-BLR-MACH-CNC01', name: 'CNC Machining Cell', orgNodeId: machining.id, locationType: 'PRODUCTION_LINE',
      riskLevel: 'HIGH', owner: 'arun', backup: 'suresh', building: 'Building A', floor: 'Ground floor',
      description: 'Three CNC machines with a shared tool shadow board.', photo: 'cncCell' as SceneName,
    },
    {
      key: 'crib', areaCode: 'LOC-BLR-MACH-TOOL01', name: 'Tool Crib', orgNodeId: machining.id, locationType: 'WAREHOUSE_BAY',
      riskLevel: 'LOW', owner: 'arun', backup: 'suresh', building: 'Building A', floor: 'Ground floor',
      description: 'Storage for cutting tools, gauges and spare parts used by Machining.', photo: 'toolCrib' as SceneName,
    },
    {
      key: 'line1', areaCode: 'LOC-BLR-ASM-LINE01', name: 'Assembly Line 1', orgNodeId: assembly.id, locationType: 'PRODUCTION_LINE',
      riskLevel: 'MEDIUM', owner: 'deepa', backup: null, building: 'Building B', floor: 'Ground floor',
      description: 'Six-station assembly line for gearbox housings.', photo: 'assemblyLine' as SceneName,
    },
    {
      key: 'pack', areaCode: 'LOC-BLR-ASM-PACK01', name: 'Packing & Dispatch', orgNodeId: assembly.id, locationType: 'WAREHOUSE_BAY',
      riskLevel: 'MEDIUM', owner: 'deepa', backup: null, building: 'Building B', floor: 'Ground floor',
      description: 'Packing tables, dispatch bay and the plant red-tag holding corner.', photo: 'packing' as SceneName,
    },
  ];
  const locations = new Map<string, { id: string; areaCode: string; name: string; owner: string }>();
  for (const l of locationSeeds) {
    const loc = await prisma.location.create({
      data: {
        tenantId,
        orgNodeId: l.orgNodeId,
        areaCode: l.areaCode,
        name: l.name,
        locationType: l.locationType,
        riskLevel: l.riskLevel,
        auditFrequency: 'MONTHLY',
        building: l.building,
        floor: l.floor,
        description: l.description,
        heroPhotoUrl: await photo(l.photo, 'pooja', 'locations.heroPhotoUrl', setupDate),
        qrCodeData: `5s://${encodeURIComponent(tenantId)}/locations/${encodeURIComponent(l.areaCode)}`,
        status: 'ACTIVE',
        ownerId: uid(l.owner),
        backupOwnerId: l.backup ? uid(l.backup) : null,
        createdAt: setupDate,
      },
    });
    locations.set(l.key, { id: loc.id, areaCode: loc.areaCode, name: loc.name, owner: l.owner });
  }
  const loc = (key: string) => locations.get(key);

  // ---------------------------------------------------------------- 7. Standards
  const standardSeeds = [
    {
      key: 'shadow', code: 'STD-2S-001', title: 'Tool shadow board layout', category: 'S2_SET_IN_ORDER',
      scopeType: 'DEPARTMENT', targetOrgNodeId: machining.id, approver: 'sneha',
      description: 'How tools are stored on the shadow boards in Machining.',
      rules: [
        'Every tool has its own outlined place on the board.',
        'Each place is labelled with the tool name.',
        'A tool in use is replaced by a "tool in use" tag with the user\'s name.',
        'All tools are back on the board at the end of each shift.',
      ],
      photos: [
        { type: 'STANDARD_CONDITION', scene: 'toolsOnBoard' as SceneName, label: 'Correct', description: 'Every tool in its outlined place.' },
        { type: 'CURRENT_CONDITION', scene: 'toolsOffBoard' as SceneName, label: 'Not correct', description: 'Tools left on the bench; their places on the board are empty.' },
      ],
    },
    {
      key: 'floor', code: 'STD-2S-002', title: 'Floor marking colours', category: 'S2_SET_IN_ORDER',
      scopeType: 'GLOBAL', targetOrgNodeId: null, approver: 'rajesh',
      description: 'One colour scheme for floor markings across the plant.',
      rules: [
        'Yellow: walkways and work area borders.',
        'Red: red-tag area and fire equipment (keep 1 metre clear).',
        'Green: finished goods.',
        'Blue: raw material and parts.',
        'Damaged or faded markings are repainted within one week.',
      ],
      photos: [{ type: 'STANDARD_CONDITION', scene: 'floorColours' as SceneName, label: 'Colour scheme', description: 'Yellow walkways, green finished goods, blue raw material, red fire equipment box.' }],
    },
    {
      key: 'cleaning', code: 'STD-3S-001', title: 'Daily cleaning checklist', category: 'S3_SHINE',
      scopeType: 'GLOBAL', targetOrgNodeId: null, approver: 'sneha',
      description: 'Ten-minute cleaning routine at the end of every shift.',
      rules: [
        'Sweep the floor of the work area.',
        'Wipe machine covers and control panels.',
        'Empty chip trays and scrap bins.',
        'Report leaks or damage straight away.',
        'Tick the checklist on the area board.',
      ],
      photos: [{ type: 'STANDARD_CONDITION', scene: 'cleanMachine' as SceneName, label: 'End of shift', description: 'Clean machine and the ticked checklist on the area board.' }],
    },
  ];
  const standardIds = new Map<string, string>();
  for (const s of standardSeeds) {
    const standard = await prisma.standard.create({
      data: {
        tenantId,
        code: s.code,
        title: s.title,
        category: s.category,
        scopeType: s.scopeType,
        targetOrgNodeId: s.targetOrgNodeId,
        status: 'PUBLISHED',
        createdAt: setupDate,
      },
    });
    await prisma.standardRevision.create({
      data: {
        tenantId,
        standardId: standard.id,
        revisionNumber: '1.0',
        description: s.description,
        rules: JSON.stringify(s.rules),
        referencePhotos: JSON.stringify(
          await Promise.all(s.photos.map(async (p) => ({ type: p.type, photoUrl: await photo(p.scene, 'sneha', 'standardRevisions.referencePhotos', setupDate), label: p.label, description: p.description }))),
        ),
        effectiveDate: setupDate,
        revisionComments: 'First version.',
        authorId: uid('sneha'),
        approvedById: uid(s.approver),
        approvedAt: setupDate,
        approvalComments: 'Approved for use.',
        isCurrent: true,
        createdAt: setupDate,
      },
    });
    standardIds.set(s.key, standard.id);
  }

  // ---------------------------------------------------------------- 8. Audit template
  const template = await prisma.auditTemplate.create({
    data: {
      tenantId,
      code: 'TPL-5S-AREA-01',
      name: '5S Area Audit',
      description: 'Monthly audit of a work area: two questions for each of the six pillars.',
      auditType: 'ROUTINE',
      categoryScoringModel: JSON.stringify({ S1: 20, S2: 20, S3: 20, S4: 20, S5: 20 }),
      status: 'ACTIVE',
      createdAt: setupDate,
    },
  });
  const version = await prisma.auditTemplateVersion.create({
    data: {
      tenantId,
      templateId: template.id,
      versionNumber: '1.0',
      changeSummary: 'First version.',
      isPublished: true,
      publishedAt: setupDate,
      publishedById: uid('sneha'),
      createdAt: setupDate,
    },
  });

  const sectionSeeds: SectionSeed[] = [
    {
      category: 'S1_SORT', title: '1S Sort', description: 'Only what is needed is kept in the area.',
      questions: [
        { code: 'Q-SORT-01', type: 'YES_NO', severity: 'MODERATE', text: 'Are only the items needed for today\'s work kept in the area?', guidance: 'Check benches, shelves and under machines.' },
        { code: 'Q-SORT-02', type: 'NUMERIC_0_5', severity: 'MINOR', text: 'How well are unneeded items red-tagged and removed?', guidance: '0 = not at all, 5 = every unneeded item is tagged or gone.' },
      ],
    },
    {
      category: 'S2_SET_IN_ORDER', title: '2S Set in order', description: 'Everything has a marked place and is in it.',
      questions: [
        { code: 'Q-SET-01', type: 'YES_NO', severity: 'MODERATE', standardKey: 'shadow', text: 'Is every tool on the shadow board in its marked place?', guidance: 'Missing tools need a "tool in use" tag.' },
        { code: 'Q-SET-02', type: 'NUMERIC_0_5', severity: 'MINOR', standardKey: 'floor', text: 'How clear and complete are the floor markings and labels?', guidance: 'Compare with the floor marking colours standard.' },
      ],
    },
    {
      category: 'S3_SHINE', title: '3S Shine', description: 'The area and equipment are clean.',
      questions: [
        { code: 'Q-SHINE-01', type: 'YES_NO', severity: 'MAJOR', text: 'Are the floor and machines free of oil, dust and scrap?', guidance: 'Look under and behind machines too.' },
        { code: 'Q-SHINE-02', type: 'NUMERIC_0_5', severity: 'MINOR', standardKey: 'cleaning', text: 'How well is the daily cleaning checklist being followed?', guidance: 'Check the ticks on the area board for the last week.' },
      ],
    },
    {
      category: 'S4_STANDARDIZE', title: '4S Standardize', description: 'Standards are visible and followed.',
      questions: [
        { code: 'Q-STD-01', type: 'YES_NO', severity: 'MODERATE', text: 'Are the area\'s 5S standards displayed and up to date?', guidance: 'The board shows the current version of each standard.' },
        { code: 'Q-STD-02', type: 'NUMERIC_0_5', severity: 'MINOR', text: 'How closely does the area match its standards?', guidance: '0 = not at all, 5 = exactly as described.' },
      ],
    },
    {
      category: 'S5_SUSTAIN', title: '5S Sustain', description: 'Good habits are kept up.',
      questions: [
        { code: 'Q-SUS-01', type: 'YES_NO', severity: 'MODERATE', text: 'Were the actions from the last audit completed on time?', guidance: 'Check the corrective actions for this area.' },
        { code: 'Q-SUS-02', type: 'NUMERIC_0_5', severity: 'MINOR', text: 'How well does the team do its daily 5S checks?', guidance: 'Look at the daily checks for the last two weeks.' },
      ],
    },
    {
      category: 'S6_SAFETY', title: '6S Safety', description: 'The area is safe to work in.',
      questions: [
        { code: 'Q-SAFE-01', type: 'YES_NO', severity: 'CRITICAL', isCritical: true, scoreCapOnFail: 70, standardKey: 'floor', text: 'Are fire extinguishers, exits and walkways clear?', guidance: 'Any "No" limits the audit score to 70%.' },
        { code: 'Q-SAFE-02', type: 'NUMERIC_0_5', severity: 'MODERATE', text: 'How consistently is the required safety gear worn?', guidance: 'Safety shoes, glasses and gloves where signposted.' },
      ],
    },
  ];

  const questions: SeededQuestion[] = [];
  for (let s = 0; s < sectionSeeds.length; s++) {
    const sec = sectionSeeds[s];
    const section = await prisma.auditTemplateSection.create({
      data: { tenantId, templateVersionId: version.id, title: sec.title, description: sec.description, category: sec.category, sortOrder: s + 1 },
    });
    for (let q = 0; q < sec.questions.length; q++) {
      const qs = sec.questions[q];
      const question = await prisma.auditTemplateQuestion.create({
        data: {
          tenantId,
          sectionId: section.id,
          questionCode: qs.code,
          questionText: qs.text,
          guidance: qs.guidance,
          standardId: qs.standardKey ? standardIds.get(qs.standardKey) : null,
          questionType: qs.type,
          weightage: 1,
          severity: qs.severity,
          isCritical: qs.isCritical ?? false,
          scoreCapOnFail: qs.scoreCapOnFail ?? null,
          sortOrder: q + 1,
        },
      });
      questions.push({ id: question.id, code: qs.code, sectionId: section.id, category: sec.category, type: qs.type, severity: qs.severity, isCritical: qs.isCritical ?? false });
    }
  }
  const scoringQuestions = new Map<string, ScoringQuestion>(
    questions.map((q) => [q.id, { id: q.id, weightage: 1, isCritical: q.isCritical, scoreCapOnFail: q.isCritical ? 70 : null, severity: q.severity }]),
  );
  const sectionCategories = new Map<string, string>(questions.map((q) => [q.sectionId, q.category]));
  const scoringRules = { passScore: 70, criticalFailCap: 70, findingThresholdPercent: 60, pillarWeights: null };

  /**
   * Ratings (0–5) per question code that give `targetPercent` of the 60 available points: forced "No" answers
   * first, then the weakest pillars' rating questions are lowered (not below 2), then further "No" answers.
   */
  function planRatings(targetPercent: number, weakOrder: string[], forceNo: string[] = []): Map<string, number> {
    const ratings = new Map<string, number>(questions.map((q) => [q.code, MAX_RATING]));
    let drop = questions.length * MAX_RATING - Math.round((targetPercent / 100) * questions.length * MAX_RATING);
    for (const code of forceNo) {
      ratings.set(code, 0);
      drop -= MAX_RATING;
    }
    const ofType = (type: QuestionSeed['type']) =>
      weakOrder.map((cat) => questions.find((q) => q.category === cat && q.type === type)).filter((q) => q && !q.isCritical);
    for (const q of ofType('NUMERIC_0_5')) {
      while (drop > 0 && ratings.get(q.code) > 2) {
        ratings.set(q.code, ratings.get(q.code) - 1);
        drop--;
      }
    }
    for (const q of ofType('YES_NO')) {
      if (drop <= 0) break;
      if (ratings.get(q.code) === 0) continue;
      ratings.set(q.code, 0);
      drop -= MAX_RATING;
    }
    // Give back points when a "No" overshot the target
    for (const q of ofType('NUMERIC_0_5').reverse()) {
      while (drop < 0 && ratings.get(q.code) < MAX_RATING) {
        ratings.set(q.code, ratings.get(q.code) + 1);
        drop++;
      }
    }
    if (drop !== 0) throw new Error(`Cannot reach ${targetPercent}% with the audit questions`);
    return ratings;
  }

  // ---------------------------------------------------------------- 9 & 10. Schedule, audit history, this month's audits
  const firstAuditDay = (areaIndex: number) => 6 + areaIndex * 4;
  const schedule = await prisma.auditSchedule.create({
    data: {
      tenantId,
      scheduleCode: `SCHED-${now.getFullYear()}-0001`,
      title: 'Monthly 5S audit - Bengaluru Plant',
      templateId: template.id,
      templateVersionId: version.id,
      auditType: 'ROUTINE',
      targetType: 'ALL_AREAS',
      targetLocationIds: JSON.stringify([]),
      recurrence: 'MONTHLY',
      recurrenceIntervalDays: 30,
      preferredAuditorId: uid('amit'),
      rotationRule: 'ASSIGNED_AUDITOR',
      startDate: dayInPastMonth(3, firstAuditDay(0), 9),
      leadTimeDays: 3,
      status: 'ACTIVE',
      createdAt: setupDate,
    },
  });

  interface AuditPlan {
    area: string;
    scores: [number, number, number]; // three months ago, two months ago, last month
    weakOrder: string[];
    /** Questions answered "No" in last month's audit (they became the findings below). */
    lastMonthNo: string[];
  }
  const auditPlans: AuditPlan[] = [
    { area: 'cnc', scores: [62, 71, 80], weakOrder: ['S3_SHINE', 'S1_SORT', 'S2_SET_IN_ORDER', 'S5_SUSTAIN', 'S4_STANDARDIZE', 'S6_SAFETY'], lastMonthNo: ['Q-SHINE-01'] },
    { area: 'crib', scores: [70, 74, 78], weakOrder: ['S2_SET_IN_ORDER', 'S1_SORT', 'S4_STANDARDIZE', 'S3_SHINE', 'S5_SUSTAIN', 'S6_SAFETY'], lastMonthNo: ['Q-SET-01'] },
    { area: 'line1', scores: [55, 63, 72], weakOrder: ['S3_SHINE', 'S2_SET_IN_ORDER', 'S1_SORT', 'S5_SUSTAIN', 'S4_STANDARDIZE', 'S6_SAFETY'], lastMonthNo: [] },
    { area: 'pack', scores: [81, 84, 88], weakOrder: ['S2_SET_IN_ORDER', 'S1_SORT', 'S4_STANDARDIZE', 'S5_SUSTAIN', 'S3_SHINE', 'S6_SAFETY'], lastMonthNo: [] },
  ];
  const findingNotes: Record<string, string> = {
    'Q-SHINE-01': 'Oil leaking under CNC machine 2; drip tray full.',
    'Q-SET-01': 'Several tools left on the bench instead of on the shadow board.',
  };
  /** Photo the auditor took for each of last month's "No" answers (also the finding's photo). */
  const findingPhotos: Record<string, SceneName> = { 'Q-SHINE-01': 'oilLeak', 'Q-SET-01': 'toolsOffBoard' };
  // Due dates the area owners agreed when acknowledging last month's audits (they become the action due dates)
  const agreedResolution: Record<string, Date> = { cnc: daysFromNow(1, 17), crib: daysFromNow(5, 17) };

  /** Last month's execution and the answers per question code, for linking findings. */
  const lastMonth = new Map<string, { executionId: string; auditCode: string; completedAt: Date; acknowledgedAt: Date; answerIds: Map<string, string> }>();
  let executionCount = 0;
  let answerCount = 0;

  for (let monthsAgo = 3; monthsAgo >= 1; monthsAgo--) {
    for (let i = 0; i < auditPlans.length; i++) {
      const ap = auditPlans[i];
      const area = loc(ap.area);
      const target = ap.scores[3 - monthsAgo];
      const isLastMonth = monthsAgo === 1;
      const plannedDate = dayInPastMonth(monthsAgo, firstAuditDay(i), 9);
      const startedAt = dayInPastMonth(monthsAgo, firstAuditDay(i), 10);
      const completedAt = dayInPastMonth(monthsAgo, firstAuditDay(i), 11, 15);
      const acknowledgedAt = dayInPastMonth(monthsAgo, firstAuditDay(i) + 1, 9, 30);

      const ratings = planRatings(target, ap.weakOrder, isLastMonth ? ap.lastMonthNo : []);
      const answers = questions.map((q) => {
        const rating = ratings.get(q.code);
        const failed = q.type === 'YES_NO' && rating === 0;
        return {
          questionId: q.id,
          sectionId: q.sectionId,
          score: rating,
          status: failed ? (q.isCritical ? 'CRITICAL_FAIL' : q.severity === 'MAJOR' ? 'MAJOR_NC' : 'MINOR_NC') : 'CONFORMING',
          notes: failed && isLastMonth ? findingNotes[q.code] ?? null : null,
        };
      });
      const result = scoreAudit(scoringQuestions, sectionCategories, answers, scoringRules);

      const instance = await prisma.scheduledAuditInstance.create({
        data: {
          tenantId,
          scheduleId: schedule.id,
          auditCode: nextCode('AUD', area.areaCode, plannedDate),
          templateVersionId: version.id,
          locationId: area.id,
          auditorId: uid('amit'),
          auditType: 'ROUTINE',
          plannedDate,
          dueDate: new Date(plannedDate.getTime() + 3 * DAY_MS),
          status: 'SUBMITTED',
          score: result.overallScore,
          notes: `Automated scheduled audit for ${schedule.title}`,
          createdAt: new Date(plannedDate.getTime() - 3 * DAY_MS),
        },
      });

      const execution = await prisma.auditExecution.create({
        data: {
          tenantId,
          auditInstanceId: instance.id,
          locationId: area.id,
          templateId: template.id,
          templateVersionId: version.id,
          auditorId: uid('amit'),
          auditCode: nextCode('EXEC', area.areaCode, startedAt),
          auditType: 'ROUTINE',
          status: 'ACKNOWLEDGED',
          startedAt,
          completedAt,
          overallScore: result.overallScore,
          maxPossibleScore: result.maxPossibleScore,
          earnedScore: result.earnedScore,
          pillarScores: JSON.stringify(result.pillarScores),
          isPassed: result.isPassed,
          criticalFailureCount: result.criticalFailureCount,
          summaryNotes: result.isPassed
            ? `Monthly audit of ${area.name}. Area is in good shape.`
            : `Monthly audit of ${area.name}. Below the 70% pass mark; see the weakest pillars.`,
          auditorName: uname('amit'),
          acknowledgedAt,
          acknowledgedById: uid(area.owner),
          acknowledgedByName: uname(area.owner),
          acknowledgementNotes: 'Results discussed with the team.',
          targetResolutionDate: isLastMonth ? agreedResolution[ap.area] ?? null : null,
          disputeStatus: 'NONE',
          createdAt: startedAt,
        },
      });
      executionCount++;

      const answerIds = new Map<string, string>();
      for (const a of answers) {
        const code = questions.find((q) => q.id === a.questionId).code;
        const evidence = isLastMonth && a.notes && findingPhotos[code] ? [await photo(findingPhotos[code], 'amit', 'auditAnswers.evidenceUrls', completedAt)] : [];
        const answer = await prisma.auditAnswer.create({
          data: {
            tenantId,
            executionId: execution.id,
            questionId: a.questionId,
            sectionId: a.sectionId,
            score: a.score,
            maxScore: MAX_RATING,
            status: a.status,
            notes: a.notes,
            evidenceUrls: JSON.stringify(evidence),
            createdAt: completedAt,
          },
        });
        answerIds.set(code, answer.id);
        answerCount++;
      }
      if (isLastMonth) {
        lastMonth.set(ap.area, { executionId: execution.id, auditCode: execution.auditCode, completedAt, acknowledgedAt, answerIds });
      }
    }
  }

  // This month's audits: planned for next week, due three days later
  const upcomingStart = daysFromNow(7, 9);
  for (let i = 0; i < auditPlans.length; i++) {
    const area = loc(auditPlans[i].area);
    const plannedDate = new Date(upcomingStart.getTime() + i * DAY_MS);
    await prisma.scheduledAuditInstance.create({
      data: {
        tenantId,
        scheduleId: schedule.id,
        auditCode: nextCode('AUD', area.areaCode, plannedDate),
        templateVersionId: version.id,
        locationId: area.id,
        auditorId: uid('amit'),
        auditType: 'ROUTINE',
        plannedDate,
        dueDate: new Date(plannedDate.getTime() + 3 * DAY_MS),
        status: 'SCHEDULED',
        notes: `Automated scheduled audit for ${schedule.title}`,
        createdAt: daysFromNow(-1, 6),
      },
    });
  }
  await prisma.auditSchedule.update({
    where: { id: schedule.id },
    data: { lastRunAt: daysFromNow(-1, 6), nextRunAt: new Date(upcomingStart.getTime() + 30 * DAY_MS) },
  });

  // ---------------------------------------------------------------- 11. Observations
  const cncAudit = lastMonth.get('cnc');
  const cribAudit = lastMonth.get('crib');
  const observationSeeds = [
    {
      key: 'oil', area: 'cnc', photo: 'oilLeak' as SceneName, category: 'S3_SHINE', severity: 'MAJOR', status: 'ACTION_ASSIGNED',
      title: 'Oil leak under CNC machine 2',
      description: 'Oil is leaking under CNC machine 2 and the drip tray is full. Slipping risk for operators.',
      loggedBy: 'amit', createdAt: cncAudit.completedAt, executionId: cncAudit.executionId, answerId: cncAudit.answerIds.get('Q-SHINE-01'),
    },
    {
      key: 'tools', area: 'crib', photo: 'toolsOffBoard' as SceneName, category: 'S2_SET_IN_ORDER', severity: 'MODERATE', status: 'ACTION_ASSIGNED',
      title: 'Tools left outside shadow board',
      description: 'Several spanners and a torque wrench were left on the bench instead of on the shadow board.',
      loggedBy: 'amit', createdAt: cribAudit.completedAt, executionId: cribAudit.executionId, answerId: cribAudit.answerIds.get('Q-SET-01'),
    },
    {
      key: 'faded', area: 'pack', photo: 'floorWorn' as SceneName, category: 'S2_SET_IN_ORDER', severity: 'MAJOR', status: 'CLOSED',
      title: 'Faded floor marking near dispatch',
      description: 'The yellow walkway line next to the dispatch door has worn away, so forklifts and people share the same path.',
      loggedBy: 'sneha', createdAt: daysFromNow(-20, 14), executionId: null, answerId: null,
    },
    {
      key: 'extinguisher', area: 'line1', photo: 'blockedExtinguisher' as SceneName, category: 'S6_SAFETY', severity: 'CRITICAL', status: 'ACTION_ASSIGNED',
      title: 'Blocked fire extinguisher at Line 1',
      description: 'Empty parts crates are stacked in front of the fire extinguisher at station 4. It cannot be reached quickly.',
      loggedBy: 'ravi', createdAt: daysFromNow(-4, 10), executionId: null, answerId: null,
    },
    {
      key: 'boxes', area: 'pack', photo: 'boxesUnlabelled' as SceneName, category: 'S1_SORT', severity: 'MODERATE', status: 'PENDING_VERIFICATION',
      title: 'Unlabelled boxes in packing area',
      description: 'Five boxes without labels are on the packing table. Nobody knows which order they belong to.',
      loggedBy: 'ravi', createdAt: daysFromNow(-6, 11), executionId: null, answerId: null,
    },
    {
      key: 'dust', area: 'line1', photo: 'dustyPanel' as SceneName, category: 'S3_SHINE', severity: 'MINOR', status: 'OPEN',
      title: 'Dust on control panel',
      description: 'The control panel at station 2 is dusty and the screen is hard to read.',
      loggedBy: 'amit', createdAt: daysFromNow(-2, 15), executionId: null, answerId: null,
    },
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const observations = new Map<string, { id: string; code: string; createdAt: Date }>();
  for (const o of observationSeeds) {
    const area = loc(o.area);
    const code = nextCode('OBS', area.areaCode, o.createdAt);
    const observation = await prisma.observation.create({
      data: {
        tenantId,
        observationCode: code,
        executionId: o.executionId,
        answerId: o.answerId,
        locationId: area.id,
        category: o.category,
        severity: o.severity,
        title: o.title,
        description: o.description,
        status: o.status,
        tags: JSON.stringify(o.executionId ? [o.category, o.severity, 'AuditTriggered'] : [o.category, o.severity]),
        loggedById: uid(o.loggedBy),
        beforePhotoUrl: await photo(o.photo, o.loggedBy, 'observations.beforePhotoUrl', o.createdAt),
        createdAt: o.createdAt,
      },
    });
    observations.set(o.key, { id: observation.id, code, createdAt: o.createdAt });
  }

  // ---------------------------------------------------------------- 12. Corrective actions
  type HistoryEntry = { at: Date; actor: string | null; actorName?: string; from: string; to: string; comment: string; metadata?: Record<string, unknown> };
  interface ActionSeed {
    observation: string;
    area: string;
    title: string;
    description: string;
    source: 'AUDIT' | 'OBSERVATION';
    rootCauseCategory: string;
    assignee: string;
    assignedBy: string;
    targetDate: Date;
    slaHours: number;
    status: string;
    isOverdue?: boolean;
    escalationTier?: string;
    closureNotes?: string;
    closureSubmittedAt?: Date;
    afterPhoto?: SceneName;
    fiveWhy?: { why1: string; why2: string; why3: string };
    history: HistoryEntry[];
  }
  const boxesObs = observations.get('boxes');
  const extinguisherObs = observations.get('extinguisher');
  const pendingAck = (auditCode: string, at: Date): HistoryEntry => ({
    at, actor: 'amit', from: 'OPEN', to: 'PENDING_ACKNOWLEDGEMENT',
    comment: `Action raised from audit ${auditCode}; waiting for the area owner to acknowledge the audit.`,
  });
  const acknowledged = (owner: string, at: Date, target: Date): HistoryEntry => ({
    at, actor: owner, from: 'PENDING_ACKNOWLEDGEMENT', to: 'ASSIGNED',
    comment: `Area owner accepted the audit findings. Target date ${isoDay(target)}.`,
  });

  const actionSeeds: ActionSeed[] = [
    {
      observation: 'oil', area: 'cnc', source: 'AUDIT', rootCauseCategory: 'MACHINE',
      title: 'Fix oil leak on CNC machine 2',
      description: 'Replace the leaking seal on CNC machine 2, clean the floor and empty the drip tray.',
      assignee: 'arun', assignedBy: 'amit', targetDate: agreedResolution.cnc, slaHours: 72, status: 'IN_PROGRESS',
      fiveWhy: { why1: 'Oil on the floor: the coolant pump seal is leaking.', why2: 'The seal is worn out.', why3: 'The seal was not on the maintenance plan.' },
      history: [
        pendingAck(cncAudit.auditCode, cncAudit.completedAt),
        acknowledged('arun', cncAudit.acknowledgedAt, agreedResolution.cnc),
        { at: daysFromNow(-3, 10), actor: 'arun', from: 'ASSIGNED', to: 'IN_PROGRESS', comment: 'Work started: new seal ordered, absorbent pads placed under the machine.' },
      ],
    },
    {
      observation: 'tools', area: 'crib', source: 'AUDIT', rootCauseCategory: 'METHOD',
      title: 'Return tools to the shadow board after each shift',
      description: 'Put all tools back on the shadow board and add an end-of-shift tool check to the handover.',
      assignee: 'arun', assignedBy: 'amit', targetDate: agreedResolution.crib, slaHours: 168, status: 'ASSIGNED',
      history: [pendingAck(cribAudit.auditCode, cribAudit.completedAt), acknowledged('arun', cribAudit.acknowledgedAt, agreedResolution.crib)],
    },
    {
      observation: 'boxes', area: 'pack', source: 'OBSERVATION', rootCauseCategory: 'METHOD',
      title: 'Label or remove the unlabelled boxes',
      description: 'Find the order for each unlabelled box, label it, and red-tag any box nobody claims.',
      assignee: 'deepa', assignedBy: 'sneha', targetDate: new Date(boxesObs.createdAt.getTime() + 7 * DAY_MS), slaHours: 168, status: 'PENDING_VERIFICATION',
      closureNotes: 'All five boxes matched to orders and labelled. Labels are now printed at the packing table.',
      closureSubmittedAt: daysFromNow(-1, 16),
      afterPhoto: 'boxesLabelled',
      history: [
        { at: new Date(boxesObs.createdAt.getTime() + 2 * 3600000), actor: 'sneha', from: 'OPEN', to: 'ASSIGNED', comment: 'Raised from an observation with 168h SLA.', metadata: { type: 'CREATED', toAssigneeId: uid('deepa') } },
        { at: daysFromNow(-4, 9), actor: 'deepa', from: 'ASSIGNED', to: 'IN_PROGRESS', comment: 'Status updated to IN_PROGRESS.' },
        {
          at: daysFromNow(-1, 16), actor: 'deepa', from: 'IN_PROGRESS', to: 'PENDING_VERIFICATION',
          comment: 'Closure evidence submitted: All five boxes matched to orders and labelled. Labels are now printed at the packing table.',
          metadata: { type: 'SUBMITTED', withoutPhoto: false, reason: null },
        },
      ],
    },
    {
      observation: 'extinguisher', area: 'line1', source: 'OBSERVATION', rootCauseCategory: 'MANPOWER',
      title: 'Clear the area in front of the fire extinguisher',
      description: 'Move the empty crates away from the extinguisher at station 4 and mark a keep-clear box on the floor.',
      assignee: 'deepa', assignedBy: 'sneha', targetDate: new Date(extinguisherObs.createdAt.getTime() + DAY_MS), slaHours: 24, status: 'ASSIGNED',
      isOverdue: true, escalationTier: 'ESCALATED_L1',
      history: [
        { at: new Date(extinguisherObs.createdAt.getTime() + 3600000), actor: 'sneha', from: 'OPEN', to: 'ASSIGNED', comment: 'Raised from an observation with 24h SLA.', metadata: { type: 'CREATED', toAssigneeId: uid('deepa') } },
        { at: daysFromNow(-1, 8), actor: null, actorName: 'Escalation', from: 'ASSIGNED', to: 'ASSIGNED', comment: 'Action is 2 days overdue: escalated (level 1).', metadata: { type: 'ESCALATED', escalationTier: 'ESCALATED_L1' } },
      ],
    },
  ];
  // Codes follow creation order
  actionSeeds.sort((a, b) => a.history[0].at.getTime() - b.history[0].at.getTime());

  for (const a of actionSeeds) {
    const area = loc(a.area);
    const createdAt = a.history[0].at;
    const action = await prisma.correctiveAction.create({
      data: {
        tenantId,
        actionCode: nextCode('CAPA', area.areaCode, createdAt),
        observationId: observations.get(a.observation).id,
        locationId: area.id,
        title: a.title,
        description: a.description,
        actionType: 'CORRECTIVE',
        source: a.source,
        rootCauseCategory: a.rootCauseCategory,
        fiveWhyAnalysis: JSON.stringify({ why1: '', why2: '', why3: '', why4: '', why5: '', ...a.fiveWhy }),
        assigneeId: uid(a.assignee),
        assignedById: uid(a.assignedBy),
        targetDate: a.targetDate,
        slaHours: a.slaHours,
        isOverdue: a.isOverdue ?? false,
        escalationTier: a.escalationTier ?? 'NORMAL',
        status: a.status,
        closureNotes: a.closureNotes ?? null,
        closureSubmittedAt: a.closureSubmittedAt ?? null,
        afterPhotoUrl: a.afterPhoto ? await photo(a.afterPhoto, a.assignee, 'correctiveActions.afterPhotoUrl', a.closureSubmittedAt ?? createdAt) : null,
        createdAt,
      },
    });
    await prisma.actionHistoryLog.createMany({
      data: a.history.map((h): Prisma.ActionHistoryLogCreateManyInput => ({
        tenantId,
        actionId: action.id,
        actorId: h.actor ? uid(h.actor) : null,
        actorName: h.actorName ?? (h.actor ? uname(h.actor) : null),
        fromStatus: h.from,
        toStatus: h.to,
        comment: h.comment,
        metadata: h.metadata ? JSON.stringify(h.metadata) : null,
        createdAt: h.at,
      })),
    });
  }

  // ---------------------------------------------------------------- 13. Red tags
  const holdingArea = loc('pack');
  const redTagSeeds = [
    {
      area: 'cnc', itemName: 'Old fixture plates', photo: 'fixturePlates' as SceneName, category: 'UNNEEDED_TOOL', quantity: 3, unitOfMeasure: 'PCS', estimatedValue: 4500,
      reason: 'Fixtures for a part that is no longer made.', taggedBy: 'arun', taggedDate: daysFromNow(-40, 10),
      status: 'DISPOSED', holding: true, dispositionAction: 'DISPOSE_SCRAP', dispositionJustification: 'No other plant uses these fixtures.',
      targetDispositionDate: daysFromNow(-26, 17), approvedBy: 'suresh', actualDispositionAction: 'DISPOSE_SCRAP',
      actualDispositionDate: daysFromNow(-30, 15), disposedBy: 'arun', financialRecovered: 1200,
    },
    {
      area: 'crib', itemName: 'Old manual grease guns', photo: 'greaseGuns' as SceneName, category: 'UNNEEDED_TOOL', quantity: 4, unitOfMeasure: 'PCS', estimatedValue: 2000,
      reason: 'Replaced by the new battery grease gun; not used for months.', taggedBy: 'arun', taggedDate: daysFromNow(-24, 11),
      status: 'IN_HOLDING_AREA', holding: true, targetDispositionDate: daysFromNow(-10, 17),
    },
    {
      area: 'line1', itemName: 'Extra stock of old bracket parts', photo: 'bracketBoxes' as SceneName, category: 'SURPLUS_INVENTORY', quantity: 3, unitOfMeasure: 'BOXES', estimatedValue: 8000,
      reason: 'Brackets for the previous model, kept at the line after the model change.', taggedBy: 'deepa', taggedDate: daysFromNow(-6, 14),
      status: 'PENDING_DISPOSITION', holding: true, dispositionAction: 'RELOCATE',
      dispositionJustification: 'Move back to the main store for spare-part orders.', targetDispositionDate: daysFromNow(8, 17),
    },
    {
      area: 'cnc', itemName: 'Broken drill chuck', photo: 'drillChuck' as SceneName, category: 'BROKEN_EQUIPMENT', quantity: 1, unitOfMeasure: 'PCS', estimatedValue: 1500,
      reason: 'Jaws do not close fully; found in a drawer at machine 1.', taggedBy: 'arun', taggedDate: daysFromNow(-1, 15),
      status: 'RED_TAGGED', holding: false, targetDispositionDate: daysFromNow(13, 17),
    },
  ];
  for (const t of redTagSeeds) {
    const area = loc(t.area);
    await prisma.redTag.create({
      data: {
        tenantId,
        tagNumber: nextCode('RT', area.areaCode, t.taggedDate),
        locationId: area.id,
        targetHoldingAreaId: t.holding ? holdingArea.id : null,
        itemName: t.itemName,
        category: t.category,
        quantity: t.quantity,
        unitOfMeasure: t.unitOfMeasure,
        estimatedValue: t.estimatedValue,
        taggedById: uid(t.taggedBy),
        taggedDate: t.taggedDate,
        reason: t.reason,
        photoUrl: await photo(t.photo, t.taggedBy, 'redTags.photoUrl', t.taggedDate),
        status: t.status,
        dispositionAction: t.dispositionAction ?? null,
        dispositionJustification: t.dispositionJustification ?? null,
        targetDispositionDate: t.targetDispositionDate,
        actualDispositionDate: t.actualDispositionDate ?? null,
        actualDispositionAction: t.actualDispositionAction ?? null,
        disposedById: t.disposedBy ? uid(t.disposedBy) : null,
        supervisorApprovedById: t.approvedBy ? uid(t.approvedBy) : null,
        financialRecovered: t.financialRecovered ?? null,
        closurePhotoUrl: t.status === 'DISPOSED' ? await photo('scrapBin', t.disposedBy, 'redTags.closurePhotoUrl', t.actualDispositionDate) : null,
        createdAt: t.taggedDate,
      },
    });
  }

  // ---------------------------------------------------------------- 14. Daily routine for the CNC Machining Cell
  const cnc = loc('cnc');
  await prisma.routineItem.createMany({
    data: [
      { kind: 'KAMISHIBAI', text: 'Only the tools needed for today\'s job are at the machines', category: 'S1_SORT' },
      { kind: 'KAMISHIBAI', text: 'Chip trays are emptied and there is no oil or coolant on the floor', category: 'S3_SHINE' },
      { kind: 'KAMISHIBAI', text: 'Walkways and the fire extinguisher are clear', category: 'S6_SAFETY' },
      { kind: 'SHADOW_TOOL', text: 'Spanner set', position: 'A1', category: 'S2_SET_IN_ORDER' },
      { kind: 'SHADOW_TOOL', text: 'Torque wrench', position: 'A2', category: 'S2_SET_IN_ORDER' },
      { kind: 'SHADOW_TOOL', text: 'Digital caliper', position: 'B1', category: 'S2_SET_IN_ORDER' },
    ].map((item, i) => ({ ...item, tenantId, locationId: cnc.id, sortOrder: i + 1, createdById: uid('arun') })),
  });

  // ---------------------------------------------------------------- 15. Before / after photos of improvements
  const evidenceSeeds = [
    {
      area: 'cnc', category: 'S2_SET_IN_ORDER', before: 'toolsOffBoard' as SceneName, after: 'toolsOnBoard' as SceneName, by: 'arun', at: dayInPastMonth(3, 20, 15),
      description: 'Shadow board put up at the CNC cell: every tool now has an outlined, labelled place.', afterLabel: 'Shadow board in use',
    },
    {
      area: 'pack', category: 'S6_SAFETY', before: 'floorWorn' as SceneName, after: 'floorRepainted' as SceneName, by: 'deepa', at: daysFromNow(-14, 16),
      description: 'Worn walkway line at the dispatch door repainted, with a walkway arrow for forklift drivers.', afterLabel: 'Repainted walkway',
    },
  ];
  for (const e of evidenceSeeds) {
    await prisma.locationEvidence.create({
      data: {
        tenantId,
        locationId: loc(e.area).id,
        category: e.category,
        description: e.description,
        beforePhotoUrl: await photo(e.before, e.by, 'locationEvidence.beforePhotoUrl', e.at),
        afterPhotoUrl: await photo(e.after, e.by, 'locationEvidence.afterPhotoUrl', e.at),
        afterLabel: e.afterLabel,
        uploadedById: uid(e.by),
        createdAt: e.at,
      },
    });
  }

  // ---------------------------------------------------------------- 16. Recognition: floating trophies and kudos
  // Packing & Dispatch has scored best every month, the Tool Crib kept its 3S Shine high and the CNC cell improved most.
  // The Kaizen Shield is left unawarded: no area has three on-time verified actions yet.
  const quarterStart = dayInPastMonth(3, 1, 10);
  const trophySeeds = [
    {
      trophyKey: 'PLANT_EXCELLENCE', area: 'crib', awardedBy: 'rajesh', awardedAt: dayInPastMonth(6, 2, 10), endedAt: quarterStart, scoreAtAward: 76.4,
      citation: 'Highest average score in the plant last quarter, with the new shadow boards in daily use.',
    },
    {
      trophyKey: 'PLANT_EXCELLENCE', area: 'pack', awardedBy: 'rajesh', awardedAt: quarterStart, endedAt: null, scoreAtAward: 84.3,
      citation: 'Best score in every monthly audit this quarter. Clear labelling and an orderly dispatch bay.',
    },
    {
      trophyKey: 'GOLDEN_BROOM', area: 'pack', awardedBy: 'sneha', awardedAt: dayInPastMonth(3, 3, 11), endedAt: dayInPastMonth(1, 2, 11), scoreAtAward: 82.5,
      citation: 'Spotless packing tables and a red-tag corner that is always tidy.',
    },
    {
      trophyKey: 'GOLDEN_BROOM', area: 'crib', awardedBy: 'sneha', awardedAt: dayInPastMonth(1, 2, 11), endedAt: null, scoreAtAward: 75.7,
      citation: 'Shelves and bins cleaned and relabelled; the daily cleaning checklist has been ticked every day this month.',
    },
    {
      trophyKey: 'SAFETY_VANGUARD', area: 'line1', awardedBy: 'rajesh', awardedAt: dayInPastMonth(5, 4, 10), endedAt: dayInPastMonth(2, 1, 10), scoreAtAward: 61.0,
      citation: 'New walkway markings and a keep-clear box at every station.',
    },
    {
      trophyKey: 'SAFETY_VANGUARD', area: 'cnc', awardedBy: 'rajesh', awardedAt: dayInPastMonth(2, 1, 10), endedAt: null, scoreAtAward: 71.0,
      citation: 'Machine guards checked every shift and safety glasses worn by everyone at every audit.',
    },
  ];
  for (const t of trophySeeds) {
    await prisma.trophyAward.create({
      data: {
        tenantId,
        trophyKey: t.trophyKey,
        locationId: loc(t.area).id,
        awardedById: uid(t.awardedBy),
        citation: t.citation,
        scoreAtAward: t.scoreAtAward,
        awardedAt: t.awardedAt,
        endedAt: t.endedAt,
      },
    });
  }

  // 25 XP per kudos, the same fixed amount the API grants (KUDOS_POINTS)
  const kudosSeeds = [
    { from: 'sneha', to: 'deepa', category: '5S_EXCELLENCE', daysAgo: 1, message: 'Packing & Dispatch looks great. Labels are now printed right at the table, which fixed the unlabelled boxes for good.' },
    { from: 'ravi', to: 'deepa', category: 'TEAMWORK', daysAgo: 2, message: 'Thanks for helping us sort the old bracket stock on Line 1 after our shift.' },
    { from: 'suresh', to: 'arun', category: 'RAPID_CAPA', daysAgo: 3, message: 'Absorbent pads under CNC 2 within an hour of the audit, and the seal already ordered. Quick work.' },
    { from: 'deepa', to: 'ravi', category: 'SAFETY_FIRST', daysAgo: 4, message: 'Good catch reporting the blocked fire extinguisher at station 4. That is exactly what we need.' },
    { from: 'amit', to: 'arun', category: 'CLEAN_STREAK', daysAgo: 9, message: 'Tool Crib shelves were spotless at the spot check today, three weeks running.' },
    { from: 'rajesh', to: 'sneha', category: 'KAIZEN_INNOVATION', daysAgo: 14, message: 'The one-page floor marking standard made it easy for every area to repaint the same way.' },
    { from: 'arun', to: 'amit', category: 'TEAMWORK', daysAgo: 18, message: 'Thanks for walking the team through the audit questions before the monthly audit.' },
    { from: 'pooja', to: 'deepa', category: '5S_EXCELLENCE', daysAgo: 24, message: 'Congratulations on keeping the Plant Excellence Cup in Packing & Dispatch.' },
    { from: 'sneha', to: 'arun', category: 'KAIZEN_INNOVATION', daysAgo: 33, message: 'The shadow board at the CNC cell is now the example we show other areas.' },
    { from: 'kavita', to: 'rajesh', category: 'TEAMWORK', daysAgo: 41, message: 'Three months of rising audit scores across the plant. Well led.' },
    { from: 'deepa', to: 'sneha', category: 'TEAMWORK', daysAgo: 52, message: 'Thanks for coaching the assembly team on red tags. Sorting is much faster now.' },
    { from: 'suresh', to: 'arun', category: 'SAFETY_FIRST', daysAgo: 63, message: 'Machine guards checked every shift without being asked.' },
  ];
  await prisma.kudos.createMany({
    data: kudosSeeds.map((k, i) => ({
      tenantId,
      fromUserId: uid(k.from),
      toUserId: uid(k.to),
      category: k.category,
      message: k.message,
      points: 25,
      createdAt: daysFromNow(-k.daysAgo, 9 + (i % 7)),
    })),
  });

  // Storage used, as FilesService keeps it after each upload
  const stored = await prisma.storedFile.aggregate({ where: { tenantId }, _sum: { sizeBytes: true } });
  await prisma.tenant.update({ where: { id: tenantId }, data: { storageUsedMb: Math.ceil((stored._sum.sizeBytes ?? 0) / 1048576) } });

  // ---------------------------------------------------------------- Summary
  const counts = {
    users: await prisma.user.count(),
    orgNodes: await prisma.orgNode.count(),
    locations: await prisma.location.count(),
    standards: await prisma.standard.count(),
    templateQuestions: await prisma.auditTemplateQuestion.count(),
    scheduledAudits: await prisma.scheduledAuditInstance.count(),
    completedAudits: executionCount,
    auditAnswers: answerCount,
    observations: await prisma.observation.count(),
    correctiveActions: await prisma.correctiveAction.count(),
    redTags: await prisma.redTag.count(),
    routineItems: await prisma.routineItem.count(),
    beforeAfterPairs: await prisma.locationEvidence.count(),
    trophyAwards: await prisma.trophyAward.count(),
    kudos: await prisma.kudos.count(),
    photos: await prisma.storedFile.count(),
  };
  console.log(`Done: 1 organization (${tenant.name})${plan ? ` on the ${plan.name} plan` : ''}.`);
  for (const [name, count] of Object.entries(counts)) console.log(`  ${name.padEnd(18)} ${count}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
