import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushDurable, mirrorDurable, restoreFromDurable } from "../durable";
import type { State } from "../state";

const state = (rev: number, id = "p1") => ({ rev, project: { id } }) as unknown as State;
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("bob.durable")];
  vi.stubEnv("BOB_DURABLE", "cloudflare");
  vi.stubEnv("BOB_DURABLE_URL", "http://durable.test/");
  vi.stubEnv("BOB_DURABLE_SECRET", "s3cret");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("write-through to the Durable Object", () => {
  it("does nothing while the switch is off", async () => {
    vi.stubEnv("BOB_DURABLE", "");
    mirrorDurable(state(1));
    await flushDurable();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the revision with the secret and rev headers, and only the newest of a burst", async () => {
    let release!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (release = () => r(reply(200, { ok: true })))));
    fetchMock.mockResolvedValue(reply(200, { ok: true }));
    mirrorDurable(state(1));
    mirrorDurable(state(2));
    mirrorDurable(state(3));
    release();
    await flushDurable();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("http://durable.test/projects/p1/state");
    expect(init.headers).toMatchObject({ "x-bob-durable-secret": "s3cret", "x-bob-rev": "3" });
    expect(JSON.parse(init.body as string).rev).toBe(3);
  });

  it("stops sending revisions the Durable Object already holds a newer one than", async () => {
    fetchMock.mockResolvedValueOnce(reply(409, { rev: 10 }));
    mirrorDurable(state(4));
    await flushDurable();
    mirrorDurable(state(5));
    await flushDurable();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never throws while the Durable Object is down, warns once, retries and logs the recovery", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED")).mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    fetchMock.mockResolvedValue(reply(200, { ok: true }));
    expect(() => mirrorDurable(state(7))).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    mirrorDurable(state(8));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(warn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse((fetchMock.mock.calls[2] as [string, RequestInit])[1].body as string).rev).toBe(8);
    expect(info).toHaveBeenCalledWith(expect.stringContaining("rev 8"));
  });
});

describe("restore on boot", () => {
  let file: string;
  beforeEach(() => {
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bob-durable-")), ".data", "state.json");
  });

  it("is off without the switch", async () => {
    vi.stubEnv("BOB_DURABLE", "");
    expect(await restoreFromDurable(file)).toEqual({ outcome: "off" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("writes the Durable Object's state when the local file is gone", async () => {
    fetchMock.mockResolvedValue(reply(200, { projectId: "p1", rev: 12, state: state(12) }));
    expect(await restoreFromDurable(file)).toEqual({ outcome: "restored", rev: 12 });
    expect(JSON.parse(fs.readFileSync(file, "utf8")).rev).toBe(12);
  });

  it("keeps a local file that is as new or newer", async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state(20)));
    fetchMock.mockResolvedValue(reply(200, { projectId: "p1", rev: 12, state: state(12) }));
    expect(await restoreFromDurable(file)).toEqual({ outcome: "kept", rev: 20 });
    expect(JSON.parse(fs.readFileSync(file, "utf8")).rev).toBe(20);
  });

  it("reports an empty Durable Object and an unreachable one without touching the file", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(reply(404, { error: "Nothing stored yet." }));
    expect(await restoreFromDurable(file)).toEqual({ outcome: "empty" });
    fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    expect(await restoreFromDurable(file)).toEqual({ outcome: "unreachable" });
    expect(fs.existsSync(file)).toBe(false);
  });
});
