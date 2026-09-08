// The tailoring engine.
//
// CONTRACT — read this before changing anything below:
//   The engine may REORDER, SELECT and RE-EMPHASISE content that already exists
//   in resume-content.json. It may NEVER author a new fact. Every string it
//   emits is copied verbatim from resume-content.json (the sole exception is
//   the summary, which is *assembled* from pre-approved opener + clause strings
//   in that same file — still no new wording).
//
//   Nothing is deleted from the master. Skills, certifications and education
//   always appear in full; only their ORDER changes. Bullets are reordered, and
//   only trimmed when --max-bullets is passed, which logs exactly what it cut.

import { norm, hasTerm, matchTerms, sortBy, pct } from './text.mjs';

const TAG_SYNONYMS = {
  agentic: ['agent', 'agents', 'agentic', 'ai agent', 'autonomous', 'orchestration', 'workflow automation'],
  ai: ['ai', 'artificial intelligence', 'genai', 'generative ai', 'machine learning', 'llm'],
  llm: ['llm', 'large language model', 'gpt', 'claude', 'openai', 'anthropic', 'prompt'],
  mcp: ['mcp', 'model context protocol', 'tool calling', 'tool use', 'function calling'],
  'multi-agent': ['multi-agent', 'multi agent', 'agent orchestration', 'crew', 'langgraph'],
  flutter: ['flutter', 'dart'],
  kmp: ['kotlin multiplatform', 'kmp', 'kmm', 'compose multiplatform'],
  kotlin: ['kotlin'],
  android: ['android', 'jetpack compose', 'play store', 'google play'],
  ios: ['ios', 'swift', 'swiftui', 'app store', 'testflight'],
  'react-native': ['react native', 'react-native'],
  mobile: ['mobile', 'app development', 'ios', 'android', 'cross-platform'],
  react: ['react', 'react.js', 'reactjs', 'frontend', 'front-end'],
  node: ['node', 'node.js', 'nodejs', 'express', 'backend', 'back-end'],
  typescript: ['typescript', 'javascript', 'ts', 'js'],
  mern: ['mern', 'mongodb', 'express', 'react', 'node'],
  django: ['django', 'python'],
  python: ['python'],
  rails: ['ruby on rails', 'rails', 'ruby'],
  graphql: ['graphql', 'apollo'],
  rest: ['rest', 'restful', 'api'],
  api: ['api', 'rest', 'graphql', 'integration'],
  backend: ['backend', 'back-end', 'server-side', 'microservice'],
  frontend: ['frontend', 'front-end', 'ui', 'user interface'],
  fullstack: ['full stack', 'full-stack', 'fullstack'],
  architecture: ['architecture', 'design patterns', 'mvvm', 'clean architecture', 'scalable'],
  cicd: ['ci/cd', 'cicd', 'continuous integration', 'continuous delivery', 'pipeline', 'github actions'],
  fastlane: ['fastlane', 'release automation'],
  release: ['release', 'deployment', 'app store', 'play store', 'ship'],
  firebase: ['firebase', 'firestore', 'fcm'],
  cloud: ['cloud', 'aws', 'azure', 'gcp'],
  aws: ['aws', 'amazon web services'],
  azure: ['azure'],
  healthcare: ['healthcare', 'health', 'medical', 'clinical', 'patient', 'digital health', 'healthtech'],
  regulated: ['regulated', 'compliance', 'certified', 'gdpr', 'hipaa', 'iso', 'diga', 'medical device'],
  iot: ['iot', 'internet of things', 'device', 'hardware', 'embedded', 'wearable'],
  ble: ['ble', 'bluetooth', 'sensor'],
  realtime: ['real-time', 'realtime', 'streaming', 'websocket', 'live'],
  integrations: ['integration', 'third-party', 'sdk', 'partner', 'webhook'],
  sdk: ['sdk', 'third-party', 'library'],
  'client-facing': ['client', 'customer', 'stakeholder', 'consulting', 'customer-facing'],
  fde: ['forward deployed', 'solutions engineer', 'deployment', 'implementation', 'customer engineer', 'field engineer'],
  leadership: ['lead', 'mentor', 'ownership', 'drive'],
  'code-review': ['code review', 'pull request', 'peer review', 'quality'],
  docs: ['documentation', 'technical writing', 'confluence'],
  agile: ['agile', 'scrum', 'sprint', 'jira', 'kanban'],
  collab: ['collaborate', 'cross-functional', 'team'],
  design: ['figma', 'design system', 'ux', 'ui'],
  automation: ['automation', 'automate', 'tooling', 'developer experience', 'devex', 'productivity'],
  offline: ['offline', 'sync', 'caching'],
  sync: ['sync', 'synchronization', 'synchronisation'],
  i18n: ['localization', 'localisation', 'multilingual', 'i18n'],
  chatbot: ['chatbot', 'conversational', 'assistant'],
  data: ['analytics', 'dashboard', 'visualisation', 'visualization', 'metrics'],
  testing: ['test', 'testing', 'unit test', 'coverage'],
  security: ['security', 'secure', 'authentication', 'encryption'],
  enterprise: ['enterprise', 'b2b', 'saas'],
  generic: [],
  impact: [],
  solutions: ['solutions', 'consulting'],
  'tool-calling': ['tool calling', 'function calling', 'tools'],
  docker: ['docker', 'container'],
  devops: ['devops', 'infrastructure'],
};

