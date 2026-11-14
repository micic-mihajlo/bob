import { isPatch } from "./diff";
import { FENCE_OPEN, fenceEnd } from "./markdown";
import { readTable } from "./table";
import type { ContentBlock } from "./types";

interface Fence {
  lang: string;
  info: string;
  body: string;
}

function readFence(lines: readonly string[], start: number): { fence: Fence; next: number } {
  const open = (lines[start] ?? "").trim();
  const marker = /^(`{3,}|~{3,})/.exec(open)?.[0] ?? "```";
  const info = open.slice(marker.length).trim();
  const [lang = "", ...rest] = info.split(/\s+/);
  const { close, next } = fenceEnd(lines, start);
  return { fence: { lang: lang.toLowerCase(), info: rest.join(" "), body: lines.slice(start + 1, close).join("\n") }, next };
}

function fenceBlock({ lang, info, body }: Fence): ContentBlock {
  if (lang === "visual") return { kind: "visual", title: info || "Visual", html: body };
  if ((lang === "diff" || lang === "patch") && isPatch(body)) return { kind: "diff", patch: body };
  return { kind: "code", lang, code: body };
}

function markdownBlock(lines: readonly string[]): ContentBlock[] {
  const text = lines.join("\n").replace(/^\n+|\s+$/g, "");
  return text === "" ? [] : [{ kind: "markdown", text }];
}

/**
 * Splits an agent's markdown reply into blocks. Only fences and tables that start at the left edge
 * split it: a fence indented inside a list item stays in that item's markdown. Never throws, and an
 * unclosed fence runs to the end of the reply, as it does while a reply is still streaming.
 */
export function parseReply(text: string): ContentBlock[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let blocks: ContentBlock[] = [];
  let pending: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const fence = FENCE_OPEN.exec(line);
    if (fence && fence[1] === "") {
      const read = readFence(lines, index);
      blocks = [...blocks, ...markdownBlock(pending), fenceBlock(read.fence)];
      pending = [];
      index = read.next;
      continue;
    }
    if (fence) {
      // An indented fence belongs to the markdown around it; copy it whole so its lines are not read as tables or fences.
      const { next } = fenceEnd(lines, index);
      pending = [...pending, ...lines.slice(index, next)];
      index = next;
      continue;
    }
    const table = readTable(lines, index);
    if (table) {
      blocks = [...blocks, ...markdownBlock(pending), table.table];
      pending = [];
      index = table.next;
      continue;
    }
    pending = [...pending, line];
    index += 1;
  }
  return [...blocks, ...markdownBlock(pending)];
}
