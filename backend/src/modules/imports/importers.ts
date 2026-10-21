import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { values } from '../../core/validation/domain-values';
import { codeFragment, nextSequenceCode } from '../../core/database/sequence-code';
import { hashSecret } from '../../core/auth/credentials';
import { hashToken } from '../../core/auth/totp';
import { documentPrefix, slaHoursFor, TenantSettings } from '../../core/config/tenant-settings';
import { buildLocationQrPayload, defaultMilestoneRows } from '../locations/location-qr';
import { nodeTypeCodeFor, nodeTypeOptions } from '../organization/node-types';

export type ImportKind = 'org-nodes' | 'locations' | 'users' | 'questions' | 'standards' | 'actions';
// Organization units come first: locations are imported into them
export const IMPORT_KINDS: ImportKind[] = ['org-nodes', 'locations', 'users', 'questions', 'standards', 'actions'];

export interface ImportColumn {
  header: string;
  key: string;
  required: boolean;
  description: string;
  example: string;
}

export interface RowError {
  rowNumber: number;
  field: string;
  value: unknown;
  message: string;
}

export type ImportRow = Record<string, string>;

export interface ImportContext {
  prisma: PrismaService;
  tenantId: string;
  userId: string;
  settings: TenantSettings;
}

export interface ImporterDefinition {
  kind: ImportKind;
  title: string;
  columns: ImportColumn[];
  /** Validates every row against the file itself and existing data; nothing is written. */
  validate(ctx: ImportContext, rows: ImportRow[]): Promise<RowError[]>;
  /** Writes all rows in one transaction (call only after validate returned no errors). */
  commit(ctx: ImportContext, rows: ImportRow[], tx: Prisma.TransactionClient): Promise<{ created: number; details?: Record<string, unknown> }>;
}

const col = (header: string, key: string, required: boolean, description: string, example: string): ImportColumn => ({ header, key, required, description, example });
const yes = (v: string | undefined) => /^(y|yes|true|1)$/i.test((v ?? '').trim());
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shared checks: required columns, allowed values. Rows are 1-based plus the header line, like spreadsheets. */
function baseErrors(def: { columns: ImportColumn[] }, rows: ImportRow[], allowed: Record<string, string[]> = {}): RowError[] {
  const errors: RowError[] = [];
  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    for (const c of def.columns) {
      const v = (row[c.key] ?? '').trim();
      if (c.required && !v) errors.push({ rowNumber, field: c.header, value: v, message: `${c.header} is required` });
      if (v && allowed[c.key] && !allowed[c.key].includes(v.toUpperCase())) {
        errors.push({ rowNumber, field: c.header, value: v, message: `${c.header} must be one of ${allowed[c.key].join(', ')}` });
      }
    }
  });
  return errors;
}

function duplicatesInFile(rows: ImportRow[], key: string, header: string, normalise = (v: string) => v.trim().toUpperCase()): RowError[] {
  const seen = new Map<string, number>();
  const errors: RowError[] = [];
  rows.forEach((row, i) => {
    const v = row[key] ? normalise(row[key]) : '';
    if (!v) return;
    if (seen.has(v)) errors.push({ rowNumber: i + 2, field: header, value: row[key], message: `Duplicate ${header} (also on row ${seen.get(v)})` });
    else seen.set(v, i + 2);
  });
  return errors;
}

// ---------------------------------------------------------------------------
// Organization units: each row becomes a node of the hierarchy. A parent may be an existing unit or another row
// of the same file (in any order); units are created parents-first.
// ---------------------------------------------------------------------------
const orgCode = (v: string | undefined) => (v ?? '').trim().toUpperCase().replace(/\s+/g, '-');

