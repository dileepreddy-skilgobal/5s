import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { SubmitQuizDto, TrackLessonProgressDto } from './dto/training.dto';
import * as crypto from 'crypto';

export interface QuizQuestion {
  id: string;
  category: '1S' | '2S' | '3S' | '4S' | '5S' | 'AUDIT' | 'CAPA' | 'SAFETY' | 'RED_TAG';
  question: string;
  scenario?: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  points: number;
}

export interface TrainingCourse {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: 'FOUNDATIONS' | 'AUDITING' | 'RCA_CAPA' | 'RED_TAG';
  durationMinutes: number;
  videoUrl: string;
  thumbnailUrl: string;
  badgeText: string;
  chapters: {
    time: string;
    title: string;
    description: string;
  }[];
  keyTakeaways: string[];
  jobAidTitle: string;
  jobAidUrl: string;
}

@Injectable()
export class TrainingService {
  constructor(private readonly prisma: PrismaService) {}

  // In-memory certificate cache for instant fast verification lookup
  private certificates = new Map<string, any>();

  private readonly courses: TrainingCourse[] = [
    {
      id: 'course-5s-foundations',
      title: '5S Foundations: From Workplace Disorder to Visual Excellence',
      subtitle: 'Sort, Set in Order, Shine, Standardize, and Sustain across manufacturing environments',
      description: 'Master the core 5 pillars of workplace organization with practical shop-floor examples. Learn how to identify clutter, create dedicated visual tool stations, establish autonomous cleaning rhythms, and sustain audit discipline across multiple shifts.',
      category: 'FOUNDATIONS',
      durationMinutes: 14,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      thumbnailUrl: '/assets/5s/cnc_workstation_clean.jpg',
      badgeText: 'Core Essential',
      chapters: [
        { time: '00:00', title: '1. Introduction & The True Cost of Clutter', description: 'Why 5S is the foundation of Operational Excellence (OpEx).' },
        { time: '02:45', title: '2. 1S (Sort): Red Tag Quarantine Criteria', description: 'Separating necessary from unnecessary tools, parts, and obsolete jigs.' },
        { time: '05:30', title: '3. 2S (Set in Order): 30-Second Rule & Shadow Boards', description: 'A place for everything, everything in its place with color boundaries.' },
        { time: '08:15', title: '4. 3S (Shine): Cleaning is Inspection', description: 'Detecting oil leaks, loose bolts, and hydraulic defects early.' },
        { time: '11:00', title: '5. 4S & 5S: Standardization, Kamishibai & Governance', description: 'Maintaining visual controls through standardized shift handovers.' },
      ],
      keyTakeaways: [
        '1S (Sort): If an item has not been used in the past 30 days, move it to the Red Tag holding area.',
        '2S (Set in Order): Any critical tooling bit or gauge must be locatable and returnable in under 30 seconds.',
        '3S (Shine): Autonomous maintenance means cleaning with purpose to spot defects before machine failure.',
        '4S (Standardize): Visual boundaries (hazard tape, shadow foam) make abnormalities instantly visible.',
        '5S (Sustain): Daily 5-minute Kamishibai routines build operational muscle memory.',
      ],
      jobAidTitle: '5S Shop-Floor Visual Standards & Color Code Pocket Guide (PDF)',
      jobAidUrl: '/assets/5s/5s_standards_guide.pdf',
    },
    {
      id: 'course-mobile-auditing',
      title: 'Certified Mobile 5S Auditor Execution & Photographic Evidence',
      subtitle: 'Conducting objective inspections, score weighting, and geotagged evidence capture',
      description: 'Learn how to use the Mobile Audit Runner on tablets and smartphones. Understand scoring criteria (0-4 scale), safety override caps, and how to take unambiguous before/after evidence photos that drive rapid shop-floor accountability.',
      category: 'AUDITING',
      durationMinutes: 11,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      thumbnailUrl: '/assets/5s/shadow_board_std.jpg',
      badgeText: 'Auditor Track',
      chapters: [
        { time: '00:00', title: '1. Audit Runner Initiation & QR Station Check-in', description: 'Scanning machine/cell QR code for timestamped physical presence verification.' },
        { time: '02:15', title: '2. Section-by-Section Scoring & Severity Weights', description: 'Applying objective 0 to 4 rubric ratings without personal bias.' },
        { time: '05:00', title: '3. Evidence Photography & Defect Annotation', description: 'Capturing clear photos with arrow/circle annotations to highlight issues.' },
        { time: '07:45', title: '4. Critical Safety Zero-Tolerance Triggers', description: 'How blocked fire exits or electrical hazards immediately trigger safety alerts.' },
        { time: '09:30', title: '5. Audit Submission & Automated Abnormality Dispatch', description: 'Auto-generating observations and assigning immediate area owner actions.' },
      ],
      keyTakeaways: [
        'Always scan the location QR code to verify physical presence on the factory floor.',
        'Photograph defects from a wide angle first, then a close-up annotated detail shot.',
        'Never assign a non-conformance without clear corrective notes and designated area ownership.',
        'Critical safety violations trigger instant plant manager alerts and automated CAPA generation.',
      ],
      jobAidTitle: 'Certified Auditor Scoring Rubric & Photographic Evidence Checklist (PDF)',
      jobAidUrl: '/assets/5s/auditor_scoring_rubric.pdf',
    },
    {
      id: 'course-rca-capa',
      title: 'Root Cause Analysis (5-Why) & Permanent Countermeasure Planning',
      subtitle: 'Eliminating repeat abnormalities through systemic process & poka-yoke fixes',
      description: 'Move beyond temporary band-aids. Master the Ishikawa 5-Why drill-down methodology to identify underlying machine, method, or material flaws, and construct robust permanent countermeasures with supervisor sign-off.',
      category: 'RCA_CAPA',
      durationMinutes: 12,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      thumbnailUrl: '/assets/5s/oil_leak_defect.jpg',
      badgeText: 'Quality & CAPA',
      chapters: [
        { time: '00:00', title: '1. The Problem with Superficial Fixes', description: 'Why cleaning oil without replacing the gasket guarantees repeat failure.' },
        { time: '03:10', title: '2. Ishikawa 6M Category Mapping', description: 'Classifying root causes across Method, Machine, Material, Manpower, Measurement, and Environment.' },
        { time: '06:00', title: '3. The 5-Why Iterative Drill-Down Technique', description: 'Asking "Why" five times to transition from symptom to systemic gap.' },
        { time: '08:45', title: '4. Formulating Permanent Countermeasures & SOP Revisions', description: 'Lockout/Tagout, upgraded seal specs, and Poka-Yoke fixture design.' },
        { time: '10:30', title: '5. Independent Verification Sign-Off', description: 'Two-person verification rule to permanently close high-severity CAPAs.' },
      ],
      keyTakeaways: [
        'A good 5-Why analysis always stops at a process or mechanical root cause, never "operator error".',
        'Every CAPA must include a permanent engineering fix and an updated Standard Operating Procedure (SOP).',
        'Closure requires dual-party verification: the area owner remedies the issue, and an independent auditor verifies.',
      ],
      jobAidTitle: '5-Why Root Cause Analysis & Countermeasure Template (PDF)',
      jobAidUrl: '/assets/5s/5why_capa_jobaid.pdf',
    },
    {
      id: 'course-red-tag-program',
      title: 'Red Tag Quarantine Program & Scrap Capital Recovery',
      subtitle: 'Digital tagging, holding area management, and financial scrap recovery workflow',
      description: 'Learn how to execute a high-impact Red Tag campaign. Track physical holding areas, establish 14-day disposition countdowns, recover working capital from surplus assets, and safely scrap obsolete tooling.',
      category: 'RED_TAG',
      durationMinutes: 9,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      thumbnailUrl: '/assets/5s/red_tag_holding_area.jpg',
      badgeText: 'Shop-Floor Action',
      chapters: [
        { time: '00:00', title: '1. What Qualifies for a Red Tag?', description: 'Unused tooling, damaged pallets, scrap surplus, and unlabelled chemicals.' },
        { time: '02:00', title: '2. Digital Tag Creation & QR Tag Attachment', description: 'Logging item description, estimated purchase value, and reason for tagging.' },
        { time: '04:15', title: '3. Red Tag Holding Area Quarantine Protocols', description: 'Physical quarantine boundaries, inventory logging, and aging clocks.' },
        { time: '06:30', title: '4. The 8 Disposition Pathways', description: 'Keep, Relocate, Repair, Reuse, Return to Vendor, Sell, Scrap, or Dispose.' },
        { time: '08:00', title: '5. Capital Recovery & Financial Dashboard Reporting', description: 'Demonstrating ROI and recovered floor space to executive leadership.' },
      ],
      keyTakeaways: [
        'Items in the Red Tag area must have a firm 14-day target disposition deadline.',
        'Tagging is not punishment; it is an active method to liberate valuable factory floor space.',
        'Track purchase value and scrap recovery to demonstrate tangible financial ROI from 5S.',
      ],
      jobAidTitle: 'Red Tag Decision Matrix & Quarantine Zone Standard Layout (PDF)',
      jobAidUrl: '/assets/5s/red_tag_matrix.pdf',
    },
  ];

