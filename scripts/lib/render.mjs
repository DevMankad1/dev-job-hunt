// plan -> .tex / .md / .txt
// Rendering only. Every string here comes from the plan, which came from
// resume-content.json. No content decisions are made in this file.

import { tex, md, txt } from './text.mjs';

// ---------------------------------------------------------------- LaTeX ----

const PREAMBLE = String.raw`\documentclass[a4paper,10pt]{article}
\usepackage[left=0.55in,right=0.55in,top=0.5in,bottom=0.5in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{enumitem}
\usepackage{titlesec}
\usepackage{hyperref}
\usepackage{xcolor}
\usepackage{helvet}
\renewcommand{\familydefault}{\sfdefault}

\definecolor{accent}{HTML}{1F3A5F}
\hypersetup{colorlinks=true, urlcolor=accent, linkcolor=accent}

\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlist[itemize]{leftmargin=1.1em, itemsep=1.2pt, topsep=2pt, parsep=0pt}

\titleformat{\section}{\normalsize\bfseries\color{accent}}{}{0em}{}[\vspace{-0.7em}\rule{\linewidth}{0.7pt}]
\titlespacing*{\section}{0pt}{7pt}{4pt}

\newcommand{\entry}[2]{\textbf{#1}\hfill{\small #2}\par}
`;

export function renderTex(plan) {
  const h = plan.header;
  const contact = [h.phone, h.email, h.location].filter(Boolean).map(tex).join(' $\\mid$ ');
  const links = Object.entries(h.links || {})
    .filter(([k, v]) => v && !k.startsWith('_'))
    .map(([k, v]) => `\\href{${v}}{${tex(k)}}`)
    .join(' $\\mid$ ');

  const L = [];
  L.push(PREAMBLE);
  L.push('\\begin{document}');

  // Header
  L.push(`\\begin{center}`);
  L.push(`{\\LARGE\\bfseries ${tex(h.name)}}\\\\[3pt]`);
  L.push(`{\\small ${tex(plan.title)}${contact ? ` $\\mid$ ${contact}` : ''}}\\\\[2pt]`);
  if (links) L.push(`{\\small ${links}}\\\\[2pt]`);
  L.push(`{\\small\\itshape ${tex(h.tagline)}}`);
  L.push(`\\end{center}`);
  L.push('\\vspace{2pt}');

  for (const section of plan.sectionOrder) {
    if (section === 'header') continue;

    if (section === 'summary') {
      L.push('\\section*{Professional Summary}');
      L.push(tex(plan.summary));
    }

    if (section === 'skills') {
      L.push('\\section*{Technical Skills}');
      L.push('\\begin{itemize}');
      for (const cat of plan.skillCategories) {
        L.push(`  \\item \\textbf{${tex(cat.label)}:} ${cat.items.map((i) => tex(i.name)).join(', ')}`);
      }
      L.push('\\end{itemize}');
    }

    if (section === 'agentic') {
      L.push(`\\section*{${tex(plan.agentic.label)}}`);
      L.push(tex(plan.agentic.intro));
      L.push('\\begin{itemize}');
      for (const b of plan.agentic.bullets) L.push(`  \\item ${boldLead(b.text)}`);
      L.push('\\end{itemize}');
    }

    if (section === 'experience') {
      L.push('\\section*{Professional Experience}');
      for (const r of plan.experience) {
        L.push(`\\entry{${tex(r.role)} $\\cdot$ ${tex(r.company)}, ${tex(r.location)}}{${tex(r.start)} -- ${tex(r.end)} $\\cdot$ ${tex(r.durationLabel)}}`);
        L.push('\\begin{itemize}');
        for (const b of r.bullets) L.push(`  \\item ${tex(b.text)}`);
        L.push('\\end{itemize}');
      }
    }

    if (section === 'projects') {
      L.push('\\section*{Key Projects}');
      for (const p of plan.projects) {
        L.push(`\\entry{${tex(p.name)}}{${tex(p.region)}}`);
        L.push(`{\\small\\itshape ${tex(p.stackLine)}}`);
        L.push('\\begin{itemize}');
        for (const b of p.bullets) L.push(`  \\item ${tex(b.text)}`);
        L.push('\\end{itemize}');
      }
    }

    if (section === 'education') {
      L.push('\\section*{Education}');
      L.push('\\begin{itemize}');
      for (const e of plan.education) L.push(`  \\item \\textbf{${tex(e.degree)}} $\\cdot$ ${tex(e.institution)}, ${tex(e.location)}`);
      L.push('\\end{itemize}');
    }

    if (section === 'certifications') {
      L.push('\\section*{Certifications}');
      L.push('\\begin{itemize}');
      for (const c of plan.certifications) L.push(`  \\item ${tex(c.name)}`);
      L.push('\\end{itemize}');
    }

    if (section === 'publications') {
      L.push(`\\section*{${tex(plan.publications.label)}}`);
      L.push('\\begin{itemize}');
      if (plan.publications.blogs.length)
        L.push(`  \\item \\textbf{Blogs:} ${plan.publications.blogs.map((b) => `"${tex(b.title)}"`).join('; ')}.`);
      if (plan.publications.internships.length)
        L.push(`  \\item \\textbf{Internships:} ${plan.publications.internships.map((i) => tex(i.text)).join('; ')}.`);
      L.push('\\end{itemize}');
    }
  }

  L.push('\\end{document}');
  return L.join('\n');
}