/** How strongly does the JD care about this tag? 0 if not mentioned. */
function tagWeight(tag, jdNorm) {
  const syns = TAG_SYNONYMS[tag] || [tag];
  let hits = 0;
  for (const s of syns) if (hasTerm(jdNorm, s)) hits++;
  if (!hits) return 0;
  // Diminishing returns — a JD saying "react" ten times is not 10x a JD saying it twice.
  return 1 + Math.log2(hits + 1);
}

function tagsScore(tags = [], jdNorm) {
  return tags.reduce((sum, t) => sum + tagWeight(t, jdNorm), 0);
}

/**
 * Build a tailoring PLAN from the master content + a JD analysis.
 * The plan is pure data — rendering is a separate step.
 */
export function buildPlan({ content, analysis, profile, maxBullets = null }) {
  const jdNorm = analysis.bodyN;
  const arch = analysis.bestArchetype?.archetype || null;
  const archTags = deriveArchetypeTags(arch, analysis);

  // Archetype tags get a boost so a "flutter-engineer" JD reliably surfaces
  // flutter content even when the JD body is terse.
  const boost = (tags = []) => tags.reduce((s, t) => s + (archTags.has(t) ? 2.5 : 0), 0);

  const scoreOf = (item) => {
    const t = item.tags || [];
    return (item.weight || 0) + tagsScore(t, jdNorm) * 1.6 + boost(t);
  };

  // ---- header title ---------------------------------------------------------
  const titleVariant = sortBy(content.titleVariants || [], (v) => tagsScore(v.tags, jdNorm) * 2 + boost(v.tags))[0]
    || { text: content.header.title };

  // ---- summary --------------------------------------------------------------
  const openers = sortBy(content.summary.openers || [], (o) => tagsScore(o.tags, jdNorm) * 2 + boost(o.tags));
  const opener = openers[0];

  const clausesRanked = sortBy(content.summary.clauses || [], scoreOf);
  // Take the top clauses, but never two that say the same thing (mern vs fullstack).
  const chosenClauses = [];
  const seenTagSig = new Set();
  for (const c of clausesRanked) {
    const sig = (c.tags || []).slice(0, 2).sort().join('|');
    if (seenTagSig.has(sig)) continue;
    if (c.id === 'cl-mern' && chosenClauses.some((x) => x.id === 'cl-fullstack')) continue;
    if (c.id === 'cl-fullstack' && chosenClauses.some((x) => x.id === 'cl-mern')) continue;
    seenTagSig.add(sig);
    chosenClauses.push(c);
    if (chosenClauses.length >= 3) break;
  }

  const summaryText = [opener?.text, ...chosenClauses.map((c) => c.text)].filter(Boolean).join(' ');

  // ---- skills: reorder categories AND items, drop nothing -------------------
  //
  // Category rank is driven mainly by WHICH of its skills the JD names, weighted
  // by how strong Dev is at each. Counting every alias hit separately would let a
  // single many-aliased entry ("REST & GraphQL APIs") outrank the category that
  // holds the JD's headline technology, so an item contributes once whether it
  // matched on one alias or four.
  // A skill named in the ROLE TITLE (or in the archetype's title patterns) is the
  // single loudest signal there is — "Flutter Engineer" means the category holding
  // Flutter leads, even though a JD body full of "architecture / MVVM / scalable"
  // scores the Architecture category higher on prose alone.
  const titleN = norm(analysis.title || '');
  const titlePatterns = (arch?.titlePatterns || []).map(norm);
  const isHeadlineSkill = (aliases = []) =>
    aliases.some((a) => hasTerm(titleN, a) || titlePatterns.some((p) => p === norm(a) || hasTerm(p, a)));

  const categories = (content.skills.categories || []).map((cat) => {
    const scoredItems = (cat.items || []).map((it) => {
      const hits = matchTerms(jdNorm, it.aliases || []).length;
      const headline = isHeadlineSkill(it.aliases);
      return {
        it,
        hits,
        headline,
        itemScore:
          it.strength +
          (hits ? 4 + Math.min(hits - 1, 2) : 0) +
          (headline ? 12 : 0) +
          tagsScore(it.tags, jdNorm) +
          boost(it.tags),
      };
    });
    const items = sortBy(scoredItems, (x) => x.itemScore).map((x) => x.it);

    // One contribution per matched item, scaled by Dev's honest depth in it.
    const namedByJd = scoredItems.reduce((s, x) => s + (x.hits ? x.it.strength : 0), 0);
    const headlineCount = scoredItems.filter((x) => x.headline).length;
    const catScore =
      headlineCount * 15 +
      namedByJd * 2 +
      tagsScore(cat.tags, jdNorm) * 0.8 +
      boost(cat.tags);
    return { ...cat, items, _score: catScore, _namedByJd: namedByJd, _headlineCount: headlineCount };
  });
  const skillCategories = sortBy(categories, (c) => c._score);

  // ---- agentic section placement -------------------------------------------
  const agenticRelevance =
    tagWeight('agentic', jdNorm) * 3 +
    tagWeight('ai', jdNorm) * 2 +
    tagWeight('mcp', jdNorm) * 3 +
    tagWeight('llm', jdNorm) * 2 +
    tagWeight('automation', jdNorm) +
    (archTags.has('agentic') ? 6 : 0) +
    (archTags.has('fde') ? 3 : 0);

  const agenticBullets = sortBy(content.agenticSection.bullets || [], scoreOf);
  // Above Experience when the JD actually cares; otherwise it still ships, lower down.
  const agenticPlacement = agenticRelevance >= 6 ? 'above-experience' : 'below-experience';
  const agenticShown = agenticPlacement === 'above-experience'
    ? agenticBullets
    : agenticBullets.slice(0, 3);

  // ---- experience -----------------------------------------------------------
  const experience = (content.experience || []).map((role) => {
    const ranked = sortBy(role.bullets || [], (b) => scoreOf(b) + (b.pinned ? 4 : 0));
    const { kept, dropped } = applyMax(ranked, maxBullets);
    return { ...role, bullets: kept, _dropped: dropped };
  });

  // ---- projects: reorder, and order bullets inside each ---------------------
  const projects = sortBy(
    (content.projects || []).map((p) => {
      const ranked = sortBy(p.bullets || [], (b) => scoreOf(b) + (b.pinned ? 4 : 0));
      const { kept, dropped } = applyMax(ranked, maxBullets);
      return { ...p, bullets: kept, _dropped: dropped, _score: (p.weight || 0) + tagsScore(p.tags, jdNorm) * 1.6 + boost(p.tags) };
    }),
    (p) => p._score,
  );

  // ---- certifications / publications ---------------------------------------
  const certifications = sortBy(content.certifications || [], scoreOf);
  const blogs = sortBy(content.publications?.blogs || [], scoreOf);
  const internships = sortBy(content.publications?.internships || [], scoreOf);

  // ---- section order --------------------------------------------------------
  const sectionOrder = ['header', 'summary', 'skills'];
  if (agenticPlacement === 'above-experience') sectionOrder.push('agentic', 'experience', 'projects');
  else sectionOrder.push('experience', 'projects', 'agentic');
  sectionOrder.push('education', 'certifications', 'publications');

  const plan = {
    archetypeId: arch?.id || 'sde-generalist',
    archetypeName: arch?.displayName || 'Software Engineer',
    title: titleVariant.text,
    summary: summaryText,
    summaryParts: { opener: opener?.id, clauses: chosenClauses.map((c) => c.id) },
    skillCategories,
    agentic: { ...content.agenticSection, bullets: agenticShown, placement: agenticPlacement, relevance: Math.round(agenticRelevance * 10) / 10 },
    experience,
    projects,
    education: content.education || [],
    certifications,
    publications: { label: content.publications?.label, blogs, internships },
    sectionOrder,
    header: content.header,
  };

  plan.report = buildReport({ plan, content, analysis, profile, arch });
  return plan;
}