  private readonly quizBank: QuizQuestion[] = [
    {
      id: 'q1',
      category: '1S',
      question: 'During a 1S (Sort) audit in a machining cell, an operator finds 12 rusted clamps that have not been used for over 60 days. What is the standard action?',
      options: [
        'Store them under the machine bench out of sight so the area looks clean.',
        'Attach a Red Tag, log the item into the digital system, and move them to the Red Tag Holding Area.',
        'Leave them on the machine table in case a rare legacy job arrives next month.',
        'Discard them immediately into the general scrap bin without logging.',
      ],
      correctIndex: 1,
      explanation: 'Under 1S (Sort) standards, all unused or redundant items must be digitally Red Tagged, logged with justification, and moved to physical quarantine for formal disposition.',
      points: 10,
    },
    {
      id: 'q2',
      category: '2S',
      question: 'What is the primary objective of 2S (Set in Order) with respect to shop-floor efficiency?',
      options: [
        'Painting the floor in decorative corporate colors.',
        'Ensuring any required tool, gauge, or part can be found, used, and returned in under 30 seconds.',
        'Hiding all hand tools inside locked metal cabinets so only supervisors have access.',
        'Buying new tools whenever an existing tool cannot be located immediately.',
      ],
      correctIndex: 1,
      explanation: 'The fundamental benchmark of 2S (Set in Order) is the 30-Second Rule: clear visual shadow boards, labels, and floor demarcation allow instant tool retrieval and return.',
      points: 10,
    },
    {
      id: 'q3',
      category: '3S',
      question: 'In World-Class 5S methodology, what does the phrase "Shine is Inspection" mean?',
      options: [
        'Wiping surfaces only right before a customer visit arrives.',
        'Cleaning with purpose to actively detect early defects like oil leaks, loose bolts, vibration, and thermal wear.',
        'Hiring an external janitorial crew to clean machines after the shift ends.',
        'Applying polish to make old machinery look brand new without checking mechanics.',
      ],
      correctIndex: 1,
      explanation: '3S (Shine) is autonomous maintenance: the act of hands-on cleaning allows operators to spot hydraulic leaks, loose fasteners, and abnormal wear before catastrophic breakdown.',
      points: 10,
    },
    {
      id: 'q4',
      category: '4S',
      question: 'Which of the following represents an effective 4S (Standardization) mechanism?',
      options: [
        'Telling operators verbally how they should clean their workstations.',
        'Posting standardized visual workplace controls, color-coded demarcation boundaries, and clear digital SOPs.',
        'Allowing each shift to arrange their tools according to personal preference.',
        'Writing a 100-page manual stored in an office bookshelf that operators cannot access.',
      ],
      correctIndex: 1,
      explanation: '4S (Standardize) creates visual management rules (color codes, shadow boards, photo standards, laminated SOPs) so any deviation is obvious to anyone in 5 seconds.',
      points: 10,
    },
    {
      id: 'q5',
      category: '5S',
      question: 'What is the purpose of daily 5-minute Kamishibai routines in 5S (Sustain)?',
      options: [
        'Disciplining operators who made mistakes on previous shifts.',
        'Building daily operational muscle memory through short, rotating, visual self-check routines at shift handover.',
        'Replacing annual ISO 9001 and IATF audits completely.',
        'Filling out complex paperwork for management review.',
      ],
      correctIndex: 1,
      explanation: '5S (Sustain) relies on micro-habits like Kamishibai visual boards to ensure workplace discipline is maintained every single shift without backsliding.',
      points: 10,
    },
    {
      id: 'q6',
      category: 'AUDIT',
      question: 'When an auditor identifies a blocked emergency fire extinguisher during a mobile audit, what action occurs?',
      options: [
        'Score the section 3 out of 4 and mention it in the monthly report.',
        'Immediately trigger a Critical Safety Zero-Tolerance alert, cap the section score, and assign an urgent CAPA.',
        'Ignore the fire extinguisher if the machining line is producing high-quality parts.',
        'Wait until the annual audit cycle to review the fire safety equipment.',
      ],
      correctIndex: 1,
      explanation: 'Blocked emergency equipment (fire extinguishers, eyewash stations, electrical panels) represents a critical safety hazard with automatic score capping and immediate escalation.',
      points: 10,
    },
    {
      id: 'q7',
      category: 'CAPA',
      question: 'In a 5-Why Root Cause Analysis for an oil leak, Why #5 reveals that the preventative maintenance schedule lacked a gasket replacement interval. What is the permanent solution?',
      options: [
        'Tell the operator to wipe the oil pan twice per shift.',
        'Revise the PM SOP to include mandatory high-temp Viton gasket replacement every 500 operating hours and train maintenance technicians.',
        'Place an absorbent sock around the machine base permanently.',
        'Turn down the hydraulic pump pressure so oil does not leak as fast.',
      ],
      correctIndex: 1,
      explanation: 'A permanent corrective countermeasure fixes the underlying systemic gap (updating the PM schedule, replacing standard with Viton material, and standardizing the SOP) rather than treating symptoms.',
      points: 10,
    },
    {
      id: 'q8',
      category: 'AUDIT',
      question: 'What is the required standard for closing out an assigned 5S CAPA in the system?',
      options: [
        'The assignee checks the "Done" box without evidence.',
        'The assignee uploads mandatory photographic "After" evidence and notes, followed by independent verification and sign-off by a designated supervisor/auditor.',
        'The action automatically closes after 7 days if nobody complains.',
        'The plant director signs off without viewing the physical workstation.',
      ],
      correctIndex: 1,
      explanation: 'BRD Section 33 & 34 requires dual-party verification: mandatory "After" photograph evidence and independent verification sign-off before a CAPA can be closed.',
      points: 10,
    },
    {
      id: 'q9',
      category: 'SAFETY',
      question: 'What standard color floor marking is universally required for physical aisles and pedestrian walkways?',
      options: [
        'Solid Red lines.',
        'High-visibility Yellow or White boundary lines with unobstructed clearance.',
        'No floor markings are required if operators know where to walk.',
        'Blue and Green decorative checkerboard patterns.',
      ],
      correctIndex: 1,
      explanation: 'OSHA / 5S Visual standards dictate solid yellow or white boundary lines for pedestrian paths and traffic lanes to ensure safe, unobstructed shop-floor movement.',
      points: 10,
    },
    {
      id: 'q10',
      category: 'RED_TAG',
      question: 'What is the maximum recommended aging limit for items placed in a Red Tag Holding Area before final disposition?',
      options: [
        '6 months to 1 year.',
        '14 to 30 days maximum, after which the item must be relocated, sold, repaired, or scrapped.',
        'Indefinitely until someone asks for the item.',
        '24 hours regardless of item value.',
      ],
      correctIndex: 1,
      explanation: 'BRD Section 38 specifies active aging tracking: Red Tag items must have target disposition decisions within 14-30 days to prevent holding areas from becoming permanent junk piles.',
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

  async getQuizQuestions(): Promise<Omit<QuizQuestion, 'correctIndex'>[]> {
    // Return questions without the correctIndex to prevent inspect cheating
    return this.quizBank.map(({ correctIndex, ...rest }) => rest);
  }

  async submitQuiz(dto: SubmitQuizDto, tenantId: string) {
    let totalScore = 0;
    const maxScore = this.quizBank.length * 10;
    const results: {
      questionId: string;
      question: string;
      selectedAnswer: number;
      correctAnswer: number;
      isCorrect: boolean;
      explanation: string;
    }[] = [];

    for (const q of this.quizBank) {
      const selected = dto.answers[q.id];
      const isCorrect = selected === q.correctIndex;
      if (isCorrect) {
        totalScore += q.points;
      }
      results.push({
        questionId: q.id,
        question: q.question,
        selectedAnswer: selected,
        correctAnswer: q.correctIndex,
        isCorrect,
        explanation: q.explanation,
      });
    }

    const percentage = Math.round((totalScore / maxScore) * 100);
    const passed = percentage >= 80;

    let certificate: any = null;
    if (passed) {
      const certId = `CERT-5S-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      certificate = {
        certificateId: certId,
        traineeName: dto.traineeName || 'Certified 5S Practitioner',
        traineeEmail: dto.traineeEmail || 'trainee@skilglobal.com',
        tenantId,
        scorePercent: percentage,
        issueDate: new Date().toISOString(),
        validUntil: new Date(Date.now() + 365 * 86400000).toISOString(),
        credentialTitle: 'Certified 5S Practitioner & Operational Discipline Auditor',
        verificationUrl: `http://localhost:5173/training?cert=${certId}`,
        authorizedSignatures: [
          { name: 'Sarah Jenkins', title: 'Lead 5S Program Champion' },
          { name: 'Rajesh Kumar', title: 'Plant Operations Director' },
        ],
      };
      this.certificates.set(certId, certificate);
    }

    return {
      passed,
      percentage,
      score: totalScore,
      maxScore,
      correctCount: results.filter((r) => r.isCorrect).length,
      totalQuestions: this.quizBank.length,
      results,
      certificate,
    };
  }

  async getCertificate(certId: string) {
    const cert = this.certificates.get(certId);
    if (!cert) {
      // Generate deterministic sample certificate if requested
      return {
        certificateId: certId,
        traineeName: 'Pooja Sharma',
        traineeEmail: 'admin@skilglobal.com',
        tenantId: 'skilglobal-mfg',
        scorePercent: 100,
        issueDate: new Date().toISOString(),
        validUntil: new Date(Date.now() + 365 * 86400000).toISOString(),
        credentialTitle: 'Certified 5S Practitioner & Operational Discipline Auditor',
        verificationUrl: `http://localhost:5173/training?cert=${certId}`,
        authorizedSignatures: [
          { name: 'Sneha Reddy', title: 'Lead 5S Program Champion' },
          { name: 'Rajesh Kumar', title: 'Plant Operations Director' },
        ],
      };
    }
    return cert;
  }
}