const orgNodesImporter: ImporterDefinition = {
  kind: 'org-nodes',
  title: 'Organization units',
  columns: [
    col('Code', 'code', true, 'Unique unit code', 'PLT01-ASM'),
    col('Name', 'name', true, 'Unit name', 'Assembly department'),
    col('NodeType', 'nodeType', true, "One of the organization's hierarchy levels (Settings, Hierarchy levels), e.g. Plant, Department, Area", 'Department'),
    col('ParentCode', 'parentCode', false, 'Code of the parent unit (existing, or another row of this file); empty for a top-level unit', 'PLT01'),
    col('SortOrder', 'sortOrder', false, 'Display order among siblings (whole number, default 0)', '1'),
  ],
  async validate(ctx, rows) {
    const errors = [...baseErrors(this, rows), ...duplicatesInFile(rows, 'code', 'Code', orgCode)];
    const [tenant, allNodes, liveNodes] = await Promise.all([
      ctx.prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { hierarchyConfig: true } }),
      // Soft-deleted codes stay reserved
      ctx.prisma.orgNode.findMany({ where: { tenantId: ctx.tenantId, deletedAt: undefined }, select: { code: true } }),
      ctx.prisma.orgNode.findMany({ where: { tenantId: ctx.tenantId }, select: { code: true } }),
    ]);
    const options = nodeTypeOptions(tenant?.hierarchyConfig);
    const allowedTypes = new Set(options.map((o) => o.code));
    const configuredLabels = options.filter((o) => o.configured).map((o) => o.label);
    const takenCodes = new Set(allNodes.map((n) => n.code.toUpperCase()));
    const existingParents = new Set(liveNodes.map((n) => n.code.toUpperCase()));
    const parentInFile = new Map(rows.map((r) => [orgCode(r.code), orgCode(r.parentCode)]));
    rows.forEach((row, i) => {
      const n = i + 2;
      const code = orgCode(row.code);
      if (code && takenCodes.has(code)) errors.push({ rowNumber: n, field: 'Code', value: row.code, message: 'A unit with this code already exists' });
      if (code && !/^[A-Z0-9][A-Z0-9_.-]*$/.test(code)) errors.push({ rowNumber: n, field: 'Code', value: row.code, message: 'Use letters, digits, "-", "_" or "." only' });
      if (row.nodeType && !allowedTypes.has(nodeTypeCodeFor(row.nodeType))) {
        errors.push({
          rowNumber: n,
          field: 'NodeType',
          value: row.nodeType,
          message: `Unknown level. Use one of ${(configuredLabels.length ? configuredLabels : [...allowedTypes]).join(', ')}`,
        });
      }
      const parent = orgCode(row.parentCode);
      if (!parent) return;
      if (parent === code) {
        errors.push({ rowNumber: n, field: 'ParentCode', value: row.parentCode, message: 'A unit cannot be its own parent' });
      } else if (!existingParents.has(parent) && !parentInFile.has(parent)) {
        errors.push({ rowNumber: n, field: 'ParentCode', value: row.parentCode, message: 'No unit with this code (existing or in this file)' });
      } else {
        // Parents found only in the file must lead to an existing unit or a top-level row, never back to this row
        const visited = new Set<string>([code]);
        let cursor = parent;
        while (cursor && !existingParents.has(cursor) && parentInFile.has(cursor) && !visited.has(cursor)) {
          visited.add(cursor);
          cursor = parentInFile.get(cursor) ?? '';
        }
        if (cursor && visited.has(cursor)) errors.push({ rowNumber: n, field: 'ParentCode', value: row.parentCode, message: 'The parent chain forms a loop' });
      }
    });
    rows.forEach((row, i) => {
      if (row.sortOrder && !/^\d{1,6}$/.test(row.sortOrder.trim())) {
        errors.push({ rowNumber: i + 2, field: 'SortOrder', value: row.sortOrder, message: 'SortOrder must be a whole number of 0 or more' });
      }
    });
    return errors;
  },
  async commit(ctx, rows, tx) {
    const existing = await tx.orgNode.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, code: true, path: true, depth: true } });
    const placed = new Map(existing.map((n) => [n.code.toUpperCase(), { id: n.id, path: n.path, depth: n.depth }]));
    let pending = rows;
    // Each pass creates the rows whose parent exists by then; validate() rules out loops, so every pass progresses
    while (pending.length) {
      const waiting: ImportRow[] = [];
      for (const row of pending) {
        const parentCode = orgCode(row.parentCode);
        const parent = parentCode ? placed.get(parentCode) : undefined;
        if (parentCode && !parent) {
          waiting.push(row);
          continue;
        }
        const code = orgCode(row.code);
        const node = await tx.orgNode.create({
          data: {
            tenantId: ctx.tenantId,
            parentId: parent?.id ?? null,
            name: row.name.trim(),
            code,
            nodeType: nodeTypeCodeFor(row.nodeType),
            path: `${parent ? parent.path : `/${ctx.tenantId}/`}${code}/`,
            depth: parent ? parent.depth + 1 : 0,
            sortOrder: row.sortOrder ? Number(row.sortOrder.trim()) : 0,
          },
        });
        placed.set(code, { id: node.id, path: node.path, depth: node.depth });
      }
      if (waiting.length === pending.length) throw new Error('Organization units could not be ordered by parent');
      pending = waiting;
    }
    return { created: rows.length };
  },
};

