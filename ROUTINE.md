# ROUTINE.md — spec for the daily job-scan cloud routine

> **`OPERATING-LOG.md` overrides this file, and overrides the routine prompt,
> on any conflict.** Read it first. It records what running the system actually
> taught us, and reality wins over spec.

| | |
|---|---|
| Routine | **Dev — job scan (daily, 4:07am IST)** |
| Trigger id | `trig_019eYEjX9ZhdcCgaPBcqv3ZS` |
| Cron | `37 22 * * *` UTC = **04:07 IST**, daily |
| Model | `claude-sonnet-5` |
| Connectors | Gmail + Google Drive |
| Console | <https://claude.ai/code/routines/trig_019eYEjX9ZhdcCgaPBcqv3ZS> |
| Sibling | `OUTREACH-ROUTINE.md` — runs 75 min later at 05:22 IST |

**How the routine gets this repo:** it does **not** use a git checkout. Every
run it `curl`s the files it needs from `raw.githubusercontent.com`. That is why
**the repo must stay public** — and why a local edit changes nothing live until
it is pushed to `origin/main`.

**Where the prompt lives:** in the routine config, not here. Unlike the earlier
design, the prompt is *self-contained* — it has to be, because a cloud sandbox
starts with zero context and no checkout. This file is the human-readable spec
and the routine reads it too, but **changing behaviour now means editing the
prompt** at the console link above. Keep this file in sync when you do.

---

## Guardrails — never violate

- **Never apply to a job.** Never register, never create an account anywhere.
- **The only email it may send is one digest to `devmankad12@gmail.com`.**
  Never a company, a recruiter, or any third party.
- **Never fabricate** a job, URL, company, or date. Report only what the scan
  actually returned.
- If something fails, **say so** in the digest and in the final message.
  A silent partial run is worse than a loud broken one.

## Who this is for

Dev Mankad — Software Engineer, 2.7 years (since Jan 2024), Ahmedabad.

Target lanes (source of truth is `profile.json` → `targetLanes`):

1. **Mobile** — Flutter / Dart / KMP / Android / iOS / React Native
1. **Full-stack MERN / JavaScript** — React, Node, TypeScript
2. **Software Developer / SDE generalist** on a JS or mobile stack
2. **Forward Deployed / Solutions / Implementation Engineer**

Explicitly **not** wanted: DevOps / SRE / platform / cloud, data / ML, QA — and
since 2026-09-09, **AI/ML specialist titles too** (`profile.scanning._aiNote`:
Dev uses agentic tooling to write code, he is not applying to be an AI engineer;
it is a title filter, so a plain "Software Engineer" role at an AI company still
matches). Locations: India metros or Remote.

---

## Sources

Two kinds, swept in the same run:

- **~77 verified company ATS boards** — Greenhouse, Lever, Ashby, Workable,
  SmartRecruiters, Recruitee, Workday. One employer each, high signal.
- **4 aggregator boards with public APIs** — RemoteOK, Remotive, Himalayas, and
  the monthly Hacker News "Who is hiring" thread. Whole marketplaces, so the
  employer is read off the posting and **their eligibility tags are not
  trustworthy**. Rows from these carry `viaBoard` and must be verified against
  the actual posting before applying.
- **~106 Tier-B companies** have no usable ATS API. They are covered by a
  rotating WebFetch sweep — `slice = dayOfYear % 4`, ~26 per run, full registry
  every 4 days, hard cap of 30 fetches. This is the only expensive part of the
  run; the cap is deliberate.

LinkedIn, Naukri, Instahyre, Cutshort and Wellfound are login-gated. They are
manual-search channels in `data/platforms.json`; never point a scraper at them.

## Step 1 — state

The dedupe ledger is **`dev-job-hunt-seen-urls.json` in Google Drive**, not git.

That is a change from the original design, and it is forced: with a public-repo
`curl` and no GitHub app connection, the sandbox has **no write credentials**,
so it cannot `git push` state back. Drive is the same pattern Kelvi's routines
have run on daily since August.

