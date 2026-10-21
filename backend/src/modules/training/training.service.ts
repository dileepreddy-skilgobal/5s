import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TrainingCertificate, TrainingProgress } from '@prisma/client';
import { TenantSettingsService } from '../../core/config/tenant-settings.service';
import { PrismaService } from '../../core/database/prisma.service';
import { SubmitQuizDto, UpdateLessonProgressDto } from './dto/training.dto';
import * as crypto from 'crypto';
import { getFrontendUrl } from '../../core/config/app-url';

type QuizCategory = '1S' | '2S' | '3S' | '4S' | '5S' | 'AUDIT' | 'CAPA' | 'SAFETY' | 'RED_TAG';

/** Question bank entry. The correct option is kept apart from the distractors so no position ever marks it. */
interface QuizBankQuestion {
  id: string;
  category: QuizCategory;
  question: string;
  answer: string;
  distractors: string[];
  explanation: string;
  points: number;
}

/** A question as served to a trainee: options in a fresh random order, no answer, no explanation. */
export interface QuizQuestion {
  id: string;
  category: QuizCategory;
  question: string;
  options: string[];
  points: number;
}

export interface TrainingLesson {
  id: string;
  title: string;
  summary: string;
  /** Start position (mm:ss) inside the course video; only set once the course has a real video. */
  videoStart?: string;
}

export interface TrainingCourse {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: 'FOUNDATIONS' | 'AUDITING' | 'RCA_CAPA' | 'RED_TAG';
  badgeText: string;
  /** Null until a real recorded lesson exists; the app then shows the lessons as reading material. */
  videoUrl: string | null;
  /** WebVTT captions for the video. */
  captionsUrl: string | null;
  lessons: TrainingLesson[];
  keyTakeaways: string[];
  /** Null until a real downloadable job aid exists. */
  jobAidTitle: string | null;
  jobAidUrl: string | null;
}

export interface CourseProgress {
  courseId: string;
  completedLessonIds: string[];
  totalLessons: number;
  percent: number;
  completed: boolean;
  completedAt: string | null;
}

