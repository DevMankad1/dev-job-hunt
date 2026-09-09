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
import { fetchAllBoards } from '../adapters/boards.mjs';
import { analyseJd } from './lib/jd.mjs';
import { classifyLocation, freshness, seniorityFit } from './lib/eligibility.mjs';
import { pickResume } from './lib/resume-router.mjs';
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
// --channel india|remote-global restricts the run to one lane of the hunt.
const channelFilter = (args.channel && args.channel !== true) ? String(args.channel) : null;
// Hard freshness cutoff in DAYS (Ankur's runbook uses 21).
const maxAgeDays = parseInt((args.maxAgeDays && args.maxAgeDays !== true) ? args.maxAgeDays : String(profile.scanning?.maxAgeDays ?? 21), 10);

const sc = profile.scanning || {};
const roleRe = new RegExp(sc.roleRegex, 'i');
const senRe = new RegExp(sc.seniorityRejectRegex, 'i');
const stackRe = new RegExp(sc.stackRejectRegex, 'i');
const indiaRe = new RegExp(sc.indiaRegex, 'i');
const remoteRe = new RegExp(sc.remoteRegex, 'i');
const foreignRe = new RegExp(sc.foreignRejectRegex, 'i');
// Training/gig marketplaces that list their OWN sourcing roles rather than a
// real employer's. This was added to profile.json earlier but never actually
// applied — which is how a Lemon.io listing reached the digest.
const marketRe = sc.marketplaceRejectRegex ? new RegExp(sc.marketplaceRejectRegex, 'i') : null;

const errors = [];
const tierA = companies.filter((c) => c.tier === 'A' && c.atsVerified && c.atsSlug);
say(`Scanning ${tierA.length} verified Tier-A boards · postings newer than ${maxAgeHours}h${locFilter ? ` · location ~ "${locFilter}"` : ''}\n`);

const boards = await pool(tierA, 8, async (c) => ({ company: c, jobs: await fetchBoard(c.atsProvider, c.atsSlug) }));

// Aggregator boards (RemoteOK, Remotive, Himalayas, HN "Who is hiring").
// Unlike an ATS board, these span every employer, so the company comes off the
// posting — and their eligibility tags are NOT reliable, so every row from here
// is treated as needing verification against the actual posting.
let boardJobs = [];
if (!args['no-boards']) {
  const feeds = await fetchAllBoards({ onError: (n, e) => errors.push(`board ${n}: ${e}`) });
  for (const f of feeds) {
    if (f.jobs.length) say(`  ${f.name}: ${f.jobs.length} postings`);
    for (const j of f.jobs) {
      boardJobs.push({ __board: f.name, ...j });
    }
  }
  if (boardJobs.length) say('');
}

const stats = { boards: 0, boardErrors: 0, rawJobs: 0, afterAge: 0, afterRole: 0, afterSeniority: 0, afterStack: 0, afterLocation: 0, afterFreshness: 0, staleDropped: 0, reported: 0, fromAggregators: 0 };
const matches = [];

// One list, two origins: {company} from the registry for ATS rows, or read off
// the posting for aggregator rows.
const streams = [];
for (const b of boards) {
  if (!b || b.__error) { stats.boardErrors++; errors.push(`${b?.__item?.name || '?'}: ${b?.__error}`); continue; }
  stats.boards++;
  for (const j of b.jobs) streams.push({ j, company: b.company, viaBoard: null });
}
for (const j of boardJobs) {
  streams.push({
    j,
    company: {
      name: j.company || '(company on the posting)',
      domain: '', priority: 'medium', segments: ['aggregator'], hqCountry: '',
    },
    viaBoard: j.__board,
  });
}