// ---------------------------------------------------------------------------
// Locations: each row becomes an active location with the default 5S milestones and a scannable QR payload.
// ---------------------------------------------------------------------------
const locationsImporter: ImporterDefinition = {
  kind: 'locations',
  title: 'Locations',
  columns: [
    col('AreaCode', 'areaCode', true, 'Unique area code printed on the QR tag', 'LOC-PLT01-ASM-01'),
    col('Name', 'name', true, 'Location name', 'Assembly line 1'),
    col('LocationType', 'locationType', true, values('LOCATION_TYPES').join(', '), 'PRODUCTION_LINE'),
    col('OrgNodeCode', 'orgNodeCode', true, 'Code of an existing organization unit', 'PLT01-ASM'),
    col('RiskLevel', 'riskLevel', false, `${values('RISK_LEVELS').join(', ')} (default LOW)`, 'LOW'),
    col('AuditFrequency', 'auditFrequency', false, `${values('AUDIT_FREQUENCIES').join(', ')} (default WEEKLY)`, 'WEEKLY'),
    col('Building', 'building', false, 'Building', ''),
    col('Floor', 'floor', false, 'Floor', ''),
    col('Description', 'description', false, 'What the area is used for', ''),
    col('OwnerEmail', 'ownerEmail', false, 'Email of an existing user who owns the area', ''),
  ],
  async validate(ctx, rows) {
    const errors = [
      ...baseErrors(this, rows, {
        locationType: values('LOCATION_TYPES'),
        riskLevel: values('RISK_LEVELS'),
        auditFrequency: values('AUDIT_FREQUENCIES'),
      }),
      ...duplicatesInFile(rows, 'areaCode', 'AreaCode'),
    ];
    const [locs, nodes, users] = await Promise.all([
      // Soft-deleted area codes stay reserved
      ctx.prisma.location.findMany({ where: { tenantId: ctx.tenantId, deletedAt: undefined }, select: { areaCode: true } }),
      ctx.prisma.orgNode.findMany({ where: { tenantId: ctx.tenantId }, select: { code: true } }),
      ctx.prisma.user.findMany({ where: { tenantId: ctx.tenantId }, select: { email: true } }),
    ]);
    const areaCodes = new Set(locs.map((l) => l.areaCode.toUpperCase()));
    const nodeCodes = new Set(nodes.map((n) => n.code.toUpperCase()));
    const emails = new Set(users.map((u) => u.email.toLowerCase()));
    rows.forEach((row, i) => {
      const n = i + 2;
      const code = (row.areaCode ?? '').trim().toUpperCase().replace(/\s+/g, '-');
      if (code && areaCodes.has(code)) errors.push({ rowNumber: n, field: 'AreaCode', value: row.areaCode, message: 'A location with this area code already exists' });
      const node = (row.orgNodeCode ?? '').trim().toUpperCase();
      if (node && !nodeCodes.has(node)) errors.push({ rowNumber: n, field: 'OrgNodeCode', value: row.orgNodeCode, message: 'No organization unit with this code' });
      const email = (row.ownerEmail ?? '').trim().toLowerCase();
      if (email && !emails.has(email)) errors.push({ rowNumber: n, field: 'OwnerEmail', value: row.ownerEmail, message: 'No user with this email' });
    });
    return errors;
  },
  async commit(ctx, rows, tx) {
    const [nodes, users] = await Promise.all([
      tx.orgNode.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, code: true } }),
      tx.user.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, email: true } }),
    ]);
    const nodeId = new Map(nodes.map((n) => [n.code.toUpperCase(), n.id]));
    const userId = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
    for (const row of rows) {
      // Area codes are stored upper-cased, consistent with locations created in the app
      const areaCode = row.areaCode.trim().toUpperCase().replace(/\s+/g, '-');
      const loc = await tx.location.create({
        data: {
          tenantId: ctx.tenantId,
          orgNodeId: nodeId.get(row.orgNodeCode.trim().toUpperCase()) as string,
          areaCode,
          name: row.name.trim(),
          locationType: row.locationType.trim().toUpperCase(),
          riskLevel: (row.riskLevel?.trim() || 'LOW').toUpperCase(),
          auditFrequency: (row.auditFrequency?.trim() || 'WEEKLY').toUpperCase(),
          building: row.building?.trim() || null,
          floor: row.floor?.trim() || null,
          description: row.description?.trim() || null,
          ownerId: row.ownerEmail?.trim() ? userId.get(row.ownerEmail.trim().toLowerCase()) ?? null : null,
          qrCodeData: buildLocationQrPayload(ctx.tenantId, areaCode),
          status: 'ACTIVE',
        },
      });
      await tx.locationTimeline.createMany({ data: defaultMilestoneRows(ctx.tenantId, loc.id, 'Imported from spreadsheet') });
      await tx.locationAuditLog.create({
        data: {
          tenantId: ctx.tenantId,
          locationId: loc.id,
          userId: ctx.userId,
          actionType: 'EXCEL_IMPORTED',
          details: JSON.stringify({ action: 'Imported from spreadsheet', areaCode, name: loc.name }),
        },
      });
    }
    return { created: rows.length };
  },
};

