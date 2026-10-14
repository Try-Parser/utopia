# 0010: Provider-neutral local session discovery

Date: 2026-10-12
Status: Accepted

## Context

The user requires automatic discovery of local sessions beyond tasks launched in Agent World, including Claude, Codex and other AI tools. Different runtimes expose different evidence; an OS process alone does not enumerate its conversations or establish an active agent turn. Universal hidden-session visibility is unavailable without provider-specific instrumentation.

## Decision

Combine read-only OS process recognition, bounded Codex/Claude session-header metadata and an authenticated provider-neutral heartbeat registry. Use executable/package entrypoint signatures for common tools, with operator-defined additional executable names. Never execute Claude or another provider to discover it, and never scan account settings/authentication files.

Keep provenance visible: observed process, recorded/recent metadata, explicitly correlated session ID, or adapter-reported state. Correlate only explicit UUID arguments, not workspace/time guesses. Animate reported work only for fresh adapter heartbeats. Keep discovery separate from the native task launcher; external sessions have no execution/cancel controls.

Project allowed fields and discard raw arguments/messages immediately. Show cache timestamps and partial/unavailable coverage. Bound process collection, filesystem traversal, file headers, heartbeat memory, and returned inventory. Retain the existing local origin/Host/body/token controls. No metadata uploads or scanner persistence.

## Alternatives and consequences

Interpreting recent log writes or CPU use as live work would create false claims. Invoking every provider's runtime would violate the workspace contract and need accounts. Reading arbitrary browser/app stores would expose unrelated private data and still miss hidden threads. Explicit metadata adapters can cover those runtimes using their own authorized interfaces.

Discovery now finds recognizable local processes and supported stored records without controlling them. It cannot independently guarantee complete enumeration of protected, remote, browser, container, WSL, or opaque multi-session runtimes. Provider adapters extend coverage without pretending OS recognition is a universal session API.
