import { randomUUID } from 'crypto';
import { PrismaService } from './prisma.service';

const HOLDER = `${process.pid}-${randomUUID().slice(0, 8)}`;

/**
 * Runs `work` only if this instance obtains the named lease. A lease row (rather than a Postgres
 * advisory lock) is used because pooled connections cannot guarantee that lock and unlock run on the
 * same session. A crashed holder's lease simply expires after `ttlMs`.
 */
export async function withJobLease<T>(prisma: PrismaService, name: string, ttlMs: number, work: () => Promise<T>): Promise<T | null> {
  const now = new Date();
  const until = new Date(now.getTime() + ttlMs);
  await prisma.jobLease.upsert({ where: { name }, create: { name, holder: '', leasedUntil: new Date(0) }, update: {} });
  const { count } = await prisma.jobLease.updateMany({
    where: { name, OR: [{ leasedUntil: { lt: now } }, { holder: HOLDER }] },
    data: { holder: HOLDER, leasedUntil: until },
  });
  if (count === 0) return null;
  try {
    return await work();
  } finally {
    await prisma.jobLease.updateMany({ where: { name, holder: HOLDER }, data: { leasedUntil: new Date(0) } });
  }
}
