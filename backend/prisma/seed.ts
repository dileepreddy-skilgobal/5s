import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Phase 1 & Phase 2 Masters & Template Engine...');

  // 1. Tenants
  const tenant1 = await prisma.tenant.upsert({
    where: { slug: 'skilglobal-mfg' },
    update: {},
    create: {
      name: 'SkilGlobal Precision Manufacturing Ltd',
      slug: 'skilglobal-mfg',
      industry: 'Automotive & Heavy Engineering',
      logoUrl: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=150',
      storageQuotaMb: 10240,
      storageUsedMb: 420,
      status: 'ACTIVE',
      hierarchyConfig: JSON.stringify(['Org', 'Plant', 'Department', 'Area', 'Zone', 'Workstation']),
      settings: JSON.stringify({ brandColor: '#1E3A8A', defaultAuditFrequency: 'WEEKLY' }),
    },
  });

  const tenant2 = await prisma.tenant.upsert({
    where: { slug: 'apex-aero' },
    update: {},
    create: {
      name: 'Apex Aerospace Components Inc',
      slug: 'apex-aero',
      industry: 'Aerospace & Defence',
      storageQuotaMb: 5120,
      status: 'ACTIVE',
    },
  });

  // 2. Roles
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
  ];

  const roleMap = new Map<string, string>();
  for (const r of rolesData) {
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId: tenant1.id, code: r.code } },
      update: {},
      create: { tenantId: tenant1.id, code: r.code, name: r.name, description: r.desc, isSystemDefault: true },
    });
    roleMap.set(r.code, role.id);
  }

  // 3. Users
  const passwordHash = await bcrypt.hash('Admin@123456', 10);
  const usersData = [
    { email: 'superadmin@skilglobal.com', firstName: 'Vikram', lastName: 'Malhotra', jobTitle: 'Principal SaaS Admin', dept: 'Executive', roleCode: 'SUPER_ADMIN', isSuperAdmin: true },
    { email: 'admin@skilglobal.com', firstName: 'Pooja', lastName: 'Sharma', jobTitle: 'Head of Operational Excellence', dept: 'Operations', roleCode: 'ORG_ADMIN', isSuperAdmin: false },
    { email: 'planthead.blr@skilglobal.com', firstName: 'Rajesh', lastName: 'Kumar', jobTitle: 'Plant General Manager', dept: 'Plant 1 Operations', roleCode: 'PLANT_HEAD', isSuperAdmin: false },
    { email: 'coordinator.5s@skilglobal.com', firstName: 'Sneha', lastName: 'Reddy', jobTitle: 'Lead 5S Champion', dept: 'Continuous Improvement', roleCode: 'COORDINATOR_5S', isSuperAdmin: false },
    { email: 'depthead.machining@skilglobal.com', firstName: 'Suresh', lastName: 'Menon', jobTitle: 'Machining Operations Manager', dept: 'Machining & Fabrication', roleCode: 'DEPT_HEAD', isSuperAdmin: false },
    { email: 'owner.cnc01@skilglobal.com', firstName: 'Arun', lastName: 'Patel', jobTitle: 'CNC Line Team Leader', dept: 'Machining', roleCode: 'AREA_OWNER', isSuperAdmin: false },
    { email: 'owner.asm01@skilglobal.com', firstName: 'Deepa', lastName: 'Krishnan', jobTitle: 'Assembly Lead', dept: 'Assembly', roleCode: 'AREA_OWNER', isSuperAdmin: false },
    { email: 'auditor.lead@skilglobal.com', firstName: 'Amit', lastName: 'Joshi', jobTitle: 'Senior Quality Auditor', dept: 'Quality Assurance', roleCode: 'AUDITOR', isSuperAdmin: false },
  ];

  const userMap = new Map<string, string>();
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant1.id, email: u.email } },
      update: {
        firstName: u.firstName,
        lastName: u.lastName,
        jobTitle: u.jobTitle,
        department: u.dept,
      },
      create: {
        tenantId: tenant1.id,
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        jobTitle: u.jobTitle,
        department: u.dept,
        isSuperAdmin: u.isSuperAdmin,
        status: 'ACTIVE',
      },
    });
    userMap.set(u.email, user.id);

    const roleId = roleMap.get(u.roleCode);
    if (roleId) {
      await prisma.userRoleAssignment.create({
        data: { tenantId: tenant1.id, userId: user.id, roleId },
      });
    }
  }

  // 4. Org Hierarchy
  const rootNode = await prisma.orgNode.upsert({
    where: { tenantId_code: { tenantId: tenant1.id, code: 'SKIL-GLOBAL-CORP' } },
    update: {},
    create: { tenantId: tenant1.id, name: 'SkilGlobal Global Corp', code: 'SKIL-GLOBAL-CORP', nodeType: 'ENTERPRISE', path: `/${tenant1.id}/`, depth: 0 },
  });

  const plant1 = await prisma.orgNode.upsert({
    where: { tenantId_code: { tenantId: tenant1.id, code: 'BLR-PLANT-01' } },
    update: {},
    create: { tenantId: tenant1.id, parentId: rootNode.id, name: 'Bangalore Automotive Plant Alpha', code: 'BLR-PLANT-01', nodeType: 'PLANT', path: `${rootNode.path}BLR-PLANT-01/`, depth: 1, sortOrder: 1 },
  });

  const deptMachining = await prisma.orgNode.upsert({
    where: { tenantId_code: { tenantId: tenant1.id, code: 'BLR-DEPT-MACH' } },
    update: {},
    create: { tenantId: tenant1.id, parentId: plant1.id, name: 'CNC Machining & Precision Fabrication', code: 'BLR-DEPT-MACH', nodeType: 'DEPARTMENT', path: `${plant1.path}BLR-DEPT-MACH/`, depth: 2, sortOrder: 1 },
  });

  const deptAssembly = await prisma.orgNode.upsert({
    where: { tenantId_code: { tenantId: tenant1.id, code: 'BLR-DEPT-ASM' } },
    update: {},
    create: { tenantId: tenant1.id, parentId: plant1.id, name: 'Main Final Assembly Lines', code: 'BLR-DEPT-ASM', nodeType: 'DEPARTMENT', path: `${plant1.path}BLR-DEPT-ASM/`, depth: 2, sortOrder: 2 },
  });

  const deptWarehouse = await prisma.orgNode.upsert({
    where: { tenantId_code: { tenantId: tenant1.id, code: 'BLR-DEPT-WH' } },
    update: {},
    create: { tenantId: tenant1.id, parentId: plant1.id, name: 'Raw Materials & FG Logistics Center', code: 'BLR-DEPT-WH', nodeType: 'DEPARTMENT', path: `${plant1.path}BLR-DEPT-WH/`, depth: 2, sortOrder: 3 },
  });

  // 5. Locations
  const loc1 = await prisma.location.upsert({
    where: { tenantId_areaCode: { tenantId: tenant1.id, areaCode: 'LOC-BLR-MACH-CNC01' } },
    update: {
      name: 'Heavy CNC Milling Cell 01',
      description: 'High-precision 5-axis DMG MORI CNC milling center with dedicated blue-foam shadow board, automated swarf chip conveyor, coolant filtration unit, and 1-meter yellow/black safety perimeter.',
      heroPhotoUrl: '/assets/5s/cnc_workstation_clean.jpg',
      building: 'Building A (Machining Bay)',
      floor: 'Ground Floor - Bay 04',
      riskLevel: 'HIGH',
      auditFrequency: 'DAILY',
      ownerId: userMap.get('owner.cnc01@skilglobal.com'),
      backupOwnerId: userMap.get('depthead.machining@skilglobal.com'),
    },
    create: {
      tenantId: tenant1.id,
      orgNodeId: deptMachining.id,
      areaCode: 'LOC-BLR-MACH-CNC01',
      name: 'Heavy CNC Milling Cell 01',
      locationType: 'PRODUCTION_LINE',
      riskLevel: 'HIGH',
      auditFrequency: 'DAILY',
      building: 'Building A (Machining Bay)',
      floor: 'Ground Floor - Bay 04',
      description: 'High-precision 5-axis DMG MORI CNC milling center with dedicated blue-foam shadow board, automated swarf chip conveyor, coolant filtration unit, and 1-meter yellow/black safety perimeter.',
      heroPhotoUrl: '/assets/5s/cnc_workstation_clean.jpg',
      qrCodeData: `5s://${tenant1.slug}/locations/LOC-BLR-MACH-CNC01`,
      status: 'ACTIVE',
      ownerId: userMap.get('owner.cnc01@skilglobal.com'),
      backupOwnerId: userMap.get('depthead.machining@skilglobal.com'),
    },
  });

  // Location Timelines for LOC-BLR-MACH-CNC01 (5S Implementation Roadmap)
  const timelineData = [
    {
      milestoneName: '1S - Workstation Sort & Red Tag Cleanout',
      plannedStartDate: new Date(Date.now() - 14 * 86400000),
      plannedEndDate: new Date(Date.now() - 10 * 86400000),
      actualStartDate: new Date(Date.now() - 14 * 86400000),
      actualEndDate: new Date(Date.now() - 10 * 86400000),
      progressPercent: 100,
      status: 'COMPLETED',
      notes: 'Cleared all 18 unneeded rusted clamps, obsolete tool bits, and scrap buckets into Red Tag Holding Area.',
    },
    {
      milestoneName: '2S - 5-Axis Milling Shadow Board & Tool Tagging',
      plannedStartDate: new Date(Date.now() - 10 * 86400000),
      plannedEndDate: new Date(Date.now() - 6 * 86400000),
      actualStartDate: new Date(Date.now() - 10 * 86400000),
      actualEndDate: new Date(Date.now() - 6 * 86400000),
      progressPercent: 100,
      status: 'COMPLETED',
      notes: 'Installed high-density two-tone blue shadow foam board with etched torque wrenches and metric collet cutouts.',
    },
    {
      milestoneName: '3S - Autonomous Daily Spindle & Coolant Tank Cleaning',
      plannedStartDate: new Date(Date.now() - 6 * 86400000),
      plannedEndDate: new Date(Date.now() - 2 * 86400000),
      actualStartDate: new Date(Date.now() - 6 * 86400000),
      actualEndDate: new Date(Date.now() - 2 * 86400000),
      progressPercent: 100,
      status: 'COMPLETED',
      notes: 'Autonomous maintenance cleaning checklist posted with daily swarf chip tray emptying and optical lens wipe.',
    },
    {
      milestoneName: '4S - Floor Demarcation & Digital SOP QR Integration',
      plannedStartDate: new Date(Date.now() - 2 * 86400000),
      plannedEndDate: new Date(Date.now() + 3 * 86400000),
      actualStartDate: new Date(Date.now() - 2 * 86400000),
      progressPercent: 80,
      status: 'IN_PROGRESS',
      notes: 'High-visibility 3M floor hazard striping and 1-meter safety boundary completed; tablet digital SOP dock being installed.',
    },
    {
      milestoneName: '5S - Tier-1 Kamishibai Daily Shift Handover Audit Routine',
      plannedStartDate: new Date(Date.now() + 2 * 86400000),
      plannedEndDate: new Date(Date.now() + 7 * 86400000),
      progressPercent: 50,
      status: 'IN_PROGRESS',
      notes: 'Training shift 1 and shift 2 machine operators on 5-minute end-of-shift visual handover sign-off board.',
    },
  ];

  for (const tl of timelineData) {
    const existingTl = await prisma.locationTimeline.findFirst({
      where: { tenantId: tenant1.id, locationId: loc1.id, milestoneName: tl.milestoneName },
    });
    if (!existingTl) {
      await prisma.locationTimeline.create({
        data: {
          tenantId: tenant1.id,
          locationId: loc1.id,
          ...tl,
        },
      });
    }
  }

  // Location Documents for LOC-BLR-MACH-CNC01 (SOPs, Blueprints, Safety Guides)
  const documentsData = [
    {
      title: 'SOP-CNC-5S-DAILY-01: Daily 5-Axis CNC Autonomous Maintenance & 5S Cleaning Routine',
      docType: 'SOP',
      fileUrl: 'https://storage.5s-saas.com/sops/sop-cnc-daily-maintenance.pdf',
      fileSizeKb: 1420,
      version: '2.1',
      uploadedById: userMap.get('coordinator.5s@skilglobal.com'),
    },
    {
      title: 'STD-LAYOUT-CNC01: Approved Workstation Boundary Floor Demarcation & Shadow Board Layout',
      docType: 'LAYOUT_MAP',
      fileUrl: 'https://storage.5s-saas.com/layouts/layout-cnc01-boundary.pdf',
      fileSizeKb: 2850,
      version: '1.0',
      uploadedById: userMap.get('admin@skilglobal.com'),
    },
    {
      title: 'SOP-EHS-LOTO-04: Machine Lockout/Tagout & Hydraulic Emergency Isolation Procedure',
      docType: 'SAFETY_GUIDELINE',
      fileUrl: 'https://storage.5s-saas.com/safety/loto-cnc-milling.pdf',
      fileSizeKb: 980,
      version: '3.0',
      uploadedById: userMap.get('coordinator.5s@skilglobal.com'),
    },
    {
      title: 'STD-TOOLING-SPEC-02: Approved CNC Tooling Calibrated Torque Limits & Visual Standards',
      docType: 'CLEANING_STANDARD',
      fileUrl: 'https://storage.5s-saas.com/standards/tooling-specs-cnc.pdf',
      fileSizeKb: 1150,
      version: '1.2',
      uploadedById: userMap.get('owner.cnc01@skilglobal.com'),
    },
  ];

  for (const doc of documentsData) {
    const existingDoc = await prisma.locationDocument.findFirst({
      where: { tenantId: tenant1.id, locationId: loc1.id, title: doc.title },
    });
    if (!existingDoc) {
      await prisma.locationDocument.create({
        data: {
          tenantId: tenant1.id,
          locationId: loc1.id,
          ...doc,
        },
      });
    }
  }

  // Location Audit Logs for LOC-BLR-MACH-CNC01
  const auditLogsData = [
    {
      actionType: 'CREATED',
      details: 'Centralized Location Master record established for CNC Machining Bay 04 with High Risk Daily Cadence.',
      userId: userMap.get('admin@skilglobal.com'),
    },
    {
      actionType: 'OWNERSHIP_ASSIGNED',
      details: 'Assigned Primary Owner David Chen (CNC Line Team Leader) and Backup Owner Marcus Brody (Machining Ops Manager).',
      userId: userMap.get('admin@skilglobal.com'),
    },
    {
      actionType: 'TIMELINE_UPDATED',
      details: '1S Sort and 2S Set-in-Order milestones formally verified and signed off at 100% completion.',
      userId: userMap.get('coordinator.5s@skilglobal.com'),
    },
    {
      actionType: 'STANDARD_ATTACHED',
      details: 'Linked approved Visual Standard STD-5S-MACH-01 (CNC Tooling & Shadow Board Standard) as baseline benchmark.',
      userId: userMap.get('coordinator.5s@skilglobal.com'),
    },
  ];

  for (const log of auditLogsData) {
    const existingLog = await prisma.locationAuditLog.findFirst({
      where: { tenantId: tenant1.id, locationId: loc1.id, actionType: log.actionType },
    });
    if (!existingLog) {
      await prisma.locationAuditLog.create({
        data: {
          tenantId: tenant1.id,
          locationId: loc1.id,
          ...log,
        },
      });
    }
  }

  const loc2 = await prisma.location.upsert({
    where: { tenantId_areaCode: { tenantId: tenant1.id, areaCode: 'LOC-BLR-ASM-LINE01' } },
    update: { heroPhotoUrl: '/assets/5s/smt_electronics_clean.jpg' },
    create: {
      tenantId: tenant1.id,
      orgNodeId: deptAssembly.id,
      areaCode: 'LOC-BLR-ASM-LINE01',
      name: 'Chassis Main Assembly Station A',
      locationType: 'PRODUCTION_LINE',
      riskLevel: 'MEDIUM',
      auditFrequency: 'WEEKLY',
      building: 'Building B',
      floor: '1st Floor',
      description: 'Powertrain assembly station with pneumatic balancers and visual parts racks.',
      heroPhotoUrl: '/assets/5s/smt_electronics_clean.jpg',
      qrCodeData: `5s://${tenant1.slug}/locations/LOC-BLR-ASM-LINE01`,
      status: 'ACTIVE',
      ownerId: userMap.get('owner.asm01@skilglobal.com'),
    },
  });

  const loc3 = await prisma.location.upsert({
    where: { tenantId_areaCode: { tenantId: tenant1.id, areaCode: 'LOC-BLR-WH-REDTAG01' } },
    update: { heroPhotoUrl: '/assets/5s/warehouse_racks_clean.jpg' },
    create: {
      tenantId: tenant1.id,
      orgNodeId: deptWarehouse.id,
      areaCode: 'LOC-BLR-WH-REDTAG01',
      name: 'Central Holding & Red Tag Zone',
      locationType: 'RED_TAG_ZONE',
      riskLevel: 'HIGH',
      auditFrequency: 'DAILY',
      building: 'Logistics Annex',
      floor: 'Ground Floor',
      description: 'Designated 5S quarantine zone for segregated unneeded items.',
      heroPhotoUrl: '/assets/5s/warehouse_racks_clean.jpg',
      qrCodeData: `5s://${tenant1.slug}/locations/LOC-BLR-WH-REDTAG01`,
      status: 'ACTIVE',
      ownerId: userMap.get('coordinator.5s@skilglobal.com'),
    },
  });

  // ==========================================
  // PHASE 2 SEEDING: STANDARDS & REVISIONS
  // ==========================================
  console.log('📦 Seeding Phase 2: 5S Standards...');

  const std1 = await prisma.standard.upsert({
    where: { tenantId_code: { tenantId: tenant1.id, code: 'STD-5S-MACH-01' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      code: 'STD-5S-MACH-01',
      title: 'CNC Machining Tooling & Shadow Board Standard',
      category: 'S2_SET_IN_ORDER',
      scopeType: 'LOCATION_TYPE',
      status: 'PUBLISHED',
    },
  });

  await prisma.standardRevision.create({
    data: {
      tenantId: tenant1.id,
      standardId: std1.id,
      revisionNumber: '1.0',
      description: 'Approved visual standard for 5-axis CNC machining tool shadow boards and metric socket racks.',
      rules: JSON.stringify([
        'Tool must be stored in designated labelled position on shadow board.',
        'Shadow foam cutout color contrast must match physical tool silhouette.',
        'No missing tools allowed at end of shift handoff.',
        'Broken, chipped or worn tools strictly prohibited on bench.',
        'Maximum quantity of torque wrenches: 2.',
      ]),
      referencePhotos: JSON.stringify([
        {
          type: 'STANDARD_CONDITION',
          photoUrl: '/assets/5s/shadow_board_std.jpg',
          label: 'Approved Shadow Board (Standard Condition)',
          description: 'All wrenches in cutouts with tool numbers clearly visible.',
        },
        {
          type: 'CURRENT_CONDITION',
          photoUrl: '/assets/5s/shadow_board_clutter.jpg',
          label: 'Current Condition Snapshot (Defect / Cluttered)',
          description: 'Recent photo taken during shift audit showing disorganized bench.',
        },
      ]),
      videoUrl: 'https://youtube.com/watch?v=sample-5s-standard',
      sopDocumentUrl: 'https://storage.5s-saas.com/standards/sop-shadow-board.pdf',
      authorId: userMap.get('coordinator.5s@skilglobal.com'),
      approvedById: userMap.get('admin@skilglobal.com'),
      approvedAt: new Date(),
      isCurrent: true,
      revisionComments: 'Initial formal publication of tooling standard.',
    },
  });

  const std2 = await prisma.standard.upsert({
    where: { tenantId_code: { tenantId: tenant1.id, code: 'STD-5S-SAFETY-01' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      code: 'STD-5S-SAFETY-01',
      title: 'Emergency Gangway & Fire Extinguisher Demarcation',
      category: 'S6_SAFETY',
      scopeType: 'GLOBAL',
      status: 'PUBLISHED',
    },
  });

  await prisma.standardRevision.create({
    data: {
      tenantId: tenant1.id,
      standardId: std2.id,
      revisionNumber: '1.0',
      description: 'Safety standard for floor boundary tapes and 1-meter obstruction clearance around fire extinguishers.',
      rules: JSON.stringify([
        'Minimum 1-meter clear radial radius around all fire extinguishers and electrical breaker panels.',
        'Yellow/black hazard tape (100mm width) demarcating fire equipment zone.',
        'Gangways must remain completely unobstructed by pallets, cables, or totes at all times.',
      ]),
      referencePhotos: JSON.stringify([
        {
          type: 'STANDARD_CONDITION',
          photoUrl: '/assets/5s/fire_safety_std.jpg',
          label: 'Clear Gangway & Extinguisher (Standard)',
          description: 'Zero items within 1-meter safety boundary with KEEP CLEAR floor marking.',
        },
        {
          type: 'CURRENT_CONDITION',
          photoUrl: '/assets/5s/fire_safety_blocked.jpg',
          label: 'Blocked Fire Extinguisher (Safety Violation)',
          description: 'Wooden pallets and cables obstructing emergency equipment access.',
        },
      ]),
      authorId: userMap.get('coordinator.5s@skilglobal.com'),
      approvedById: userMap.get('admin@skilglobal.com'),
      approvedAt: new Date(),
      isCurrent: true,
    },
  });

  // ==========================================
  // PHASE 2 SEEDING: AUDIT TEMPLATES & ALL 11 QUESTION TYPES
  // ==========================================
  console.log('📋 Seeding Phase 2: Audit Template Builder with All 11 Question Types & Safety Caps...');

  const template = await prisma.auditTemplate.upsert({
    where: { tenantId_code: { tenantId: tenant1.id, code: 'TPL-5S-DISCRETE-01' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      code: 'TPL-5S-DISCRETE-01',
      name: 'Discrete Manufacturing Comprehensive 5S & Safety Audit',
      description: 'Master operational audit checklist covering S1-S5 and Critical Safety dimensions (§19–21).',
      auditType: 'ROUTINE',
      categoryScoringModel: JSON.stringify({ S1: 20, S2: 20, S3: 20, S4: 20, S5: 20 }),
      status: 'ACTIVE',
    },
  });

  const templateVersion = await prisma.auditTemplateVersion.create({
    data: {
      tenantId: tenant1.id,
      templateId: template.id,
      versionNumber: '1.0',
      changeSummary: 'Master approved baseline version',
      isPublished: true,
      publishedAt: new Date(),
      publishedById: userMap.get('admin@skilglobal.com'),
    },
  });

  // Section 1: 1S - Sort
  const secSort = await prisma.auditTemplateSection.create({
    data: {
      tenantId: tenant1.id,
      templateVersionId: templateVersion.id,
      title: '1S - Sort Physical Area Cleanout',
      category: 'S1_SORT',
      sortOrder: 1,
    },
  });

  await prisma.auditTemplateQuestion.create({
    data: {
      tenantId: tenant1.id,
      sectionId: secSort.id,
      questionCode: 'Q-SORT-01',
      questionText: 'Are all unnecessary tools, defective parts, and surplus scrap containers removed from the immediate workstation?',
      guidance: 'Inspect underneath benches, machine corners, and conveyor bases.',
      questionType: 'PASS_FAIL',
      weightage: 1.5,
      severity: 'MAJOR',
      isCritical: false,
      requireEvidenceOnScoreBelow: 100,
      mandatoryEvidence: true,
      sortOrder: 1,
    },
  });

  await prisma.auditTemplateQuestion.create({
    data: {
      tenantId: tenant1.id,
      sectionId: secSort.id,
      questionCode: 'Q-SORT-02',
      questionText: 'Rate the Red Tag quarantine adherence: Are unneeded items properly tagged with date, reason, and estimated value?',
      guidance: 'Verify items stored for >48 hours have formal Red Tag disposition decision.',
      questionType: 'NUMERIC_0_5',
      weightage: 1.0,
      severity: 'MODERATE',
      sortOrder: 2,
    },
  });

  // Section 2: 2S - Set in Order
  const secSetInOrder = await prisma.auditTemplateSection.create({
    data: {
      tenantId: tenant1.id,
      templateVersionId: templateVersion.id,
      title: '2S - Set in Order Visual Storage & Demarcation',
      category: 'S2_SET_IN_ORDER',
      sortOrder: 2,
    },
  });

  await prisma.auditTemplateQuestion.create({
    data: {
      tenantId: tenant1.id,
      sectionId: secSetInOrder.id,
      questionCode: 'Q-SET-01',
      questionText: 'Do all hand tools match the designated shadow board foam cutout and carry legible tool IDs?',
      guidance: 'Reference Standard STD-5S-MACH-01. Check for missing or misplaced tools.',
      standardId: std1.id,
      questionType: 'MULTIPLE_CHOICE',
      options: JSON.stringify([
        { label: '100% - All tools in position with shadow cutout', score: 100 },
        { label: '70% - Minor tool misalignment, no missing tools', score: 70 },
        { label: '30% - Multiple missing tools without checkout tag', score: 30 },
        { label: '0% - Severe clutter, no shadow board adherence', score: 0 },
      ]),
      weightage: 2.0,
      severity: 'MAJOR',
      sortOrder: 1,
    },
  });

  await prisma.auditTemplateQuestion.create({
    data: {
      tenantId: tenant1.id,
      sectionId: secSetInOrder.id,
      questionCode: 'Q-SET-02',
      questionText: 'Are aisle markings, gangway lines, and storage boundaries clearly visible and intact?',
      questionType: 'PERCENTAGE',
      weightage: 1.0,
      severity: 'MODERATE',
      sortOrder: 2,
    },
  });

  // Section 3: 3S - Shine
  const secShine = await prisma.auditTemplateSection.create({
    data: {
      tenantId: tenant1.id,
      templateVersionId: templateVersion.id,
      title: '3S - Shine Cleanliness & Inspection',
      category: 'S3_SHINE',
      sortOrder: 3,
    },
  });

  await prisma.auditTemplateQuestion.create({
    data: {
      tenantId: tenant1.id,
      sectionId: secShine.id,
      questionCode: 'Q-SHINE-01',
      questionText: 'Is the equipment free of oil leaks, coolant spills, and metal swarf build-up?',
      questionType: 'YES_NO',
      weightage: 1.5,
      severity: 'MAJOR',
      requireEvidenceOnScoreBelow: 1,
      mandatoryEvidence: true,
      sortOrder: 1,
    },
  });

  await prisma.auditTemplateQuestion.create({
    data: {
      tenantId: tenant1.id,
      sectionId: secShine.id,
      questionCode: 'Q-SHINE-02',
      questionText: 'Verify execution of autonomous cleaning checklists:',
      questionType: 'CHECKLIST',
      options: JSON.stringify([
        { label: 'Spindle nose cleaned & wiped', score: 25 },
        { label: 'Chip conveyor bin emptied', score: 25 },
        { label: 'Coolant tank level checked', score: 25 },
        { label: 'Floor swept and degreased', score: 25 },
      ]),
      weightage: 1.5,
      severity: 'MODERATE',
      sortOrder: 2,
    },
  });

  // Section 4: 6S - Safety with Score Cap!
  const secSafety = await prisma.auditTemplateSection.create({
    data: {
      tenantId: tenant1.id,
      templateVersionId: templateVersion.id,
      title: '6S - Safety & Environmental Compliance (Critical Caps)',
      category: 'S6_SAFETY',
      sortOrder: 4,
    },
  });

  await prisma.auditTemplateQuestion.create({
    data: {
      tenantId: tenant1.id,
      sectionId: secSafety.id,
      questionCode: 'Q-SAFE-01',
      questionText: 'CRITICAL SAFETY: Are all fire extinguishers, emergency eyewash stations, and fire exit doors 100% unobstructed?',
      guidance: 'BRD §43 Critical Rule: Any failure automatically caps overall audit score at 70% max.',
      standardId: std2.id,
      questionType: 'PASS_FAIL',
      weightage: 2.5,
      severity: 'CRITICAL',
      isCritical: true,
      scoreCapOnFail: 70, // Caps audit at 70% if failed!
      mandatoryEvidence: true,
      sortOrder: 1,
    },
  });

  // ==========================================
  // PHASE 2 SEEDING: AUDIT SCHEDULING ENGINE
  // ==========================================
  console.log('⏰ Seeding Phase 2: Audit Scheduling Engine with Auditor Rotation...');

  const schedule1 = await prisma.auditSchedule.upsert({
    where: { tenantId_scheduleCode: { tenantId: tenant1.id, scheduleCode: 'SCHED-BLR-WEEKLY-01' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      scheduleCode: 'SCHED-BLR-WEEKLY-01',
      title: 'Weekly Autonomous 5S Assessment — Plant 1 Workstations',
      templateId: template.id,
      templateVersionId: templateVersion.id,
      auditType: 'ROUTINE',
      targetType: 'ALL_AREAS',
      recurrence: 'WEEKLY',
      recurrenceIntervalDays: 7,
      rotationRule: 'DEPT_INDEPENDENCE',
      leadTimeDays: 2,
      status: 'ACTIVE',
      nextRunAt: new Date(Date.now() + 2 * 86400000),
    },
  });

  // Generate initial scheduled audit instances for seeded locations across Calendar
  const locations = [loc1, loc2, loc3];
  const auditors = [
    userMap.get('auditor.lead@skilglobal.com'),
    userMap.get('coordinator.5s@skilglobal.com'),
    userMap.get('admin@skilglobal.com'),
  ];
  const now = new Date();

  const sampleScheduledData = [
    { offsetDays: -4, status: 'SUBMITTED', locIdx: 0, audIdx: 0, code: 'AUD-BLR-2026-0001', notes: 'Completed with 84.5% score' },
    { offsetDays: -2, status: 'SUBMITTED', locIdx: 1, audIdx: 1, code: 'AUD-BLR-2026-0002', notes: 'Completed with 78% score' },
    { offsetDays: 0, status: 'IN_PROGRESS', locIdx: 2, audIdx: 0, code: 'AUD-BLR-2026-0003', notes: 'Active inspection on warehouse floor' },
    { offsetDays: 1, status: 'SCHEDULED', locIdx: 0, audIdx: 0, code: 'AUD-BLR-2026-0004', notes: 'Tomorrow morning shift 1 5S check' },
    { offsetDays: 3, status: 'SCHEDULED', locIdx: 1, audIdx: 1, code: 'AUD-BLR-2026-0005', notes: 'Chassis assembly line bi-weekly audit' },
    { offsetDays: 6, status: 'SCHEDULED', locIdx: 2, audIdx: 2, code: 'AUD-BLR-2026-0006', notes: 'Logistics and red tag quarantine check' },
    { offsetDays: 8, status: 'SCHEDULED', locIdx: 0, audIdx: 1, code: 'AUD-BLR-2026-0007', notes: 'CNC bay deep autonomous clean audit' },
    { offsetDays: 12, status: 'SCHEDULED', locIdx: 1, audIdx: 0, code: 'AUD-BLR-2026-0008', notes: 'Final assembly shadow board verification' },
    { offsetDays: 15, status: 'SCHEDULED', locIdx: 2, audIdx: 1, code: 'AUD-BLR-2026-0009', notes: 'Monthly hazardous chemical storage audit' },
    { offsetDays: 18, status: 'SCHEDULED', locIdx: 0, audIdx: 0, code: 'AUD-BLR-2026-0010', notes: 'Precision tooling calibration cadence' },
  ];

  for (const item of sampleScheduledData) {
    const loc = locations[item.locIdx % locations.length];
    const plannedDate = new Date(now.getTime() + item.offsetDays * 86400000);
    const dueDate = new Date(plannedDate.getTime() + 2 * 86400000);

    await prisma.scheduledAuditInstance.upsert({
      where: { tenantId_auditCode: { tenantId: tenant1.id, auditCode: item.code } },
      update: {
        plannedDate,
        dueDate,
        status: item.status,
        notes: item.notes,
        auditorId: auditors[item.audIdx % auditors.length],
      },
      create: {
        tenantId: tenant1.id,
        scheduleId: schedule1.id,
        auditCode: item.code,
        templateVersionId: templateVersion.id,
        locationId: loc.id,
        auditorId: auditors[item.audIdx % auditors.length],
        auditType: 'ROUTINE',
        plannedDate,
        dueDate,
        status: item.status,
        notes: item.notes,
      },
    });
  }

  // ==========================================
  // PHASE 3 SEED: AUDIT EXECUTION, OBSERVATIONS, CAPA & RED TAGS
  // ==========================================

  const defaultAdmin = userMap.get('admin@skilglobal.com')!;
  const leadAuditor = userMap.get('auditor.lead@skilglobal.com') || defaultAdmin;
  const areaOwner = userMap.get('owner.asm01@skilglobal.com') || defaultAdmin;
  const coordinator = userMap.get('coordinator.5s@skilglobal.com') || defaultAdmin;

  // 1. Audit Execution
  const execution1 = await prisma.auditExecution.upsert({
    where: { tenantId_auditCode: { tenantId: tenant1.id, auditCode: 'EXEC-BLR-2026-0001' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      locationId: loc1.id,
      templateId: template.id,
      templateVersionId: templateVersion.id,
      auditorId: leadAuditor,
      auditCode: 'EXEC-BLR-2026-0001',
      auditType: 'ROUTINE',
      status: 'SUBMITTED',
      startedAt: new Date(now.getTime() - 2 * 3600000),
      completedAt: new Date(now.getTime() - 1 * 3600000),
      overallScore: 84.5,
      maxPossibleScore: 100.0,
      earnedScore: 84.5,
      pillarScores: JSON.stringify({
        S1_SORT: 78.0,
        S2_SET_IN_ORDER: 88.0,
        S3_SHINE: 75.0,
        S4_STANDARDIZE: 95.0,
        S5_SUSTAIN: 86.0,
        S6_SAFETY: 100.0,
      }),
      isPassed: true,
      criticalFailureCount: 0,
      summaryNotes: 'Comprehensive 5S audit completed. Strong adherence in standardized floor markings and safety protocols. Non-conformances noted in obsolete tooling clutter (1S) and hydraulic lubricant seepage under conveyor motor (3S).',
      auditorName: 'Vikram Joshi (Lead 5S Auditor)',
      auditorSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    },
  });

  const execution2 = await prisma.auditExecution.upsert({
    where: { tenantId_auditCode: { tenantId: tenant1.id, auditCode: 'EXEC-BLR-2026-0004' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      locationId: loc1.id,
      templateId: template.id,
      templateVersionId: templateVersion.id,
      auditorId: userMap.get('coordinator.5s@skilglobal.com') || leadAuditor,
      auditCode: 'EXEC-BLR-2026-0004',
      auditType: 'ROUTINE',
      status: 'SUBMITTED',
      startedAt: new Date(now.getTime() - 24 * 3600000),
      completedAt: new Date(now.getTime() - 23 * 3600000),
      overallScore: 92.5,
      maxPossibleScore: 100.0,
      earnedScore: 92.5,
      pillarScores: JSON.stringify({
        S1_SORT: 92.0,
        S2_SET_IN_ORDER: 95.0,
        S3_SHINE: 88.0,
        S4_STANDARDIZE: 95.0,
        S5_SUSTAIN: 92.0,
        S6_SAFETY: 100.0,
      }),
      isPassed: true,
      criticalFailureCount: 0,
      summaryNotes: 'Re-audit of CNC Milling Cell 01 confirmed substantial 5S improvements. Sub-bench clutter completely eradicated and shadow board tool tags 100% compliant.',
      auditorName: 'Sarah Jenkins (5S Program Coordinator)',
      auditorSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    },
  });

  // 2. Observations
  const obs1 = await prisma.observation.upsert({
    where: { tenantId_observationCode: { tenantId: tenant1.id, observationCode: 'OBS-BLR-2026-0001' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      observationCode: 'OBS-BLR-2026-0001',
      executionId: execution1.id,
      locationId: loc1.id,
      category: 'S1_SORT',
      severity: 'CRITICAL',
      title: 'Obsolete and Unlabelled Fixtures Stored Under Workstation Bench',
      description: 'Found 4 unlabelled machining fixtures and corroded cutting dies stored directly on the floor under Assembly Station 01. Obstructs operator legroom and poses tripping hazard.',
      beforePhotoUrl: '/assets/5s/cluttered_under_bench.jpg',
      annotatedPhotoUrl: '/assets/5s/cluttered_under_bench.jpg',
      annotationData: JSON.stringify([{ type: 'circle', x: 250, y: 180, radius: 45, color: '#EF4444', text: 'Obsolete Fixture' }]),
      status: 'ACTION_ASSIGNED',
      riskAssessment: 'High safety risk and potential parts mix-up during changeovers.',
      tags: JSON.stringify(['1S-Sort', 'Clutter', 'TripHazard']),
      loggedById: leadAuditor,
    },
  });

  const obs2 = await prisma.observation.upsert({
    where: { tenantId_observationCode: { tenantId: tenant1.id, observationCode: 'OBS-BLR-2026-0002' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      observationCode: 'OBS-BLR-2026-0002',
      executionId: execution1.id,
      locationId: loc2.id,
      category: 'S3_SHINE',
      severity: 'MAJOR',
      title: 'Hydraulic Oil Sheen and Leakage around Pump Motor Seal',
      description: 'Secondary hydraulic power pack shows slow dripping oil accumulating in drip tray without absorbent pads. Originating from flange coupling gasket.',
      beforePhotoUrl: '/assets/5s/oil_leak_defect.jpg',
      annotatedPhotoUrl: '/assets/5s/oil_leak_defect.jpg',
      annotationData: JSON.stringify([{ type: 'arrow', fromX: 100, fromY: 100, toX: 220, toY: 190, color: '#F59E0B', text: 'Oil Leak' }]),
      status: 'IN_PROGRESS',
      riskAssessment: 'Slip hazard and environmental non-conformance.',
      tags: JSON.stringify(['3S-Shine', 'OilLeak', 'Equipment']),
      loggedById: leadAuditor,
    },
  });

  const obs3 = await prisma.observation.upsert({
    where: { tenantId_observationCode: { tenantId: tenant1.id, observationCode: 'OBS-BLR-2026-0003' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      observationCode: 'OBS-BLR-2026-0003',
      executionId: execution1.id,
      locationId: loc3.id,
      category: 'S2_SET_IN_ORDER',
      severity: 'MODERATE',
      title: 'Missing Shadow Board Color-Coding Tape for Torque Wrenches',
      description: 'Torque wrench slots #3 and #4 on tool board have degraded color tape and faded torque limit labels.',
      beforePhotoUrl: '/assets/5s/shadow_board_clutter.jpg',
      status: 'PENDING_VERIFICATION',
      riskAssessment: 'Risk of operator using incorrect torque rating.',
      tags: JSON.stringify(['2S-SetInOrder', 'VisualControl', 'Tools']),
      loggedById: leadAuditor,
    },
  });

  const obs4 = await prisma.observation.upsert({
    where: { tenantId_observationCode: { tenantId: tenant1.id, observationCode: 'OBS-BLR-2026-0004' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      observationCode: 'OBS-BLR-2026-0004',
      executionId: execution1.id,
      locationId: loc1.id,
      category: 'S5_SUSTAIN',
      severity: 'KAIZEN_OPPORTUNITY',
      title: 'Exemplary Digital 5S Kaizen Board Implemented by Team Alpha',
      description: 'Workstation team built an innovative magnetic QR holder allowing shift operators to view SOPs directly on tablets with 1 tap.',
      beforePhotoUrl: '/assets/5s/kaizen_board_digital.jpg',
      status: 'RESOLVED',
      riskAssessment: 'Best practice recommended for plant-wide rollout.',
      tags: JSON.stringify(['5S-Kaizen', 'BestPractice', 'Innovation']),
      loggedById: leadAuditor,
    },
  });

  // 3. Corrective Actions (CAPA)
  const capa1 = await prisma.correctiveAction.upsert({
    where: { tenantId_actionCode: { tenantId: tenant1.id, actionCode: 'CAPA-BLR-2026-0001' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      actionCode: 'CAPA-BLR-2026-0001',
      observationId: obs1.id,
      locationId: loc1.id,
      title: 'Remove Obsolete Fixtures and Red Tag to Holding Area',
      description: 'Inspect all sub-bench storage areas, segregate obsolete tooling, and transfer to Plant Red Tag Holding Area for disposal evaluation.',
      actionType: 'CORRECTIVE',
      rootCauseCategory: 'METHOD',
      fiveWhyAnalysis: JSON.stringify({
        why1: 'Why were obsolete tools stored under bench? Operator kept them as backups.',
        why2: 'Why were backups needed? No clear procedure for tool decommissioning.',
        why3: 'Why was there no decommissioning procedure? Red Tag workflow not trained for shift 2.',
        why4: 'Why was training missing? New onboarding module had not covered red tagging.',
        why5: 'Root Cause: Absence of standard 1S sorting cadence and shift handover checklist.',
        rootCauseConclusion: 'Absence of standard 1S sorting routine and shift handover checklist for tooling quarantine.',
        solution: 'Establish dedicated tooling quarantine zone and install red-tag holding rack with 48h SLA disposal policy.',
        preventiveAction: 'Incorporate 5-minute end-of-shift 1S sorting checklist into shift handover standard SOP-5S-01.',
        verificationCriteria: '0 unlabelled or obsolete tools found under assembly benches during 3 consecutive weekly audits.',
      }),
      assigneeId: areaOwner,
      assignedById: leadAuditor,
      targetDate: new Date(now.getTime() + 24 * 3600000), // 24 Hours SLA
      slaHours: 24,
      isOverdue: false,
      escalationTier: 'NORMAL',
      status: 'ASSIGNED',
    },
  });

  const capa2 = await prisma.correctiveAction.upsert({
    where: { tenantId_actionCode: { tenantId: tenant1.id, actionCode: 'CAPA-BLR-2026-0002' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      actionCode: 'CAPA-BLR-2026-0002',
      observationId: obs2.id,
      locationId: loc2.id,
      title: 'Replace Flange Gasket and Clean Power Pack Basin',
      description: 'Lockout/Tagout hydraulic unit, replace worn Viton flange seal, torque bolts to 65 Nm, and install absorbent containment socks in drip tray.',
      actionType: 'CORRECTIVE',
      rootCauseCategory: 'MACHINE',
      fiveWhyAnalysis: JSON.stringify({
        why1: 'Why is pump leaking? Flange gasket degraded from heat cycles.',
        why2: 'Why did gasket degrade? Gasket was standard Buna-N instead of high-temp Viton.',
        why3: 'Why was wrong gasket installed? Maintenance storeroom stock part mismatch.',
        why4: 'Why was there a part mismatch? Bill of materials had generic gasket code.',
        why5: 'Root Cause: Preventative maintenance BOM lacked temperature-rated part spec.',
        rootCauseConclusion: 'Preventative maintenance BOM lacked high-temperature Viton gasket specification.',
        solution: 'Replace flange seal with Viton high-temp grade (Part #VT-882), torque bolts to 65 Nm, and install catchment drip tray.',
        preventiveAction: 'Update CMMS maintenance BOM master and supplier catalogue to restrict standard Buna-N gaskets for high-heat pumps.',
        verificationCriteria: 'Zero hydraulic fluid seepage across 100 operating hours post-restart.',
      }),
      assigneeId: areaOwner,
      assignedById: leadAuditor,
      targetDate: new Date(now.getTime() + 72 * 3600000), // 3 Days SLA
      slaHours: 72,
      isOverdue: false,
      escalationTier: 'NORMAL',
      status: 'IN_PROGRESS',
    },
  });

  const capa3 = await prisma.correctiveAction.upsert({
    where: { tenantId_actionCode: { tenantId: tenant1.id, actionCode: 'CAPA-BLR-2026-0003' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      actionCode: 'CAPA-BLR-2026-0003',
      observationId: obs3.id,
      locationId: loc3.id,
      title: 'Re-tape Shadow Board with High-Durability 3M Visual Striping',
      description: 'Applied new high-contrast yellow/black border tape and laminated torque specification guide next to wrench slots.',
      actionType: 'CORRECTIVE',
      rootCauseCategory: 'METHOD',
      fiveWhyAnalysis: JSON.stringify({
        why1: 'Why was shadow board outline missing? Adhesive tape peeled from solvent wipe-downs.',
        why2: 'Why did tape peel? Standard paper tape used instead of vinyl industrial grade.',
        why3: 'Why was paper tape used? Quick temporary fix was never replaced.',
        why4: 'Why was it not replaced? Visual standard maintenance was not on 5S audit checklist.',
        why5: 'Root Cause: Shadow board visual standards lacked scheduled maintenance inspection.',
        rootCauseConclusion: 'Shadow board visual striping degraded from solvent cleaning and lacked preventative audit check.',
        solution: 'Apply heavy-duty 3M 5700 vinyl safety tape with protective poly-laminate and re-mount calibrated torque wrench brackets.',
        preventiveAction: 'Update cleaning SOP to mandate non-solvent cleaner on visual boards and add monthly visual audit check.',
        verificationCriteria: '100% tool return compliance verified by shift lead at end of each production shift.',
      }),
      assigneeId: areaOwner,
      assignedById: leadAuditor,
      targetDate: new Date(now.getTime() + 7 * 86400000),
      slaHours: 168,
      isOverdue: false,
      escalationTier: 'NORMAL',
      status: 'PENDING_VERIFICATION',
      closureNotes: 'Completed visual striping renewal using industrial 3M 5700 vinyl safety tape. Calibrated all 4 torque wrenches.',
      afterPhotoUrl: '/assets/5s/shadow_board_std.jpg',
      closureSubmittedAt: new Date(now.getTime() - 4 * 3600000),
      verifiedById: coordinator,
    },
  });

  // Action History Logs
  await prisma.actionHistoryLog.createMany({
    data: [
      {
        tenantId: tenant1.id,
        actionId: capa1.id,
        actorId: leadAuditor,
        actorName: 'Vikram Joshi (Lead Auditor)',
        fromStatus: 'OPEN',
        toStatus: 'ASSIGNED',
        comment: 'Action generated automatically from Critical Observation OBS-BLR-2026-0001 during 5S audit.',
      },
      {
        tenantId: tenant1.id,
        actionId: capa3.id,
        actorId: areaOwner,
        actorName: 'Ramesh Kumar (Area Owner)',
        fromStatus: 'IN_PROGRESS',
        toStatus: 'PENDING_VERIFICATION',
        comment: 'Shadow board striping replaced and torque specs verified. Ready for independent verification.',
      },
    ],
  });

  // 4. Red Tag Register
  await prisma.redTag.upsert({
    where: { tenantId_tagNumber: { tenantId: tenant1.id, tagNumber: 'RT-BLR-2026-0001' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      tagNumber: 'RT-BLR-2026-0001',
      locationId: loc1.id,
      targetHoldingAreaId: loc2.id,
      itemName: 'Defective Pneumatic Air Drill Motor (3000 RPM)',
      itemDescription: 'Motor stator seized with broken trigger throttle valve. Unusable in production.',
      category: 'BROKEN_EQUIPMENT',
      quantity: 2,
      unitOfMeasure: 'PCS',
      estimatedValue: 450.0,
      taggedById: leadAuditor,
      taggedDate: new Date(now.getTime() - 8 * 86400000), // 8 Days Ago (In Holding Area)
      reason: 'Motor failed electrical insulation and torque test. Replaced with new ergonomic tool.',
      photoUrl: '/assets/5s/red_tag_holding_area.jpg',
      status: 'IN_HOLDING_AREA',
      dispositionAction: 'REPAIR_RESTORE',
      dispositionJustification: 'Can be refurbished by vendor for 30% of replacement cost.',
      targetDispositionDate: new Date(now.getTime() + 6 * 86400000),
    },
  });

  await prisma.redTag.upsert({
    where: { tenantId_tagNumber: { tenantId: tenant1.id, tagNumber: 'RT-BLR-2026-0002' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      tagNumber: 'RT-BLR-2026-0002',
      locationId: loc1.id,
      targetHoldingAreaId: loc2.id,
      itemName: 'Surplus Pre-Machined Stainless Billets (Grade 316L)',
      itemDescription: '15 units of stainless cylindrical billets leftover from cancelled export batch.',
      category: 'SURPLUS_INVENTORY',
      quantity: 15,
      unitOfMeasure: 'PCS',
      estimatedValue: 3200.0,
      taggedById: leadAuditor,
      taggedDate: new Date(now.getTime() - 22 * 86400000), // 22 Days Ago (Ageing warning)
      reason: 'No upcoming production order planned for this specific grade in Line 01.',
      photoUrl: '/assets/5s/red_tag_holding_area.jpg',
      status: 'PENDING_DISPOSITION',
      dispositionAction: 'RELOCATE',
      dispositionJustification: 'Transfer to Plant 2 Aerostructures line where Grade 316L is actively consumed.',
      targetDispositionDate: new Date(now.getTime() + 2 * 86400000),
    },
  });

  await prisma.redTag.upsert({
    where: { tenantId_tagNumber: { tenantId: tenant1.id, tagNumber: 'RT-BLR-2026-0003' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      tagNumber: 'RT-BLR-2026-0003',
      locationId: loc3.id,
      targetHoldingAreaId: loc2.id,
      itemName: 'Decommissioned Hydraulic Tube Bending Clamp Fixtures',
      itemDescription: 'Cast iron manual clamp fixtures retired following robotic bending cell upgrade.',
      category: 'SCRAP_WASTE',
      quantity: 4,
      unitOfMeasure: 'SETS',
      estimatedValue: 1200.0,
      taggedById: areaOwner,
      taggedDate: new Date(now.getTime() - 35 * 86400000), // 35 Days Ago (Ageing Critical Alert)
      reason: 'Obsolete tooling with no future applicability.',
      photoUrl: '/assets/5s/cluttered_under_bench.jpg',
      status: 'DISPOSITION_APPROVED',
      dispositionAction: 'DISPOSE_SCRAP',
      dispositionJustification: 'Approved for authorized metal recycler pickup.',
      targetDispositionDate: new Date(now.getTime() + 1 * 86400000),
      supervisorApprovedById: coordinator,
    },
  });

  await prisma.redTag.upsert({
    where: { tenantId_tagNumber: { tenantId: tenant1.id, tagNumber: 'RT-BLR-2026-0004' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      tagNumber: 'RT-BLR-2026-0004',
      locationId: loc2.id,
      targetHoldingAreaId: loc3.id,
      itemName: 'Obsolete SMD 8mm Tape Reel Component Feeders (Batch of 8)',
      itemDescription: 'Legacy mechanical feeder cassettes incompatible with high-speed Yamaha SMT pick & place head.',
      category: 'UNNEEDED_TOOL',
      quantity: 8,
      unitOfMeasure: 'PCS',
      estimatedValue: 18500.0,
      taggedById: areaOwner,
      taggedDate: new Date(now.getTime() - 12 * 86400000), // 12 Days Ago
      reason: 'Replaced with electric intelligent feeders. Taking up prime rack space in feeder trolley bay.',
      photoUrl: '/assets/5s/shadow_board_clutter.jpg',
      status: 'IN_HOLDING_AREA',
      dispositionAction: 'AUCTION_SELL',
      dispositionJustification: 'Sell to secondary electronics refurbisher network.',
      targetDispositionDate: new Date(now.getTime() + 5 * 86400000),
    },
  });

  await prisma.redTag.upsert({
    where: { tenantId_tagNumber: { tenantId: tenant1.id, tagNumber: 'RT-BLR-2026-0005' } },
    update: {},
    create: {
      tenantId: tenant1.id,
      tagNumber: 'RT-BLR-2026-0005',
      locationId: loc1.id,
      targetHoldingAreaId: loc3.id,
      itemName: 'Cracked Carbide End-Mill Cutters & Dull Inserts Box',
      itemDescription: 'Collection of 45 worn solid carbide end mills with chipped flutes.',
      category: 'SCRAP_WASTE',
      quantity: 45,
      unitOfMeasure: 'PCS',
      estimatedValue: 9500.0,
      taggedById: leadAuditor,
      taggedDate: new Date(now.getTime() - 19 * 86400000), // 19 Days Ago
      reason: 'Accumulated in operator tool drawers instead of being sent to regrinding vendor.',
      photoUrl: '/assets/5s/oil_leak_defect.jpg',
      status: 'DISPOSED',
      dispositionAction: 'DISPOSE_SCRAP',
      dispositionJustification: 'Sold to specialized carbide scrap recycling partner.',
      actualDispositionDate: new Date(now.getTime() - 2 * 86400000),
      financialRecovered: 4200.0,
    },
  });

  console.log('✅ Phase 1, 2 & 3 Enterprise Seed Completed with 100% Success!');
}

main()
  .catch((e) => {
    console.error('❌ Seed Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
