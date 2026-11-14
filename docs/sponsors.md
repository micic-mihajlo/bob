# Sponsor integrations

Each sponsor service sits behind a switch that is off by default, so Bob runs the same without its key. Every thread that adds one writes its own section here.

## HydraDB: Bob's state as a graph

### What it does

With `BOB_STORE=hydra`, every change to Bob's state is also written to a HydraDB graph: agents and threads, messages, deliveries, turns, pull requests, commits, reviews, approvals, the roadmap and its work orders, as nodes and edges. "Why does this pull request exist?" becomes one Cypher path query from the PR's message back along `CAUSED_BY` to the sentence the person typed, and `/api/why` and `/api/graph` answer from that query.

```
(User|Agent)-[:SENT]->(Message)-[:QUEUED_AS]->(Delivery)-[:FOR]->(Agent)-[:RUNS]->(Turn)-[:HANDLES]->(Message)
(Message)-[:CAUSED_BY {via: "caused_by" | "continues"}]->(Message)
(Turn)-[:MADE]->(PullRequest)-[:BECAUSE_OF]->(Message)        (Commit)-[:PART_OF]->(PullRequest)
(Review)-[:REVIEWS]->(PullRequest)-[:GATED_BY]->(Approval)<-[:ASKED_FOR]-(Turn)
(Message)-[:DECIDES]->(Approval)                              (Agent)-[:WORKS_ON]->(WorkOrder)
(Project)-[:HAS]->(Agent)   (Project)-[:HAS]->(Roadmap)-[:HAS]->(WorkOrder)-[:DELIVERED_BY]->(PullRequest)
```

A person's answer to the captain's pushback question is a `CAUSED_BY` edge with `via: "continues"` back to their original ask, so the path always ends at the first thing they typed. `/api/graph` shows that edge as `CONTINUES`.

The Why? query:

```cypher
MATCH (m:Message {ext_id: $messageId})-[:CAUSED_BY*0..24]->(hop:Message)
RETURN hop.ext_id AS id, hop.text AS text, hop.fromName AS fromName, ... LIMIT 25
```

### Why a write-through mirror

The JSON store (`.data/state.json`) stays the source of truth, and the graph is a mirror written after every commit. Bob's state code is synchronous pure functions over one in-memory object, and tonight other threads are adding crash recovery and the walkthrough on top of that store. Putting a network call into every `update()` would make each one async and able to fail halfway, which would touch every caller the day of the demo. A mirror needs one line in `store.ts` (`mirrorCommit(g.state)` in `commit`), changes nothing above the store, and cannot lose state when HydraDB is slow or down.

How the mirror works (`src/lib/graph/`):

- `schema.ts` projects the state into nodes and edges. `mirror.ts` diffs that against what it last wrote, 250 ms after the latest commit, and sends only what changed, one `UNWIND $rows` statement per label or edge type, in chunks under the 256 KiB body cap. Things that disappear (a reset back to the seed) are `DETACH DELETE`d.
- Every write is `MERGE` on `ext_id`, then `SET n += row`. A batch that fails is sent again on the next sync, and a restart resends everything, which is safe because MERGE is idempotent.
- Every node keeps Bob's own id in `ext_id`. HydraDB reserves `id` for its internal node id, reuses it after deletes, and hides a stored `id` property in responses, so nothing keys on it. Its docs recommend `ext_id` for this.
- Every read has a `LIMIT` and a bounded hop count, because HydraDB drops rows past its cap without an error.
- `/api/why` and `/api/graph` sync first, so they never read a graph that is behind. If the switch is off, the key is missing, or HydraDB errors or has no path, both answer from memory. Each response has `source: "hydra" | "memory"` so you can see which one answered.

### Routes

- `GET /api/why?messageId=` returns `{ hops: WhyHop[], source }`, the same shape as before plus `source`.
- `GET /api/graph?prId=` returns a `GraphView` (`src/lib/types.ts`): the PR, its Why? path with each message's sender, and what touches the PR (its commit, the turn and thread that made it, reviews, the approval, the work order). It is read-only, and it works with the switch off too, drawn from memory.

### Turning it on

