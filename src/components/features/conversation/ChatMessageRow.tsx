"use client";

import { Mic } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui/classes";
import { formatChatTimestamp } from "@/lib/client/chat-time";
import { type ChatMessage, conversationBubbleVariant, MessageActions, MessageBody } from "./MessageRendering";

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
  /** Still being written by the model. */
  streaming?: boolean;
  /** The open question the person is answering: drawn as a speech bubble in the print themes. */
  asking?: boolean;
  /** Whether the time stands under the bubble. A row that continues a run by the same sender draws none. */
  showTime?: boolean;
}

/**
 * One message of a chat: the alignment, the bubble, the action row under the bubble. The agent
 * chat never shows a face or a name: one chat has one agent, and its name is in the header.
 */
export function ChatMessageRow({
  id,
  author,
  name,
  text,
  at,
  animate = false,
  voice = false,
  streaming = false,
  asking = false,
  showTime = true,
}: ChatMessageRowProps) {
  const person = author === "user";
  const authorName = person ? "You" : (name ?? "Agent");
  const message = useMemo<ChatMessage>(() => ({ id, author: person ? "you" : "agent", body: text, streaming }), [id, person, text, streaming]);
  const variant = conversationBubbleVariant(message);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const timer = copiedTimer;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(false), 1_500);
      },
      () => setCopied(false),
    );
  };
  return (
    <div
      role="article"
      data-slot="message"
      data-align={person ? "end" : "start"}
      aria-label={`Message from ${authorName}`}
      data-author={person ? "user" : "assistant"}
      data-chat-search-message={id}
      data-asking={asking ? "true" : undefined}
      className={cx("ui-message message-entry", animate && "message-entry-animated", person ? "message-entry-user" : "message-entry-agent")}
    >
      <div data-slot="message-content" className="ui-message-content">
        <div className="message-shell">
          <div
            data-slot="bubble"
            data-variant={variant}
            data-align={person ? "end" : "start"}
            className={cx("ui-bubble", `ui-bubble-variant-${variant}`)}
            data-author={person ? "user" : "assistant"}
            data-streaming={streaming ? "" : undefined}
          >
            <div data-slot="bubble-content" className="ui-bubble-content">
              <MessageBody animate={animate} message={message} />
            </div>
          </div>
        </div>
        {/* The actions and the time stand under the bubble. */}
        <div className="message-action-row">
          <MessageActions message={message} authorName={person ? undefined : authorName} copied={copied} onCopy={copy} />
          {voice ? (
            <span className="message-voice-mark" title="Said in a call">
              <Mic aria-hidden="true" />
              voice
            </span>
          ) : null}
          {showTime ? (
            <time className="message-time" dateTime={at}>
              {formatChatTimestamp(at)}
            </time>
          ) : null}
        </div>
      </div>
    </div>
  );
}
