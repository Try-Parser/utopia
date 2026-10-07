"""Render the autonomous delivery pipeline. Optional matplotlib; no model calls."""
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Polygon

ROOT = Path(__file__).resolve().parent


def main():
    plt.rcParams["svg.fonttype"] = "none"
    figure, axis = plt.subplots(figsize=(16, 15), facecolor="#f5f8fc")
    axis.set_xlim(0, 16)
    axis.set_ylim(0, 15)
    axis.axis("off")

    def box(x, y, width, height, title, detail, color="#e7eef9"):
        axis.add_patch(FancyBboxPatch((x-width/2, y-height/2), width, height,
                       boxstyle="round,pad=0.08,rounding_size=0.13", facecolor=color,
                       edgecolor="#294666", linewidth=1.5))
        axis.text(x, y+height*.22, title, ha="center", va="center", fontsize=13,
                  weight="bold", color="#17304c")
        axis.text(x, y-height*.16, detail, ha="center", va="center", fontsize=11,
                  linespacing=1.4, color="#263f59")

    def arrow(start, end, label=None, label_at=None, color="#294666"):
        axis.annotate("", xy=end, xytext=start,
                      arrowprops={"arrowstyle": "-|>", "lw": 1.8, "color": color})
        if label:
            x, y = label_at or ((start[0]+end[0])/2+.25, (start[1]+end[1])/2)
            axis.text(x, y, label, fontsize=10, color=color, ha="left", va="center",
                      bbox={"facecolor": "#f5f8fc", "edgecolor": "none", "pad": 2})

    axis.text(.65, 14.45, "AUTONOMOUS DEVELOPMENT FLOW", fontsize=23,
              weight="bold", color="#17304c")
    axis.text(.65, 13.98, "Focused work, independent checks, bounded repairs and authorized delivery",
              fontsize=13, color="#496078")
    main_x = 5
    box(main_x, 13.0, 8.2, 1.05, "1  Agree the task", "Observable acceptance + allowed repositories + authorized target")
    box(main_x, 11.45, 8.2, 1.05, "2  Choose impact tier and needed context", "Small / medium / large set depth; load specialist skills only when needed")
    box(main_x, 9.9, 8.2, 1.05, "3  Build and run focused Docker checks", "One QA owner plans checks; reuse valid evidence instead of duplicate suites")
    box(main_x, 8.35, 8.2, 1.05, "4  Stage and freeze a snapshot", "Keep evidence outside the repositories; stop writers during review")
    box(main_x, 6.75, 8.2, 1.15, "5  Three independent review lenses", "Correctness   |   QA / coverage   |   Security\nAll three attest to this snapshot, including small substantive changes")
    for first, second in ((12.475, 11.975), (10.925, 10.425), (9.375, 8.875), (7.825, 7.325)):
        arrow((main_x, first), (main_x, second))
    axis.add_patch(Polygon([(5, 5.95), (7.2, 5.1), (5, 4.25), (2.8, 5.1)],
                   facecolor="#fff1ce", edgecolor="#9e7422", linewidth=1.5))
    axis.text(5, 5.1, "6  Gate decision\nPass or repair?",
              fontsize=12, ha="center", va="center", color="#543e14", linespacing=1.4)
    arrow((5, 6.175), (5, 5.95))
    box(main_x, 3.35, 8.2, 1.05, "7  Coordinator delivers the reviewed work", "Commit only when authorized; postcommit verifies the reviewed tree", "#e1f3ea")
    arrow((5, 4.25), (5, 3.875), "Pass", (5.3, 4.1))
    box(main_x, 1.85, 8.2, 1.05, "8  Finish at the requested target", "Local handoff OR authorized push + verify exact remote identity\nConcise report: outcome + relevant checks + remaining gaps", "#e1f3ea")
    arrow((5, 2.825), (5, 2.375))
    box(12.3, 6.65, 5.0, 1.35, "One combined repair brief", "Batch findings; assign one focused fix\nAt most TWO automatic fix rounds", "#fff0e8")
    arrow((7.2, 5.1), (10.1, 5.98), "Blockers", (8.0, 5.55), "#a14d30")
    box(12.3, 8.65, 5.0, 1.35, "Changed content: review again", "New frozen snapshot + fresh delta attestations\nAll three lenses; QA decides test evidence reuse", "#fff0e8")
    arrow((12.3, 7.325), (12.3, 7.975))
    arrow((9.8, 8.65), (9.2, 8.35), "Return to 4", (9.4, 9.55), "#a14d30")
    box(12.3, 3.85, 5.0, 1.5, "Repair limit reached or stalled?", "Diagnose and replan; record the blocker\nNo endless unchanged retries\nNo forced passing verdict", "#fff0e8")
    arrow((12.3, 5.975), (12.3, 4.6), "Limit / repeated failure", (12.55, 5.1), "#a14d30")
    axis.text(.65, .68, "Coordinator owns delivery. A passed gate grants no merge, deployment or publication authority.",
              fontsize=11, color="#496078")
    axis.text(.65, .30, "The diagram describes the method. Live speed, accuracy and integrity require measured outcomes.",
              fontsize=11, color="#496078")
    for suffix in ("png", "svg"):
        destination = ROOT / ("autonomous-development-flow." + suffix)
        figure.savefig(destination, dpi=160, bbox_inches="tight", facecolor=figure.get_facecolor())
        if suffix == "svg":
            destination.write_text("\n".join(line.rstrip() for line in destination.read_text(encoding="utf-8").splitlines()) + "\n", encoding="utf-8")
    plt.close(figure)
    print("Rendered autonomous development PNG and SVG.")


if __name__ == "__main__":
    main()
