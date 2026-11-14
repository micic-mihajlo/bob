# Bob desktop

The desktop app for Bob. It runs agents on this computer (Claude through the Agent SDK, Codex, OpenCode and other ACP agents) and talks to Bob's captain, the factory brain in the Next.js app at the repository root, over HTTP.

## Run it

From the repository root:

```sh
pnpm desktop
```

That starts Bob's brain on http://localhost:3000 and the desktop app in development mode with `BOB_URL` pointing at it. It needs Node 24 and bun 1.4.2, and installs bun if it is missing. Put `AI_GATEWAY_API_KEY` in the root `.env.local` for the model brain; without it the brain runs the scripted sample.

To run the desktop app alone:

```sh
cd desktop
bun install
BOB_URL=http://localhost:3000 bun run dev
```

## Your own inference

Settings → Providers → Custom provider adds any OpenAI-compatible endpoint: a local Ollama or LM Studio server, vLLM, or a gateway. Agents on that endpoint run through OpenCode.

## Checks

```sh
bun run typecheck
bun run build
```
