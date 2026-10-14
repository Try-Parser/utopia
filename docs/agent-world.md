# Agent World

A local game-style control room for the AI Department. Six characters represent planning, design, build, review, QA, and security roles. One office combines native tasks, local sessions and recorded checkpoints. The office is live-only. Use **Office view** to switch between **Isometric** and **Top-down** views of the same agents and computers. Camera choice survives reload when browser storage is available.

From the repository root, start:

```text
python scripts/agent_world.py
```

Open **http://127.0.0.1:8787**. The server binds only to loopback. Use `--port 8788` if the port is occupied, or `--runs-root <checkpoint-directory>` to choose a different local evidence root. By default it reads the current user's `.task-runs` directory.

## See work on the computers

Select a department's main monitor for **Code & activity**, or its side monitor for **App preview**. **Computers** opens the same view with a department selector. Native task activity and answers update as events arrive; reported file-change counts appear on the little screens. Select a reported file in the enlarged display to see its current workspace diff. The diff can include edits made before that task. Previewing a file changes no source code. Some large, binary, private or outside-workspace files are unavailable, and diff previews are bounded. Raw commands and tool output remain excluded.

In **App preview**, enter the URL of your already-running local app, such as `http://localhost:3000`, and choose **Connect preview**. The actual page appears in the enlarged screen, then in the department's small side monitor when closed. Its development server's live reload shows UI changes; **Reload** refreshes manually. The app must allow embedding. Remote URLs, credentials, non-HTTP URLs and this office's own port are rejected. The URL remains in browser memory only. Closing with Escape returns focus to the monitor. External sessions with role-only telemetry show their reported role state, without fabricated code or output.

## Watch the living office

**Live office** is the default. Start agents normally in your terminal or editor and recognized local processes arrive in the lobby. Native tasks assigned through this app appear alongside them. Stable avatars walk around furniture to their confirmed departments, show reported work and deliver task packets on explicit handoff events. Select a coworker to inspect its evidence. Departments expand to accommodate role-known parallel sessions.

The office fills the main view. Select a coworker or choose **Workers** to open the inspector; **Escape** closes it and restores focus. Open **Tasks & activity** for the work journal and **Source & connection details** for discovery limitations. On small screens the whole floor is visible initially; **Closer view** enlarges it for inspection, and **Whole office** returns to the overview. Assignment opens the journal automatically. The pixel-style scene preserves the same event-driven work and handoffs.

Waiting coworkers now walk through reception and the coffee corridor immediately, even before a task event arrives. This is ambient animation: an unknown process still says **Task unknown**, and walking does not change working counts. A confirmed task sends the same worker to its department's chair; an explicit handoff sends it toward the next department. The furnished office includes shared workstations, windows, file cabinets, printers and server racks.

**Pause movement** stops scene travel without stopping real agents. **Play movement** resumes it. Reduced-motion preferences disable movement by default; choosing Play explicitly enables it for this view. If no workers are detected, the office stays empty rather than inventing live staff.

Process detection cannot reveal a session's role or next task. The owning agent workflow can report those through the authenticated metadata helper. Unknown roles stay in the lobby; stored sessions remain in the inventory. Native completion never invents the next specialist. This view observes the workflow your agents already run and does not automatically execute a next step. Reduced motion places avatars at their destination and keeps textual routing evidence.

On task start, call this from your workflow's event hook, repeating every 10–15 seconds while active:

```text
python scripts/agent_world_heartbeat.py --provider Codex --session-id worker-one --state working --role builder --task-id work-42 --workspace <project-directory>
```

On an actual handoff:

```text
python scripts/agent_world_heartbeat.py --provider Codex --session-id worker-one --state waiting --role builder --task-id work-42 --handoff-to reviewer --event-id work-42-review-1 --workspace <project-directory>
```

The receiving session reports its own session identifier, role reviewer, state working and the same taskId. Roles are planner, designer, builder, reviewer, qa and security. Use opaque references rather than prompts or descriptions; task/event IDs are hashed before serving them. A handoff requires role, taskId and eventId; repeated retained events are idempotent and conflicting metadata is rejected. At most eighty handoff records remain in memory for five minutes. Fresh events animate for up to thirty seconds and appear as **Reported handoff** in Field notes. The helper invokes no AI provider and grants no execution permission. Existing plain heartbeat callers remain valid.

