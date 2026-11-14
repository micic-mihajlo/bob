import type { KnowledgeContext } from "./types";

/** "6 files, 2 past PRs · 140 ms" */
export function knowledgeSummary(k: KnowledgeContext): string {
  const part = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : null);
  const what = [part(k.files.length, "file", "files"), part(k.prs.length, "past PR", "past PRs")].filter(Boolean).join(", ");
  return `Context from HydraDB: ${what} · ${k.ms} ms`;
}
