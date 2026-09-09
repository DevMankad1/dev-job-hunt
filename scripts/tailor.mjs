#!/usr/bin/env node
/**
 * tailor.mjs — auto-adapt the resume to one job description.
 *
 *   node scripts/tailor.mjs --jd path/to/jd.txt
 *   node scripts/tailor.mjs --jd-text "paste the whole JD here"
 *   node scripts/tailor.mjs --url https://boards.greenhouse.io/acme/jobs/123
 *   node scripts/tailor.mjs --jd jd.txt --company Acme --title "Flutter Engineer"
 *
 * Options
 *   --archetype <id>    force an archetype instead of detecting one
 *   --max-bullets <n>   cap bullets per role/project (logs exactly what it cut)
 *   --drop-tags a,b,c   omit content carrying these tags (a targeting choice —
 *                       logs every omission into the match report)
 *   --formats tex,md,txt   default: tex,md,txt
 *   --out <dir>         default: resume/tailored
 *   --name <base>       output basename; default: <company>-<title>
 *   --quiet             suppress the console summary
 *
 * Writes <base>.tex, <base>.md, <base>.txt, <base>.report.md, <base>.report.json
 * and prints a one-screen summary.
 *
 * HONESTY: this script can only reorder and re-emphasise what already exists in
 * resume/resume-content.json. It cannot author a new fact. If a JD wants
 * something you do not have, the report says so under "Real gaps".
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBoard } from '../adapters/ats.mjs';
import { analyseJd } from './lib/jd.mjs';
import { buildPlan, verifyHonesty } from './lib/tailor-core.mjs';
import { renderTex, renderMd, renderTxt, renderReportMd } from './lib/render.mjs';
import { slug } from './lib/text.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) continue;
    const key = t.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) a[key] = true;
    else { a[key] = next; i++; }
  }
  return a;
}

/**
 * Pull a posting through its ATS's public API rather than scraping the page.
 * Ashby, Greenhouse and Lever all serve their job pages as JS shells, so
 * fetching the HTML yields an empty description and a 0% keyword match.
 * Returns {text, location, title} or null when the URL is not a known ATS.
 */
