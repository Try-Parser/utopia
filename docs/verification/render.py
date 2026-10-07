"""Render the recorded results as a PNG using optional matplotlib (not runtime).

Usage: python docs/verification/render.py RESULTS_JSON OUTPUT_PNG
Install matplotlib in a separate plotting environment; toolkit execution remains stdlib.
"""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys


def render(source, output):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import FancyBboxPatch

    data = json.loads(Path(source).read_text(encoding="utf-8"))
    groups = data["groups"]
    passed = sum(g["passed"] for g in groups.values())
    skipped = sum(g["skipped"] for g in groups.values())
    failed = sum(g["failed"] + g["error"] for g in groups.values())
    if passed + skipped + failed != data["testsRun"]:
        raise ValueError("Recorded group totals do not match testsRun")
    ink, muted, green, amber, red = "#10223b", "#52667e", "#087f67", "#b76a0b", "#be3345"
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11,
                         "text.color": ink, "axes.labelcolor": muted,
                         "xtick.color": muted, "ytick.color": ink})
    fig = plt.figure(figsize=(14, 10), facecolor="#eef3f8")
    fig.text(.055, .945, "AI Department", fontsize=24, weight="bold")
    fig.text(.055, .909, "Observed tool verification | engineering, installation and evaluation", fontsize=13, color=muted)
    timestamp = datetime.fromisoformat(data["recordedAtUtc"]).astimezone(timezone(timedelta(hours=8)))
    fig.text(.945, .947, timestamp.strftime("%d %b %Y  %H:%M SGT"), ha="right", color=muted, fontsize=10)

    cards = [(f"{passed} passed", f"{skipped} skipped / {failed} failed | {data['testsRun']} discovered tests", green if not failed else red),
             (f"{len(data['installerDemo']['checks'])} integration checks", "Temporary recipient project | both adapters", green if data['installerDemo']['passed'] else red),
             (f"{data['durationSeconds']:.1f}s", "Recorded verification run | no live model calls", ink)]
    for i, (value, detail, color) in enumerate(cards):
        x = .055 + i * .3
        fig.add_artist(FancyBboxPatch((x, .792), .282, .09, boxstyle="round,pad=0.012", facecolor="white", edgecolor="none", transform=fig.transFigure, zorder=0))
        fig.text(x + .008, .838, value, fontsize=21, weight="bold", color=color)
        fig.text(x + .008, .807, detail, fontsize=9, color=muted)

    left = fig.add_axes([.18, .44, .34, .29], facecolor="white")
    labels = {"install": "Installer", "evaluate": "Evaluation scorer", "validate": "Source hygiene",
              "evidence": "Review / commit evidence", "task_state": "Task state / timing"}
    names = list(groups)
    y = list(range(len(names)))
    left.barh(y, [groups[n]["passed"] for n in names], color=green, height=.55, label="Passed")
    left.barh(y, [groups[n]["skipped"] for n in names], left=[groups[n]["passed"] for n in names], color=amber, height=.55, label="Skipped")
    left.barh(y, [groups[n]["failed"] + groups[n]["error"] for n in names],
              left=[groups[n]["passed"] + groups[n]["skipped"] for n in names], color=red, height=.55, label="Failed")
    left.set_yticks(y, [labels.get(n, n) for n in names], fontsize=10)
    left.invert_yaxis()
    max_total = max(sum(g.values()) for g in groups.values())
    left.set_xlim(0, max_total * 1.25)
    for position, name in enumerate(names):
        g = groups[name]
        total = sum(g.values())
        text = f"{g['passed']}/{total}"
        if g["skipped"]:
            text += f"  ({g['skipped']} skip)"
        left.text(total + .5, position, text, va="center", fontsize=10)
    left.set_xlabel("Executed test outcomes (counts)", fontsize=10)
    left.set_title("Regression test cases", loc="left", pad=17, fontsize=13, weight="bold")
    left.legend(loc="lower left", bbox_to_anchor=(0, -.27), ncol=3, frameon=False, fontsize=9)
    left.spines[["top", "right", "left"]].set_visible(False)

    fig.text(.61, .735, "Recipient integration demonstration", fontsize=13, weight="bold")
    checks = [("01", "Preview", "Dry-run leaves recipient files untouched"),
              ("02", "Install", "7 skills + 6 role references per adapter"),
              ("03", "Protect", "Account files preserved; edited uninstall refused"),
              ("04", "Restore", "Uninstall returns the original file inventory")]
    for i, (step, title, detail) in enumerate(checks):
        yy = .682 - i * .064
        fig.text(.615, yy, step, fontsize=15, weight="bold", color=green if data["installerDemo"]["passed"] else red)
        fig.text(.655, yy + .003, title, fontsize=12, weight="bold")
        fig.text(.655, yy - .02, detail, fontsize=9, color=muted)

    ax = fig.add_axes([.18, .17, .68, .145], facecolor="white")
    scenarios = data["evaluationDemo"]["scenarios"]
    ax.axvspan(95, 95.5, color="#ddf2e9", zorder=0)
    ax.axvline(95, color=green, ls="--", lw=1.5)
    for i, row in enumerate(scenarios):
        bound = 100 * row["wilsonLower"]
        ax.scatter(bound, i, color=green if row["statisticalThresholdMet"] else amber, s=90, zorder=3)
        ax.text(bound + .035, i, f"{bound:.3f}%", va="center", fontsize=10)
    ax.set_yticks(range(len(scenarios)), [row["label"] + " fixture" for row in scenarios], fontsize=10)
    ax.invert_yaxis()
    ax.set_ylim(len(scenarios) - .5, -.5)
    ax.set_xlim(94.1, 95.5)
    ax.set_xlabel("Lower endpoint of the two-sided 95% Wilson interval (%)", fontsize=10)
    ax.set_title("Synthetic confidence-boundary checks | all three correctly refused certification", loc="left", pad=14, fontsize=12, weight="bold")
    ax.spines[["top", "right", "left"]].set_visible(False)
    fig.text(.055, .068, "Evidence scope: tool tests and temporary-fixture demonstrations. Live AI accuracy and production speed are unmeasured.", fontsize=10, weight="bold")
    fig.text(.055, .043, "Source: results.json | Linux Docker, read-only source, offline execution | Windows-only junction test is the documented skip.", fontsize=9, color=muted)
    fig.savefig(output, dpi=160, facecolor=fig.get_facecolor(), metadata={"Title": "AI Department observed verification"})
    plt.close(fig)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: render.py RESULTS_JSON OUTPUT_PNG")
    render(sys.argv[1], sys.argv[2])