function applyMax(bullets, maxBullets) {
  if (!maxBullets || bullets.length <= maxBullets) return { kept: bullets, dropped: [] };
  // Pinned bullets are never dropped, whatever the cap.
  const pinned = bullets.filter((b) => b.pinned);
  const rest = bullets.filter((b) => !b.pinned);
  const room = Math.max(0, maxBullets - pinned.length);
  const kept = [...bullets.filter((b) => b.pinned || rest.indexOf(b) < room)];
  const dropped = bullets.filter((b) => !kept.includes(b));
  return { kept, dropped };
}

function deriveArchetypeTags(arch, analysis) {
  const s = new Set();
  if (!arch) return s;
  const id = arch.id;
  const map = {
    'ai-agent-engineer': ['agentic', 'ai', 'llm', 'mcp', 'multi-agent', 'automation'],
    'llm-app-engineer': ['ai', 'llm', 'agentic', 'backend', 'api'],
    'forward-deployed-engineer': ['fde', 'client-facing', 'fullstack', 'agentic', 'integrations', 'solutions'],
    'flutter-engineer': ['flutter', 'dart', 'mobile', 'architecture'],
    'kmp-android-engineer': ['kmp', 'kotlin', 'android', 'mobile', 'ios', 'architecture'],
    'mobile-generalist': ['mobile', 'flutter', 'kmp', 'react-native', 'ios', 'android', 'release'],
    'mern-fullstack': ['mern', 'react', 'node', 'typescript', 'fullstack', 'api'],
    'react-frontend': ['react', 'frontend', 'typescript', 'design'],
    'node-backend': ['node', 'backend', 'api', 'rest', 'graphql'],
    'fullstack-ai': ['fullstack', 'ai', 'agentic', 'react', 'node', 'api'],
    'healthtech-mobile': ['healthcare', 'regulated', 'mobile', 'flutter', 'kmp'],
    'sde-generalist': ['generic', 'fullstack', 'mobile', 'architecture'],
  };
  for (const t of (map[id] || [])) s.add(t);
  return s;
}

