// End-to-end suite runner. Requires a running API (E2E_BASE_URL, default http://localhost:3901) on a
// seeded database (`npm run prisma:seed`). Start the API for tests with:
//   PORT=3901 PUBLIC_API_URL=http://localhost:3901 NOTIFICATION_SCAN_MINUTES=0 SCHEDULE_GENERATION_MINUTES=0 PUSH_NOTIFICATIONS=off \
//   AUTH_RATE_LIMIT_PER_MINUTE=1000 TRUST_PROXY=loopback WEBHOOK_ALLOW_PRIVATE=true WEBHOOK_DISPATCH_SECONDS=1 node dist/main.js
// Usage: npm run test:e2e [-- suite-name ...]
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backend = resolve(here, '..', '..');
const base = process.env.E2E_BASE_URL ?? 'http://localhost:3901';

const ORDER = [
  'auth', 'isolation', 'answers', 'roles', 'workflow', 'audits', 'capa', 'areas', 'mobile', 'analytics', 'gamification', 'settings', 'activity',
  'notifications', 'reports', 'reporting', 'files', 'security', 'subscription', 'workspace', 'evidence', 'integrations', 'admin', 'routines', 'insights', 'quality',
];
const available = new Map(readdirSync(here).filter((f) => /-e2e\.(mjs|cjs)$/.test(f)).map((f) => [f.replace(/-e2e\.(mjs|cjs)$/, ''), f]));
const requested = process.argv.slice(2);
const suites = (requested.length ? requested : ORDER).filter((s) => {
  if (!available.has(s)) console.warn(`Unknown suite '${s}' (available: ${[...available.keys()].join(', ')})`);
  return available.has(s);
});

// The API must be up
try {
  const res = await fetch(`${base}/api/v1/auth/me`);
  if (res.status !== 401) throw new Error(`unexpected status ${res.status}`);
} catch (err) {
  console.error(`API not reachable at ${base}: ${err.message}`);
  process.exit(2);
}

// Mobile scoring / QR helpers are exercised against the server by the "mobile" suite
if (suites.includes('mobile')) {
  const tsc = join(backend, '..', 'mobile', 'node_modules', 'typescript', 'bin', 'tsc');
  const out = join(here, '.mobile-lib');
  if (existsSync(tsc)) {
    rmSync(out, { recursive: true, force: true });
    const src = join(backend, '..', 'mobile', 'src');
    const r = spawnSync(process.execPath, [tsc, join(src, 'services', 'auditScoring.ts'), join(src, 'services', 'qrPayload.ts'),
      '--outDir', out, '--rootDir', src, '--module', 'commonjs', '--target', 'es2020', '--esModuleInterop', '--skipLibCheck', '--jsx', 'react-jsx', '--ignoreConfig'],
      // --ignoreConfig: compile just these files (tsc otherwise refuses when a tsconfig.json is found)
      { stdio: 'inherit', cwd: here });
    if (r.status !== 0) console.warn('Mobile helpers compiled with type errors; continuing with emitted output.');
  } else {
    console.warn('mobile/node_modules not installed: skipping the mobile suite.');
    suites.splice(suites.indexOf('mobile'), 1);
  }
}

const results = [];
for (const suite of suites) {
  spawnSync(process.execPath, [join(here, 'support', 'cleanup.cjs'), backend], { cwd: backend, stdio: 'ignore' });
  const started = Date.now();
  const r = spawnSync(process.execPath, [join(here, available.get(suite))], { cwd: backend, encoding: 'utf8', env: process.env });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const summary = /(\d+) passed, (\d+) failed/.exec(output);
  const ok = r.status === 0;
  results.push({ suite, ok, passed: Number(summary?.[1] ?? 0), failed: Number(summary?.[2] ?? (ok ? 0 : 1)), ms: Date.now() - started });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${suite.padEnd(14)} ${summary ? `${summary[1]} passed, ${summary[2]} failed` : ''} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  if (!ok) console.log(output.split('\n').filter((l) => l.startsWith('FAIL') || /Error/.test(l)).slice(0, 20).join('\n'));
}
spawnSync(process.execPath, [join(here, 'support', 'cleanup.cjs'), backend], { cwd: backend, stdio: 'ignore' });

const passed = results.reduce((s, r) => s + r.passed, 0);
const failed = results.reduce((s, r) => s + r.failed, 0);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} suites passed — ${passed} checks passed, ${failed} failed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
