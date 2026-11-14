import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { lockedAcceptance } from "../acceptance";
import { newId, nowIso } from "../ids";
import { addThreadItem, stamp } from "../state-ops";
import { getState, transact } from "../store";
import { threadWorkspace } from "../thread-workspace";
import type { Approval } from "../types";
import { done, fail, type ToolContext, type ToolOutput } from "./context";

const execFileAsync = promisify(execFile);

export const proposeAcceptanceChangeSchema = z.object({
  content: z.string().min(1).describe("The whole corrected acceptance test file."),
  reason: z.string().min(1).describe("Why the test is wrong, citing the work order's done-means line."),
});

/** The unified diff from the test as it ran red to the proposed one, for the person to read on the card. */
async function diffOf(file: string, before: string, after: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bob-acceptance-"));
  try {
    await writeFile(path.join(dir, "a"), before);
    await writeFile(path.join(dir, "b"), after);
    const out = await execFileAsync("git", ["diff", "--no-index", "--no-color", "a", "b"], { cwd: dir }).catch((e: { stdout?: string }) => ({ stdout: e.stdout ?? "" }));
    const body = out.stdout.split("\n").slice(4).join("\n");
    return `--- a/${file}\n+++ b/${file}\n${body}`.trim();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * A build thread whose acceptance test is locked asks the person to change it. One card per thread at a time;
 * only the person's approval writes the proposed file (decideApproval), so no agent can lift the lock.
 */
export async function proposeAcceptanceChange(input: z.infer<typeof proposeAcceptanceChangeSchema>, ctx: ToolContext): Promise<ToolOutput> {
  const s = getState();
  const file = lockedAcceptance(s, ctx.agentId);
  if (!file) return fail("Your acceptance test is not locked, so there is nothing to ask for. Change it yourself until it has run red once.");
  const ws = await threadWorkspace(s.project, ctx.agentId);
  const before = await readFile(path.join(ws.root, file), "utf8").catch(() => "");
  if (before === input.content) return fail("That is the test as it is. Send the corrected file.");
  const diff = await diffOf(file, before, input.content);
  const workOrder = s.agents.find((a) => a.id === ctx.agentId)?.workOrderId ?? "this work order";
  return transact((x) => {
    const pending = x.approvals.find((a) => a.agentId === ctx.agentId && a.status === "pending" && a.acceptanceChange);
    if (pending) return { state: x, value: done({ approvalId: pending.id, note: "Already waiting on the person for your acceptance test. A person will decide." }, { endTurn: true }) };
    const approval: Approval = {
      id: newId("apr"),
      agentId: ctx.agentId,
      turnId: ctx.turnId,
      requestId: ctx.requestId,
      title: `Change the acceptance test for ${workOrder}?`,
      detail: `${input.reason.trim()}\n\nApproving writes this change to ${file}; the lock stays on for anything else.\n${diff}`,
      status: "pending",
      at: nowIso(),
      acceptanceChange: { path: file, content: input.content },
    };
    const state = addThreadItem({ ...x, approvals: [...x.approvals, approval] }, ctx.agentId, { kind: "approval", ...stamp(), approvalId: approval.id });
    return { state, value: done({ approvalId: approval.id, note: "A person will decide. You get a new turn with the decision: on approval Bob has written your proposed test; run it again." }, { endTurn: true }) };
  });
}