{
  for (const { j, company: comp, viaBoard } of streams) {
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

    // Seniority is a decaying score, not a binary cut (Ankur's model): full
    // marks at 1-4 years asked, zero by 6. A 5-year ask is a stretch, not a
    // wall. Director/Head-of/VP/Staff/Principal titles still hard-reject.
    const sen = seniorityFit(j.title + '\n' + (j.description || '').slice(0, 3000), profile.experience?.totalYears ?? 2.7);
    if (sen.verdict === 'reject') continue;
    stats.afterSeniority++;

    if (stackRe.test(titleN)) continue;
    // Match the employer name too: on these rows the marketplace IS the company.
    if (marketRe && (marketRe.test(titleN) || marketRe.test(norm(comp.name)) || marketRe.test(norm(comp.domain || '')))) continue;
    stats.afterStack++;

    // Location is judged on the LOCATION FIELD only. Testing the JD body lets
    // London and San Francisco roles through, because India-founded companies
    // mention India all over their postings.
    const elig = classifyLocation(j.location, j.title, { companyHqCountry: comp.hqCountry || '' });
    if (elig.verdict === 'drops') continue;
    if (elig.verdict === 'unconfirmed' && !args['keep-unconfirmed']) continue;

    const locSource = locN || titleN;
    const isIndia = elig.channel === 'india';
    const isRemote = remoteRe.test(locSource) || remoteRe.test(titleN);
    if (locFilter && !locSource.includes(locFilter) && !(locFilter === 'remote' && isRemote)) continue;
    if (channelFilter && elig.channel !== channelFilter) continue;
    stats.afterLocation++;

    // Hard freshness cutoff, default 21 days (Ankur's runbook).
    const fr = freshness(j.postedAt, maxAgeDays);
    if (!fr.fresh) { stats.staleDropped++; continue; }
    stats.afterFreshness++;

    // Full analysis only for survivors — this is the expensive-ish part.
    const analysis = analyseJd({
      jdText: j.description || `${j.title} ${j.location}`,
      title: j.title,
      location: j.location,
      company: comp.name,
      keywords,
      profile,
    });

    const pick = pickResume({
      archetype: analysis.bestArchetype?.id,
      jdText: j.description || '',
      title: j.title,
    });

    matches.push({
      viaBoard,
      tagTrust: j.tagTrust || null,
      resume: pick.file,
      resumeLabel: pick.label,
      resumeConfidence: pick.confidence,
      resumeWhy: pick.why,
      company: comp.name,
      companyDomain: comp.domain,
      companyPriority: comp.priority,
      companySegments: comp.segments,
      title: j.title,
      location: j.location,
      url: j.url,
      postedAt: j.postedAt,
      source: j.source,
      archetype: analysis.bestArchetype?.id || 'sde-generalist',
      archetypeScore: analysis.bestArchetype?.score ?? 0,
      recommendation: analysis.recommendation,
      blockers: analysis.blockers,
      seniorityNote: sen.reason || analysis.seniority?.reason || '',
      seniorityScore: sen.score,
      seniorityAsked: sen.asked,
      channel: elig.channel,
      eligibility: elig.verdict,
      eligibilityShape: elig.shape,
      eligibilityReason: elig.reason,
      ageDays: fr.ageDays,
      freshnessLabel: fr.label,
      isIndia,
      isRemote,
      descriptionExcerpt: (j.description || '').slice(0, 600),
    });
    if (viaBoard) stats.fromAggregators++;
  }
}

// --- spray-poster guard ----------------------------------------------------
// Some employers duplicate one req across every country they can name. Bjak's
// Ashby board carries 3,072 postings, 424 of them mobile-titled, at roughly 20
// per country — an "India" tag there means the row exists, not that they are
// hiring in India. Left alone, five near-identical Bjak rows crowd out the real
// matches in a digest.
const boardSize = new Map();
for (const b of boards) if (b && !b.__error) boardSize.set(b.company.name, b.jobs.length);

const SPRAY_BOARD = 400;   // postings on one board
const PER_COMPANY = 3;     // rows any single employer may contribute
const perCompany = new Map();
const crowdedOut = [];

for (const m of matches) {
  const size = boardSize.get(m.company) || 0;
  m.sprayPosted = size >= SPRAY_BOARD;
  if (m.sprayPosted) m.blockers = [...(m.blockers || []), `Employer board carries ${size} postings — the same req is duplicated across many countries. Verify this is a real India role.`];
}

const capped = [];
for (const m of matches) {
  const n = perCompany.get(m.company) || 0;
  if (n >= PER_COMPANY) { crowdedOut.push(`${m.company} — ${m.title}`); continue; }
  perCompany.set(m.company, n + 1);
  capped.push(m);
}
matches.length = 0;
matches.push(...capped);

