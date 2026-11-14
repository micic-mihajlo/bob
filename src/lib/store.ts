import fs from "node:fs";
import path from "node:path";
import { sweepOrphans } from "./boot";
import { withCaptainFiles } from "./captain-files";
import { globals, type Config } from "./globals";
import { seedState } from "./seed";
import type { State } from "./state";

const FILE = () => path.join(process.cwd(), ".data", "state.json");
const PERSIST_DEBOUNCE_MS = 200;

function looksLikeState(value: unknown): value is State {
  const s = value as Partial<State> | null;
  return (
    !!s &&
    Array.isArray(s.agents) &&
    Array.isArray(s.relayKeys) &&
    Array.isArray(s.actedTurnIds) &&
    Array.isArray(s.requeuedDeliveryIds) &&
    typeof s.rev === "number" &&
    !!s.roadmap
  );
}

function readSaved(): State | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(FILE(), "utf8"));
    return looksLikeState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Loads saved state through the boot sweep. The sweep's follow-up runs in `boot()`. */
export function loadState(saved: State | null): State {
  if (!saved) return seedState();
  const swept = sweepOrphans(withDefaults(saved));
  globals().pendingBoot = swept.orphanTurnIds;
  return swept.state;
}

/** Fills fields added after a state was saved, or held in memory across a hot reload. */
const withDefaults = (s: State): State => (Array.isArray(s.drive) ? s : { ...s, drive: [] });

export function getState(): State {
  const g = globals();
  if (!g.state) g.state = loadState(g.config.persist ? readSaved() : null);
  if (!Array.isArray(g.state.drive)) g.state = withDefaults(g.state);
  return g.state;
}

function schedulePersist(): void {
  const g = globals();
  if (!g.config.persist || g.persistTimer) return;
  g.persistTimer = setTimeout(() => {
    g.persistTimer = null;
    try {
      fs.mkdirSync(path.dirname(FILE()), { recursive: true });
      const tmp = `${FILE()}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(g.state));
      fs.renameSync(tmp, FILE());
    } catch {
      // Persistence is best effort. The in-memory state stays authoritative.
    }
  }, PERSIST_DEBOUNCE_MS);
}

function commit(next: State): State {
  const g = globals();
  g.state = { ...withCaptainFiles(next), rev: getState().rev + 1 };
  schedulePersist();
  for (const listener of [...g.listeners]) {
    try {
      listener();
    } catch {
      g.listeners.delete(listener);
    }
  }
  return g.state;
}

/** Applies a pure update. Returning the same object means nothing changed. */
export function update(fn: (s: State) => State): State {
  const current = getState();
  const next = fn(current);
  return next === current ? current : commit(next);
}

/** An update that also hands back a value computed from the same state it changed. */
export function transact<T>(fn: (s: State) => { state: State; value: T }): T {
  let value!: T;
  update((s) => {
    const result = fn(s);
    value = result.value;
    return result.state;
  });
  return value;
}

export function subscribe(listener: () => void): () => void {
  const { listeners } = globals();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Back to the seed. Keeps `rev` increasing so open event streams see the change. */
export function resetState(): State {
  globals().pendingBoot = null;
  return commit(seedState());
}

/** Swaps in a whole state, as a restart would. Tests use it to exercise the boot sweep. */
export function replaceState(next: State): State {
  globals().state = null;
  globals().state = loadState(next);
  return getState();
}

export function configure(patch: Partial<Config>): void {
  const g = globals();
  g.config = { ...g.config, ...patch };
}

export const getConfig = (): Config => globals().config;
