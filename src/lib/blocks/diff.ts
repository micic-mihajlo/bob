export type DiffLineKind = "context" | "add" | "del";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldNo: number | null;
  newNo: number | null;
  /** The patch said this line has no newline at the end of the file. */
  noNewline: boolean;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  /** The function or section name git prints after the second `@@`. */
  section: string;
  lines: DiffLine[];
}

export type DiffStatus = "modified" | "added" | "deleted" | "renamed";

export interface DiffFile {
  oldPath: string | null;
  newPath: string | null;
  status: DiffStatus;
  binary: boolean;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

const GIT_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

interface Draft {
  oldPath: string | null;
  newPath: string | null;
  renamed: boolean;
  binary: boolean;
  hunks: DiffHunk[];
}

function cleanPath(raw: string): string | null {
  const path = raw.split("\t")[0]?.trim() ?? "";
  if (path === "/dev/null" || path === "") return null;
  return path.replace(/^[ab]\//, "");
}

function finish(draft: Draft): DiffFile {
  const lines = draft.hunks.flatMap((hunk) => hunk.lines);
  const status: DiffStatus =
    draft.oldPath === null ? "added" : draft.newPath === null ? "deleted" : draft.renamed || draft.oldPath !== draft.newPath ? "renamed" : "modified";
  return {
    oldPath: draft.oldPath,
    newPath: draft.newPath,
    status,
    binary: draft.binary,
    hunks: draft.hunks,
    additions: lines.filter((line) => line.kind === "add").length,
    deletions: lines.filter((line) => line.kind === "del").length,
  };
}

/** A `diff --git` line, a hunk header, or a `---`/`+++` pair that a hunk header follows. */
function startsHeader(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? "";
  if (line.startsWith("diff --git ") || line.startsWith("@@")) return true;
  return line.startsWith("--- ") && (lines[index + 1] ?? "").startsWith("+++ ") && (lines[index + 2] ?? "").startsWith("@@");
}

const KIND_OF_SIGN: Record<string, DiffLineKind> = { "+": "add", "-": "del", " ": "context" };

/**
 * Reads one hunk. Agents often write wrong `@@` counts, so prefixed lines are read until the next
 * header; the counts only decide whether a bare empty line is a context line or the hunk's end.
 */
function readHunk(lines: readonly string[], start: number): { hunk: DiffHunk; next: number } | null {
  const found = HUNK_HEADER.exec(lines[start] ?? "");
  if (!found) return null;
  const oldStart = Number(found[1]);
  const newStart = Number(found[3]);
  let oldLeft = found[2] === undefined ? 1 : Number(found[2]);
  let newLeft = found[4] === undefined ? 1 : Number(found[4]);
  let oldNo = oldStart;
  let newNo = newStart;
  let body: DiffLine[] = [];
  let index = start + 1;
  while (index < lines.length && !startsHeader(lines, index)) {
    const line = lines[index] ?? "";
    const last = body[body.length - 1];
    if (line.startsWith("\\")) {
      if (last) body = [...body.slice(0, -1), { ...last, noNewline: true }];
      index += 1;
      continue;
    }
    const blankContext = line === "" && oldLeft > 0 && newLeft > 0 && index < lines.length - 1;
    const kind = blankContext ? "context" : KIND_OF_SIGN[line.charAt(0)];
    if (kind === undefined) break;
    body = [
      ...body,
      { kind, text: line.slice(1), oldNo: kind === "add" ? null : oldNo, newNo: kind === "del" ? null : newNo, noNewline: false },
    ];
    if (kind !== "add") {
      oldLeft -= 1;
      oldNo += 1;
    }
    if (kind !== "del") {
      newLeft -= 1;
      newNo += 1;
    }
    index += 1;
  }
  return { hunk: { header: lines[start] ?? "", oldStart, newStart, section: found[5] ?? "", lines: body }, next: index };
}

const EMPTY: Draft = { oldPath: null, newPath: null, renamed: false, binary: false, hunks: [] };

function applyHeader(draft: Draft, line: string): Draft {
  if (line.startsWith("new file mode")) return { ...draft, oldPath: null };
  if (line.startsWith("deleted file mode")) return { ...draft, newPath: null };
  if (line.startsWith("rename from ")) return { ...draft, renamed: true, oldPath: line.slice("rename from ".length) };
  if (line.startsWith("rename to ")) return { ...draft, renamed: true, newPath: line.slice("rename to ".length) };
  if (/^Binary files .* differ$/.test(line)) return { ...draft, binary: true };
  return draft;
}

const closeFile = (files: DiffFile[], draft: Draft | null): DiffFile[] => (draft ? [...files, finish(draft)] : files);

/** Parses a unified diff, with or without git headers. Text it does not understand is skipped. */
export function parsePatch(patch: string): DiffFile[] {
  const lines = patch.replace(/\r\n?/g, "\n").split("\n");
  let files: DiffFile[] = [];
  let draft = null as Draft | null;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const current: Draft | null = draft;
    const git = GIT_HEADER.exec(line);
    const hunk: { hunk: DiffHunk; next: number } | null = current && HUNK_HEADER.test(line) ? readHunk(lines, index) : null;
    if (git) {
      files = closeFile(files, current);
      draft = { ...EMPTY, oldPath: git[1] ?? null, newPath: git[2] ?? null };
    } else if (line.startsWith("--- ") && (lines[index + 1] ?? "").startsWith("+++ ")) {
      const fresh = current === null || current.hunks.length > 0;
      if (fresh) files = closeFile(files, current);
      const base = fresh || current === null ? EMPTY : current;
      draft = { ...base, oldPath: cleanPath(line.slice(4)), newPath: cleanPath((lines[index + 1] ?? "").slice(4)) };
      index += 1;
    } else if (current && hunk) {
      draft = { ...current, hunks: [...current.hunks, hunk.hunk] };
      index = hunk.next;
      continue;
    } else if (current) {
      draft = applyHeader(current, line);
    }
    index += 1;
  }
  return closeFile(files, draft);
}

/** True when the text holds at least one file with a hunk, a rename or a binary change. */
export function isPatch(patch: string): boolean {
  return parsePatch(patch).some((file) => file.hunks.length > 0 || file.status === "renamed" || file.binary);
}

export function displayPath(file: DiffFile): string {
  if (file.status === "renamed") return `${file.oldPath ?? ""} → ${file.newPath ?? ""}`;
  return file.newPath ?? file.oldPath ?? "unknown file";
}
