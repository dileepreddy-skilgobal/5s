import { Prisma } from '@prisma/client';
import { readAnalyticsSettings } from '../../core/config/tenant-settings';

/** Words ignored when comparing observation titles. */
const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'is', 'are', 'not', 'no', 'audit', 'finding']);
const SIMILARITY_THRESHOLD = 0.6;

const tokens = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
  );

/** Jaccard similarity of significant words. */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  ta.forEach((t) => {
    if (tb.has(t)) shared++;
  });
  return shared / (ta.size + tb.size - shared);
}

type Db = Prisma.TransactionClient;

/**
 * BRD §49 repeat observations: an observation repeats an earlier one when it is raised at the
 * same area, in the same 5S category, within the tenant's look-back window, and either concerns
 * the same audit question or has a substantially similar description.
 * Returns the id of the earliest matching observation, or null.
 */
export async function findRepeatOf(
  db: Db,
  input: { tenantId: string; locationId: string; category: string; title: string; questionId?: string | null; excludeId?: string },
): Promise<string | null> {
  const tenant = await db.tenant.findUnique({ where: { id: input.tenantId }, select: { settings: true } });
  const { repeatLookbackDays } = readAnalyticsSettings(tenant?.settings);
  const since = new Date(Date.now() - repeatLookbackDays * 86400000);

  const candidates = await db.observation.findMany({
    where: {
      tenantId: input.tenantId,
      locationId: input.locationId,
      category: input.category,
      createdAt: { gte: since },
      ...(input.excludeId ? { NOT: { id: input.excludeId } } : {}),
    },
    select: { id: true, title: true, answerId: true, repeatOfId: true },
    orderBy: { createdAt: 'asc' },
  });
  if (candidates.length === 0) return null;

  let questionByAnswer = new Map<string, string>();
  if (input.questionId) {
    const answerIds = candidates.map((c) => c.answerId).filter((id): id is string => !!id);
    if (answerIds.length) {
      const answers = await db.auditAnswer.findMany({ where: { id: { in: answerIds } }, select: { id: true, questionId: true } });
      questionByAnswer = new Map(answers.map((a) => [a.id, a.questionId]));
    }
  }

  const match = candidates.find(
    (c) =>
      (input.questionId && c.answerId && questionByAnswer.get(c.answerId) === input.questionId) ||
      titleSimilarity(c.title, input.title) >= SIMILARITY_THRESHOLD,
  );
  // Point at the original occurrence so a chain of repeats groups under one root
  return match ? match.repeatOfId ?? match.id : null;
}
