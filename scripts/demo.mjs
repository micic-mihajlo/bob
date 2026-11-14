#!/usr/bin/env node
/**
 * pnpm demo: checks the machine, builds and starts Bob, opens Bob's own repository at its pinned demo base (Bob builds
 * Bob; --sample or --scripted use the tasks-app sample instead) with its repository and dependencies already made, and
 * prints what is on and off. Every other project is kept. Plain JavaScript so it can
 * check the Node version before anything else runs.
 *
 *   pnpm demo                 Bob builds Bob: production build on port 3000, Bob's own repository at demo/self-base,
 *                             PRs to demo/self, live model when .env.local has the key
 *   pnpm demo --prewarm       also starts one coding request in the background, so a PR is under way
 *   pnpm demo --sample        the tasks-app sample instead of Bob's own repository
 *   pnpm demo --scripted      the scripted brain on the tasks-app sample, whatever .env.local says (the mid-demo fallback);
 *                             add --self to keep Bob's own repository
 *   pnpm demo --keep          keep the current state instead of resetting the sample
 *   pnpm demo --dev           next dev instead of a production build
 *   pnpm demo --port 3001
 *
 * Build and review crew threads run on the Claude Agent SDK; BOB_ENGINE=loop puts them back on the move loop.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: opts } = parseArgs({
  options: {
    port: { type: "string", default: "3000" },
    prewarm: { type: "boolean", default: false },
    scripted: { type: "boolean", default: false },
    self: { type: "boolean", default: false },
    sample: { type: "boolean", default: false },
    keep: { type: "boolean", default: false },
    dev: { type: "boolean", default: false },
  },
});

/** Bob's own repository unless the sample is asked for; the scripted brain keeps to the sample unless --self says otherwise. */
const SELF_MODE = opts.self || (!opts.sample && !opts.scripted);

const ROOT = process.cwd();
const PORT = Number(opts.port);
const BASE = `http://localhost:${PORT}`;
const LOG_DIR = path.join(ROOT, ".data", "demo");
const rel = (file) => path.relative(ROOT, file);
const PREWARM =
  "List overdue tasks: add overdueTasks(tasks, today) in src/tasks.ts that returns the open tasks whose due date is before today, oldest due date first. Done means a vitest test passes for one overdue, one done and one not-yet-due task.";

const SELF_PREWARM =
  "Show when each pull request was opened as relative time on its card: add formatAgo(ms) in src/lib/format-time.ts returning just now under 10 s, then 12s ago, 5m ago, 2h ago, 3d ago. Done when a vitest test passes for 5 s, 12 s, 300 s, 7200 s and 3 days.";
/** Bob's own repository. Each demo starts from the pinned base branch, and its pull requests go to demo/self. */
const SELF = { repo: "https://github.com/micic-mihajlo/bob.git", branch: "demo/self-base", name: "bob", prBase: "demo/self" };

const say = (line = "") => console.log(line);
const stop = (message) => {
  console.error(`\ndemo: ${message}`);
  process.exit(1);
};

// ---------- preconditions ----------

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 9)) stop(`Node ${process.versions.node} is too old; Next.js 16 needs 20.9 or later. Install Node 24 (nvm install 24).`);

const gitVersion = spawnSync("git", ["--version"], { encoding: "utf8" });
if (gitVersion.status !== 0) stop("git is not installed. On a Mac: xcode-select --install");
const [gMajor, gMinor] = (/(\d+)\.(\d+)/.exec(gitVersion.stdout) ?? ["", "0", "0"]).slice(1).map(Number);
if (gMajor < 2 || (gMajor === 2 && gMinor < 28)) stop(`${gitVersion.stdout.trim()} is too old; Bob needs git 2.28 or later.`);

if (!fs.existsSync(path.join(ROOT, "node_modules", ".bin", "next"))) {
  say("demo: installing dependencies (pnpm install)");
  if (spawnSync("pnpm", ["install", "--frozen-lockfile"], { cwd: ROOT, stdio: "inherit" }).status !== 0) stop("pnpm install failed.");
}

/** .env.local as Next.js reads it, under the shell's own environment. Values are only tested, never printed. */
const envFile = path.join(ROOT, ".env.local");
const local = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) local[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}
const env = { ...local, ...process.env };
const has = (name) => !!env[name]?.trim();

