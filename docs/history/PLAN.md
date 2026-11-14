# Bob: build plan

> Kept for the record: this is the plan written before the build started. Bob did not end up on eve. It runs its own turn loop, mailbox and git workspaces in this Next.js app, and the eve spike never happened. HydraDB is a mirror of the JSON store rather than the store itself, and some primitives below changed or were dropped. The README and docs/ARCHITECTURE.md describe what exists.

Hard stops: DevPost closes 3:15 PM Saturday, last commit 3:30 PM. Demo is 3 minutes plus 2 of questions, judged on technical execution and enterprise utility.

## What Bob is

Bob is a team of persistent agents that message each other, with Bob as the orchestrator. You talk to Bob by voice or chat. Bob keeps the roadmap, decides who should do each piece of work, messages those agents, and creates a new agent when the team lacks one. Every agent has its own thread, sandbox and model, and you can open any thread and talk to that agent directly. The team builds software: you bring in a repo or start a new one, and the agents plan, write, review and ship changes to it.

Nothing is a fixed pipeline. The software-factory controls live inside tools as rules: a merge needs your approval, a stage will not advance until its exit criteria hold, and every message records what caused it.

## The primitives

| Primitive | What it is | Built on |
| --- | --- | --- |
| Agent | A record: name, title, standing instructions, model. Plus one thread | A node in HydraDB + one eve session |
| Thread | The agent's own conversation. You can open it and type into it | eve session, `useEveAgent` attached by session id |
| Workspace | The agent's own files and shell, with the project repo cloned | eve sandbox, one per session |
| Mailbox | Messages, with one delivery per recipient and a status | HydraDB graph |
| Roadmap | Goal, stage, stage gates, today's work orders. Only Bob writes it | HydraDB + Bob's tools |
| Memory | Things an agent or the project should remember | HydraDB memory API (stretch) |
| Hands | GitHub, Slack, Linear: the same for every agent | Composio session |
| Voice | A call with Bob, voice notes | ElevenLabs |

One agent definition serves every agent. Its instructions are dynamic: before each model call it looks up the agent record for the current session and builds the prompt from fixed team rules, that agent's profile, and (for Bob) the live roadmap and the current stage's playbook.

## Tools every agent gets