@Injectable()
export class TrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: TenantSettingsService,
  ) {}

  private readonly courses: TrainingCourse[] = [
    {
      id: 'course-5s-foundations',
      title: '5S foundations: from workplace disorder to visual control',
      subtitle: 'Sort, Set in Order, Shine, Standardize and Sustain on the shop floor',
      description: 'The five pillars of workplace organization with practical shop-floor examples: identifying clutter, setting up tool stations, cleaning as inspection, and keeping the standard across shifts.',
      category: 'FOUNDATIONS',
      badgeText: 'Core',
      videoUrl: null,
      captionsUrl: null,
      lessons: [
        { id: 'foundations-intro', title: 'Introduction: the cost of clutter', summary: 'Why 5S is the foundation of every other improvement: clutter hides defects, wastes search time and creates safety hazards.' },
        { id: 'foundations-sort', title: '1S Sort: separating needed from unneeded', summary: 'Separate the tools, parts and jigs needed for current work from everything else, and red-tag what is not needed.' },
        { id: 'foundations-set', title: '2S Set in Order: a place for everything', summary: 'Shadow boards, labels and floor marking so any item can be found and returned quickly.' },
        { id: 'foundations-shine', title: '3S Shine: cleaning is inspection', summary: 'Cleaning by hand lets operators spot oil leaks, loose bolts and abnormal wear early.' },
        { id: 'foundations-standardize-sustain', title: '4S Standardize and 5S Sustain', summary: 'Visual standards make the right condition obvious; short, regular checks keep it from slipping back.' },
      ],
      keyTakeaways: [
        '1S (Sort): if an item has not been used in the past 30 days, move it to the red tag holding area.',
        '2S (Set in Order): any critical tool or gauge should be locatable and returnable in under 30 seconds.',
        '3S (Shine): cleaning with purpose reveals defects before they cause a breakdown.',
        '4S (Standardize): visual boundaries (floor tape, shadow foam) make abnormalities easy to see.',
        '5S (Sustain): short daily checks at shift handover build the habit.',
      ],
      jobAidTitle: null,
      jobAidUrl: null,
    },
    {
      id: 'course-mobile-auditing',
      title: 'Conducting a 5S audit and capturing evidence',
      subtitle: 'Objective inspections, consistent scoring and clear photo evidence',
      description: 'How to run an objective 5S inspection: scoring against the checklist without bias, treating safety items seriously, and taking before/after photos that make findings clear to the area owner.',
      category: 'AUDITING',
      badgeText: 'Auditor',
      videoUrl: null,
      captionsUrl: null,
      lessons: [
        { id: 'auditing-prepare', title: 'Preparing for the audit', summary: 'Confirm the location, the checklist and the area owner before you start; audit what you see on the floor, not what you are told.' },
        { id: 'auditing-scoring', title: 'Scoring section by section', summary: 'Apply the scoring scale consistently, question by question, and record the reason for every low score.' },
        { id: 'auditing-evidence', title: 'Photo evidence', summary: 'Take a wide shot for context and a close-up of the issue so anyone can see what needs fixing.' },
        { id: 'auditing-safety', title: 'Critical safety items', summary: 'Blocked fire exits, extinguishers or electrical panels are critical findings that need immediate attention, not a note for later.' },
        { id: 'auditing-submit', title: 'Submitting and following up', summary: 'Every non-conformance needs a clear description and an owner so it can be corrected and verified.' },
      ],
      keyTakeaways: [
        'Audit at the location itself and record what you observe.',
        'Photograph defects from a wide angle first, then take a close-up of the detail.',
        'Never record a non-conformance without a clear description and an area owner.',
        'Critical safety findings are escalated immediately.',
      ],
      jobAidTitle: null,
      jobAidUrl: null,
    },
    {
      id: 'course-rca-capa',
      title: 'Root cause analysis (5 Whys) and permanent corrective actions',
      subtitle: 'Stopping repeat problems with process fixes instead of quick clean-ups',
      description: 'Go beyond temporary fixes: use the 5 Whys and the Ishikawa (fishbone) categories to find the machine, method or material cause, and plan a permanent corrective action that is verified before closure.',
      category: 'RCA_CAPA',
      badgeText: 'Quality',
      videoUrl: null,
      captionsUrl: null,
      lessons: [
        { id: 'rca-superficial', title: 'The problem with superficial fixes', summary: 'Wiping up oil without replacing the gasket guarantees the leak comes back.' },
        { id: 'rca-ishikawa', title: 'Fishbone (Ishikawa) categories', summary: 'Group possible causes under method, machine, material, people, measurement and environment.' },
        { id: 'rca-five-whys', title: 'The 5 Whys', summary: 'Keep asking "why" until you move from the symptom to the gap in the process.' },
        { id: 'rca-countermeasures', title: 'Permanent countermeasures', summary: 'Fix the process: update maintenance intervals, materials, fixtures (poka-yoke) and the work instruction.' },
        { id: 'rca-verification', title: 'Verification before closure', summary: 'Someone other than the person who did the fix checks that it works before the action is closed.' },
      ],
      keyTakeaways: [
        'A good 5 Whys analysis ends at a process or equipment cause, never at "operator error".',
        'A permanent corrective action changes the process and, where needed, the standard work instruction.',
        'Closure needs independent verification: the owner fixes the issue and someone else verifies it.',
      ],
      jobAidTitle: null,
      jobAidUrl: null,
    },
    {
      id: 'course-red-tag-program',
      title: 'Running a red tag program',
      subtitle: 'Tagging unneeded items, managing the holding area and deciding what happens to them',
      description: 'How to run a red tag campaign: what to tag, how to manage the holding area, setting a disposition deadline, and recovering value from surplus items.',
      category: 'RED_TAG',
      badgeText: 'Sort',
      videoUrl: null,
      captionsUrl: null,
      lessons: [
        { id: 'redtag-qualify', title: 'What qualifies for a red tag?', summary: 'Unused tools, damaged pallets, surplus stock and unlabelled containers.' },
        { id: 'redtag-create', title: 'Creating the tag', summary: 'Record what the item is, why it was tagged, the quantity and, where known, its value.' },
        { id: 'redtag-holding', title: 'The holding area', summary: 'Keep tagged items in a marked area with a log, so nothing disappears and nothing stays forever.' },
        { id: 'redtag-disposition', title: 'Deciding what happens to the item', summary: 'Typical outcomes: keep with a justification, relocate, repair, reuse, return to the vendor, sell or scrap.' },
        { id: 'redtag-value', title: 'Showing the benefit', summary: 'Track floor space freed and value recovered to show what the program delivers.' },
      ],
      keyTakeaways: [
        'Items in the holding area need a firm disposition deadline.',
        'Tagging is not a punishment; it frees up workspace.',
        'Tracking value and space recovered shows the benefit of 5S.',
      ],
      jobAidTitle: null,
      jobAidUrl: null,
    },
  ];

  private readonly quizBank: QuizBankQuestion[] = [
    {
      id: 'q1',
      category: '1S',
      question: 'During a 1S (Sort) audit in a machining cell, an operator finds 12 rusted clamps that have not been used for over 60 days. What is the standard action?',
      answer: 'Attach a red tag, log the item and move the clamps to the red tag holding area.',
      distractors: [
        'Store them under the machine bench out of sight so the area looks clean.',
        'Leave them on the machine table in case a rare job arrives next month.',
        'Throw them into the general scrap bin straight away without logging them.',
      ],
      explanation: 'Under 1S (Sort), unneeded items are red-tagged, logged with a reason and moved to the holding area so a deliberate disposition decision can be made.',
      points: 10,
    },
    {
      id: 'q2',
      category: '2S',
      question: 'What is the main objective of 2S (Set in Order) for shop-floor efficiency?',
      answer: 'Any required tool, gauge or part can be found, used and returned in under 30 seconds.',
      distractors: [
        'Painting the floor in corporate colours.',
        'Locking all hand tools in cabinets so only supervisors have access.',
        'Buying new tools whenever an existing tool cannot be found immediately.',
      ],
      explanation: 'The usual benchmark for 2S is the 30-second rule: shadow boards, labels and floor marking let anyone retrieve and return an item quickly.',
      points: 10,
    },
    {
      id: 'q3',
      category: '3S',
      question: 'What does the phrase "Shine is inspection" mean?',
      answer: 'Cleaning with purpose to detect early defects such as oil leaks, loose bolts, vibration and wear.',
      distractors: [
        'Wiping surfaces just before a customer visit.',
        'Hiring an external cleaning crew to clean machines after the shift.',
        'Polishing old machinery so it looks new, without checking how it runs.',
      ],
      explanation: 'In 3S (Shine), hands-on cleaning lets operators spot hydraulic leaks, loose fasteners and abnormal wear before a breakdown.',
      points: 10,
    },
    {
      id: 'q4',
      category: '4S',
      question: 'Which of these is an effective 4S (Standardize) mechanism?',
      answer: 'Visual workplace controls: colour-coded boundaries, labels and clear standard work instructions at the point of use.',
      distractors: [
        'Telling operators verbally how they should clean their workstations.',
        'Letting each shift arrange tools according to personal preference.',
        'A 100-page manual kept on an office bookshelf that operators cannot reach.',
      ],
      explanation: '4S (Standardize) creates visual rules (colour codes, shadow boards, photo standards) so any deviation is obvious to anyone within seconds.',
      points: 10,
    },
    {
      id: 'q5',
      category: '5S',
      question: 'What is the purpose of a short daily check routine (for example a Kamishibai board) in 5S (Sustain)?',
      answer: 'Building the habit through short, rotating visual self-checks at shift handover.',
      distractors: [
        'Disciplining operators who made mistakes on previous shifts.',
        'Replacing external quality-system audits completely.',
        'Producing paperwork for management review.',
      ],
      explanation: '5S (Sustain) relies on small, regular habits such as visual check boards so the standard is kept every shift.',
      points: 10,
    },
    {
      id: 'q6',
      category: 'AUDIT',
      question: 'During an audit you find an emergency fire extinguisher blocked by pallets. What should happen?',
      answer: 'Record it as a critical safety finding, escalate it immediately and assign an urgent corrective action.',
      distractors: [
        'Score the section 3 out of 4 and mention it in the monthly report.',
        'Ignore it if the line is producing good parts.',
        'Wait until the annual audit to review fire safety equipment.',
      ],
      explanation: 'Blocked emergency equipment (fire extinguishers, eyewash stations, electrical panels) is a critical safety hazard that is escalated straight away, not left for a later report.',
      points: 10,
    },
    {
      id: 'q7',
      category: 'CAPA',
      question: 'In a 5 Whys analysis of an oil leak, the fifth "why" shows that the preventive maintenance schedule has no gasket replacement interval. What is the permanent solution?',
      answer: 'Revise the preventive maintenance procedure to include a gasket replacement interval and train the maintenance technicians.',
      distractors: [
        'Tell the operator to wipe the oil pan twice per shift.',
        'Place an absorbent sock around the machine base permanently.',
        'Turn down the hydraulic pressure so the oil leaks more slowly.',
      ],
      explanation: 'A permanent corrective action closes the gap in the process (here, the maintenance schedule) instead of treating the symptom.',
      points: 10,
    },
    {
      id: 'q8',
      category: 'AUDIT',
      question: 'What is good practice for closing a 5S corrective action?',
      answer: 'The assignee records "after" photo evidence and notes, and someone independent verifies the fix before closure.',
      distractors: [
        'The assignee ticks a "Done" box without evidence.',
        'The action closes automatically after 7 days if nobody complains.',
        'A manager signs it off without looking at the workstation.',
      ],
      explanation: 'Closing on evidence plus independent verification confirms the problem was actually fixed, not just reported as fixed.',
      points: 10,
    },
    {
      id: 'q9',
      category: 'SAFETY',
      question: 'Which floor marking is commonly used for aisles and pedestrian walkways?',
      answer: 'Solid yellow or white boundary lines with the walkway kept clear.',
      distractors: [
        'Solid red lines.',
        'No markings, as long as operators know where to walk.',
        'Blue and green checkerboard patterns.',
      ],
      explanation: 'Common visual-workplace practice is solid yellow (or white) lines for walkways and traffic lanes. Follow your site and local regulations where they differ.',
      points: 10,
    },
    {
      id: 'q10',
      category: 'RED_TAG',
      question: 'What is a typical maximum time for items to stay in a red tag holding area before a decision is made?',
      answer: '14 to 30 days, after which the item is relocated, sold, repaired or scrapped.',
      distractors: [
        '6 months to 1 year.',
        'Indefinitely, until someone asks for the item.',
        '24 hours, regardless of the item.',
      ],
      explanation: 'A short, firm deadline (typically 14 to 30 days) stops the holding area from turning into a permanent storage pile.',
      points: 10,
    },
  ];

  async getCourses(): Promise<TrainingCourse[]> {
    return this.courses;
  }

  async getCourseById(id: string): Promise<TrainingCourse> {
    const course = this.courses.find((c) => c.id === id);
    if (!course) {
      throw new NotFoundException(`Training course '${id}' not found`);
    }
    return course;
  }

  /** Questions with their options in a new random order on every call; answers and explanations stay on the server. */
  async getQuizQuestions(): Promise<QuizQuestion[]> {
    return this.quizBank.map((q) => ({
      id: q.id,
      category: q.category,
      question: q.question,
      options: shuffle([q.answer, ...q.distractors]),
      points: q.points,
    }));
  }

  async submitQuiz(dto: SubmitQuizDto, tenantId: string, userId: string) {
    // The certificate is issued to the authenticated user, never to a name supplied by the client
    const trainee = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const answers = dto.answers ?? {};
    let totalScore = 0;
    const maxScore = this.quizBank.reduce((sum, q) => sum + q.points, 0);
    const results: {
      questionId: string;
      question: string;
      /** Text of the option the trainee chose; null when unanswered. */
      selectedAnswer: string | null;
      correctAnswer: string;
      isCorrect: boolean;
      explanation: string;
    }[] = [];

    for (const q of this.quizBank) {
      const raw = answers[q.id];
      const selected = typeof raw === 'string' && raw.trim() !== '' ? raw : null;
      const isCorrect = selected !== null && normalizeOption(selected) === normalizeOption(q.answer);
      if (isCorrect) totalScore += q.points;
      results.push({
        questionId: q.id,
        question: q.question,
        selectedAnswer: selected,
        correctAnswer: q.answer,
        isCorrect,
        explanation: q.explanation,
      });
    }

    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const { competency } = await this.settingsService.get(tenantId);
    const passed = percentage >= competency.quizPassPercent;

    let certificate: ReturnType<TrainingService['toCertificateView']> | null = null;
    let certificateRenewed = false;
    if (passed && trainee) {
      const now = new Date();
      const validUntil = new Date(now);
      validUntil.setMonth(validUntil.getMonth() + competency.certificateValidityMonths);
      const traineeName = `${trainee.firstName} ${trainee.lastName}`.trim();

      // A passing retake renews the current valid certificate (same code) instead of issuing a duplicate
      const { record, renewed } = await this.prisma.$transaction(async (tx) => {
        const current = await tx.trainingCertificate.findFirst({
          where: { tenantId, userId, revokedAt: null, validUntil: { gt: now } },
          orderBy: { validUntil: 'desc' },
        });
        if (current) {
          const updated = await tx.trainingCertificate.update({
            where: { id: current.id },
            data: {
              validUntil: validUntil > current.validUntil ? validUntil : current.validUntil,
              scorePercent: percentage,
              traineeName,
              traineeEmail: trainee.email,
              credentialTitle: competency.certificateTitle,
            },
          });
          return { record: updated, renewed: true };
        }
        const created = await tx.trainingCertificate.create({
          data: {
            tenantId,
            userId,
            certificateCode: `CERT-5S-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
            traineeName,
            traineeEmail: trainee.email,
            credentialTitle: competency.certificateTitle,
            scorePercent: percentage,
            validUntil,
          },
        });
        return { record: created, renewed: false };
      });
      certificateRenewed = renewed;
      certificate = this.toCertificateView(record, competency.signatories);
    }

    return {
      passed,
      percentage,
      score: totalScore,
      maxScore,
      passPercent: competency.quizPassPercent,
      correctCount: results.filter((r) => r.isCorrect).length,
      totalQuestions: this.quizBank.length,
      results,
      certificate,
      /** True when an existing valid certificate was extended rather than a new one issued. */
      certificateRenewed,
    };
  }

  /** The signed-in user's progress for every course (courses not started show no completed lessons). */
  async getProgress(tenantId: string, userId: string): Promise<CourseProgress[]> {
    const rows = await this.prisma.trainingProgress.findMany({ where: { tenantId, userId } });
    const byCourse = new Map(rows.map((r) => [r.courseId, r]));
    return this.courses.map((c) => this.toProgressView(c, byCourse.get(c.id)));
  }

  /** Marks one lesson done or not done; the course is complete once every lesson is done. */
  async updateProgress(tenantId: string, userId: string, dto: UpdateLessonProgressDto): Promise<CourseProgress> {
    const course = this.courses.find((c) => c.id === dto.courseId);
    if (!course) throw new NotFoundException(`Training course '${dto.courseId}' not found`);
    if (!course.lessons.some((l) => l.id === dto.lessonId)) {
      throw new BadRequestException(`Lesson '${dto.lessonId}' is not part of course '${dto.courseId}'`);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.trainingProgress.findUnique({ where: { userId_courseId: { userId, courseId: course.id } } });
      const done = new Set(parseLessonIds(existing?.completedLessonIds));
      if (dto.completed) done.add(dto.lessonId);
      else done.delete(dto.lessonId);
      // Keep course order and drop ids of lessons that no longer exist
      const completedLessonIds = course.lessons.map((l) => l.id).filter((id) => done.has(id));
      const allDone = completedLessonIds.length === course.lessons.length;
      const completedAt = allDone ? (existing?.completedAt ?? new Date()) : null;
      const data = { completedLessonIds: JSON.stringify(completedLessonIds), completedAt };
      return existing
        ? tx.trainingProgress.update({ where: { id: existing.id }, data })
        : tx.trainingProgress.create({ data: { tenantId, userId, courseId: course.id, ...data } });
    });
    return this.toProgressView(course, row);
  }

  private toProgressView(course: TrainingCourse, row?: TrainingProgress): CourseProgress {
    const done = new Set(parseLessonIds(row?.completedLessonIds));
    const completedLessonIds = course.lessons.map((l) => l.id).filter((id) => done.has(id));
    const totalLessons = course.lessons.length;
    const completed = totalLessons > 0 && completedLessonIds.length === totalLessons;
    return {
      courseId: course.id,
      completedLessonIds,
      totalLessons,
      percent: totalLessons > 0 ? Math.round((completedLessonIds.length / totalLessons) * 100) : 0,
      completed,
      completedAt: completed && row?.completedAt ? row.completedAt.toISOString() : null,
    };
  }

  /** API shape of a certificate; signatories come from the tenant's competency settings. */
  private toCertificateView(c: TrainingCertificate, signatories: Array<{ name: string; title: string }>) {
    return {
      certificateId: c.certificateCode,
      userId: c.userId,
      traineeName: c.traineeName,
      traineeEmail: c.traineeEmail,
      tenantId: c.tenantId,
      scorePercent: c.scorePercent,
      issueDate: c.issuedAt.toISOString(),
      validUntil: c.validUntil.toISOString(),
      credentialTitle: c.credentialTitle,
      status: c.revokedAt ? 'REVOKED' : c.validUntil < new Date() ? 'EXPIRED' : 'VALID',
      revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
      verificationUrl: `${getFrontendUrl()}/training?cert=${c.certificateCode}`,
      authorizedSignatures: signatories,
    };
  }

  async getCertificate(tenantId: string, certId: string) {
    const cert = await this.prisma.trainingCertificate.findFirst({ where: { tenantId, certificateCode: certId } });
    if (!cert) {
      throw new NotFoundException(`Certificate '${certId}' not found`);
    }
    const { competency } = await this.settingsService.get(tenantId);
    return this.toCertificateView(cert, competency.signatories);
  }

  /** Certificates of one user, newest first. */
  async listCertificates(tenantId: string, userId?: string) {
    const [certs, { competency }] = await Promise.all([
      this.prisma.trainingCertificate.findMany({ where: { tenantId, ...(userId ? { userId } : {}) }, orderBy: { issuedAt: 'desc' } }),
      this.settingsService.get(tenantId),
    ]);
    return certs.map((c) => this.toCertificateView(c, competency.signatories));
  }

  async revokeCertificate(tenantId: string, certId: string, revokedById: string) {
    const cert = await this.prisma.trainingCertificate.findFirst({ where: { tenantId, certificateCode: certId } });
    if (!cert) throw new NotFoundException(`Certificate '${certId}' not found`);
    if (cert.revokedAt) throw new ConflictException(`Certificate ${certId} is already revoked`);
    await this.prisma.trainingCertificate.update({ where: { id: cert.id }, data: { revokedAt: new Date(), revokedById } });
    return this.getCertificate(tenantId, certId);
  }
}

/** Fisher-Yates shuffle with a cryptographic RNG, so the correct option's position cannot be predicted. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const normalizeOption = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase();

function parseLessonIds(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}
