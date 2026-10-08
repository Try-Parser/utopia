"""Render architecture and observed evidence previews; optional matplotlib."""
import importlib.util
import json
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

ROOT = Path(__file__).resolve().parent
INK = "#15304b"
BG = "#f5f8fc"


def canvas(title, subtitle):
    figure, axis = plt.subplots(figsize=(16, 10), facecolor=BG)
    axis.set(xlim=(0, 16), ylim=(0, 10))
    axis.axis("off")
    axis.text(.6, 9.45, title, fontsize=24, weight="bold", color=INK)
    axis.text(.6, 8.95, subtitle, fontsize=12, color="#496078")
    return figure, axis


def card(axis, x, y, width, height, title, detail, color="#ffffff"):
    axis.add_patch(FancyBboxPatch((x, y), width, height,
                   boxstyle="round,pad=.06,rounding_size=.15",
                   facecolor=color, edgecolor="#a8bfd4", linewidth=1.3))
    axis.text(x + width / 2, y + height * .74, title, ha="center",
              va="center", fontsize=14, weight="bold", color=INK)
    axis.text(x + width / 2, y + height * .30, detail, ha="center",
              va="center", fontsize=11, linespacing=1.5, color="#38516b")


def arrow(axis, start, end):
    axis.annotate("", xy=end, xytext=start,
                  arrowprops={"arrowstyle": "-|>", "lw": 1.7, "color": "#52779c"})


def save(figure, name):
    for suffix in ("png", "svg"):
        output = ROOT / (name + "." + suffix)
        figure.savefig(output, dpi=160, bbox_inches="tight", facecolor=BG)
        if suffix == "svg":
            output.write_text("\n".join(line.rstrip() for line in
                              output.read_text(encoding="utf-8").splitlines()) + "\n",
                              encoding="utf-8")
    plt.close(figure)


def architecture():
    figure, axis = canvas("YOUR AI DEPARTMENT", "Updated 08 October 2026 | Shared global resources + project context | Service independent")
    card(axis, .6, 6.65, 4.0, 1.45, "One shared toolkit",
         "Skills + roles + ADR resources\nGlobal or project installation", "#e7eefb")
    card(axis, 6.0, 6.65, 4.0, 1.45, "Codex / Claude Code",
         "Same canonical helpers\nRecipient owns login and tool wiring", "#e7eefb")
    card(axis, 11.4, 6.65, 4.0, 1.45, "Coordinator",
         "Scope, route, checkpoint, deliver\nLoad only the context needed", "#e1f3ea")
    arrow(axis, (4.7, 7.37), (5.9, 7.37))
    arrow(axis, (10.1, 7.37), (11.3, 7.37))
    card(axis, .6, 3.65, 4.6, 1.95, "Plan and design",
         "Product / architect / designer\nResearcher / data / platform\nActivate relevant roles", "#e1f3ea")
    card(axis, 5.7, 3.65, 4.6, 1.95, "Build and repair",
         "Coder / debugger\nScoped tools + development Docker\nScribe records the handoff", "#e1f3ea")
    card(axis, 10.8, 3.65, 4.6, 1.95, "Independent review",
         "Correctness / QA / security\nFrozen snapshot + actual evidence\nEvery required check must pass", "#fff1ce")
    arrow(axis, (13.4, 6.55), (13.4, 6.0))
    axis.plot([2.9, 13.4], [6.0, 6.0], color="#52779c", lw=1.7)
    for x in (2.9, 8.0, 13.1):
        arrow(axis, (x, 6.0), (x, 5.7))
    card(axis, .6, .8, 7.15, 1.95, "Tools and access",
         "Restricted gateway: routed calls only\nConnectors need recipient setup and permissions\nCredentials stay outside the shared toolkit", "#e7eefb")
    card(axis, 8.25, .8, 7.15, 1.95, "Evidence and visibility",
         "Quality target 99% / observed gates 100%\nDeclared benchmarks + local traces + offline panel\nBackground metrics uploads: deferred", "#e7eefb")
    arrow(axis, (8.0, 3.55), (4.2, 2.85))
    arrow(axis, (13.1, 3.55), (11.8, 2.85))
    axis.text(.6, .2, "Architecture of the toolkit; adapter wiring and live AI accuracy still require recipient verification.",
              fontsize=11, color="#496078")
    save(figure, "department-architecture")


def evidence():
    source = ROOT / "verification/2026-10-08-measured/telemetry-summary.json"
    spec = importlib.util.spec_from_file_location("_preview_telemetry", ROOT.parent / "scripts/telemetry.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    data = module.validate_summary(json.loads(source.read_text(encoding="utf-8")))
    figure, axis = canvas("LOCAL EVIDENCE PANEL: VISUAL PREVIEW",
                          "Observed gateway fixture, 08 October 2026 | Static preview from the published summary")
    card(axis, .6, 6.5, 4.6, 1.6, "Run outcomes",
         f"Passed {data['outcomes']['passed']}  /  Failed {data['outcomes']['failed']}\nCancelled {data['outcomes']['cancelled']}", "#e1f3ea")
    card(axis, 5.7, 6.5, 4.6, 1.6, "Tool calls",
         f"{data['toolCalls']} calls / {data['toolDenials']} denied\n{data['toolErrors']} errors", "#fff1ce")
    card(axis, 10.8, 6.5, 4.6, 1.6, "Elapsed wall time",
         f"{data['wallMs'] / 1000:.3f} seconds\nRecorded by the local monotonic clock", "#e7eefb")
    wall = data["wallMs"]
    wait_width = 14.6 * data["waitMs"] / wall if wall else 0
    axis.text(.8, 5.85, "Recorded wait and remainder", fontsize=15, weight="bold", color=INK)
    axis.barh(5.15, wait_width, height=.55, left=.8, color="#52779c")
    axis.barh(5.15, 14.6 - wait_width, height=.55, left=.8 + wait_width, color="#74bba0")
    axis.text(.8, 4.45, f"Wait: {data['waitMs'] / 1000:.3f} s     Remainder: {data['remainderMs'] / 1000:.4f} s",
              fontsize=12, color="#38516b")
    axis.text(.8, 4.0, "Remainder is not a measurement of productive work or model thinking.", fontsize=11, color="#496078")
    tokens = data["usage"]["fields"]["totalTokens"]["completeTotal"]
    cost = data["costUsd"]["completeTotal"]
    card(axis, .6, 1.7, 4.6, 1.6, "Model tokens", "Unknown" if tokens is None else str(tokens))
    card(axis, 5.7, 1.7, 4.6, 1.6, "Model cost", "Unknown" if cost is None else f"USD {cost:g}")
    card(axis, 10.8, 1.7, 4.6, 1.6, "Live AI accuracy", "Not measured")
    axis.text(.6, .9, "Actual Docker tool execution against synthetic files; allowed read + expected secret-path denial.", fontsize=11, color="#496078")
    axis.text(.6, .5, "No model ran. No background upload. The HTML panel is a local evidence viewer.", fontsize=11, color="#496078")
    axis.text(.6, .1, "Source: docs/verification/2026-10-08-measured/telemetry-summary.json", fontsize=10, color="#496078")
    save(figure, "evidence-panel-preview")


if __name__ == "__main__":
    plt.rcParams["svg.fonttype"] = "none"
    architecture()
    evidence()
    print("Rendered department architecture and observed panel PNG/SVG previews.")
