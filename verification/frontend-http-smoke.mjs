// Real offline Next HTTP checks, not a Supabase/browser integration test.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { before, after, test } from 'node:test';

const base = 'http://127.0.0.1:3417';
let server;
let serverLog = '';
let home = '';
before(async () => {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3417'], {
    env: {...process.env, NEXT_TELEMETRY_DISABLED:'1', NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'offline-fake-key'},
    stdio:['ignore','pipe','pipe'],
  });
  server.stdout.on('data', chunk => {serverLog += chunk});
  server.stderr.on('data', chunk => {serverLog += chunk});
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Next exited: ${serverLog}`);
    try {
      const response = await fetch(base, {signal:AbortSignal.timeout(1000)});
      if (response.ok) {home = await response.text(); return}
    } catch { /* wait only for the local server */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Local Next startup timed out: ${serverLog}`);
});
after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  writeFileSync('verification/frontend-http-server.log', serverLog);
});

test('production home provides staff sign-in without backend access', () => {
  assert.match(home, /Staff sign in/);
  assert.match(home, /QR code/);
});
test('production login contains the real email and password form', async () => {
  const response = await fetch(`${base}/login`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /type="email"/);
  assert.match(html, /type="password"/);
});
const protectedRoutes = [
  '/admin', '/admin/access', '/admin/courses', '/admin/courses/course-id',
  '/admin/events/event-id', '/admin/events/event-id?history=1',
  '/admin/events/event-id/leaderboard', '/admin/contests/contest-id',
  '/admin/contests/contest-id/print', '/admin/leaderboards', '/admin/history', '/admin/sponsors',
];
for (const route of protectedRoutes) {
  test(`signed-out ${route} redirects to login`, async () => {
    const response = await fetch(`${base}${route}`, {redirect:'manual'});
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get('location'), base).pathname, '/login');
  });
}
test('legacy QR route serves a public shell without staff login', async () => {
  const response = await fetch(`${base}/c/legacy-token`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Loading/);
});
test('built stylesheet ships popup containment and print rules', async () => {
  const path = home.match(/href="([^"]+\.css[^"]*)"/)?.[1];
  assert.ok(path, 'production stylesheet reference');
  const response = await fetch(new URL(path.replaceAll('&amp;', '&'), base));
  assert.equal(response.status, 200);
  const css = await response.text();
  assert.match(css, /\.banner-backdrop\{/);
  assert.match(css, /object-fit:contain/);
  assert.match(css, /@media print/);
  assert.match(css, /\.no-print/);
});
