// Usage: node gamification-e2e.mjs [phase2]
//   phase 1 creates awards/kudos; phase2 (run after a server restart) checks they persisted, then cleans up.
import { execSync } from 'node:child_process';
const B = `${process.env.E2E_BASE_URL ?? 'http://localhost:3901'}/api/v1`;
const PHASE2 = process.argv[2] === 'phase2';
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  -> ' + extra : ''}`); };
const req = async (method, path, { token, body } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, data: json?.data ?? json, json };
};
const msg = (r) => `${r.status} ${JSON.stringify(r.json?.message ?? '')}`;
const login = async (email) => (await req('POST', '/auth/login', { body: { email, password: 'Admin@123456' } })).data.accessToken;
const COORD = await login('coordinator.5s@skilglobal.com');
const OWNER = await login('owner.cnc01@skilglobal.com');
const AUDITOR = await login('auditor.lead@skilglobal.com');
const me = async (t) => (await req('GET', '/auth/me', { token: t })).data.user;
const coordUser = await me(COORD);
const ownerUser = await me(OWNER);
const auditorUser = await me(AUDITOR);
const id = (u) => u.id ?? u.userId;
const MARK = 'ISO-GAMIFICATION';
const locs = (await req('GET', '/locations', { token: COORD })).data;
const locList = (Array.isArray(locs) ? locs : locs.items).filter((l) => l.status === 'ACTIVE');

