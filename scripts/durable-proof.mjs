#!/usr/bin/env node
/**
 * pnpm durable:proof: the kill-and-wipe proof for BOB_DURABLE=cloudflare. Starts the Durable Object Worker under
 * wrangler dev (local Durable Objects, no account), starts Bob on the scripted brain with the switch on in a
 * scratch directory, sends a request, waits until a crew thread is working on it and the Durable Object holds that
 * revision, then kill -9s Bob, deletes its whole .data, starts it again and checks that the request comes back from
 * the Durable Object, the interrupted turn picks up again and the crew thread takes new steps. The Durable Object
 * holds Bob's state, not the git workspaces under .data/workspaces, so work that needs the deleted repository (the
 * pull request) reports it as blocked rather than reaching a merge approval.
 *
 *   pnpm durable:proof               uses the existing next build (runs one when there is none)
 *   pnpm durable:proof --build       builds first
 *   pnpm durable:proof --url <url>   against a deployed Worker instead of wrangler dev (BOB_DURABLE_SECRET from the env)
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: opts } = parseArgs({
  options: { build: { type: "boolean", default: false }, url: { type: "string" }, port: { type: "string", default: "3210" } },
});

const ROOT = process.cwd();
const BOB = `http://127.0.0.1:${opts.port}`;
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "bob-durable-proof-"));
const BOB_DIR = path.join(WORK, "bob");
const REQUEST =
  "Customers want to export invoices as CSV: all invoices, columns id, customer, amount, status and due date. Done when invoicesToCsv returns a header row and one row per invoice.";
const children = new Set();
const say = (line = "") => console.log(line);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (message) => {
  console.error(`\ndurable proof: FAILED: ${message}\nlogs: ${WORK}`);
  for (const child of children) process.kill(-child.pid, "SIGKILL");
  process.exit(1);
};

async function until(what, test, ms = 60_000) {
  const started = Date.now();
  for (;;) {
    const value = await test().catch(() => undefined);
    if (value) return value;
    if (Date.now() - started > ms) fail(`${what} did not happen within ${ms / 1000} s`);
    await sleep(250);
  }
}

function start(command, args, cwd, env, log) {
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const out = fs.createWriteStream(log, { flags: "a" });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

// ---------- the Durable Object ----------

let durableUrl = opts.url?.replace(/\/+$/, "");
let secret = process.env.BOB_DURABLE_SECRET?.trim();
if (!durableUrl) {
  const cloud = path.join(ROOT, "cloud");
  if (!fs.existsSync(path.join(cloud, "node_modules", ".bin", "wrangler"))) {
    say("durable proof: installing the Worker's dependencies (cloud/)");
    if (spawnSync("npm", ["install"], { cwd: cloud, stdio: "inherit" }).status !== 0) fail("npm install in cloud/ failed");
  }
  const vars = path.join(cloud, ".dev.vars");
  if (!fs.existsSync(vars)) fs.writeFileSync(vars, `BOB_DURABLE_SECRET=${crypto.randomBytes(16).toString("hex")}\n`, { mode: 0o600 });
  secret = /^BOB_DURABLE_SECRET=(.*)$/m.exec(fs.readFileSync(vars, "utf8"))?.[1]?.trim();
  durableUrl = "http://127.0.0.1:8788";
  say(`durable proof: starting the Worker under wrangler dev (${durableUrl}, fresh local storage)`);
  start(path.join(cloud, "node_modules", ".bin", "wrangler"), ["dev", "--port", "8788", "--ip", "127.0.0.1", "--persist-to", path.join(WORK, "wrangler")], cloud, process.env, path.join(WORK, "wrangler.log"));
  await until("the Worker answering /health", async () => (await fetch(`${durableUrl}/health`)).ok);
}
if (!secret) fail("no BOB_DURABLE_SECRET");
const durable = async (route) => (await fetch(durableUrl + route, { headers: { "x-bob-durable-secret": secret } })).json();

// ---------- Bob ----------

const next = path.join(ROOT, "node_modules", ".bin", "next");
if (opts.build || !fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
  say("durable proof: building (next build)");
  if (spawnSync(next, ["build"], { cwd: ROOT, stdio: "ignore" }).status !== 0) fail("next build failed");
}
fs.mkdirSync(BOB_DIR, { recursive: true });
const bobEnv = { ...process.env, BOB_BRAIN: "script", BOB_DURABLE: "cloudflare", BOB_DURABLE_URL: durableUrl, BOB_DURABLE_SECRET: secret, PORT: opts.port };
const bobLog = path.join(WORK, "bob.log");
const startBob = () => start(next, ["start", "--port", opts.port, ROOT], BOB_DIR, bobEnv, bobLog);
const call = async (route, body) => {
  const init = body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch(BOB + route, init);
  if (!res.ok) throw new Error(`${route} answered ${res.status}`);
  return res.json();
};
const crew = (s) => s.agents.filter((a) => a.kind === "crew");
const pending = (s) => s.approvals.filter((a) => a.status === "pending");
const asked = (s) => s.roadmap.tracks.some((t) => t.ask && t.ask.includes("export invoices as CSV"));

say(`durable proof: starting Bob on the scripted brain with BOB_DURABLE=cloudflare in ${BOB_DIR}`);
let bob = startBob();
await until("Bob answering /api/state", () => call("/api/state"), 120_000);
await call("/api/reset", { sample: true });
const first = await call("/api/state");
const captain = first.agents.find((a) => a.kind === "captain");
if (!captain) fail("no captain in the snapshot");
await call(`/api/agents/${captain.id}/messages`, { text: REQUEST });
say("durable proof: request sent to the captain");

const mid = await until("a crew thread working on the request", async () => {
  const s = await call("/api/state");
  const working = crew(s).some((a) => s.threads[a.id]?.items.some((i) => i.kind === "step"));
  return working && pending(s).length === 0 ? s : undefined;
});
const held = await until(`the Durable Object holding rev ${mid.rev}`, async () => {
  const latest = await durable("/latest");
  return latest.rev >= mid.rev ? latest : undefined;
}, 15_000);
say(`durable proof: mid-request at rev ${mid.rev}: crew ${crew(mid).map((a) => a.id).join(", ")} working, no approval yet; the Durable Object holds rev ${held.rev}`);

process.kill(-bob.pid, "SIGKILL");
await until("Bob exiting", async () => bob.exitCode !== null || bob.signalCode !== null);
fs.rmSync(path.join(BOB_DIR, ".data"), { recursive: true, force: true });
say(`durable proof: kill -9 Bob, rm -rf ${path.join(BOB_DIR, ".data")} (exists now: ${fs.existsSync(path.join(BOB_DIR, ".data"))})`);

bob = startBob();
const back = await until("Bob answering again", () => call("/api/state"), 120_000);
const restoreLine = fs.readFileSync(bobLog, "utf8").split("\n").filter((l) => l.includes("Durable state:")).pop();
say(`durable proof: restarted; ${restoreLine?.trim() ?? "no restore line in the log"}`);
if (!/restored/.test(restoreLine ?? "")) fail("Bob did not restore from the Durable Object");
if (!asked(back)) fail("the request is not on the roadmap after the restart");
if (!crew(mid).every((a) => back.agents.some((b) => b.id === a.id))) fail("a crew thread is missing after the restart");
say(`durable proof: after restart at rev ${back.rev}: the request is on the roadmap and crew ${crew(back).map((a) => a.id).join(", ")} is back`);

const resumed = await until("the interrupted work picking up again", async () => {
  const s = await call("/api/state");
  const notice = Object.values(s.threads).flatMap((t) => t.items).find((i) => i.kind === "notice" && /restarted mid-turn/.test(i.text));
  const moved = crew(mid).every((a) => (s.threads[a.id]?.items.length ?? 0) > (mid.threads[a.id]?.items.length ?? 0));
  return notice && moved ? { s, notice } : undefined;
}, 120_000);
say(`durable proof: resumed: "${resumed.notice.text.split(".")[0]}." and crew ${crew(mid).map((a) => a.id).join(", ")} took new steps (rev ${resumed.s.rev})`);
const after = await until("the Durable Object taking the revisions written after the restart", async () => {
  const latest = await durable("/latest");
  return latest.rev > held.rev ? latest : undefined;
}, 15_000);
say(`durable proof: the Durable Object moved on from rev ${held.rev} to rev ${after.rev}`);
say("\ndurable proof: PASSED");
for (const child of children) process.kill(-child.pid, "SIGKILL");
process.exit(0);
