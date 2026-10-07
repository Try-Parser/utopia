"""Export the department workflow; optional matplotlib, outside core runtime."""
from pathlib import Path
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch


def main():
    plt.rcParams["svg.fonttype"] = "none"
    destination = Path(__file__).resolve().parent
    figure, axis = plt.subplots(figsize=(15, 12))
    figure.set_facecolor("#f4f7fb")
    axis.set_facecolor("#f4f7fb")
    axis.set_xlim(0, 15)
    axis.set_ylim(0, 12)
    axis.axis("off")
    axis.text(7.5, 11.65, "How the AI department works", ha="center", va="center",
              fontsize=25, weight="bold", color="#17304c")
    axis.text(7.5, 11.2, "One coordinator. Relevant specialists. 100% of required checks must pass.",
              ha="center", fontsize=13, color="#496078")

    def box(x, y, width, height, title, detail, color="#ffffff"):
        axis.add_patch(FancyBboxPatch((x, y), width, height,
                       boxstyle="round,pad=0.04,rounding_size=0.14",
                       linewidth=1.2, edgecolor="#bbcbdc", facecolor=color))
        axis.text(x + width / 2, y + height * .78, title, ha="center", va="center",
                  fontsize=13, weight="bold", color="#17304c")
        axis.text(x + width / 2, y + height * .29, detail, ha="center", va="center",
                  fontsize=11, color="#38516b", linespacing=1.4)

    def arrow(start, end, color="#52779c"):
        axis.add_patch(FancyArrowPatch(start, end, arrowstyle="-|>",
                       mutation_scale=17, linewidth=1.5, color=color))

    box(4.8, 9.9, 5.4, .85, "1  Your request", "Goal, allowed scope, success and delivery target", "#e5eefb")
    arrow((7.5, 9.83), (7.5, 9.47))
    box(4.8, 8.55, 5.4, .85, "2  Coordinator scopes the work", "Choose roles, acceptance and verification")
    arrow((7.5, 8.48), (7.5, 8.1))
    box(4.8, 7.05, 5.4, .95, "3  Prepare the solution", "Product + architect when needed\nDesigner owns journeys, states and handoff", "#e8f5ef")
    box(.35, 7.05, 3.85, .95, "Specialists when needed", "Researcher, data, platform\nProvide evidence and contracts", "#e8f5ef")
    arrow((4.25, 7.52), (4.75, 7.52))
    arrow((7.5, 6.98), (7.5, 6.58))
    box(4.8, 5.55, 5.4, .95, "4  Coder implements", "Reuse existing patterns and verify locally\nFreeze the completed change")
    arrow((7.5, 5.48), (7.5, 5.0))
    axis.text(7.5, 4.83, "5  Independent checks for substantive engineering", ha="center",
              fontsize=13, weight="bold", color="#17304c")
    for x, title, detail in ((1.0, "Correctness reviewer", "Behavior and contracts"),
                              (5.4, "QA engineer", "Actual tests and journeys"),
                              (9.8, "Security reviewer", "Reachable threats and exposure")):
        box(x, 3.45, 4.0, .95, title, detail, "#fff2dd")
        arrow((7.5, 4.62), (x + 2, 4.46))
        arrow((x + 2, 3.38), (7.5, 2.95))
    box(4.8, 1.95, 5.4, .9, "6  Every required check passed?", "Then deliver within authorization; report evidence", "#e5eefb")
    box(.35, 1.75, 3.85, 1.35, "Otherwise: delivery blocked", "Failures / missing checks or reviews\nRequired skips block delivery\nMax 2 fix rounds + fresh reviews", "#fce9e7")
    arrow((4.75, 2.4), (4.25, 2.4), "#b76761")
    arrow((.3, 2.4), (.05, 2.4), "#b76761")
    arrow((.05, 2.4), (.05, 5.95), "#b76761")
    arrow((.05, 5.95), (4.72, 5.95), "#b76761")
    arrow((7.5, 1.88), (7.5, 1.45))
    box(4.8, .45, 5.4, .9, "7  Scribe records the handoff", "Reusable knowledge, results and limitations")
    axis.text(7.5, .03, "100% covers defined checks. It does not guarantee universal AI accuracy or security.",
              ha="center", fontsize=11, color="#496078")
    for suffix in ("png", "svg"):
        output = destination / ("workflow." + suffix)
        figure.savefig(output, dpi=150,
                       bbox_inches="tight", facecolor=figure.get_facecolor())
        if suffix == "svg":
            output.write_text("\n".join(line.rstrip() for line in output.read_text(encoding="utf-8").splitlines()) + "\n", encoding="utf-8")
    plt.close(figure)


if __name__ == "__main__":
    main()
