# Architecture decisions

Use ADRs for choices that affect system boundaries, shared contracts, security, dependencies, persistence, operating costs or migration. Read the project's existing ADR index before proposing a conflicting design, then load only records relevant to the current scope. Follow its established format and decision authority. A minor fix or routine implementation under an existing decision does not need another ADR.

If the project has no convention, use docs/adr/ with an index and four-digit records such as 0001-shared-contract.md. Copy the [portable template](../assets/adr-template.md), fill the fields, and remove every placeholder. Keep one decision per record. Link the record from the affected contract or project guidance, and update the index.

## Lifecycle

- **Proposed:** a choice awaiting the project's decision process. A generated proposal is not approval.
- **Accepted:** adopted through the project's existing authority; cite the actual basis. Code tests verify behavior, not business consent.
- **Rejected:** a considered choice that was not adopted; retain its rationale.
- **Superseded:** replaced by an accepted record. Link both records and retain the earlier rationale.

Draft changes can refine a proposed record. Once accepted, preserve the original rationale; replace a changed decision with a new number, update status and reciprocal supersession links, and keep the index current. Editorial corrections are allowed when they do not rewrite the decision. Record original decision and current recording dates separately for retrospective records.

## Ownership and evidence

The architect drafts alternatives and consequences. The coordinator applies the project's decision process and maintains the index; the scribe may update documentation. Independent correctness, QA and security checks remain separate from design acceptance. An ADR does not grant permission to publish, deploy, use paid APIs or access data.

Keep credentials, private paths, personal data and transcripts out of ADRs. Link approved evidence rather than copying sensitive logs. State uncertainty, implementation gaps and revisit conditions. Update affected guides or diagrams only when the represented design changes. Do not invent measured accuracy, performance or standards compliance.
