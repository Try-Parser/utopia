# 0019: Private questions and explicit adapter replies

Status: Accepted for local implementation
Decision date: 2026-10-19
Owner: Local implementation coordinator
Extends: [0010](0010-provider-neutral-local-discovery.md), [0014](0014-live-office-stream.md)

## Context

The user accepted a conference inbox for employees waiting for human input. Discovery can observe local CLI and extension activity, but process presence and transcript access do not provide a channel for answering those sessions.

## Decision

Use the versioned conference contract to expose bounded exact-session questions through authenticated private endpoints. The office lists only explicitly reported human-input waits. Existing observed sessions use a copyable answer; an adapter must explicitly provide a current question and opt into replies before an answer can be queued.

Replies live only in bounded server memory and bind to the current session/question revision. An adapter polls its reply, forwards it using its own supported connection, then acknowledges it. The UI distinguishes queued and acknowledged. Neither state resolves the question: provider activity must report that the session resumed. Changing or expiring the question invalidates old submissions.

The inbox is a responsive native dialog opened from a compact Questions control or the waiting employee's profile. Drafts remain bounded in browser memory and survive activity refresh. Private question and answer text stays out of broad inventory, SSE, browser storage and history files. Existing local origin, token and body limits apply to all reply operations.

## Alternatives and consequences

- Injecting terminal keystrokes or editing transcripts cannot reliably identify or resume arbitrary provider sessions.
- Launching a replacement session would not answer the employee currently waiting.
- An explicit adapter handshake provides a verifiable delivery boundary while keeping read-only discovery usable. Automatic replies to arbitrary CLI and extension sessions are not implied.

Verification covers selected-question privacy, adapter opt-in, identity and revision conflicts, expiry, idempotency, acknowledgement and real resumed activity, plus mobile, keyboard focus, live refresh and stale-selection behavior. No provider is executed to verify the transport.
