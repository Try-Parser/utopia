# 0014: Push live office snapshots through one persistent stream

Status: accepted for local implementation, 2026-10-13.

The user explicitly requested live updates instead of five-second polling. The coordinator adopts a shared server-sent event connection for local sessions and native jobs, extending [0013](0013-local-session-tool-activity.md). The browser receives coalesced snapshots, clears unavailable state and reconnects. Source proof and native permissions are unchanged.

A bounded250ms producer reads fast, cached activity projections; a separate background inventory worker performs OS/history enumeration outside the fast-state lock. Known-file metadata changes can update promptly without an inventory rescan. Initial/new-session discovery still has inventory latency. The stdlib reader uses short metadata checks, not native filesystem notifications, so this is near-live rather than guaranteed instantaneous detection.

Eight stream slots, finite300-second connections, two-second heartbeats, five-second write timeouts and24MiB per-frame limits bound resource use while preserving existing frontend-valid100-job Unicode history. One connection serves both sources. Browser mode/page lifecycle closes or reconnects streams; a watchdog handles silent failure. Tokens remain memory-only. JSON framing and existing local Origin/Host restrictions preserve public-data boundaries. Explicit operations may still request a snapshot; historical recorded runs remain separately refreshed.

Five-second browser polling was simpler but introduced the reported delay. WebSockets add protocol machinery unnecessary for one-way snapshots. OS-specific filesystem watchers could reduce metadata checks, but add platform-specific shutdown and verification requirements; reconsider them if current measured latency or file-index coverage requires it. No provider configuration, execution or paid calls are added.

Docker HTTP/SSE tests must cover update latency without client polling, isolation from blocked inventory, stream limits, foreign origins, privacy and Unicode history. Actual browser tests cover a single connection, reconnect/offline clearing, mode switching and preserved office journeys. Independent correctness, QA and security gates remain required. The [SPEC](../../apps/agent-world/SPEC.md) records bounds; neither this ADR nor streamed metadata certifies tests or deployed outcomes.
