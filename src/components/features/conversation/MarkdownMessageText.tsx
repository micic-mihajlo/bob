"use client";

import { Marked, type Token, type Tokens, type TokensList } from "marked";
import { createElement, Fragment, type CSSProperties, type ReactNode, useMemo } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { CodeBlock } from "./CodeBlock";
import type { MessageCodeBlock } from "./DataTable";
import { linkTitle, MessageLink, openMessageLink, RichMessageText, safeBrowserUrl } from "./RichMessageText";
import { streamingTailInside, streamingTailOffsets, streamingTrailReach, useStreamingReveal } from "./streamingReveal";

export interface MarkdownMessageTextProps {
  body: string;
  onOpenLink?: ((url: string) => void) | undefined;
  streaming?: boolean;
  /** The characters of a streaming body after this text. It fades the words revealed last. */
  streamingTailAfter?: number | undefined;
  imagesAsLinks?: boolean | undefined;
  /**
   * A short preview, such as a reply quote: only the first blocks, and each code fence as plain
   * text, with no highlight or toolbar.
   */
  excerpt?: boolean | undefined;
  linkFavicons?: boolean | undefined;
}

interface MarkdownContentProps {
  imagesAsLinks?: boolean | undefined;
  excerpt?: boolean | undefined;
  onOpenLink: (url: string) => void;
  linkFavicons?: boolean | undefined;
}

interface MarkdownTokenByType {
  heading: Tokens.Heading;
  paragraph: Tokens.Paragraph;
  blockquote: Tokens.Blockquote;
  list: Tokens.List;
  code: Tokens.Code;
  table: Tokens.Table;
  text: Tokens.Text;
  strong: Tokens.Strong;
  em: Tokens.Em;
  del: Tokens.Del;
  codespan: Tokens.Codespan;
  link: Tokens.Link;
  image: Tokens.Image;
  escape: Tokens.Escape;
}

const markdown = new Marked({ gfm: true, breaks: true });

/** A reply quote shows four lines, and each block takes at least one. */
const EXCERPT_BLOCK_LIMIT = 4;

function tokenIs<K extends keyof MarkdownTokenByType>(token: Token, type: K): token is MarkdownTokenByType[K] {
  return token.type === type;
}

function headingLevel(depth: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (depth <= 1) return 1;
  if (depth === 2) return 2;
  if (depth === 3) return 3;
  if (depth === 4) return 4;
  if (depth === 5) return 5;
  return 6;
}

// Lexed tokens are shared across re-renders of identical bodies. Cap the size so a long session
// cannot grow this without bound.
const LEXER_CACHE_LIMIT = 200;
const lexerCache = new Map<string, TokensList>();
const inlineLexerCache = new Map<string, Token[]>();

function lexBlockTokens(body: string, cache: boolean): TokensList {
  if (!cache) return markdown.lexer(body);
  const cached = lexerCache.get(body);
  if (cached) return cached;
  const tokens = markdown.lexer(body);
  if (lexerCache.size >= LEXER_CACHE_LIMIT) {
    const oldest = lexerCache.keys().next();
    if (!oldest.done) lexerCache.delete(oldest.value);
  }
  lexerCache.set(body, tokens);
  return tokens;
}

function lexInlineTokens(body: string): Token[] {
  const cached = inlineLexerCache.get(body);
  if (cached) return cached;
  const tokens = markdown.Lexer.lexInline(body, markdown.defaults);
  if (inlineLexerCache.size >= LEXER_CACHE_LIMIT) {
    const oldest = inlineLexerCache.keys().next();
    if (!oldest.done) inlineLexerCache.delete(oldest.value);
  }
  inlineLexerCache.set(body, tokens);
  return tokens;
}

export function MarkdownMessageText(props: MarkdownMessageTextProps) {
  // A streaming reply passes each growing prefix here. Caching those would retain obsolete token
  // trees and evict completed messages, so only a settled body enters the shared cache.
  const tokens = useMemo(() => lexBlockTokens(props.body, props.streaming !== true), [props.body, props.streaming]);
  // An excerpt shows only a few lines, so it renders only the blocks that can fill them.
  const shownTokens = props.excerpt === true ? tokens.filter((token) => token.type !== "space").slice(0, EXCERPT_BLOCK_LIMIT) : tokens;
  const content: MarkdownContentProps = {
    imagesAsLinks: props.imagesAsLinks,
    excerpt: props.excerpt,
    onOpenLink: props.onOpenLink ?? openMessageLink,
    linkFavicons: props.linkFavicons,
  };

  return <MarkdownBlocks tokens={shownTokens} content={content} streaming={props.streaming} streamingTailAfter={props.streamingTailAfter} />;
}

