# Observed verification, 07 October 2026

![Observed verification](verification.png)

The Docker proof ran **95 tests: 94 passed, one Windows-only junction test skipped, zero failures**, plus seven recipient integration assertions and three synthetic confidence/refusal scenarios. The complete proof took **60.24 seconds** in this run; this is tool-verification duration, not development-task speed or a comparison with the earlier 24-hour incident.

| Regression group | Passed | Skipped | Failed |
| --- | ---: | ---: | ---: |
| Evaluation and token accounting | 39 | 0 | 0 |
| Installer | 18 | 1 | 0 |
| Source hygiene validator | 5 | 0 | 0 |
| Review/commit evidence | 25 | 0 | 0 |
| Task state/timing | 7 | 0 | 0 |

Skipped: test_install.InstallerTests.test_nested_source_junction_refuses_external_content, because the runner is Linux and this case creates a Windows junction. That Windows-specific path is not proven by this Docker run. All observed outcomes and test IDs are in [results.json](results.json).

The recipient integration uses one temporary project with both adapters. It observed dry-run preservation, seven skills and six generated role references per adapter, an exact canonical scorer copy, preservation of four instruction/account files, atomic refusal of uninstall after an owned file was edited, and restoration of the original recipient file inventory. These are seven correlated deterministic assertions, not seven independent sampled AI tasks.

Synthetic evaluator checks: 72/72 has lower Wilson endpoint 94.935%; 73/73 has 95.001%; 99/100 has 94.551%. **All three refused certification** because they are synthetic. They verify arithmetic and refusal policy; they do not establish live AI accuracy.

A separate opt-in Windows browser MCP smoke also passed six steps: protocol initialization, tool discovery, loopback fixture navigation, accessible button discovery, actual click with observed status, and browser close. See [browser-results.json](browser-results.json). Package @playwright/mcp@0.0.83 is pinned in the recipe; the reported server version is a separate field. The first attempts exposed a click-schema mismatch; the smoke now uses the observed target argument required by that pinned server. No production app or personal browser profile was involved.

## Reproduce and inspect provenance

From a clone with Docker, use a **fresh external directory**:

```text
docker compose run --rm --volume <absolute-external-directory>:/proof tooling python scripts/prove.py --output-dir /proof
```

The source mount is read-only, test execution has no network access, and fixtures use executable temporary storage for real Git-hook checks. The development image used here was sha256:e68205b31938d79fcaaa3db898c2d57564c522c851dfcef8141f906465cbd650 with Python 3.13.16 and Git 2.39.5. This identifies the observed image; the Dockerfile's base tag is floating, not digest-pinned, so a later rebuild may differ.

The results preserve baseCommit plus SHA-256 for the tested scripts, tests, skill/resources, agents, templates, examples and Docker inputs. baseCommit is the parent revision before these additions; testedInputs identifies the actual tested content including then-uncommitted additions. Reports and this chart are deliberately excluded from that input hash so generation cannot hash itself. Later code/resources can invalidate these results even while a historical image remains visible.

To redraw only the chart, use a separate plotting environment with matplotlib (observed version 3.11.2):

```text
python docs/verification/render.py docs/verification/2026-10-07/results.json verification.png
```

Matplotlib is optional presentation tooling, not a dependency of the installed skills or offline proof. Private command logs and browser RPC responses remain outside shared sources; the published JSON contains only selected counts, source hashes, environment and scope.

## Limits

The checks prove observed deterministic tools and controlled integration behavior. Claude and Codex agreed on the design after independent research and challenge; agreement does not prove implementation correctness. Live model accuracy, token/cost savings, production latency, standards certification, recipient account access, Figma connection, production/browser journeys and remote Bitbucket CI remain unmeasured or unverified. Those require representative independently graded outcomes and recipient-owned integration smoke checks. See [the optimization method](../../optimization.md) and [connection states](../../connections.md).
