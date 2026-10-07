# State and evidence

Use a unique run directory outside every reviewed repository. Host/container paths must remain consistent between snapshot and gate. Persist concise facts, not raw sessions or secret-containing logs.

```text
python <skill>/scripts/evidence.py state init --file <external-run>/state.json --task "<goal>" --tier small --reason "<behavioral risk>" --target local --acceptance "<observable result>"
python <skill>/scripts/evidence.py state transition --file <external-run>/state.json --phase review --kind active
python <skill>/scripts/evidence.py state transition --file <external-run>/state.json --phase ci --kind wait --reason "<remote build id>"
python <skill>/scripts/evidence.py state report --file <external-run>/state.json
```

Record repository HEADs and pre-existing edits, authorization provenance, worker ownership, checks, blockers, decisions, external action IDs and nextAction alongside generated timing fields. Update after phases and mutations. Lock recovery is explicit: investigate ownership before recovering an abandoned lock; never delete another worker's active lock.

Each of correctness, coverage and security has a distinct actual agentId and result:

```json
{
  "correctness": {
    "agentId": "actual-agent-id",
    "result": {
      "status": "passed",
      "snapshotId": "current-snapshot-id",
      "blockers": [],
      "verdict": "Observed assessment",
      "evidence": ["external artifact or file:line"],
      "basedOn": "optional-prior-snapshot-id"
    }
  }
}
```

Statuses are passed, blocked or incomplete. coverage additionally records checks containing command, container (or explicit configured environment), exitCode: 0, performed: true and evidence. Record test totals, material source/runtime/fixture identities and prior execution provenance when evidence is reused. The QA reviewer verifies actual validity, not only hashes.

The gate requires all three actual passes on the current unchanged snapshot. Reviewers re-attest after every source/index change; basedOn never bypasses identity checks. Ignored files, unsupported content filters, hidden index flags and submodules require explicit scope resolution; do not silently certify them.

Checkpoint timing diagnoses delays; it does not prove performance improved. Report active and waiting durations separately. Keep the test evidence and run state external so helper writes cannot invalidate their own snapshot.
