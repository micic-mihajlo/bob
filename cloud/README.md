# Bob durable state (Cloudflare Worker)

One Durable Object per Bob project and Bob instance holds that project's latest state revision, stored in pieces in one
transaction, plus a log of the last 50 revisions. A write whose rev is not newer than the one held gets 409, so a
stale or restarted Bob server can never roll the state back. A directory object remembers the last project
written, so a server that lost its disk can restore with `GET /latest`.

| Route | |
|---|---|
| `GET /health` | no secret needed |
| `GET /latest` | the newest state of the last project written |
| `GET /projects/:id/state` | that project's newest state |
| `PUT /projects/:id/state` | body: the state JSON, header `x-bob-rev`; 409 when not newer |
| `GET /projects/:id/revisions` | the revision log |

Every route but `/health` needs the header `x-bob-durable-secret`, matching the Worker's `BOB_DURABLE_SECRET`, and
`x-bob-namespace`, the Bob instance the objects belong to (Bob sends `BOB_DURABLE_NAMESPACE`, else its hostname).
Two instances on the same project have separate objects, and `/latest` only reads the caller's own. `npm test` checks it
against the real Worker.

```sh
npm install
echo "BOB_DURABLE_SECRET=$(openssl rand -hex 16)" > .dev.vars   # local only, gitignored
npx wrangler dev --port 8787                                   # local Durable Objects, no account needed
npx wrangler deploy && npx wrangler secret put BOB_DURABLE_SECRET
```

Bob writes through to it with `BOB_DURABLE=cloudflare`, `BOB_DURABLE_URL` and `BOB_DURABLE_SECRET`.

## The captain on Pi Durable (`bob-captain`, wrangler.captain.jsonc)

A sibling Worker runs Bob's captain on [Pi Durable](https://developers.cloudflare.com/agents/harnesses/pi/) with the Agents SDK's
`PiHarness`: one `BobCaptain` Durable Object per Bob instance and project, model `deepseek/deepseek-v4.1-flash` through the AI
Gateway. Pi keeps the transcript, the inbox and every step in the object's SQLite, so a captain turn survives Bob's server dying
mid-turn. The tools stay in Bob: Bob sends its live system prompt and the captain's tools with each turn, and each tool is a remote
call back to Bob's `POST /api/captain/tools`, where the factory rules run.

| Route | |
|---|---|
| `POST /captain/:project/turn` | starts the turn, or rejoins it when `operationId` was already submitted; streams NDJSON |
| `POST /captain/:project/abort` | ends a turn Bob closed on its side |

Both need `x-bob-durable-secret` and `x-bob-namespace`, as above.

```sh
npx wrangler deploy -c wrangler.captain.jsonc
npx wrangler secret put BOB_DURABLE_SECRET -c wrangler.captain.jsonc
npx wrangler secret put AI_GATEWAY_API_KEY -c wrangler.captain.jsonc
```

Bob uses it with `BOB_CAPTAIN_ENGINE=pi-durable`, `BOB_CAPTAIN_URL` (this Worker), `BOB_DURABLE_SECRET`, and `BOB_PUBLIC_URL`, a
URL the Worker can reach Bob's server on (for a laptop, `cloudflared tunnel --url http://localhost:3000`).
