# ROUTINE.md — spec for the scheduled cloud routine

The cloud routine's prompt is deliberately one line: *"Read ROUTINE.md in the
repo root and follow it exactly."* This file is the real spec. Edit it here,
push, and the next run picks it up — no `/schedule` prompt edit needed.

---

> **`OPERATING-LOG.md` overrides this file on any conflict.** Read it first. It
> records what running the system actually taught us, and reality wins over spec.

## Guardrails — never violate

- **Never apply to a job.** Never register, never create an account anywhere.
- **The only email you may send is one digest to `devmankad12@gmail.com`.**
  Never email a company, a recruiter, or any third party.
- **Never fabricate** a job, URL, company, or email address. Report only what the
  scan actually returned.
- If something fails, **say so** in the digest and in your final message.
  A silent partial run is worse than a loud broken one.

## Who this is for

Dev Mankad — Software Engineer, 2.7 years (since Jan 2024), based in Ahmedabad.

Three target lanes, in priority order:

1. **AI / Agentic Engineer + Forward Deployed Engineer** — his differentiator
2. **Mobile** — Flutter / Kotlin Multiplatform / cross-platform
3. **Full-stack MERN only**

Explicitly **not** wanted: DevOps / SRE / platform / cloud, data / ML, QA.
Locations: India metros (Bengaluru, Pune, Hyderabad, Mumbai, NCR, Chennai,
Ahmedabad) or Remote.

---

## Step 1 — scan

```bash
node scripts/ledger.mjs urls > /tmp/sent.txt   # read the ledger IN FULL first
npm run scan -- --exclude-urls /tmp/sent.txt
```

Runs `scripts/scan.mjs`: sweeps every verified Tier-A ATS board, filters by role,
seniority, stack and the three eligibility shapes, applies the 21-day freshness
cutoff, ranks newest-first, dedupes, and writes `data/jobs.raw.json`.

Results carry a `channel` of `india` or `remote-global`. Both go in the digest,
remote-global first — it is the higher-ceiling channel.

If it reports 0 boards or throws, run `node scripts/verify_ats.mjs` to see which
endpoints broke, email Dev a short plain-text note naming them, and stop.

## Step 2 — build the digest

```bash
npm run digest
```

Writes `reports/latest.html` and a dated `reports/*.md`.

## Step 3 — sanity-check before sending

Read `data/jobs.raw.json` and drop any row that:

- has no `url`, or whose url is a careers-page root rather than a specific posting;
- has Senior / Staff / Principal / Lead / Architect / Manager in the title;
- is clearly a DevOps, SRE, platform, cloud, data, ML or QA role that slipped
  through the regex.

If you drop anything, mention it in one line at the end of the email so the
filters can be tightened.

## Step 4 — email, only if there is something to say

**If there are zero matches: send nothing and end the run.** Silence is the
expected outcome on a quiet day — there is deliberately no heartbeat email.

Otherwise send exactly one email:

| Field | Value |
|---|---|
| to | `devmankad12@gmail.com` |
| subject | exact stdout of `node scripts/digest.mjs --subject` |
| htmlBody | full contents of `reports/latest.html` |
| body | plain-text fallback: one `Company — Title — URL` per line |

Add a line at the bottom naming any boards that errored, so Dev can fix the
registry.

## Step 5 — persist state

**Only after the email has actually gone out** — never before:

```bash
node scripts/ledger.mjs commit
python scripts/tracker.py --append
git add state/ reports/ data/jobs.raw.json
git commit -m "scan: <N> new matches <YYYY-MM-DD HH:MM> IST"
git push
```

The ordering is the point. `state/sent-log.md` must record what was *delivered*,
not what was *considered* — a run that dies before the email would otherwise
bury those roles forever.

**If the push fails** (no write credentials), say so explicitly in your final
message. The run is still useful — Dev will just see some repeats until it is
fixed. Do not fail the whole run over it.

## Final message

Two or three sentences: how many boards were scanned, how many matches were
emailed, and anything that broke.

---

## Tuning

| Want to change | Do this |
|---|---|
| Cadence | Edit the routine's `cron_expression` via `/schedule` |
| How far back it looks | `--maxAgeHours` in `package.json` → `scripts.scan` |
| Which roles match | `profile.json` → `scanning.roleRegex` and `data/keywords.json` |
| Which locations count | `profile.json` → `scanning.indiaRegex` / `foreignRejectRegex` |
| What the email looks like | `scripts/digest.mjs` |
| **What the routine does** | **This file.** Edit, push, done. |

## Schedule

`40 3,8,14 * * *` UTC = **09:10, 14:10 and 20:10 IST**, daily.

Deliberately off the :00/:30 marks to avoid the global cron thundering herd.
