import type { ReplyStatus } from "@/lib/reply-format";

/** An agent's answer in the Status / Result / Evidence shape, split for the chat to lay out. */
export interface ReportView {
  /** Whatever the agent wrote above the Status line. */
  lead: string;
  status: ReplyStatus;
  result: string;
  evidence: string;
  unblock: string | null;
}

const STATUSES: readonly string[] = ["done", "partial", "blocked"];
const LABEL = /^(Status|Result|Evidence|Unblock):[ \t]*(.*)$/;

/** The report inside an agent's text, or null when the text does not have that shape. */
export function reportView(text: string): ReportView | null {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^Status:/.test(line));
  if (start < 0) return null;
  const fields: Record<string, string[]> = {};
  let current: string[] | null = null;
  for (const line of lines.slice(start)) {
    const label = LABEL.exec(line);
    if (label) {
      current = fields[label[1]] = [label[2]];
    } else {
      current?.push(line);
    }
  }
  const field = (name: string) => fields[name]?.join("\n").trim() || null;
  const status = field("Status");
  const result = field("Result");
  const evidence = field("Evidence");
  if (!status || !STATUSES.includes(status) || !result || !evidence) return null;
  return { lead: lines.slice(0, start).join("\n").trim(), status: status as ReplyStatus, result, evidence, unblock: field("Unblock") };
}
