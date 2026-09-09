#!/usr/bin/env python3
"""
render_pdf.py — render a tailored resume to A4 PDF.

    python scripts/render_pdf.py resume/dev-mankad-resume-mern
    python scripts/render_pdf.py resume/dev-mankad-resume --out somewhere.pdf

Reads the `<base>.report.json` written by tailor.mjs (which carries the plan)
plus `resume/resume-content.json`, and lays the result out to match the visual
style of the original July 2026 resume: A4, Helvetica, a centred header block,
small-caps-ish section headings with a full-width rule, and tight bulleted lists.

Pure fpdf2 — no LaTeX, no browser, no system dependencies.
"""
import argparse
import json
import os
import re
import sys

try:
    from fpdf import FPDF
except ImportError:
    sys.exit("fpdf2 is required:  python -m pip install fpdf2")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ACCENT = (31, 58, 95)      # deep navy, as in the original
INK = (26, 26, 26)
MUTED = (90, 90, 90)
RULE = (170, 178, 186)

# fpdf2's core fonts are latin-1 only; the plan text uses a few typographic marks.
SUBS = {
    "’": "'", "‘": "'", "“": '"', "”": '"',
    "–": "-", "—": " - ", "•": "-", "·": " - ",
    "→": "->", "…": "...", " ": " ", "‑": "-",
}


def clean(s):
    s = str(s or "")
    for k, v in SUBS.items():
        s = s.replace(k, v)
    # "systems — autonomous" -> "systems  -  autonomous" without this.
    s = re.sub(r"[ 	]{2,}", " ", s).strip()
    return s.encode("latin-1", "replace").decode("latin-1")


class Resume(FPDF):
    def __init__(self):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=12)
        self.set_margins(14, 12, 14)

    def section(self, title):
        self.ln(2.4)
        self.set_font("Helvetica", "B", 10.5)
        self.set_text_color(*ACCENT)
        self.cell(0, 5, clean(title).upper(), new_x="LMARGIN", new_y="NEXT")
        y = self.get_y() + 0.6
        self.set_draw_color(*RULE)
        self.set_line_width(0.35)
        self.line(self.l_margin, y, self.w - self.r_margin, y)
        self.ln(2.2)

    def bullet(self, text, indent=3.2):
        self.set_font("Helvetica", "", 9.1)
        self.set_text_color(*INK)
        x0 = self.l_margin + indent
        self.set_xy(x0, self.get_y())
        self.cell(2.6, 4.3, "-")
        self.set_x(x0 + 2.6)
        self.multi_cell(self.w - self.r_margin - x0 - 2.6, 4.3, clean(text))
        self.ln(0.5)

    def para(self, text, size=9.1, style="", color=INK, gap=0.8):
        self.set_font("Helvetica", style, size)
        self.set_text_color(*color)
        self.multi_cell(0, 4.3, clean(text))
        self.ln(gap)

    def entry(self, left, right):
        """Bold left-aligned title with a small right-aligned date."""
        self.set_font("Helvetica", "B", 9.7)
        self.set_text_color(*INK)
        w = self.w - self.l_margin - self.r_margin
        self.cell(w * 0.66, 4.8, clean(left))
        self.set_font("Helvetica", "", 8.6)
        self.set_text_color(*MUTED)
        self.cell(w * 0.34, 4.8, clean(right), align="R", new_x="LMARGIN", new_y="NEXT")