## Assign real native tasks

Enable live missions using the installed Codex CLI and its existing login:

```text
python scripts/agent_world.py --enable-live --workspace <repository-root>
```

To make local edit missions available, add `--allow-edits`. Choose **Live workspace**, then **New task**. Select a specialist and access. Read only is the default; only coordinator and builder roles can request workspace changes, and only when the operator enabled edits. The UI shows the configured workspace. Tasks use your native Codex account and its configured model; this interface sets no model or account credentials.

Live tasks run sequentially to avoid simultaneous edits. Ten unfinished missions may be queued. A character animates after its assigned native turn actually starts, and field notes follow recorded command, file, tool, search, and plan events. The character represents the assigned role; it does not invent mappings for the session's internal subagents. There is no made-up live completion percentage. Expand **Agent result** to read the final response. **Turn complete** means the native turn ended successfully, not that tests or review gates passed. Follow the workspace's Frank workflow to assess actual readiness before any delivery.

Use **Cancel mission** to stop queued work or terminate the owned process tree. Changes already made may remain. Windows runs use an owned job object; Linux runs use an owned process group, with stream consumption bounded independently of the leader's lifetime. Owned helper processes are cleaned up when a turn ends, so this queue is not a host for persistent background services. Runs have a 30-minute default limit; `--task-timeout <seconds>` supports 1–7200 seconds. The server never retries or replays missions automatically. A disconnected browser does not cancel a native run. Restarted unfinished records become **interrupted**, with unknown prior process outcome; inspect the workspace before launching replacement work.

Mission history and the requested final answer stay under the user's private `.agent-world` directory, separated by workspace. `--data-dir <private-directory>` chooses another location outside source and workflow evidence folders. Raw commands, tool outputs, reasoning, and CLI stderr are not stored or served. Prompts go to the native subprocess via stdin, and `--ephemeral` avoids native rollout persistence. Native sandbox and account behavior belong to the installed CLI; read-only is not a Docker container and the configured repository can have existing trusted hooks or tools. No sandbox bypass option is provided. Browser submission requires a local Origin and session token, and retries of the same retained request ID reconcile the original job.

`--codex-binary <native-executable>` can select an installed CLI executable if it is absent from PATH. A runner being available means the executable was found; login is established only by an actual successful run. Authentication or sandbox failures appear as failed jobs. This interface does not commit, push, publish, deploy, or send external messages.

