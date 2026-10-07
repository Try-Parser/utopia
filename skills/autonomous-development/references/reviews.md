# Independent review briefs

Use one coordinator brief: repository roots, snapshot ID/file, task criteria, tier/reason, actual changed paths, relevant callers/contracts, evidence directory and known verification gaps. Each role gets only relevant context; builder conclusions are claims to check.

Small changes still receive three independent lenses, each narrowly scoped. Correctness and security don't start duplicate test suites. QA owns final application verification and may validate relevant builder evidence instead of repeating it.

Results must name concrete failure triggers, code locations and wrong outcomes. Refute findings against upstream validation/callers before blocking. Preferences are notes. Real blockers are batched across lenses into one fix round.

After fixes, every lens inspects the delta and affected surface and issues a new final-snapshot attestation. Record the prior snapshot as basedOn and test reuse rationale in evidence. Do not copy a pass onto new code. Missing reviews remain incomplete.

Independent workers can share the same model family while keeping separate contexts. Independence is separate judgment/evidence, not proof by model diversity. For consequential research/model grading, calibrate against independent human-reviewed rubrics.
