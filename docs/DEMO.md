# Running the demo

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

`pnpm demo` does the rest. First it checks the machine: the Node and git versions, that dependencies are installed (it runs `pnpm install` when they aren't), and that the port is free. Then it builds and starts the production server and resets Bob to the demo seed. The reset re-creates the project's repository and installs its dependencies before it answers, so the first thread doesn't wait on an install. Last, it prints what is on and off:

```
  Model            live: captain moonshotai/kimi-k3.1-pro, crew deepseek/deepseek-v4.1-flash
  run sandbox      plain shell (no namespace sandbox on darwin); commands still get no API keys
  HydraDB graph    off (BOB_STORE=hydra turns it on)
  Voice            browser speech (BOB_VOICE=elevenlabs for ElevenLabs)
  GitHub PRs       off (BOB_GITHUB=gh turns it on)
  Vercel previews  off (BOB_PREVIEWS=vercel turns it on)
  Project          invoices-app (invoices template)
```

Other flags: `--prewarm` (see the optional order below), `--scripted` (the fallback below), `--keep` (start without resetting), `--dev` (`next dev` instead of a production build), and `--port 3001`. Logs go to `.data/demo/`.

On macOS, `run` has no namespace sandbox. Every run step says so ("plain shell"). Commands still run in the thread's own checkout, with a scrubbed environment and no API keys, but the file system isn't sealed the way it is on Linux. `pnpm verify` works on a Mac once Lean is installed (it prints the one-line elan install). Without Lean it skips the proofs and still runs the conformance tests. The demo doesn't need it.

## The 3-minute script

The numbers in brackets are the ten checks `pnpm walkthrough` times. Each request gets its own track on the roadmap (Intent, Spec, Build, Ship, Learn) and moves on its own gates, so the two requests below never wait on each other. The times are from three clean live runs of this exact order on main at 03b6a25 (captain kimi-k3.1-pro, crew deepseek-v4.1-flash, sandbox on), counted from when you type the CSV request.

| Time | What happens | Steps |
| --- | --- | --- |
| before | `pnpm demo`. Nothing runs yet. | 1 |
| 0:00 | One breath: one agent is a tool, a team needs a foreman, and nobody can see what a swarm is doing or why. The invoices project is already open. | 1 |
| 0:05 | Type "customers want to export invoices as CSV". It gets its own track at Intent. Bob pushes back with one question (about 10 s). Answer it, and the CSV track moves through Spec to Build and a build thread starts (20 to 32 s). | 2 |
| 0:35 | While the CSV build runs, type the overdue request (below). It gets a second track. Its build thread starts about 18 s later, and both build at once, each in its own checkout on its own branch. If Bob asks who it's for (one run in four), answer "For the accountant on the invoices page who chases late payments. Go ahead with your defaults." | 2, 8 |
| 0:55 | Open the CSV build thread: it reads files, writes code and runs the tests in its own checkout. The run step shows the command, the sandbox mode and the output. | 3 |
| 1:20 | The first merge card arrives under Needs you, 80 to 106 s in (CSV first in one run, overdue first in two). Show its PR diff and the review thread's verdict, then approve. It merges, its track moves to Learn and its threads close. The other track stays at Build or Ship. | 4, 5, 6 |
| 1:45 | The second card. Both PRs touch src/page.ts, so when the second one conflicts with the first merge, its build thread brings in main, the review checks the new head, and the card comes back for that head: about 45 s more, and you approve twice (seen in one run). Approve it, and say how long the whole loop took: both merged at 111, 133 and 147 s. | 6, 7, 8 |
| 2:25 | Click Why? on the CSV PR. The chain runs through your answer and ends at the sentence you typed. Why? on the overdue PR ends at its own sentence. | 10 |
| 2:50 | Close: a team you can read, steer and audit. | |

The overdue request, to paste: "List overdue invoices: add overdueInvoices(invoices, today) in src/invoices.ts that returns the sent invoices whose due date is before today, oldest due date first, and show how many are overdue in the page summary. Done means a vitest test passes for one overdue, one paid and one not-yet-due invoice."

If the review asks for changes, the build thread gets a fix round first. In the one run where that happened, the CSV merge card came about 80 s after the findings, at 168 s in. Fill the wait with step 3 or the Why? on the PR that already merged.

### Optional: a pre-warmed request

`pnpm demo --prewarm` sends the overdue request as soon as the server is up, and it waits at its merge approval, its track at Ship, about 50 to 85 s later. Then type the CSV request: it gets its own track, moves to Build and starts its build thread while overdue still waits at Ship. Approving overdue moves only its own track to Learn. This saves the overdue build on stage, but the CSV PR then lands on a main that already has overdue's change in the same files, so expect the conflict round above before the CSV card arrives. Why? on the CSV PR still ends at the sentence you typed. This order was run live once, before #111: the stage path and Why? held, but the CSV build stalled on that conflict at its step limit. #111 fixes that stall, and this order hasn't been run live since, so use the default order when it matters.

For questions: kill the server mid-run and start it again with `pnpm demo --keep`, and nothing is lost or stranded (step 9). The inbox is the other story to tell. In the Inbox pane, "Add a sample call and error" has the captain triage a customer call and a production error into quoted backlog work. Nothing builds until you press Build this, and a merge that fixes the error marks it resolved.

## When something goes wrong mid-demo

- **The model is slow, loops or says something odd.** Press Ctrl-C, then run `pnpm demo --scripted`. That starts from a fresh seed with the scripted brain, which drives the same tools, workspaces, PRs, reviews and gate, finishes a request in about 20 seconds, and needs no network for the model. Say that you switched.
- **The state is a mess, but the server is fine.** Reset without restarting: `curl -X POST localhost:3000/api/reset -H 'content-type: application/json' -d '{"warm":true}'`, then reload the page.
- **The server crashed or the page won't load.** Run `pnpm demo --keep`. The JSON store and the restart recovery bring every thread back where it was. Read `.data/demo/server.log` afterwards.
- **`pnpm demo` says the port is in use.** Another Bob is running. Stop it, or use `pnpm demo --port 3001`.
- **`next build` fails.** Run `pnpm demo --dev` to skip the build. `.data/demo/build.log` has the error.
- **No wifi.** Run `pnpm demo` once beforehand while you're online, so the project's dependencies are in the npm cache. After that, `--scripted` should run offline. The live model always needs the network.
