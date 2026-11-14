"use client";

import { ArrowUp, LoaderCircle, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useBob } from "@/components/app/BobContext";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { interruptAgent, sendMessage, type SendMode } from "@/lib/client/api";
import { displayName } from "@/lib/client/crew";
import type { Agent, ThreadView } from "@/lib/types";
import { QuickActions } from "./AgentChatEmptyState";
import { AwaitingReplies, type AwaitingReplyItem } from "./AwaitingReplies";
import { ComposerNotice } from "./ComposerNotice";
import { StopIcon } from "./conversation-icons";

/** The rows of the "Waiting for replies" block, with the start of each reply that came in. */
function awaitingItems(thread: ThreadView, agentsById: ReadonlyMap<string, Agent>): AwaitingReplyItem[] {
  return thread.waitingOn.map((wait) => {
    const agent = agentsById.get(wait.agentId);
    const reply = wait.state === "replied" ? thread.items.findLast((item) => item.kind === "message_in" && item.from === wait.agentId && item.isReply) : undefined;
    const preview = reply?.kind === "message_in" ? reply.text.split("\n")[0] : undefined;
    return { id: `${wait.messageId}:${wait.agentId}`, agent, name: agent ? displayName(agent) : wait.agentId, state: wait.state, preview };
  });
}

export interface ConversationComposerProps {
  agent: Agent;
  thread: ThreadView;
  working: boolean;
  /** Shows the quick actions over the composer, for the captain's chat once it has messages. */
  quickActions: boolean;
}

/** Everything under the chat: the waits and the queue in one card, any notice, then the message box. */
export function ConversationComposer({ agent, thread, working, quickActions }: ConversationComposerProps) {
  const { snapshot, agentsById, draftFor, setDraft } = useBob();
  const activity = snapshot.activity[agent.id];
  const turnSince = activity?.state === "working" ? activity.since : null;
  const draft = draftFor(agent.id);
  const surface = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The turn Stop was pressed for; the button waits for that turn to end.
  const [stoppedTurn, setStoppedTurn] = useState<string | null>(null);
  const stopping = turnSince !== null && stoppedTurn === turnSince;
  const [awaitingDismissed, setAwaitingDismissed] = useState<string | null>(null);

  // The editor is not controlled by React: it takes the draft only when the draft changed elsewhere,
  // as after a send or a quick action, so typing keeps its caret.
  const typed = useRef<string | null>(null);
  useLayoutEffect(() => {
    const element = surface.current;
    if (!element || draft === typed.current) return;
    element.innerText = draft;
    typed.current = draft;
  }, [draft]);

  useEffect(() => {
    surface.current?.focus({ preventScroll: true });
  }, []);

  const send = async (text: string, mode?: SendMode) => {
    const message = text.trim();
    if (message === "" || submitting) return false;
    setSubmitting(true);
    setError(null);
    const result = await sendMessage(agent.id, message, mode);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    return true;
  };

  const submit = async (mode?: SendMode) => {
    if (await send(draft, mode)) setDraft(agent.id, "");
  };

  const stop = async () => {
    setStoppedTurn(turnSince);
    const result = await interruptAgent(agent.id);
    if (!result.ok) {
      setStoppedTurn(null);
      setError(result.error);
    }
  };

  const prefill = (text: string) => {
    setDraft(agent.id, text);
    requestAnimationFrame(() => {
      const element = surface.current;
      if (!element) return;
      element.focus();
      const selection = window.getSelection();
      selection?.selectAllChildren(element);
      selection?.collapseToEnd();
    });
  };

  const hasContent = draft.trim() !== "";
  // As in the reference: while the agent works, Enter queues the message for after the turn and Tab
  // steers it into the running turn.
  const steers = working && hasContent && !submitting;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Tab" && steers && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      void submit("steer");
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    void submit();
  };

  const items = awaitingItems(thread, agentsById);
  const awaitingKey = items.map((item) => `${item.id}:${item.state}`).join("|");
  const awaitingVisible = items.length > 0 && awaitingDismissed !== awaitingKey;
  const queueVisible = thread.queued > 0;
  const slotOpen = awaitingVisible || queueVisible;
  const label = `Message ${agent.name}`;

  return (
    <div className="composer-wrap">
      {quickActions && !hasContent ? <QuickActions disabled={submitting} onSend={(text) => void send(text)} onPrefill={prefill} /> : null}
      <div className="composer-stack">
        <div className="agent-queue-slot" data-open={slotOpen ? "true" : "false"} aria-hidden={slotOpen ? undefined : "true"} inert={slotOpen ? undefined : true}>
          <div className="agent-queue-slot-inner">
            {awaitingVisible ? <AwaitingReplies items={items} onDismiss={() => setAwaitingDismissed(awaitingKey)} /> : null}
            {queueVisible ? (
              <section className="agent-queue-panel" data-variant="docked" aria-label="Message queue">
                <p className="agent-queue-hold" role="status">
                  {thread.queued === 1 ? "1 message waits" : `${thread.queued} messages wait`} - {agent.name} reads {thread.queued === 1 ? "it" : "them"} after this turn
                </p>
              </section>
            ) : null}
          </div>
        </div>
        {error ? <ComposerNotice tone="danger" title="Not sent" body={error} onDismiss={() => setError(null)} /> : null}
      </div>
      <div
        className="composer"
        data-compact={draft.includes("\n") ? undefined : ""}
        onPointerDown={(event) => {
          if (!(event.target instanceof Element) || event.target.closest("button, .composer-editor-surface")) return;
          event.preventDefault();
          surface.current?.focus();
        }}
      >
        <div className="composer-input-label">
          <div className="composer-editor-root" data-size="default">
            {draft === "" ? (
              <span className="composer-editor-placeholder" aria-hidden="true">
                {label}
              </span>
            ) : null}
            <div
              ref={surface}
              className="composer-editor-surface"
              role="textbox"
              aria-multiline="true"
              spellCheck
              data-cuelume-type=""
              contentEditable={submitting ? false : "plaintext-only"}
              suppressContentEditableWarning
              tabIndex={0}
              aria-label={label}
              aria-keyshortcuts={steers ? "Tab" : undefined}
              aria-disabled={submitting ? "true" : "false"}
              onInput={(event) => {
                const text = event.currentTarget.innerText === "\n" ? "" : event.currentTarget.innerText;
                typed.current = text;
                setDraft(agent.id, text);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
        </div>
        <div className="composer-toolbar">
          <button type="button" className="composer-button" aria-label="Add to prompt" title="Attachments are not available in Bob yet" disabled>
            <Plus aria-hidden="true" />
          </button>
          <div className="composer-primary-actions">
            {working && !hasContent ? (
              <Button
                variant="ghost"
                className="voice-button voice-button-active"
                aria-label="Stop agent"
                data-cuelume-tap="close"
                disabled={stopping}
                onClick={() => void stop()}
              >
                <StopIcon />
              </Button>
            ) : (
              <Button
                variant="ghost"
                className={cx("voice-button")}
                aria-label="Send message"
                aria-keyshortcuts="Enter"
                title="Send (Enter). Shift+Enter adds a new line."
                data-cuelume-emphasis="normal"
                disabled={submitting}
                onClick={() => void submit()}
              >
                {submitting ? <LoaderCircle className="composer-spinner" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
