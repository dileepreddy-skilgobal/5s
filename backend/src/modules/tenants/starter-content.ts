import { Prisma } from '@prisma/client';

/**
 * Optional starter content for a new organization (onboarding wizard, BRD §13 steps 7 and 11): a 6S audit
 * checklist and a few workplace standards. Everything is ordinary tenant data that the organization edits,
 * versions or deletes like anything it created itself; nothing here is referenced by the platform afterwards.
 */

type Tx = Prisma.TransactionClient;

interface StarterQuestion {
  code: string;
  text: string;
  guidance: string;
  questionType: 'PASS_FAIL' | 'YES_NO' | 'NUMERIC_0_5';
  severity: 'MINOR' | 'MODERATE' | 'MAJOR' | 'CRITICAL';
  weightage: number;
  /** Photo evidence is required when the question is not fully met. */
  evidence?: boolean;
  critical?: { scoreCapOnFail: number };
}

interface StarterSection {
  title: string;
  category: 'S1_SORT' | 'S2_SET_IN_ORDER' | 'S3_SHINE' | 'S4_STANDARDIZE' | 'S5_SUSTAIN' | 'S6_SAFETY';
  description: string;
  questions: StarterQuestion[];
}

export const STARTER_TEMPLATE_CODE = 'TPL-6S-STARTER';

const STARTER_SECTIONS: StarterSection[] = [
  {
    title: '1S - Sort',
    category: 'S1_SORT',
    description: 'Only what is needed for the current work is kept in the area.',
    questions: [
      {
        code: 'Q-S1-01',
        text: 'Are unneeded tools, materials, scrap and personal items removed from the work area?',
        guidance: 'Check benches, under machines, cabinets and corners. Anything not used in the current shift is unneeded.',
        questionType: 'NUMERIC_0_5',
        severity: 'MODERATE',
        weightage: 1,
        evidence: true,
      },
      {
        code: 'Q-S1-02',
        text: 'Are unneeded items that could not be removed red-tagged with date, reason and owner?',
        guidance: 'Every doubtful item carries a red tag; tagged items older than the disposition date are a finding.',
        questionType: 'PASS_FAIL',
        severity: 'MINOR',
        weightage: 1,
      },
    ],
  },
  {
    title: '2S - Set in order',
    category: 'S2_SET_IN_ORDER',
    description: 'A place for everything, and everything in its place.',
    questions: [
      {
        code: 'Q-S2-01',
        text: 'Do tools, fixtures and materials have marked home positions, and are they in them?',
        guidance: 'Look for shadow boards, labels or floor markings, and for items left away from their position.',
        questionType: 'NUMERIC_0_5',
        severity: 'MODERATE',
        weightage: 1,
        evidence: true,
      },
      {
        code: 'Q-S2-02',
        text: 'Are aisles, walkways and storage boundaries clearly marked and kept free?',
        guidance: 'Floor lines must be continuous and visible; nothing may stand across a walkway line.',
        questionType: 'PASS_FAIL',
        severity: 'MAJOR',
        weightage: 1.5,
        evidence: true,
      },
    ],
  },
  {
    title: '3S - Shine',
    category: 'S3_SHINE',
    description: 'The area and equipment are clean, and cleaning is used to inspect.',
    questions: [
      {
        code: 'Q-S3-01',
        text: 'Are floors, machines and work surfaces free of dirt, oil, chips and spills?',
        guidance: 'Pay attention to machine bases, drip trays and under conveyors.',
        questionType: 'NUMERIC_0_5',
        severity: 'MODERATE',
        weightage: 1,
        evidence: true,
      },
      {
        code: 'Q-S3-02',
        text: 'Is the area cleaning checklist displayed and filled in for the current period?',
        guidance: 'Compare the checklist sign-offs with the shifts worked since the last audit.',
        questionType: 'YES_NO',
        severity: 'MINOR',
        weightage: 1,
      },
    ],
  },
  {
    title: '4S - Standardize',
    category: 'S4_STANDARDIZE',
    description: 'Good conditions are defined in visual standards that everyone can follow.',
    questions: [
      {
        code: 'Q-S4-01',
        text: 'Is the visual standard for the area displayed, current and matched by the actual condition?',
        guidance: 'Compare the area with the standard photo; note any difference as a finding.',
        questionType: 'NUMERIC_0_5',
        severity: 'MODERATE',
        weightage: 1,
        evidence: true,
      },
      {
        code: 'Q-S4-02',
        text: 'Are labels, colour codes and signs consistent with the site standard?',
        guidance: 'Check container labels, pipe and cabinet colours, and sign formats.',
        questionType: 'PASS_FAIL',
        severity: 'MINOR',
        weightage: 1,
      },
    ],
  },
  {
    title: '5S - Sustain',
    category: 'S5_SUSTAIN',
    description: 'The standards are kept up through routine, ownership and follow-up.',
    questions: [
      {
        code: 'Q-S5-01',
        text: 'Were the corrective actions from the previous audit of this area closed on time?',
        guidance: 'Review the open and overdue corrective actions for the area before the walk.',
        questionType: 'YES_NO',
        severity: 'MODERATE',
        weightage: 1,
      },
      {
        code: 'Q-S5-02',
        text: 'Can the people working in the area explain their 5S responsibilities and the area standard?',
        guidance: 'Ask two people at random; both should know the standard and their daily checks.',
        questionType: 'NUMERIC_0_5',
        severity: 'MINOR',
        weightage: 1,
      },
    ],
  },
  {
    title: '6S - Safety',
    category: 'S6_SAFETY',
    description: 'Safety equipment and emergency routes are always accessible.',
    questions: [
      {
        code: 'Q-S6-01',
        text: 'Are fire extinguishers, emergency exits, eyewash stations and electrical panels completely unobstructed?',
        guidance: 'Keep at least 1 metre clear in front of each. A failure caps the audit score.',
        questionType: 'PASS_FAIL',
        severity: 'CRITICAL',
        weightage: 2,
        evidence: true,
        critical: { scoreCapOnFail: 70 },
      },
      {
        code: 'Q-S6-02',
        text: 'Are required safety signs, guards and PPE in place and in good condition?',
        guidance: 'Check machine guards, PPE stations and mandatory signs at the area entrance.',
        questionType: 'PASS_FAIL',
        severity: 'MAJOR',
        weightage: 1.5,
        evidence: true,
      },
    ],
  },
];

