# dev-job-hunt

Dev Mankad's job-hunt automation. Finds relevant postings across two channels,
scores them against real experience, and **rewrites the resume for each one**.

It never auto-applies, never auto-registers, and never emails anyone but Dev.

**Start with [HANDOFF.md](HANDOFF.md)** — it documents the whole system.

---

## Run it

```bash
npm run jobhunt          # the whole pipeline, both channels
npm run jobhunt:wide     # 30-day window, ignore dedupe state
```

Five steps in a deliberate order: read the sent-log → scan → digest → tracker →
append the ledger **last**, so it records what was *delivered*, not what was
merely *considered*.

Tailor the resume for one posting:

```bash
node scripts/tailor.mjs --url "<JD link>" --company "X" --title "Y"
```

## Two channels

| | |
|---|---|
| **`india`** | Indian employers and India-located roles. Lane 1. |
| **`remote-global`** | Non-Indian companies that hire someone living in India, direct or via an EOR. Higher ceiling. |

## The files that matter

| Path | What |
|---|---|
| [HANDOFF.md](HANDOFF.md) | The full system doc — read this first |
| [OPERATING-LOG.md](OPERATING-LOG.md) | What running it actually taught us. **Overrides the spec on any conflict.** |
| [ROUTINE.md](ROUTINE.md) | What the scheduled cloud routine reads and follows |
| [APPLY-REFERENCE.md](APPLY-REFERENCE.md) | Identity and form answers |
| `profile.json` | Targeting source of truth |
| `resume/resume-content.json` | Resume source of truth — every fact, tagged |

## The one rule

The tailoring engine may only **reorder, select and re-emphasise** what already
exists in `resume/resume-content.json`. It cannot author a fact, and a safety
gate fails the run if the output would assert anything outside that file.

To add something true but missing, edit `resume-content.json` first — never patch
a generated file in `resume/tailored/`.

---

*Private repo: `profile.json` and `APPLY-REFERENCE.md` contain personal contact
and compensation details. Keep it that way.*
