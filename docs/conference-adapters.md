# Conference question adapters

Agent World reads observed Codex and Claude Code questions locally. These sessions use **Copy answer**: the app has no transport into the original CLI or extension. It never injects keystrokes, modifies provider logs, or starts replacement sessions.

An adapter can explicitly opt into the local reply inbox. Use the discovery token from the existing local `/api/sessions` connection as `X-Agent-World-Token`. Keep it private. All requests must use the same local server host; writes also require its exact HTTP `Origin` and `Content-Type: application/json`. The server accepts at most 12,000 request bytes. No remote callback is supported.

While its provider is actually awaiting human input, refresh the existing heartbeat within 30 seconds. Send this object as JSON:

```javascript
const heartbeat = {
  "provider": "Example AI",
  sessionId: "existing-session-id",
  "state": "waiting",
  "workspace": "example-project",
  "pid": null,
  "awaitingHuman": true,
  "acceptsReplies": true,
  "question": {
    "id": "environment-1",
    "text": "Which environment should I use?",
    "choices": ["Development", "Staging"]
  }
};
```

`POST /api/sessions/heartbeat` returns the opaque session `id`. `question.id` is the adapter's current question revision; change it for a new question. Choices are optional and default to `[]`. Question text permits 8,000 characters, up to 12 choices of 200 characters, and a revision identifier of at most 80 characters. Text accepts newlines and tabs; other control characters are rejected. Setting `acceptsReplies` to false or omitting it keeps copy delivery. Question/capability fields require both `state: "waiting"` and `awaitingHuman: true`.

The authenticated UI reads `GET /api/sessions/{id}/question`, then submits `{ "questionId": "<server question revision>", "text": "Development" }` to `POST /api/sessions/{id}/answer`. A successful response is HTTP 202 with `{ "id": "<reply id>", "status": "queued" }`. This means queued locally, not delivered. Answers permit 4,000 characters. Identical submissions are idempotent; conflicting or stale answers return HTTP 409. Copy-only sessions also reject answer submission with HTTP 409.

The opted-in adapter polls `GET /api/sessions/{id}/reply`:

```json
{
  "available": true,
  "id": "<reply id>",
  "questionId": "<server question revision>",
  "text": "Development"
}
```

Forward that exact answer through the adapter's established provider input channel, verifying the provider is still awaiting this same question. Only after forwarding succeeds, acknowledge it:

```text
POST /api/sessions/{id}/reply/ack
```

```json
{ "id": "<reply id>", "questionId": "<server question revision>" }
```

The response reports `acknowledged`; repeated matching acknowledgements are idempotent. Acknowledged replies no longer appear in polling. Neither queueing nor acknowledging changes the waiting employee: send a subsequent truthful working/idle/ended heartbeat when the provider changes state. A new question revision invalidates the old reply, including its acknowledgement.

Question and answer bodies stay in bounded private memory, at most 200 current records with five-minute retention between confirmations. They never appear in public inventory or SSE and are not persisted. A heartbeat older than 30 seconds cannot receive replies. Server restart, missing question fields, a resumed session, expiry, or question replacement can invalidate the inbox; adapters must handle `available: false` and HTTP 409 without forwarding stale text.
