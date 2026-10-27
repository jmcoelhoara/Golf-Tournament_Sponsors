// Run only through tooling/sandbox.py: serial checks, no service credentials or network.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';

if (process.env.GOLF_SANDBOX !== '1' || process.env.GOLF_SANDBOX_NETWORK !== 'disabled') {
  throw new Error('The required offline sandbox must run this verification.');
}
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'offline-fake-key',
};
// Exercise the existing, real production HTTP checks, changing only their log destination.
// Evaluating the module runs its node:test suite without overwriting earlier evidence.
const smoke = readFileSync('verification/frontend-http-smoke.mjs', 'utf8')
  .replace("'verification/frontend-http-server.log'", "'verification/review-acl-http-server.log'");
const checks = [
  ['ui', 'npm', ['run', 'test:ui', '--', '--maxWorkers=1']],
  ['lint', 'npm', ['run', 'lint']],
  ['typecheck', 'npm', ['run', 'typecheck']],
  ['build', 'npm', ['run', 'build']],
  ['http', 'node', ['--input-type=module', '--eval', smoke]],
];
const report = {
  started_at: new Date().toISOString(),
  finding: 'FE-ACL-REFRESH-01',
  network: 'offline sandbox',
  backend: 'none; fake loopback URL/key only',
  baseline_ui_tests: 65,
  checks: [],
};
for (const [name, command, args] of checks) {
  const start = Date.now();
  const result = spawnSync(command, args, {env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  const output = (result.stdout ?? '') + (result.stderr ?? '') + (result.error ? `\n${result.error.message}\n` : '');
  const log = `verification/review-acl-final-${name}.log`;
  writeFileSync(log, output);
  const plain = stripVTControlCharacters(output);
  const check = {
    name,
    command: name === 'http'
      ? 'node --input-type=module --eval <existing frontend-http-smoke.mjs with review-only log destination>'
      : [command, ...args].join(' '),
    exit_code: result.status,
    seconds: (Date.now() - start) / 1000,
    log,
  };
  if (name === 'ui') {
    check.files_passed = Number(plain.match(/Test Files\s+(\d+) passed/)?.[1] ?? 0);
    check.tests_passed = Number(plain.match(/\n\s*Tests\s+(\d+) passed/)?.[1] ?? 0);
  }
  if (name === 'http') {
    check.tests_passed = Number(plain.match(/pass (\d+)/)?.[1] ?? 0);
    check.tests_failed = Number(plain.match(/fail (\d+)/)?.[1] ?? -1);
    check.tests_skipped = Number(plain.match(/skipped (\d+)/)?.[1] ?? -1);
  }
  report.checks.push(check);
  writeFileSync('verification/review-acl-final-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(output);
  console.log(JSON.stringify(check));
}
const ui = report.checks.find(check => check.name === 'ui');
const http = report.checks.find(check => check.name === 'http');
report.added_ui_tests = ui.tests_passed - report.baseline_ui_tests;
report.finished_at = new Date().toISOString();
writeFileSync('verification/review-acl-final-results.json', JSON.stringify(report, null, 2) + '\n');
if (report.checks.some(check => check.exit_code !== 0) || !ui.tests_passed
    || http.tests_passed !== 16 || http.tests_failed !== 0 || http.tests_skipped !== 0) {
  process.exitCode = 1;
}
