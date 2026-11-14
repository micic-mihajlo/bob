# Build loop performance

How long a small request takes to reach the merge approval card with a live model, before and after the runtime changes in this document, and how to measure it again.

## How to measure

`pnpm live live-run` runs `scripts/live-run.live.ts`: a fresh invoices project in a temp folder, the model brain (the captain on `BOB_MODEL_STRONG`, crew threads on `BOB_MODEL_LIGHT`), and the request "Customers want to export invoices as CSV." When the captain pushes back on the request as untestable, the harness answers once with a testable version. It prints every thread item with a timestamp and a JSON summary, and writes both to `BOB_LIVE_OUT` when that is set. It needs `AI_GATEWAY_API_KEY` in `.env.local`. `BOB_LIVE_REQUEST`, `BOB_LIVE_ANSWER` and `BOB_LIVE_LIMIT_MS` override the defaults. The summary records the two models and, for every model call, its agent, its time and the names of the tools it called.

`pnpm live live-two` runs `scripts/live-two.live.ts`: it types a CSV export request, then a JSON export of overdue invoices as soon as the first crew thread exists, answers each pushback once, and approves every merge card. It prints each thread's role, branch and work order, each pull request with its files and whether it merged, and anything left running, queued or waiting for approval.

Two clocks matter. **Brief to approval** runs from the moment the first crew thread receives the captain's brief to the moment the approval card appears. **Total** runs from the person's first message, so it also counts the captain's intake question, planning, and the person's answer.

## Numbers

All runs used kimi-k3.1-pro for the captain, deepseek-v4.1-flash for crew threads, and a step pace of 0.

| Run | Brief to approval | Total | Model calls | Steps | Work orders |
| --- | --- | --- | --- | --- | --- |
| Before | ~490 s | 508 s | 93 | 127 | 1 |
| After, run A | 74 s | 145 s | 30 | 29 | 1 |
| After, run B | 50 s | 83 s | 24 | 20 | 1 |
| After, run C | 143 s | 180 s | 45 | 46 | 2 |
| After, run D | 196 s | 236 s | 90 | 102 | 2 |

