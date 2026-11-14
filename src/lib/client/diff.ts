export type DiffLineKind = "add" | "del" | "context" | "hunk" | "note";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldNumber: number | null;
  newNumber: number | null;
}

export interface DiffFile {
  path: string;
  status: "added" | "deleted" | "modified" | "renamed";
  binary: boolean;
  lines: readonly DiffLine[];
}

interface Cursor {
  files: DiffFile[];
  oldLine: number;
  newLine: number;
  /** Lines the open hunk still owes on each side. Both at zero means the hunk is over. */
  oldLeft: number;
  newLeft: number;
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function inHunk(cursor: Cursor): boolean {
  return cursor.oldLeft > 0 || cursor.newLeft > 0;
}

function stripPrefix(path: string): string {
  return path.replace(/^[ab]\//, "").replace(/\t.*$/, "");
}

function withCurrent(cursor: Cursor, change: (file: DiffFile) => DiffFile): Cursor {
  const current = cursor.files.at(-1);
  if (!current) return cursor;
  return { ...cursor, files: [...cursor.files.slice(0, -1), change(current)] };
}

function addLine(cursor: Cursor, line: DiffLine): Cursor {
  return withCurrent(cursor, (file) => ({ ...file, lines: [...file.lines, line] }));
}

function startFile(cursor: Cursor, path: string): Cursor {
  return { ...cursor, oldLeft: 0, newLeft: 0, files: [...cursor.files, { path, status: "modified", binary: false, lines: [] }] };
}

function headerLine(cursor: Cursor, raw: string): Cursor {
  if (raw.startsWith("new file mode")) return withCurrent(cursor, (file) => ({ ...file, status: "added" }));
  if (raw.startsWith("deleted file mode")) return withCurrent(cursor, (file) => ({ ...file, status: "deleted" }));
  if (raw.startsWith("rename to ")) return withCurrent(cursor, (file) => ({ ...file, status: "renamed", path: raw.slice(10) }));
  if (raw.startsWith("Binary files")) return withCurrent(cursor, (file) => ({ ...file, binary: true }));
  if (raw.startsWith("+++ ") && raw !== "+++ /dev/null") return withCurrent(cursor, (file) => ({ ...file, path: stripPrefix(raw.slice(4)) }));
  return cursor;
}

function hunkLine(cursor: Cursor, raw: string): Cursor {
  const sign = raw.charAt(0);
  const text = raw.slice(1);
  if (sign === "+") {
    const next = addLine(cursor, { kind: "add", text, oldNumber: null, newNumber: cursor.newLine });
    return { ...next, newLine: cursor.newLine + 1, newLeft: cursor.newLeft - 1 };
  }
  if (sign === "-") {
    const next = addLine(cursor, { kind: "del", text, oldNumber: cursor.oldLine, newNumber: null });
    return { ...next, oldLine: cursor.oldLine + 1, oldLeft: cursor.oldLeft - 1 };
  }
  const next = addLine(cursor, { kind: "context", text, oldNumber: cursor.oldLine, newNumber: cursor.newLine });
  return { ...next, oldLine: cursor.oldLine + 1, newLine: cursor.newLine + 1, oldLeft: cursor.oldLeft - 1, newLeft: cursor.newLeft - 1 };
}

function step(cursor: Cursor, raw: string): Cursor {
  if (raw.startsWith("diff --git ")) {
    const match = / b\/(.+)$/.exec(raw);
    return startFile(cursor, match?.[1] ?? raw.slice(11));
  }
  if (raw.startsWith("\\ ")) return addLine(cursor, { kind: "note", text: raw.slice(2), oldNumber: null, newNumber: null });
  // A patch without git headers starts its file at the "---" line.
  if (raw.startsWith("--- ") && !inHunk(cursor)) {
    const opened = cursor.files.length === 0 || cursor.files.at(-1)?.lines.length ? startFile(cursor, stripPrefix(raw.slice(4))) : cursor;
    return raw === "--- /dev/null" ? withCurrent(opened, (file) => ({ ...file, status: "added" })) : opened;
  }
  if (raw === "+++ /dev/null" && !inHunk(cursor)) return withCurrent(cursor, (file) => ({ ...file, status: "deleted" }));
  const hunk = HUNK.exec(raw);
  if (hunk) {
    const next = addLine(cursor, { kind: "hunk", text: raw, oldNumber: null, newNumber: null });
    const oldLine = Number(hunk[1]);
    const newLine = Number(hunk[3]);
    return { ...next, oldLine, newLine, oldLeft: Number(hunk[2] ?? 1), newLeft: Number(hunk[4] ?? 1) };
  }
  if (!inHunk(cursor)) return headerLine(cursor, raw);
  return hunkLine(cursor, raw);
}

/** Parses a unified diff. A patch cut short ends its last file where the text stops. */
export function parseUnifiedDiff(patch: string): DiffFile[] {
  const start: Cursor = { files: [], oldLine: 0, newLine: 0, oldLeft: 0, newLeft: 0 };
  return patch.split("\n").reduce(step, start).files;
}

export function splitPath(path: string): { dir: string; base: string } {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? { dir: "", base: path } : { dir: path.slice(0, slash + 1), base: path.slice(slash + 1) };
}
