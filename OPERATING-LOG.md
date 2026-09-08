# Operating log

**This file overrides `ROUTINE.md` and the routine prompt on any conflict.**

That inversion is deliberate, and it is the single best idea in Ankur Kapuriya's
runbook: the spec says what the system was *designed* to do, and this file says
what running it actually *taught* us. When they disagree, reality wins.

Add to it whenever a run surfaces something surprising. Keep entries dated and
tagged, and delete a `TRAP` only when the underlying cause is genuinely gone.

Tags: **TRAP** (a wrong answer that looks right) · **FIXED** (was broken, now
isn't — kept so it doesn't get reintroduced) · **WATCH** (true for now, may
drift) · **SCOPE** (a targeting decision, not a bug).

---

## 2026-09-08 · SCOPE · Two handoffs merged, one rule inverted

Built from two donated systems: Kelvi Manavadaria's BFSI DevOps runbook
(architecture, registries, resume variants) and Ankur Kapuriya's Daily Remote AI
Engineer runbook (eligibility shapes, freshness, sent-log, founder track).

**Ankur drops Indian-headquartered employers outright** — his hunt is explicitly
for non-Indian remote work. Dev's lane 1 is India metros. That rule is inverted
here: an Indian employer is classified into the `india` channel, never dropped.
See the comment block at the top of `scripts/lib/eligibility.mjs`. Do not copy
that rule back across without flipping it.

## 2026-09-08 · TRAP · A JD body is not a location

The India test originally ran against the whole job description. India-founded
companies mention "India" throughout their postings, so San Francisco, London
and Tel Aviv roles sailed through — 34 "matches" collapsed to 15 real ones once
the test moved to the ATS **location field** alone.

Corollary, learned the same way: a board's own country tag is not evidence
either. Ankur logged Himalayas repeatedly mistagging on-site EU/US roles as
"Worldwide", and Blend360's "India-remote" listings turning out to be
Hyderabad-only. **Verify against the actual posting, never the label.**

## 2026-09-08 · TRAP · Named foreign cities read as "unresolved"

"San Jose" is neither a country nor a US state, so it fell through to
*Unconfirmed* and got kept. Technically safe — Ankur's rule is to keep and label
rather than assume — but it buried real matches under on-site roles Dev can
never take. `FOREIGN_CITY` in `eligibility.mjs` now catches ~130 named cities.

Keeping-and-labelling is still right for genuinely ambiguous cases. It is only
wrong when the answer is actually knowable.

## 2026-09-08 · FIXED · ATS job pages are JS shells

`tailor.mjs --url` scraped the HTML of a job page and got an empty description,
scoring a perfect-fit Sarvam AI "Agent Engineer" role at **0% keyword coverage**.
Ashby, Greenhouse and Lever all render client-side.

`--url` now routes known ATS links through the same public JSON API the scanner
uses. Same posting scored 100% and flipped REVIEW → APPLY. Ankur reached the
same conclusion from the other direction — his source list notes pulling
Greenhouse boards via the public JSON API "to skip client-side rendering".

## 2026-09-08 · FIXED · The summary repeated itself

The tailoring engine assembled a summary from an opener plus clauses and could
pick two that paraphrased each other, so an agentic JD produced two consecutive
sentences both listing Claude Code skills, MCP servers and BMad. Clause
selection now rejects any candidate with >34% distinctive-word overlap against
what is already chosen.

## 2026-09-08 · FIXED · Never hand-set an ATS tier

Research agents proposed 45 ATS slugs. Live verification found **12 were wrong**
— 4 Workday slugs in the wrong format, 4 hard 404s, 4 reachable but empty. A
guessed slug that 404s silently removes a whole employer from every future scan.

`node scripts/verify_ats.mjs --write` is the only thing allowed to set
`tier: "A"`. Failures are downgraded with a dated note, never deleted — a board
can be legitimately empty for a week.

## 2026-09-08 · WATCH · Seniority is a gradient, not a wall

Adopted Ankur's decay model: full credit when 1–4 years are asked, zero by 6, a
stretch in between. Replaces a hard regex reject.

One deliberate divergence: Ankur only disqualifies on title at Director+, but he
is hunting roles that ask 1–4 years. At 2.7 years, a "Senior" title that *also*
asks 5+ years is not a stretch, it is a wasted afternoon — so that combination
rejects. A "Senior" title asking ≤4 years is usually title inflation at a small
company and stays as a flagged stretch.

## 2026-09-08 · WATCH · Freshness beats fit

Default ranking is newest-first, match quality second. Ankur's framing: a 70%
fit posted three hours ago outranks a 90% fit posted six days ago, because on
competitive remote roles the length of the queue ahead of you matters more than
the margin of fit. `--rank quality` inverts it when triaging a backlog.

Hard cutoff is 21 days (`--maxAgeDays`).

## 2026-09-08 · WATCH · Saturation is the expected end state

Ankur's log records yield dropping every week as a fixed source list gets fully
mined — day 13 surfaced 5 survivable rows against ~350 postings reviewed.

Expect the same here. **A quiet week is not a broken scanner.** The fix is new
sources, not a looser filter — loosening the filter just buys noise. When the
India channel goes quiet, add companies via `/registry-edit`; when the
remote-global channel goes quiet, work the founder track instead.

## 2026-09-08 · TRAP · Marketplaces wearing an employer's clothes

Ankur flags **micro1** as a training/gig marketplace rather than in-house
engineering, regardless of how a listing is titled — permanently out of scope.
The same applies to Turing, Andela, Toptal, Crossover and Deel Talent when they
list *their own* sourcing roles rather than a real employer's.

Dev's registry already contains Turing as a Tier-A board. That is fine for
*visibility* — but treat any listing whose employer is the marketplace itself as
out of scope, and only pursue ones naming a real end client.

## 2026-09-08 · WATCH · The ledger records what was sent, not what was seen

`state/seen-urls.json` is written at scan time; `state/sent-log.md` is written
only after delivery. That is Ankur's discipline and it matters: a run that dies
between scanning and emailing would otherwise bury those roles forever.

Related, and non-obvious enough that he had to fix it in production: any
research agent must be handed the **complete** ledger, never a source-specific
slice. A partial list is what let already-sent jobs reappear as "new".

## 2026-09-08 · WATCH · No device access from a cloud run

The scheduled routine runs in the cloud with no bridge to Dev's machine.
Delivery is the email plus what it commits back to the repo — never a local
save. Anything the routine wants to persist has to be pushed.

---

## Standing scope exclusions

Carried from both handoffs, plus Dev's own decisions:

- **Not targeted:** DevOps / SRE / platform / cloud (de-scoped 2026-09-08 —
  AWS CCP, Azure Fundamentals and the two cloud internships stay on the resume
  as supporting facts only), data/ML, QA, support.
- **MERN means MERN.** No Java, .NET, PHP, Go, Django-first or Rails-first
  full-stack roles. Django and Rails remain real delivered experience and stay
  on the resume; they are simply not targets.
- **MongoDB is a genuine gap.** Never claim it. A MERN JD that is hard on
  MongoDB is a stretch, and the match report will say so.
- **Never fabricate** an email, an ATS slug, a founder's LinkedIn, or a resume
  fact. An empty field is always the better answer.
