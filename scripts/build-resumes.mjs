#!/usr/bin/env node
/**
 * build-resumes.mjs — rebuild the two standing resumes.
 *
 *   npm run resumes
 *
 * These are the general-purpose files Dev keeps on hand. Per-application
 * tailoring is still `scripts/tailor.mjs` against a real JD — this just keeps
 * two sensible defaults current whenever resume-content.json changes.
 *
 *   resume/dev-mankad-resume.*        mobile-first: Flutter / KMP / SwiftUI lead
 *   resume/dev-mankad-resume-mern.*   JavaScript-first, mobile OMITTED entirely
 *
 * Both come from the SAME resume-content.json. Nothing is invented for either.
 * The MERN build additionally passes --drop-tags to leave the mobile work out —
 * omission is a legitimate targeting choice, and every omitted item is listed in
 * that variant's .report.md.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BUILDS = [
  {
    name: 'dev-mankad-resume',
    archetype: 'mobile-generalist',
    title: 'Software Engineer - Mobile',
    jd: `Software Engineer / Mobile Application Developer. Build production cross-platform mobile
applications with Flutter, Dart, Kotlin Multiplatform, SwiftUI and Jetpack Compose, plus supporting
backend services and REST/GraphQL APIs. Integrate third-party SDKs, hardware layers and real-time
data pipelines. Own App Store and Play Store releases with Fastlane and CI/CD. Apply MVVM, MVI and
Clean Architecture. Code review, Git branching strategy, technical documentation, Agile/Jira.`,
  },
  {
    name: 'dev-mankad-resume-mern',
    archetype: 'mern-fullstack',
    title: 'Full Stack Developer',
    // Mobile is OMITTED from this variant at Dev's direction. Omission is a
    // targeting choice, not a rewrite — every omission is listed in the report.
    dropTags: 'mobile,flutter,kmp,kotlin,ios,android,react-native,compose,ble,release',
    jd: `MERN Stack Developer / Full Stack Developer. Build responsive frontends in React.js with
TypeScript and modern JavaScript. Develop backend services and REST APIs with Node.js. Integrate
GraphQL APIs and third-party services. Own features end to end from API design through UI delivery.
Clean, modular, testable code following MVVM and clean architecture. Firebase, real-time data,
third-party SDK integration. Git, code review, CI/CD with GitHub Actions, Agile/Scrum with Jira.`,
  },
];

for (const b of BUILDS) {
  const jdPath = path.join(os.tmpdir(), `${b.name}.jd.txt`);
  fs.writeFileSync(jdPath, b.jd);
  execFileSync('node', [
    'scripts/tailor.mjs', '--jd', jdPath,
    '--company', 'Standing', '--title', b.title,
    '--archetype', b.archetype, '--name', b.name,
    '--out', 'resume', '--quiet',
    ...(b.dropTags ? ['--drop-tags', b.dropTags] : []),
  ], { cwd: ROOT, stdio: 'inherit' });
  console.log(`  built resume/${b.name}.{tex,md,txt}  (${b.archetype})`);
}
console.log('\nCompile a PDF from the .tex (Overleaf or local pdflatex) before uploading anywhere.');