// ---------------------------------------------------------------------------
// Users: accounts are created without a usable password; each person gets a welcome email with a
// single-use "set your password" link (72 hours).
// ---------------------------------------------------------------------------
export const INVITE_TTL_HOURS = 72;

const usersImporter: ImporterDefinition = {
  kind: 'users',
  title: 'Users',
  columns: [
    col('Email', 'email', true, 'Sign-in email (unique)', 'jane.doe@example.com'),
    col('FirstName', 'firstName', true, 'Given name', 'Jane'),
    col('LastName', 'lastName', true, 'Family name', 'Doe'),
    col('RoleCode', 'roleCode', true, 'ORG_ADMIN, PLANT_HEAD, COORDINATOR_5S, DEPT_HEAD, AREA_OWNER, AUDITOR, EMPLOYEE, EXECUTIVE, EXTERNAL_AUDITOR', 'AUDITOR'),
    col('JobTitle', 'jobTitle', false, 'Job title', 'Line Supervisor'),
    col('Department', 'department', false, 'Department name', 'Assembly'),
    col('Phone', 'phone', false, 'Phone number', '+91 98765 43210'),
    col('BadgeId', 'badgeId', false, 'Shop-floor badge for PIN sign-in (unique)', 'BADGE-OP-101'),
    col('RoleValidUntil', 'roleValidUntil', false, 'YYYY-MM-DD after which the role stops granting access (required for EXTERNAL_AUDITOR)', ''),
  ],
  async validate(ctx, rows) {
    const errors = [...baseErrors(this, rows), ...duplicatesInFile(rows, 'email', 'Email', (v) => v.trim().toLowerCase()), ...duplicatesInFile(rows, 'badgeId', 'BadgeId')];
    const [existing, roles] = await Promise.all([
      ctx.prisma.user.findMany({ where: { tenantId: ctx.tenantId }, select: { email: true, badgeId: true } }),
      ctx.prisma.role.findMany({ where: { tenantId: ctx.tenantId }, select: { code: true } }),
    ]);
    const emails = new Set(existing.map((u) => u.email.toLowerCase()));
    const badges = new Set(existing.map((u) => (u.badgeId ?? '').toUpperCase()).filter(Boolean));
    const roleCodes = new Set(roles.map((r) => r.code).filter((c) => c !== 'SUPER_ADMIN'));
    rows.forEach((row, i) => {
      const n = i + 2;
      const email = (row.email ?? '').trim().toLowerCase();
      if (email && !EMAIL.test(email)) errors.push({ rowNumber: n, field: 'Email', value: row.email, message: 'Not a valid email address' });
      if (email && emails.has(email)) errors.push({ rowNumber: n, field: 'Email', value: row.email, message: 'A user with this email already exists' });
      const role = (row.roleCode ?? '').trim().toUpperCase();
      if (role && !roleCodes.has(role)) errors.push({ rowNumber: n, field: 'RoleCode', value: row.roleCode, message: `Unknown role. Use one of ${[...roleCodes].join(', ')}` });
      const badge = (row.badgeId ?? '').trim().toUpperCase();
      if (badge && badges.has(badge)) errors.push({ rowNumber: n, field: 'BadgeId', value: row.badgeId, message: 'Badge already assigned to another user' });
      const until = (row.roleValidUntil ?? '').trim();
      if (until && (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(new Date(`${until}T23:59:59`).getTime()) || new Date(`${until}T23:59:59`) <= new Date())) {
        errors.push({ rowNumber: n, field: 'RoleValidUntil', value: row.roleValidUntil, message: 'Use a future date in the YYYY-MM-DD format' });
      }
      if (role === 'EXTERNAL_AUDITOR' && !until) errors.push({ rowNumber: n, field: 'RoleValidUntil', value: '', message: 'External auditors need an end date for their access' });
    });
    return errors;
  },
  async commit(ctx, rows, tx) {
    const roles = new Map((await tx.role.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, code: true } })).map((r) => [r.code, r.id]));
    const invites: Array<{ email: string; firstName: string; token: string }> = [];
    for (const row of rows) {
      const unusablePassword = await hashSecret(randomBytes(32).toString('base64url'));
      const user = await tx.user.create({
        data: {
          tenantId: ctx.tenantId,
          email: row.email.trim().toLowerCase(),
          firstName: row.firstName.trim(),
          lastName: row.lastName.trim(),
          jobTitle: row.jobTitle?.trim() || null,
          department: row.department?.trim() || null,
          phone: row.phone?.trim() || null,
          badgeId: row.badgeId?.trim().toUpperCase() || null,
          passwordHash: unusablePassword,
          status: 'ACTIVE',
        },
      });
      const until = row.roleValidUntil?.trim();
      await tx.userRoleAssignment.create({
        data: {
          tenantId: ctx.tenantId,
          userId: user.id,
          roleId: roles.get(row.roleCode.trim().toUpperCase()) as string,
          validUntil: until ? new Date(`${until}T23:59:59`) : null,
        },
      });
      const token = randomBytes(32).toString('base64url');
      await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_HOURS * 3600000) } });
      invites.push({ email: user.email, firstName: user.firstName, token });
    }
    return { created: rows.length, details: { invites } };
  },
};

