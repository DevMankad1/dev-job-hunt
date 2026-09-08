#!/usr/bin/env node
/**
 * scan.mjs — sweep every Tier-A ATS board, filter to Dev's targets, score, dedupe.
 *
 *   npm run scan                          # last 24h, dedupe against state
 *   node scripts/scan.mjs --maxAgeHours 168
 *   node scripts/scan.mjs --loc bengaluru
 *   node scripts/scan.mjs --all           # ignore the seen-urls state
 *   node scripts/scan.mjs --write-state   # record what it reported
 *   node scripts/scan.mjs --json          # machine-readable stdout only
 *
 * No model calls — pure HTTP + regex + the keyword taxonomy. Cheap enough to run
 * on a cron. Writes data/jobs.raw.json and (with --write-state) state/seen-urls.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBoard } from '../adapters/ats.mjs';
import { analyseJd } from './lib/jd.mjs';
import { norm } from './lib/text.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) continue;
    const k = t.slice(2), n = argv[i + 1];
    if (n === undefined || n.startsWith('--')) a[k] = true; else { a[k] = n; i++; }
  }
  return a;
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx]); } catch (e) { out[idx] = { __error: e.message, __item: items[idx] }; }
    }
  }));
  return out;
}

const args = parseArgs(process.argv);
const quiet = !!args.json;
const say = (...m) => { if (!quiet) console.log(...m); };

const profile = rd('profile.json');
const keywords = rd('data/keywords.json');
const registry = rd('data/companies.json');
const companies = registry.companies || registry;

const maxAgeHours = parseInt((args.maxAgeHours && args.maxAgeHours !== true) ? args.maxAgeHours : String(profile.scanning?.maxAgeHours ?? 24), 10);
const cutoff = Date.now() - maxAgeHours * 3600 * 1000;
const locFilter = (args.loc && args.loc !== true) ? norm(args.loc) : null;

const sc = profile.scanning || {};
const roleRe = new RegExp(sc.roleRegex, 'i');
const senRe = new RegExp(sc.seniorityRejectRegex, 'i');
const stackRe = new RegExp(sc.stackRejectRegex, 'i');
const indiaRe = new RegExp(sc.indiaRegex, 'i');
const remoteRe = new RegExp(sc.remoteRegex, 'i');
const foreignRe = new RegExp(sc.foreignRejectRegex, 'i');

const tierA = companies.filter((c) => c.tier === 'A' && c.atsVerified && c.atsSlug);
say(`Scanning ${tierA.length} verified Tier-A boards · postings newer than ${maxAgeHours}h${locFilter ? ` · location ~ "${locFilter}"` : ''}\n`);

const boards = await pool(tierA, 8, async (c) => ({ company: c, jobs: await fetchBoard(c.atsProvider, c.atsSlug) }));

const stats = { boards: 0, boardErrors: 0, rawJobs: 0, afterAge: 0, afterRole: 0, afterSeniority: 0, afterStack: 0, afterLocation: 0, reported: 0 };
const errors = [];
const matches = [];

for (const b of boards) {
  if (!b || b.__error) { stats.boardErrors++; errors.push(`${b?.__item?.name || '?'}: ${b?.__error}`); continue; }
  stats.boards++;
  for (const j of b.jobs) {
    stats.rawJobs++;

    // Age. A board with no date is kept — some ATSes omit it, and dropping
    // everything undated would silently hide whole employers.
    if (j.postedAt && new Date(j.postedAt).getTime() < cutoff) continue;
    stats.afterAge++;

    const titleN = norm(j.title);
    const locN = norm(j.location);
    const blob = `${titleN} ${locN} ${norm(j.description).slice(0, 4000)}`;

    if (!roleRe.test(titleN)) continue;
    stats.afterRole++;

    if (senRe.test(titleN)) continue;
    stats.afterSeniority++;

    if (stackRe.test(titleN)) continue;
    stats.afterStack++;

    // Location is judged on the LOCATION FIELD only. Testing the JD body lets
    // London and San Francisco roles through, because India-founded companies
    // mention India all over their postings.
    const locSource = locN || norm(`${j.title}`);
    const isIndia = indiaRe.test(locSource);
    const isForeign = foreignRe.test(locSource);
    const isRemote = remoteRe.test(locSource) || remoteRe.test(titleN);

    // In scope: an India location, or remote with no foreign market named.
    // "Remote - India" and "Bangalore, India - Remote" both pass; "Remote, Denmark" does not.
    if (!(isIndia || (isRemote && !isForeign))) continue;
    if (isForeign && !isIndia) continue;
    if (locFilter && !locSource.includes(locFilter) && !(locFilter === 'remote' && isRemote)) continue;
    stats.afterLocation++;

    // Full analysis only for survivors — this is the expensive-ish part.
    const analysis = analyseJd({
      jdText: j.description || `${j.title} ${j.location}`,
      title: j.title,
      location: j.location,
      company: b.company.name,
      keywords,
      profile,
    });

    matches.push({
      company: b.company.name,
      companyDomain: b.company.domain,
      companyPriority: b.company.priority,
      companySegments: b.company.segments,
      title: j.title,
      location: j.location,
      url: j.url,
      postedAt: j.postedAt,
      source: j.source,
      archetype: analysis.bestArchetype?.id || 'sde-generalist',
      archetypeScore: analysis.bestArchetype?.score ?? 0,
      recommendation: analysis.recommendation,
      blockers: analysis.blockers,
      seniorityNote: analysis.seniority?.reason || '',
      isIndia,
      isRemote,
      descriptionExcerpt: (j.description || '').slice(0, 600),
    });
  }
}

// --- dedupe against durable state ------------------------------------------
const statePath = path.join(ROOT, 'state/seen-urls.json');
let seen = { urls: {}, lastRun: null };
if (fs.existsSync(statePath)) { try { seen = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { /* corrupt state is not fatal */ } }
seen.urls = seen.urls || {};