async function loadViaAts(url) {
  const patterns = [
    { re: /jobs\.ashbyhq\.com\/([^/?#]+)\/([0-9a-f-]{16,})/i, provider: 'ashby' },
    { re: /(?:job-boards|boards)\.greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/i, provider: 'greenhouse' },
    { re: /jobs\.lever\.co\/([^/?#]+)\/([0-9a-f-]{16,})/i, provider: 'lever' },
  ];
  for (const { re, provider } of patterns) {
    const m = url.match(re);
    if (!m) continue;
    const [, slug, jobRef] = m;
    const jobs = await fetchBoard(provider, slug);
    const hit = jobs.find((j) => String(j.id).includes(jobRef) || String(j.url || '').includes(jobRef));
    if (!hit) throw new Error(`${provider}/${slug} board loaded but posting ${jobRef} is not on it — it may have closed.`);
    if (!hit.description) throw new Error(`${provider}/${slug} returned no description for ${jobRef}.`);
    return { text: `${hit.title}\n${hit.location}\n\n${hit.description}`, location: hit.location, title: hit.title };
  }
  return null;
}

async function loadJd(args) {
  if (args['jd-text']) return { text: String(args['jd-text']) };
  if (args.jd) {
    const p = path.isAbsolute(args.jd) ? args.jd : path.resolve(process.cwd(), args.jd);
    return { text: fs.readFileSync(p, 'utf8') };
  }
  if (args.url) {
    const viaAts = await loadViaAts(args.url);
    if (viaAts) return viaAts;

    const res = await fetch(args.url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; job-hunt/1.0)' } });
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${args.url}`);
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    return { text };
  }
  // stdin fallback
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    const s = Buffer.concat(chunks).toString('utf8').trim();
    if (s) return { text: s };
  }
  throw new Error('No JD supplied. Use --jd <file>, --jd-text "...", --url <link>, or pipe the JD on stdin.');
}

async function main() {
  const args = parseArgs(process.argv);
  const content = readJson('resume/resume-content.json');
  const profile = readJson('profile.json');
  const keywords = readJson('data/keywords.json');

  const jd = await loadJd(args);
  const jdText = jd.text;
  if (jdText.trim().length < 120) {
    console.error('! JD is very short (<120 chars). Detection will be unreliable — paste the full posting.');
  }

  const analysis = analyseJd({
    jdText,
    title: args.title || jd.title || '',
    location: jd.location || '',
    company: args.company || '',
    keywords,
    profile,
  });

  // --archetype overrides detection
  if (args.archetype && args.archetype !== true) {
    const forced = (keywords.archetypes || []).find((a) => a.id === args.archetype);
    if (!forced) {
      console.error(`! Unknown archetype "${args.archetype}". Known: ${(keywords.archetypes || []).map((a) => a.id).join(', ')}`);
      process.exit(2);
    }
    analysis.bestArchetype = { id: forced.id, displayName: forced.displayName, score: 999, archetype: forced, titleHits: [], mustHits: [], niceHits: [], atsHits: [] };
  }

  const maxBullets = args['max-bullets'] && args['max-bullets'] !== true ? parseInt(args['max-bullets'], 10) : null;
  const dropTags = (args['drop-tags'] && args['drop-tags'] !== true)
    ? String(args['drop-tags']).split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const plan = buildPlan({ content, analysis, profile, maxBullets, dropTags });

  const honesty = verifyHonesty(plan, content);
  if (!honesty.ok) {
    console.error('\nREFUSED — the tailored output would assert something not in resume-content.json:');
    for (const v of honesty.violations) console.error('  - ' + v);
    console.error('\nFix resume-content.json (or the engine) rather than shipping this.\n');
    process.exit(3);
  }

  const outDir = path.resolve(ROOT, (args.out && args.out !== true) ? args.out : 'resume/tailored');
  fs.mkdirSync(outDir, { recursive: true });

  const base = (args.name && args.name !== true)
    ? slug(args.name)
    : slug([args.company || analysis.company || '', args.title || analysis.title || plan.archetypeId].filter(Boolean).join('-')) || plan.archetypeId;

  const formats = String(args.formats && args.formats !== true ? args.formats : 'tex,md,txt').split(',').map((s) => s.trim());
  const written = [];

  if (formats.includes('tex')) { const p = path.join(outDir, `${base}.tex`); fs.writeFileSync(p, renderTex(plan)); written.push(p); }
  if (formats.includes('md'))  { const p = path.join(outDir, `${base}.md`);  fs.writeFileSync(p, renderMd(plan));  written.push(p); }
  if (formats.includes('txt')) { const p = path.join(outDir, `${base}.txt`); fs.writeFileSync(p, renderTxt(plan)); written.push(p); }

  const meta = { company: args.company || analysis.company, title: args.title || analysis.title, url: args.url && args.url !== true ? args.url : null, outBase: base };
  const reportMd = renderReportMd(plan, meta);
  fs.writeFileSync(path.join(outDir, `${base}.report.md`), reportMd);
  fs.writeFileSync(path.join(outDir, `${base}.report.json`), JSON.stringify({ meta, report: plan.report, plan: stripPlan(plan) }, null, 2));
  // Full plan, for scripts/render_pdf.py. Everything in here came from
  // resume-content.json — it is a selection and ordering of that file, never
  // anything new.
  fs.writeFileSync(path.join(outDir, `${base}.plan.json`), JSON.stringify({
    title: plan.title, header: plan.header, summary: plan.summary,
    skillCategories: plan.skillCategories.map((c) => ({ label: c.label, items: c.items.map((i) => ({ name: i.name })) })),
    agentic: { label: plan.agentic.label, intro: plan.agentic.intro, bullets: plan.agentic.bullets.map((b) => ({ text: b.text })) },
    experience: plan.experience.map((r) => ({ role: r.role, company: r.company, location: r.location, start: r.start, end: r.end, durationLabel: r.durationLabel, bullets: r.bullets.map((b) => ({ text: b.text })) })),
    projects: plan.projects.map((p) => ({ name: p.name, region: p.region, stackLine: p.stackLine, bullets: p.bullets.map((b) => ({ text: b.text })) })),
    education: plan.education, certifications: plan.certifications,
    publications: plan.publications, sectionOrder: plan.sectionOrder,
  }, null, 2));
  written.push(path.join(outDir, `${base}.report.md`));

  // Keep the JD alongside the output so the pairing is auditable later.
  fs.writeFileSync(path.join(outDir, `${base}.jd.txt`), jdText);

  if (!args.quiet) {
    const r = plan.report;
    const bar = (p) => '█'.repeat(Math.round(p / 5)).padEnd(20, '░');
    console.log('');
    console.log(`  ${meta.company || '(company?)'} — ${meta.title || '(title?)'}`);
    console.log(`  ${'-'.repeat(60)}`);
    console.log(`  Archetype        ${r.archetype}  (score ${r.archetypeScore}${r.runnerUpArchetype ? `, runner-up ${r.runnerUpArchetype}` : ''})`);
    console.log(`  ATS coverage     ${bar(r.atsCoverage.percent)} ${r.atsCoverage.percent}%  (${r.atsCoverage.covered}/${r.atsCoverage.jdRelevantKeywords})`);
    console.log(`  Recommendation   ${r.recommendation.toUpperCase()}`);
    if (r.blockers.length) for (const b of r.blockers) console.log(`    ! ${b}`);
    if (r.honestGaps.length) console.log(`  Real gaps        ${r.honestGaps.length} — see the report, do not claim these`);
    console.log(`  Agentic section  ${plan.agentic.placement}`);
    if (r.dropped?.length) console.log(`  Omitted          ${r.dropped.length} off-target items (listed in the report)`);
    console.log(`  Skills order     ${plan.skillCategories.map((c) => c.label).join(' > ')}`);
    console.log('');
    for (const w of written) console.log(`  wrote  ${path.relative(ROOT, w)}`);
    console.log('');
  }
}

function stripPlan(plan) {
  return {
    archetypeId: plan.archetypeId,
    title: plan.title,
    summaryParts: plan.summaryParts,
    skillOrder: plan.skillCategories.map((c) => c.label),
    agenticPlacement: plan.agentic.placement,
    projectOrder: plan.projects.map((p) => p.name),
    experienceBulletOrder: plan.experience.map((r) => r.bullets.map((b) => b.id)),
    sectionOrder: plan.sectionOrder,
  };
}

main().catch((e) => { console.error('tailor.mjs failed:', e.message); process.exit(1); });
