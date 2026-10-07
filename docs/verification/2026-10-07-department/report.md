# Department expansion verification

The twelve canonical department roles and seven skills install intact into both assistant adapters. The dedicated designer provides UX/state/accessibility handoffs; product, architecture, research, platform and data roles join the existing engineering/review team. Read the [usage guide](../../getting-started.md) and [workflow graphic](../../workflow.png).

[Recorded Docker results](results.json) bind 50 tested input files to SHA-256 `825128cd0e11398bf6ec99eb9a36565cbeab9d8a2cf0f70030aa142cae83ff5f`. These results supersede the earlier proof for the expanded roles; the older report and graphic remain evidence for their recorded input set.

| Actual check | Result |
| --- | --- |
| Docker regression suites | 95 discovered; 94 passed, one Windows-only junction skip, zero failures/errors; proof duration 70.06 seconds |
| Windows installer suite | 19 discovered; 16 passed, three privilege-dependent symlink skips, zero failures/errors; 48.435 seconds |
| Cross-platform case coverage | The Windows junction case passed on Windows; the three Windows-skipped symlink cases passed in Docker. These are environment-specific runs, not one runner with no skips. |
| Recipient installation demonstration | Seven correlated assertions passed, including exact canonical role names/bytes for both adapters and Claude native agents; preserved account/instruction files and uninstall restoration |
| Additional global user-scope smoke | Fake home with spaces: preview, apply, seven skills/twelve exact roles, protected global files and uninstall restoration passed in offline Docker. No actual home configuration changed. |
| Synthetic evaluation demonstrations | All three refused live certification as required. Synthetic cases are not AI accuracy measurements. |

The final Docker runtime used Python 3.13.16, Git 2.39.5 and image identity `sha256:e68205b31938d79fcaaa3db898c2d57564c522c851dfcef8141f906465cbd650`, with read-only source and no network. Windows installer verification used Python 3.13.7.

The initial in-flight proof refused publication because its source inputs changed during documentation work. It was not reused as a pass; QA ran the final source version independently. Local execution logs remain outside the shared repository because they contain machine-specific paths.

The [earlier combined audit](../2026-10-07/combined-results.json) and [earlier Windows results](../2026-10-07/windows-results.json) describe the earlier source hash `322a23409c0ef869027cea6a24362097b47a4604335476b107bb0db6a31c4361`. Their 95 distinct cases observed passing across platforms do not establish current live AI quality or all cases passing on every OS.

Live assistant task quality, third-party account connections, token savings, production speed, remote CI and universal standards/security compliance remain unmeasured. Installing role instructions does not establish those outcomes.