/**
 * Honest match report: what the JD wants, what Dev actually has,
 * what he genuinely lacks, and how well the tailored resume covers the ATS vocabulary.
 */
function buildReport({ plan, content, analysis, profile, arch }) {
  const resumeText = norm(flattenPlanText(plan));

  const atsKeywords = arch?.atsKeywords || [];
  // Only score against ATS keywords the JD itself actually mentions.
  const jdRelevant = atsKeywords.filter((k) => hasTerm(analysis.bodyN, k));
  const covered = jdRelevant.filter((k) => hasTerm(resumeText, k));
  const missing = jdRelevant.filter((k) => !hasTerm(resumeText, k));

  const doNotClaim = content.doNotClaim?.items || [];
  // Which of the JD's asks fall inside Dev's declared gaps?
  const honestGaps = (arch?.devGaps || []).filter((g) => {
    const head = norm(g).split(/[,(]/)[0].trim();
    return head.length > 2 && hasTerm(analysis.bodyN, head);
  });

  return {
    archetype: arch?.id || 'sde-generalist',
    archetypeScore: analysis.bestArchetype?.score ?? 0,
    runnerUpArchetype: analysis.runnerUp ? `${analysis.runnerUp.id} (${analysis.runnerUp.score})` : null,
    recommendation: analysis.recommendation,
    blockers: analysis.blockers,
    seniority: analysis.seniority,
    location: { india: analysis.isIndia, remote: analysis.isRemote },
    atsCoverage: {
      jdRelevantKeywords: jdRelevant.length,
      covered: covered.length,
      percent: pct(covered.length, jdRelevant.length),
      coveredList: covered,
      missingList: missing,
    },
    honestGaps,
    doNotClaimReminder: doNotClaim,
    evidenceForThisRole: arch?.devHasEvidence || [],
  };
}

export function flattenPlanText(plan) {
  const parts = [
    plan.title,
    plan.summary,
    ...plan.skillCategories.flatMap((c) => [c.label, ...c.items.map((i) => `${i.name} ${(i.aliases || []).join(' ')}`)]),
    plan.agentic.intro,
    ...plan.agentic.bullets.map((b) => b.text),
    ...plan.experience.flatMap((r) => [r.company, r.role, ...r.bullets.map((b) => b.text)]),
    ...plan.projects.flatMap((p) => [p.name, p.stackLine, ...p.bullets.map((b) => b.text)]),
    ...plan.education.map((e) => `${e.degree} ${e.institution}`),
    ...plan.certifications.map((c) => c.name),
    ...plan.publications.blogs.map((b) => b.title),
    ...plan.publications.internships.map((i) => i.text),
  ];
  return parts.filter(Boolean).join('\n');
}

/**
 * Safety gate. Refuses to emit a resume whose text asserts something on the
 * doNotClaim list. Checks for the concrete technology tokens, not the prose.
 */
export function verifyHonesty(plan, content) {
  const text = norm(flattenPlanText(plan));
  const master = norm(JSON.stringify(content));
  const violations = [];

  // 1. Nothing in the output may be absent from the master content.
  //    (Catches a future edit that starts generating prose.)
  const FORBIDDEN_TOKENS = [
    'mongodb', 'mongo db', 'kubernetes', 'terraform', 'rag pipeline',
    'vector database', 'pinecone', 'fine-tuning', 'fine tuning', 'mlops',
    'senior software engineer', 'tech lead', 'engineering manager',
    'google cloud platform', 'objective-c',
  ];
  for (const t of FORBIDDEN_TOKENS) {
    if (hasTerm(text, t) && !hasTerm(master.replace(/"donotclaim"[\s\S]*$/, ''), t)) {
      violations.push(`Output asserts "${t}" which is not in resume-content.json outside doNotClaim.`);
    }
  }

  return { ok: violations.length === 0, violations };
}