const portFree = (port) =>
  new Promise((resolve) => {
    const probe = net.createServer().once("error", () => resolve(false));
    probe.listen(port, () => probe.close(() => resolve(true)));
  });
if (!(await portFree(PORT))) stop(`port ${PORT} is in use. Stop the other server (another pnpm dev or pnpm demo?) or pass --port ${PORT + 1}.`);

// ---------- server ----------

fs.mkdirSync(LOG_DIR, { recursive: true });
const serverEnv = { ...process.env, PORT: String(PORT) };
if (opts.scripted) serverEnv.BOB_BRAIN = "script";
if (SELF_MODE) serverEnv.BOB_GITHUB_BASE = process.env.BOB_GITHUB_BASE?.trim() || SELF.prBase;
if (SELF_MODE && !env.BOB_GITHUB?.trim() && has("COMPOSIO_API_KEY")) serverEnv.BOB_GITHUB = "composio";
serverEnv.BOB_ENGINE = env.BOB_ENGINE?.trim() || "sdk";
const next = path.join(ROOT, "node_modules", ".bin", "next");

if (!opts.dev) {
  say("demo: building (next build)");
  const build = spawnSync(next, ["build"], { cwd: ROOT, env: serverEnv, encoding: "utf8" });
  fs.writeFileSync(path.join(LOG_DIR, "build.log"), `${build.stdout ?? ""}${build.stderr ?? ""}`);
  if (build.status !== 0) stop(`next build failed; see ${rel(path.join(LOG_DIR, "build.log"))}. pnpm demo --dev skips the build.`);
}