interface StarterStandard {
  code: string;
  title: string;
  category: StarterSection['category'];
  description: string;
  rules: string[];
}

const STARTER_STANDARDS: StarterStandard[] = [
  {
    code: 'STD-STARTER-WALKWAY',
    title: 'Walkway and floor marking',
    category: 'S2_SET_IN_ORDER',
    description: 'How walkways, storage areas and work zones are marked on the floor.',
    rules: [
      'Walkways are marked with continuous yellow lines, 75–100 mm wide.',
      'Storage areas are marked with white lines; hazard zones with yellow and black stripes.',
      'Nothing is placed on or across a walkway line, even temporarily.',
      'Damaged or faded markings are reported and repainted within 7 days.',
    ],
  },
  {
    code: 'STD-STARTER-CLEANING',
    title: 'Daily cleaning and inspection',
    category: 'S3_SHINE',
    description: 'Minimum daily cleaning for every production area, done by the people who work there.',
    rules: [
      'Floors, benches and machine surfaces are cleaned at the end of every shift.',
      'Leaks, loose parts and damage found while cleaning are reported as observations.',
      'The cleaning checklist is signed by the shift operator and checked weekly by the area owner.',
    ],
  },
  {
    code: 'STD-STARTER-EMERGENCY',
    title: 'Emergency equipment access',
    category: 'S6_SAFETY',
    description: 'Clearance around fire, first-aid and electrical safety equipment.',
    rules: [
      'Keep at least 1 metre clear in front of fire extinguishers, hydrants, eyewash stations and electrical panels.',
      'The clear zone is marked on the floor with red and white or yellow and black stripes.',
      'Emergency exits and the routes to them are never blocked or locked from the inside.',
    ],
  },
];

/** Creates the starter 6S checklist as a published version 1.0. Returns the template id, or null when it already exists. */
export async function createStarterTemplate(tx: Tx, tenantId: string): Promise<string | null> {
  const existing = await tx.auditTemplate.findFirst({ where: { tenantId, code: STARTER_TEMPLATE_CODE }, select: { id: true } });
  if (existing) return null;
  const template = await tx.auditTemplate.create({
    data: {
      tenantId,
      code: STARTER_TEMPLATE_CODE,
      name: '6S workplace audit (starter)',
      description: 'Starter checklist covering Sort, Set in order, Shine, Standardize, Sustain and Safety. Adapt the questions to your site and publish a new version.',
      auditType: 'ROUTINE',
      categoryScoringModel: JSON.stringify({ S1: 20, S2: 20, S3: 20, S4: 20, S5: 20, S6: 20 }),
      status: 'ACTIVE',
    },
  });
  const version = await tx.auditTemplateVersion.create({
    data: { tenantId, templateId: template.id, versionNumber: '1.0', changeSummary: 'Starter checklist created during onboarding', isPublished: true, publishedAt: new Date() },
  });
  for (const [sectionIndex, section] of STARTER_SECTIONS.entries()) {
    const created = await tx.auditTemplateSection.create({
      data: { tenantId, templateVersionId: version.id, title: section.title, description: section.description, category: section.category, sortOrder: sectionIndex + 1 },
    });
    await tx.auditTemplateQuestion.createMany({
      data: section.questions.map((q, questionIndex) => ({
        tenantId,
        sectionId: created.id,
        questionCode: q.code,
        questionText: q.text,
        guidance: q.guidance,
        questionType: q.questionType,
        severity: q.severity,
        weightage: q.weightage,
        isCritical: !!q.critical,
        scoreCapOnFail: q.critical?.scoreCapOnFail ?? null,
        mandatoryEvidence: !!q.evidence,
        sortOrder: questionIndex + 1,
      })),
    });
  }
  return template.id;
}

/**
 * Creates the starter standards as drafts (revision 1.0, not approved): the organization's approvers review them
 * and add their own reference photos before they become the official standard.
 */
export async function createStarterStandards(tx: Tx, tenantId: string, authorId: string | null): Promise<number> {
  let created = 0;
  for (const s of STARTER_STANDARDS) {
    const exists = await tx.standard.findFirst({ where: { tenantId, code: s.code }, select: { id: true } });
    if (exists) continue;
    const standard = await tx.standard.create({
      data: { tenantId, code: s.code, title: s.title, category: s.category, scopeType: 'GLOBAL', status: 'DRAFT' },
    });
    await tx.standardRevision.create({
      data: {
        tenantId,
        standardId: standard.id,
        revisionNumber: '1.0',
        description: s.description,
        rules: JSON.stringify(s.rules),
        referencePhotos: '[]',
        authorId,
        isCurrent: true,
        revisionComments: 'Starter standard created during onboarding. Adapt it to your site and add reference photos before approval.',
      },
    });
    created++;
  }
  return created;
}
