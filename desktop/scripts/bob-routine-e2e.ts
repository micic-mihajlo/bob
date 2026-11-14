// One Bob prompt creates an ordinary Bob routine. Runs the real agent service on a temporary
// profile, with the built Bob bridge (`out/main/bob-acp-bridge.js`, from `bun run build`) in
// Electron as Node, against the BobAgent Worker in a local Workers runtime (`wrangler dev`). The
// Worker uses a scripted model (`apps/cloud/scripts/scripted-worker.ts`), so no account or key is
// used. The path under test:
//   Bob MCP servers -> session/new -> the bridge lists their tools -> Think client tools ->
//   the model calls create_routine -> the bridge runs it on Bob's MCP server -> the result goes
//   back to Think in the same turn -> the model answers.
// The routine must then be in the agent's routine store. After a bridge restart and an app restart,
// a turn still completes in a new session; with the Worker down, it fails with "Bob is not reachable".
// `bun run test:bob-routine`, or `bun scripts/bob-routine-e2e.ts --packaged=dist/linux-unpacked`. Writes .bob-build/bob-routine-e2e/report.json.
import assert from "node:assert/strict";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { builtinModules, createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AGENT_PROVIDERS, agentProviderDescriptor } from "@bob/contracts/ipc";
import { Effect } from "effect";
import { AcpAgentClient } from "../src/backend/acp-client";
import { DEFAULT_ACP_FLAVOR } from "../src/backend/acp-flavor";
import type { AgentBrowserHost } from "../src/backend/agent/turn-lifecycle";
import { AgentService } from "../src/backend/agent-service";
import { AgentStore } from "../src/backend/agent-store";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { BobDatabase } from "../src/backend/bob-database";
import { MailboxStore } from "../src/backend/mailbox-store";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, ".bob-build/bob-routine-e2e");
// `--packaged=<dir>` runs the bridge of a packaged app instead, such as `dist/linux-unpacked` from
// `electron-builder --dir --linux`: its own executable as Node, from `app.asar.unpacked`, where Node
// finds only the packages that `asarUnpack` lists.
const PACKAGED = process.argv.find((argument) => argument.startsWith("--packaged="))?.slice("--packaged=".length);
const WORKER = resolve(ROOT, "../cloud/scripts/scripted-worker.ts");
const WRANGLER = join(ROOT, "node_modules/.bin/wrangler");

const root = await mkdtemp(join(tmpdir(), "bob-routine-e2e-"));
// Node's ESM resolver walks up every parent folder, so a packaged app inside this checkout would find
// a missing package in `apps/desktop/node_modules`. The copy outside it finds only its own.
const app = join(root, "app");
if (PACKAGED) await cp(resolve(PACKAGED), app, { recursive: true, verbatimSymlinks: true });
const BRIDGE = PACKAGED
  ? join(app, "resources/app.asar.unpacked/out/main/bob-acp-bridge.js")
  : join(ROOT, "out/main/bob-acp-bridge.js");
const ELECTRON: string = PACKAGED ? join(app, "bob") : createRequire(import.meta.url)("electron");

const report: {
  passed: boolean;
  bridge: string;
  delivery?: unknown;
  afterBridgeRestart?: unknown;
  afterAppRestart?: unknown;
  workerDown?: unknown;
  routines?: unknown;
  reply?: string;
  error?: string;
} = { passed: false, bridge: BRIDGE };

const unused = () => Effect.die(new Error("Not used by this check."));
const browser: AgentBrowserHost = {
  listTabs: () => [],
  beginTakeover: unused,
  endTakeover: () => {},
  resolveUploadTarget: unused,
  handleDynamicTool: unused,
  userControlTabFor: () => null,
  awaitUserControlRelease: unused,
  onChanged: () => () => {},
  onControlChanged: () => () => {},
  onDocumentChanged: () => () => {},
  clearControls: () => {},
  endControl: () => {},
  close: () => Effect.void,
  clearAgentSession: () => Effect.void,
};

