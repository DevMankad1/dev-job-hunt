#!/usr/bin/env node
/**
 * verify_ats.mjs — prove every claimed ATS endpoint actually returns live jobs.
 *
 *   node scripts/verify_ats.mjs                     # verify data/companies.json in place
 *   node scripts/verify_ats.mjs --in <file>         # verify some other JSON array
 *   node scripts/verify_ats.mjs --write             # write results back (tier + lastVerified)
 *   node scripts/verify_ats.mjs --concurrency 6
 *
 * Tiering, applied on --write:
 *   A = public ATS API answered with >0 postings   (machine-scannable every run)
 *   B = has a careers URL but no working ATS API   (WebFetch sweep)
 *   C = neither resolved                            (manual only)
 *
 * A company is NEVER deleted for failing — it is downgraded with a dated note,
 * because an ATS can be temporarily empty or rate-limited.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBoard, hasAdapter } from '../adapters/ats.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); }
      catch (e) { out[idx] = { error: e.message }; }
    }
  });
  await Promise.all(workers);
  return out;
}

const args = parseArgs(process.argv);
const inPath = path.resolve(ROOT, (args.in && args.in !== true) ? args.in : 'data/companies.json');
const doc = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const companies = Array.isArray(doc) ? doc : (doc.companies || []);
const today = new Date().toISOString().slice(0, 10);

const candidates = companies.filter((c) => hasAdapter(c.atsProvider) && c.atsSlug);
console.log(`Verifying ${candidates.length} claimed ATS endpoints (of ${companies.length} companies)...\n`);

const conc = parseInt((args.concurrency && args.concurrency !== true) ? args.concurrency : '6', 10);
const results = await pool(candidates, conc, async (c) => {
  const t0 = Date.now();
  try {
    const jobs = await fetchBoard(c.atsProvider, c.atsSlug);
    return { ok: jobs.length > 0, count: jobs.length, ms: Date.now() - t0, sample: jobs.slice(0, 2).map((j) => j.title) };
  } catch (e) {
    return { ok: false, count: 0, ms: Date.now() - t0, error: e.message };
  }
});

let pass = 0, empty = 0, fail = 0;
results.forEach((r, i) => {
  const c = candidates[i];
  const tag = r.ok ? 'PASS' : (r.error ? 'FAIL' : 'EMPTY');
  if (r.ok) pass++; else if (r.error) fail++; else empty++;
  const detail = r.ok ? `${String(r.count).padStart(4)} jobs` : (r.error ? r.error.slice(0, 34) : '   0 jobs');
  console.log(`  ${tag.padEnd(6)}${c.atsProvider.padEnd(16)}${String(c.atsSlug).padEnd(28)}${detail}  ${c.name}`);
});

console.log(`\n  ${pass} live · ${empty} reachable-but-empty · ${fail} broken\n`);

if (args.write) {
  const byName = new Map(candidates.map((c, i) => [c.name, results[i]]));
  for (const c of companies) {
    const r = byName.get(c.name);
    if (r && r.ok) {
      c.tier = 'A';
      c.atsVerified = true;
      c.lastVerified = today;
      c.openRoleCount = r.count;
      delete c.verifyNote;
    } else if (r) {
      c.tier = c.careersUrl ? 'B' : 'C';
      c.atsVerified = false;
      c.lastVerified = today;
      c.verifyNote = `${today}: ${c.atsProvider}/${c.atsSlug} ${r.error ? `failed (${r.error})` : 'returned 0 postings'} — downgraded, not deleted. Re-check before removing.`;
    } else {
      c.tier = c.tier || (c.careersUrl ? 'B' : 'C');
      c.atsVerified = c.atsVerified ?? false;
    }
  }
  const out = Array.isArray(doc) ? companies : { ...doc, companies, _lastVerified: today };
  fs.writeFileSync(inPath, JSON.stringify(out, null, 2) + '\n');
  const counts = companies.reduce((m, c) => ((m[c.tier] = (m[c.tier] || 0) + 1), m), {});
  console.log(`  wrote ${path.relative(ROOT, inPath)} — tiers: ${JSON.stringify(counts)}\n`);
}
