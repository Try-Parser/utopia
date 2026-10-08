# 0007: Distribute a generated plugin for both coding tools

- Status: Accepted
- Decision date: 2026-10-08
- Recorded: 2026-10-08
- Owner: AI Department maintainers
- Authority: User request to package the toolkit as a plugin
- Supersedes: None
- Superseded by: None

## Context

Recipients need simpler global installation of the existing shared toolkit. Plugin hosts require a self-contained package; references and generated helpers must travel with skills.

## Decision

Generate a versioned plugin under plugins/ai-department from the same canonical assets used by the installer. Provide portable, Codex compatibility and Claude manifests plus separate repository marketplace catalogs. Include a plugin-only setup skill. Keep the existing installer as a fallback.

## Alternatives

Manifest paths pointing outside the plugin omit files when hosts cache the package. Maintaining separate hand-edited copies introduces drift. A public marketplace submission adds a separate publication process and is outside this private team distribution request.

## Consequences

Generated copies increase repository size but permit direct marketplace installation. Deterministic checks require synchronization with canonical source. Maintainers must bump versions for payload changes. Account configuration, credentials, third-party connections and metrics remain recipient-owned; the plugin grants no new authority.

## Verification and review

Package tests check complete resource parity, drift, destination containment and refusal of unexpected files. The Docker repository suite and independent correctness, QA and security reviews govern publication. File-level checks do not prove native host installation or live model performance; recipients must run setup and a real smoke task.

## Revisit

Revisit when host formats change, public distribution is requested or recipient smoke checks expose compatibility issues. Preserve one canonical instruction source.
