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

## Demo reliability: ten runs back to back

`scripts/live-ten.sh <dir> 10` runs `live-run` ten times in a row, each on fresh state, with `BOB_LIVE_MERGE=1`. The harness answers the captain's pushback once, approves the merge card at once, and runs on until the pull request merged and every crew thread closed. Each summary records the time from the typed sentence to the approval card, to the merge and to the last thread closing. It also records model errors, failed turns, and the longest gap with a turn running and nothing new in any thread, which counts as a stall at 45 s or more. Models: kimi-k3.1-pro for the captain and deepseek-v4.1-flash for the crew.

**Before**, on main at 791d0e2:

| Run | To approval | To merged | To closed | Longest gap | Errors | Captain calls | Captain time | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 69 s | 80 s | 83 s | 11 s | 0 | 16 | 60 s | approve |
| 2 | 81 s | 93 s | 96 s | 20 s | 0 | 15 | 83 s | approve |
| 3 | 92 s | 95 s | 98 s | 25 s | 0 | 13 | 61 s | approve |
| 4 | 90 s | 103 s | 106 s | 22 s | 0 | 15 | 90 s | approve |
| 5 | 97 s | 100 s | 101 s | 17 s | 0 | 14 | 84 s | approve |
| 6 | 100 s | 105 s | 107 s | 18 s | 0 | 20 | 93 s | approve |
| 7 | 85 s | 93 s | 100 s | 20 s | 0 | 15 | 74 s | approve |
| 8 | 60 s | 66 s | 68 s | 8 s | 0 | 15 | 45 s | approve |
| 9 | 92 s | 99 s | 107 s | 17 s | 0 | 14 | 80 s | approve |
| 10 | 158 s | 171 s | 176 s | 13 s | 0 | 13 | 86 s | changes, then approve |