// --- dedupe against durable state ------------------------------------------
const statePath = path.join(ROOT, 'state/seen-urls.json');
let seen = { urls: {}, lastRun: null };
if (fs.existsSync(statePath)) { try { seen = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { /* corrupt state is not fatal */ } }
seen.urls = seen.urls || {};

// --exclude-urls <file>: one URL per line (blank lines and #comments ignored).
// The cloud routine uses this to dedupe against roles it has already emailed,
// which lets it run without any write access back to the repo.
let excluded = new Set();
if (args['exclude-urls'] && args['exclude-urls'] !== true) {
  const p = path.isAbsolute(args['exclude-urls']) ? args['exclude-urls'] : path.resolve(process.cwd(), args['exclude-urls']);
  if (fs.existsSync(p)) {
    excluded = new Set(
      fs.readFileSync(p, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#')),
    );
    say(`  excluding ${excluded.size} previously-reported URLs from ${path.basename(p)}`);
  } else {
    say(`  ! --exclude-urls file not found: ${p} (continuing without it)`);
  }
}

const fresh = matches.filter((m) => !excluded.has(m.url) && (args.all || !seen.urls[m.url]));

// Rank. Default is FRESHNESS FIRST, quality second — Ankur's observation that a
// 70% fit posted three hours ago beats a 90% fit posted six days ago, because on
// competitive remote roles the queue ahead of you matters more than the margin
// of fit. Pass --rank quality to invert it.
const recRank = { apply: 3, review: 2, skip: 1 };
const priRank = { high: 3, medium: 2, low: 1 };
const ageOf = (m) => (m.ageDays === null || m.ageDays === undefined ? 999 : m.ageDays);
const byQuality = (a, b) =>
  (recRank[b.recommendation] - recRank[a.recommendation]) ||
  (priRank[b.companyPriority] - priRank[a.companyPriority]) ||
  (b.archetypeScore - a.archetypeScore);
const rankMode = (args.rank && args.rank !== true) ? String(args.rank) : 'freshness';
fresh.sort(rankMode === 'quality'
  ? byQuality
  : (a, b) => (recRank[b.recommendation] - recRank[a.recommendation]) || (ageOf(a) - ageOf(b)) || byQuality(a, b));

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
  if (stats.fromAggregators) say(`  ${stats.fromAggregators} of the matches came from aggregator boards (verify those on the posting)`);
  say(`  funnel: age ${stats.afterAge} → role ${stats.afterRole} → seniority ${stats.afterSeniority} → stack ${stats.afterStack} → eligible ${stats.afterLocation} → fresh(${maxAgeDays}d) ${stats.afterFreshness}`);
  const byChan = out.matches.reduce((m, x) => ((m[x.channel || 'unknown'] = (m[x.channel || 'unknown'] || 0) + 1), m), {});
  say(`  channels: ${Object.entries(byChan).map(([k, v]) => k + ' ' + v).join(' · ') || 'none'}`);
  say(`  new since last run: ${stats.reported}${args.all ? ' (--all: state ignored)' : ''}\n`);
  for (const m of out.matches.slice(0, 40)) {
    const flag = m.recommendation === 'apply' ? '✔' : m.recommendation === 'review' ? '~' : '·';
    say(`  ${flag} ${m.company} — ${m.title}`);
    const chan = m.channel === 'remote-global' ? 'GLOBAL' : m.channel === 'india' ? 'INDIA ' : '  ?   ';
    say(`     [${chan}] ${m.location || 'location?'} · ${m.freshnessLabel} · ${m.archetype} (${m.archetypeScore})`);
    say(`     ${m.url}`);
    say(`     send: ${m.resumeLabel} resume (${m.resume}) - ${m.resumeConfidence} confidence`);
    if (m.viaBoard) say(`     via ${m.viaBoard} - board tags are unreliable, verify eligibility on the posting`);
    if (m.eligibility === 'unconfirmed') say(`     ~ ${m.eligibilityReason}`);
    if (m.blockers.length) say(`     ! ${m.blockers.join(' | ')}`);
  }
  if (out.matches.length > 40) say(`\n  ... and ${out.matches.length - 40} more in data/jobs.raw.json`);
  if (errors.length) { say('\n  board errors:'); for (const e of errors) say(`    - ${e}`); }
  say('');
}
