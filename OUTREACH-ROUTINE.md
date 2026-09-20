# OUTREACH-ROUTINE.md — spec for the daily outreach-contact harvest

> **`OPERATING-LOG.md` overrides this file, and overrides the routine prompt,
> on any conflict.**

| | |
|---|---|
| Routine | **Dev — outreach contacts (daily, 5:22am IST)** |
| Trigger id | `trig_01NMz34DxWYs7ewdrMV4gFqd` |
| Cron | `52 23 * * *` UTC = **05:22 IST**, daily |
| Model | `claude-sonnet-5` |
| Connectors | Gmail + Google Drive |
| Console | <https://claude.ai/code/routines/trig_01NMz34DxWYs7ewdrMV4gFqd> |
| Sibling | `ROUTINE.md` — the job scan, runs 75 min earlier at 04:07 IST |

This routine finds **people to email**, not postings. It runs *after* the scan
on purpose: its highest-intent targets are companies the scan just reported,
which it reads out of the scan's own Drive ledger.

Same delivery mechanics as the scan: no checkout, `curl` from the public repo,
state in Drive, no heartbeat email.

---

## Guardrails — never violate

- **Never fabricate, guess, or pattern-construct an email address.** Only an
  address that literally appears on a page fetched this run, in a public post
  body, or inside a JD — or one already non-empty in `data/recruiters.json`.
  No `careers@<domain>`, no `firstname.lastname@<domain>`, ever. An empty
  section is always the better answer.
- **The only email sent is the digest to `devmankad12@gmail.com`.** Zero
  outreach. Nothing goes to any firm, company, founder or individual. Dev
  decides who to contact and writes those notes himself.
- **No login-gated scraping.** LinkedIn means public/guest fetch and web search.
- **Hard cap ~60 web calls per run.** The rotating slice reaches everything
  within a week; there is no reason to exceed it.

## What it searches for

Dev's niche only: Mobile (Flutter / Dart / KMP / Android / iOS / React Native),
MERN / JavaScript full-stack, SDE generalist on those stacks, and Forward
Deployed / Solutions / Implementation Engineer. India metros + remote.

Not his niche, so not searched: DevOps / SRE / platform / cloud, AI-ML
specialist, data, QA, Java / .NET / PHP / Go.

## The five channels, per run

| # | Channel | Scope each run |
|---|---|---|
| 1 | **Companies with a new opening** | `dev-job-hunt-seen-urls.json` minus `processedJobUrls`, capped at the 40 newest. Highest intent — the scan just proved they are hiring a role Dev wants. |
| 2 | **Recruiting / staffing firms** | All ~8 in `data/recruiters.json`, every run. Small enough not to rotate. |
| 3 | **Company HR / Talent Acquisition** | Rotating slice, `i % 7 == dayOfYear % 7` (~26 of 183). Full sweep every 7 days. |
| 4 | **LinkedIn "mail-to" posts** | 6–10 public web searches for "share your CV at" style posts carrying an inline address. |
| 5 | **Founders / early-stage** | One priority-1 channel from `data/founder-channels.json` per run, rotating. ~10 web calls. Highest pay ceiling. |

Sections are mutually exclusive **by entity**: if a company is both in today's
slice and has a new opening, its contacts appear only under *new opening*.

## Why `data/recruiters.json` matters most right now

It holds **8 firms, none verified, none with a contact email**. Kelvi's
equivalent registry has ~113 firms and 18 verified addresses, and that is the
single biggest capability gap between the two systems.

So when this routine finds a real firm address, the digest flags it in green:
add it via `/registry-edit` so the next run skips the lookup and spends that
budget somewhere new. Every address added compounds.

## State

`dev-job-hunt-outreach-contacts.json` in Google Drive — its own file:

```
{"generated":"<ISO>","contacts":[],"noContactFound":[],"processedJobUrls":[],
 "cursorNote":"companies slice = dayOfYear % 7"}
```

It also **reads, never writes**, the scan routine's `dev-job-hunt-seen-urls.json`.

`noContactFound` is not a failure log — it is a cost optimisation. Most
companies never publish a recruiting address; recording that fact lets later
slices skip them instead of paying for the same dead end every week.

Dedupe key is the **lowercased email address**. A contact is new only if that
address has never appeared before.

## The email

Only if there is ≥1 genuinely new contact. Five colour-headed sections, always
all five rendered, `— none this run` under the empty ones:

| Colour | Section |
|---|---|
| blue `#1a73e8` | Recruiting / staffing firm contacts |
| green `#188038` | Company HR / Talent Acquisition contacts |
| amber `#b06000` | LinkedIn "mail-to" posts |
| purple `#8430ce` | Contacts at companies with a NEW opening |
| teal `#146B5F` | Founders / early-stage direct |

Each row: `mailto:` link, name and title if known, entity + priority, source URL,
the context it was seen in, and `firstSeen`. Footer names the slice, how many
entities were checked, how many yielded an address, the founder channel used,
and the web-call count.

## Tuning

| Want to change | Do this |
|---|---|
| Cadence | `cron_expression` at the console link |
| Company sweep speed | the `% 7` modulus in the prompt |
| Cost ceiling | the ~60-call cap and the ~10-call founder budget |
| Search phrasings | the STEP 5 example queries in the prompt |
| **What the routine does** | **The routine prompt.** Then sync this file. |
