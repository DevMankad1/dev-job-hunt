#!/usr/bin/env node
/**
 * jobhunt.mjs — one command, the whole pipeline, both channels.
 *
 *   node scripts/jobhunt.mjs                 # the normal run
 *   node scripts/jobhunt.mjs --wide          # 30-day window, ignore dedupe state
 *   node scripts/jobhunt.mjs --channel india
 *   node scripts/jobhunt.mjs --no-ledger     # don't record this run as delivered
 *
 * Order matters and is deliberate:
 *
 *   1. READ the sent-log in full          (never scan before knowing what went out)
 *   2. SCAN both channels                 (eligibility + freshness + seniority)
 *   3. DIGEST                             (HTML email body + dated markdown)
 *   4. TRACKER                            (two-tab xlsx, preserves your edits)
 *   5. LEDGER                             (append — ONLY after everything above)
 *
 * Step 5 last is the point: the ledger must record what was actually delivered,
 * not what was merely considered. A run that dies at step 3 loses nothing.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const argVal = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
};

const C = { dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', c: '\x1b[36m', r: '\x1b[31m', x: '\x1b[0m' };
const step = (n, t) => console.log(`\n${C.c}${C.b}[${n}/5]${C.x} ${C.b}${t}${C.x}`);

function run(cmd, cmdArgs, { quiet = false, optional = false } = {}) {
  try {
    // No shell: passing args through a shell concatenates rather than escapes
    // them, and these carry URLs and job titles from third-party job boards.
    const out = execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' });
    return out || '';
  } catch (e) {
    if (optional) {
      console.log(`  ${C.y}skipped${C.x} — ${cmd} failed (${String(e.message).split('\n')[0]})`);
      return null;
    }
    throw e;
  }
}

const wide = args.has('--wide');
const channel = argVal('channel');

console.log(`${C.b}Job hunt — full run${C.x}  ${C.dim}${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST${C.x}`);

// ---- 1. read the ledger BEFORE touching a source --------------------------
step(1, 'Reading the sent-log');
const sentPath = path.join(os.tmpdir(), 'jobhunt-sent.txt');
const urls = run('node', ['scripts/ledger.mjs', 'urls'], { quiet: true, optional: true }) ?? '';
fs.writeFileSync(sentPath, urls);
const sentCount = urls.split('\n').filter(Boolean).length;
console.log(`  ${sentCount} roles already delivered — excluded from this run`);

// ---- 2. scan --------------------------------------------------------------
step(2, `Scanning${channel ? ` · ${channel} only` : ' · both channels'}`);
const scanArgs = ['scripts/scan.mjs', '--exclude-urls', sentPath, '--write-state'];
if (wide) scanArgs.push('--maxAgeHours', '2000', '--maxAgeDays', '30', '--all');
if (channel) scanArgs.push('--channel', channel);
run('node', scanArgs);

const jobs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/jobs.raw.json'), 'utf8'));
const matches = jobs.matches || [];

if (!matches.length) {
  console.log(`\n${C.g}Nothing new.${C.x} That is a normal outcome, not a broken scanner —`);
  console.log(`see OPERATING-LOG.md on saturation. Try ${C.b}--wide${C.x}, or work the founder track.\n`);
  process.exit(0);
}

// ---- 3. digest ------------------------------------------------------------
step(3, 'Building the digest');
run('node', ['scripts/digest.mjs']);

// ---- 4. tracker -----------------------------------------------------------
step(4, 'Updating the tracker');
const py = process.platform === 'win32' ? 'python' : 'python3';
run(py, ['scripts/tracker.py', '--append'], { optional: true });

// ---- 5. ledger — last, and only now ---------------------------------------
step(5, 'Recording what went out');
if (args.has('--no-ledger')) {
  console.log(`  ${C.y}skipped${C.x} (--no-ledger) — these roles will resurface next run`);
} else {
  run('node', ['scripts/ledger.mjs', 'commit']);
}

// ---- summary --------------------------------------------------------------
const byChannel = matches.reduce((m, x) => ((m[x.channel || 'unconfirmed'] = (m[x.channel || 'unconfirmed'] || 0) + 1), m), {});
const apply = matches.filter((m) => m.recommendation === 'apply');
const review = matches.filter((m) => m.recommendation === 'review');

console.log(`\n${C.b}${'─'.repeat(64)}${C.x}`);
console.log(`${C.b}${matches.length} new${C.x}  ${C.dim}·${C.x}  ${C.g}${apply.length} worth applying${C.x}  ${C.dim}·${C.x}  ${C.y}${review.length} need your call${C.x}`);
console.log(`channels: ${Object.entries(byChannel).map(([k, v]) => `${k} ${v}`).join('  ·  ')}`);
console.log(`${C.dim}from ${jobs.stats.rawJobs} postings across ${jobs.stats.boards} boards${C.x}\n`);

const order = { 'remote-global': 0, india: 1, unconfirmed: 2 };
for (const ch of Object.keys(byChannel).sort((a, b) => (order[a] ?? 9) - (order[b] ?? 9))) {
  console.log(`${C.b}${ch === 'remote-global' ? 'REMOTE — GLOBAL' : ch.toUpperCase()}${C.x}`);
  for (const m of matches.filter((x) => (x.channel || 'unconfirmed') === ch)) {
    const flag = m.recommendation === 'apply' ? `${C.g}+${C.x}` : m.recommendation === 'review' ? `${C.y}~${C.x}` : `${C.dim}·${C.x}`;
    console.log(`  ${flag} ${m.company} — ${m.title}`);
    console.log(`    ${C.dim}${m.location || 'location?'} · ${m.freshnessLabel} · ${m.archetype}${C.x}`);
    console.log(`    ${m.url}`);
    if (m.blockers?.length) console.log(`    ${C.y}${m.blockers.join(' · ')}${C.x}`);
  }
  console.log('');
}

console.log(`${C.dim}tracker  reports/tracker.xlsx   (Apply column deep-links to the form)`);
console.log(`email    reports/latest.html`);
console.log(`tailor   node scripts/tailor.mjs --url "<link>" --company "X" --title "Y"${C.x}\n`);
