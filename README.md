# Bob

Bob is a team of persistent agents that message each other. Bob orchestrates: you tell him what you want built, he keeps the roadmap, decides who should do each piece of work, messages those agents and creates a new one when the team lacks someone. Every agent has its own thread, and you can open any thread and talk to that agent directly.

## Run it

```bash
pnpm install
```

```bash
pnpm dev
```

Open http://localhost:3000 and type a request to Bob.

## Agents and models

Without a key the agents decide from a script. The mailbox, the tools, the turn loop and the roadmap rules are the real ones either way; only the decision-maker changes.

To use a live model, create `.env.local` with `AI_GATEWAY_API_KEY` set and restart. The sidebar footer shows which one is active.

```
AI_GATEWAY_API_KEY=...
BOB_MODEL_STRONG=moonshotai/kimi-k3.1-pro
BOB_MODEL_LIGHT=deepseek/deepseek-v4.1-flash
```

`BOB_MODEL_STRONG` is the captain's model and `BOB_MODEL_LIGHT` is every crew thread's. A Vercel Token Pass key can only call Token Pass models: `moonshotai/kimi-k3.1-pro`, `moonshotai/kimi-k3`, `moonshotai/kimi-k3-fast`, `zai/glm-5.3-fast`, `zai/glm-5.3-flash`, `deepseek/deepseek-v4.1-flash` and `deepseek/deepseek-v4.1-flash-fast`. After changing models, `POST /api/reset` reseeds the team so stored threads pick them up.

## Factory policy

A project can put `bob.policy.json` at the root of its main branch. Every field is optional, and anything left out keeps its default:

```json
{
  "approvalPaths": ["package.json", "**/*.lock", ".github/**"],
  "maxFixRounds": 2,
  "budgets": { "maxMinutes": 3, "maxModelCalls": 60, "maxCostUsd": 1 },
  "prices": { "moonshotai/kimi-k3.1-pro": [0.6, 2.5] }
}
```

`approvalPaths` are named on the merge approval whenever a pull request touches them. `maxFixRounds` caps the review-fix loop. A request that goes over a budget gets an alert line in DIGEST.md. `prices` are dollars per million input and output tokens, and they feed the cost estimate shown for each request.

## How it works

| Piece | Where |
| --- | --- |
| Shapes and routes | `src/lib/types.ts` |
| Mailbox: messages, deliveries, loop budget | `src/lib/mailbox.ts` |
| Turn loop and result relay | `src/lib/turns.ts` |
| Tools agents can call | `src/lib/tools.ts` |
| Roadmap rules and stages | `src/lib/roadmap.ts`, `src/lib/stages.ts` |
| Scripted and model decision-makers | `src/lib/brain/` |
| The window | `src/components/` |

A message queues one delivery per recipient. It arrives as a turn in the recipient's thread. When that turn ends, the result goes back to the sender on its own. Rules that keep the team from looping are enforced in code: a delivery budget per request, no message to yourself, no reply that expects a reply, and one turn per agent at a time.

## Checks

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm build
```

## Not in this version

Sandboxes and real pull requests, GitHub and other app connections, voice, and the graph database behind the store. `docs/PLAN.md` has the plan for each, and `docs/bob.excalidraw` has the diagrams.
