import { z } from "zod";
import { getState } from "../store";
import { threadWorkspace } from "../thread-workspace";
import { editFile, git, listFiles, readFile, writeFile, type Workspace } from "../workspace";
import type { ToolContext, ToolOutput } from "./context";
import { clip, define, fromResult, type ToolDef } from "./define";
import { openPullRequestSchema, openPullRequestTool, recordReview, recordReviewSchema } from "./pull-requests";
import { recordNote, recordNoteSchema, report, reportSchema } from "./report";

const READ_ONLY_GIT = ["status", "diff", "log", "show", "fetch", "switch", "checkout"] as const;

const relPath = (what: string) => z.string().describe(`${what}, relative to the workspace root, such as src/format.ts`);

async function inWorkspace(ctx: ToolContext, run: (ws: Workspace) => Promise<{ ok: true } | { ok: false; error: string }>): Promise<ToolOutput> {
  return fromResult(await run(await threadWorkspace(getState().project, ctx.agentId)));
}

const listFilesDef = define({
  name: "list_files",
  description:
    "List the files in your workspace, your own git checkout of the project. Call it first to see what exists. Pass dir to list one folder. Leaves out .git and ignored files.",
  schema: z.object({ dir: relPath("Folder to list").optional() }),
  sets: ["build", "review", "research"],
  label: (i) => (i.dir ? `Listing ${i.dir}` : "Listing the workspace"),
  execute: (i, ctx) => inWorkspace(ctx, (ws) => listFiles(ws, i.dir)),
});

const readFileDef = define({
  name: "read_file",
  description:
    "Read a text file in your workspace. Read a file before you edit it so you can copy its text exactly. offset is the first line (1-based) and limit the number of lines; the result says when it is truncated.",
  schema: z.object({
    path: relPath("File to read"),
    offset: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(2000).optional(),
  }),
  sets: ["build", "review", "research"],
  label: (i) => `Reading ${i.path}`,
  execute: (i, ctx) => inWorkspace(ctx, (ws) => readFile(ws, i.path, { offset: i.offset, limit: i.limit })),
});

const writeFileDef = define({
  name: "write_file",
  description:
    "Create a file, or replace a whole file, in your workspace. Use edit_file to change part of an existing file. Writing does not commit: run git add and git commit afterwards.",
  schema: z.object({ path: relPath("File to write"), content: z.string().describe("The complete new content") }),
  sets: ["build"],
  label: (i) => `Writing ${i.path}`,
  execute: (i, ctx) => inWorkspace(ctx, (ws) => writeFile(ws, i.path, i.content)),
});

const editFileDef = define({
  name: "edit_file",
  description:
    "Replace one exact piece of text in a file in your workspace. oldText must match character for character and occur exactly once, or nothing changes; read the file first and include enough lines to make it unique.",
  schema: z.object({ path: relPath("File to edit"), oldText: z.string().min(1), newText: z.string() }),
  sets: ["build"],
  label: (i) => `Editing ${i.path}`,
  execute: (i, ctx) => inWorkspace(ctx, (ws) => editFile(ws, i.path, i.oldText, i.newText)),
});

const gitArgs = z.object({ args: z.array(z.string()).min(1).describe("Arguments after git, subcommand first, such as [\"status\"]") });

const buildGitDef = define({
  name: "git",
  description:
    "Run one git command in your workspace, arguments without \"git\": [\"status\"], [\"add\", \"src/csv.ts\"], [\"commit\", \"-m\", \"Add CSV export\"], [\"diff\", \"main\"]. Your branch is already checked out; commit on it. Before you report, read your change with [\"diff\", \"main\"]. You cannot push to main or force-push; open_pull_request publishes your branch.",
  schema: gitArgs,
  sets: ["build"],
  label: (i) => clip(`git ${i.args.join(" ")}`),
  execute: (i, ctx) => inWorkspace(ctx, (ws) => git(ws, i.args)),
});

const readOnlyGitDef = define({
  name: "git",
  description: `Run one read-only git command in your workspace, arguments without "git". Allowed: ${READ_ONLY_GIT.join(", ")}. To read a pull request: ["fetch", "origin"], then ["diff", "origin/main...origin/<branch>"]; use ["show", "origin/<branch>:<path>"] to read a whole changed file.`,
  schema: gitArgs,
  sets: ["review", "research"],
  label: (i) => clip(`git ${i.args.join(" ")}`),
  execute: (i, ctx) => inWorkspace(ctx, (ws) => git(ws, i.args, READ_ONLY_GIT)),
});

export const CREW_TOOLS: ToolDef[] = [
  listFilesDef,
  readFileDef,
  writeFileDef,
  editFileDef,
  buildGitDef,
  readOnlyGitDef,
  define({
    name: "open_pull_request",
    description:
      "Publish your branch and open a pull request for it, once your change is committed and you have read the diff. Returns the number, changed files and the diff against main. After more commits, call it again to update the same pull request. You never merge.",
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
  define({
    name: "record_artifact",
    description: "Record what you found as a note the captain and the person can read. Cite the files you read.",
    schema: recordNoteSchema,
    sets: ["research"],
    label: (i) => `Recorded a note: ${clip(i.title)}`,
    execute: recordNote,
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