| Tool | What it does |
| --- | --- |
| `list_agents` | Who is on the team, what each is for, who is busy |
| `send_message` | `{recipientAgentIds, text, replyToMessageId?, expectsReply?}`. Queues a delivery for each recipient. The sender then ends its turn |
| `create_agent` | `{name, title, description, initialMessage, model?}`. Makes a record and a session, then delivers the first message |
| `start_task` | A side thread of the same agent for work that should not block its chat (eve's built-in `agent` tool) |
| `interrupt_agent` | Stops a turn that the caller's own message started |
| `ask_user` | A question or approval for the human |
| `remember`, `search_memories` | Stretch |
| Sandbox tools | eve's `bash`, `read_file`, `write_file`, `edit_file` |

Bob also gets the roadmap tools: `set_goal`, `set_roadmap`, `set_today`, `complete_work_order`, `advance_stage`. Each is a pure function over the roadmap that returns an error to the model when a rule is broken (more than three work orders a day, a stage whose exit criteria are not met). One more tool, `merge_pr`, is declared with `approval: always()`.

## How a message travels

1. The sender calls `send_message`. The tool writes a `Message` and one `Delivery` per recipient to the graph, each with the message that caused it and the request it belongs to.
2. The tool posts the framed message into the recipient's session with `eve/client` (`sessions.attach(id).send(text, { turnPolicy: "queue" })`). If the recipient is mid-turn, eve holds it until that turn ends, in arrival order.
3. The recipient reads it as a turn in its own thread: who sent it, the message id, how to reply, then the text.
4. The recipient either replies with `send_message` (`replyToMessageId`, `expectsReply: false`) or just finishes.
5. A `turn.settled` hook runs when the recipient's turn ends. If the delivery wanted a reply and none was sent, the hook relays the final answer to the sender. Nothing has to stay alive waiting.
6. The sender's next turn starts with the answer. Bob checks it, updates the roadmap and tells you.

Rules enforced in code, because prompt text alone will not stop two agents ping-ponging on stage:

- a delivery budget per request (start at 12), counted in the graph
- no message to yourself
- a reply cannot ask for a reply
- one turn per agent at a time (eve's queue gives this)

Replies between agents use a fixed format: status, result, evidence.

## The first spike, before anything else

Sixty to ninety minutes, and it decides the architecture. Two sessions of one agent definition. `send_message` in session A posts into session B. B answers. The hook relays the answer to A. Things to prove:

- **Identity:** a session can find its agent record. `ctx.session.id` is available in tools, hooks and dynamic instructions, so key the record on it.
- **The hop:** `eve/client` from inside a tool reaches another session on the same deployment. It needs a credential: production requests are refused until auth is configured, and that applies to this server-to-server call too.
- **Queueing:** `turnPolicy: "queue"` holds a message for a busy session.
- **Relay:** the `turn.settled` hook can read the turn's final text and send it on.

If the spike fails, fall back to eve's declared subagents: Bob calls `coder` or `reviewer` with `{message, taskId}` and the thread persists through `taskId`. Bob still decides who does what. You lose agents messaging each other, agents created at runtime, and talking to a teammate directly.

## The graph

Every node has its own `id` property. HydraDB's internal ids are reused, so never key on them. Use the hosted Cypher endpoint (`POST https://api.hydradb.com/byog/query`, bearer key, body `{database, collection, query, params}`) over `fetch`. Always add `LIMIT`: large results are cut off silently.

```
(User)-[:SENT]->(Message)-[:QUEUED_AS]->(Delivery)-[:FOR]->(Agent)-[:RUNS]->(Turn)-[:MADE]->(Commit)
(Turn)-[:HANDLES]->(Message)      (Message)-[:CAUSED_BY]->(Message)
(Commit)-[:PART_OF]->(PullRequest)-[:GATED_BY]->(Approval)-[:SHIPPED_AS]->(Deploy)
(Project)-[:HAS]->(Agent)         (Project)-[:HAS]->(Roadmap)-[:HAS]->(WorkOrder)
```

Why? in one query: from a commit, find the message its turn was handling, then follow `CAUSED_BY` back to the message you sent.

```cypher
MATCH (c:Commit {sha: $sha})<-[:MADE]-(t:Turn)-[:HANDLES]->(m:Message)
MATCH (m)-[:CAUSED_BY*0..12]->(root:Message {from: 'user'})
RETURN root.text, m.text, t.agent
```

## The window

- **Sidebar:** project switcher, then the agents. Each row shows a live state in this order of priority: needs you, working, unread. A "+ New agent" row.
- **Centre:** the selected agent's thread. Outgoing messages show as "Messaged Coder", incoming as "Message from Coder", each expandable. A "Waiting for replies" block sits above the composer with one row per agent asked.
- **Composer:** quick replies, hold to talk, and the send button becomes Stop while the agent works.
- **Right panel, tabbed:** Roadmap (goal, stage, gates, today's work orders), Files, Preview.
- **Why?** on a commit, a PR or a message opens the trace.

## Stack notes

- **eve:** pin exactly `1.0.0-rc.17`. Node 24 or newer. It ships several release candidates a day.
- **fx:** Vercel Labs' small coding-agent CLI, built to run inside a sandbox (`fx ask --json`). It maps to "an agent can run on a different backend". Stretch: a per-agent setting that hands coding turns to fx.
- **Composio:** its eve adapter needs eve below 1.0, so it will not install. Create a Composio session in your own tool and call GitHub through it.
- **ElevenLabs:** the voice agent calls a client tool in the page, and the page sends the words into Bob's thread. Start the call from a click.
- **Sandbox:** locally the default is a pure-JavaScript shell with no git unless Docker is running. A `bash` call caps at 120 seconds.
- **8090 Software Factory:** the organisers asked teams to try it. Optional.

## Cut line

Must ship, in order:

1. The spike above: two agents, one message out, one answer back
2. Agent records in HydraDB, the sidebar, and opening any agent's thread
3. `list_agents`, `send_message`, the relay hook, and the loop budget
4. Bob's profile, roadmap tools and the Roadmap panel
5. `create_agent`
6. A Coder agent that clones the repo in its sandbox and opens a real PR
7. `merge_pr` behind the approval card
8. Voice call with Bob

Then, if all eight work end to end: Why? trace, import a repo by URL, message markers that expand, memory, routines (a scheduled message into an agent's mailbox), fx-backed agents.

Do not build: group channels, sign-in, multiple users, a marketplace, settings.

## Build order

| Block | Length | Done when |
| --- | --- | --- |
| Keys, deploy, demo repo | 45 min | Empty app is live. HydraDB answers one `CREATE` and one `MATCH`. A tiny invoices app is on GitHub and connected to Vercel |
| The spike | 90 min, hard box | A message goes from one agent's thread to another's and the answer comes back |
| Team and sidebar | 90 min | Three agents exist as records, each with a thread you can open and type into |
| Mailbox rules | 60 min | Budget, no self-send, no reply to a reply. A deliberate ping-pong stops by itself |
| Bob's brain and roadmap | 90 min | Telling Bob a goal fills the Roadmap panel, and Bob messages the right agents unprompted |
| `create_agent` | 45 min | Bob adds a teammate from a sentence and it appears in the sidebar |
| Coder to PR, and the gate | 120 min | A PR lands on the demo repo and merging waits for your click |
| Voice | 60 min | A call with Bob does what typing did |
| Freeze | from 12:30 PM | Seed data, three rehearsals, backup recording, DevPost text. Final commit by 3:00 PM |

That is ten hours of work against about fifteen until the freeze. If you fall behind, drop voice first (typing feeds the same thread), then `create_agent` (seed the team by hand), then the real PR (have the Coder write files and show the diff).

## Demo, 3 minutes

| Time | What happens |
| --- | --- |
| 0:00 | One breath: one agent is a tool, a team needs a foreman, and nobody can see what a swarm is doing or why |
| 0:15 | Call Bob: "customers want to export invoices". Bob pushes back until it can be tested, then the roadmap fills in |
| 0:50 | Bob messages Coder and Reviewer. The sidebar lights up. Open Coder's thread and show the message from Bob and the work in its sandbox |
| 1:30 | Tell Bob "we need someone to check the security side". Bob creates an agent and it appears in the sidebar |
| 1:55 | Coder asks Reviewer to look at the PR. Show both threads |
| 2:15 | The PR card in Bob's thread: approve, it merges |
| 2:35 | Click Why? on the commit: the chain of messages ends at your sentence |
| 2:50 | Close: a team you can read, steer and audit |

Start one coding request before you walk up, because a real PR takes minutes. Say so out loud.

## Docs

- eve: https://eve.dev/docs (subagents, tools/tasks, guides/client, guides/hooks, guides/session-context, sandbox, human-in-the-loop).
- fx: https://github.com/vercel-labs/fx
- HydraDB hosted Cypher: https://docs.hydradb.com/essentials/v2/bring-your-own-graph
- ElevenLabs: https://elevenlabs.io/docs/eleven-agents/libraries/react and .../customization/tools/client-tools
- Composio: https://docs.composio.dev/docs/providers/vercel and https://docs.composio.dev/toolkits/managed-auth
