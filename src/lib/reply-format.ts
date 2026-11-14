export type ReplyStatus = "done" | "partial" | "blocked";

export const REPLY_FORMAT_HELP =
  "A reply is three lines: 'Status: done|partial|blocked', 'Result: ...', 'Evidence: ...' (a file, test, command or none). A blocked reply adds 'Unblock: ...'.";

const field = (text: string, name: string): string | null => {
  const match = new RegExp(`^${name}:[ \\t]*(.+)$`, "m").exec(text);
  return match ? match[1].trim() : null;
};

/** True when the text has the reply shape every answer between agents must use. */
export function isFormattedReply(text: string): boolean {
  const status = field(text, "Status");
  if (status !== "done" && status !== "partial" && status !== "blocked") return false;
  if (!field(text, "Result") || !field(text, "Evidence")) return false;
  return status !== "blocked" || !!field(text, "Unblock");
}

/** An answer must say something: at least one letter or digit. */
export const hasSubstance = (text: string): boolean => /[\p{L}\p{N}]/u.test(text);

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** Wraps a plain final answer into the reply shape. An already formatted answer passes through. */
export function toReply(text: string, status: ReplyStatus = "done", unblock?: string): string {
  if (isFormattedReply(text)) return text.trim();
  const lines = [`Status: ${status}`, `Result: ${oneLine(text)}`, "Evidence: none"];
  return status === "blocked" ? [...lines, `Unblock: ${unblock ?? "Ask again or give the work to someone else."}`].join("\n") : lines.join("\n");
}
