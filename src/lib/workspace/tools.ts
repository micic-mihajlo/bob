import { z } from "zod";
import { editFile, listFiles, readFile, writeFile, LIST_LIMIT, READ_LINE_LIMIT } from "./files";
import { git, GIT_OUTPUT_LIMIT } from "./git";
import { ALLOWED_SUBCOMMANDS } from "./git-policy";
import { openPullRequest, PATCH_LIMIT } from "./pull-request";
import { ensureWorkspace } from "./setup";
import type { Workspace, WorkspaceOptions } from "./types";

export interface WorkspaceToolContext {
  projectId: string;
  agentId: string;
}

export interface WorkspaceTool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute(ctx: WorkspaceToolContext, input: unknown): Promise<unknown>;
}

interface Definition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  /** Parses the raw input against the schema, then runs. */
  call(ws: Workspace, input: unknown): Promise<unknown>;
}

function define<S extends z.ZodType>(
  name: string,
  description: string,
  inputSchema: S,
  run: (ws: Workspace, input: z.infer<S>) => Promise<unknown>,
): Definition {
  return {
    name,
    description,
    inputSchema,
    async call(ws, input) {
      const parsed = inputSchema.safeParse(input);
      if (parsed.success) return run(ws, parsed.data);
      const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`);
      return { ok: false, error: `invalid input: ${issues.join("; ")}` };
    },
  };
}

const relPath = (what: string) => z.string().describe(`${what}, relative to the workspace root, such as src/format.ts`);

const DEFINITIONS: readonly Definition[] = [
  define(
    "list_files",
    `List the files in your workspace, your own git checkout of the project. Use it first to see what exists before reading or editing. Pass dir to list one folder. Leaves out .git and anything .gitignore hides. Returns at most ${LIST_LIMIT} paths; truncated is true when there are more, so narrow it with dir.`,
    z.object({ dir: relPath("Folder to list").optional() }),
    (ws, input) => listFiles(ws, input.dir),
  ),
  define(
    "read_file",
    `Read a text file in your workspace. Read a file before you edit it, so you copy its text exactly. offset is the first line to return (1-based) and limit the number of lines, at most ${READ_LINE_LIMIT}. The result gives totalLines and truncated, so read the rest by raising offset. Paths outside the workspace, inside .git, or binary files are refused.`,
    z.object({
      path: relPath("File to read"),
      offset: z.number().int().min(1).optional().describe("First line to return, 1-based. Defaults to 1"),
      limit: z.number().int().min(1).max(READ_LINE_LIMIT).optional().describe("How many lines to return"),
    }),
    (ws, input) => readFile(ws, input.path, { offset: input.offset, limit: input.limit }),
  ),
  define(
    "write_file",
    "Create a file, or replace a whole file, in your workspace. Missing folders are created. Use edit_file instead for a change to part of an existing file. Paths outside the workspace and inside .git are refused. Writing does not commit: use the git tool to add and commit.",
    z.object({ path: relPath("File to write"), content: z.string().describe("The complete new content") }),
    (ws, input) => writeFile(ws, input.path, input.content),
  ),
  define(
    "edit_file",
    "Replace one exact piece of text in a file in your workspace. oldText must match the file character for character, including spaces and line breaks, and must occur exactly once. If it occurs zero times or several times nothing changes and you get an error, so read the file and include enough surrounding lines to make it unique.",
    z.object({
      path: relPath("File to edit"),
      oldText: z.string().min(1).describe("The exact text to replace, unique in the file"),
      newText: z.string().describe("The text to put in its place"),
    }),
    (ws, input) => editFile(ws, input.path, input.oldText, input.newText),
  ),
  define(
    "git",
    `Run one git command in your workspace. Pass the arguments without "git", such as ["status"] or ["commit", "-m", "Format totals"]. Allowed subcommands: ${ALLOWED_SUBCOMMANDS.join(", ")}. The only remote is origin, which every teammate shares: fetch from it to see their branches and push your own branch to it. For fetch, pull and push, put origin straight after the subcommand, as in ["push", "origin", "-u", "my-branch"]. Work on your own branch: create it with ["switch", "--create", "name"] or ["checkout", "-b", "name"] (the -c flag is refused). You cannot push to main or force-push; main changes only when a person approves a merge. Paths must stay inside the workspace. Times out after 20 seconds; output is capped at ${GIT_OUTPUT_LIMIT} characters.`,
    z.object({ args: z.array(z.string()).min(1).describe("Arguments after git, subcommand first") }),
    (ws, input) => git(ws, input.args),
  ),
  define(
    "open_pull_request",
    `Open a pull request for a branch you committed to. It pushes the branch to origin so teammates can fetch it, and returns the changed files with added and removed line counts plus the diff against main (patch, capped at ${PATCH_LIMIT} characters). Commit first: a branch with no commits ahead of main is refused, and so is main itself. Merging is not yours to do; tell the person or Bob the pull request is ready.`,
    z.object({
      branch: z.string().min(1).describe("Your local branch with the committed change"),
      title: z.string().min(1).describe("One line saying what the change does"),
      body: z.string().describe("Why the change is needed and how you checked it"),
    }),
    (ws, input) => openPullRequest(ws, input),
  ),
];

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createWorkspaceTools(options: WorkspaceOptions = {}): WorkspaceTool[] {
  return DEFINITIONS.map((def) => ({
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    async execute(ctx: WorkspaceToolContext, input: unknown) {
      try {
        return await def.call(await ensureWorkspace(ctx.projectId, ctx.agentId, options), input);
      } catch (error) {
        return { ok: false, error: messageOf(error) };
      }
    },
  }));
}

export const workspaceTools: WorkspaceTool[] = createWorkspaceTools();
