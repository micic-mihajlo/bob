"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { reportView } from "@/lib/client/report-view";
import { AgentMessageText } from "./AgentMessageText";
import { CodeBlock } from "./CodeBlock";
import { ComparisonTable } from "./ComparisonTable";
import { CheckIcon, CopyIcon } from "./ConversationIcons";
import { DataTable, type MessageContentBlock, messageContentBlocks } from "./DataTable";
import { MarkdownInlineText, MarkdownMessageText } from "./MarkdownMessageText";
import { prefersReducedMotion, useSmoothHeightResize } from "./smoothHeightResize";
import { nextStreamingReveal, type StreamingRevealChunk, StreamingRevealContext, streamingTrailReach } from "./streamingReveal";

/** A message of the chat, as much as the body and its actions read. */
export interface ChatMessage {
  id: string;
  author: "you" | "agent";
  body: string;
  /** Still being written by the model. */
  streaming?: boolean | undefined;
}

export type BubbleVariant = "secondary" | "muted" | "ghost";

let lastContentBlocks: { body: string; streaming: boolean; blocks: MessageContentBlock[] } | undefined;

/**
 * The content blocks of a body. The bubble variant and the message body both split the same body
 * for each streamed step, so the last result is kept. Callers do not change the result.
 */
function sharedContentBlocks(body: string, streaming: boolean): MessageContentBlock[] {
  if (lastContentBlocks?.body !== body || lastContentBlocks.streaming !== streaming) {
    lastContentBlocks = { body, streaming, blocks: messageContentBlocks(body, streaming) };
  }
  return lastContentBlocks.blocks;
}

export function conversationBubbleVariant(message: ChatMessage): BubbleVariant {
  if (message.author === "you") return "secondary";
  const contentBlocks = sharedContentBlocks(message.body, message.streaming === true);
  if (contentBlocks.some((block) => block.type === "table" || block.type === "comparison-table")) return "muted";
  return contentBlocks.some((block) => block.type !== "text") ? "ghost" : "muted";
}

function cssDurationMs(style: CSSStyleDeclaration, property: string, fallback: number): number {
  const value = style.getPropertyValue(property).trim();
  if (!value) return fallback;
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return fallback;
  return value.endsWith("s") && !value.endsWith("ms") ? amount * 1000 : amount;
}

/* Read once per message: the tokens do not change while it streams, and reading computed style
   on each step forces the browser to recalculate style. */
function streamingTimings() {
  const style = getComputedStyle(document.documentElement);
  return {
    stepMs: Math.max(16, cssDurationMs(style, "--stream-gap", 40)),
    fadeMs: cssDurationMs(style, "--stream-fade", 300),
    catchUpMs: cssDurationMs(style, "--stream-catch-up", 400),
  };
}

interface StreamingState {
  targetBody: string;
  targetStreaming: boolean;
  shownId: string;
  shownBody: string;
  smoothingActive: boolean;
  smoothingSettled: boolean;
  timings: ReturnType<typeof streamingTimings> | undefined;
  revealBudget: number;
  revealTimer: number | undefined;
  smoothHeightTimer: number | undefined;
}

