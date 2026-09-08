# Job-hunt system — handoff

Everything needed to run Dev Mankad's job hunt: the automated scan, the resume
engine that adapts per posting, the data registries, the apply flow, and how the
pieces sync. Written 2026-09-08.

---

## 0. What this is

A **discovery → matching → tailoring** pipeline. It finds relevant postings,
scores them against Dev's real experience, and **automatically rewrites his
resume for each one**. It never auto-applies, never auto-registers, and never
emails anyone but Dev.

Built by merging two donated systems, neither of which was written for Dev:

| | Kelvi Manavadaria's handoff | Ankur Kapuriya's runbook |
|---|---|---|
| Its target | BFSI DevOps/SRE, India, 25 LPA | Remote AI Engineer, outside India, USD 30k |
| What was taken | architecture, registries, tiered channels, resume-variant system, apply flow | eligibility shapes, freshness-first ranking, sent-log discipline, source-health honesty, founder track, operating log |
| What was inverted | targeting rebuilt for Dev's stack (BFSI DevOps → AI/mobile/MERN) | **Indian employers are NOT dropped** — they are Dev's lane 1 |

**Two channels now run off one scan:**

- **`india`** — Indian employers and India-located roles. Lane 1. Band 11–20 LPA.
- **`remote-global`** — non-Indian companies that will hire someone living in
  India, direct or via an EOR. USD 30k ≈ 25 LPA, about **2.8x** Dev's current.
  This is where the ceiling actually is.

Candidate snapshot (source of truth: `profile.json` + `resume/resume-content.json`):

- Software Engineer, 2.7 yrs (since Jan 2024) at Gateway Group, Ahmedabad.
- **Three target lanes:** AI/Agentic + Forward Deployed · Flutter/KMP mobile · MERN full-stack.
- **Not targeted:** DevOps/SRE/platform/cloud, data/ML, QA.
- Locations: India metros + Remote. Indian citizen, no sponsorship needed for India.
- Differentiator: production agentic engineering — Claude Code skills, MCP
  servers, BMad multi-agent, `/dev-loop`, `/design-spec`.
- Rare credential: shipped a **DiGA- and PECAN-certified** healthcare app.

---

## 1. Where everything lives

```
E:\claude sessions\job hunt\
├── WORKFLOW.md                  the handoff this system was modelled on (Kelvi's BFSI DevOps system)
├── dev-mankad-resume-jul26.pdf  the source resume
├── .claude/skills/              5 skills (see §5)
└── dev-job-hunt/                THE REPO  ← git, push this to GitHub
    ├── HANDOFF.md               this file
    ├── ROUTINE.md               spec the cloud routine reads and follows
    ├── APPLY-REFERENCE.md       identity + form answers
    ├── profile.json             targeting source of truth
    ├── OPERATING-LOG.md          what running it taught us — OVERRIDES the spec
    ├── data/
    │   ├── companies.json       134 companies, 45 verified Tier-A
    │   ├── remote-sources.json  17 remote-global boards, with honest health notes
    │   ├── founder-channels.json 14 founder-sourcing channels + outreach playbook
    │   ├── keywords.json        12 JD archetypes — drives matching AND tailoring
    │   ├── platforms.json       job boards, 6 tiers
    │   ├── recruiters.json      staffing firms (partial — needs a research pass)
    │   └── comp-bands.json      salary reference (estimates)
    ├── resume/
    │   ├── resume-content.json  RESUME SOURCE OF TRUTH — every fact, tagged
    │   └── tailored/            generated per application (gitignored)
    ├── scripts/                 scan · tailor · digest · verify_ats
    ├── adapters/ats.mjs         greenhouse/lever/ashby/recruitee/smartrecruiters/workable/workday
    ├── state/                   seen-urls.json · sent-log.md · applications.csv
    ├── templates/               cover letter · outreach intro
    └── reports/                 generated digests
```

---

## 2. The resume engine — the part that makes this different

Kelvi's system *suggested* one of 12 pre-written resume variants. This one
**generates a new resume per posting**.

```bash
cd dev-job-hunt
node scripts/tailor.mjs --url "<JD link>" --company "Acme" --title "Flutter Engineer"
```

### What it actually does

1. **Detects the archetype** from 12 (title-dominant, so "Flutter Engineer" wins
   over a body full of React mentions).
2. **Reorders skill categories** so the JD's headline technology leads.
3. **Reorders every bullet** in each role and project by relevance to the JD.
4. **Assembles the summary** from pre-approved openers + clauses.
5. **Moves the Agentic Engineering section above or below Experience** depending
   on whether the JD cares.
6. **Emits** `.tex`, `.md`, `.txt` + a match report.

### The honesty guarantee

The engine can only **reorder, select and re-emphasise** what already exists in
`resume/resume-content.json`. It cannot author a fact. `verifyHonesty()` hard-fails
the run if the output would assert anything outside the master file, and
`doNotClaim` lists what Dev genuinely does not have — **MongoDB**, Kubernetes,
RAG/vector DBs, ML training, GCP, and any numeric metric (the source resume
contains none, so none may be invented).