Set these where the server runs (`.env.local` or the project's environment):

| Variable | Needed | Default |
| --- | --- | --- |
| `BOB_STORE` | yes, set to `hydra` | unset (JSON only) |
| `HYDRADB_API_KEY` | yes, from the HydraDB dashboard | none |
| `HYDRADB_DATABASE` | no | `bob`, created on the first write (a 409 for one that already exists is fine) |
| `HYDRADB_COLLECTION` | no | `state`, created on the first write |
| `HYDRADB_URL` | no | `https://api.hydradb.com` |

Then check it live:

1. `BOB_STORE=hydra pnpm dev`, and run the CSV walkthrough until a pull request appears.
2. `curl "localhost:3000/api/why?messageId=<the PR's messageId>"` should answer `"source": "hydra"`, with the last hop being the sentence you typed.
3. `curl "localhost:3000/api/graph?prId=<the PR's id>"` should answer `"source": "hydra"`.
4. If either says `memory`, the server log has a line starting `HydraDB` with the reason.

### What was tested, and how

- **Not run against HydraDB itself.** No key was available overnight, so nothing has reached api.hydradb.com yet. Request shapes come from HydraDB's BYOG docs: `POST /byog/query` with `{database, collection, query, params}`, a bearer key, and the `{success, data, error, meta}` envelope.
- **Run against a real Cypher engine.** Every statement the mirror and the read routes send was run on a local FalkorDB, a Cypher engine with the same dialect notes HydraDB's docs list (bare pattern predicates, `shortestPath` only in `RETURN`). That covered the full write of a walkthrough state, the incremental updates, a reset that deletes back to the seed (the graph ended with exactly the seed's 4 nodes and 2 edges), and the three read queries. A full `BOB_STORE=hydra` walkthrough on `pnpm dev`, pointed at a local shim that serves HydraDB's API on top of that FalkorDB, answered both routes with `source: "hydra"` and ended at "customers want to export invoices as CSV".
- **Recorded-response test** (`src/lib/__tests__/graph.test.ts`, fixtures in `__tests__/fixtures/hydra/`): a walkthrough state, plus the rows FalkorDB returned for the Why? and graph queries on that state, wrapped in HydraDB's envelope. The Why? trace from those rows equals the in-memory trace, roots at the original ask, and keeps the pushback question. The graph view from those rows equals the in-memory one. The other tests check the request shapes and headers, MERGE on `ext_id`, diff-only writes, a retry after a 500, deletes on reset, the fallbacks, and that every read is bounded.
- **Risk before the demo.** HydraDB says it supports all of openCypher, but its open-source engine accepts a narrower subset (no untyped relationship patterns, for example). If the hosted service rejects a statement, the routes fall back to memory and log the reason. `/api/graph`'s neighbour query (`(pr)-[r]->(n)` with no type) is the most likely one to need a change.

## ElevenLabs: start a request by voice

**What it does.** The composer in the captain's chat has a phone button, Call Bob. You talk, Bob talks back. Everything you say lands in the captain's thread as your message, with a small "voice" mark, so the captain's intake rules push back exactly as they do on typing, and Why? on a pull request returns your spoken words. The ElevenLabs agent is only the ears and the mouth: on every utterance it calls the client tool `send_to_bob`, which posts your words to `POST /api/voice/turn`, waits for the captain's turn to end, and returns the captain's reply for the agent to say.

