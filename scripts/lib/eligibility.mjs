// Location eligibility — can Dev, living in India, actually take this role?
//
// Adapted from Ankur Kapuriya's "Daily Remote AI Engineer Job Search" runbook
// (handoff 2, 8 Sep 2026). His three location shapes are the sharpest part of
// that system, and they replace the blunt india/foreign test this repo started
// with.
//
// ONE DELIBERATE INVERSION: Ankur DROPS Indian-headquartered employers, because
// his whole hunt is for non-Indian remote work. Dev's lane 1 is India metros, so
// an Indian employer is in scope here — it is classified into the `india`
// channel rather than dropped. Never copy that rule across without flipping it.
//
// Returns:
//   { verdict: 'qualifies' | 'drops' | 'unconfirmed',
//     channel: 'india' | 'remote-global' | null,
//     shape:   which rule fired,
//     reason:  human-readable }

import { norm } from './text.mjs';

const INDIA = /(india|bharat|bengaluru|bangalore|hyderabad|pune|mumbai|gurugram|gurgaon|noida|delhi|\bncr\b|chennai|ahmedabad|gandhinagar|gift city|kolkata|jaipur|indore|kochi|coimbatore|trivandrum|thiruvananthapuram|nagpur|surat|vadodara|chandigarh|bhubaneswar|mysuru|mysore)/i;

const WORLDWIDE = /(worldwide|world.?wide|anywhere|work from anywhere|\bwfa\b|global(ly)?\s*remote|remote\s*[-–—,]?\s*global|fully remote|any location|location.?independent|distributed)/i;

// A bloc or single country that is NOT India — these lock Dev out.
const COUNTRY_LOCK = /(united states|\bu\.?s\.?a?\b|\bus[- ]only\b|canada|united kingdom|\buk\b|england|ireland|germany|france|spain|portugal|netherlands|belgium|italy|poland|romania|sweden|norway|denmark|finland|switzerland|austria|czech|hungary|greece|turkey|israel|australia|new zealand|japan|singapore|china|hong kong|korea|taiwan|brazil|mexico|argentina|colombia|chile|\blatam\b|south africa|nigeria|kenya|egypt|\buae\b|dubai|saudi|qatar|\bemea\b|\beu\b|europe(an)?\s*(union|only)?|north america|\bnamer\b|\bapac\b(?!.*india))/i;

// US-state-scoped remote ("Remote - CA", "Remote (NY)")
const US_STATE = /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i;

// Named foreign CITIES. Without these, "San Jose" or "Tel Aviv" falls through to
// "unresolved" and gets kept as Unconfirmed — technically safe, but it buries
// the real matches under on-site roles Dev can never take.
const FOREIGN_CITY = /\b(san francisco|san jose|palo alto|mountain view|sunnyvale|santa clara|cupertino|menlo park|redwood city|oakland|berkeley|los angeles|san diego|seattle|bellevue|portland|denver|boulder|austin|dallas|houston|chicago|boston|cambridge, ma|atlanta|miami|philadelphia|phoenix|minneapolis|pittsburgh|detroit|nashville|raleigh|charlotte|salt lake city|las vegas|new york city|brooklyn|toronto|vancouver|montreal|ottawa|calgary|london|manchester|birmingham, uk|leeds|bristol|edinburgh|glasgow|belfast|dublin|cork|berlin|munich|hamburg|frankfurt|cologne|stuttgart|amsterdam|rotterdam|utrecht|eindhoven|paris|lyon|toulouse|madrid|barcelona|valencia|lisbon|porto|milan|rome|turin|zurich|geneva|basel|vienna|brussels|antwerp|copenhagen|stockholm|gothenburg|oslo|helsinki|reykjavik|warsaw|krakow|wroclaw|prague|brno|budapest|bucharest|sofia|athens|istanbul|tel aviv|jerusalem|haifa|dubai|abu dhabi|doha|riyadh|cairo|nairobi|lagos|cape town|johannesburg|sydney|melbourne|brisbane|perth|auckland|wellington|tokyo|osaka|kyoto|seoul|beijing|shanghai|shenzhen|hong kong|taipei|singapore|kuala lumpur|jakarta|bangkok|manila|ho chi minh|hanoi|sao paulo|rio de janeiro|buenos aires|santiago|bogota|lima|mexico city|guadalajara|monterrey)\b/i;

