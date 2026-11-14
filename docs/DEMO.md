# Running the demo

Bob and B(l)obs: Bob and his lil builders. Bob is the captain you talk to, and the Blobs are the build and review agents he starts.

## On a fresh Mac, in under 5 minutes

You need Node 20.9 or later (24 is what Bob is tested on), pnpm, and git 2.28 or later.

```bash
brew install node            # or: nvm install 24
corepack enable              # gives you the pnpm version package.json pins
xcode-select --install       # only if git is missing
```

Then:

```bash
git clone https://github.com/micic-mihajlo/bob.git && cd bob
pnpm install                 # about a minute
cp <the BOB Captain drive>/secrets/bob.env.local .env.local    # or write AI_GATEWAY_API_KEY=... into .env.local
pnpm demo
```

Open http://localhost:3000.

`pnpm demo` does the rest. First it checks the machine: the Node and git versions, that dependencies are installed (it runs `pnpm install` when they aren't), and that the port is free. Then it builds and starts the production server and resets Bob to the demo seed. The reset re-creates the project's repository and installs its dependencies before it answers, so the first Blob doesn't wait on an install. Last, it prints what is on and off:

```
  Model            live: captain deepseek/deepseek-v4.1-flash, crew on the coding agent
  Crew engine      Claude Agent SDK for build and review (BOB_ENGINE=loop for the move loop)
  run sandbox      plain shell (no namespace sandbox on darwin); commands still get no API keys
  HydraDB graph    off (BOB_STORE=hydra turns it on)
  Voice            browser speech (BOB_VOICE=elevenlabs for ElevenLabs)
  GitHub PRs       on via composio to micic-mihajlo/bob
  Vercel previews  off (BOB_PREVIEWS=vercel turns it on)
  Project          bob (https://github.com/micic-mihajlo/bob.git)
```

Other flags: `--sample` and `--scripted` (the fallback below), `--prewarm` (sends request B as soon as the server is up, so its PR is under way before you speak), `--keep` (start without resetting; it says so if Bob's own repository isn't open), `--dev` (`next dev` instead of a production build), and `--port 3001`. Logs go to `.data/demo/`.

On macOS, `run` has no namespace sandbox. Every run step says so ("plain shell"). Commands still run in the thread's own checkout, with a scrubbed environment and no API keys, but the file system isn't sealed the way it is on Linux. `pnpm verify` works on a Mac once Lean is installed (it prints the one-line elan install). Without Lean it skips the proofs and still runs the conformance tests. The demo doesn't need it.

The live model is deepseek/deepseek-v4.1-flash for Bob and the Blobs, set by `BOB_MODEL_STRONG` and `BOB_MODEL_LIGHT` in `.env.local`. Build and review Blobs run on the Claude Agent SDK by default: one coding-agent query per turn, with Bob's own tools over MCP. They use Token Pass, or your own Claude once you pick **Connect your Claude** in the model picker. Bob stays on the move loop. With a live model, every pull request that changes source runs the verification gate: a contract, fast-check properties, mutants of the changed lines and a Lean proof. Live, the gate is advisory: its line shows on the card but never blocks. In `--scripted` it blocks.

## The 3-minute script: Bob builds Bob

`pnpm demo` opens Bob's own repository (micic-mihajlo/bob) at the pinned branch `demo/self-base`, so every take starts from the same code. Bob takes two requests about himself, his Blobs build and review them in their own checkouts, and on your approval each pull request merges into `demo/self`, never main. With `COMPOSIO_API_KEY` in `.env.local` the PRs open on GitHub through Composio, with the demo label and a "[demo]" title.

The times below are from the first live run of this order (`pnpm walkthrough --live --self`, deepseek/deepseek-v4.1-flash for Bob and the Blobs, Claude Agent SDK engine), counted from when request A was sent. Both PRs merged: [#291](https://github.com/micic-mihajlo/bob/pull/291) (A) and [#290](https://github.com/micic-mihajlo/bob/pull/290) (B). The whole loop took about 7 minutes, so talk over the build, and cut in the edit if it's a recording.

| Time | What happens |
| --- | --- |
| before | `pnpm demo`. Open Bob on the **Bob itself** project. The codebase pane shows Bob's own modules from the HydraDB graph. |
| 0:00 | One breath: one agent is a tool, a crew of builders needs a foreman, and nobody can see what a swarm is doing or why. Bob is the foreman, the Blobs are his lil builders, and today they build Bob. |
| 0:05 | Say request A: "Put a big timer on each roadmap card showing how long its request has been running." It gets its own track at Intent, and Bob asks one sharp question (3 s). |
| 0:15 | Answer it by typing: "Add formatElapsed(ms) in src/lib/format-time.ts: 45s under a minute, 3m 05s under an hour, else 1h 02m. Show it as a large number at the top of each roadmap card, counting every second from track.startedAt (when the request was recorded) with useNow from src/lib/client/use-now.ts. Done when a vitest test passes for 45, 185 and 3720 seconds." The track moves to Build and a build Blob starts (32 s). Its acceptance test runs red and locks. |
| 0:40 | While A builds, type request B: "Show when each pull request was opened as relative time on its card: add formatAgo(ms) in src/lib/format-time.ts returning just now under 10 s, then 12s ago, 5m ago, 2h ago, 3d ago. Done when a vitest test passes for 5 s, 12 s, 300 s, 7200 s and 3 days." Type it only after you've answered A's question, or it's taken as the answer. B gets its own track and build Blob (46 s). Both requests write `src/lib/format-time.ts`. |
| 1:00 | Open A's build Blob: it reads Bob's files, writes the code and runs the related tests in its own checkout. Point at the verification line: a contract, fast-check properties and mutants of the changed lines. |
| ~3:20 | Both PRs open (B at 203 s, A at 247 s), and a review Blob reads each one. |
| ~5:20 | B's merge card arrives under Needs you (321 s). Show the diff, the review verdict and the gate line. If the card has **Preview**, open it: it's Bob running at the PR's head. Approve, and B merges into demo/self (328 s). Its track moves to Learn and its Blobs close. |
| ~5:50 | A's card (349 s). A now conflicts with B's merge in format-time.ts, so its build Blob merges demo/self in, the review Blob checks the new head, and the card comes back for that head (416 s). Approve again, and A merges (421 s). |
| close | Click Why? on A's PR: it runs back through your answer to the sentence you said. Close on the take's numbers: two requests, two reviewed PRs, one conflict handed off and resolved, both merged in about 7 minutes. |

Each build raised a "Change the acceptance test?" card in the measured run, at 145 s (B) and 257 s (A). Approve it; see Presenter notes.

## Fallback: the tasks-app sample

`pnpm demo --sample` opens the tasks-app sample, a blank TypeScript project, instead of Bob's own repository. `pnpm demo --scripted` runs the scripted brain on it, with no model calls; add `--self` to keep Bob's repository. The sample's requests are "users want to export their tasks as CSV", answered with the tasksToCsv sentence from `scripts/walkthrough.ts`, and then isOverdue(task, today) in src/overdue.ts. The same order applies: answer the question, then type the second request while the first builds. The scripted brain finishes a request in about 30 s.

For questions: kill the server mid-run and start it again with `pnpm demo --keep`, and nothing is lost or stranded. The inbox is the other story to tell. In the Inbox pane, "Add a sample call and error" has Bob triage a customer call and a production error into quoted backlog work. Nothing builds until you press Build this, and a merge that fixes the error marks it resolved.

## Presenter notes

- **Current timings.** The self order was measured once on deepseek/deepseek-v4.1-flash for Bob and the Blobs: one question at 3 s, builds at 32 s and 46 s, PRs at 203 s and 247 s, merges at 328 s and 421 s with the conflict round. Most of it is the build Blobs, about 160-200 s each from start to PR. On the tasks-app sample, BOB-6's 21:32 UTC live baseline passed 10 of 10 in 255 s. Fill the wait with the build Blob's steps, the red then green acceptance test, and the gate line.
- **A "Change the acceptance test for WO-x?" card.** A live build sometimes writes a wrong acceptance test and asks you to change it (both builds did in the measured self run). The test is locked once it has run red, and only you can unlock it. The card shows the Blob's reason and the diff. Read the reason out, then approve: Bob writes exactly that file, the lock stays on, and the build reruns the test. This is the factory working, so say so. If the reason doesn't hold up, deny it, and the test stays as it ran red.
- **Steering.** Typing into a working build Blob steers its running turn: the message lands as the turn's next input, and the turn answers it before it ends.
- **The gate line on the merge card**, for example `4 properties · 1,200 cases · 5/5 mutants killed · proved in Lean`. Live, it's advisory. Lean runs after the card appears and updates the line, and it reads "Lean skipped" on a machine without Lean.
- **Fallback switches.** Set these in the shell before `pnpm demo`:
  - `BOB_ENGINE=loop pnpm demo` puts build and review back on the move loop.
  - `BOB_VERIFY=off pnpm demo` turns the verification gate off. Use it if the gate is what's slow.
  - `pnpm demo --scripted` runs the scripted brain, with no model calls.

## When something goes wrong mid-demo

- **A build Blob is slow or stuck on the coding agent.** Press Ctrl-C, then run `BOB_ENGINE=loop pnpm demo`. If the time goes into verification, use `BOB_VERIFY=off pnpm demo`.
- **The model is slow, loops or says something odd.** Press Ctrl-C, then run `pnpm demo --scripted`. That starts from a fresh seed with the scripted brain, which drives the same tools, workspaces, PRs, reviews and gate, finishes a request in about 20 seconds, and needs no network for the model. Say that you switched.
- **The state is a mess, but the server is fine.** Reset without restarting: `curl -X POST localhost:3000/api/reset -H 'content-type: application/json' -d '{"warm":true}'`, then reload the page.
- **The server crashed or the page won't load.** Run `pnpm demo --keep`. The JSON store and the restart recovery bring Bob and every Blob back where they were. Read `.data/demo/server.log` afterwards.
- **`pnpm demo` says the port is in use.** Another Bob is running. Stop it, or use `pnpm demo --port 3001`.
- **`next build` fails.** Run `pnpm demo --dev` to skip the build. `.data/demo/build.log` has the error.
- **No wifi.** Run `pnpm demo` once beforehand while you're online, so the project's dependencies are in the npm cache. After that, `--scripted` should run offline. The live model always needs the network.
