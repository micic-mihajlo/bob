import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

/**
 * The chaos run: seeded random events against the scripted brain, with the invariants checked after
 * each one, and real kill -9 restarts in between.
 *
 *   pnpm chaos --seed 7 --steps 30              one seed
 *   pnpm chaos --seed 1 --seeds 300 --jobs 2    seeds 1..300, two at a time
 *
 * Each seed runs scripts/chaos-host.chaos.ts in its own process and folder. When the host asks for a
 * restart, this kills its whole process group with SIGKILL and starts it again on the same folder.
 * Exits non-zero when any invariant broke. --out writes every finding as JSON.
 */
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1] ?? "");
const first = Number(args.get("seed") ?? 1);
const count = Number(args.get("seeds") ?? 1);
const steps = Number(args.get("steps") ?? 30);
const jobs = Number(args.get("jobs") ?? 1);
const out = args.get("out");
const root = path.resolve(import.meta.dirname, "..");
const vitest = path.join(root, "node_modules", ".bin", "vitest");

interface Finding {
  seed: number;
  step: number;
  event: string;
  rule: string;
  detail: string;
}

interface SeedResult {
  seed: number;
  seconds: number;
  restarts: number;
  done: Record<string, unknown> | null;
  findings: Finding[];
  events: string[];
}

function runOnce(seed: number, dir: string, result: SeedResult): Promise<"killed" | "exited"> {
  return new Promise((resolve) => {
    const child = spawn(vitest, ["run", "--config", "vitest.chaos.config.ts", "--reporter=dot"], {
      cwd: root,
      detached: true,
      env: { ...process.env, CHAOS_SEED: String(seed), CHAOS_STEPS: String(steps), CHAOS_DIR: dir, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let killed = false;
    const tail: string[] = [];
    const lines = createInterface({ input: child.stdout! });
    lines.on("line", (line) => {
      const match = /^(CHAOS_[A-Z]+) (.*)$/.exec(line.trim());
      if (!match) {
        tail.push(line);
        if (tail.length > 40) tail.shift();
        return;
      }
      const data = JSON.parse(match[2]) as Record<string, unknown>;
      if (match[1] === "CHAOS_EVENT") result.events.push(`${data.step} ${data.kind}: ${data.detail}`);
      if (match[1] === "CHAOS_VIOLATION") result.findings.push(data as unknown as Finding);
      if (match[1] === "CHAOS_DONE") result.done = data;
      if (match[1] === "CHAOS_KILL" && !killed) {
        killed = true;
        result.restarts++;
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    });
    child.stderr!.on("data", (chunk: Buffer) => tail.push(chunk.toString()));
    child.on("exit", () => {
      if (!killed && !result.done) result.findings.push({ seed, step: -1, event: "host", rule: "host_crashed", detail: tail.join("\n").slice(-2000) });
      resolve(killed ? "killed" : "exited");
    });
  });
}

async function runSeed(seed: number): Promise<SeedResult> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bob-chaos-${seed}-`));
  const result: SeedResult = { seed, seconds: 0, restarts: 0, done: null, findings: [], events: [] };
  const started = Date.now();
  for (let run = 0; run < 8; run++) {
    if ((await runOnce(seed, dir, result)) === "exited") break;
  }
  result.seconds = Math.round((Date.now() - started) / 100) / 10;
  if (result.findings.length === 0) fs.rmSync(dir, { recursive: true, force: true });
  else result.events.push(`state kept in ${dir}`);
  return result;
}

const seeds = Array.from({ length: count }, (_, i) => first + i);
const results: SeedResult[] = [];
let nextIndex = 0;
async function worker(): Promise<void> {
  while (nextIndex < seeds.length) {
    const seed = seeds[nextIndex++];
    const r = await runSeed(seed);
    results.push(r);
    const status = r.findings.length ? `${r.findings.length} finding(s)` : "ok";
    console.log(`seed ${seed}: ${status}, ${r.restarts} restart(s), ${r.events.length} event(s), ${r.seconds}s`);
    for (const f of r.findings) console.log(`  step ${f.step} after ${f.event}: ${f.rule}: ${f.detail.split("\n")[0]}`);
  }
}
await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));

const findings = results.flatMap((r) => r.findings);
const byRule = new Map<string, number>();
for (const f of findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
console.log(`\n${results.length} seed(s), ${steps} steps each, ${results.reduce((n, r) => n + r.restarts, 0)} kill -9 restart(s): ${findings.length} finding(s) in ${results.filter((r) => r.findings.length).length} seed(s)`);
for (const [rule, n] of byRule) console.log(`  ${rule}: ${n}`);
if (out) fs.writeFileSync(out, JSON.stringify(results.sort((a, b) => a.seed - b.seed), null, 2));
process.exit(findings.length ? 1 : 0);