Nothing is ever dropped: every skill, certification and qualification survives —
only the *order* changes. `--max-bullets` is the one exception and it logs
exactly what it cut.

### The match report — read it every time

`resume/tailored/<base>.report.md` gives:

- **Recommendation** — apply / review / skip, with blockers
- **ATS keyword coverage** — % of JD-relevant terms the resume shows
- **Keywords the JD wants that your resume does not show** — check each honestly;
  if true and missing, add it to `resume-content.json`, never to the output file
- **Real gaps** — what the JD wants that Dev genuinely lacks. Do not claim these.
  Use them to prepare, and to decide what to say in the cover letter.

---

## 3. The scanner

```bash
npm run scan              # both channels, dedupes, records state
npm run scan:global       # remote-global only
npm run scan:india        # India only
npm run scan:wide         # 14 days, ignores state
npm run daily             # scan + digest + tracker + ledger, in order
node scripts/scan.mjs --loc bengaluru --rank quality
```

### Three screening rules worth knowing

**Eligibility is three shapes, and only three** (`scripts/lib/eligibility.mjs`).
Qualifies: worldwide with no country named; India named; or plain unqualified
"Remote". Drops: any single-country or bloc lock, US-state-scoped remote, a named
foreign city. When it cannot be confirmed either way it is **kept and labelled
Unconfirmed** — never assumed.

**Freshness beats fit.** Hard 21-day cutoff, ranked newest-first: a 70% fit
posted three hours ago outranks a 90% fit posted six days ago, because on
competitive roles the queue ahead of you matters more than the margin of fit.
`--rank quality` inverts it when triaging a backlog.

**Seniority is a gradient.** Full credit when 1–4 years are asked, zero by 6, a
stretch in between. A "Senior" title that *also* asks 5+ years rejects; a
"Senior" title asking ≤4 is usually title inflation and stays as a flagged
stretch. Director/Staff/Principal/Architect titles hard-reject.

Sweeps **45 verified Tier-A boards** → filters role, seniority, stack and
eligibility → applies the freshness cutoff → scores each survivor → dedupes.

**Location is judged on the ATS location field, not the JD body.** India-founded
companies mention "India" throughout their postings, which was letting San
Francisco and London roles through.

**And a board's own country tag is not evidence either.** Verified, not assumed:
Himalayas tagged a role reading *"Location: Fort, Western Province, Sri Lanka"*
as US-only, and We Work Remotely marks 23 of 25 jobs "Anywhere in the World".
`data/remote-sources.json` records `countryTagQuality` per source — check it
before trusting a label.

### Keeping the registry honest

```bash
node scripts/verify_ats.mjs --write
```

Live-fetches every claimed ATS endpoint and sets the tier from what actually
answered. **Never hand-set `tier: "A"`** — a guessed slug that 404s silently
removes a whole employer from every future scan. On the first run 33 of 45
claimed endpoints were live; the 12 failures were downgraded with a dated note,
not deleted.

### The two state files, and why there are two

| File | Written | Purpose |
|---|---|---|
| `state/seen-urls.json` | at **scan** time | fast dedupe within and across runs |
| `state/sent-log.md` | after **delivery** | the exact record of what actually went out |

That split is Ankur's discipline and it matters: a run that dies between
scanning and emailing would otherwise bury those roles forever. The ledger is
read in full before a run and appended to only once outputs are final.

```bash
node scripts/ledger.mjs list      # what has gone out
node scripts/ledger.mjs urls      # feeds scan.mjs --exclude-urls
node scripts/ledger.mjs commit    # append this run, after delivery
```

Jobs dedupe on **Company + Title + Link**; founder companies on **company name
alone**. A near-miss — same company, ambiguous whether it is the same underlying
opening — is dropped and noted rather than risked as a repeat.

### `OPERATING-LOG.md` overrides everything

The spec says what the system was *designed* to do. `OPERATING-LOG.md` says what
running it actually *taught* us, and **it wins on any conflict** — including
against `ROUTINE.md` and the routine prompt. Every trap found so far is recorded
there with a date and a tag. Read it before changing a filter.

---

## 4. The cloud routine

| | |
|---|---|
| Name | `Job scan — AI/Agentic + Mobile + MERN (3x daily)` |
| Schedule | `40 3,8,14 * * *` UTC = **09:10 / 14:10 / 20:10 IST** |
| Spec | `ROUTINE.md` — the prompt just says "read ROUTINE.md and follow it" |
| Needs | the repo on GitHub + the **Gmail connector attached to the routine** |

Because the prompt delegates to `ROUTINE.md`, **changing what the routine does is
a repo edit + push** — no `/schedule` prompt surgery. Only the cadence lives in
the trigger config.

