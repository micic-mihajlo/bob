import type { LiveSink } from "./brain/types";
import { nowIso } from "./ids";
import type { State } from "./state";
import { update } from "./store";
import type { AgentId, LiveMove, TurnId } from "./types";

/** How often streamed text is written to the state, so a fast model does not commit every token. */
export const LIVE_FLUSH_MS = 150;

function setLive(s: State, agentId: AgentId, move: LiveMove | null): State {
  if (!move && !s.live?.[agentId]) return s;
  const { [agentId]: _gone, ...rest } = s.live ?? {};
  return { ...s, live: move ? { ...rest, [agentId]: move } : rest };
}

/**
 * The live view of one move: text is written at most every LIVE_FLUSH_MS, a started tool call at once.
 * `stop` clears it, and nothing written after that shows.
 */
export function liveMove(agentId: AgentId, turnId: TurnId): LiveSink & { stop(): void } {
  let text = "";
  let tools: LiveMove["tools"] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const write = () => {
    cancel();
    if (!stopped) update((s) => setLive(s, agentId, { turnId, text, tools, at: nowIso() }));
  };
  return {
    text(sofar) {
      if (stopped) return;
      text = sofar;
      timer ??= setTimeout(write, LIVE_FLUSH_MS);
    },
    toolStart(id, tool) {
      if (stopped) return;
      tools = [...tools, { id, tool }];
      write();
    },
    reset() {
      text = "";
      tools = [];
      cancel();
      update((s) => setLive(s, agentId, null));
    },
    stop() {
      stopped = true;
      cancel();
      update((s) => setLive(s, agentId, null));
    },
  };
}