The event interface and invocation follow [official Codex non-interactive documentation](https://learn.chatgpt.com/docs/non-interactive-mode), checked against the installed CLI help. Credentials remain in their original native account store.

## Discover sessions launched elsewhere

The live office automatically scans accessible local AI processes and Codex/Claude session records. Discovery is available even without `--enable-live`, and never launches Claude or another provider. Open **Connections & discovery** for session-list filters and a refresh button. These filters affect the journal inventory, while active characters remain on the floor.

Built-in process signatures recognize Codex, Claude Code, Gemini CLI, OpenCode, Aider, Ollama, LM Studio, Cursor, Windsurf, GitHub Copilot, Amazon Q, and Kiro. Recognition identifies a matching executable or runtime package entrypoint. It does not certify the executable's identity or reveal every chat inside an app. Node/Python mentions in ordinary prompt arguments are not treated as provider entrypoints. Windows uses OS process metadata, Linux uses readable `/proc` records, and macOS offers a partial executable-name scan.

The scanner reads bounded session metadata under `$CODEX_HOME/sessions` or the current user's `.codex/sessions`, and `$CLAUDE_CONFIG_DIR/projects` or the current user's `.claude/projects`. It also reads recent Codex thread IDs from the current user's local Codex runtime logs when available. A Codex state database can add a workspace basename and verified agent role, but is optional; absent or incompatible state databases still allow thread discovery. Versioned database filenames are discovered rather than tied to one installation. Override the profile with `--codex-home <directory>`, or the individual record roots with `--codex-sessions-root <directory>` and `--claude-projects-root <directory>`. It exposes opaque aliases, provider, workspace basename, PID when known, observation time, and evidence. It does not expose prompts, titles, message bodies, commands, account settings, credentials, or reasoning. No discovered metadata is copied to source or persisted by the scanner.

**Process alive** means the OS observed a matching process at the last scan. Its internal session count and task activity may be unknown. An explicit resume/session UUID in process arguments can correlate a session record with that process. **Recently updated** and **Stored session** describe disk records, not running agents. Codex runtime log sightings identify recent activity in an exact thread but do not prove its turn is still working. Process/history inventory refreshes every five seconds, while live Codex metadata is checked more frequently. File and state timestamps alone never make a character animate as working.

For another person's machine, run `python3 scripts/agent_world.py` (or `python` where it selects Python 3) from that person's checkout and open the printed localhost address on the same machine. The default profile roots follow that OS user's home directory; no path from the developer's computer is required. Keep the server on its default loopback address because the inventory describes private local work. Use `--codex-home` only if Codex uses a nondefault profile. A shared server for several people would require a separate authenticated per-machine collector and user isolation; this local scanner does not collect another computer's sessions.

Scans are bounded to 3,000 OS processes, 2,000 traversal entries per metadata root, 200 newest metadata candidates per root, eight header lines of at most 64 KiB each, and 200 returned inventory entries. Active process and fresh adapter entries take priority over history. Limits, skipped aliases, denied access, or unsupported collector lanes show **Partial inventory**. Collector failure clears current process entries while preserving separately read records with unknown activity. Hidden in-app conversations, browser/cloud sessions, Docker/WSL namespaces and inaccessible users' processes require a source adapter; this is not a claim that every session of every application is observable.

For another provider's native executable, add `--provider-process "My AI=my-agent.exe"`. This is an executable-name rule, not a command to execute. For sessions hidden behind a shared app process or model server, have a local integration report metadata:

```text
python scripts/agent_world_heartbeat.py --provider "My AI" --session-id opaque-session --state working --workspace <project-directory>
```

Report every 10–15 seconds and on state changes; allowed states are working, waiting, idle, and ended. The helper calls only the authenticated local metadata endpoint. It launches no provider and sends no prompt. API integrations can GET `/api/sessions` for the session token and POST `/api/sessions/heartbeat` with required provider, sessionId, state, workspace and nullable pid, plus optional role, taskId, handoffTo and eventId, using the local Origin and `X-Agent-World-Token` header. The PID is adapter-supplied metadata, not OS verification. States are labeled **Adapter: working** etc.; a heartbeat older than 30 seconds is expired, and after five minutes it disappears. Only fresh adapter-reported work animates an external character. Heartbeats are held in memory and never grant task execution or control over the external session.

### Codex lifecycle bridge

To show Codex sessions and subagents from the local Codex user profile, start the single Agent World server and install its lifecycle bridge:

```powershell
python scripts/install_agent_world_codex_hook.py --port 8790
```

The installer preserves other entries in `~/.codex/hooks.json` and installs a copy of the reporter under `~/.codex/hooks/`. Open `/hooks` in Codex to review and trust the new user-level hooks, then start or resume the session. Codex does not run untrusted user hooks. The current turn's earlier work cannot be replayed by this bridge. `SessionStart`, prompt, tool, stop, interrupt, session-end, and subagent lifecycle events update the office immediately when Codex emits them. Known tool names assign a department; unknown tools remain unassigned. The bridge has no access to a task's private contents and sends no prompt, tool input/output, or transcript. An event older than thirty seconds no longer counts as active work, so a long silent tool can temporarily look idle until another event arrives. Hook coverage depends on the Codex client and tool path; process discovery and local event-log observation remain fallback signals.

The Claude storage layout follows [official Claude session documentation](https://code.claude.com/docs/en/agent-sdk/sessions). For a Codex integration attached to its owning app-server, [official thread-list and runtime-status APIs](https://learn.chatgpt.com/docs/app-server) can supply authoritative thread metadata; starting a separate app-server does not reveal another instance's loaded threads.

## Observe real workflow checkpoints

The office journal includes **Recorded runs**, refreshing local checkpoint metadata every five seconds. The reader supports both Frank `schemaVersion` states with `phase` and portable journal states with `current.phase`. It reads only `<ticket>/<run>/state.json`, limits file size and run count, and exposes only directory labels, phase, tier, modification time, and recorded status. It never serves acceptance criteria, prompts, next actions, credentials, or transcripts.

Checkpoint writers must update their own records. A checkpoint older than 15 minutes without a recorded completed phase appears as **Stale checkpoint**. A recorded completed phase is labeled **Recorded complete**; it does not certify that tests passed or that anything deployed. There is no per-agent mapping or trustworthy completion percentage, so the office does not animate inferred real work. Checkpoint entries cannot launch tasks; the separate New task button submits an explicit native task. A disconnected reader clears its last results and shows an explicit unavailable state.

The live office requires the Python server. Demo simulation, player movement controls and simulated missions have been removed. No hosting or public upload is configured: real evidence stays local. Historical workflow checkpoints have no per-agent events; the live task adapter supplies events only for sessions launched through its own queue.

## Verify

Python regressions run with the existing development tooling:

```text
docker compose run --rm tooling
```

Office model tests use the existing Node development image:

```text
docker run --rm --network none -v <repository-root>:/workspace:ro -w /workspace node:22-alpine3.24 node --test apps/agent-world/engine.test.cjs apps/agent-world/game-model.test.cjs apps/agent-world/office-model.test.cjs
```

The world can scroll horizontally on small screens while page controls and mission content remain responsive. Character controls and crew rows are keyboard buttons, mission creation uses a modal dialog, and operating-system reduced-motion preferences disable character animations and transitions. Browser checks complement these design choices; they do not establish full accessibility conformance.

Python live tests and the browser fixture server execute offline subprocess fixtures rather than model calls. They verify stream handling, native process cancellation, access selection, replay protection, persistence, and actual HTTP/UI journeys; they do not establish native account availability. The optional native connection smoke is separate.

The office includes a furnished eight-seat conference room and equally sized, numbered computers. Each department starts with five desks around a shared circular workspace and adds pods for more role-known parallel sessions. Room height grows with new pods, and occupied computers retain stable identities during the visit. Click a computer or select its number in the enlarged display; every workstation has an independent app URL. Changed occupants disconnect the prior preview. Unknown roles remain in reception. Large offices scroll inside the floor view, and meetings are not inferred from the conference furniture.

### Show what agents are doing

Characters now show a reported action and short task name, with different props for Coding, Designing, Reviewing, Testing, Auditing and other observed actions. Native tasks use their mission title and structured tool-event category. A running process without supported work events stays marked Connect activity; the office does not read prompts or guess its task.

An existing agent hook/adapter can call the metadata reporter whenever its task/action changes, and renew its heartbeat at least every30seconds while active:

```powershell
python scripts/agent_world_heartbeat.py --provider Codex --session-id worker-a --state working --role builder --task-id checkout --task-label "Fix checkout layout" --action coding
python scripts/agent_world_heartbeat.py --provider Codex --session-id worker-b --state working --role reviewer --task-id checkout --task-label "Review checkout layout" --action reviewing
python scripts/agent_world_heartbeat.py --provider Codex --session-id worker-a --state working --role builder --task-id checkout --task-label "Fix checkout layout" --action helping --target-provider Codex --target-session-id worker-b
python scripts/agent_world_heartbeat.py --provider Codex --session-id worker-a --state waiting --role builder --task-id checkout --task-label "Checkout patch ready" --handoff-to reviewer --event-id checkout-transfer --target-provider Codex --target-session-id worker-b
```

Helping walks to the exact colleague with a visible link; handoff displays a named task packet and persistent transfer row. The source computer remains assigned to its owner. Use --target-job-id instead of the provider/session pair when targeting a running native office job. Reporting metadata never launches a provider or another task. Display labels are opt-in local metadata, so supply a concise task name rather than private prompt/transcript content. Click a character or Task flow card for its task, current action and destination; click its computer for available output/diffs or its local app preview.

The Office selector has two choices: Live workspace and Demo simulation. Native task assignment, cancellation and results are available in the same live office. The Tasks & activity journal groups native tasks, local sessions and recorded runs; checkpoint records never create agent characters.

Detected idle/unassigned characters walk reception, corridor and coffee routes as a labelled visual waiting routine. Unknown departments stay unassigned; cosmetic walking never claims tasks, collaboration or meetings. Reported working actors stay at their computers or explicit help/handoff destinations. Pause movement and reduced-motion settings also apply to waiting routines.

### Automatic local tool activity

The live office now reads bounded Claude Code and Codex session event tails automatically. An exact live Claude session with Edit/Write activity goes to a Build computer; Bash and project-reading activity also use Build. Planning, web research and agent coordination use Planning. This department is derived from the tool category, not a claim about a specialist's assigned role. The inspector and computer display identify Local session tool events.

The office feed shows a short timeline of structured actions as they arrive. Select a worker or its computer to see the actual recent assistant text, tool calls and tool results from its local Claude/Codex transcript when that provider writes one. This selected view may contain the same private content visible in your CLI or extension. It stays in the local browser session and is not added to the general feed or Agent World history. A provider that exposes only process or session presence still cannot supply text.

When a Codex app session updates its local runtime database before writing a fresh rollout file, the office follows the exact thread ID in bounded runtime records. Known runtime turn/tool targets add fixed Turn activity and Tool activity labels to that worker's timeline, placing the recently observed session at a shared computer. The selected output view says when the extension has not written a current transcript; runtime log entries cannot reconstruct its CLI-like text. It does not claim the turn is still working or assign a department; an explicit tool/lifecycle event or adapter report is needed for that state.

The office opens with a worker reporting current activity selected. Selecting another worker keeps that selection until the worker disappears. A parent Claude session lists its working subagents in the inspector; its own action remains unknown unless separately observed. The header distinguishes identified workers from process-only connections. On desktop the worker inspector occupies the right rail in place of the feed, and on mobile it opens as a full-screen sheet.

Turn completion stops the working pose. Supported tool events expire after five minutes without activity; unlinked Claude work is shown only while its last event is within thirty seconds. Claude subagent logs appear as separate workers linked to their parent session. The parent inspector lists working children without claiming the parent's own task is known. Fresh Codex task_started/tool events can appear with explicit unknown process linkage. Recorded completed turns do not create live workers. Unsupported providers, hidden threads, truncated/oversized logs and unavailable event streams still need an adapter. Fresh explicit role heartbeats take precedence.

The broad reader exposes fixed activity labels. Only the selected local-session output view reads a bounded transcript tail, including prompt and tool content where the provider wrote it. This does not certify file-change success, tests, or organizational roles. Actual code diffs remain available for native office jobs, and app previews remain user-connected. See [ADR0013](adr/0013-local-session-tool-activity.md).

### Live updates

Sessions and native jobs now share one persistent live stream. The browser receives pushed snapshots rather than requesting them every five seconds. Known local file activity is checked every250ms; native state uses the same producer. Unchanged tails are cached. The connection continues while a tab is hidden, reconnects automatically and clears stale workers if it fails. The header shows Live or Live/partial while receiving the stream. Explicit Refresh discovery and task operations can still make one-shot requests.

Initial discovery and newly started processes/files still depend on the separate, slower background inventory. This is near-live activity, with no guaranteed hard latency. Existing provider/log bounds and unknown states remain. Recorded checkpoint rows are historical evidence and retain their separate refresh. Eight stream clients, finite stream lifetimes and bounded Unicode-safe frames keep resource usage finite. See [ADR0014](adr/0014-live-office-stream.md).

The modern live office has five numbered computers around a shared circular workspace in each department. Employees are actual supported AI sessions and native jobs, not invented staff. Every computer is selectable; departments add more pods when over five workers need desks. The office floor uses camera zoom and drag-to-pan instead of scrollbars.

Head bubbles show reported task/action and named help or handoff destinations, including a task whose action details are unknown. Conversation text requires a provider adapter to report it; the office does not fabricate dialogue.

The office uses an isometric game view with a raised floor, walls, doors and furniture. Rotate buttons turn the office in 30-degree steps; on desktop, drag the floor with a mouse or pen for finer angles. The Top-down view rotates too. Characters still represent supported real sessions or native tasks. Mobile starts closer to the employees; scroll around the office or choose Whole office. Code, app previews, reported task bubbles and live activity retain their source/ownership boundaries as the camera moves.

Planning activity uses the conference room: reported planning, and Planning department research/coordination, route workers to distinct meeting chairs. Their department computer remains assigned for code/activity and any connected app preview. Coding or another activity returns them to their own desk; explicit helping/handoff follows the recipient's current location. The initial eight chairs expand for additional concurrent planners. Meeting placement reflects activity metadata and does not imply a conversation or expose private reasoning.