```
{"generated":"<ISO>","urls":[ ... ]}
```

Read it **in full** before the scan — a partial ledger is what lets already-sent
jobs reappear as "new" — and write it back only **after** the email has gone.

## Step 2 — scan

```bash
node scripts/scan.mjs --maxAgeHours 36 --exclude-urls /tmp/sent.txt
```

Sweeps every verified Tier-A ATS board and the four aggregators, filters by role,
seniority, stack and the three eligibility shapes, applies the 21-day freshness
cutoff, ranks newest-first, dedupes, and writes `data/jobs.raw.json`.

`--maxAgeHours 36` is wider than the 24h gap between runs on purpose: a delayed
or skipped run then cannot open a hole where a posting is missed entirely. The
Drive ledger, not a narrow window, is what prevents re-reporting.

Results carry a `channel` of `india` or `remote-global`. Both go in the digest,
remote-global first — it is the higher-ceiling channel.

If it reports 0 boards or throws, run `node scripts/verify_ats.mjs` to see which
endpoints broke, email Dev a short plain-text note naming them, and stop.

## Step 3 — sanity-check before sending

Drop any row that:

- has no `url`, or whose url is a careers-page root rather than a specific posting;
- has Senior / Staff / Principal / Lead / Architect / Manager in the title;
- is clearly a DevOps, SRE, platform, cloud, data, ML, AI-specialist or QA role
  that slipped through the regex;
- names a marketplace (micro1, Andela, Toptal, Crossover, Turing, Deel Talent) as
  the employer rather than a real end client.

If anything is dropped, say so in one line at the end of the email so the filters
can be tightened.

## Step 4 — build the digest

```bash
npm run digest                      # reports/latest.html + a dated reports/*.md
node scripts/digest.mjs --subject   # the subject line
```

`reports/latest.html` is an **HTML fragment**, not a full document — no
`<html>`/`<body>` wrapper — so the Tier-B section is appended by plain string
concatenation. The fragment already carries the Job Hunt Console link.

## Step 5 — email, only if there is something to say

**If there are zero matches: send nothing and end the run.** Silence is the
expected outcome on a quiet day — there is deliberately no heartbeat email.

| Field | Value |
|---|---|
| to | `devmankad12@gmail.com` |
| subject | stdout of `node scripts/digest.mjs --subject` |
| htmlBody | `reports/latest.html` + the Tier-B section, if any |
| body | plain-text fallback: one `Company — Title — URL` per line |

Footer line names boards that errored, the Tier-B slice and skip count, and how
many rows the sanity-check dropped.

## Step 6 — persist state

**Only after the email has actually gone out** — never before. The ordering is
the point: the ledger must record what was *delivered*, not what was
*considered*.

Append the reported URLs to `dev-job-hunt-seen-urls.json` in Drive, bump
`generated`, trim oldest-first past ~2000 entries.

---

## Tuning

| Want to change | Do this |
|---|---|
| Cadence | Edit `cron_expression` at the console link, or via `/schedule` |
| How far back it looks | `--maxAgeHours` in the routine prompt |
| Which roles match | `profile.json` → `scanning.roleRegex`, `data/keywords.json` → push |
| Which locations count | `profile.json` → `scanning.indiaRegex` / `foreignRejectRegex` → push |
| Tier-B sweep size | the `% 4` modulus and the 30-fetch cap, in the prompt |
| What the email looks like | `scripts/digest.mjs` → push |
| **What the routine does** | **The routine prompt.** Then sync this file. |

## Known divergence

The cloud routine dedupes against **Drive**; a local `npm run jobhunt` dedupes
against **`state/seen-urls.json` in git**. They are two separate ledgers, so a
job you saw locally can still appear in a cloud digest, and vice versa. Living
with that is the price of having no write credentials in the sandbox. If it gets
annoying, connect GitHub to the Claude account, attach the repo to the routine,
and move state back to `git commit && git push`.
