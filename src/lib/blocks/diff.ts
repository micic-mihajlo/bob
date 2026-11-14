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

/** Reads one hunk by its `@@` counts, so a removed line that starts with `--` is not a header. */
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
  const take = (line: DiffLine) => {
    body = [...body, line];
  };
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const sign = line.charAt(0);
    if (sign === "\\") {
      const last = body[body.length - 1];
      if (last) body = [...body.slice(0, -1), { ...last, noNewline: true }];
    } else if (oldLeft <= 0 && newLeft <= 0) {
      break;
    } else if (sign === "+" && newLeft > 0) {
      take({ kind: "add", text: line.slice(1), oldNo: null, newNo, noNewline: false });
      newLeft -= 1;
      newNo += 1;
    } else if (sign === "-" && oldLeft > 0) {
      take({ kind: "del", text: line.slice(1), oldNo, newNo: null, noNewline: false });
      oldLeft -= 1;
      oldNo += 1;
    } else if ((sign === " " || line === "") && oldLeft > 0 && newLeft > 0) {
      take({ kind: "context", text: line.slice(1), oldNo, newNo, noNewline: false });
      oldLeft -= 1;
      newLeft -= 1;
      oldNo += 1;
      newNo += 1;
    } else {
      break;
    }
    index += 1;
  }
  return { hunk: { header: lines[start] ?? "", oldStart, newStart, section: found[5] ?? "", lines: body }, next: index };
}

const EMPTY: Draft = { oldPath: null, newPath: null, renamed: false, binary: false, hunks: [] };

/** Applies one git extended header line, such as `rename from`, to the file being read. */
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
