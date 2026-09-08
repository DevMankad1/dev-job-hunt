#!/usr/bin/env node
/**
 * ledger.mjs — the sent-log, borrowed from Ankur Kapuriya's runbook.
 *
 *   node scripts/ledger.mjs list                    # show what has gone out
 *   node scripts/ledger.mjs check <url>             # has this been sent?
 *   node scripts/ledger.mjs urls                    # bare URL list (for --exclude-urls)
 *   node scripts/ledger.mjs commit                  # append everything in data/jobs.raw.json
 *   node scripts/ledger.mjs founder "Acme"          # record a founder company as contacted
 *
 * THE DISCIPLINE THAT MAKES THIS WORK — do not soften it:
 *
 *   Read in full BEFORE a run starts. Append ONLY once the outputs are final.
 *
 * The ledger must record exactly what went out the door, never what was merely
 * considered. `state/seen-urls.json` is written at scan time, which means a run
 * that crashes between scanning and emailing silently buries those roles
 * forever. This file is written after delivery, so a failed run loses nothing.
 *
 * Ankur's other hard-won rule, kept here: every research agent gets the COMPLETE
 * ledger, never a source-specific slice. A partial list is what let already-sent
 * jobs reappear as "new" in one of his earlier runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = path.join(ROOT, 'state/sent-log.md');

const HEADER = `# Sent log

The exact record of what has gone out. Read in full before a run; appended to
only once that run's outputs are final, so it always matches what was actually
delivered rather than what was merely considered.

Jobs are matched on **Company + Title + Link**. Founder companies are matched on
**Company name alone** — a second role at a company already approached is still
the same relationship.

A near-miss (same company, different title, ambiguous whether it is the same
underlying opening) is dropped and noted rather than risked as a repeat.

## Jobs

| Company | Title | Link | First sent |
|---|---|---|---|
`;

const FOUNDER_HEADER = `
## Founder companies

| Company | First contacted |
|---|---|
`;

function ensure() {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  if (!fs.existsSync(LEDGER)) fs.writeFileSync(LEDGER, HEADER + FOUNDER_HEADER);
  return fs.readFileSync(LEDGER, 'utf8');
}

function parse(md) {
  const jobs = [];
  const founders = [];
  let section = null;
  for (const line of md.split('\n')) {
    if (/^##\s+Jobs/i.test(line)) { section = 'jobs'; continue; }
    if (/^##\s+Founder/i.test(line)) { section = 'founders'; continue; }
    if (!line.startsWith('|') || /^\|\s*-+/.test(line) || /\|\s*Company\s*\|/i.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((c, i, a) => !(i === 0 && !c) && !(i === a.length - 1 && !c));
    if (section === 'jobs' && cells.length >= 4) jobs.push({ company: cells[0], title: cells[1], link: cells[2], firstSent: cells[3] });
    if (section === 'founders' && cells.length >= 2) founders.push({ company: cells[0], firstContacted: cells[1] });
  }
  return { jobs, founders };
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
const today = () => new Date().toISOString().slice(0, 10);

function append({ jobs = [], founders = [] }) {
  let md = ensure();
  const cur = parse(md);
  const seenJob = new Set(cur.jobs.map((j) => `${j.company}||${j.title}||${j.link}`.toLowerCase()));
  const seenLink = new Set(cur.jobs.map((j) => j.link));
  const seenFounder = new Set(cur.founders.map((f) => f.company.toLowerCase()));

  const newJobs = jobs.filter((j) => {
    const k = `${j.company}||${j.title}||${j.url}`.toLowerCase();
    return !seenJob.has(k) && !seenLink.has(j.url);
  });
  const newFounders = founders.filter((f) => !seenFounder.has(String(f).toLowerCase()));

  if (newJobs.length) {
    const rows = newJobs.map((j) => `| ${esc(j.company)} | ${esc(j.title)} | ${esc(j.url)} | ${today()} |`).join('\n') + '\n';
    const idx = md.indexOf(FOUNDER_HEADER.trimEnd());
    md = idx === -1 ? md + rows : md.slice(0, idx) + rows + md.slice(idx);
  }
  if (newFounders.length) {
    md = md.trimEnd() + '\n' + newFounders.map((f) => `| ${esc(f)} | ${today()} |`).join('\n') + '\n';
  }
  fs.writeFileSync(LEDGER, md);
  return { addedJobs: newJobs.length, addedFounders: newFounders.length };
}

// ---------------------------------------------------------------------------

const [cmd, ...rest] = process.argv.slice(2);
const md = ensure();
const { jobs, founders } = parse(md);

switch (cmd) {
  case 'list': {
    console.log(`\n  ${jobs.length} jobs sent · ${founders.length} founder companies contacted\n`);
    for (const j of jobs.slice(-30)) console.log(`  ${j.firstSent}  ${j.company} — ${j.title}`);
    if (founders.length) {
      console.log('\n  Founders:');
      for (const f of founders.slice(-20)) console.log(`  ${f.firstContacted}  ${f.company}`);
    }
    console.log('');
    break;
  }
  case 'urls': {
    // Feed straight into: node scripts/scan.mjs --exclude-urls <file>
    for (const j of jobs) if (j.link) console.log(j.link);
    break;
  }
  case 'check': {
    const url = rest[0];
    if (!url) { console.error('usage: ledger.mjs check <url>'); process.exit(2); }
    const hit = jobs.find((j) => j.link === url);
    console.log(hit ? `SENT on ${hit.firstSent} — ${hit.company} — ${hit.title}` : 'not in the ledger');
    process.exit(hit ? 1 : 0);
  }
  case 'commit': {
    const p = path.join(ROOT, 'data/jobs.raw.json');
    if (!fs.existsSync(p)) { console.error('data/jobs.raw.json not found — run a scan first.'); process.exit(2); }
    const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
    const r = append({ jobs: doc.matches || [] });
    console.log(`ledger: +${r.addedJobs} jobs (${(doc.matches || []).length} in this run, rest already recorded)`);
    break;
  }
  case 'founder': {
    if (!rest.length) { console.error('usage: ledger.mjs founder "Company Name"'); process.exit(2); }
    const r = append({ founders: rest });
    console.log(`ledger: +${r.addedFounders} founder companies`);
    break;
  }
  default:
    console.log(`ledger.mjs — the sent-log

  list                 show what has gone out
  urls                 bare URL list, for scan.mjs --exclude-urls
  check <url>          has this been sent? (exit 1 = yes)
  commit               append everything in data/jobs.raw.json
  founder "Acme"       record a founder company as contacted

Read before a run. Append only after delivery.`);
}