10 of 10 completed with no failed turns and no stalls. To approval: median 91 s, p90 100 s, worst 158 s. The worst run was a medium review finding plus a fix round, which cost about 55 s. In every run the captain called advance_stage and request_approval in separate replies, and the merge and the closes in separate replies again. In most runs it also called list_threads although its input already lists the crew. (The uncommitted bob#47 change sat in the checkout when runs 7 and 8 started. No call in them failed or timed out, so its retry path never ran.)

**After**, on main at 5cfb69c: bob#47 (retries and a fallback model), bob#55 (streaming), bob#58 (the read step), bob#61 (captain autopilot):

| Run | To approval | To merged | To closed | Longest gap | Errors | Captain calls | Captain time | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 70 s | 71 s | 71 s | 7 s | 0 | 10 | 33 s | approve |
| 2 | 48 s | 49 s | 49 s | 6 s | 0 | 10 | 24 s | approve |
| 3 | 59 s | 60 s | 60 s | 10 s | 0 | 13 | 38 s | approve |
| 4 | 81 s | 81 s | 81 s | 13 s | 0 | 12 | 42 s | approve |
| 5 | 43 s | 43 s | 43 s | 8 s | 0 | 14 | 33 s | approve |
| 6 | 87 s | 88 s | 88 s | 17 s | 0 | 11 | 34 s | approve |
| 7 | 61 s | 62 s | 62 s | 11 s | 0 | 11 | 47 s | approve |
| 8 | 65 s | 66 s | 66 s | 26 s | 0 | 12 | 54 s | approve |
| 9 | 50 s | 51 s | 51 s | 5 s | 0 | 10 | 29 s | approve |
| 10 | 72 s | 73 s | 73 s | 13 s | 0 | 14 | 47 s | approve |

10 of 10 completed with no failed turns and no stalls. To approval: median 63 s, p90 81 s, worst 87 s. Merged and closed came within 1 s of the approval, down from 3 to 18 s. The captain's own model time fell from 45 to 93 s to 24 to 54 s per request.

No review asked for changes in the after runs. A fix round adds about 50 s, so a run with one would land near 115 to 135 s.

What changed for the tail:

- **Captain autopilot (bob#61).** Before the captain's first model call in a turn, the runtime runs the steps its rules already fix. A review that approves the current head gets advance_stage and request_approval, so that turn makes no model call. An approved merge card gets merge_pull_request and close_thread for its threads.
- **Retries and a fallback (bob#47).** Each move tries its model twice, then a fallback model (kimi-k3-fast for the captain, glm-5.3-fast for the crew), with 1 s and 3 s between attempts. Each attempt has a timeout: 60 s for the captain, 120 s for the crew. A hung call used to hold the turn for 180 s and then fail it.
- **Liveness (bob#55, bob#58).** Text and started tool calls stream into `state.live` while the model writes them, and a crew turn opens with a finished "Read N files" step for the files it was given. These don't change the timings. They make the thread visibly busy during the 5 to 25 s a model call takes.

## Acceptance test first

A build thread now writes the work order's acceptance check as `src/acceptance/<work order id>.test.ts` before any code. It runs that file alone and shows it failing, then implements and runs the whole suite. Three live runs through merge on the branch (kimi-k3.1-pro captain, deepseek-v4.1-flash crew):

| Run | To approval | To closed | Build turn | Acceptance test written → first code edit |
| --- | --- | --- | --- | --- |
| 1 | 64 s | 65 s | 18 s | 4.9 s |
| 2 | 54 s | 55 s | 17 s | 5.0 s |
| 3 | 54 s | 54 s | 19 s | 7.4 s |

All three completed with no failed turns or stalls, and every review approved and named the acceptance test. The median to approval was 54 s, against 63 s in the ten runs above, so the red run fits inside run-to-run noise.

The red step (writing the test, running it alone, one more model call) cost 5 to 7 s, well under the 15 s budget. The red run was a single targeted file from the start (`npx vitest run <file>`), and the green run is the whole suite.

In run 3 the model piped its red run through `tail`, and the pipe hid the exit code. The `run` tool now fails a test command whose output reports failing tests, whatever the exit code. The brief also says to run the file without a pipe.

## What changed

- **A shell per thread.** `run` executes one bash command in the thread's own checkout, in its own process group. A timeout (120 s by default, at most 600 s) kills the whole group. The command gets an environment built from scratch: no API keys, `HOME` set to the project's own folder, and `node_modules/.bin` on the `PATH`. Output over 12,000 characters keeps its head and tail. The step in the thread shows the command, its output and whether it passed.
- **Setup runs once per project.** The project's dependencies are installed once into `<workspaces>/<project>/deps`, a checkout of main. The install uses the repository's lockfile (pnpm, bun, yarn or npm), and starts in the background when the first thread starts. Each thread's workspace gets a hard-linked copy of that `node_modules`, which takes milliseconds. A thread whose branch changes `package.json` or the lockfile installs its own copy. The install reruns only when main's manifests change.
- **Coarser tools.** `read_files`, `write_files` and `edit_files` each take up to 20 files. `open_pull_request` commits every pending change itself (`commitMessage`). The old single-file tools are gone.
- **A first context that removes the exploring.** Before its first move, a build or research thread sees its file tree and the full text of the key files (manifests and docs first, then files that match the brief, up to 24 KB). A review thread starts with the pull request's branch checked out, its whole diff, and the changed files in full, so the tests it runs are the pull request's tests.
- **Limits end a turn cleanly, and nothing strands.** A build thread gets 24 moves, a review or research thread 12. Three moves before the cap, the turn is told how many moves are left and how to finish for its role. A turn that still hits the cap, or its 10-minute wall clock, ends as failed. It posts a notice in the thread and sends the captain a blocked report that lists its last steps. Each model call times out after 180 s. A reply cut off by the output limit gets one shorter retry without reasoning before the turn fails.
- **No artificial pace for the model brain.** The 600 ms step pace exists so the scripted brain's instant moves are visible in the UI. With a live model it only added latency, so it now applies to the scripted brain alone.

## Bringing in a repository

Set `BOB_PROJECT_REPO` to an `https://`, `ssh://` or `git@` URL, or to a local path, before the project's first thread starts. Its `main` branch becomes the project's shared origin in place of the invoices template, and its dependencies are installed once in the same way. A project whose saved state already sets `repo` uses that instead.
