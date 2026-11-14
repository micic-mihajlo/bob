"use client";

import { Mic } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { formatChatTimestamp } from "@/lib/client/chat-time";
import { CopyGlyph } from "./conversation-icons";
import { MarkdownMessageText } from "./MarkdownMessageText";

export interface ChatMessageRowProps {
  id: string;
  author: "user" | "agent";
  /** The agent's name, for an agent message. */
  name?: string;
  text: string;
  at: string;
  animate?: boolean;
  /** Said in a call: the text is the transcript. */
  voice?: boolean;
  /** Still being written by the model: no actions or time until the real message lands. */
  streaming?: boolean;
}

/** One message of the chat: the person's bubble at the end, the agent's at the start. */
export function ChatMessageRow({ id, author, name, text, at, animate = false, voice = false, streaming = false }: ChatMessageRowProps) {
  const user = author === "user";
  const [copyFailed, setCopyFailed] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(
      () => setCopyFailed(false),
      () => setCopyFailed(true),
    );
  };
  return (
    <div
      role="article"
      data-slot="message"
      data-align={user ? "end" : "start"}
      aria-label={`Message from ${user ? "You" : (name ?? "Agent")}`}
      data-author={user ? "user" : "assistant"}
      data-chat-search-message={id}
      data-streaming={streaming ? "true" : undefined}
      aria-busy={streaming ? "true" : undefined}
      className={cx("ui-message message-entry", user ? "message-entry-user" : "message-entry-agent", animate && "message-entry-animated")}
    >
      <div data-slot="message-content" className="ui-message-content">
        <div className="message-shell">
          <div
            data-slot="bubble"
            data-variant={user ? "secondary" : "muted"}
            data-align={user ? "end" : "start"}
            className={cx("ui-bubble", user ? "ui-bubble-variant-secondary" : "ui-bubble-variant-muted")}
            data-author={user ? "user" : "assistant"}
          >
            <div data-slot="bubble-content" className="ui-bubble-content">
              <div className="message-content-resize">
                <div className="message-content-blocks">
                  <div className="message-copy message-markdown" data-selection-message-id={id}>
                    <MarkdownMessageText text={text} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {streaming ? null : (
          <div className="message-action-row">
            <div className="message-actions" role="toolbar" aria-label={user ? "User message actions" : `${name ?? "Agent"} message actions`}>
              <Button variant="ghost" className="message-action-button" aria-label={copyFailed ? "Could not copy the message." : "Copy"} onClick={copy}>
                <CopyGlyph />
              </Button>
            </div>
            {voice ? (
              <span className="message-voice-mark" title="Said in a call">
                <Mic aria-hidden="true" />
                voice
              </span>
            ) : null}
            <time className="message-time" dateTime={at}>
              {formatChatTimestamp(at)}
            </time>
          </div>
        )}
      </div>
    </div>
  );
}
