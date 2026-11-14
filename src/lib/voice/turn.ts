import { postUserMessage, type ActionResult } from "../actions";
import { getState, subscribe } from "../store";
import type { State } from "../state";
import type { AgentId, MessageId } from "../types";

/** What the call says when the captain's turn runs past WAIT_MS. */
export const STILL_WORKING = "I'm still working on that. The answer will be in the thread.";
const NO_WORDS = "I took that on. The thread shows what I did.";
/** What the call says when the captain's turn failed, such as a model that refused the call. */
export const TURN_FAILED = "I couldn't reach my planning model just now. Your words are in the thread, so try again in a minute.";
const WAIT_MS = 100_000;

/** The agent's words from the turn that handled the message, once that turn ended. */
function replyOf(s: State, agentId: AgentId, messageId: MessageId): string | null {
  const turn = s.turns.find((t) => t.agentId === agentId && t.messageIds.includes(messageId));
  if (!turn || turn.status === "running") return null;
  const said = (s.threads[agentId] ?? []).flatMap((i) => (i.kind === "agent_text" && i.turnId === turn.id ? [i.text] : []));
  return said.join("\n\n") || (turn.status === "failed" ? TURN_FAILED : NO_WORDS);
}

/**
 * One turn of a call: what the person said goes into the thread as their message, marked voice, and the
 * agent's answer comes back to be spoken. The captain's own intake rules do the pushback.
 */
export async function voiceTurn(agentId: AgentId, text: string, waitMs = WAIT_MS): Promise<ActionResult<{ messageId: MessageId; reply: string }>> {
  const posted = postUserMessage(agentId, text, "queue", "voice");
  if (!posted.ok) return posted;
  const { messageId } = posted;
  const reply = await new Promise<string>((resolve) => {
    let stop = () => {};
    const check = () => {
      const found = replyOf(getState(), agentId, messageId);
      if (found !== null) finish(found);
    };
    const timer = setTimeout(() => finish(STILL_WORKING), waitMs);
    const finish = (value: string) => {
      stop();
      clearTimeout(timer);
      resolve(value);
    };
    stop = subscribe(check);
    check();
  });
  return { ok: true, messageId, reply };
}