if (!PHASE2) {
  // ---------- Read views: no fabricated content ----------
  let r = await req('GET', '/analytics/gamification/overview', { token: OWNER });
  check('overview 200 for any signed-in user', r.status === 200, msg(r));
  check('no hardcoded 3450 XP', r.data.userStats.currentPoints !== 3450, r.data.userStats.currentPoints);
  check('no fake active challenge', r.data.activeChallenge === undefined);
  check('points equal sum of breakdown', r.data.userStats.pointsBreakdown.reduce((s, b) => s + b.points, 0) === r.data.userStats.currentPoints);
  const ownerXpBefore = r.data.userStats.currentPoints;

  r = await req('GET', '/analytics/gamification/overview?userId=00000000-0000-0000-0000-000000000000', { token: COORD });
  check('overview for unknown user -> 404', r.status === 404, msg(r));

  r = await req('GET', '/analytics/gamification/leaderboards', { token: COORD });
  check('leaderboards 200', r.status === 200, msg(r));
  const lb = r.data;
  check('no fake loc-7 rows', !lb.workstationsLeaderboard.some((w) => String(w.id).startsWith('loc-')));
  check('workstation ids are real locations', lb.workstationsLeaderboard.every((w) => locList.some((l) => l.id === w.id)));
  check('workstations sorted by points', lb.workstationsLeaderboard.every((w, i, a) => i === 0 || a[i - 1].points >= w.points));
  check('capa closure rate numeric or null', lb.workstationsLeaderboard.every((w) => w.capaClosureRate === null || (w.capaClosureRate >= 0 && w.capaClosureRate <= 100)));
  check('mostImproved real or null', lb.mostImproved === null || lb.mostImproved.delta > 0);

  r = await req('GET', '/analytics/gamification/badges', { token: AUDITOR });
  check('badges 200', r.status === 200, msg(r));
  check('badge progress within target', r.data.badges.every((b) => b.progress.current >= 0 && b.progress.current <= b.progress.target));
  check('unlocked badges have a date', r.data.badges.every((b) => b.unlocked === !!b.unlockedDate));

  r = await req('GET', '/analytics/gamification/trophies', { token: COORD });
  check('trophies 200', r.status === 200, msg(r));
  check('4 trophy definitions', r.data.floatingTrophies.length === 4);
  const before = r.data.floatingTrophies.find((t) => t.id === 'GOLDEN_BROOM');

  // ---------- Kudos ----------
  r = await req('POST', '/analytics/gamification/kudos', { token: AUDITOR, body: { toUserId: id(auditorUser), category: 'TEAMWORK', message: `${MARK} self` } });
  check('self kudos -> 400', r.status === 400, msg(r));
  r = await req('POST', '/analytics/gamification/kudos', { token: AUDITOR, body: { toUserId: id(ownerUser), category: 'NOT_A_CATEGORY', message: `${MARK} x` } });
  check('invalid category -> 400', r.status === 400, msg(r));
  r = await req('POST', '/analytics/gamification/kudos', { token: AUDITOR, body: { toUserId: id(ownerUser), category: 'TEAMWORK', message: `${MARK} spoof`, points: 100, fromUser: 'CEO' } });
  check('spoofed points stripped (fixed 25 XP)', r.status === 201 && r.data.points === 25, msg(r));
  const spoofed = (await req('GET', '/analytics/gamification/trophies', { token: COORD })).data.kudosFeed.find((k) => k.message === `${MARK} spoof`);
  check('spoofed fromUser ignored (real sender stored)', spoofed?.fromUserId === id(auditorUser) && spoofed?.fromUser !== 'CEO', JSON.stringify(spoofed));
  r = await req('POST', '/analytics/gamification/kudos', { token: AUDITOR, body: { toUserId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', category: 'TEAMWORK', message: `${MARK} ghost` } });
  check('unknown recipient -> 404', r.status === 404, msg(r));
  r = await req('POST', '/analytics/gamification/kudos', { token: AUDITOR, body: { toUserId: id(ownerUser), category: 'RAPID_CAPA', message: `${MARK} great fix` } });
  check('kudos sent', r.status === 201 && r.data.points === 25, msg(r));

  r = await req('GET', '/analytics/gamification/overview', { token: OWNER });
  check('recipient XP rises by 25 per kudos (2 sent)', r.data.userStats.currentPoints === ownerXpBefore + 50, `${ownerXpBefore} -> ${r.data.userStats.currentPoints}`);
  r = await req('GET', '/analytics/gamification/trophies', { token: COORD });
  const feedItem = r.data.kudosFeed.find((k) => k.message === `${MARK} great fix`);
  check('kudos feed shows real sender', feedItem && feedItem.fromUserId === id(auditorUser), JSON.stringify(feedItem));

  // ---------- Trophies ----------
  r = await req('POST', '/analytics/gamification/award-trophy', { token: OWNER, body: { trophyId: 'GOLDEN_BROOM', newLocationId: locList[0].id, citation: MARK } });
  check('area owner cannot award trophies', r.status === 403, msg(r));
  r = await req('POST', '/analytics/gamification/award-trophy', { token: COORD, body: { trophyId: 'trophy-golden-broom', newLocationId: locList[0].id, citation: MARK } });
  check('unknown trophy key -> 400', r.status === 400, msg(r));
  const target1 = locList.find((l) => l.id !== before.currentHolder?.locationId) ?? locList[0];
  r = await req('POST', '/analytics/gamification/award-trophy', { token: COORD, body: { trophyId: 'GOLDEN_BROOM', newLocationId: target1.id, citation: `${MARK} first` } });
  check('trophy awarded', r.status === 201, msg(r));
  r = await req('POST', '/analytics/gamification/award-trophy', { token: COORD, body: { trophyId: 'GOLDEN_BROOM', newLocationId: target1.id, citation: `${MARK} again` } });
  check('re-awarding to current holder -> 409', r.status === 409, msg(r));
  const target2 = locList.find((l) => l.id !== target1.id);
  if (target2) {
    r = await req('POST', '/analytics/gamification/award-trophy', { token: COORD, body: { trophyId: 'GOLDEN_BROOM', newLocationId: target2.id, citation: `${MARK} handover` } });
    check('trophy handed over', r.status === 201, msg(r));
    r = await req('GET', '/analytics/gamification/trophies', { token: COORD });
    const gb = r.data.floatingTrophies.find((t) => t.id === 'GOLDEN_BROOM');
    check('new holder shown', gb.currentHolder?.locationId === target2.id);
    check('previous holder in Hall of Fame', r.data.hallOfFame.some((h) => h.citation === `${MARK} first`));
  }
  console.log('\nPhase 1 done — restart the server and run with phase2');
} else {
  // ---------- After restart: persisted ----------
  let r = await req('GET', '/analytics/gamification/trophies', { token: COORD });
  check('kudos survived restart', r.data.kudosFeed.some((k) => k.message === `${MARK} great fix`));
  check('hall of fame survived restart', r.data.hallOfFame.some((h) => h.citation === `${MARK} first`));
  check('current holder survived restart', r.data.floatingTrophies.some((t) => t.currentHolder));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