// ---------------------------------------------------------------------------
// Audit questions: appended to the template's latest version, which must be a draft (published versions are
// locked because finished audits use them), sections created by title.
// ---------------------------------------------------------------------------
const questionsImporter: ImporterDefinition = {
  kind: 'questions',
  title: 'Audit checklist questions',
  columns: [
    col('TemplateCode', 'templateCode', true, 'Code of an existing audit template', 'TPL-5S-STD-01'),
    col('SectionTitle', 'sectionTitle', true, 'Section the question belongs to (created if new)', 'Sort – Unneeded items'),
    col('Pillar', 'pillar', true, 'S1_SORT, S2_SET_IN_ORDER, S3_SHINE, S4_STANDARDIZE, S5_SUSTAIN, S6_SAFETY', 'S1_SORT'),
    col('QuestionCode', 'questionCode', true, 'Unique within the template', 'Q-S1-01'),
    col('QuestionText', 'questionText', true, 'The question auditors answer', 'Are only required tools present at the workstation?'),
    col('QuestionType', 'questionType', false, values('QUESTION_TYPES').join(', ') + ' (default NUMERIC_0_5)', 'NUMERIC_0_5'),
    col('Weightage', 'weightage', false, 'Relative weight 0.1–10 (default 1)', '1'),
    col('Severity', 'severity', false, 'MINOR, MODERATE, MAJOR, CRITICAL (default MODERATE)', 'MODERATE'),
    col('IsCritical', 'isCritical', false, 'Y if failing caps the audit score', 'N'),
    col('MandatoryEvidence', 'mandatoryEvidence', false, 'Y if a photo is required', 'N'),
    col('Guidance', 'guidance', false, 'Help text for auditors', 'Check drawers and shelves too'),
  ],
  async validate(ctx, rows) {
    const errors = baseErrors(this, rows, {
      pillar: values('FIVE_S_CATEGORIES'),
      questionType: values('QUESTION_TYPES'),
      severity: values('QUESTION_SEVERITIES'),
    });
    const codes = [...new Set(rows.map((r) => (r.templateCode ?? '').trim().toUpperCase()).filter(Boolean))];
    const templates = await ctx.prisma.auditTemplate.findMany({
      where: { tenantId: ctx.tenantId, code: { in: codes } },
      select: { code: true, versions: { orderBy: { createdAt: 'desc' }, take: 1, select: { isPublished: true, sections: { select: { questions: { select: { questionCode: true } } } } } } },
    });
    const byCode = new Map(templates.map((t) => [t.code.toUpperCase(), t]));
    const seen = new Set<string>();
    rows.forEach((row, i) => {
      const n = i + 2;
      const tplCode = (row.templateCode ?? '').trim().toUpperCase();
      const tpl = byCode.get(tplCode);
      if (tplCode && !tpl) errors.push({ rowNumber: n, field: 'TemplateCode', value: row.templateCode, message: 'No template with this code' });
      if (tpl?.versions[0]?.isPublished) {
        errors.push({ rowNumber: n, field: 'TemplateCode', value: row.templateCode, message: 'The latest version is published. Create a new version in the template builder, then import into it' });
      }
      const q = (row.questionCode ?? '').trim().toUpperCase();
      const key = `${tplCode}|${q}`;
      if (q && seen.has(key)) errors.push({ rowNumber: n, field: 'QuestionCode', value: row.questionCode, message: 'Duplicate question code in this file' });
      seen.add(key);
      if (q && tpl?.versions[0]?.sections.some((s) => s.questions.some((x) => x.questionCode.toUpperCase() === q))) {
        errors.push({ rowNumber: n, field: 'QuestionCode', value: row.questionCode, message: 'This question code already exists in the template' });
      }
      const w = row.weightage ? Number(row.weightage) : 1;
      if (!Number.isFinite(w) || w < 0.1 || w > 10) errors.push({ rowNumber: n, field: 'Weightage', value: row.weightage, message: 'Weightage must be between 0.1 and 10' });
      if ((row.questionText ?? '').length > 500) errors.push({ rowNumber: n, field: 'QuestionText', value: '…', message: 'At most 500 characters' });
    });
    return errors;
  },
  async commit(ctx, rows, tx) {
    let created = 0;
    const sectionCache = new Map<string, string>();
    for (const row of rows) {
      const template = await tx.auditTemplate.findFirst({
        where: { tenantId: ctx.tenantId, code: row.templateCode.trim().toUpperCase() },
        select: { versions: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true } } },
      });
      const versionId = template?.versions[0]?.id as string;
      const title = row.sectionTitle.trim();
      const cacheKey = `${versionId}|${title.toLowerCase()}`;
      let sectionId = sectionCache.get(cacheKey);
      if (!sectionId) {
        const existing = await tx.auditTemplateSection.findFirst({ where: { tenantId: ctx.tenantId, templateVersionId: versionId, title: { equals: title, mode: 'insensitive' } } });
        sectionId =
          existing?.id ??
          (
            await tx.auditTemplateSection.create({
              data: {
                tenantId: ctx.tenantId,
                templateVersionId: versionId,
                title,
                category: row.pillar.trim().toUpperCase(),
                sortOrder: (await tx.auditTemplateSection.count({ where: { templateVersionId: versionId } })) + 1,
              },
            })
          ).id;
        sectionCache.set(cacheKey, sectionId);
      }
      await tx.auditTemplateQuestion.create({
        data: {
          tenantId: ctx.tenantId,
          sectionId,
          questionCode: row.questionCode.trim().toUpperCase(),
          questionText: row.questionText.trim(),
          guidance: row.guidance?.trim() || null,
          questionType: (row.questionType?.trim() || 'NUMERIC_0_5').toUpperCase(),
          weightage: row.weightage ? Number(row.weightage) : 1,
          severity: (row.severity?.trim() || 'MODERATE').toUpperCase(),
          isCritical: yes(row.isCritical),
          mandatoryEvidence: yes(row.mandatoryEvidence),
          sortOrder: (await tx.auditTemplateQuestion.count({ where: { sectionId } })) + 1,
        },
      });
      created++;
    }
    return { created };
  },
};

