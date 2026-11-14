"use client";

import { Fragment, type ReactNode, useLayoutEffect, useMemo, useRef } from "react";
import { LinkIcon } from "./ConversationIcons";
import { splitStreamingTrail, streamingTailOffsets, streamingTrailReach, useStreamingReveal } from "./streamingReveal";

export interface RichMessageTextProps {
  body: string;
  onOpenLink: (url: string) => void;
  /** The characters of a streaming body after this text. It fades the words revealed last. */
  streamingTailAfter?: number | undefined;
  /**
   * False shows only the link icon, so that no linked site is asked for its favicon. Use it for
   * text that another person wrote, such as the instructions of a shared agent.
   */
  linkFavicons?: boolean | undefined;
}

/** Opens a link of a message in a new tab, the browser's nearest form of the reference's external open. */
export function openMessageLink(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function RichMessageText(props: RichMessageTextProps) {
  const parts = useMemo(() => linkedMessageParts(props.body), [props.body]);
  const trail = useStreamingReveal();
  const reach = streamingTrailReach(trail ?? []);
  const lengths = parts.map((part) => (part.url ? Number.POSITIVE_INFINITY : part.text.length));
  const tailAfter = streamingTailOffsets(lengths, props.streamingTailAfter, reach);

  return (
    <>
      {parts.map((part, index) => {
        if (part.url) {
          return (
            <MessageLink key={index} url={part.url} title={linkTitle(part.text, part.url)} favicon={props.linkFavicons !== false} onOpenLink={props.onOpenLink}>
              {part.text}
            </MessageLink>
          );
        }
        const after = tailAfter[index];
        return after !== undefined ? <StreamingTailText key={index} body={part.text} after={after} /> : <Fragment key={index}>{part.text}</Fragment>;
      })}
    </>
  );
}

function StreamingTailText(props: { body: string; after: number }) {
  const trail = useStreamingReveal();
  const parts = splitStreamingTrail(props.body, trail ?? [], props.after);

  return (
    <>
      {parts.prefix}
      {parts.chunks.map((chunk) => (
        <StreamingChunk key={chunk.revealedAt} text={chunk.text} revealedAt={chunk.revealedAt} />
      ))}
    </>
  );
}

/* A block that holds the tail can mount again on a step. A delay of minus the step's age
   continues its fade where it was, instead of starting it again. */
function StreamingChunk(props: { text: string; revealedAt: number }) {
  const span = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (span.current) span.current.style.animationDelay = `${Math.min(0, props.revealedAt - performance.now())}ms`;
  }, [props.revealedAt]);
  return (
    <span ref={span} className="t-stream-w">
      {props.text}
    </span>
  );
}

export function MessageLink(props: {
  url: string;
  /** The native tooltip. Omit it when the link text already shows the URL. */
  title?: string | undefined;
  children: ReactNode;
  /** False keeps the request for the linked site's favicon from being made. */
  favicon?: boolean;
  onOpenLink: (url: string) => void;
}) {
  return (
    <a
      className="message-link"
      href={props.url}
      data-cuelume-navigate=""
      data-cuelume-emphasis="subtle"
      title={props.title}
      onClick={(event) => {
        event.preventDefault();
        props.onOpenLink(props.url);
      }}
    >
      <span className="message-link-icon" aria-hidden="true">
        <LinkIcon />
        {props.favicon !== false ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={faviconUrl(props.url)}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={(event) => event.currentTarget.remove()}
          />
        ) : null}
      </span>
      {props.children}
    </a>
  );
}

interface RichMessagePart {
  text: string;
  url?: string;
}

function linkedMessageParts(body: string): RichMessagePart[] {
  const expression = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+)/giu;
  const parts: RichMessagePart[] = [];
  let cursor = 0;
  for (const match of body.matchAll(expression)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ text: body.slice(cursor, index) });
    const markdownUrl = match[2];
    const rawUrl = match[3];
    const rawLink = markdownUrl ?? rawUrl ?? "";
    const cleanLink = rawLink.replace(/[.,!?;:]+$/u, "");
    const url = safeBrowserUrl(cleanLink);
    if (!url) {
      parts.push({ text: match[0] });
    } else {
      parts.push({ text: match[1] ?? cleanLink, url });
      const trailingText = rawLink.slice(cleanLink.length);
      if (trailingText) parts.push({ text: trailingText });
    }
    cursor = index + match[0].length;
  }
  if (cursor < body.length) parts.push({ text: body.slice(cursor) });
  return parts.length > 0 ? parts : [{ text: body }];
}

/** The URL as a tooltip, unless the link text is already that URL. */
export function linkTitle(text: string, url: string): string | undefined {
  return text === url || `${text}/` === url ? undefined : url;
}

export function safeBrowserUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function faviconUrl(value: string): string {
  return `${new URL(value).origin}/favicon.ico`;
}