async function waitFor<T>(label: string, read: () => T | null | undefined | false | Promise<T | false>): Promise<T> {
  const deadline = Date.now() + 120_000;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}.`);
    await new Promise((done) => setTimeout(done, 100));
  }
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  await new Promise((done) => server.close(done));
  if (!address || typeof address === "string") throw new Error("No free port.");
  return address.port;
}

const userData = join(root, "user-data");
const home = join(root, "home");
mkdirSync(home, { recursive: true });
const port = await freePort();
const bobUrl = `http://127.0.0.1:${port}`;
// The Worker imports Markdown with Vite's `?raw`, which Wrangler cannot load, so Bun bundles it first.
const bundle = await Bun.build({
  entrypoints: [WORKER],
  outdir: join(root, "worker"),
  target: "browser",
  conditions: ["workerd", "worker"],
  format: "esm",
  external: ["cloudflare:*", "node:*", ...builtinModules],
  plugins: [
    {
      name: "raw",
      setup(build) {
        build.onResolve({ filter: /\?raw$/u }, (args) => ({
          path: resolve(args.resolveDir, args.path.slice(0, -"?raw".length)),
          namespace: "raw",
        }));
        build.onLoad({ filter: /.*/u, namespace: "raw" }, async (args) => ({
          contents: await Bun.file(args.path).text(),
          loader: "text",
        }));
      },
    },
  ],
});
if (!bundle.success) throw new AggregateError(bundle.logs, "The Worker bundle failed.");
const config = join(root, "wrangler.json");
writeFileSync(
  config,
  JSON.stringify({
    name: "bob-routine-e2e",
    main: join(root, "worker/scripted-worker.js"),
    compatibility_date: "2026-06-11",
    compatibility_flags: ["nodejs_compat"],
    durable_objects: { bindings: [{ name: "BobAgent", class_name: "BobAgent" }] },
    migrations: [{ tag: "v1", new_sqlite_classes: ["BobAgent"] }],
  }),
);
let worker: ChildProcess | undefined;
const workerLog: string[] = [];

/** The agent service on this run's profile. A second call opens it again, as an app restart does. */
function openService() {
  const database = new BobDatabase(userData);
  const store = new AgentStore(userData, home, database);
  const mailbox = new MailboxStore(userData, store.sharedRoot, store.database);
  const agents = new AgentService({
    store,
    mailbox,
    browser,
    preferredProvider: "bob",
    offProviders: AGENT_PROVIDERS.filter((provider) => provider !== "bob"),
    clientFactory: (provider) =>
      new AcpAgentClient({ executable: ELECTRON, version: "", source: "system" }, 30_000, {
        provider,
        flavor: DEFAULT_ACP_FLAVOR,
        // The marker names this run's bridge, so the test stops only its own process.
        argv: [BRIDGE, `--e2e-run=${root}`],
        env: { ELECTRON_RUN_AS_NODE: "1", BOB_URL: bobUrl, BOB_USER: "bob-routine-e2e" },
        signInMessage: agentProviderDescriptor("bob").signInMessage,
      }),
  });
  return { database, agents, mailbox };
}
let bob = openService();

async function send(agentId: string, text: string) {
  const receipt = await runCauseEffect(bob.agents.sendMessage({ agentId, text }));
  const deliveryId = receipt.deliveries[0]?.id;
  assert.ok(deliveryId, "The message has a delivery.");
  const delivery = await waitFor(`the turn "${text}" to end`, () => {
    const current = bob.mailbox.getDelivery(deliveryId)?.delivery;
    return current && ["completed", "failed", "interrupted"].includes(current.status) ? current : null;
  });
  return { status: delivery.status, error: delivery.error ?? null };
}

