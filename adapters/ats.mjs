// ATS adapters. One module, one exported function per provider, all returning
// the same normalised job shape:
//
//   { id, title, location, url, postedAt (ISO|null), description, source }
//
// Every adapter uses the provider's PUBLIC, unauthenticated job-board API.
// No credentialed scraping, no login-gated endpoints — see HANDOFF.md guardrails.

const UA = 'Mozilla/5.0 (compatible; dev-job-hunt/1.0; +personal job search)';

async function getJson(url, { timeoutMs = 20000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const strip = (html) =>
  String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const iso = (v) => {
  if (!v) return null;
  const d = new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// ---------------------------------------------------------------------------

export async function greenhouse(slug) {
  const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`);
  return (d.jobs || []).map((j) => ({
    id: `gh:${slug}:${j.id}`,
    title: j.title,
    location: j.location?.name || '',
    url: j.absolute_url,
    postedAt: iso(j.updated_at || j.first_published),
    description: strip(j.content),
    source: 'greenhouse',
  }));
}

export async function lever(slug) {
  const d = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`);
  return (Array.isArray(d) ? d : []).map((j) => ({
    id: `lv:${slug}:${j.id}`,
    title: j.text,
    location: j.categories?.location || '',
    url: j.hostedUrl || j.applyUrl,
    postedAt: iso(j.createdAt),
    description: strip(j.descriptionPlain || j.description || ''),
    source: 'lever',
  }));
}

export async function ashby(slug) {
  const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`);
  return (d.jobs || []).map((j) => ({
    id: `ab:${slug}:${j.id}`,
    title: j.title,
    location: j.location || [j.address?.postalAddress?.addressLocality, j.address?.postalAddress?.addressCountry].filter(Boolean).join(', '),
    url: j.jobUrl || j.applyUrl,
    postedAt: iso(j.publishedAt),
    description: strip(j.descriptionHtml || j.descriptionPlain || ''),
    source: 'ashby',
  }));
}

export async function recruitee(slug) {
  const d = await getJson(`https://${encodeURIComponent(slug)}.recruitee.com/api/offers/`);
  return (d.offers || []).map((j) => ({
    id: `rc:${slug}:${j.id}`,
    title: j.title,
    location: [j.city, j.country].filter(Boolean).join(', ') || j.location || '',
    url: j.careers_url || j.url,
    postedAt: iso(j.published_at || j.created_at),
    description: strip(j.description),
    source: 'recruitee',
  }));
}

export async function smartrecruiters(slug) {
  const d = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=100`);
  return (d.content || []).map((j) => ({
    id: `sr:${slug}:${j.id}`,
    title: j.name,
    location: [j.location?.city, j.location?.region, j.location?.country].filter(Boolean).join(', '),
    url: `https://careers.smartrecruiters.com/${slug}/${j.id}`,
    postedAt: iso(j.releasedDate || j.createdOn),
    description: '', // needs a per-posting call; scan.mjs fetches on demand
    source: 'smartrecruiters',
  }));
}

export async function workable(slug) {
  const d = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`);
  return (d.jobs || []).map((j) => ({
    id: `wk:${slug}:${j.shortcode || j.id}`,
    title: j.title,
    location: [j.city, j.state, j.country].filter(Boolean).join(', ') || (j.telecommuting ? 'Remote' : ''),
    url: j.url || j.application_url,
    postedAt: iso(j.published_on || j.created_at),
    description: strip(j.description || ''),
    source: 'workable',
  }));
}

/**
 * Workday. Each tenant exposes a CXS search endpoint; the host and site path
 * differ per employer, so `slug` here is "host/site" (e.g. "acme/External").
 * Best-effort: Workday tenants vary and some reject unauthenticated POSTs.
 */
export async function workday(slug) {
  const [host, site] = String(slug).split('/');
  if (!host || !site) throw new Error('workday slug must be "<host>/<site>"');
  const url = `https://${host}.wd3.myworkdayjobs.com/wday/cxs/${host}/${site}/jobs`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'user-agent': UA, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: '' }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    return (d.jobPostings || []).map((j) => ({
      id: `wd:${host}:${j.bulletFields?.[0] || j.externalPath}`,
      title: j.title,
      location: j.locationsText || '',
      url: `https://${host}.wd3.myworkdayjobs.com/en-US/${site}${j.externalPath}`,
      postedAt: null, // Workday gives "Posted 3 Days Ago" prose, not a date
      description: '',
      source: 'workday',
    }));
  } finally {
    clearTimeout(t);
  }
}

/** Last resort: fetch a careers page and return its text for keyword matching. */
export async function webfetch(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return strip(await res.text());
  } finally {
    clearTimeout(t);
  }
}

export const ADAPTERS = { greenhouse, lever, ashby, recruitee, smartrecruiters, workable, workday };

export function hasAdapter(provider) {
  return Object.prototype.hasOwnProperty.call(ADAPTERS, provider);
}

export async function fetchBoard(provider, slug) {
  if (!hasAdapter(provider)) throw new Error(`no adapter for provider "${provider}"`);
  return ADAPTERS[provider](slug);
}
