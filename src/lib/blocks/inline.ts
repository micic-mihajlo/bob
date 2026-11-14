export type Inline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "del"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "break" };

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** The URL when it is safe to open from a reply, else null. Relative and script URLs are refused. */
export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

interface Match {
  node: Inline;
  end: number;
}

type Rule = (text: string, at: number) => Match | null;

function codeSpan(text: string, at: number): Match | null {
  const ticks = /^`+/.exec(text.slice(at))?.[0] ?? "";
  if (ticks === "") return null;
  const close = text.indexOf(ticks, at + ticks.length);
  if (close < 0) return null;
  const body = text.slice(at + ticks.length, close);
  const trimmed = body.length > 2 && body.startsWith(" ") && body.endsWith(" ") ? body.slice(1, -1) : body;
  return { node: { type: "code", text: trimmed }, end: close + ticks.length };
}

function delimited(marker: string, type: "strong" | "em" | "del"): Rule {
  return (text, at) => {
    if (!text.startsWith(marker, at)) return null;
    const start = at + marker.length;
    if (/\s/.test(text.charAt(start)) || start >= text.length) return null;
    // Underscores inside a word, as in snake_case, are not emphasis.
    if (marker.startsWith("_") && /\w/.test(text.charAt(at - 1))) return null;
    let close = text.indexOf(marker, start);
    while (close > start && /\s/.test(text.charAt(close - 1))) close = text.indexOf(marker, close + 1);
    if (close <= start) return null;
    if (marker === "*" && text.startsWith("**", close) && !text.startsWith("***", close)) return null;
    if (marker.startsWith("_") && /\w/.test(text.charAt(close + marker.length))) return null;
    return { node: { type, children: parseInline(text.slice(start, close)) }, end: close + marker.length };
  };
}

function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (char === "\n") return -1;
    if (char === "(") depth += 1;
    else if (char === ")" && --depth === 0) return index;
  }
  return -1;
}

function link(text: string, at: number): Match | null {
  if (text.charAt(at) !== "[") return null;
  let depth = 0;
  let labelEnd = -1;
  for (let index = at; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (char === "\\") index += 1;
    else if (char === "[") depth += 1;
    else if (char === "]" && --depth === 0) {
      labelEnd = index;
      break;
    }
  }
  if (labelEnd < 0 || text.charAt(labelEnd + 1) !== "(") return null;
  const close = closingParen(text, labelEnd + 1);
  if (close < 0) return null;
  const target = text.slice(labelEnd + 2, close).trim().split(/\s+/)[0] ?? "";
  const children = parseInline(text.slice(at + 1, labelEnd));
  const href = safeHref(target);
  // An unsafe target keeps its label and drops the link, so the reply still reads.
  const node: Inline = href ? { type: "link", href, children } : { type: "text", text: inlineText(children) };
  return { node, end: close + 1 };
}

function autolink(text: string, at: number): Match | null {
  if (/\w/.test(text.charAt(at - 1))) return null;
  const found = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"*_~]/.exec(text.slice(at));
  if (!found) return null;
  const href = safeHref(found[0]);
  if (!href) return null;
  return { node: { type: "link", href, children: [{ type: "text", text: found[0] }] }, end: at + found[0].length };
}

const RULES: Record<string, Rule[]> = {
  "`": [codeSpan],
  "*": [delimited("**", "strong"), delimited("*", "em")],
  _: [delimited("__", "strong"), delimited("_", "em")],
  "~": [delimited("~~", "del")],
  "[": [link],
  h: [autolink],
};

function pushText(nodes: readonly Inline[], text: string): Inline[] {
  if (text === "") return [...nodes];
  const last = nodes[nodes.length - 1];
  if (last?.type === "text") return [...nodes.slice(0, -1), { type: "text", text: last.text + text }];
  return [...nodes, { type: "text", text }];
}

/** Parses one paragraph's inline markdown. A newline inside it is a line break. */
export function parseInline(text: string): Inline[] {
  let nodes: Inline[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text.charAt(index);
    if (char === "\\" && /[\\`*_~[\]()#+\-.!|>]/.test(text.charAt(index + 1))) {
      nodes = pushText(nodes, text.charAt(index + 1));
      index += 2;
      continue;
    }
    if (char === "\n") {
      nodes = [...nodes, { type: "break" }];
      index += 1;
      continue;
    }
    const match = (RULES[char] ?? []).reduce<Match | null>((found, rule) => found ?? rule(text, index), null);
    if (match) {
      nodes = match.node.type === "text" ? pushText(nodes, match.node.text) : [...nodes, match.node];
      index = match.end;
      continue;
    }
    const run = /[\\\n`*_~[h]/g;
    run.lastIndex = index + 1;
    const next = run.exec(text)?.index ?? text.length;
    nodes = pushText(nodes, text.slice(index, next));
    index = next;
  }
  return nodes;
}

/** The text a person sees, for copying cells and measuring. */
export function inlineText(nodes: readonly Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
          return node.text;
        case "break":
          return "\n";
        default:
          return inlineText(node.children);
      }
    })
    .join("");
}