const REMOTE = /(remote|work from home|\bwfh\b|home.?based|telecommute)/i;

// "Remote, APAC" only counts when India is actually inside the stated region.
const APAC_WITH_INDIA = /apac|asia.?pacific|\basia\b|south asia|\bsea\b/i;

/**
 * @param {string} locationField  the ATS location string (NOT the JD body —
 *   India-founded companies mention "India" throughout their postings, which
 *   is exactly how San Francisco roles leaked through before)
 * @param {string} title          job title, checked as a weak fallback
 * @param {object} opts           { companyHqCountry }
 */
export function classifyLocation(locationField, title = '', opts = {}) {
  const loc = norm(locationField);
  const ttl = norm(title);
  const hq = norm(opts.companyHqCountry || '');

  if (!loc && !ttl) {
    return { verdict: 'unconfirmed', channel: null, shape: 'no-location', reason: 'Posting states no location at all — keep and verify on the JD.' };
  }

  const hasIndia = INDIA.test(loc);
  const isRemote = REMOTE.test(loc) || REMOTE.test(ttl);
  const hasWorldwide = WORLDWIDE.test(loc);
  const hasCountryLock = COUNTRY_LOCK.test(loc);
  const hasUsState = US_STATE.test(loc) && !hasIndia;
  const hasForeignCity = FOREIGN_CITY.test(loc) && !hasIndia;

  // --- Shape A: names India -------------------------------------------------
  // Covers "Bengaluru", "Remote - India", "Bangalore, India - Remote".
  if (hasIndia) {
    const indianEmployer = INDIA.test(hq) || !hq;
    return {
      verdict: 'qualifies',
      channel: indianEmployer ? 'india' : 'remote-global',
      shape: 'india-named',
      reason: isRemote ? 'Remote and India is named explicitly.' : 'On-site or hybrid at a named Indian location.',
    };
  }

  // --- Shape B: worldwide / anywhere, no country named ----------------------
  if (hasWorldwide && !hasCountryLock && !hasUsState) {
    return { verdict: 'qualifies', channel: 'remote-global', shape: 'worldwide', reason: 'Worldwide or "anywhere" with no country lock stated.' };
  }

  // --- Explicit locks ------------------------------------------------------
  if (hasUsState) {
    return { verdict: 'drops', channel: null, shape: 'us-state-scoped', reason: `US-state-scoped remote ("${locationField}") — Dev is not eligible.` };
  }
  if (hasForeignCity) {
    return { verdict: 'drops', channel: null, shape: 'foreign-city', reason: `On-site or hybrid in a named foreign city ("${locationField}").` };
  }
  if (hasCountryLock) {
    // "Remote, APAC" is a lock only if India is outside the region named.
    if (APAC_WITH_INDIA.test(loc) && !/apac.*(excl|except)/i.test(loc)) {
      return { verdict: 'qualifies', channel: 'remote-global', shape: 'apac-includes-india', reason: 'Remote within APAC/Asia, which includes India. Confirm India is not excluded.' };
    }
    return { verdict: 'drops', channel: null, shape: 'country-or-bloc-lock', reason: `Locked to a country or bloc that excludes India ("${locationField}").` };
  }

  // --- Shape C: plain unqualified "Remote" ---------------------------------
  if (isRemote) {
    return { verdict: 'qualifies', channel: 'remote-global', shape: 'plain-remote', reason: 'Plain "Remote" with no country lock stated. Verify India eligibility on the JD before applying.' };
  }

  // --- On-site somewhere unnamed -------------------------------------------
  return { verdict: 'unconfirmed', channel: null, shape: 'unresolved', reason: `Could not resolve "${locationField}" either way — kept and flagged rather than assumed.` };
}

/**
 * Freshness. Ankur's runbook uses a hard 21-day cutoff and ranks newest-first,
 * on the observation that a 70% fit posted three hours ago beats a 90% fit
 * posted six days ago — for competitive remote roles the queue length matters
 * more than the margin of fit.
 */
