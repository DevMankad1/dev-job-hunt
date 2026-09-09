#!/usr/bin/env node
/**
 * digest-compact.mjs — a lean HTML email body.
 *
 * The main digest template repeats a long inline style string on every element,
 * which is fine on disk but wasteful to move around. This produces the same
 * information at roughly a fifth of the bytes, using short shared style strings
 * and fewer wrappers. Inline styles only — Gmail is unreliable with <style>.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const jobs = rd('data/jobs.raw.json');
const profile = rd('profile.json');
const portal = profile.delivery?.portalUrl || '';
const M = jobs.matches || [];

const e = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const F = 'font-family:-apple-system,Segoe UI,Roboto,sans-serif';
const row = (m) => {
  const mern = m.resume === 'dev-mankad-resume-mern';
  return `<tr><td style="padding:11px 0;border-bottom:1px solid #e5e7eb">
<div style="${F};font-size:15px;font-weight:600;color:#111827">${e(m.title)}</div>
<div style="${F};font-size:13px;color:#374151;margin-top:2px"><b>${e(m.company)}</b> &middot; ${e(m.location || '?')} &middot; ${e(m.freshnessLabel || '')}</div>
<div style="${F};font-size:12px;margin-top:4px">send the <b style="color:${mern ? '#047857' : '#1d4ed8'}">${e(m.resumeLabel)}</b> resume${m.resumeConfidence !== 'high' ? ' <span style="color:#b45309">(check the JD)</span>' : ''}</div>
${m.blockers?.length ? `<div style="${F};font-size:12px;color:#b45309;margin-top:4px">&#9888; ${m.blockers.map(e).join(' &middot; ')}</div>` : ''}
<div style="margin-top:7px"><a href="${e(m.url)}" style="${F};font-size:12px;font-weight:600;color:#fff;background:#111827;text-decoration:none;padding:7px 11px;border-radius:4px">Open the JD &rarr;</a></div>
</td></tr>`;
};

const sect = (title, blurb, rows, color) => !rows.length ? '' : `
<div style="margin:0 0 20px">
<div style="border-left:3px solid ${color};padding:7px 11px;background:#f8fafc">
<span style="${F};font-size:13px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.04em">${e(title)}</span>
<span style="${F};font-size:12px;color:#6b7280"> &middot; ${rows.length}</span>
${blurb ? `<div style="${F};font-size:12px;color:#6b7280;margin-top:3px">${e(blurb)}</div>` : ''}
</div>
<table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">${rows.map(row).join('')}</table>
</div>`;

const apply = M.filter((m) => m.recommendation === 'apply');
const rev = M.filter((m) => m.recommendation !== 'apply');
const g = apply.filter((m) => m.channel === 'remote-global');
const i = apply.filter((m) => m.channel === 'india');

const html = `<div style="max-width:660px;margin:0 auto;padding:18px;background:#fff">
<div style="border-bottom:2px solid #111827;padding-bottom:9px;margin-bottom:18px">
<div style="${F};font-size:19px;font-weight:700;color:#111827">Job matches &mdash; 14-day sweep</div>
<div style="${F};font-size:12.5px;color:#6b7280;margin-top:3px">${jobs.stats.boards} company boards + 4 aggregator boards &middot; ${jobs.stats.rawJobs.toLocaleString()} postings scanned &middot; ${M.length} matched</div>
${portal ? `<div style="margin-top:9px"><a href="${e(portal)}" style="${F};font-size:12.5px;font-weight:600;color:#146B5F;text-decoration:none;border:1px solid #146B5F;border-radius:4px;padding:6px 10px">Open the console &rarr;</a></div>` : ''}
</div>
${sect('Remote — global', 'Non-Indian companies that hire where you live. Highest ceiling.', g, '#7A3E9D')}
${sect('India', 'Indian employers and India-located roles.', i, '#0E6FA8')}
${sect('Needs your judgement', '', rev, '#9A6206')}
<div style="${F};font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px;margin-top:8px">
Ranked newest-first &mdash; a 70% fit posted three hours ago beats a 90% fit posted six days ago.<br>
The attached tracker's <b>Apply</b> column deep-links straight to each application form.<br>
Nothing here was applied to automatically; every application is your own deliberate action.
</div></div>`;

fs.writeFileSync(path.join(ROOT, 'reports/latest-compact.html'), html);
console.log(`wrote reports/latest-compact.html  (${html.length} chars)`);
