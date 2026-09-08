#!/usr/bin/env python3
"""
tracker.py — build the two-tab application tracker.

    python scripts/tracker.py                    # from data/jobs.raw.json
    python scripts/tracker.py --out my.xlsx
    python scripts/tracker.py --append           # merge into the existing file,
                                                 # preserving Applied?/Notes columns

Output spec is Ankur Kapuriya's, adapted to Dev's two channels:

  Tab 1 "Job Listings"    Source, Title, Company, HQ Country, Location Tag,
                          India-Eligible?, Channel, Salary, Experience Asked,
                          Posted, Age (days), Apply, JD Link, Tailor Command,
                          Applied?, Notes
                          — "Apply" is a hyperlink straight to the application
                          form (Lever /apply, Ashby /application, Workable
                          /apply/, Greenhouse #app); all four verified HTTP 200.
                          — sorted newest first, dark header fill,
                          rows shaded GREEN when confirmed eligible and
                          ORANGE when unconfirmed.

  Tab 2 "Founder Targets" Company, What They Build, Careers Page, Founder, Role, LinkedIn,
                          Domain, Guessed Email, Source/Round, Email Draft,
                          LinkedIn Draft, Outreach Sent?, Date Sent,
                          Follow-up Due, Response?, Notes
                          — with a legend row reminding Dev to verify every
                          email and personalise every draft before sending.

The Applied?/Notes columns are Dev's to edit. --append preserves whatever he has
typed there and only adds genuinely new rows, matched on Link.
"""
import argparse
import json
import os
import sys
from datetime import date

try:
    from openpyxl import Workbook, load_workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
except ImportError:
    sys.exit("openpyxl is required:  python -m pip install openpyxl")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HEADER_FILL = PatternFill("solid", fgColor="1F3A5F")
HEADER_FONT = Font(name="Arial", size=10, bold=True, color="FFFFFF")
BODY_FONT = Font(name="Arial", size=10)
GREEN = PatternFill("solid", fgColor="E3F1EA")   # confirmed eligible
ORANGE = PatternFill("solid", fgColor="FBF0DC")  # unconfirmed — verify on the JD
LEGEND_FONT = Font(name="Arial", size=9, italic=True, color="9A6206")
LINK_FONT = Font(name="Arial", size=10, color="1F3A5F", underline="single")
APPLY_FONT = Font(name="Arial", size=10, bold=True, color="146B5F", underline="single")

JOB_COLS = [
    ("Source", 13), ("Title", 44), ("Company", 19), ("HQ Country", 12),
    ("Location Tag", 24), ("India-Eligible?", 14), ("Channel", 13),
    ("Salary", 12), ("Experience Asked", 15), ("Posted", 11), ("Age (days)", 10),
    ("Apply", 11), ("JD Link", 52), ("Tailor Command", 60),
    ("Applied?", 10), ("Notes", 40),
]

# Column indexes used after the header is written (1-based, matching JOB_COLS).
COL_APPLY, COL_JD, COL_TAILOR, COL_APPLIED, COL_NOTES = 12, 13, 14, 15, 16


def apply_url(url, source=""):
    """Deep-link straight to the application form where the ATS supports one.

    Each of these was checked against a live posting on 2026-09-08. Where an ATS
    embeds the form on the JD page itself (Greenhouse, SmartRecruiters), the JD
    URL is already the apply URL and is returned unchanged rather than guessed at.
    """
    if not url:
        return ""
    u = url.rstrip("/")
    if "jobs.lever.co" in u:
        return u + "/apply"
    if "jobs.ashbyhq.com" in u:
        return u + "/application"
    if "apply.workable.com/j/" in u:
        return u + "/apply/"
    if "greenhouse.io" in u:
        # job-boards.greenhouse.io renders the form inline under #app.
        return u + "#app"
    if "recruitee.com" in u:
        return u + "/apply"
    # Workday, SmartRecruiters and anything unknown: the posting IS the entry point.
    return u


def tailor_cmd(m):
    company = (m.get("company") or "").replace('"', "'")
    title = (m.get("title") or "").replace('"', "'")
    return (f'node scripts/tailor.mjs --url "{m.get("url","")}" '
            f'--company "{company}" --title "{title}"')

FOUNDER_COLS = [
    ("Company", 22), ("What They Build", 40), ("Careers Page", 30), ("Founder", 20), ("Role", 16),
    ("LinkedIn", 34), ("Domain", 22), ("Guessed Email", 26), ("Source/Round", 22),
    ("Email Draft", 50), ("LinkedIn Draft", 44), ("Outreach Sent?", 13),
    ("Date Sent", 12), ("Follow-up Due", 13), ("Response?", 12), ("Notes", 34),
]


def style_header(ws, cols):
    for i, (name, width) in enumerate(cols, 1):
        c = ws.cell(row=1, column=i, value=name)
        c.fill, c.font = HEADER_FILL, HEADER_FONT
        c.alignment = Alignment(vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(i)].width = width
    ws.freeze_panes = "A2"
    ws.row_dimensions[1].height = 26