export function MarkdownInlineText(props: Pick<MarkdownMessageTextProps, "body" | "onOpenLink" | "imagesAsLinks" | "linkFavicons">) {
  const tokens = lexInlineTokens(props.body);
  const content: MarkdownContentProps = {
    imagesAsLinks: props.imagesAsLinks,
    onOpenLink: props.onOpenLink ?? openMessageLink,
    linkFavicons: props.linkFavicons,
  };
  return <MarkdownInline tokens={tokens} content={content} />;
}

/**
 * The characters of the streaming body after each token, so each text node fades the words
 * revealed in it.
 */
function useTailOffsets(tokens: readonly { raw: string }[], after: number | undefined) {
  const trail = useStreamingReveal();
  return streamingTailOffsets(
    tokens.map((token) => token.raw.length),
    after,
    streamingTrailReach(trail ?? []),
  );
}

/** The characters after the children of `token`, from the characters after `token`. */
function tailInside(token: Token, children: readonly Token[] | undefined, after: number | undefined) {
  return children ? streamingTailInside(token.raw, children, after) : after;
}

function MarkdownBlocks(props: { tokens: Token[]; content: MarkdownContentProps; streaming?: boolean | undefined; streamingTailAfter?: number | undefined }) {
  const tailAfter = useTailOffsets(props.tokens, props.streamingTailAfter);
  const streamingTokenIndex = activeStreamingBlockTokenIndex(props.tokens);
  return (
    <>
      {props.tokens.map((token, index) => (
        <MarkdownBlock
          key={index}
          token={token}
          content={props.content}
          streaming={props.streaming === true && index === streamingTokenIndex}
          streamingTailAfter={tailAfter[index]}
        />
      ))}
    </>
  );
}

function MarkdownBlock(props: { token: Token; content: MarkdownContentProps; streaming?: boolean; streamingTailAfter?: number | undefined }): ReactNode {
  const token = props.token;
  switch (token.type) {
    case "space":
    case "def":
      return null;
    case "heading": {
      if (!tokenIs(token, "heading")) return token.raw;
      const level = headingLevel(token.depth);
      return createElement(
        `h${level}`,
        { className: "message-markdown-heading", "data-level": level },
        <MarkdownInline
          tokens={token.tokens}
          content={props.content}
          streaming={props.streaming}
          streamingTailAfter={tailInside(token, token.tokens, props.streamingTailAfter)}
        />,
      );
    }
    case "paragraph": {
      if (!tokenIs(token, "paragraph")) return token.raw;
      return (
        <p>
          <MarkdownInline
            tokens={token.tokens}
            content={props.content}
            streaming={props.streaming}
            streamingTailAfter={tailInside(token, token.tokens, props.streamingTailAfter)}
          />
        </p>
      );
    }
    case "blockquote": {
      if (!tokenIs(token, "blockquote")) return token.raw;
      return (
        <blockquote>
          <MarkdownBlocks
            tokens={token.tokens}
            content={props.content}
            streaming={props.streaming === true && !containerClosesFinalNestedTable(token)}
            streamingTailAfter={tailInside(token, token.tokens, props.streamingTailAfter)}
          />
        </blockquote>
      );
    }
    case "list": {
      if (!tokenIs(token, "list")) return token.raw;
      return (
        <MarkdownList
          token={token}
          content={props.content}
          streaming={props.streaming === true && !containerClosesFinalNestedTable(token)}
          streamingTailAfter={props.streamingTailAfter}
        />
      );
    }
    case "code": {
      if (!tokenIs(token, "code")) return token.raw;
      if (props.content.excerpt)
        return (
          <pre className="message-markdown-excerpt-code">
            <code>{token.text}</code>
          </pre>
        );
      const language = token.lang?.trim().split(/\s+/u)[0] ?? "";
      const block: MessageCodeBlock = { type: "code", code: token.text, language };
      return <CodeBlock block={block} streaming={props.streaming === true} />;
    }
    case "table": {
      if (!tokenIs(token, "table")) return token.raw;
      return <MarkdownTable token={token} content={props.content} streaming={props.streaming} />;
    }
    case "hr":
      return <hr />;
    case "html":
      return <span className="message-markdown-raw-html">{token.raw}</span>;
    case "text": {
      if (!tokenIs(token, "text")) return token.raw;
      return token.tokens ? (
        <MarkdownInline
          tokens={token.tokens}
          content={props.content}
          streaming={props.streaming}
          streamingTailAfter={tailInside(token, token.tokens, props.streamingTailAfter)}
        />
      ) : (
        <RichText body={token.text} content={props.content} streaming={props.streaming} streamingTailAfter={props.streamingTailAfter} />
      );
    }
    default:
      return <RichText body={token.raw} content={props.content} streaming={props.streaming} streamingTailAfter={props.streamingTailAfter} />;
  }
}

