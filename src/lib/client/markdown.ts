export type Inline = { kind: "text" | "code" | "strong" | "em"; text: string };

export interface ListItem {
  inline: readonly Inline[];
  /** Set for "- [ ]" and "- [x]" items. */
  checked: boolean | null;
}

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; inline: readonly Inline[] }
  | { kind: "paragraph"; inline: readonly Inline[] }
  | { kind: "quote"; inline: readonly Inline[] }
  | { kind: "list"; ordered: boolean; items: readonly ListItem[] }
  | { kind: "code"; text: string }
  | { kind: "rule" };

// Underscores count only at word edges, so snake_case names stay plain text.
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|(?<!\w)__[^_]+__(?!\w)|\*[^*\s][^*]*\*|(?<!\w)_[^_\s][^_]*_(?!\w))/g;

export function parseInline(text: string): Inline[] {
  return text
    .split(INLINE)
    .filter((part) => part !== "")
    .map((part): Inline => {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 1) return { kind: "code", text: part.slice(1, -1) };
      if (/^(\*\*|__).+\1$/.test(part)) return { kind: "strong", text: part.slice(2, -2) };
      if (/^([*_]).+\1$/.test(part)) return { kind: "em", text: part.slice(1, -1) };
      return { kind: "text", text: part };
    });
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const CHECK = /^\[([ xX])\]\s+(.*)$/;

function listItem(text: string): ListItem {
  const check = CHECK.exec(text);
  return check ? { inline: parseInline(check[2] ?? ""), checked: check[1] !== " " } : { inline: parseInline(text), checked: null };
}

function appendListItem(blocks: readonly Block[], ordered: boolean, text: string): Block[] {
  const last = blocks.at(-1);
  if (last?.kind === "list" && last.ordered === ordered) {
    return [...blocks.slice(0, -1), { ...last, items: [...last.items, listItem(text)] }];
  }
  return [...blocks, { kind: "list", ordered, items: [listItem(text)] }];
}

function appendParagraph(blocks: readonly Block[], text: string, joinPrevious: boolean): Block[] {
  const last = blocks.at(-1);
  if (joinPrevious && last?.kind === "paragraph") {
    return [...blocks.slice(0, -1), { kind: "paragraph", inline: [...last.inline, { kind: "text", text: " " }, ...parseInline(text)] }];
  }
  return [...blocks, { kind: "paragraph", inline: parseInline(text) }];
}

interface State {
  blocks: Block[];
  /** Lines of an open fenced block, or null outside one. */
  fence: string[] | null;
  /** Whether the previous line was paragraph text, so this one continues it. */
  inParagraph: boolean;
}

function lineStep(state: State, line: string): State {
  if (state.fence !== null) {
    if (line.trimStart().startsWith("```")) return { blocks: [...state.blocks, { kind: "code", text: state.fence.join("\n") }], fence: null, inParagraph: false };
    return { ...state, fence: [...state.fence, line] };
  }
  const trimmed = line.trim();
  if (trimmed.startsWith("```")) return { ...state, fence: [], inParagraph: false };
  if (trimmed === "") return { ...state, inParagraph: false };
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return { ...state, blocks: [...state.blocks, { kind: "rule" }], inParagraph: false };
  const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
  if (heading) {
    const level = Math.min(3, heading[1]?.length ?? 1) as 1 | 2 | 3;
    return { ...state, blocks: [...state.blocks, { kind: "heading", level, inline: parseInline(heading[2] ?? "") }], inParagraph: false };
  }
  if (trimmed.startsWith(">")) {
    return { ...state, blocks: [...state.blocks, { kind: "quote", inline: parseInline(trimmed.replace(/^>\s?/, "")) }], inParagraph: false };
  }
  const bullet = BULLET.exec(line);
  if (bullet) return { ...state, blocks: appendListItem(state.blocks, false, bullet[1] ?? ""), inParagraph: false };
  const numbered = NUMBERED.exec(line);
  if (numbered) return { ...state, blocks: appendListItem(state.blocks, true, numbered[1] ?? ""), inParagraph: false };
  return { ...state, blocks: appendParagraph(state.blocks, trimmed, state.inParagraph), inParagraph: true };
}

/** The small subset the captain writes: headings, lists, checkboxes, quotes, code, emphasis. */
export function parseMarkdown(source: string): Block[] {
  const end = source.split(/\r?\n/).reduce(lineStep, { blocks: [], fence: null, inParagraph: false });
  return end.fence === null ? end.blocks : [...end.blocks, { kind: "code", text: end.fence.join("\n") }];
}
