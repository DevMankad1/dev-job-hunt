// Job-description analysis: archetype detection, seniority check, keyword extraction.
import { norm, hasTerm, matchTerms, tokens } from './text.mjs';

/**
 * Analyse a JD against the archetype taxonomy.
 * Returns everything the tailoring engine and the digest need.
 */
export function analyseJd({ jdText, title = '', company = '', location = '', keywords, profile }) {
  const bodyN = norm(jdText);
  const titleN = norm(title || firstLine(jdText));
  const wholeN = norm(`${title}\n${jdText}`);
  // Location is judged on the location field when the caller has one (the ATS
  // gives it separately); only a caller with no location falls back to the body.
  const locN = norm(location);

  const archetypes = keywords.archetypes || [];

  // --- score every archetype -------------------------------------------------
  const scored = archetypes.map((a) => {
    const titleHits = (a.titlePatterns || []).filter((p) => hasTerm(titleN, p));
    const mustHits = matchTerms(wholeN, a.mustHaveKeywords || []);
    const niceHits = matchTerms(wholeN, a.niceToHaveKeywords || []);
    const atsHits = matchTerms(wholeN, a.atsKeywords || []);

    // Title match is the dominant signal — a JD titled "Flutter Developer" is a
    // flutter role even if it name-drops React once.
    const score =
      titleHits.length * 30 +
      mustHits.length * 6 +
      niceHits.length * 2 +
      atsHits.length * 1;

    return { id: a.id, displayName: a.displayName, score, titleHits, mustHits, niceHits, atsHits, archetype: a };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0] || null;
  const runnerUp = scored[1] || null;

  // --- seniority -------------------------------------------------------------
  const seniority = checkSeniority(wholeN, profile);

  // --- global negatives ------------------------------------------------------
  const negatives = matchTerms(wholeN, keywords.globalNegativeKeywords || []);

  // --- lane / location -------------------------------------------------------
  const sc = profile.scanning || {};
  const locSource = locN || wholeN;
  const isIndia = sc.indiaRegex ? new RegExp(sc.indiaRegex, 'i').test(locSource) : false;
  const isRemote = sc.remoteRegex ? new RegExp(sc.remoteRegex, 'i').test(locSource) : false;
  const stackReject = sc.stackRejectRegex ? (wholeN.match(new RegExp(sc.stackRejectRegex, 'ig')) || []) : [];

  // --- the JD's own vocabulary, for resume scoring ---------------------------
  const jdVocab = new Set(tokens(wholeN).filter((t) => t.length > 2));

  // --- verdict ---------------------------------------------------------------
  const blockers = [];
  if (seniority.tooSenior) blockers.push(`Seniority: ${seniority.reason}`);
  if (negatives.length) blockers.push(`Negative keywords: ${negatives.slice(0, 5).join(', ')}`);
  if (!isIndia && !isRemote) blockers.push('Location: neither an India location nor remote could be detected');
  if (best && best.score < 20) blockers.push(`Weak archetype match (best: ${best.id} @ ${best.score})`);

  const recommendation = blockers.length === 0 ? 'apply'
    : blockers.length === 1 ? 'review'
    : 'skip';

  return {
    title: title || firstLine(jdText),
    company,
    bestArchetype: best,
    runnerUp,
    allScores: scored.map(({ id, score }) => ({ id, score })),
    seniority,
    negatives,
    stackReject: Array.from(new Set(stackReject.map((s) => s.toLowerCase()))),
    isIndia,
    isRemote,
    jdVocab,
    bodyN: wholeN,
    blockers,
    recommendation,
  };
}

function firstLine(s) {
  return String(s || '').split('\n').map((x) => x.trim()).filter(Boolean)[0] || '';
}

/**
 * Years-of-experience and title-level check.
 * Deliberately lenient on the low end: Indian JDs routinely inflate the number,
 * and profile.seniorityNote says to stretch to 3-6 yr when the fit is strong.
 */
export function checkSeniority(wholeN, profile) {
  const years = profile?.experience?.totalYears ?? 0;
  const out = { tooSenior: false, tooJunior: false, reason: '', minYears: null, maxYears: null, titleLevel: null };

  // Title-level words are the hard gate.
  const rejectRe = profile?.scanning?.seniorityRejectRegex
    ? new RegExp(profile.scanning.seniorityRejectRegex, 'i')
    : /(senior|staff|principal|lead\b|architect|manager|director|head of)/i;

  const titleHit = wholeN.slice(0, 200).match(rejectRe);
  if (titleHit) {
    out.tooSenior = true;
    out.titleLevel = titleHit[0];
    out.reason = `title/level signal "${titleHit[0]}" — above a 2.7-year engineer`;
    return out;
  }

  // "5+ years", "5-8 years", "minimum 6 years", "at least 4 years"
  const ranges = [...wholeN.matchAll(/(\d{1,2})\s*(?:\+|to|-|–)?\s*(\d{1,2})?\s*(?:\+)?\s*(?:years?|yrs?)/g)];
  let min = null;
  for (const m of ranges) {
    const a = parseInt(m[1], 10);
    if (Number.isFinite(a) && a > 0 && a < 25) min = min === null ? a : Math.min(min, a);
  }
  out.minYears = min;

  if (min !== null) {
    if (min > years + 3) {
      out.tooSenior = true;
      out.reason = `JD asks for ${min}+ years vs ${years} — beyond the stretch band`;
    } else if (min > years) {
      out.reason = `JD asks for ${min}+ years vs ${years} — stretch, apply if the fit is otherwise strong`;
    }
  }
  return out;
}
