// Which resume goes with which posting.
//
// Dev keeps two, and they are deliberately non-overlapping:
//
//   dev-mankad-resume        mobile only  — Flutter, KMP, SwiftUI, Android, iOS
//   dev-mankad-resume-mern   web only     — React, Node, TypeScript, APIs
//
// He has genuine experience in both, so the rule is simply: send the one that
// matches the opening. Archetype decides it outright where the archetype is
// unambiguous; where it is not (a plain "Software Engineer", or a Forward
// Deployed role that could be either), the JD's own vocabulary decides.

import { norm, hasTerm } from './text.mjs';

export const RESUMES = {
  mobile: {
    file: 'dev-mankad-resume',
    label: 'Mobile',
    pdf: 'resume/dev-mankad-resume.pdf',
    blurb: 'Flutter · KMP · SwiftUI · Android · iOS',
  },
  mern: {
    file: 'dev-mankad-resume-mern',
    label: 'MERN',
    pdf: 'resume/dev-mankad-resume-mern.pdf',
    blurb: 'React · Node.js · TypeScript · REST & GraphQL',
  },
};

// Archetypes that settle it on their own.
const BY_ARCHETYPE = {
  'flutter-engineer': 'mobile',
  'kmp-android-engineer': 'mobile',
  'mobile-generalist': 'mobile',
  'healthtech-mobile': 'mobile',
  'mern-fullstack': 'mern',
  'react-frontend': 'mern',
  'node-backend': 'mern',
};

const MOBILE_SIGNALS = [
  'flutter', 'dart', 'kotlin', 'kmp', 'kotlin multiplatform', 'multiplatform',
  'android', 'ios', 'swift', 'swiftui', 'jetpack compose', 'react native',
  'mobile app', 'mobile application', 'mobile developer', 'mobile engineer',
  'play store', 'app store', 'google play', 'testflight', 'apk', 'xcode',
  'android studio', 'cross-platform', 'objective-c', 'uikit',
];

const MERN_SIGNALS = [
  'react', 'react.js', 'reactjs', 'node', 'node.js', 'nodejs', 'express',
  'mongodb', 'mern', 'mean stack', 'javascript', 'typescript', 'next.js',
  'redux', 'frontend', 'front-end', 'backend', 'back-end', 'full stack',
  'full-stack', 'web application', 'web app', 'rest api', 'graphql',
  'html', 'css', 'tailwind', 'sql', 'postgres', 'microservice',
];

/**
 * @returns {{ key:'mobile'|'mern', file:string, label:string, pdf:string,
 *             confidence:'high'|'medium'|'low', why:string,
 *             mobileHits:number, mernHits:number }}
 */
export function pickResume({ archetype, jdText = '', title = '' } = {}) {
  const hay = norm(`${title}\n${jdText}`);
  const mobileHits = MOBILE_SIGNALS.filter((s) => hasTerm(hay, s));
  const mernHits = MERN_SIGNALS.filter((s) => hasTerm(hay, s));

  const decided = BY_ARCHETYPE[archetype];
  if (decided) {
    return {
      key: decided, ...RESUMES[decided],
      confidence: 'high',
      why: `Archetype "${archetype}" is unambiguously ${decided === 'mobile' ? 'mobile' : 'web/full-stack'}.`,
      mobileHits: mobileHits.length, mernHits: mernHits.length,
    };
  }

  // Ambiguous archetype (sde-generalist, forward-deployed-engineer): let the
  // posting's own vocabulary decide.
  const m = mobileHits.length;
  const w = mernHits.length;
  const gap = Math.abs(m - w);

  if (m === 0 && w === 0) {
    // A posting that names no stack at all. Which default is right depends on
    // the shape of the role, not on which resume is "stronger":
    //   - Solutions / Forward Deployed work is customer-facing and web-shaped,
    //     so the full-stack resume reads better than a mobile-specialist one.
    //   - A plain Software Engineer role is better served by his deepest
    //     evidence, which is the mobile track record.
    const fde = archetype === 'forward-deployed-engineer';
    const key = fde ? 'mern' : 'mobile';
    return {
      key, ...RESUMES[key],
      confidence: 'low',
      why: fde
        ? 'The JD names no stack. For a customer-facing solutions role the full-stack resume reads better than a mobile-specialist one — but read the posting before sending.'
        : 'The JD names no stack. Defaulting to the mobile resume, his deepest track record — but read the posting before sending.',
      mobileHits: m, mernHits: w,
    };
  }

  const key = m > w ? 'mobile' : 'mern';
  const confidence = gap >= 3 ? 'high' : gap >= 1 ? 'medium' : 'low';
  const why = m === w
    ? `Evenly split (${m} mobile vs ${w} web signals). Read the JD and choose; the MERN resume is the safer default for a mixed web/product role.`
    : `JD leans ${key === 'mobile' ? 'mobile' : 'web'} — ${m} mobile signals vs ${w} web signals${
        gap < 3 ? '. Close call, worth a glance at the posting.' : '.'}`;

  return { key: m === w ? 'mern' : key, ...RESUMES[m === w ? 'mern' : key], confidence, why, mobileHits: m, mernHits: w };
}