// ---------------------------------------------------------------------------
// Standards: published with an approved revision 1.0 by the importing administrator.
// ---------------------------------------------------------------------------
const standardsImporter: ImporterDefinition = {
  kind: 'standards',
  title: '5S standards',
  columns: [
    col('Code', 'code', true, 'Unique standard code', 'STD-S2-SHADOW'),
    col('Title', 'title', true, 'Standard title', 'Shadow boards for hand tools'),
    col('Pillar', 'pillar', true, 'S1_SORT … S6_SAFETY', 'S2_SET_IN_ORDER'),
    col('Description', 'description', true, 'What the standard requires', 'Every hand tool has an outlined home position.'),
    col('Rules', 'rules', false, 'Individual rules separated by ";"', 'Outline every tool; Label every position'),
    col('Scope', 'scope', false, 'GLOBAL, PLANT, DEPARTMENT, LOCATION_TYPE, SPECIFIC_LOCATION (default GLOBAL)', 'GLOBAL'),
    col('TargetOrgNodeCode', 'targetOrgNodeCode', false, 'For PLANT / DEPARTMENT scope', ''),
    col('TargetAreaCode', 'targetAreaCode', false, 'For SPECIFIC_LOCATION scope', ''),
  ],
  async validate(ctx, rows) {
    const errors = [...baseErrors(this, rows, { pillar: values('FIVE_S_CATEGORIES'), scope: values('STANDARD_SCOPES') }), ...duplicatesInFile(rows, 'code', 'Code')];
    const [standards, nodes, locs] = await Promise.all([
      ctx.prisma.standard.findMany({ where: { tenantId: ctx.tenantId, deletedAt: undefined }, select: { code: true } }),
      ctx.prisma.orgNode.findMany({ where: { tenantId: ctx.tenantId }, select: { code: true } }),
      ctx.prisma.location.findMany({ where: { tenantId: ctx.tenantId }, select: { areaCode: true } }),
    ]);
    const codes = new Set(standards.map((s) => s.code.toUpperCase()));
    const nodeCodes = new Set(nodes.map((n) => n.code.toUpperCase()));
    const areaCodes = new Set(locs.map((l) => l.areaCode.toUpperCase()));
    rows.forEach((row, i) => {
      const n = i + 2;
      if (row.code && codes.has(row.code.trim().toUpperCase())) errors.push({ rowNumber: n, field: 'Code', value: row.code, message: 'A standard with this code already exists' });
      const scope = (row.scope || 'GLOBAL').trim().toUpperCase();
      if (['PLANT', 'DEPARTMENT'].includes(scope) && !nodeCodes.has((row.targetOrgNodeCode ?? '').trim().toUpperCase())) {
        errors.push({ rowNumber: n, field: 'TargetOrgNodeCode', value: row.targetOrgNodeCode, message: `${scope} scope needs an existing organization unit code` });
      }
      if (scope === 'SPECIFIC_LOCATION' && !areaCodes.has((row.targetAreaCode ?? '').trim().toUpperCase())) {
        errors.push({ rowNumber: n, field: 'TargetAreaCode', value: row.targetAreaCode, message: 'SPECIFIC_LOCATION scope needs an existing area code' });
      }
    });
    return errors;
  },
  async commit(ctx, rows, tx) {
    for (const row of rows) {
      const scope = (row.scope || 'GLOBAL').trim().toUpperCase();
      const node = row.targetOrgNodeCode ? await tx.orgNode.findFirst({ where: { tenantId: ctx.tenantId, code: row.targetOrgNodeCode.trim().toUpperCase() }, select: { id: true } }) : null;
      const loc = row.targetAreaCode ? await tx.location.findFirst({ where: { tenantId: ctx.tenantId, areaCode: row.targetAreaCode.trim().toUpperCase() }, select: { id: true } }) : null;
      const standard = await tx.standard.create({
        data: {
          tenantId: ctx.tenantId,
          code: row.code.trim().toUpperCase(),
          title: row.title.trim(),
          category: row.pillar.trim().toUpperCase(),
          scopeType: scope,
          targetOrgNodeId: node?.id ?? null,
          targetLocationId: loc?.id ?? null,
          status: 'PUBLISHED',
        },
      });
      await tx.standardRevision.create({
        data: {
          tenantId: ctx.tenantId,
          standardId: standard.id,
          revisionNumber: '1.0',
          description: row.description.trim(),
          rules: JSON.stringify((row.rules ?? '').split(';').map((r) => r.trim()).filter(Boolean)),
          referencePhotos: '[]',
          revisionComments: 'Imported from spreadsheet',
          authorId: ctx.userId,
          approvedById: ctx.userId,
          approvedAt: new Date(),
          isCurrent: true,
        },
      });
    }
    return { created: rows.length };
  },
};