try {
  worker = spawn(
    WRANGLER,
    ["dev", "--config", config, "--port", String(port), "--ip", "127.0.0.1", "--persist-to", join(root, "wrangler")],
    { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  for (const stream of [worker.stdout, worker.stderr]) stream?.on("data", (data) => workerLog.push(String(data)));
  await waitFor("the Worker", () =>
    fetch(`${bobUrl}/agents/bob-agent/probe`)
      .then((response) => response.ok)
      .catch(() => false),
  );

  await runCauseEffect(bob.agents.initialize());
  const agent = await runCauseEffect(
    bob.agents.createAgent({
      name: "Bob",
      description: "Bob coach.",
      avatarSeed: "bob-routine",
      avatarHue: null,
      provider: "bob",
      model: "bob",
      initialMessage: "Remind me on 1 January 2099 at 09:00 to send my first invoice.",
    }),
  );
  const deliveryId = await waitFor(
    "the first delivery",
    () => bob.mailbox.queuedDeliveryIds(agent.id)[0] ?? bob.mailbox.listRuntimeWork([agent.id], new Map())[0]?.id,
  );
  const delivery = await waitFor("the turn to end", () => {
    const current = bob.mailbox.getDelivery(deliveryId)?.delivery;
    return current && ["completed", "failed", "interrupted"].includes(current.status) ? current : null;
  });
  report.delivery = { status: delivery.status, error: delivery.error ?? null };
  assert.equal(delivery.status, "completed", delivery.error ?? delivery.status);

  const conversation = await runCauseEffect(bob.agents.readConversation(agent.id));
  report.reply = conversation.messages.find((message) => message.text.startsWith("Bob saw"))?.text ?? "";
  const routines = bob.agents.listRoutines(agent.id);
  report.routines = routines;
  assert.equal(routines.length, 1, "The prompt creates one routine.");
  const [routine] = routines;
  assert.ok(routine);
  assert.equal(routine.name, "Bob E2E reminder");
  assert.deepEqual(routine.trigger.schedule, { kind: "once", date: "2099-01-01", time: "09:00" });
  assert.equal(routine.timezone, "UTC");

  assert.ok(report.reply, "The model answers after the tool result, in the same turn.");
  assert.ok(report.reply.includes(routine.id), "The answer carries the result of the local tool.");
  const state = await (await fetch(`${bobUrl}/agents/bob-agent/bob-routine-e2e`)).json();
  assert.equal(
    state.client,
    "desktop",
    "The bridge marks the agent as a desktop client, so the cloud schedules nothing for it.",
  );

  // A new bridge process knows no session. Bob opens a new one instead of showing
  // "Unknown ACP session".
  spawnSync("pkill", ["-f", `--e2e-run=${root}`]);
  const restarted = await send(agent.id, "Are you still there?");
  report.afterBridgeRestart = restarted;
  assert.equal(restarted.status, "completed", restarted.error ?? restarted.status);

  // After an app restart, Bob asks the new bridge to resume the saved session.
  await runCauseEffect(bob.agents.stop());
  bob.database.close();
  bob = openService();
  await runCauseEffect(bob.agents.initialize());
  const reopened = await send(agent.id, "Back after a restart.");
  report.afterAppRestart = reopened;
  assert.equal(reopened.status, "completed", reopened.error ?? reopened.status);

  // With the Worker down, the turn fails with the bridge's own plain error.
  worker.kill("SIGTERM");
  await waitFor("the Worker to stop", () =>
    fetch(bobUrl).then(
      () => false,
      () => true,
    ),
  );
  spawnSync("pkill", ["-f", `--e2e-run=${root}`]);
  const down = await send(agent.id, "Hello?");
  report.workerDown = down;
  assert.equal(down.status, "failed");
  assert.match(down.error ?? "", /Bob is not reachable/u);
  assert.doesNotMatch(down.error ?? "", /Unknown ACP session/u);
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  if (workerLog.length > 0) report.error += `\nWorker log:\n${workerLog.join("").slice(-4000)}`;
  process.exitCode = 1;
} finally {
  await runCauseEffect(bob.agents.stop()).catch(() => {});
  bob.database.close();
  worker?.kill("SIGTERM");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await rm(root, { recursive: true, force: true });
  process.stdout.write(
    `${JSON.stringify({ passed: report.passed, reply: report.reply, error: report.error }, null, 2)}\n`,
  );
}
