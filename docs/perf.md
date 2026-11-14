# Build loop performance

How long a small request takes to reach the merge approval card with a live model, before and after the runtime changes in this document, and how to measure it again.

## How to measure

`pnpm live` runs `scripts/live-run.live.ts`: a fresh invoices project in a temp folder, the model brain (the captain on `BOB_MODEL_STRONG`, crew threads on `BOB_MODEL_LIGHT`), and the request "Customers want to export invoices as CSV." When the captain pushes back on the request as untestable, the harness answers once with a testable version. It prints every thread item with a timestamp and a JSON summary, and writes both to `BOB_LIVE_OUT` when that is set. It needs `AI_GATEWAY_API_KEY` in `.env.local`. `BOB_LIVE_REQUEST`, `BOB_LIVE_ANSWER` and `BOB_LIVE_LIMIT_MS` override the defaults.

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

## What changed

- **A shell per thread.** `run` executes one bash command in the thread's own checkout, in its own process group. A timeout (120 s by default, at most 600 s) kills the whole group. The command gets an environment built from scratch: no API keys, `HOME` set to the project's own folder, and `node_modules/.bin` on the `PATH`. Output over 12,000 characters keeps its head and tail. The step in the thread shows the command, its output and whether it passed.
- **Setup runs once per project.** The project's dependencies are installed once into `<workspaces>/<project>/deps`, a checkout of main. The install uses the repository's lockfile (pnpm, bun, yarn or npm), and starts in the background when the first thread starts. Each thread's workspace gets a hard-linked copy of that `node_modules`, which takes milliseconds. A thread whose branch changes `package.json` or the lockfile installs its own copy. The install reruns only when main's manifests change.
- **Coarser tools.** `read_files`, `write_files` and `edit_files` each take up to 20 files. `open_pull_request` commits every pending change itself (`commitMessage`). The old single-file tools are gone.
- **A first context that removes the exploring.** Before its first move, a build or research thread sees its file tree and the full text of the key files (manifests and docs first, then files that match the brief, up to 24 KB). A review thread starts with the pull request's branch checked out, its whole diff, and the changed files in full, so the tests it runs are the pull request's tests.
- **Limits end a turn cleanly, and nothing strands.** A build thread gets 24 moves, a review or research thread 12. Three moves before the cap, the turn is told how many moves are left and how to finish for its role. A turn that still hits the cap, or its 10-minute wall clock, ends as failed. It posts a notice in the thread and sends the captain a blocked report that lists its last steps. Each model call times out after 180 s. A reply cut off by the output limit gets one shorter retry without reasoning before the turn fails.
- **No artificial pace for the model brain.** The 600 ms step pace exists so the scripted brain's instant moves are visible in the UI. With a live model it only added latency, so it now applies to the scripted brain alone.

## Bringing in a repository

Set `BOB_PROJECT_REPO` to an `https://`, `ssh://` or `git@` URL, or to a local path, before the project's first thread starts. Its `main` branch becomes the project's shared origin in place of the invoices template, and its dependencies are installed once in the same way. A project whose saved state already sets `repo` uses that instead.