// ---------------------------------------------------------------------------
// Corrective actions (migrating a legacy CAPA register): each row becomes an observation + action.
// ---------------------------------------------------------------------------
const actionsImporter: ImporterDefinition = {
  kind: 'actions',
  title: 'Open corrective actions (legacy register)',
  columns: [
    col('AreaCode', 'areaCode', true, 'Location area code', 'LOC-BLR-MACH-CNC01'),
    col('Title', 'title', true, 'Short description of the problem / action', 'Oil leak under spindle'),
    col('Description', 'description', true, 'Details', 'Replace spindle seal and clean floor'),
    col('Pillar', 'pillar', true, 'S1_SORT … S6_SAFETY', 'S3_SHINE'),
    col('Severity', 'severity', true, 'MINOR, MODERATE, MAJOR, CRITICAL, KAIZEN_OPPORTUNITY', 'MAJOR'),
    col('AssigneeEmail', 'assigneeEmail', false, 'Existing user email (default: area owner)', 'owner@example.com'),
    col('TargetDate', 'targetDate', false, 'YYYY-MM-DD (default: SLA for the severity)', '2026-12-31'),
    col('ActionType', 'actionType', false, 'CORRECTIVE, PREVENTIVE, KAIZEN (default CORRECTIVE)', 'CORRECTIVE'),
    col('Status', 'status', false, 'ASSIGNED or IN_PROGRESS (default ASSIGNED)', 'ASSIGNED'),
  ],
  async validate(ctx, rows) {
    const errors = baseErrors(this, rows, {
      pillar: values('FIVE_S_CATEGORIES'),
      severity: values('OBSERVATION_SEVERITIES'),
      actionType: values('ACTION_TYPES'),
      status: ['ASSIGNED', 'IN_PROGRESS'],
    });
    const [locs, users] = await Promise.all([
      ctx.prisma.location.findMany({ where: { tenantId: ctx.tenantId }, select: { areaCode: true, ownerId: true } }),
      ctx.prisma.user.findMany({ where: { tenantId: ctx.tenantId, status: 'ACTIVE' }, select: { email: true } }),
    ]);
    const locByCode = new Map(locs.map((l) => [l.areaCode.toUpperCase(), l]));
    const emails = new Set(users.map((u) => u.email.toLowerCase()));
    rows.forEach((row, i) => {
      const n = i + 2;
      const loc = locByCode.get((row.areaCode ?? '').trim().toUpperCase());
      if (row.areaCode && !loc) errors.push({ rowNumber: n, field: 'AreaCode', value: row.areaCode, message: 'No location with this area code' });
      const email = (row.assigneeEmail ?? '').trim().toLowerCase();
      if (email && !emails.has(email)) errors.push({ rowNumber: n, field: 'AssigneeEmail', value: row.assigneeEmail, message: 'No active user with this email' });
      if (!email && loc && !loc.ownerId) errors.push({ rowNumber: n, field: 'AssigneeEmail', value: '', message: 'The location has no owner; give an assignee' });
      if (row.targetDate && (!/^\d{4}-\d{2}-\d{2}$/.test(row.targetDate.trim()) || Number.isNaN(new Date(row.targetDate.trim()).getTime()))) {
        errors.push({ rowNumber: n, field: 'TargetDate', value: row.targetDate, message: 'Use the YYYY-MM-DD format' });
      }
    });
    return errors;
  },
  async commit(ctx, rows, tx) {
    const now = new Date();
    for (const row of rows) {
      const loc = await tx.location.findFirst({ where: { tenantId: ctx.tenantId, areaCode: row.areaCode.trim().toUpperCase() }, select: { id: true, areaCode: true, ownerId: true } });
      const assignee = row.assigneeEmail
        ? await tx.user.findFirst({ where: { tenantId: ctx.tenantId, email: { equals: row.assigneeEmail.trim(), mode: 'insensitive' } }, select: { id: true } })
        : null;
      const severity = row.severity.trim().toUpperCase();
      const fragment = codeFragment(loc?.areaCode);
      const obsCode = await nextSequenceCode(documentPrefix(ctx.settings, 'observation', fragment, now.getFullYear()), (prefix) =>
        tx.observation.findMany({ where: { tenantId: ctx.tenantId, observationCode: { startsWith: prefix }, deletedAt: undefined }, select: { observationCode: true } }).then((r) => r.map((x) => x.observationCode)),
      );
      const observation = await tx.observation.create({
        data: {
          tenantId: ctx.tenantId,
          observationCode: obsCode,
          locationId: loc?.id as string,
          category: row.pillar.trim().toUpperCase(),
          severity,
          title: row.title.trim(),
          description: row.description.trim(),
          status: 'ACTION_ASSIGNED',
          tags: JSON.stringify(['Imported']),
          loggedById: ctx.userId,
        },
      });
      const slaHours = slaHoursFor(ctx.settings, severity);
      const targetDate = row.targetDate ? new Date(`${row.targetDate.trim()}T23:59:59Z`) : new Date(now.getTime() + slaHours * 3600000);
      const actionCode = await nextSequenceCode(documentPrefix(ctx.settings, 'action', fragment, now.getFullYear()), (prefix) =>
        tx.correctiveAction.findMany({ where: { tenantId: ctx.tenantId, actionCode: { startsWith: prefix }, deletedAt: undefined }, select: { actionCode: true } }).then((r) => r.map((x) => x.actionCode)),
      );
      const status = (row.status?.trim() || 'ASSIGNED').toUpperCase();
      const action = await tx.correctiveAction.create({
        data: {
          tenantId: ctx.tenantId,
          actionCode,
          observationId: observation.id,
          locationId: loc?.id as string,
          title: row.title.trim(),
          description: row.description.trim(),
          actionType: (row.actionType?.trim() || 'CORRECTIVE').toUpperCase(),
          assigneeId: assignee?.id ?? loc?.ownerId ?? null,
          assignedById: ctx.userId,
          targetDate,
          slaHours,
          status,
        },
      });
      await tx.actionHistoryLog.create({
        data: { tenantId: ctx.tenantId, actionId: action.id, actorId: ctx.userId, actorName: 'Spreadsheet import', fromStatus: 'OPEN', toStatus: status, comment: 'Imported from a legacy action register.' },
      });
    }
    return { created: rows.length };
  },
};

export const IMPORTERS: Record<ImportKind, ImporterDefinition> = {
  'org-nodes': orgNodesImporter,
  locations: locationsImporter,
  users: usersImporter,
  questions: questionsImporter,
  standards: standardsImporter,
  actions: actionsImporter,
};
