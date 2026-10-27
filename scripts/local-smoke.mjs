// Real HTTP smoke checks against the local production build, without hosted credentials.
// Run after `npm run build`: node scripts/local-smoke.mjs (inside the offline sandbox).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const base = 'http://127.0.0.1:32117';
let server;
let logs = '';

before(async () => {
  assert.equal(process.env.GOLF_SANDBOX, '1', 'Run smoke checks through the isolated runner');
  assert.equal(process.env.GOLF_SANDBOX_NETWORK, 'disabled', 'Smoke checks must run offline');
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '32117'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_test_only',
    },
  });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => { logs = (logs + chunk.toString()).slice(-16000); });
  }
  server.on('error', (error) => { logs += '\n' + error.message; });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error('Production server exited: ' + logs);
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(1000) });
      await response.text();
      if (response.ok) return;
    } catch { /* Server is not listening yet; retry only the local readiness probe. */ }
    await delay(150);
  }
  throw new Error('Local production server readiness timed out: ' + logs);
});

after(async () => {
  if (!server || server.exitCode !== null) return;
  const stopped = new Promise((resolve) => server.once('exit', resolve));
  server.kill('SIGTERM');
  await Promise.race([stopped, delay(3000)]);
  if (server.exitCode === null) {
    server.kill('SIGKILL');
    await stopped;
  }
});

test('public homepage renders the golfer entry guidance and staff sign-in link', async () => {
  const response = await fetch(base, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Golf contest scoring/);
  assert.match(html, /scan the QR code/i);
  assert.match(html, /href="\/login"/);
});

test('staff login renders email and password fields without a hosted Auth request', async () => {
  const response = await fetch(base + '/login', { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Staff sign in/);
  assert.match(html, /type="email"/);
  assert.match(html, /type="password"/);
});

for (const path of ['/admin', '/admin/access', '/admin/leaderboards', '/admin/contests/00000000-0000-0000-0000-0000000000c3/print']) {
  test('unauthenticated request to ' + path + ' redirects to the local login route', async () => {
    const response = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    assert.ok([302, 303, 307, 308].includes(response.status), 'Expected a login redirect, got ' + response.status);
    const target = new URL(response.headers.get('location'), base);
    assert.equal(target.origin, base);
    assert.equal(target.pathname, '/login');
  });
}