const serverLog = path.join(LOG_DIR, "server.log");
const log = fs.createWriteStream(serverLog, { flags: "w" });
const server = spawn(next, [opts.dev ? "dev" : "start", "--port", String(PORT)], { cwd: ROOT, env: serverEnv, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.pipe(log);
server.stderr.pipe(log);
server.on("exit", (code) => {
  say(`\ndemo: the server stopped (exit ${code}); its log is ${rel(serverLog)}`);
  process.exit(code ?? 1);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill("SIGTERM"));

const call = async (route, body) => {
  const init = body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch(BASE + route, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${route} answered ${res.status}: ${data.error ?? "no detail"}`);
  return data;
};

const started = Date.now();
for (;;) {
  try {
    await call("/api/state");
    break;
  } catch {
    if (Date.now() - started > 120_000) {
      server.kill("SIGTERM");
      stop(`no answer from ${BASE}/api/state within 120 s; see ${rel(serverLog)}.`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

try {
  if (opts.keep) {
    const kept = await call("/api/state");
    if (SELF_MODE && kept.project?.repo !== SELF.repo) {
      say(`demo: --keep kept ${kept.project?.name ?? "the current project"}, not Bob's own repository. Run pnpm demo without --keep to open Bob's own repository.`);
    }
  } else {
    if (SELF_MODE) {
      say(`demo: resetting the current project, then opening Bob's own repository at ${SELF.branch} and preparing it (clone, pnpm install); other projects are kept`);
      await call("/api/reset", {});
      for (const opened = Date.now(); ; ) {
        try {
          await call("/api/projects", { repo: SELF.repo, branch: SELF.branch, name: SELF.name });
          break;
        } catch (error) {
          if (!/still working/.test(error.message) || Date.now() - opened > 60_000) throw error;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    } else say("demo: resetting the scripted sample and preparing it (repository, dependencies); other projects are kept");
    const reset = await call("/api/reset", SELF_MODE ? { warm: true } : { warm: true, sample: true });
    const deps = reset.deps ?? { kind: "none" };
    if (deps.kind === "failed") say(`demo: WARNING the project's dependency install failed (${deps.command}); each thread will install its own. ${String(deps.output).slice(-300)}`);
    else if (deps.kind === "ready") say(`demo: project ready, dependencies ${deps.reused ? "already installed" : `installed in ${Math.round(deps.seconds)} s`}`);
    else say("demo: project ready");
  }
  await fetch(BASE + "/").catch(() => undefined);
  const snapshot = await call("/api/state");

  const live = snapshot.brain === "model";
  const nsSandbox = process.platform === "linux" && env.BOB_SANDBOX !== "off" && spawnSync("unshare", ["--user", "--map-root-user", "--mount", "true"], { stdio: "ignore" }).status === 0;
  const github = env.BOB_GITHUB?.trim().toLowerCase();
  const model = live
    ? `live: captain ${env.BOB_MODEL_STRONG || "deepseek/deepseek-v4.1-flash"}, crew ${serverEnv.BOB_ENGINE === "sdk" ? "on the coding agent" : env.BOB_MODEL_LIGHT || "deepseek/deepseek-v4.1-flash"}`
    : `scripted (${opts.scripted ? "--scripted" : fs.existsSync(envFile) ? "no AI_GATEWAY_API_KEY in .env.local" : "no .env.local"})`;
  const rows = [
    ["Model", model],
    ["Crew engine", !live ? "scripted" : serverEnv.BOB_ENGINE === "sdk" ? "Claude Agent SDK for build and review (BOB_ENGINE=loop for the move loop)" : `move loop (BOB_ENGINE=${serverEnv.BOB_ENGINE})`],
    ["run sandbox", nsSandbox ? "namespace sandbox" : `plain shell (${env.BOB_SANDBOX === "off" ? "BOB_SANDBOX=off" : `no namespace sandbox on ${process.platform}`}); commands still get no API keys`],
    ["HydraDB graph", env.BOB_STORE === "hydra" ? (has("HYDRADB_API_KEY") ? "on" : "BOB_STORE=hydra but no HYDRADB_API_KEY, so JSON only") : "off (BOB_STORE=hydra turns it on)"],
    ["Voice", env.BOB_VOICE === "elevenlabs" ? (has("ELEVENLABS_API_KEY") ? "ElevenLabs" : "BOB_VOICE=elevenlabs but no ELEVENLABS_API_KEY") : "browser speech (BOB_VOICE=elevenlabs for ElevenLabs)"],
    ["GitHub PRs", github === "gh" || github === "composio" ? `on via ${github} to ${env.BOB_GITHUB_REPO || "micic-mihajlo/bob"}` : "off (BOB_GITHUB=gh turns it on)"],
    [
      "Durable state",
      env.BOB_DURABLE === "cloudflare"
        ? has("BOB_DURABLE_URL") && has("BOB_DURABLE_SECRET")
          ? `Cloudflare Durable Object at ${env.BOB_DURABLE_URL}, namespace ${(env.BOB_DURABLE_NAMESPACE?.trim() || os.hostname()).replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 100)}, local file kept`
          : "BOB_DURABLE=cloudflare but no BOB_DURABLE_URL or BOB_DURABLE_SECRET, so the local file only"
        : "local file .data/state.json (BOB_DURABLE=cloudflare for a Durable Object)",
    ],
    ["Vercel previews", env.BOB_PREVIEWS?.trim().toLowerCase() === "vercel" ? "on" : "off (BOB_PREVIEWS=vercel turns it on)"],
    ["Project", `${snapshot.project?.name ?? "?"} (${snapshot.project?.repo ?? "blank TypeScript template"})`],
  ];
  say();
  for (const [name, value] of rows) say(`  ${name.padEnd(16)} ${value}`);

  if (opts.prewarm) {
    const captain = snapshot.agents.find((a) => a.kind === "captain") ?? snapshot.agents.find((a) => a.role === "orchestrator");
    if (!captain) throw new Error("no captain in the snapshot");
    await call(`/api/agents/${captain.id}/messages`, { text: SELF_MODE ? SELF_PREWARM : PREWARM });
    say(`\ndemo: pre-warm request sent to ${captain.name} (${SELF_MODE ? "pull request times" : "overdue tasks"}). It stops at a merge approval under Needs you.`);
  }
  if (!live && !opts.scripted) say("\ndemo: WARNING the scripted brain is running. Put AI_GATEWAY_API_KEY in .env.local for the live model.");
  say(`\nBob is on at ${BASE}. Ctrl-C stops it. If the model misbehaves mid-demo: Ctrl-C, then pnpm demo --scripted.`);
} catch (error) {
  server.kill("SIGTERM");
  stop(error instanceof Error ? error.message : String(error));
}