function useStreamingBody(message: ChatMessage, animate?: boolean) {
  const [initial] = useState(() => {
    const animateInitialText = message.author === "agent" && animate === true && !prefersReducedMotion();
    const targetStreaming = message.author === "agent" && message.streaming === true;
    const smoothingActive = targetStreaming || animateInitialText;
    return {
      targetBody: message.body,
      targetStreaming,
      shownId: message.id,
      /* A plain copy of `body`, because the state can still hold its earlier value until the next render. */
      shownBody: animateInitialText ? "" : message.body,
      smoothingActive,
      /* True when the height smoothing, tail and trail are all off and no timer will change them. */
      smoothingSettled: !smoothingActive,
      timings: undefined,
      revealBudget: 0,
      revealTimer: undefined,
      smoothHeightTimer: undefined,
    } satisfies StreamingState as StreamingState;
  });
  const state = useRef<StreamingState>(initial);
  const [buffer, setBuffer] = useState({ id: initial.shownId, text: initial.shownBody });
  const [trail, setTrail] = useState<StreamingRevealChunk[]>([]);
  const [animateTail, setAnimateTail] = useState(false);
  const [smoothHeight, setSmoothHeight] = useState(initial.smoothingActive);
  const streaming = message.author === "agent" && message.streaming === true;

  useEffect(() => {
    const s = state.current;
    const timing = () => {
      s.timings ??= streamingTimings();
      return s.timings;
    };
    const showBody = (next: string) => {
      s.shownBody = next;
      setBuffer({ id: s.shownId, text: next });
    };
    const clearRevealTimer = () => {
      if (s.revealTimer === undefined) return;
      window.clearTimeout(s.revealTimer);
      s.revealTimer = undefined;
    };
    const keepHeightSmoothingActive = () => {
      if (s.smoothHeightTimer !== undefined) window.clearTimeout(s.smoothHeightTimer);
      s.smoothHeightTimer = undefined;
      s.smoothingSettled = false;
      setSmoothHeight(true);
    };
    const settleHeightSmoothing = () => {
      /* Each row that mounts comes here. When nothing animated, there is nothing to settle, and
         reading the timing tokens would force a style recalculation per row. */
      if (s.smoothingSettled) return;
      if (s.smoothHeightTimer !== undefined) window.clearTimeout(s.smoothHeightTimer);
      s.smoothHeightTimer = window.setTimeout(
        () => {
          s.smoothHeightTimer = undefined;
          s.smoothingSettled = true;
          setSmoothHeight(false);
          setAnimateTail(false);
          setTrail([]);
        },
        Math.max(timing().stepMs * 2, timing().fadeMs),
      );
    };
    const revealStep = () => {
      const { stepMs, fadeMs, catchUpMs } = timing();
      const step = nextStreamingReveal({
        shownLength: s.shownBody.length,
        target: s.targetBody,
        streaming: s.targetStreaming,
        budget: s.revealBudget,
        stepMs,
        catchUpMs,
      });
      s.revealBudget = step.budget;
      if (step.length <= s.shownBody.length) return false;
      const now = performance.now();
      const length = step.length - s.shownBody.length;
      setTrail((steps) => [...steps.filter((chunk) => now - chunk.revealedAt < fadeMs), { length, revealedAt: now }]);
      s.smoothingSettled = false;
      setAnimateTail(true);
      showBody(s.targetBody.slice(0, step.length));
      return true;
    };
    const scheduleReveal = () => {
      if (s.revealTimer !== undefined) return;
      s.revealTimer = window.setTimeout(() => {
        s.revealTimer = undefined;
        const advanced = revealStep();
        if (s.shownBody !== s.targetBody) {
          // With no step and no debt, the last word is still incomplete: the next body restarts this.
          if (advanced || s.revealBudget < 0) scheduleReveal();
        } else if (!s.targetStreaming) {
          s.smoothingActive = false;
          settleHeightSmoothing();
        }
      }, timing().stepMs);
    };

    const replaced = message.id !== s.shownId;
    s.shownId = message.id;
    s.targetBody = message.body;
    s.targetStreaming = streaming;
    if (streaming) {
      s.smoothingActive = true;
      keepHeightSmoothingActive();
    }
    if (replaced || prefersReducedMotion() || !message.body.startsWith(s.shownBody) || (!streaming && !s.smoothingActive)) {
      clearRevealTimer();
      s.revealBudget = 0;
      setAnimateTail(false);
      setTrail([]);
      if (s.shownBody !== message.body || replaced) showBody(message.body);
      s.smoothingActive = false;
      settleHeightSmoothing();
      return;
    }
    if (s.shownBody !== message.body) {
      scheduleReveal();
    } else if (!streaming) {
      s.smoothingActive = false;
      settleHeightSmoothing();
    }
  }, [message.id, message.body, streaming]);

  useEffect(() => {
    const s = state.current;
    return () => {
      if (s.revealTimer !== undefined) window.clearTimeout(s.revealTimer);
      if (s.smoothHeightTimer !== undefined) window.clearTimeout(s.smoothHeightTimer);
      s.revealTimer = undefined;
    };
  }, []);

  /* The effect above runs after the render. Until it does, a buffer of another message, or one
     that is not the start of the body, shows the body. */
  const body = buffer.id === message.id && message.body.startsWith(buffer.text) ? buffer.text : message.body;
  const revealing = message.streaming === true || body !== message.body;
  return { animateTail, body, smoothHeight, revealing, trail };
}