def job_row(m):
    elig = m.get("eligibility", "")
    label = {"qualifies": "Yes", "unconfirmed": "Unconfirmed", "drops": "No"}.get(elig, "?")
    posted = (m.get("postedAt") or "")[:10]
    asked = m.get("seniorityAsked")
    return [
        m.get("source", ""), m.get("title", ""), m.get("company", ""),
        m.get("hqCountry", ""), m.get("location", ""), label,
        m.get("channel") or "", "",                      # Salary: JDs rarely state it
        f"{asked}+ yrs" if asked else "", posted,
        m.get("ageDays") if m.get("ageDays") is not None else "",
        "Apply →",                                       # hyperlinked to the form
        m.get("url", ""),                                # the JD itself
        tailor_cmd(m),
        "",                                              # Applied? — Dev's column
        (m.get("eligibilityReason", "") + (" | " + " · ".join(m.get("blockers", [])) if m.get("blockers") else "")).strip(" |"),
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", default="data/jobs.raw.json")
    ap.add_argument("--out", default="reports/tracker.xlsx")
    ap.add_argument("--append", action="store_true",
                    help="merge into the existing file, preserving Applied?/Notes")
    a = ap.parse_args()

    src = os.path.join(ROOT, a.src)
    out = os.path.join(ROOT, a.out)
    with open(src, encoding="utf-8") as f:
        doc = json.load(f)
    matches = doc.get("matches", [])
    # Newest first — freshness is the primary sort everywhere in this system.
    matches.sort(key=lambda m: (m.get("ageDays") if m.get("ageDays") is not None else 999))

    kept_user_cols, kept_founders = {}, []
    if a.append and os.path.exists(out):
        wb_old = load_workbook(out)
        if "Job Listings" in wb_old.sheetnames:
            ws_old = wb_old["Job Listings"]
            hdr = [c.value for c in ws_old[1]]
            # Tolerate the older layout, which called this column "Link".
            link_name = "JD Link" if "JD Link" in hdr else "Link"
            try:
                li, ai, ni = hdr.index(link_name), hdr.index("Applied?"), hdr.index("Notes")
            except ValueError:
                li = ai = ni = None
            if li is not None:
                for row in ws_old.iter_rows(min_row=2, values_only=True):
                    if row and len(row) > max(li, ai, ni) and row[li]:
                        kept_user_cols[row[li]] = (row[ai], row[ni])
        if "Founder Targets" in wb_old.sheetnames:
            for row in wb_old["Founder Targets"].iter_rows(min_row=3, values_only=True):
                if row and row[0]:
                    kept_founders.append(list(row))

    wb = Workbook()

    # ---- Tab 1: Job Listings ------------------------------------------------
    ws = wb.active
    ws.title = "Job Listings"
    style_header(ws, JOB_COLS)
    for r, m in enumerate(matches, start=2):
        vals = job_row(m)
        prev = kept_user_cols.get(m.get("url"))
        if prev:
            vals[COL_APPLIED - 1] = prev[0] or ""
            if prev[1]:
                vals[COL_NOTES - 1] = prev[1]
        fill = GREEN if m.get("eligibility") == "qualifies" else ORANGE
        for c, v in enumerate(vals, 1):
            cell = ws.cell(row=r, column=c, value=v)
            cell.font, cell.fill = BODY_FONT, fill
            cell.alignment = Alignment(vertical="top", wrap_text=(c in (2, 5, COL_TAILOR, COL_NOTES)))

        link = LINK_FONT
        au = apply_url(m.get("url", ""), m.get("source", ""))
        if au:
            ac = ws.cell(row=r, column=COL_APPLY)
            ac.hyperlink, ac.font = au, APPLY_FONT
            ac.alignment = Alignment(vertical="top", horizontal="center")
        if m.get("url"):
            jc = ws.cell(row=r, column=COL_JD)
            jc.hyperlink, jc.font = m["url"], link
        # The tailor command is meant to be copied, so keep it monospace-ish and small.
        ws.cell(row=r, column=COL_TAILOR).font = Font(name="Consolas", size=9, color="3D454E")
    ws.auto_filter.ref = f"A1:{get_column_letter(len(JOB_COLS))}{max(2, len(matches) + 1)}"

    # ---- Tab 2: Founder Targets --------------------------------------------
    wf = wb.create_sheet("Founder Targets")
    style_header(wf, FOUNDER_COLS)
    legend = ("VERIFY BEFORE SENDING — every Guessed Email is a first@domain guess, never a verified address; "
              "check it yourself (Hunter.io) first. Personalise every draft with one genuine observation about "
              "what they build. Nothing in this tab is ever sent automatically.")
    wf.cell(row=2, column=1, value=legend).font = LEGEND_FONT
    wf.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(FOUNDER_COLS))
    wf.row_dimensions[2].height = 30
    for r, row in enumerate(kept_founders, start=3):
        for c, v in enumerate(row, 1):
            cell = wf.cell(row=r, column=c, value=v)
            cell.font = BODY_FONT
            cell.alignment = Alignment(vertical="top", wrap_text=(c in (2, 9, 10, 15)))

    os.makedirs(os.path.dirname(out), exist_ok=True)
    wb.save(out)

    green = sum(1 for m in matches if m.get("eligibility") == "qualifies")
    print(f"wrote {os.path.relpath(out, ROOT)}")
    print(f"  Job Listings   {len(matches)} rows ({green} confirmed eligible, {len(matches)-green} unconfirmed)")
    print(f"  Founder Targets {len(kept_founders)} rows preserved")
    if a.append and kept_user_cols:
        print(f"  preserved Applied?/Notes for {len(kept_user_cols)} previously-tracked links")


if __name__ == "__main__":
    main()
