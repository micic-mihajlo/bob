"use client";

import { ArrowUp, File, Image as ImageIcon, LoaderCircle, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { CallBob } from "@/components/voice/CallBob";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { interruptAgent, sendMessage, type SendMode } from "@/lib/client/api";
import { displayName } from "@/lib/client/crew";
import { reportView } from "@/lib/client/report-view";
import { answeringQuote } from "@/lib/client/requests";
import { oneRowPerAgent } from "@/lib/client/selectors";
import type { Agent, ThreadView } from "@/lib/types";
import { QuickActions } from "./AgentChatEmptyState";
import { AwaitingReplies, type AwaitingReplyItem } from "./AwaitingReplies";
import { ComposerEditor } from "./ComposerEditor";
import { ComposerErrorBanner } from "./ComposerErrorBanner";
import { useDraft } from "./composer-drafts";
import { expandComposerMentions } from "./composer-tokens";
import { StopIcon } from "./conversation-icons";

/** The rows of the "Waiting for replies" block, with the start of each reply that came in. */
function awaitingItems(thread: ThreadView, agentsById: ReadonlyMap<string, Agent>): AwaitingReplyItem[] {
  return oneRowPerAgent(thread.waitingOn).map((wait) => {
    const agent = agentsById.get(wait.agentId);
    const reply = wait.state === "replied" ? thread.items.findLast((item) => item.kind === "message_in" && item.from === wait.agentId && item.isReply) : undefined;
    const preview = reply?.kind === "message_in" ? (reportView(reply.text)?.result ?? reply.text).split("\n")[0] : undefined;
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

/** The "+" menu, as the reference's add menu. Bob has no uploads, so the file rows stay shown and disabled. */
function ComposerAddMenu({ open, onOpenChange, disabled, onClosed }: { open: boolean; onOpenChange: (open: boolean) => void; disabled: boolean; onClosed: () => void }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onOpenChange(false);
      onClosed();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onOpenChange, onClosed]);

  return (
    <div ref={root} className="composer-add-menu">
      <button
        type="button"
        className="composer-button"
        aria-label="Add to prompt"
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
      >
        <Plus aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label="Add to prompt" className="ui-action-menu composer-add-menu-content" data-expanded="">
          <button type="button" role="menuitem" aria-disabled="true" data-disabled="" title="Attachments are not available in Bob yet" onClick={(event) => event.preventDefault()}>
            <ImageIcon aria-hidden="true" />
            <span>Attach image</span>
          </button>
          <button type="button" role="menuitem" aria-disabled="true" data-disabled="" title="Attachments are not available in Bob yet" onClick={(event) => event.preventDefault()}>
            <File aria-hidden="true" />
            <span>Add context</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Everything under the chat: the waits and the queue in one card, any notice, then the message box. */
export function ConversationComposer({ agent, thread, working, quickActions }: ConversationComposerProps) {
  const { snapshot, agentsById, setAwaiting } = useBob();
  const activity = snapshot.activity[agent.id];
  const turnSince = activity?.state === "working" ? activity.since : null;
  const [draft, setDraft] = useDraft(snapshot.project.id, agent.id);
  const [submitting, setSubmitting] = useState(false);
  // The error stands for its own chat: it shows only there, until the person closes it or a send succeeds.
  const [failure, setFailure] = useState<{ agentId: string; message: string } | null>(null);
  const error = failure?.agentId === agent.id ? failure.message : null;
  // The turn Stop was pressed for; the button waits for that turn to end.
  const [stoppedTurn, setStoppedTurn] = useState<string | null>(null);
  const stopping = turnSince !== null && stoppedTurn === turnSince;
  const [awaitingDismissed, setAwaitingDismissed] = useState<string | null>(null);
  // While the captain's question is open, a message answers it unless the person marks it a new request.
  const answering = snapshot.answering?.agentId === agent.id ? snapshot.answering : null;
  const [newRequest, setNewRequest] = useState(false);
  const [composerFocusRequest, setComposerFocusRequest] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const mentionAgents = useMemo(() => snapshot.agents.filter((candidate) => !candidate.closedAt), [snapshot.agents]);
  const focusComposer = () => setComposerFocusRequest((current) => current + 1);

  const send = async (text: string, mode?: SendMode) => {
    const message = text.trim();
    if (message === "" || submitting) return false;
    setSubmitting(true);
    setFailure(null);
    // The agent's face and a pending line answer the send at once; the real activity line replaces them.
    setAwaiting(agent.id, { count: thread.items.length, at: Date.now() });
    const result = await sendMessage(agent.id, expandComposerMentions(message), mode, answering !== null && newRequest);
    setSubmitting(false);
    focusComposer();
    if (!result.ok) {
      setAwaiting(agent.id, null);
      setFailure({ agentId: agent.id, message: result.error });
      return false;
    }
    setNewRequest(false);
    return true;
  };

  const submit = async (mode?: SendMode) => {
    if (await send(draft, mode)) setDraft("");
  };

  const stop = async () => {
    setStoppedTurn(turnSince);
    const result = await interruptAgent(agent.id);
    if (!result.ok) {
      setStoppedTurn(null);
      setFailure({ agentId: agent.id, message: result.error });
    }
  };

  const prefill = (text: string) => {
    setDraft(text);
    focusComposer();
  };

  const hasContent = draft.trim() !== "";
  // As in the reference: while the agent works, Enter queues the message for after the turn and Tab
  // steers it into the running turn.
  const steers = working && hasContent && !submitting;

  const items = awaitingItems(thread, agentsById);
  const awaitingKey = items.map((item) => `${item.id}:${item.state}`).join("|");
  // The mention picker takes the room that the waits and the queue use.
  const awaitingVisible = items.length > 0 && awaitingDismissed !== awaitingKey && !pickerOpen;
  const queueVisible = thread.queued > 0 && !pickerOpen;
  const slotOpen = awaitingVisible || queueVisible;
  const label = `Message ${agent.name}`;
  const quote = answering ? answeringQuote(answering) : null;

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
        {quote ? (
          <div className="composer-reply-preview composer-answering">
            <div>
              <span>{newRequest ? "Starts a new request" : `Answering ${agent.name}`}</span>
              <p className="message-reply-quote composer-answering-ask">{newRequest ? `Not an answer to “${quote}”` : quote}</p>
            </div>
            <Button variant="ghost" size="sm" className="composer-answering-toggle" aria-pressed={newRequest} onClick={() => setNewRequest((value) => !value)}>
              New request
            </Button>
          </div>
        ) : null}
        {error ? (
          <ComposerErrorBanner
            message={error}
            onDismiss={() => {
              setFailure(null);
              focusComposer();
            }}
          />
        ) : null}
      </div>
      <div
        className="composer"
        data-compact={draft.includes("\n") ? undefined : ""}
        onPointerDown={(event) => {
          if (!(event.target instanceof Element) || event.target.closest("button, .composer-editor-surface, .ui-action-menu")) return;
          event.preventDefault();
          focusComposer();
        }}
      >
        <div className="composer-input-label">
          <ComposerEditor
            agentId={agent.id}
            agents={mentionAgents}
            value={draft}
            disabled={submitting}
            placeholder={quote && !newRequest ? "Reply…" : label}
            ariaLabel={label}
            focusRequest={composerFocusRequest}
            onValueChange={(text) => setDraft(text)}
            onSubmit={() => void submit()}
            onSteer={steers ? () => void submit("steer") : undefined}
            onPickerOpenChange={setPickerOpen}
          />
        </div>
        <div className="composer-toolbar">
          <ComposerAddMenu open={addMenuOpen} onOpenChange={setAddMenuOpen} disabled={submitting} onClosed={focusComposer} />
          <div className="composer-primary-actions">
            {agent.kind === "captain" ? <CallBob agent={agent} /> : null}
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
                className={cx("voice-button", "composer-send")}
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
