// The Bob ACP bridge (`src/backend/bob-acp-bridge.ts`) under Bob's real ACP client. It starts the
// built bridge (`out/main/bob-acp-bridge.js`, from `bun run build`) in Electron as Node, as the `bob`
// driver does, against the BobAgent Worker at BOB_URL (`bun run dev` in `cloud/`):
// - the client is signed in with no account and lists the one model `bob`;
// - a turn reaches the Worker, and the Worker's answer, or its model error, comes back;
// - a Worker that does not run gives an error that says so.
// `bun run test:bob-bridge`. Writes .bob-build/bob-bridge-e2e/report.json.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { agentProviderDescriptor } from "@bob/contracts/ipc";
import { createBobLogger } from "@bob/logging";
import { AcpAgentClient } from "../src/backend/acp-client";
import { DEFAULT_ACP_FLAVOR } from "../src/backend/acp-flavor";
import type { AgentClient } from "../src/backend/agent-client";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { requireProviderDriver } from "../src/backend/provider-drivers";
import { runTurn, startThread, stopClients, type TurnResult } from "./provider-fakes/host";

const logger = createBobLogger("bob-bridge-e2e");
const OUT = resolve(import.meta.dirname, "../.bob-build/bob-bridge-e2e");
const BRIDGE = resolve(import.meta.dirname, "../out/main/bob-acp-bridge.js");
const ELECTRON: string = createRequire(import.meta.url)("electron");
const BOB_URL = process.env.BOB_URL || "http://localhost:1337";

interface Report {
  passed: boolean;
  bobUrl: string;
  authState?: unknown;
  account?: unknown;
  models?: unknown;
  turn?: TurnResult;
  unreachable?: TurnResult;
  failure?: string;
}

const report: Report = { passed: false, bobUrl: BOB_URL };
const clients: AgentClient[] = [];

function bridgeClient(env: Readonly<Record<string, string>>): AgentClient {
  const client = new AcpAgentClient({ executable: ELECTRON, version: "", source: "system" }, 30_000, {
    provider: "bob",
    flavor: DEFAULT_ACP_FLAVOR,
    argv: [BRIDGE],
    env: { ELECTRON_RUN_AS_NODE: "1", BOB_USER: "bob-bridge-e2e", ...env },
    signInMessage: agentProviderDescriptor("bob").signInMessage,
  });
  clients.push(client);
  client.start();
  return client;
}

try {
  const workspace = await mkdtemp(join(tmpdir(), "bob-bridge-e2e-"));
  report.authState = requireProviderDriver("bob").authState(null);
  assert.deepEqual(report.authState, { kind: "bob", email: null }, "The bob driver reports its own account kind.");

  const client = bridgeClient({ BOB_URL });
  report.models = await runCauseEffect(client.request("model/list", {}, (value) => value));
  assert.match(JSON.stringify(report.models), /"model":"bob"/u, "The bridge lists the model bob.");
  report.account = await runCauseEffect(client.request("account/read", {}, (value) => value));
  assert.match(JSON.stringify(report.account), /"type":"bob"/u, "The bridge is signed in with no account.");

  const thread = await startThread(client, {
    cwd: workspace,
    developerInstructions: "Bob instructions for coding agents. The bridge removes them.",
  });
  report.turn = await runTurn(client, thread, {
    text: "Hi Bob, I want to make my first $1,000 online.",
    timeoutMs: 120_000,
  });
  if (report.turn.status === "completed") {
    assert.ok(report.turn.reply.trim(), "A completed turn has an answer.");
  } else {
    assert.equal(report.turn.status, "failed", "A turn completes or fails.");
    assert.match(report.turn.error ?? "", /\bBob: /u, "A failed turn carries the Worker's own error.");
  }

  const down = bridgeClient({ BOB_URL: "http://127.0.0.1:9" });
  const downThread = await startThread(down, { cwd: workspace });
  report.unreachable = await runTurn(down, downThread, { text: "Hello?", timeoutMs: 60_000 });
  assert.equal(report.unreachable.status, "failed", "A turn fails when the Worker does not run.");
  assert.match(report.unreachable.error ?? "", /Bob is not reachable/u, "The error says that Bob is not reachable.");

  report.passed = true;
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await stopClients(clients);
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  logger.info(report.passed ? "The Bob bridge E2E passed." : "The Bob bridge E2E failed.", {
    report: join(OUT, "report.json"),
    turn: report.turn?.error ?? report.turn?.status ?? null,
    failure: report.failure ?? null,
  });
}