const fresh = args.all ? matches : matches.filter((m) => !seen.urls[m.url]);

// Rank: recommendation, then company priority, then archetype confidence.
const recRank = { apply: 3, review: 2, skip: 1 };
const priRank = { high: 3, medium: 2, low: 1 };
fresh.sort((a, b) =>
  (recRank[b.recommendation] - recRank[a.recommendation]) ||
  (priRank[b.companyPriority] - priRank[a.companyPriority]) ||
  (b.archetypeScore - a.archetypeScore));

stats.reported = fresh.length;

const out = {
  generatedAt: new Date().toISOString(),
  params: { maxAgeHours, loc: locFilter, all: !!args.all },
  stats,
  boardErrors: errors,
  matches: fresh,
};

const limit = args.limit && args.limit !== true ? parseInt(args.limit, 10) : null;
if (limit) out.matches = out.matches.slice(0, limit);

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/jobs.raw.json'), JSON.stringify(out, null, 2) + '\n');

if (args['write-state']) {
  const now = new Date().toISOString();
  for (const m of fresh) seen.urls[m.url] = { firstSeen: now, company: m.company, title: m.title };
  seen.lastRun = now;
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(seen, null, 2) + '\n');
}

if (args.json) {
  process.stdout.write(JSON.stringify(out, null, 2));
} else {
  say(`  boards ok ${stats.boards}  ·  errors ${stats.boardErrors}  ·  raw postings ${stats.rawJobs}`);
  say(`  funnel: age ${stats.afterAge} → role ${stats.afterRole} → seniority ${stats.afterSeniority} → stack ${stats.afterStack} → location ${stats.afterLocation}`);
  say(`  new since last run: ${stats.reported}${args.all ? ' (--all: state ignored)' : ''}\n`);
  for (const m of out.matches.slice(0, 40)) {
    const flag = m.recommendation === 'apply' ? '✔' : m.recommendation === 'review' ? '~' : '·';
    say(`  ${flag} ${m.company} — ${m.title}`);
    say(`     ${m.location || 'location?'} · ${m.archetype} (${m.archetypeScore}) · ${m.url}`);
    if (m.blockers.length) say(`     ! ${m.blockers.join(' | ')}`);
  }
  if (out.matches.length > 40) say(`\n  ... and ${out.matches.length - 40} more in data/jobs.raw.json`);
  if (errors.length) { say('\n  board errors:'); for (const e of errors) say(`    - ${e}`); }
  say('');
}
