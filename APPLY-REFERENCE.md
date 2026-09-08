# Apply reference — form answers

Paste this file (or the relevant section) into Claude when filling an application
form. Anything marked **TODO(Dev)** is not known to this repo — Claude must
**stop and ask**, never guess.

> **Never auto-submit.** Claude fills, Dev reviews, Dev clicks submit.

---

## Identity

| Field | Value |
|---|---|
| Full name | Dev Mankad |
| Email | devmankad12@gmail.com |
| Phone | +91 7990538590 |
| Location | Ahmedabad, Gujarat, India |
| Nationality | Indian |
| Work authorisation (India) | Indian citizen — no sponsorship required |
| Work authorisation (US/EU/UK) | **Not authorised.** Would require sponsorship. Answer "No" to "are you authorised to work in X without sponsorship". |
| LinkedIn | **TODO(Dev)** — not on the resume. Fill in `profile.json` and `resume-content.json`. |
| GitHub | **TODO(Dev)** — same. This one matters: for AI/agentic roles a public repo is often the strongest single signal you can send. |
| Portfolio / personal site | **TODO(Dev)** — optional but useful. |

## Current employment

| Field | Value |
|---|---|
| Current employer | Gateway Group of Companies |
| Current title | Software Engineer |
| Start date | January 2024 |
| Total experience | 2.7 years (as of September 2026) |
| Currently employed | Yes |
| Reason for looking | Growth into AI/agentic engineering and a stronger product environment. Keep it forward-looking; never criticise the current employer. |

## Compensation & availability

| Field | Value |
|---|---|
| Current CTC | **TODO(Dev)** — fill `profile.json` → `compensation.currentCtcLPA` |
| Expected CTC | **TODO(Dev)** — fill `profile.json` → `compensation.expectedCtcLPA`. See `data/comp-bands.json` for the bands first. |
| Notice period | **TODO(Dev)** — fill `profile.json` → `availability.noticePeriodDays` |
| Willing to relocate | Yes — Bengaluru, Pune, Hyderabad, Mumbai, NCR, Chennai |
| Open to remote | Yes |
| Preferred location | Ahmedabad or Remote; will relocate for the right role |

> Where a form lets you give a **range** rather than a number, give the range.
> Where it demands "current CTC" as a hard field, that is a capping tactic —
> answer it, but lead the conversation with your expected band.

## Education

| Field | Value |
|---|---|
| Highest qualification | B.Tech, Information Technology |
| Institution | Charotar University of Science and Technology (CHARUSAT), Changa, India |
| Also | Diploma in Computer Engineering, Government Polytechnic, Jamnagar |
| Graduation year | **TODO(Dev)** — not on the resume; forms ask constantly. |

## Certifications

- AWS Certified Cloud Practitioner
- Microsoft Azure Fundamentals

## EEO / diversity questions

Default to **"Decline to self-identify"** on every voluntary EEO, gender, race,
veteran and disability question. These are voluntary by law in every jurisdiction
that asks them and have no bearing on the application.

## Screening questions — stock answers

**"Why are you interested in this role?"**
Draw from the JD. Use the `evidenceForThisRole` list in the tailored resume's
`.report.md` — it names the specific true facts that map to that posting.

**"Describe your experience with [X]"**
Only from `resume/resume-content.json`. If X is on the `doNotClaim` list, say
plainly that you have not used it in production and describe the nearest genuine
adjacent experience. Never inflate — it collapses in the technical round.

**"What is your experience with AI?"**
This is Dev's strongest answer and it is genuinely differentiated:
> I design and operate AI agent systems in a production delivery pipeline. I built
> `/dev-loop`, which takes a single requirement — a Slack thread, PRD or Jira key —
> and drives it through triage, ticketing, code generation, a hard definition-of-done
> gate with an automated standards audit and tests, and stakeholder documentation.
> I extended the agent runtime with MCP servers for Jira, Confluence, Slack and
> Figma so agents manage tickets and publish docs autonomously, and I use the BMad
> multi-agent method with adversarial verification for complex features.

**"Notice period / when can you join?"** → **TODO(Dev)**. Ask, never guess.

**"Are you interviewing elsewhere?"** → Honest and brief. "I'm early in a focused
search" is enough.

---

## Cover letter

Template at `templates/cover_letter.tpl.md`. Three short paragraphs:
what you build, one specific proof mapped to their JD, and why them. Never more
than 200 words unless the form demands it.