Each run: scan → digest → sanity-check → email (only if there are matches) →
commit state back. **No heartbeat email. Silence means nothing new.**

---

## 5. Skills

| Skill | Use it when |
|---|---|
| `/daily-review` | "what's new today" — scan, triage, tailor |
| `/tailor-resume` | you have a JD and want the resume adapted |
| `/apply-assist` | filling a form or writing a cover letter |
| `/registry-edit` | adding a company, board, or recruiter |
| `/recruiter-outreach` | drafting a note to a recruiter |
| `/remote-global` | remote-global roles, USD/EOR work, founder outreach |

---

## 6. Applying

1. `/tailor-resume` against the JD.
2. Read the match report. Believe the "Real gaps" section.
3. Compile `<base>.tex` → PDF (Overleaf, or local `pdflatex`). Use `<base>.txt`
   for "paste your resume" boxes.
4. Fill the form from `APPLY-REFERENCE.md`. Anything marked **TODO(Dev)** —
   current CTC, expected CTC, notice period, graduation year, LinkedIn, GitHub —
   **stop and ask**. Never guess.
5. EEO questions → "Decline to self-identify".
6. **Review, then submit yourself.** Never auto-submit.
7. Log it in `state/applications.csv`.

---

## 7. Sync model

| Change | How it goes live |
|---|---|
| Company / board / recruiter / keyword edit | edit JSON → commit → **push** |
| Resume fact | edit `resume/resume-content.json` → commit → push |
| What the routine *does* | edit `ROUTINE.md` → commit → push |
| Routine cadence | `/schedule` → edit `cron_expression` |

The routine works from a git checkout, so **a local edit changes nothing live
until it is pushed to `origin/main`.**

---

## 8. Guardrails — non-negotiable

- **No auto-apply, no auto-register, no cold mail.** Discovery and reporting only.
- **Never fabricate** a contact email, a job, an ATS slug, or a resume fact.
- **Exact apply link on every lead** — never a bare company name or careers root.
- **No invented resume content** — nothing outside `resume-content.json`.
  Especially: no metrics, since the source resume has none.
- **Respect ToS** — public unauthenticated ATS APIs only. Never point a scraper
  at LinkedIn; guest browser search only.
- **Salary is always "(estimated)"** unless the JD states a number, and is never
  a hard reject filter.
- **Confirm before pushing** to `origin/main`.

---

## 9. Open items

- [ ] **Push the repo to GitHub** and attach it + the Gmail connector to the
      routine. Nothing automated runs until this is done. See §11.
- [ ] **Fill the TODOs in `profile.json`:** `currentCtcLPA`, `expectedCtcLPA`,
      `noticePeriodDays`, `linkedin`, `github`. Forms ask for all five constantly.
- [ ] **Add a GitHub link.** For AI/agentic roles a public repo showing the
      `/dev-loop` and MCP work is likely the strongest single signal available —
      stronger than the resume itself.
- [ ] **`data/recruiters.json` is partial** (8 firms, no verified emails). The
      research pass for it hit a session limit. Re-run via `/registry-edit`.
- [ ] **`data/comp-bands.json` numbers are estimates**, not sourced. Verify on
      Levels.fyi / AmbitionBox before quoting any of them.
- [ ] **12 companies failed ATS verification** — 4 Workday slugs need the
      `"<host>/<site>"` format, 4 returned 404, 4 were reachable but empty.
      They sit at Tier B and are still swept manually.
- [ ] **MongoDB is the one real MERN gap.** Either learn it and add it to
      `resume-content.json`, or accept MERN as the third lane.

---

## 10. Honest assessment of the search

**Lead with the AI/agentic lane.** Dev has genuinely operated multi-agent systems
in a production pipeline at 2.7 years. That is rare, it is the highest-paying
lane, and the field is young enough that "3-5 years of AI experience" functionally
means "has actually shipped agents" — so the stated year counts should not deter
him. First scan already surfaced Sarvam AI (Agent Engineer, Bengaluru), Netomi
(Agentic Engineer II/III, remote India), Dscout (Applied AI Engineer, remote
India) and Razorpay (Forward Deployed Engineer).

**Mobile is the volume lane** — deepest track record, most reliable interviews.

**MERN is the fallback** — highest competition, least differentiation, and the
MongoDB gap is real.

The Ahmedabad-to-Bengaluru comp gap is the strongest financial argument for
remote or relocation; see `data/comp-bands.json`.

---

## 11. First-run checklist

```bash
# 1. Create the repo on GitHub (private is fine), then:
cd "E:/claude sessions/job hunt/dev-job-hunt"
git remote add origin https://github.com/<you>/dev-job-hunt.git
git branch -M main
git push -u origin main
```

2. At <https://claude.ai/code/routines>, open the routine, attach the repo and
   the **Gmail connector**, and save.
3. Run it once manually to confirm the email arrives.
4. Fill the `profile.json` TODOs.
