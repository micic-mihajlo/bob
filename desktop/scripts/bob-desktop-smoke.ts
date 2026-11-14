/**
 * Smoke test of a packaged Bob: the main window loads, and the Bob ACP bridge in the package gets a
 * reply from the Worker for one chat turn.
 *
 *   bun scripts/bob-desktop-smoke.ts <app executable> [--launch <AppImage>] [--out <dir>]
 *
 * <app executable> is the packaged Bob binary (`bob` in a mounted AppImage, `Bob.exe` of an install).
 * The bridge runs in it as Node, as `provider-drivers.ts` starts it. The window starts from --launch
 * when given, so a Linux run starts the AppImage itself. Linux needs a display: run under `xvfb-run -a`.
 * BOB_USER names the coach (default ci-smoke-<time>), BOB_URL the Worker (default: bob-url.ts).
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { DEFAULT_BOB_URL } from "../src/backend/bob-url";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args.splice(index, 2)[1];
};
const launch = option("--launch");
const out = option("--out") ?? mkdtempSync(join(tmpdir(), "bob-smoke-"));
const [executable] = args;
if (!executable) {
  process.stderr.write(
    "Usage: bun scripts/bob-desktop-smoke.ts <app executable> [--launch <AppImage>] [--out <dir>]\n",
  );
  process.exit(2);
}
const bobUser = process.env.BOB_USER || `ci-smoke-${Date.now()}`;
const bobUrl = (process.env.BOB_URL || DEFAULT_BOB_URL).replace(/\/+$/u, "");
const port = 9333;
const say = (line: string) => process.stdout.write(`${line}\n`);
mkdirSync(out, { recursive: true });

async function until<T>(what: string, limitMs: number, attempt: () => Promise<T | undefined>): Promise<T> {
  const end = Date.now() + limitMs;
  while (Date.now() < end) {
    const value = await attempt().catch(() => undefined);
    if (value !== undefined) return value;
    await Bun.sleep(1000);
  }
  throw new Error(`Timed out: ${what}`);
}

interface PageTarget {
  type: "page";
  url: string;
  webSocketDebuggerUrl: string;
}

function isPageTarget(value: unknown): value is PageTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "page" &&
    "url" in value &&
    typeof value.url === "string" &&
    "webSocketDebuggerUrl" in value &&
    typeof value.webSocketDebuggerUrl === "string"
  );
}

interface CdpParams {
  expression?: string;
  returnByValue?: boolean;
  format?: "png";
}

interface AcpParams {
  protocolVersion?: number;
  clientCapabilities?: Record<never, never>;
  cwd?: string;
  mcpServers?: [];
  sessionId?: string;
  prompt?: { type: "text"; text: string }[];
}

async function checkWindow(executable: string) {
  const userData = mkdtempSync(join(tmpdir(), "bob-smoke-profile-"));
  const app = spawn(launch ?? executable, [`--user-data-dir=${userData}`, `--remote-debugging-port=${port}`], {
    env: { ...process.env, BOB_USER: bobUser, BOB_URL: bobUrl },
    stdio: ["ignore", "inherit", "inherit"],
  });
  try {
    const page = await until("the main window", 120_000, async () => {
      if (app.exitCode !== null) throw new Error(`Bob exited with code ${app.exitCode}`);
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      return Array.isArray(targets)
        ? targets.filter(isPageTarget).find((target) => target.url.startsWith("bob-app://app/"))
        : undefined;
    });
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    let id = 0;
    const call = (method: string, params: CdpParams = {}) =>
      new Promise<{ result?: { result?: { value?: unknown }; data?: string } }>((resolve) => {
        const callId = ++id;
        socket.addEventListener("message", function listen(event) {
          const message = JSON.parse(String(event.data));
          if (message.id !== callId) return;
          socket.removeEventListener("message", listen);
          resolve(message);
        });
        socket.send(JSON.stringify({ id: callId, method, params }));
      });
    const text = await until("the window past its loading screen", 60_000, async () => {
      const { result } = await call("Runtime.evaluate", {
        expression: "document.readyState === 'complete' ? document.body.innerText : ''",
        returnByValue: true,
      });
      const value = String(result?.result?.value ?? "").trim();
      return value && !value.includes("Connecting…") ? value : undefined;
    });
    await Bun.sleep(3000);
    const shot = await call("Page.captureScreenshot", { format: "png" });
    if (shot.result?.data) writeFileSync(join(out, "main-window.png"), Buffer.from(shot.result.data, "base64"));
    socket.close();
    say(`Main window loaded ${page.url}: ${JSON.stringify(text.slice(0, 200))}`);
  } finally {
    app.kill();
  }
}

async function checkBridge(executable: string) {
  const bridge = join(dirname(executable), "resources", "app.asar.unpacked", "out", "main", "bob-acp-bridge.js");
  const child = spawn(executable, [bridge], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", BOB_USER: bobUser, BOB_URL: bobUrl },
    stdio: ["pipe", "pipe", "inherit"],
  });
  type Result = { sessionId?: string; stopReason?: string };
  const pending = new Map<number, { resolve: (value: Result) => void; reject: (error: Error) => void }>();
  let reply = "";
  createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    if (message.method === "session/update" && message.params.update.sessionUpdate === "agent_message_chunk") {
      reply += message.params.update.content.text ?? "";
    }
    const waiter = pending.get(message.id);
    if (!waiter || message.method) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  });
  let id = 0;
  const request = (method: string, params: AcpParams) =>
    new Promise<Result>((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params })}\n`);
    });
  const exited = new Promise<never>((_, reject) =>
    child.on("exit", (code) => reject(new Error(`The bridge exited with code ${code}`))),
  );
  try {
    const turn = (async () => {
      await request("initialize", { protocolVersion: 1, clientCapabilities: {} });
      const { sessionId } = await request("session/new", { cwd: process.cwd(), mcpServers: [] });
      const result = await request("session/prompt", {
        sessionId,
        prompt: [
          {
            type: "text",
            text: "This is an automated smoke test of the Bob desktop build. Reply with one short sentence.",
          },
        ],
      });
      return result.stopReason;
    })();
    const timeout = Bun.sleep(180_000).then(() => {
      throw new Error("The chat turn timed out");
    });
    const stopReason = await Promise.race([turn, exited, timeout]);
    if (stopReason !== "end_turn" || !reply.trim()) throw new Error(`No reply from Bob (stop reason ${stopReason})`);
    say(`Bob replied through the bridge at ${bobUrl}/agents/bob-agent/${bobUser}: ${JSON.stringify(reply.trim())}`);
    writeFileSync(join(out, "bob-reply.txt"), reply.trim());
  } finally {
    child.kill();
  }
}

say(`BOB_USER=${bobUser}, BOB_URL=${bobUrl}, output in ${out}`);
await checkWindow(executable);
await checkBridge(executable);
process.exit(0);
