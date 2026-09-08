// Shared text helpers. Pure Node, zero dependencies.

/** Lowercase, collapse whitespace, normalise punctuation that JDs mangle. */
export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Word-ish tokens, keeping dots/pluses/hashes so "node.js", "c++", "c#" survive. */
export function tokens(s) {
  return norm(s).match(/[a-z0-9][a-z0-9.+#-]*/g) || [];
}

/**
 * Substring match on a word boundary. Handles multi-word aliases
 * ("kotlin multiplatform") and dotted ones ("node.js") that a plain
 * \b regex gets wrong.
 */
export function hasTerm(haystackNorm, term) {
  const t = norm(term);
  if (!t) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Boundary = start/end of string or a char that is not [a-z0-9+#]
  const re = new RegExp(`(^|[^a-z0-9+#])${esc}($|[^a-z0-9+#])`, 'i');
  return re.test(haystackNorm);
}

/** How many of `terms` appear in the normalised haystack. Returns the matched list. */
export function matchTerms(haystackNorm, terms = []) {
  const hits = [];
  for (const t of terms) if (hasTerm(haystackNorm, t)) hits.push(t);
  return hits;
}

/** Escape a string for LaTeX. */
export function tex(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/·/g, '$\\cdot$')
    .replace(/—/g, '---')
    .replace(/–/g, '--')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, "''");
}

/** Escape for Markdown (light — we only guard the characters that break lists/emphasis). */
export function md(s) {
  return String(s ?? '').replace(/([*_`])/g, '\\$1');
}

/** Plain text: strip nothing, just normalise dashes for ATS parsers. */
export function txt(s) {
  return String(s ?? '').replace(/[–—]/g, '-').replace(/·/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

/** kebab-case slug, safe as a filename. */
export function slug(s, max = 60) {
  return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'untitled';
}

/** Stable sort: keeps original order for equal keys (Array#sort is stable in V8, this makes intent explicit). */
export function sortBy(arr, keyFn) {
  return arr
    .map((v, i) => ({ v, i, k: keyFn(v) }))
    .sort((a, b) => (b.k - a.k) || (a.i - b.i))
    .map((x) => x.v);
}

export function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}