/**
 * The characters of the body after each text block that the fading steps reach. The search for a
 * block starts after the previous one, and a code block can hold the same text, so an offset can
 * only be too large: that shows words without a fade instead of fading shown words again.
 */
function textBlockTailOffsets(body: string, blocks: readonly MessageContentBlock[], reach: number) {
  let cursor = 0;
  return blocks.map((block) => {
    if (block.type !== "text") return undefined;
    const start = body.indexOf(block.text, cursor);
    if (start < 0) return undefined;
    cursor = start + block.text.length;
    const after = body.length - cursor;
    return after < reach ? after : undefined;
  });
}

const renderMarkdownInline = (body: string) => <MarkdownInlineText body={body} />;

export function MessageBody(props: { animate?: boolean | undefined; message: ChatMessage }) {
  const streamingBody = useStreamingBody(props.message, props.animate);
  const streamedBody = streamingBody.body;
  const agent = props.message.author === "agent";
  const report = agent && !streamingBody.revealing ? reportView(props.message.body) : null;
  const blocks = useMemo<MessageContentBlock[]>(
    () => (agent ? sharedContentBlocks(streamedBody, streamingBody.revealing) : [{ type: "text", text: props.message.body }]),
    [agent, streamedBody, streamingBody.revealing, props.message.body],
  );
  const tailOffsets = streamingBody.animateTail ? textBlockTailOffsets(streamedBody, blocks, streamingTrailReach(streamingBody.trail)) : [];
  const messageContentResize = useRef<HTMLDivElement>(null);
  const messageContent = useRef<HTMLDivElement>(null);
  useSmoothHeightResize({ container: messageContentResize, content: messageContent, enabled: agent && streamingBody.smoothHeight });
  const selectionId = props.message.streaming !== true ? props.message.id : undefined;

  return (
    <div className="message-content-resize" ref={messageContentResize}>
      <div className="message-content-blocks" ref={messageContent}>
        <StreamingRevealContext value={streamingBody.trail}>
          {(agent ? streamedBody : props.message.body) ? (
            report ? (
              <div className="message-copy message-markdown" data-selection-message-id={selectionId}>
                <AgentMessageText text={props.message.body} />
              </div>
            ) : (
              blocks.map((block, index) => {
                const streaming = streamingBody.revealing && index === blocks.length - 1;
                if (block.type === "comparison-table") return <ComparisonTable key={index} table={block} renderCell={renderMarkdownInline} />;
                if (block.type === "table") return <DataTable key={index} table={block} renderCell={renderMarkdownInline} />;
                if (block.type === "code")
                  return (
                    // The id lets the selection actions open for text selected in the code.
                    <div key={index} data-selection-message-id={selectionId}>
                      <CodeBlock block={block} streaming={streaming} />
                    </div>
                  );
                return (
                  <div
                    key={index}
                    className={cx("message-copy message-markdown", streamingBody.animateTail && "t-stream")}
                    data-selection-message-id={selectionId}
                  >
                    <MarkdownMessageText body={block.text} streaming={streaming} streamingTailAfter={tailOffsets[index]} />
                  </div>
                );
              })
            )
          ) : null}
        </StreamingRevealContext>
      </div>
    </div>
  );
}

export function MessageActions(props: {
  message: ChatMessage;
  /** Names the toolbar for a screen reader. */
  authorName?: string | undefined;
  copied: boolean;
  onCopy: () => void;
}) {
  const authorName = props.authorName ?? "Agent";
  return (
    <div className="message-actions" role="toolbar" aria-label={props.message.author === "you" ? "User message actions" : `${authorName} message actions`}>
      <Button variant="ghost" type="button" className="message-action-button" aria-label={props.copied ? "Copied" : "Copy"} onClick={props.onCopy}>
        {props.copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}