/** "Label (thing): rest" -> bold the label part, as in the source resume. */
function boldLead(text) {
  const m = String(text).match(/^([^:]{3,70}):\s*(.*)$/s);
  if (!m) return tex(text);
  return `\\textbf{${tex(m[1])}:} ${tex(m[2])}`;
}

// ------------------------------------------------------------- Markdown ----

export function renderMd(plan) {
  const h = plan.header;
  const L = [];
  L.push(`# ${h.name}`);
  L.push('');
  L.push(`**${plan.title}** · ${[h.phone, h.email, h.location].filter(Boolean).join(' · ')}`);
  const links = Object.entries(h.links || {}).filter(([k, v]) => v && !k.startsWith('_'));
  if (links.length) L.push('', links.map(([k, v]) => `[${k}](${v})`).join(' · '));
  L.push('', `*${h.tagline}*`, '');

  for (const section of plan.sectionOrder) {
    if (section === 'header') continue;

    if (section === 'summary') L.push('## Professional Summary', '', plan.summary, '');

    if (section === 'skills') {
      L.push('## Technical Skills', '');
      for (const cat of plan.skillCategories) L.push(`- **${cat.label}:** ${cat.items.map((i) => i.name).join(', ')}`);
      L.push('');
    }

    if (section === 'agentic') {
      L.push(`## ${plan.agentic.label}`, '', plan.agentic.intro, '');
      for (const b of plan.agentic.bullets) L.push(`- ${mdBoldLead(b.text)}`);
      L.push('');
    }

    if (section === 'experience') {
      L.push('## Professional Experience', '');
      for (const r of plan.experience) {
        L.push(`### ${r.role} · ${r.company}, ${r.location}`);
        L.push(`*${r.start} – ${r.end} · ${r.durationLabel}*`, '');
        for (const b of r.bullets) L.push(`- ${b.text}`);
        L.push('');
      }
    }

    if (section === 'projects') {
      L.push('## Key Projects', '');
      for (const p of plan.projects) {
        L.push(`### ${p.name} — ${p.region}`);
        L.push(`*${p.stackLine}*`, '');
        for (const b of p.bullets) L.push(`- ${b.text}`);
        L.push('');
      }
    }

    if (section === 'education') {
      L.push('## Education', '');
      for (const e of plan.education) L.push(`- **${e.degree}** · ${e.institution}, ${e.location}`);
      L.push('');
    }

    if (section === 'certifications') {
      L.push('## Certifications', '');
      for (const c of plan.certifications) L.push(`- ${c.name}`);
      L.push('');
    }

    if (section === 'publications') {
      L.push(`## ${plan.publications.label}`, '');
      if (plan.publications.blogs.length) L.push(`- **Blogs:** ${plan.publications.blogs.map((b) => `"${b.title}"`).join('; ')}.`);
      if (plan.publications.internships.length) L.push(`- **Internships:** ${plan.publications.internships.map((i) => i.text).join('; ')}.`);
      L.push('');
    }
  }
  return L.join('\n');
}

function mdBoldLead(text) {
  const m = String(text).match(/^([^:]{3,70}):\s*(.*)$/s);
  return m ? `**${m[1]}:** ${m[2]}` : text;
}

// ------------------------------------------------------- Plain text (ATS) --

export function renderTxt(plan) {
  const h = plan.header;
  const L = [];
  const rule = (s) => { L.push('', s.toUpperCase(), '='.repeat(s.length)); };

  L.push(h.name.toUpperCase());
  L.push([plan.title, h.phone, h.email, h.location].filter(Boolean).join(' | '));
  const links = Object.entries(h.links || {}).filter(([k, v]) => v && !k.startsWith('_'));
  if (links.length) L.push(links.map(([, v]) => v).join(' | '));
  L.push(h.tagline);

  for (const section of plan.sectionOrder) {
    if (section === 'header') continue;

    if (section === 'summary') { rule('Professional Summary'); L.push(txt(plan.summary)); }

    if (section === 'skills') {
      rule('Technical Skills');
      for (const cat of plan.skillCategories) L.push(`${cat.label}: ${cat.items.map((i) => i.name).join(', ')}`);
    }

    if (section === 'agentic') {
      rule(plan.agentic.label);
      L.push(txt(plan.agentic.intro));
      for (const b of plan.agentic.bullets) L.push(`- ${txt(b.text)}`);
    }

    if (section === 'experience') {
      rule('Professional Experience');
      for (const r of plan.experience) {
        L.push(`${r.role} - ${r.company}, ${r.location}`);
        L.push(`${r.start} - ${r.end} (${r.durationLabel})`);
        for (const b of r.bullets) L.push(`- ${txt(b.text)}`);
        L.push('');
      }
    }

    if (section === 'projects') {
      rule('Key Projects');
      for (const p of plan.projects) {
        L.push(`${p.name} - ${p.region}`);
        L.push(txt(p.stackLine));
        for (const b of p.bullets) L.push(`- ${txt(b.text)}`);
        L.push('');
      }
    }

    if (section === 'education') {
      rule('Education');
      for (const e of plan.education) L.push(`- ${e.degree} - ${e.institution}, ${e.location}`);
    }

    if (section === 'certifications') {
      rule('Certifications');
      for (const c of plan.certifications) L.push(`- ${c.name}`);
    }

    if (section === 'publications') {
      rule(plan.publications.label);
      if (plan.publications.blogs.length) L.push(`Blogs: ${plan.publications.blogs.map((b) => `"${b.title}"`).join('; ')}.`);
      if (plan.publications.internships.length) L.push(`Internships: ${plan.publications.internships.map((i) => i.text).join('; ')}.`);
    }
  }
  return L.join('\n');
}

