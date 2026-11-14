import { z } from "zod";
import { failedTests, isAcceptanceTest, isTestCommand, testRunLabel } from "../acceptance";
import { getConfig, getState } from "../store";
import { threadWorkspace } from "../thread-workspace";
import { editFile, ensureWorkspaceDeps, git, listFiles, readFile, runCommand, writeFile, type Workspace } from "../workspace";
import type { ToolContext, ToolOutput } from "./context";
import { clip, define, fromResult, type ToolDef } from "./define";
import { openPullRequestSchema, openPullRequestTool, recordReview, recordReviewSchema } from "./pull-requests";
import { recordNote, recordNoteSchema, report, reportSchema } from "./report";
import { PREVIEW_TOOLS } from "../integrations/vercel/check-preview";
import { startSubagent, startSubagentSchema } from "../subagents";

const READ_ONLY_GIT = ["status", "diff", "log", "show", "fetch", "switch", "checkout"] as const;
const MAX_BATCH = 20;
const READ_BUDGET = 80_000;
const STEP_OUTPUT = 3_000;

const relPath = (what: string) => z.string().describe(`${what}, relative to the workspace root, such as src/format.ts`);

const workspaceOf = (ctx: ToolContext) => threadWorkspace(getState().project, ctx.agentId);

async function inWorkspace(ctx: ToolContext, run: (ws: Workspace) => Promise<{ ok: true } | { ok: false; error: string }>): Promise<ToolOutput> {
  return fromResult(await run(await workspaceOf(ctx)));
}

const names = (paths: string[]) => clip(paths.join(", "), 70);

/** One result per item, in order. The call fails only when every item failed. */
function batch(items: Record<string, unknown>[]): ToolOutput {
  const failed = items.filter((i) => "error" in i).length;
  if (failed > 0 && failed === items.length) return { result: { error: items.map((i) => `${i.path}: ${i.error}`).join("\n"), results: items } };
  return { result: { results: items, ...(failed ? { failed } : {}) } };
}

const listFilesDef = define({
  name: "list_files",
  description:
    "List the files in your workspace, your own git checkout of the project. Your first message already shows the file tree, so call this only for a folder it left out. Leaves out .git and ignored files.",
  schema: z.object({ dir: relPath("Folder to list").optional() }),
  sets: ["build", "review", "research", "subagent"],
  label: (i) => (i.dir ? `Listing ${i.dir}` : "Listing the workspace"),
  execute: (i, ctx) => inWorkspace(ctx, (ws) => listFiles(ws, i.dir)),
});

const readFilesDef = define({
  name: "read_files",
  description: `Read up to ${MAX_BATCH} text files in your workspace in one call. Read every file you need at once instead of one per call. Files your first message already shows need no reading. Each result has the content, totalLines and truncated; for a long file pass offset (1-based first line) and limit.`,
  schema: z.object({
    paths: z.array(relPath("File to read")).min(1).max(MAX_BATCH),
    offset: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(2000).optional(),
  }),
  sets: ["build", "review", "research", "subagent"],
  label: (i) => `Reading ${names(i.paths)}`,
  execute: async (i, ctx) => {
    const ws = await workspaceOf(ctx);
    let budget = READ_BUDGET;
    const items: Record<string, unknown>[] = [];
    for (const p of i.paths) {
      const read = await readFile(ws, p, { offset: i.offset, limit: i.limit });
      if (!read.ok) {
        items.push({ path: p, error: read.error });
        continue;
      }
      const content = read.content.slice(0, Math.max(0, budget));
      budget -= content.length;
      items.push({ path: read.path, content, totalLines: read.totalLines, truncated: read.truncated || content.length < read.content.length });
    }
    return batch(items);
  },
});

const writeFilesDef = define({
  name: "write_files",
  description: `Create or replace up to ${MAX_BATCH} whole files in your workspace in one call: write the change and its test together. Missing folders are created. Use edit_files to change part of a file. Nothing is committed until open_pull_request.`,
  schema: z.object({
    files: z.array(z.object({ path: relPath("File to write"), content: z.string().describe("The complete new content") })).min(1).max(MAX_BATCH),
  }),
  sets: ["build", "subagent"],
  label: (i) => (i.files.some((f) => isAcceptanceTest(f.path)) ? "Writing the acceptance test" : `Writing ${names(i.files.map((f) => f.path))}`),
  execute: async (i, ctx) => {
    const ws = await workspaceOf(ctx);
    const items: Record<string, unknown>[] = [];
    for (const f of i.files) {
      const out = await writeFile(ws, f.path, f.content);
      items.push(out.ok ? { path: out.path, bytes: out.bytes } : { path: f.path, error: out.error });
    }
    return batch(items);
  },
});

const editFilesDef = define({
  name: "edit_files",
  description: `Make up to ${MAX_BATCH} exact text replacements across files in your workspace in one call, applied in order. Each oldText must match the file character for character and occur exactly once, or that edit changes nothing and reports an error; copy it from the file and include enough lines to make it unique.`,
  schema: z.object({
    edits: z.array(z.object({ path: relPath("File to edit"), oldText: z.string().min(1), newText: z.string() })).min(1).max(MAX_BATCH),
  }),
  sets: ["build", "subagent"],
  label: (i) => `Editing ${names([...new Set(i.edits.map((e) => e.path))])}`,
  execute: async (i, ctx) => {
    const ws = await workspaceOf(ctx);
    const items: Record<string, unknown>[] = [];
    for (const e of i.edits) {
      const out = await editFile(ws, e.path, e.oldText, e.newText);
      items.push(out.ok ? { path: out.path, bytes: out.bytes } : { path: e.path, error: out.error });
    }
    return batch(items);
  },
});