export function freshness(postedAt, maxAgeDays = 21) {
  if (!postedAt) return { ageDays: null, fresh: true, label: 'date unknown', note: 'No posted date — kept, since dropping every undated posting hides whole employers.' };
  const ms = Date.now() - new Date(postedAt).getTime();
  if (!Number.isFinite(ms)) return { ageDays: null, fresh: true, label: 'date unparseable' };
  const ageDays = Math.floor(ms / 86400000);
  const hours = Math.floor(ms / 3600000);
  const label = hours < 1 ? 'just posted' : hours < 24 ? `${hours}h ago` : `${ageDays}d ago`;
  return { ageDays, fresh: ageDays <= maxAgeDays, label };
}

/**
 * Seniority as a decaying score rather than a binary reject.
 * Ankur's model: full marks when 1-4 years are asked, decaying to zero by 6.
 * Title alone only disqualifies at Director / Head-of / VP.
 *
 * Dev is stricter than Ankur on titles because he is 2.7 years in and Senior/
 * Staff/Principal roles genuinely are not his — but the YEARS side uses the
 * decay, which is better than the old hard cut.
 */
export function seniorityFit(text, devYears = 2.7) {
  const t = norm(text);
  const out = { score: 1, asked: null, verdict: 'fit', reason: '' };

  // Level words are matched as STANDALONE tokens near the front of the string,
  // not as fixed phrases. "Staff Software Engineer" and "Staff Fullstack
  // Engineer - Data Products" both slipped past a literal "staff engineer".
  const HARD_TITLE = /\b(director|head of|vp|vice president|chief|principal|staff|distinguished|fellow|architect|engineering manager|em)\b/i;
  const titleZone = t.slice(0, 90);
  const hardHit = titleZone.match(HARD_TITLE);
  if (hardHit) {
    return { score: 0, asked: null, verdict: 'reject', reason: `Title carries the level word "${hardHit[1]}" — above a ${devYears}-year engineer.` };
  }

  const SENIOR_TITLE = /\b(senior|sr\.?|lead)\b/i;
  const seniorInTitle = SENIOR_TITLE.test(t.slice(0, 120));

  const ranges = [...t.matchAll(/(\d{1,2})\s*(?:\+|to|-|–|—)?\s*(\d{1,2})?\s*(?:\+)?\s*(?:years?|yrs?)/g)];
  let min = null;
  for (const m of ranges) {
    const a = parseInt(m[1], 10);
    if (Number.isFinite(a) && a > 0 && a < 25) min = min === null ? a : Math.min(min, a);
  }
  out.asked = min;

  if (min !== null) {
    if (min <= 4) out.score = 1;
    else if (min >= 6) out.score = 0;
    else out.score = (6 - min) / 2; // 5 yrs -> 0.5
    if (out.score === 0) { out.verdict = 'reject'; out.reason = `Asks ${min}+ years against ${devYears} — past the decay window.`; }
    else if (out.score < 1) { out.verdict = 'stretch'; out.reason = `Asks ${min}+ years against ${devYears} — a stretch, worth it if the stack fits.`; }
  }

  // "Senior/Lead" in the title. Ankur's runbook only disqualifies at Director+,
  // but he is hunting roles that ask 1-4 years. At 2.7 years a Senior title that
  // also asks 5+ years is not a stretch, it is a waste of an afternoon — so it
  // rejects. A Senior title asking <=4 years is usually title inflation at a
  // small company, and stays as a flagged stretch.
  if (seniorInTitle && out.verdict !== 'reject') {
    if (min === null || min >= 5) {
      return { score: 0, asked: min, verdict: 'reject', reason: `"Senior/Lead" title${min ? ` asking ${min}+ years` : ' with no stated years'} at ${devYears} years.` };
    }
    out.score = Math.min(out.score, 0.4);
    out.verdict = 'stretch';
    out.reason = `${out.reason} "Senior" title but only ${min}+ years asked — likely title inflation, worth a look.`.trim();
  }
  return out;
}
