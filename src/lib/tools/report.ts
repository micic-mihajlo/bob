import { z } from "zod";
import { DRIVE_FILES } from "../crew";
import { newId, nowIso } from "../ids";
import { send } from "../mailbox";
import { REPLY_FORMAT_HELP, isFormattedReply } from "../reply-format";
import { captainOf, messageById, type State } from "../state";
import { getState, update } from "../store";
import type { Artifact, Delivery } from "../types";
import { done, fail, type ToolContext, type ToolOutput } from "./context";
import { recordOutgoing } from "./messaging";

export const reportSchema = z.object({
  text: z.string().min(1).describe("Status: done|partial|blocked, Result, Evidence, and Unblock when blocked, one per line."),
});

/** The captain's ask this turn is handling and nobody has answered yet. A report answers it. */
function owedToCaptain(s: State, ctx: ToolContext, captainId: string): Delivery | undefined {
  return s.deliveries.find((d) => {
    const m = messageById(s, d.messageId);
    return d.turnId === ctx.turnId && !d.answered && !!m?.expectsReply && m.from.kind === "agent" && m.from.agentId === captainId;
  });
}

export function report(input: z.infer<typeof reportSchema>, ctx: ToolContext): ToolOutput {
  if (!isFormattedReply(input.text)) return fail(`${REPLY_FORMAT_HELP} Rewrite the report in that shape and call report again.`);
  const s = getState();
  const captain = captainOf(s);
  if (!captain) return fail("There is no captain to report to.");
  const owed = owedToCaptain(s, ctx, captain.id);
  const sent = send({
    from: { kind: "agent", agentId: ctx.agentId },
    to: [captain.id],
    text: input.text,
    expectsReply: false,
    replyTo: owed?.messageId ?? null,
    causedBy: owed?.messageId ?? ctx.causedBy,
    requestId: (owed && messageById(s, owed.messageId)?.requestId) ?? ctx.requestId,
  });
  if (!sent.ok) return fail(sent.error.message);
  update((x) => recordOutgoing(x, ctx, sent.message));
  const next = "Reported. End your turn with one short line for anyone reading this thread. Do not report again unless something changes.";
  return done({ messageId: sent.message.id, next }, { wake: [captain.id] });
}

export const recordNoteSchema = z.object({
  title: z.string().min(1).max(100),
  detail: z.string().min(1).describe("What you found, citing the files and lines it comes from."),
});

export function recordNote(input: z.infer<typeof recordNoteSchema>, ctx: ToolContext): ToolOutput {
  const note: Artifact = {
    id: newId("art"),
    kind: "note",
    title: input.title,
    detail: input.detail,
    status: "open",
    agentId: ctx.agentId,
    turnId: ctx.turnId,
    requestId: ctx.requestId,
    messageId: ctx.causedBy,
    at: nowIso(),
  };
  update((s) => ({ ...s, artifacts: [...s.artifacts, note] }));
  return done({ artifactId: note.id, next: "Recorded. Call report once with what you found." });
}

export const writeDriveSchema = z.object({
  name: z.enum(DRIVE_FILES).describe("DIGEST.md: what needs the person now. CREW.md: who is on what. NOTES.md: what to remember."),
  content: z.string().max(4000).describe("The whole new content of the file. Keep it short."),
});

export function writeDrive(input: z.infer<typeof writeDriveSchema>): ToolOutput {
  const file = { name: input.name, content: input.content, updatedAt: nowIso() };
  update((s) => ({
    ...s,
    drive: s.drive.some((f) => f.name === input.name) ? s.drive.map((f) => (f.name === input.name ? file : f)) : [...s.drive, file],
  }));
  return done({ name: input.name, bytes: input.content.length });
}
