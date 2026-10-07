# Authorized delivery

Read the current project's branch/PR/CI policy, migration order, availability constraints and rollback procedure. No shared skill hard-codes a service, host, time window or job.

1. Gate completed staged work immediately before coordinator commit. Discover actual branches/remotes. Worker commits and force pushes are excluded.
2. Verify the committed tree matches reviewed stagedTree, direct parent matches reviewed HEAD and worktree is clean, using scripts/evidence.py postcommit --snapshot <external-file>. If hooks rewrote code, stop and review the new result. Normal Git line-ending conversion is judged by Git content identity, not raw byte guesses.
3. Push only the authorized target. Observe remote action identities before retrying. Required review/CI approvals remain in force. New merged code/conflict resolutions require renewed validation.
4. For deployment authorization, follow actual migrations/build/rollout order; inspect deployed revision/image and failures. A successful build or HTTP 200 is insufficient functional proof.
5. Test actual acceptance journeys in the delivered environment; UI work needs legitimate browser interaction and persistence readback. Keep failures checkpointed and return through diagnosis/fix/review/delivery.
6. Clean up only task-created resources. Report commits/PRs/builds, changed behavior, actual evidence and limits. Ticket updates/messages/production/payment operations require their own scope authorization.
