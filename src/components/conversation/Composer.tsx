"use client";

import { ArrowUp, Mic, Square } from "lucide-react";
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { useBob } from "@/components/app/BobContext";
import type { AgentActions } from "@/lib/client/use-agent-actions";
import type { Agent } from "@/lib/types";

interface ComposerProps {
  agent: Agent;
  working: boolean;
  actions: AgentActions;
}

/**
 * Typing into an agent's thread. Enter sends and Shift+Enter breaks the line. While the agent works
 * and the draft is empty, the send button stops it; typing turns it back into send, which queues.
 */
export function Composer({ agent, working, actions }: ComposerProps) {
  const { draftFor, setDraft } = useBob();
  const draft = draftFor(agent.id);
  const field = useRef<HTMLTextAreaElement | null>(null);
  const showStop = working && draft.trim() === "";

  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);

  async function submit(): Promise<void> {
    if (draft.trim() === "" || actions.sending) return;
    const sent = await actions.send(draft);
    if (sent) setDraft(agent.id, "");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  }

  return (
    <div className="composer-wrap">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="sr-only" htmlFor="composer-field">
          Message {agent.name}
        </label>
        <textarea
          id="composer-field"
          ref={field}
          className="composer-field"
          rows={1}
          value={draft}
          placeholder={`Message ${agent.name}`}
          onChange={(event) => {
            setDraft(agent.id, event.target.value);
            if (actions.error) actions.clearError();
          }}
          onKeyDown={onKeyDown}
        />
        <div className="composer-toolbar">
          {actions.error ? (
            <span className="composer-error" role="alert">
              {actions.error}
            </span>
          ) : (
            <span />
          )}
          <div className="composer-buttons">
            <button type="button" className="round-button round-button-soft" disabled title="Voice comes next" aria-label="Voice comes next">
              <Mic className="icon" size={16} aria-hidden="true" />
            </button>
            {showStop ? (
              <button
                type="button"
                className="round-button round-button-solid"
                aria-label={`Stop ${agent.name}`}
                title="Stop"
                disabled={actions.stopping}
                onClick={() => void actions.stop()}
              >
                <Square className="icon stop-glyph" size={12} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                className="round-button round-button-solid"
                aria-label="Send"
                title={working ? "Send, it runs after the current turn" : "Send"}
                disabled={draft.trim() === "" || actions.sending}
              >
                {actions.sending ? <span className="send-spinner" aria-hidden="true" /> : <ArrowUp className="icon" size={16} aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