In the "before" run (pace 0; the app's default pace of 600 ms per move added about 90 s more), the time went to two things:

1. **The build thread worked in tiny steps and hit its 24-move cap.** It had no shell, so it read files one at a time, wrote one file per call, committed four times, and polished comments. At 139 s it hit the cap, reported blocked, and the captain had to send it back for a second turn. Build work came to 39 model calls and 177 s.
2. **Three review threads in a row failed with "finish reason: length".** Each one read the diff through several `git show` calls, then a reply spent its whole 8,000-token output budget without calling a tool, so the turn threw. The captain closed each one and started another. That cost about 240 s before the fourth reviewer approved.

After the changes, a single work order's build thread takes 4 to 8 model calls (about 15 to 25 s). It writes the change and its test in one call, runs `npm test` and the type check, and opens the pull request. The review thread takes 5 or 6 calls (about 15 s): it runs the tests on the pull request's own branch and records a verdict. In every run with one work order, the time from brief to approval card was under 2 minutes.

Runs C and D went over 2 minutes because the captain split the request into two work orders: a serializer, and an export button or action that the module does not have. The two build threads wrote overlapping files, and one review requested changes. That split is a captain planning decision, not a runtime cost. The captain's own model calls are now the largest share of the total: 57 to 163 s across 13 to 22 calls.

## Choosing the models

The single-call probe sends one captain-shaped prompt that needs two tool calls, and records the time to the full reply.

| Model | One call | Both tool calls in one reply |
| --- | --- | --- |
| deepseek-v4.1-flash-fast | 1.8 s | yes |
| deepseek-v4.1-flash | 1.9 s | yes |
| glm-5.3 | 2.4 s | yes |
| glm-5.3-fast | 2.5 s | yes |
| kimi-k3-fast | 2.9 s | yes |
| kimi-k3.1-pro | 3.9 s | no |

A fast single call did not mean a fast captain. The sweep below ran the whole request with each model as the captain and deepseek-v4.1-flash as the crew, before bob#25:

| Captain | To approval | Brief to approval | Model calls | Captain calls | Captain time | Longest captain call | Work orders |
| --- | --- | --- | --- | --- | --- | --- | --- |
| kimi-k3.1-pro | 76 s | 56 s | 26 | 13 | 40 s | 6.6 s | 1 |
| kimi-k3-fast | 100 s | 75 s | 30 | 12 | 74 s | 34.2 s | 1 |
| glm-5.3-fast | 133 s | 116 s | 24 | 11 | 86 s | 38.4 s | 2 |
| deepseek-v4.1-flash-fast | 241 s | 227 s | 48 | 12 | 44 s | 15.5 s | 2 |

Each fast variant had at least one captain call of 15 to 38 s, and two of them split the request into two work orders, which costs far more than any single call saves. kimi-k3.1-pro made more calls but never a slow one.

Then six runs after bob#25 (one work order for a small request), kimi-k3.1-pro as the captain, comparing crew models. "To approval" runs from the typed sentence and includes the harness's answer to the captain's pushback.

| Run | Crew | To approval | Brief to approval | Model calls | Captain calls | Captain time |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | deepseek-v4.1-flash | 111 s | 89 s | 19 | 9 | 43 s |
| 2 | deepseek-v4.1-flash | 91 s | 69 s | 18 | 8 | 40 s |
| 3 | deepseek-v4.1-flash | 88 s | 61 s | 22 | 12 | 52 s |
| 4 | deepseek-v4.1-flash-fast | 129 s | 94 s | 27 | 14 | 60 s |
| 5 | deepseek-v4.1-flash-fast | 138 s | 103 s | 27 | 13 | 57 s |
| 6 | deepseek-v4.1-flash-fast | 101 s | 76 s | 20 | 9 | 50 s |

Every run planned one work order. On deepseek-v4.1-flash, 3 of 3 runs reached the approval card in under 2 minutes from the typed sentence. The fast crew variant made more calls and was slower in all three runs. So the defaults stay at kimi-k3.1-pro for the captain and deepseek-v4.1-flash for the crew. The captain still takes 40 to 60 s over 8 to 14 calls, which makes it the largest remaining share.

## Two requests at once

`pnpm live live-two` with the default models, after bob#29:

- The CSV request and the overdue-JSON request each got their own build thread, branch, workspace and review thread (INV-1 to INV-4), and each became one work order.
- PR #1 (CSV) reached its approval card at 111 s and merged. PR #2 then conflicted with main in `src/invoices.ts` and `src/invoices.test.ts`. The runtime sent that to INV-2, which merged main into its branch and kept both exports. A new head went to INV-4 for review again, and PR #2's card appeared at 168 s.
- Both PRs merged at 198 s, all four threads closed, and no turn, queued delivery or approval was left behind.

The first run before bob#29 found the one way the second request could strand. Its conflict update and re-reviews used up the request's 12-delivery budget, so the automatic re-review was refused and PR #2 stayed in review. Hand-offs now have a separate budget of their own (24 deliveries per request, see docs/formal.md).

## What changed

- **A shell per thread.** `run` executes one bash command in the thread's own checkout, in its own process group. A timeout (120 s by default, at most 600 s) kills the whole group. The command gets an environment built from scratch: no API keys, `HOME` set to the project's own folder, and `node_modules/.bin` on the `PATH`. Output over 12,000 characters keeps its head and tail. The step in the thread shows the command, its output and whether it passed.
- **Setup runs once per project.** The project's dependencies are installed once into `<workspaces>/<project>/deps`, a checkout of main. The install uses the repository's lockfile (pnpm, bun, yarn or npm), and starts in the background when the first thread starts. Each thread's workspace gets a hard-linked copy of that `node_modules`, which takes milliseconds. A thread whose branch changes `package.json` or the lockfile installs its own copy. The install reruns only when main's manifests change.
- **Coarser tools.** `read_files`, `write_files` and `edit_files` each take up to 20 files. `open_pull_request` commits every pending change itself (`commitMessage`). The old single-file tools are gone.
- **A first context that removes the exploring.** Before its first move, a build or research thread sees its file tree and the full text of the key files (manifests and docs first, then files that match the brief, up to 24 KB). A review thread starts with the pull request's branch checked out, its whole diff, and the changed files in full, so the tests it runs are the pull request's tests.
- **Limits end a turn cleanly, and nothing strands.** A build thread gets 24 moves, a review or research thread 12. Three moves before the cap, the turn is told how many moves are left and how to finish for its role. A turn that still hits the cap, or its 10-minute wall clock, ends as failed. It posts a notice in the thread and sends the captain a blocked report that lists its last steps. Each model call times out after 180 s. A reply cut off by the output limit gets one shorter retry without reasoning before the turn fails.
- **No artificial pace for the model brain.** The 600 ms step pace exists so the scripted brain's instant moves are visible in the UI. With a live model it only added latency, so it now applies to the scripted brain alone.

## Bringing in a repository

Set `BOB_PROJECT_REPO` to an `https://`, `ssh://` or `git@` URL, or to a local path, before the project's first thread starts. Its `main` branch becomes the project's shared origin in place of the invoices template, and its dependencies are installed once in the same way. A project whose saved state already sets `repo` uses that instead.