function MarkdownList(props: { token: Tokens.List; content: MarkdownContentProps; streaming?: boolean; streamingTailAfter?: number | undefined }) {
  const items = props.token.items;
  const tailAfter = useTailOffsets(items, streamingTailInside(props.token.raw, items, props.streamingTailAfter));
  const list = items.map((item, index) => {
    const children = item.tokens.filter((child) => child.type !== "checkbox");
    return (
      <li key={index} className={item.task ? "message-markdown-task" : undefined}>
        {item.task ? <Checkbox className="message-markdown-checkbox" checked={item.checked === true} disabled readOnly aria-label={item.text} /> : null}
        <MarkdownBlocks
          tokens={children}
          content={props.content}
          streaming={props.streaming === true && index === items.length - 1}
          streamingTailAfter={tailInside(item, children, tailAfter[index])}
        />
      </li>
    );
  });

  return props.token.ordered ? <ol start={props.token.start === "" ? undefined : props.token.start}>{list}</ol> : <ul>{list}</ul>;
}

function MarkdownTable(props: { token: Tokens.Table; content: MarkdownContentProps; streaming?: boolean | undefined }) {
  const headers = props.token.header;
  const rows = props.token.rows;
  const streamingCellIndex = props.streaming === true ? activeStreamingTableCellIndex(props.token) : -1;
  return (
    <section className="message-markdown-table-scroll" aria-label="Data table" tabIndex={0}>
      <table className="message-markdown-table" style={{ "--message-markdown-table-columns": headers.length } as CSSProperties}>
        <thead>
          <tr>
            {headers.map((cell, index) => (
              <th key={index} scope="col" data-align={cell.align ?? "left"}>
                <MarkdownInline tokens={cell.tokens} content={props.content} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} data-align={cell.align ?? "left"}>
                  <MarkdownInline tokens={cell.tokens} content={props.content} streaming={rowIndex === rows.length - 1 && cellIndex === streamingCellIndex} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function MarkdownInline(props: { tokens: Token[]; content: MarkdownContentProps; streaming?: boolean | undefined; streamingTailAfter?: number | undefined }) {
  const tokens = props.tokens;
  const tailAfter = useTailOffsets(tokens, props.streamingTailAfter);
  const markerTokenIndexes = props.streaming === true ? incompleteEmphasisMarkerTokenIndexes(tokens) : new Set<number>();
  return (
    <>
      {tokens.map((token, index) => (
        <Fragment key={index}>{inlineToken(token, props.content, tailAfter[index], markerTokenIndexes.has(index))}</Fragment>
      ))}
    </>
  );
}

function inlineToken(token: Token, content: MarkdownContentProps, after: number | undefined, streaming: boolean): ReactNode {
  switch (token.type) {
    case "strong":
      if (!tokenIs(token, "strong")) return token.raw;
      return (
        <strong>
          <MarkdownInline tokens={token.tokens} content={content} streamingTailAfter={tailInside(token, token.tokens, after)} />
        </strong>
      );
    case "em":
      if (!tokenIs(token, "em")) return token.raw;
      return (
        <em>
          <MarkdownInline tokens={token.tokens} content={content} streamingTailAfter={tailInside(token, token.tokens, after)} />
        </em>
      );
    case "del":
      if (!tokenIs(token, "del")) return token.raw;
      return (
        <del>
          <MarkdownInline tokens={token.tokens} content={content} streamingTailAfter={tailInside(token, token.tokens, after)} />
        </del>
      );
    case "codespan":
      if (!tokenIs(token, "codespan")) return token.raw;
      return <code>{token.text}</code>;
    case "br":
      return <br />;
    case "link": {
      if (!tokenIs(token, "link")) return token.raw;
      const url = safeBrowserUrl(token.href);
      return url ? (
        <MessageLink url={url} title={token.title || linkTitle(token.text, url)} favicon={content.linkFavicons !== false} onOpenLink={content.onOpenLink}>
          {token.text === token.href ? (
            token.text
          ) : (
            <MarkdownInline tokens={token.tokens} content={content} streamingTailAfter={tailInside(token, token.tokens, after)} />
          )}
        </MessageLink>
      ) : (
        <RichText body={token.text} content={content} streamingTailAfter={after} />
      );
    }
    case "image": {
      if (!tokenIs(token, "image")) return token.raw;
      const url = safeBrowserUrl(token.href);
      if (url && content.imagesAsLinks) {
        return (
          <MessageLink url={url} title={url} favicon={content.linkFavicons !== false} onOpenLink={content.onOpenLink}>
            {token.text || "View image"}
          </MessageLink>
        );
      }
      if (!url) return <RichText body={token.text || token.raw} content={content} streamingTailAfter={after} />;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="message-markdown-image"
          src={url}
          alt={token.text}
          title={token.title ?? undefined}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      );
    }
    case "html":
      return token.raw;
    case "escape":
      if (!tokenIs(token, "escape")) return token.raw;
      return <RichText body={token.text} content={content} streamingTailAfter={after} />;
    case "text":
      if (!tokenIs(token, "text")) return token.raw;
      return token.tokens ? (
        <MarkdownInline tokens={token.tokens} content={content} streaming={streaming} streamingTailAfter={tailInside(token, token.tokens, after)} />
      ) : (
        <RichText body={token.text} content={content} streaming={streaming} streamingTailAfter={after} />
      );
    case "checkbox":
      return null;
    default:
      return <RichText body={token.raw} content={content} streamingTailAfter={after} />;
  }
}

function RichText(props: { body: string; content: MarkdownContentProps; streaming?: boolean | undefined; streamingTailAfter?: number | undefined }) {
  return (
    <RichMessageText
      body={props.streaming ? hideIncompleteEmphasisMarker(props.body) : props.body}
      onOpenLink={props.content.onOpenLink}
      linkFavicons={props.content.linkFavicons}
      streamingTailAfter={props.streamingTailAfter}
    />
  );
}

function hideIncompleteEmphasisMarker(body: string): string {
  const characters = [...body];
  const markers = incompleteEmphasisMarkers(characters);
  for (const marker of markers.reverse()) characters.splice(marker.index, marker.length);
  return characters.join("");
}

function incompleteEmphasisMarkerTokenIndexes(tokens: Token[]): Set<number> {
  const characters: string[] = [];
  const owners: number[] = [];
  for (const [tokenIndex, token] of tokens.entries()) {
    for (const character of [...token.raw]) {
      characters.push(character);
      owners.push(token.type === "text" ? tokenIndex : -1);
    }
  }
  const markers = incompleteEmphasisMarkers(characters, (start, end) => owners[start] !== -1 && owners[start] === owners[end - 1]);
  return new Set(markers.map((marker) => owners[marker.index]).filter((owner): owner is number => owner !== undefined && owner !== -1));
}

function incompleteEmphasisMarkers(
  characters: string[],
  eligible: (start: number, end: number) => boolean = () => true,
): Array<{ index: number; length: number }> {
  const markers: Array<{ index: number; length: number }> = [];
  for (let index = 0; index < characters.length;) {
    const delimiter = characters[index];
    if (delimiter !== "*" && delimiter !== "_") {
      index += 1;
      continue;
    }
    let runEnd = index + 1;
    while (characters[runEnd] === delimiter) runEnd += 1;
    const previous = characters[index - 1];
    const next = characters[runEnd];
    if (eligible(index, runEnd) && canOpenEmphasisDelimiter(delimiter, previous, next)) {
      markers.push({ index, length: runEnd - index });
    }
    index = runEnd;
  }
  return markers;
}

function canOpenEmphasisDelimiter(delimiter: "*" | "_", previous: string | undefined, next: string | undefined) {
  if (next === undefined) {
    return previous === undefined || isMarkdownWhitespace(previous) || isMarkdownPunctuation(previous);
  }
  return (
    isLeftFlankingMarkdownDelimiter(previous, next) &&
    (delimiter === "*" || !isRightFlankingMarkdownDelimiter(previous, next) || (previous !== undefined && isMarkdownPunctuation(previous)))
  );
}

function isLeftFlankingMarkdownDelimiter(previous: string | undefined, next: string | undefined): boolean {
  return (
    next !== undefined &&
    !isMarkdownWhitespace(next) &&
    (!isMarkdownPunctuation(next) || previous === undefined || isMarkdownWhitespace(previous) || isMarkdownPunctuation(previous))
  );
}

function isRightFlankingMarkdownDelimiter(previous: string | undefined, next: string | undefined): boolean {
  return (
    previous !== undefined &&
    !isMarkdownWhitespace(previous) &&
    (!isMarkdownPunctuation(previous) || next === undefined || isMarkdownWhitespace(next) || isMarkdownPunctuation(next))
  );
}

function isMarkdownWhitespace(value: string): boolean {
  return /\s/u.test(value);
}

function isMarkdownPunctuation(value: string): boolean {
  return /[\p{P}\p{S}]/u.test(value);
}

function lastRenderableTokenIndex(tokens: Token[]): number {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (tokens[index]?.type !== "space" && tokens[index]?.type !== "def") return index;
  }
  return -1;
}

function activeStreamingBlockTokenIndex(tokens: Token[]): number {
  const index = lastRenderableTokenIndex(tokens);
  if (index === -1 || index !== tokens.length - 1) return -1;
  const token = tokens[index];
  if (!token || (tokenIs(token, "heading") && token.raw.includes("\n"))) return -1;
  return index;
}

function activeStreamingTableCellIndex(token: Tokens.Table): number {
  const row = token.rows.at(-1);
  if (!row || /\n[\t ]*$/u.test(token.raw)) return -1;
  const sourceRow = token.raw.split("\n").at(-1)?.trimEnd();
  if (!sourceRow) return -1;

  const finalCharacterIndex = sourceRow.length - 1;
  if (sourceRow[finalCharacterIndex] === "|" && !isEscapedMarkdownCharacter(sourceRow, finalCharacterIndex)) {
    return -1;
  }

  let sourceIndex = sourceRow.search(/\S/u);
  if (sourceIndex === -1) return -1;
  if (sourceRow[sourceIndex] === "|") sourceIndex += 1;

  let cellIndex = 0;
  for (; sourceIndex < sourceRow.length; sourceIndex += 1) {
    if (sourceRow[sourceIndex] === "|" && !isEscapedMarkdownCharacter(sourceRow, sourceIndex)) cellIndex += 1;
  }
  return cellIndex < row.length ? cellIndex : -1;
}

function containerClosesFinalNestedTable(token: Tokens.Blockquote | Tokens.List): boolean {
  if (!/\n[\t ]*$/u.test(token.raw)) return false;
  return finalNestedBlockToken(token) === "table";
}

function finalNestedBlockToken(token: Tokens.Blockquote | Tokens.List): Token["type"] | undefined {
  if (tokenIs(token, "list")) {
    const item = token.items.at(-1);
    if (!item) return token.type;
    return finalNestedTokenType(item.tokens);
  }
  return finalNestedTokenType(token.tokens);
}

function finalNestedTokenType(tokens: Token[]): Token["type"] | undefined {
  const index = lastRenderableTokenIndex(tokens);
  const token = tokens[index];
  if (!token) return undefined;
  if (tokenIs(token, "blockquote") || tokenIs(token, "list")) return finalNestedBlockToken(token);
  return token.type;
}

function isEscapedMarkdownCharacter(value: string, index: number): boolean {
  let slashCount = 0;
  for (let slashIndex = index - 1; slashIndex >= 0 && value[slashIndex] === "\\"; slashIndex -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}
