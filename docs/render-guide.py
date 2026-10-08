"""Build the shareable PDF from canonical documentation; optional matplotlib."""
from pathlib import Path
import re
import textwrap

import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

ROOT = Path(__file__).resolve().parents[1]


def readable_lines(markdown):
    lines = []
    code = False
    mermaid = False
    for raw in markdown.splitlines():
        if raw.startswith("```"):
            if not code:
                mermaid = raw.startswith("```mermaid")
            code = not code
            continue
        if mermaid and code:
            continue
        if raw.startswith("![") or re.fullmatch(r"\|[ :|\-]+\|", raw):
            continue
        raw = re.sub(r"\[([^]]+)\]\(([^)]+)\)", r"\1 (\2)", raw)
        raw = re.sub(r"^#+\s*", "", raw).replace("`", "").replace("**", "")
        if raw.startswith("|"):
            raw = " - ".join(part.strip() for part in raw.strip("|").split("|"))
        lines.extend(textwrap.wrap(raw, width=88, break_long_words=True,
                                   break_on_hyphens=False) or [""])
    return lines


def main():
    destination = ROOT / "docs/ai-department-guide.pdf"
    sections = [("Autonomous delivery process", ROOT / "docs/autonomous-development.md"),
                ("Setup and usage", ROOT / "docs/getting-started.md"),
                ("Department roles", ROOT / "skills/frank/references/department.md"),
                ("Reusable resources", ROOT / "docs/resources.md"),
                ("Architecture decisions", ROOT / "skills/autonomous-development/references/architecture-decisions.md"),
                ("Measurement and control panel", ROOT / "skills/ai-evaluation/references/measurement.md"),
                ("Restricted tool gateway", ROOT / "skills/autonomous-development/references/tool-gateway.md"),
                ("Tools and trial priorities", ROOT / "docs/tooling-landscape-2026-10.md")]
    with PdfPages(destination, metadata={"Title": "AI department setup and workflow guide",
                  "Author": "AI Department", "Subject": "Shared skills, roles and workflow"}) as pdf:
        for image, size in (("department-architecture.png", (11.7, 8.3)),
                            ("autonomous-development-flow.png", (11.7, 11.7)),
                            ("workflow.png", (11.7, 8.3)),
                            ("evidence-panel-preview.png", (11.7, 8.3))):
            figure, axis = plt.subplots(figsize=size)
            axis.imshow(plt.imread(ROOT / "docs" / image))
            axis.axis("off")
            pdf.savefig(figure, bbox_inches="tight")
            plt.close(figure)
        skill_lines = ["Shared skills", ""]
        for path in sorted((ROOT / "skills").glob("*/SKILL.md")):
            skill_lines.extend([path.parent.name, "Source: skills/" + path.parent.name + "/SKILL.md", ""])
        content = [("Skills catalog", skill_lines)]
        content += [(title, readable_lines(path.read_text(encoding="utf-8")))
                    for title, path in sections]
        page = 5
        for title, lines in content:
            for start in range(0, len(lines), 39):
                figure = plt.figure(figsize=(8.3, 11.7), facecolor="white")
                figure.text(.075, .955, "AI department | " + title, fontsize=16, color="#17304c")
                figure.text(.075, .91, "\n".join(lines[start:start + 39]),
                            va="top", fontsize=9.5, family="monospace", linespacing=1.65)
                figure.text(.075, .055, "Relative paths refer to the shared ai-department repository.",
                            fontsize=9, color="#496078")
                figure.text(.075, .035, "https://bitbucket.org/legalmatch/ai-department/", fontsize=9)
                figure.text(.9, .035, str(page), fontsize=9, ha="right")
                pdf.savefig(figure)
                plt.close(figure)
                page += 1
        print("Created shareable PDF with", pdf.get_pagecount(), "pages.")


if __name__ == "__main__":
    main()
