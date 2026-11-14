# Bob durable state (Cloudflare Worker)

One Durable Object per Bob project holds that project's latest state revision, stored in pieces in one
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

Every route but `/health` needs the header `x-bob-durable-secret`, matching the Worker's `BOB_DURABLE_SECRET`.

```sh
npm install
echo "BOB_DURABLE_SECRET=$(openssl rand -hex 16)" > .dev.vars   # local only, gitignored
npx wrangler dev --port 8787                                   # local Durable Objects, no account needed
npx wrangler deploy && npx wrangler secret put BOB_DURABLE_SECRET
```

Bob writes through to it with `BOB_DURABLE=cloudflare`, `BOB_DURABLE_URL` and `BOB_DURABLE_SECRET`.
