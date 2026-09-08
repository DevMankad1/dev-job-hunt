#!/usr/bin/env node
/**
 * digest.mjs — turn data/jobs.raw.json into the HTML email body.
 *
 *   node scripts/digest.mjs                 # writes reports/latest.html + reports/<date>.md
 *   node scripts/digest.mjs --stdout-html   # print HTML only (what the routine pipes to Gmail)
 *   node scripts/digest.mjs --subject       # print just the subject line
 *
 * Sections are grouped by LANE so Dev can triage by intent, not by company:
 *   1. AI / Agentic + Forward Deployed   (purple)  — his differentiator lane
 *   2. Mobile — Flutter / KMP            (blue)
 *   3. Full-stack MERN                   (green)
 *   4. Worth a look / needs judgement    (amber)   — anything with blockers
 *
 * Every row carries the DIRECT apply link, never a careers-page root.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const args = new Set(process.argv.slice(2));
const jobs = rd('data/jobs.raw.json');
const profile = rd('profile.json');
const matches = jobs.matches || [];

const CHANNELS = [
  { id: 'remote-global', label: 'Remote — global', blurb: 'Non-Indian companies that will hire you where you live. Highest ceiling: USD 30k ≈ 25 LPA, ~2.8x your current. Verify India eligibility on the posting itself — a board\'s country tag is not evidence.' },
  { id: 'india',         label: 'India', blurb: 'Indian employers and India-located roles.' },
  { id: null,            label: 'Unconfirmed location', blurb: 'Kept rather than assumed. Check the posting before spending time.' },
];

const LANES = [
  { id: 'ai', label: 'AI / Agentic + Forward Deployed', color: '#6d28d9', bg: '#f5f3ff',
    test: (m) => ['ai-agent-engineer', 'llm-app-engineer', 'forward-deployed-engineer', 'fullstack-ai'].includes(m.archetype) },
  { id: 'mobile', label: 'Mobile — Flutter / KMP / cross-platform', color: '#1d4ed8', bg: '#eff6ff',
    test: (m) => ['flutter-engineer', 'kmp-android-engineer', 'mobile-generalist', 'healthtech-mobile'].includes(m.archetype) },
  { id: 'mern', label: 'Full-stack — MERN', color: '#047857', bg: '#ecfdf5',
    test: (m) => ['mern-fullstack', 'react-frontend', 'node-backend'].includes(m.archetype) },
  { id: 'other', label: 'Other / generalist', color: '#475569', bg: '#f8fafc',
    test: () => true },
];

const clean = matches.filter((m) => m.recommendation === 'apply');
const flagged = matches.filter((m) => m.recommendation !== 'apply');

function bucket(list) {
  const out = LANES.map((l) => ({ ...l, rows: [] }));
  for (const m of list) {
    const lane = out.find((l) => l.test(m));
    lane.rows.push(m);
  }
  return out.filter((l) => l.rows.length);
}

/** Split a list by channel, in channel priority order, dropping empties. */
function byChannel(list) {
  return CHANNELS
    .map((c) => ({ ...c, rows: list.filter((m) => (m.channel ?? null) === c.id) }))
    .filter((c) => c.rows.length);
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const freshness = (iso) => {
  if (!iso) return 'date unknown';
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return 'just posted';
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
};

const VARIANT_HINT = {
  'ai-agent-engineer': 'ai-agent-engineer',
  'llm-app-engineer': 'llm-app-engineer',
  'forward-deployed-engineer': 'forward-deployed-engineer',
  'fullstack-ai': 'fullstack-ai',
  'flutter-engineer': 'flutter-engineer',
  'kmp-android-engineer': 'kmp-android-engineer',
  'mobile-generalist': 'mobile-generalist',
  'healthtech-mobile': 'healthtech-mobile',
  'mern-fullstack': 'mern-fullstack',
  'react-frontend': 'react-frontend',
  'node-backend': 'node-backend',
  'sde-generalist': 'sde-generalist',
};

function rowHtml(m, color) {
  const why = [
    m.companySegments?.length ? m.companySegments.slice(0, 3).join(' · ') : null,
    m.companyPriority ? `${m.companyPriority}-priority employer` : null,
  ].filter(Boolean).join(' · ');

  return `
  <tr><td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">
    <div style="font:600 15px/1.35 -apple-system,Segoe UI,Roboto,sans-serif;color:#111827;">
      ${esc(m.title)}
    </div>
    <div style="font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#374151;margin-top:2px;">
      <strong>${esc(m.company)}</strong> · ${esc(m.location || 'location not stated')} · ${esc(m.freshnessLabel || freshness(m.postedAt))}
    </div>
    ${m.eligibility === 'unconfirmed' ? `<div style="font:12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#b45309;margin-top:3px;">Unconfirmed location — ${esc(m.eligibilityReason || '')}</div>` : ''}
    ${m.seniorityAsked && m.seniorityScore < 1 ? `<div style="font:12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#b45309;margin-top:3px;">Stretch — asks ${esc(String(m.seniorityAsked))}+ years</div>` : ''}
    <div style="font:12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#6b7280;margin-top:3px;">
      ${esc(why)}
    </div>
    ${m.blockers?.length ? `<div style="font:12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#b45309;margin-top:5px;">⚠ ${esc(m.blockers.join(' · '))}</div>` : ''}
    <div style="margin-top:8px;">
      <a href="${esc(m.url)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font:600 12px/1 -apple-system,Segoe UI,Roboto,sans-serif;padding:8px 12px;border-radius:5px;">Open the JD &rarr;</a>
      <span style="font:12px/1 -apple-system,Segoe UI,Roboto,sans-serif;color:#6b7280;margin-left:10px;">
        tailor: <code style="background:#f3f4f6;padding:2px 5px;border-radius:3px;">--archetype ${esc(VARIANT_HINT[m.archetype] || m.archetype)}</code>
      </span>
    </div>
  </td></tr>`;
}

function sectionHtml(lane, flaggedSection = false) {
  return `
  <div style="margin:0 0 22px;">
    <div style="background:${lane.bg};border-left:4px solid ${lane.color};padding:9px 14px;">
      <span style="font:700 13px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:${lane.color};letter-spacing:.02em;text-transform:uppercase;">
        ${esc(lane.label)}${flaggedSection ? ' — needs your judgement' : ''}
      </span>
      <span style="font:12px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:#6b7280;"> · ${lane.rows.length}</span>
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${lane.rows.map((m) => rowHtml(m, lane.color)).join('')}
    </table>
  </div>`;
}

const globalCount = clean.filter((m) => m.channel === 'remote-global').length;
const subject = clean.length
  ? `${clean.length} new match${clean.length === 1 ? '' : 'es'}${globalCount ? ` · ${globalCount} remote-global` : ''}${flagged.length ? ` (+${flagged.length} to review)` : ''} — ${clean.slice(0, 2).map((m) => m.company).join(', ')}${clean.length > 2 ? '…' : ''}`
  : `${flagged.length} posting${flagged.length === 1 ? '' : 's'} to review`;

const html = `
<div style="max-width:680px;margin:0 auto;padding:20px;background:#ffffff;">
  <div style="border-bottom:2px solid #111827;padding-bottom:10px;margin-bottom:20px;">
    <div style="font:700 19px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:#111827;">Job matches</div>
    <div style="font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#6b7280;margin-top:3px;">
      ${new Date(jobs.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST ·
      ${jobs.stats.boards} boards · ${jobs.stats.rawJobs} postings scanned · ${matches.length} survived filtering
    </div>
  </div>

  ${byChannel(clean).map((ch) => `
    <div style="margin:0 0 8px;padding:10px 0 0;border-top:2px solid #111827;">
      <div style="font:700 15px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:#111827;">${esc(ch.label)}
        <span style="font-weight:400;color:#6b7280;font-size:13px;">· ${ch.rows.length}</span></div>
      <div style="font:12.5px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#6b7280;margin:3px 0 12px;max-width:62ch;">${esc(ch.blurb)}</div>
      ${bucket(ch.rows).map((l) => sectionHtml(l)).join('')}
    </div>`).join('')}
  ${flagged.length ? `
    <div style="margin:18px 0 8px;padding:10px 0 0;border-top:2px solid #111827;">
      <div style="font:700 15px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:#111827;">Needs your judgement
        <span style="font-weight:400;color:#6b7280;font-size:13px;">· ${flagged.length}</span></div>
      ${bucket(flagged).map((l) => sectionHtml(l, true)).join('')}
    </div>` : ''}

  <div style="margin-top:26px;padding-top:14px;border-top:1px solid #e5e7eb;font:12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#6b7280;">
    <strong style="color:#374151;">To tailor your resume for any of these:</strong><br>
    <code style="background:#f3f4f6;padding:2px 5px;border-radius:3px;">node scripts/tailor.mjs --url &lt;JD link&gt; --company "X" --title "Y"</code><br><br>
    Ranked newest-first: a 70% fit posted three hours ago beats a 90% fit posted six days ago.
    Salary is always an estimate unless the JD states a number — never a reason to skip.<br><br>
    Full tracker: <code style="background:#f3f4f6;padding:2px 5px;border-radius:3px;">reports/tracker.xlsx</code> ·
    already-sent ledger: <code style="background:#f3f4f6;padding:2px 5px;border-radius:3px;">state/sent-log.md</code><br>
    Nothing here was applied to automatically; every application is your own deliberate action.
  </div>
</div>`.trim();

if (args.has('--subject')) { process.stdout.write(subject); process.exit(0); }
if (args.has('--stdout-html')) { process.stdout.write(html); process.exit(0); }

const date = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports/latest.html'), html);

const mdLines = [`# Job matches — ${new Date().toISOString().slice(0, 10)}`, '',
  `${jobs.stats.boards} boards · ${jobs.stats.rawJobs} postings scanned · ${matches.length} matched`, ''];
for (const ch of byChannel(clean)) {
 mdLines.push(`# ${ch.label} — ${ch.rows.length}`, '', ch.blurb, '');
 for (const lane of bucket(ch.rows)) {
  mdLines.push(`## ${lane.label}`, '');
  for (const m of lane.rows) {
    mdLines.push(`- **${m.company} — ${m.title}** · ${m.location || '?'} · ${m.freshnessLabel || freshness(m.postedAt)}`);
    mdLines.push(`  - ${m.url}`);
    mdLines.push(`  - tailor: \`node scripts/tailor.mjs --url "${m.url}" --company "${m.company}" --title "${m.title}"\``);
  }
  mdLines.push('');
 }
}
if (flagged.length) {
  mdLines.push('## Needs your judgement', '');
  for (const m of flagged) mdLines.push(`- **${m.company} — ${m.title}** — ${m.blockers.join(' · ')}\n  - ${m.url}`);
}
fs.writeFileSync(path.join(ROOT, `reports/${date}.md`), mdLines.join('\n'));

console.log(`subject: ${subject}`);
console.log(`wrote reports/latest.html and reports/${date}.md`);
console.log(`${clean.length} clean matches, ${flagged.length} flagged`);