const runDef = define({
  name: "run",
  description:
    "Run one shell command in your workspace root, such as \"npm test\", \"npm run typecheck\" or \"ls src\", and get its exit code and output. Dependencies are already installed. Chain steps with && in one call. Commands run with no network credentials and no API keys, are killed at the timeout (default 120 seconds), and long output keeps its head and tail. Use it to run the tests before you open a pull request and name the command in Evidence.",
  schema: z.object({
    command: z.string().min(1).describe("A bash command line, run from the workspace root"),
    timeoutSeconds: z.number().int().min(1).max(600).optional(),
  }),
  sets: ["build", "review", "research", "subagent"],
  label: (i) => `Running ${clip(i.command, 70)}`,
  doneLabel: (i, r) => (isTestCommand(i.command) && typeof r.output === "string" ? testRunLabel(r.passed === true, r.output) : undefined),
  detail: (i, r) => (typeof r.output === "string" ? `$ ${i.command}   (${String(r.sandbox)})\n${r.output.slice(-STEP_OUTPUT)}\n${String(r.note ?? "")}`.trim() : undefined),
  execute: async (i, ctx) => {
    const ws = await workspaceOf(ctx);
    const deps = getConfig().installDeps ? await ensureWorkspaceDeps(ws) : null;
    const setup = deps?.ok && deps.state.kind === "failed" ? `Installing dependencies failed (${deps.state.command}): ${deps.state.output}` : undefined;
    const out = await runCommand(ws, i.command, (i.timeoutSeconds ?? 120) * 1000);
    if (!out.ok) return { result: { error: out.error } };
    const { ok: _ok, ...rest } = out;
    const failedTestsShown = isTestCommand(i.command) && (failedTests(out.output) ?? 0) > 0;
    const note = out.timedOut
      ? `Killed after ${out.seconds}s, the timeout.`
      : out.exitCode !== 0
        ? `Failed: exit code ${out.exitCode}.`
        : failedTestsShown
          ? "Failed: the output shows failing tests, though the exit code was 0 (a pipe hides it)."
          : "Passed: exit code 0.";
    return { result: { ...rest, passed: out.exitCode === 0 && !out.timedOut && !failedTestsShown, note, ...(setup ? { setup } : {}) } };
  },
});

const gitArgs = z.object({ args: z.array(z.string()).min(1).describe("Arguments after git, subcommand first, such as [\"status\"]") });

const buildGitDef = define({
  name: "git",
  description:
    "Run one git command in your workspace, arguments without \"git\": [\"status\"], [\"diff\", \"main\"], [\"log\", \"--oneline\"]. Your branch is already checked out. You rarely need it: open_pull_request commits your changes and returns the diff. You cannot push to main or force-push.",
  schema: gitArgs,
  sets: ["build"],
  label: (i) => clip(`git ${i.args.join(" ")}`),
  execute: (i, ctx) => inWorkspace(ctx, (ws) => git(ws, i.args)),
});

const readOnlyGitDef = define({
  name: "git",
  description: `Run one read-only git command in your workspace, arguments without "git". Allowed: ${READ_ONLY_GIT.join(", ")}. Your first message already holds the pull request's diff, and the workspace has its branch checked out, so you rarely need this; use ["show", "<ref>:<path>"] to read a file at another revision.`,
  schema: gitArgs,
  sets: ["review", "research", "subagent"],
  label: (i) => clip(`git ${i.args.join(" ")}`),
  execute: (i, ctx) => inWorkspace(ctx, (ws) => git(ws, i.args, READ_ONLY_GIT)),
});

export const CREW_TOOLS: ToolDef[] = [
  listFilesDef,
  readFilesDef,
  writeFilesDef,
  editFilesDef,
  runDef,
  buildGitDef,
  readOnlyGitDef,
  define({
    name: "open_pull_request",
    description:
      "Commit every change in your workspace with commitMessage, publish your branch and open its pull request, in one call. Returns the number, the changed files and the diff against main. Call it once your tests pass. Call it again after more changes to update the same pull request. You never merge.",
    schema: openPullRequestSchema,
    sets: ["build"],
    label: (i) => `Opening a pull request: ${clip(i.title)}`,
    execute: openPullRequestTool,
  }),
  define({
    name: "record_review",
    description:
      "Record your verdict on one pull request, once, after you read its real diff. approve means correct and safe to merge as it is, even with low findings; request_changes means something must change first. List every finding with its file.",
    schema: recordReviewSchema,
    sets: ["review"],
    label: (i) => `Recorded a review: ${i.verdict === "approve" ? "approve" : "changes requested"}`,
    execute: recordReview,
  }),
  ...PREVIEW_TOOLS,
  define({
    name: "record_artifact",
    description: "Record what you found as a note the captain and the person can read. Cite the files you read.",
    schema: recordNoteSchema,
    sets: ["research"],
    label: (i) => `Recorded a note: ${clip(i.title)}`,
    execute: recordNote,
  }),
  define({
    name: "start_subagent",
    description:
      "Hand one focused side task to a subagent: it starts from your prompt alone, works in your workspace (same) or a copy of it (copy, the default), and its final answer comes back to you alone as a new turn. Use it for a separate investigation or check, not for the main change. At most two at once; end your turn after it.",
    schema: startSubagentSchema,
    sets: ["build", "research"],
    label: (i) => `Starting a subagent: ${clip(i.title)}`,
    execute: startSubagent,
  }),
  define({
    name: "report",
    description:
      "Send your report to the captain, once, at the end of the work, after you checked it. The only way to reach anyone but the person reading this thread. Use it to ask the captain something only when you are blocked (Status: blocked, Unblock: what you need).",
    schema: reportSchema,
    sets: ["build", "review", "research"],
    label: () => "Reporting to the captain",
    execute: report,
  }),
];
