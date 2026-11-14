import { constants } from "node:fs";
import { mkdir, open, readFile as readFs, stat } from "node:fs/promises";
import path from "node:path";
import { confineExisting, confineForWrite } from "./confine";
import { runGit } from "./run-git";
import { agentIdentity } from "./layout";
import type { Result, Workspace } from "./types";

export const LIST_LIMIT = 1_000;
export const READ_LINE_LIMIT = 2_000;
export const READ_CHAR_LIMIT = 50_000;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export type ListFilesResult = Result<{ files: string[]; truncated: boolean }>;
export type ReadFileResult = Result<{
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
}>;
export type WriteFileResult = Result<{ path: string; bytes: number }>;

const fail = (error: string) => ({ ok: false as const, error });
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Tracked and untracked files under `dir`, minus `.git` and anything `.gitignore` hides. */
export async function listFiles(ws: Workspace, dir = "."): Promise<ListFilesResult> {
  const target = await confineExisting(ws.root, dir);
  if (!target.ok) return target;
  if (!(await stat(target.abs)).isDirectory()) return fail(`${target.rel} is not a directory`);
  const out = await runGit({
    cwd: ws.root,
    home: ws.project.home,
    identity: agentIdentity(ws.agentId),
    args: ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", target.rel],
  });
  if (out.exitCode !== 0) return fail(`could not list ${target.rel}: ${out.stderr.trim()}`);
  const files = [...new Set(out.stdout.split("\0").filter(Boolean))].sort();
  return { ok: true, files: files.slice(0, LIST_LIMIT), truncated: files.length > LIST_LIMIT };
}

export async function readFile(
  ws: Workspace,
  file: string,
  range: { offset?: number; limit?: number } = {},
): Promise<ReadFileResult> {
  const loaded = await loadText(ws, file);
  if (!loaded.ok) return loaded;
  const lines = loaded.text.split("\n");
  const start = Math.max(1, Math.floor(range.offset ?? 1));
  const limit = Math.min(READ_LINE_LIMIT, Math.max(1, Math.floor(range.limit ?? READ_LINE_LIMIT)));
  const picked = lines.slice(start - 1, start - 1 + limit).join("\n");
  const content = picked.slice(0, READ_CHAR_LIMIT);
  const endLine = Math.min(lines.length, start - 1 + content.split("\n").length);
  return {
    ok: true,
    path: loaded.rel,
    content,
    startLine: start,
    endLine,
    totalLines: lines.length,
    truncated: endLine < lines.length || content.length < picked.length,
  };
}

export async function writeFile(ws: Workspace, file: string, content: string): Promise<WriteFileResult> {
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) return fail(`content is over ${MAX_FILE_BYTES} bytes`);
  const target = await confineForWrite(ws.root, file);
  if (!target.ok) return target;
  try {
    await mkdir(path.dirname(target.abs), { recursive: true });
    const bytes = await writeNoFollow(target.abs, content);
    return { ok: true, path: target.rel, bytes };
  } catch (error) {
    return fail(`could not write ${target.rel}: ${messageOf(error)}`);
  }
}

/** Replaces exactly one occurrence of `oldText`. Zero or several matches change nothing. */
export async function editFile(
  ws: Workspace,
  file: string,
  oldText: string,
  newText: string,
): Promise<WriteFileResult> {
  if (oldText === "") return fail("oldText is empty; give the exact text to replace");
  const loaded = await loadText(ws, file);
  if (!loaded.ok) return loaded;
  const count = countOccurrences(loaded.text, oldText);
  if (count === 0) return fail(`oldText was not found in ${loaded.rel}; read the file and copy the text exactly`);
  if (count > 1) {
    return fail(`oldText matches ${count} places in ${loaded.rel}; include more surrounding lines so it matches once`);
  }
  const at = loaded.text.indexOf(oldText);
  const next = loaded.text.slice(0, at) + newText + loaded.text.slice(at + oldText.length);
  try {
    const bytes = await writeNoFollow(loaded.abs, next);
    return { ok: true, path: loaded.rel, bytes };
  } catch (error) {
    return fail(`could not write ${loaded.rel}: ${messageOf(error)}`);
  }
}

async function loadText(ws: Workspace, file: string): Promise<Result<{ abs: string; rel: string; text: string }>> {
  const target = await confineExisting(ws.root, file);
  if (!target.ok) return target;
  try {
    const info = await stat(target.abs);
    if (!info.isFile()) return fail(`${target.rel} is not a file`);
    if (info.size > MAX_FILE_BYTES) return fail(`${target.rel} is over ${MAX_FILE_BYTES} bytes`);
    const text = await readFs(target.abs, "utf8");
    if (text.includes("\0")) return fail(`${target.rel} looks binary`);
    return { ok: true, abs: target.abs, rel: target.rel, text };
  } catch (error) {
    return fail(`could not read ${target.rel}: ${messageOf(error)}`);
  }
}

// O_NOFOLLOW closes the gap between the confinement check and the write if a symlink appears.
async function writeNoFollow(abs: string, content: string): Promise<number> {
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW;
  const handle = await open(abs, flags, 0o644);
  try {
    const data = Buffer.from(content, "utf8");
    await handle.writeFile(data);
    return data.length;
  } finally {
    await handle.close();
  }
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) count += 1;
  return count;
}