**Turn it on.** Add these to `.env.local` (or the project's environment variables) and restart the server:

```
BOB_VOICE=elevenlabs
ELEVENLABS_API_KEY=<a key with ElevenAgents read and write>
# Optional. Without it, the first call creates the agent from src/lib/voice/elevenlabs.ts
# and keeps its id in .data/voice-agent.json.
ELEVENLABS_AGENT_ID=agent_...
```

The key needs the ElevenAgents permission (create tools and agents, and get conversation tokens). If you use your own agent through `ELEVENLABS_AGENT_ID`, give it a client tool named `send_to_bob` with one required string parameter `text`, "Wait for response" on, and a response timeout of 120 seconds, and use the prompt in `VOICE_PROMPT`. Delete `.data/voice-agent.json` to have Bob create a fresh agent after the config changes.

**How it fits together.**

- `GET /api/voice` answers `{ elevenlabs }`, so the button knows which kind of call to start.
- `POST /api/voice/session` gets a WebRTC conversation token from `GET /v1/convai/conversation/token` with the key on the server. The key never reaches the browser, and the agent is created with `enable_auth`, so it only takes calls with a token.
- `POST /api/voice/turn { agentId, text }` posts the words as the person's message (`via: "voice"`) and answers `{ messageId, reply }` when that agent's turn ends. If the turn runs past 100 seconds, the reply says Bob is still working and the answer shows in the thread.
- The browser sends your own words from the agent's transcript, not the agent's paraphrase in the tool call, so the thread and Why? hold what you actually said.

**Without the key.** With `BOB_VOICE` unset, Call Bob uses the browser's own speech: it listens until you pause, sends what it heard through the same `/api/voice/turn`, and reads the captain's reply aloud with the browser's voice. This needs a browser with speech recognition (Chrome, Edge, Safari). In a browser without it, the button shows "Voice is off" with a tooltip saying what to set.

**What was tested, and how.** No ElevenLabs key was available overnight, so nothing has run against ElevenLabs live. `src/lib/voice/__tests__/voice.test.ts` covers the voice turn against the scripted captain (pushback question back, the answer starts a build thread, Why? returns the spoken words, the timeout), the switch, and the request shapes for creating the tool and the agent and getting a token, checked against the API reference with a mocked `fetch`. The voice turn route was also run against a live dev server with curl. The ElevenLabs client side (`@elevenlabs/react` 1.22.1) typechecks, but it has never connected.

## GitHub (Composio or gh) and Vercel previews

With `BOB_GITHUB` on, Bob still opens its own pull request for every build thread, and the same step publishes it to GitHub:

- **Publish.** Bob pushes the project's main to the GitHub base branch, then pushes the thread's branch to `demo/<branch>` and opens a real pull request. The title starts with "[demo]", the PR gets the `demo` label, and the description ends with the sentence the person typed. A later `open_pull_request` on the same branch pushes the new head and updates the same GitHub PR.
- **Review.** Each `record_review` is posted as a GitHub review on the head it read. A finding goes inline when its line is in the diff. Every other finding, the verdict, and the preview check go in the review body. Bob posts these as COMMENT reviews, because GitHub won't let an account approve or request changes on its own PR.
- **Merge.** After the person approves, `merge_pull_request` first merges the GitHub PR, pinned to the approved head sha (merge commit, with squash as the fallback). When that commit is a true merge of the head onto Bob's main, Bob adopts it as its own main, so both histories end up on the same commit. If GitHub refuses, Bob merges locally as before and pushes main to the base branch, and GitHub then shows the PR as merged.
- **Failures never block the factory.** A failed push or API call is saved on the pull request (`githubError`, or `github.error`) and shown in the tool result. Bob's own PR, the review loop, and the merge carry on regardless.

The PR card can read these fields on `pullRequest` in `/api/state`:

| Field | Meaning |
| --- | --- |
| `github.url`, `github.number`, `github.repo` | the real pull request |
| `github.via` | `gh` or `composio`, whichever opened it |
| `github.head`, `github.base` | the GitHub branches |
| `github.merged`, `github.error` | merge state, and the last GitHub step that failed |
| `githubError` | why publishing failed before any GitHub PR existed |
| `preview.url`, `preview.state` | the preview deployment (`building`, `ready`, `error` or `missing`) |
| `preview.headSha`, `preview.inspectorUrl` | which head it was built from, and Vercel's page for it |
| `preview.check.ok`, `.status`, `.detail`, `.at` | the review thread's `check_preview` result |

### Switches and keys

| Variable | Default | What it does |
| --- | --- | --- |
| `BOB_GITHUB` | off | `gh` publishes with the machine's `gh` CLI. `composio` uses Composio's GitHub toolkit, and falls back to `gh` while `COMPOSIO_API_KEY` is unset. |
| `BOB_GITHUB_REPO` | `micic-mihajlo/bob` | the GitHub repository Bob publishes to |
| `BOB_GITHUB_BASE` | `demo/invoices-main` | the branch that mirrors the project's main; every PR targets it. Bob refuses `main` when the repository is `micic-mihajlo/bob`. |
| `BOB_GITHUB_REMOTE` | `https://github.com/<repo>.git` | what git pushes to (an SSH URL also works) |
| `GITHUB_TOKEN` | none | the token git pushes with. Without it, Bob tries `gh auth token`, then the machine's own git credentials. |
| `COMPOSIO_API_KEY` | none | Composio project API key |
| `COMPOSIO_USER_ID` | `default` | the Composio user whose GitHub connection runs the tools |
| `COMPOSIO_CONNECTED_ACCOUNT_ID` | none | a specific connected GitHub account (`ca_…`), when the user has more than one |
| `BOB_PREVIEWS` | off | `vercel` gives review threads the `check_preview` step |
| `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | none | read the deployment from the Vercel REST API (`GET /v7/deployments?projectId=…&sha=<head>`). Without them, Bob reads the GitHub deployment status that Vercel's GitHub app writes for the head commit. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | none | sent as `x-vercel-protection-bypass` when the preview has Deployment Protection |
| `BOB_PREVIEW_WAIT_MS` | 180000 | how long `check_preview` waits for a build to finish |

Composio calls go to `POST https://backend.composio.dev/api/v3.1/tools/execute/<slug>` with `x-api-key`, `{ arguments, user_id, connected_account_id? }`. Bob calls them from its own module (src/lib/integrations/github), because the eve adapter doesn't install. These are the tools it uses: `GITHUB_CREATE_A_PULL_REQUEST`, `GITHUB_UPDATE_A_PULL_REQUEST`, `GITHUB_LIST_PULL_REQUESTS`, `GITHUB_ADD_LABELS_TO_AN_ISSUE`, `GITHUB_CREATE_A_REVIEW_FOR_A_PULL_REQUEST`, `GITHUB_MERGE_A_PULL_REQUEST`, `GITHUB_LIST_DEPLOYMENTS` and `GITHUB_LIST_DEPLOYMENT_STATUSES`. Git pushes don't go through Composio, which has no git transport, so they always use `GITHUB_TOKEN` or the machine's credentials.

### Turning it on (for Mihajlo)

1. **A dedicated demo repository.** The overnight agents couldn't create one: their GitHub access can't create repositories. Create `micic-mihajlo/bob-invoices-demo` (public, empty, no README), then set `BOB_GITHUB_REPO=micic-mihajlo/bob-invoices-demo` and `BOB_GITHUB_BASE=main`. Until then, the defaults publish to `demo/invoices-main` in Bob's own repository, and every PR is labelled `demo`. Bob seeds the base branch from the project's main on its first publish. With a dedicated repo whose base is `main`, Bob only ever fast-forwards it, so start each fresh demo project with `BOB_PROJECT_REPO=https://github.com/micic-mihajlo/bob-invoices-demo.git` to keep the two histories the same.
2. **gh (works tonight).** Run `gh auth login` on the machine running Bob, or set `GITHUB_TOKEN` to a token with contents and pull-request write access to the repository. Then set `BOB_GITHUB=gh`.
3. **Composio.** In the Composio dashboard, create a project API key and connect a GitHub account (the managed OAuth is enough) for one user id. Set `BOB_GITHUB=composio`, `COMPOSIO_API_KEY`, `COMPOSIO_USER_ID` (and `COMPOSIO_CONNECTED_ACCOUNT_ID` if that user has more than one GitHub connection). Keep `GITHUB_TOKEN` or gh for the push.
4. **Vercel previews.** Import the demo repository into Vercel. The invoices template is a Vite app, so the defaults build it (`npm run build`, output `dist`). Vercel's GitHub app then builds a preview for every `demo/…` branch. Set `BOB_PREVIEWS=vercel`, and optionally `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` (+ `VERCEL_TEAM_ID`) so Bob reads deployments from Vercel directly. If the project's previews are protected, set `VERCEL_AUTOMATION_BYPASS_SECRET` from Project Settings → Deployment Protection → Protection Bypass for Automation.
