// Job-board adapters — the four aggregators that expose a public API.
//
// Different in kind from adapters/ats.mjs: those poll ONE employer's board and
// the employer is known. These poll a whole marketplace, so every row needs its
// employer read off the posting, and the board's own eligibility tag cannot be
// trusted (verified 2026-09-08: Himalayas tagged a role reading "Location:
// Fort, Western Province, Sri Lanka" as locationRestrictions ["United States"],
// and We Work Remotely marked 23 of 25 sampled jobs "Anywhere in the World").
//
// Everything from here is therefore marked `tagTrust` so downstream code knows
// how much weight the location field deserves.

const UA = 'Mozilla/5.0 (compatible; dev-job-hunt/1.0; +personal job search)';

async function getJson(url, { timeoutMs = 25000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

async function getText(url, { timeoutMs = 25000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

const decode = (s) => String(s || '')
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;|&#x27;/gi, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  // Hex entities matter here: HN posts are full of &#x2F; for "/", and without
  // this a title reads "Senior&#x2F;Lead" instead of "Senior/Lead".
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));

const strip = (html) => {
  let s = String(html || '');
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '. ').replace(/<(br|li)[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
    s = decode(s);
    if (s === before) break;
  }
  return s.replace(/\s*\.\s*\./g, '.').replace(/\s+/g, ' ').trim();
};

const iso = (v) => {
  if (!v) return null;
  const d = new Date(typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// ---------------------------------------------------------------------------

/** RemoteOK — public JSON feed. First element is legal boilerplate, not a job. */
export async function remoteok() {
  const d = await getJson('https://remoteok.com/api');
  return (Array.isArray(d) ? d.slice(1) : []).map((j) => ({
    id: `rok:${j.id}`,
    title: j.position || j.title || '',
    company: j.company || '',
    location: j.location || 'Remote',
    url: j.url || j.apply_url || `https://remoteok.com/l/${j.id}`,
    postedAt: iso(j.date || j.epoch),
    description: strip(j.description || ''),
    tags: j.tags || [],
    source: 'remoteok',
    tagTrust: 'low',
  }));
}

/** Remotive — public JSON API. */
export async function remotive() {
  const d = await getJson('https://remotive.com/api/remote-jobs?limit=200');
  return (d.jobs || []).map((j) => ({
    id: `rmt:${j.id}`,
    title: j.title || '',
    company: j.company_name || '',
    location: j.candidate_required_location || 'Remote',
    url: j.url,
    postedAt: iso(j.publication_date),
    description: strip(j.description || ''),
    tags: j.tags || [],
    source: 'remotive',
    tagTrust: 'medium',
  }));
}

/**
 * Himalayas — public API, biggest index here, least trustworthy tags.
 * `locationRestrictions` is scraped and inferred rather than verified, so it is
 * carried through as a hint and never as a decision.
 */
export async function himalayas({ pages = 3, limit = 100 } = {}) {
  const out = [];
  let cursor = null;
  for (let p = 0; p < pages; p++) {
    const url = `https://himalayas.app/jobs/api?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const d = await getJson(url);
    for (const j of (d.jobs || [])) {
      const restr = j.locationRestrictions || [];
      out.push({
        id: `him:${j.guid || j.id}`,
        title: j.title || '',
        company: j.companyName || '',
        // An EMPTY restriction list means "unstated", not "worldwide".
        location: restr.length ? restr.join(', ') : 'Remote',
        url: j.applicationLink || j.url || '',
        postedAt: iso(j.pubDate),
        description: strip(j.excerpt || j.description || ''),
        tags: j.categories || [],
        source: 'himalayas',
        tagTrust: 'low',
        _restrictions: restr,
      });
    }
    cursor = d.nextCursor;
    if (!cursor) break;
  }
  return out;
}

/**
 * Hacker News "Ask HN: Who is hiring?" — the current month's thread via Algolia.
 * Low volume, but posts carry a direct founder or hiring-lead contact, so the
 * conversion per application is the best in the rotation.
 */
export async function hnWhoIsHiring() {
  const search = await getJson(
    'https://hn.algolia.com/api/v1/search_by_date?query=%22Ask%20HN%3A%20Who%20is%20hiring%22&tags=story&hitsPerPage=5',
  );
  const story = (search.hits || []).find((h) => /who is hiring/i.test(h.title || '') && !/wants to be hired|freelancer/i.test(h.title || ''));
  if (!story) return [];

  const item = await getJson(`https://hn.algolia.com/api/v1/items/${story.objectID}`);
  const posts = (item.children || []).filter((c) => c.text && !c.deleted);

  return posts.map((c) => {
    const text = strip(c.text);
    // The convention is "Company | Role | LOCATION | REMOTE | Full-time", but it
    // is a convention, not a schema — plenty of posts ignore it.
    const header = text.split(/[.\n]/)[0].slice(0, 220);
    const parts = header.split('|').map((x) => x.trim()).filter(Boolean);

    // A "title" longer than a title is a parse failure, not a job title.
    const fits = (x) => x && x.length <= 70 && !/^https?:/i.test(x);
    const company = fits(parts[0]) ? parts[0] : 'see post';
    const title = fits(parts[1]) ? parts[1] : (fits(parts[0]) ? parts[0] : header.slice(0, 70));

    // CRITICAL: the eligibility lock usually lives in the BODY, not the header.
    // A post headed "REMOTE" whose body says "United States only" is not remote
    // for Dev — and reading only the header let exactly that through.
    const locBits = parts.slice(2).filter((x) => x.length < 60);
    const bodyLoc = [];
    const patterns = [
      /\b(?:remote|onsite|on-site|hybrid)\s*\(([^)]{2,40})\)/gi,
      /\blocation\s*:\s*([^.|\n]{2,60})/gi,
      /\b(?:us|usa|u\.s\.|eu|uk|emea|canada|latam|apac)[-\s]only\b/gi,
      /\bonly\b[^.]{0,25}\b(?:us|usa|united states|eu|uk|europe|canada)\b/gi,
      /\b(?:must|need to)\s+(?:be|reside|live)[^.]{0,40}\b(?:us|usa|united states|uk|eu|europe|canada)\b/gi,
    ];
    for (const re of patterns) {
      for (const m of text.slice(0, 900).matchAll(re)) bodyLoc.push((m[1] || m[0]).trim());
    }

    return {
      id: `hn:${c.id}`,
      title,
      company,
      location: [...locBits, ...bodyLoc].join(', ') || (/remote/i.test(text) ? 'Remote' : ''),
      url: `https://news.ycombinator.com/item?id=${c.id}`,
      postedAt: iso(c.created_at),
      description: text,
      tags: [],
      source: 'hn-whoishiring',
      tagTrust: 'self-declared',
      threadUrl: `https://news.ycombinator.com/item?id=${story.objectID}`,
    };
  });
}

export const BOARDS = { remoteok, remotive, himalayas, hnWhoIsHiring };

export async function fetchAllBoards({ only = null, onError = () => {} } = {}) {
  const names = only || Object.keys(BOARDS);
  const results = await Promise.all(names.map(async (n) => {
    try { return { name: n, jobs: await BOARDS[n]() }; }
    catch (e) { onError(n, e.message); return { name: n, jobs: [], error: e.message }; }
  }));
  return results;
}
