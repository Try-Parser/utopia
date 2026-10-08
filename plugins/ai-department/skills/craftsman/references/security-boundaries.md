# Security boundaries

Use when the assigned work affects authentication, permissions, sensitive data, external inputs or execution boundaries. Map reachable entry points and sinks; inspect relevant callers and threat cases.

- Enforce authentication, authorization and object ownership on the server. Derive identity/ownership from authenticated context. Hidden controls do not provide authorization.
- Parameterize queries; avoid untrusted shell construction. Validate paths, uploads, redirects and deserialization at their boundaries; encode output for its actual HTML/URL/context.
- Keep secrets in approved configuration or stores. Never copy them into source, artifacts, URLs, logs, shared memory or error responses. Minimize returned and retained sensitive data.
- Use established cryptography/session mechanisms and appropriate secure transport. Preserve existing session/permission contracts and assess dependency changes against actual exposure.

Document concrete failures and remaining gaps. Independent frank-security review is a separate delivery requirement; this builder guidance does not replace it. Additional accounts, paid calls and external writes require task authorization.
