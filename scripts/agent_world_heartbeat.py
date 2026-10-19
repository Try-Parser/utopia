"""Report an existing session's metadata to local Utopia Cyberworld; no AI calls."""
import argparse
import json
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", required=True)
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--state", required=True, choices=("working", "waiting", "idle", "ended"))
    parser.add_argument("--awaiting-human", action="store_true", help="Report that this waiting session asked a human for input")
    parser.add_argument("--workspace", default="")
    parser.add_argument("--pid", type=int)
    parser.add_argument("--role", choices=("planner", "designer", "builder", "reviewer", "qa", "security"))
    parser.add_argument("--task-id", help="Opaque workflow reference; never a prompt or task description")
    parser.add_argument("--handoff-to", choices=("planner", "designer", "builder", "reviewer", "qa", "security"))
    parser.add_argument("--event-id", help="Unique idempotent reference for this handoff")
    parser.add_argument("--task-label", help="Short display label, not a prompt or transcript")
    parser.add_argument("--action", choices=("planning", "designing", "coding", "reviewing", "testing", "auditing", "helping", "command", "research", "tool", "coordination", "reporting"))
    parser.add_argument("--target-provider", help="Provider of the specific colleague being helped or receiving the task")
    parser.add_argument("--target-session-id", help="Session reference for the specific colleague")
    parser.add_argument("--target-job-id", help="Native office job ID, instead of provider/session references")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Invalid local port")
    if args.awaiting_human and args.state != "waiting":
        parser.error("--awaiting-human requires --state waiting")
    base = f"http://127.0.0.1:{args.port}"
    with urlopen(base + "/api/sessions", timeout=15) as response:
        token = json.load(response)["token"]
    data = {"provider": args.provider, "sessionId": args.session_id, "state": args.state,  # ai-department-allow: session-export (local metadata schema)
            "workspace": args.workspace, "pid": args.pid}
    if args.awaiting_human:
        data["awaitingHuman"] = True
    for field, value in (("role", args.role), ("taskId", args.task_id), ("handoffTo", args.handoff_to), ("eventId", args.event_id),
                         ("taskLabel", args.task_label), ("action", args.action), ("targetProvider", args.target_provider), ("targetSessionId", args.target_session_id), ("targetJobId", args.target_job_id)):
        if value is not None:
            data[field] = value
    request = Request(base + "/api/sessions/heartbeat", data=json.dumps(data).encode(),
                      headers={"Content-Type": "application/json", "Origin": base, "X-Agent-World-Token": token})
    with urlopen(request, timeout=5) as response:
        json.load(response)
    print("Local session heartbeat recorded.")


if __name__ == "__main__":
    main()
