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
pnpm demo --prewarm
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

`--prewarm` sends the captain one coding request (overdue invoices) as soon as the server is up. A real PR takes a minute or two, so start it before you walk up. On a live model it reaches the merge approval under Needs you in about 90 seconds. Other flags: `--scripted` (the fallback below), `--keep` (start without resetting), `--dev` (`next dev` instead of a production build), and `--port 3001`. Logs go to `.data/demo/`.

On macOS, `run` has no namespace sandbox. Every run step says so ("plain shell"). Commands still run in the thread's own checkout, with a scrubbed environment and no API keys, but the file system isn't sealed the way it is on Linux. `pnpm verify` works on a Mac once Lean is installed (it prints the one-line elan install). Without Lean it skips the proofs and still runs the conformance tests. The demo doesn't need it.

## The 3-minute script

The numbers in brackets are the ten checks `pnpm walkthrough` times.

| Time | What happens | Steps |
| --- | --- | --- |
| before | `pnpm demo --prewarm`. The overdue-invoices request runs in the background and waits at its merge approval. | 1 |
| 0:00 | One breath: one agent is a tool, a team needs a foreman, and nobody can see what a swarm is doing or why. The invoices project is already open. | 1 |
| 0:15 | Type "customers want to export invoices as CSV". Bob pushes back until it can be tested. Answer it, and the roadmap fills in and a build thread starts. | 2 |
| 0:45 | Open the build thread: it reads files, writes code and runs the tests in its own checkout. The run step shows the command, the sandbox mode and the output. | 3 |
| 1:10 | Switch to the pre-warmed request under Needs you. Show its PR diff and the review thread's verdict, then approve. It merges, the roadmap moves and its threads close. It ran beside the CSV request on its own branch without colliding. | 4, 5, 6, 8 |
| 2:00 | The CSV request reaches its approval (about 80 seconds on the live model). Approve it, and say how long the whole loop took. | 6, 7 |
| 2:25 | Click Why? on the CSV PR. The chain of messages ends at the sentence you typed. | 10 |
| 2:50 | Close: a team you can read, steer and audit. | |

For questions: kill the server mid-run and start it again with `pnpm demo --keep`, and nothing is lost or stranded (step 9). The inbox is the other story to tell. In the Inbox pane, "Add a sample call and error" has the captain triage a customer call and a production error into quoted backlog work. Nothing builds until you press Build this, and a merge that fixes the error marks it resolved.

## When something goes wrong mid-demo

- **The model is slow, loops or says something odd.** Press Ctrl-C, then run `pnpm demo --scripted`. That starts from a fresh seed with the scripted brain, which drives the same tools, workspaces, PRs, reviews and gate, finishes a request in about 20 seconds, and needs no network for the model. Say that you switched.
- **The state is a mess, but the server is fine.** Reset without restarting: `curl -X POST localhost:3000/api/reset -H 'content-type: application/json' -d '{"warm":true}'`, then reload the page.
- **The server crashed or the page won't load.** Run `pnpm demo --keep`. The JSON store and the restart recovery bring every thread back where it was. Read `.data/demo/server.log` afterwards.
- **`pnpm demo` says the port is in use.** Another Bob is running. Stop it, or use `pnpm demo --port 3001`.
- **`next build` fails.** Run `pnpm demo --dev` to skip the build. `.data/demo/build.log` has the error.
- **No wifi.** Run `pnpm demo` once beforehand while you're online, so the project's dependencies are in the npm cache. After that, `--scripted` should run offline. The live model always needs the network.