def build(plan, content, out_path):
    pdf = Resume()
    pdf.add_page()
    h = plan["header"]

    # ---- header ------------------------------------------------------------
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(*INK)
    pdf.cell(0, 8.5, clean(h["name"]).upper(), align="C", new_x="LMARGIN", new_y="NEXT")

    contact = " | ".join(x for x in [plan["title"], h.get("phone"), h.get("email"), h.get("location")] if x)
    pdf.set_font("Helvetica", "", 8.8)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 4.6, clean(contact), align="C", new_x="LMARGIN", new_y="NEXT")

    links = [v for k, v in (h.get("links") or {}).items() if v and not k.startswith("_")]
    if links:
        pdf.cell(0, 4.2, clean(" | ".join(links)), align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "I", 8.8)
    pdf.set_text_color(*ACCENT)
    pdf.cell(0, 4.6, clean(h.get("tagline", "")), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1.2)

    # ---- sections, in the order the engine chose ---------------------------
    for sec in plan["sectionOrder"]:
        if sec == "header":
            continue

        if sec == "summary":
            pdf.section("Professional Summary")
            pdf.para(plan["summary"])

        elif sec == "skills":
            pdf.section("Technical Skills")
            for cat in plan["skillCategories"]:
                items = ", ".join(i["name"] for i in cat["items"])
                pdf.set_font("Helvetica", "", 9.1)
                pdf.set_text_color(*INK)
                # markdown=True keeps the label bold inside a single wrapping
                # block, so continuation lines stay flush at the left margin.
                pdf.set_x(pdf.l_margin)
                pdf.multi_cell(0, 4.3, f'**{clean(cat["label"])}:** {clean(items)}',
                               markdown=True, new_x="LMARGIN", new_y="NEXT")
                pdf.ln(0.5)

        elif sec == "agentic":
            a = plan["agentic"]
            pdf.section(a["label"])
            pdf.para(a["intro"], color=MUTED)
            for b in a["bullets"]:
                pdf.bullet(b["text"])

        elif sec == "experience":
            pdf.section("Professional Experience")
            for r in plan["experience"]:
                pdf.entry(f'{r["role"]} - {r["company"]}, {r["location"]}',
                          f'{r["start"]} - {r["end"]}  ({r["durationLabel"]})')
                for b in r["bullets"]:
                    pdf.bullet(b["text"])
                pdf.ln(0.8)

        elif sec == "projects":
            pdf.section("Key Projects")
            for p in plan["projects"]:
                pdf.entry(p["name"], p["region"])
                pdf.set_font("Helvetica", "I", 8.6)
                pdf.set_text_color(*MUTED)
                pdf.multi_cell(0, 4.1, clean(p["stackLine"]))
                pdf.ln(0.4)
                for b in p["bullets"]:
                    pdf.bullet(b["text"])
                pdf.ln(0.8)

        elif sec == "education":
            pdf.section("Education")
            for e in plan["education"]:
                pdf.bullet(f'{e["degree"]} - {e["institution"]}, {e["location"]}')

        elif sec == "certifications":
            pdf.section("Certifications")
            for c in plan["certifications"]:
                pdf.bullet(c["name"])

        elif sec == "publications":
            pub = plan["publications"]
            pdf.section(pub["label"])
            if pub["blogs"]:
                pdf.bullet("Blogs: " + "; ".join(f'"{b["title"]}"' for b in pub["blogs"]) + ".")
            if pub["internships"]:
                pdf.bullet("Internships: " + "; ".join(i["text"] for i in pub["internships"]) + ".")

    pdf.output(out_path)
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base", help="path without extension, e.g. resume/dev-mankad-resume-mern")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    base = a.base[:-4] if a.base.endswith(".txt") else a.base
    plan_path = os.path.join(ROOT, base + ".plan.json")
    if not os.path.exists(plan_path):
        sys.exit(f"missing {os.path.relpath(plan_path, ROOT)} — run `npm run resumes` first")

    plan = json.load(open(plan_path, encoding="utf-8"))
    content = json.load(open(os.path.join(ROOT, "resume/resume-content.json"), encoding="utf-8"))
    out = os.path.join(ROOT, a.out) if a.out else os.path.join(ROOT, base + ".pdf")
    build(plan, content, out)

    size = os.path.getsize(out)
    print(f"wrote {os.path.relpath(out, ROOT)}  ({size // 1024} KB)")


if __name__ == "__main__":
    main()