// ----------------------------------------------------------- Match report --

export function renderReportMd(plan, meta = {}) {
  const r = plan.report;
  const L = [];
  L.push(`# Match report — ${meta.company || 'Unknown company'} · ${meta.title || 'Unknown role'}`);
  L.push('');
  if (meta.url) L.push(`**JD:** ${meta.url}`, '');
  L.push(`| | |`);
  L.push(`|---|---|`);
  L.push(`| Recommendation | **${r.recommendation.toUpperCase()}** |`);
  L.push(`| Detected archetype | ${r.archetype} (score ${r.archetypeScore}) |`);
  if (r.runnerUpArchetype) L.push(`| Runner-up | ${r.runnerUpArchetype} |`);
  L.push(`| ATS keyword coverage | **${r.atsCoverage.percent}%** (${r.atsCoverage.covered}/${r.atsCoverage.jdRelevantKeywords} JD-relevant terms) |`);
  L.push(`| Location | India: ${r.location.india ? 'yes' : 'no'} · Remote: ${r.location.remote ? 'yes' : 'no'} |`);
  L.push(`| Resume variant | \`${meta.outBase || '-'}\` |`);
  L.push('');

  if (r.blockers.length) {
    L.push('## ⚠ Blockers', '');
    for (const b of r.blockers) L.push(`- ${b}`);
    L.push('');
  }

  if (r.seniority?.reason) L.push(`**Seniority note:** ${r.seniority.reason}`, '');

  if (r.atsCoverage.missingList.length) {
    L.push('## Keywords the JD wants that your resume does not show', '');
    L.push('Check each one honestly. If it is genuinely true and missing from `resume-content.json`, **add it there** — never straight into a tailored file.', '');
    for (const k of r.atsCoverage.missingList) L.push(`- \`${k}\``);
    L.push('');
  }

  if (r.honestGaps.length) {
    L.push('## Real gaps — do NOT claim these', '');
    L.push('The JD asks for these and you genuinely do not have them. Address them in the cover letter as things you are ready to pick up, never as experience.', '');
    for (const g of r.honestGaps) L.push(`- ${g}`);
    L.push('');
  }

  if (r.evidenceForThisRole.length) {
    L.push('## Your strongest evidence for this role', '');
    for (const e of r.evidenceForThisRole) L.push(`- ${e}`);
    L.push('');
  }

  if (r.dropped && r.dropped.length) {
    L.push('## Deliberately omitted from this variant', '');
    L.push('These are true facts left out because they are off-target for this role. Omission is a targeting choice; nothing here was rewritten or denied.', '');
    for (const d of r.dropped) L.push(`- ${d}`);
    L.push('');
  }

  L.push('## What the tailoring engine changed', '');
  L.push(`- **Headline title:** ${plan.title}`);
  L.push(`- **Summary assembled from:** opener \`${plan.summaryParts.opener}\` + clauses \`${plan.summaryParts.clauses.join('`, `')}\``);
  L.push(`- **Skill category order:** ${plan.skillCategories.map((c) => c.label).join(' → ')}`);
  L.push(`- **Agentic section:** ${plan.agentic.placement} (relevance ${plan.agentic.relevance})`);
  L.push(`- **Project order:** ${plan.projects.map((p) => p.name).join(' → ')}`);
  L.push(`- **Lead experience bullet:** ${plan.experience[0]?.bullets[0]?.id}`);
  const dropped = [...plan.experience, ...plan.projects].flatMap((x) => x._dropped || []);
  if (dropped.length) L.push(`- **Bullets trimmed by --max-bullets:** ${dropped.map((d) => d.id).join(', ')}`);
  else L.push('- **Nothing was dropped.** Every skill, bullet, certification and qualification from the master is present.');
  L.push('');

  return L.join('\n');
}
