/** Labels, filters and grouping of the reference file list, for rows Bob already has. */

export type FileType = "images" | "documents" | "code" | "spreadsheets" | "media" | "other";
export type FileTypeFilter = "all" | FileType;

export const FILE_TYPE_FILTERS: ReadonlyArray<{ value: FileTypeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "images", label: "Images" },
  { value: "documents", label: "Documents" },
  { value: "code", label: "Code" },
  { value: "spreadsheets", label: "Spreadsheets" },
  { value: "media", label: "Audio and video" },
  { value: "other", label: "Other" },
];

const IMAGE_EXTENSIONS = new Set(["avif", "gif", "heic", "jpeg", "jpg", "png", "svg", "webp"]);
const DOCUMENT_EXTENSIONS = new Set(["doc", "docx", "md", "odt", "pdf", "ppt", "pptx", "rtf", "txt"]);
const CODE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "go",
  "html",
  "java",
  "js",
  "json",
  "jsx",
  "php",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "swift",
  "ts",
  "tsx",
  "vue",
  "yaml",
  "yml",
]);
const SPREADSHEET_EXTENSIONS = new Set(["csv", "numbers", "ods", "tsv", "xls", "xlsx"]);
const MEDIA_EXTENSIONS = new Set(["aac", "flac", "m4a", "mov", "mp3", "mp4", "ogg", "wav", "webm"]);

export function fileTypeOf(name: string): FileType {
  const extension = name.includes(".") ? (name.split(".").at(-1)?.toLocaleLowerCase() ?? "") : "";
  if (IMAGE_EXTENSIONS.has(extension)) return "images";
  if (MEDIA_EXTENSIONS.has(extension)) return "media";
  if (SPREADSHEET_EXTENSIONS.has(extension)) return "spreadsheets";
  if (CODE_EXTENSIONS.has(extension)) return "code";
  if (DOCUMENT_EXTENSIONS.has(extension)) return "documents";
  return "other";
}

export interface FileQuery {
  search: string;
  type: FileTypeFilter;
}

export function queryFiles<T extends { name: string }>(files: readonly T[], query: FileQuery): T[] {
  const search = query.search.trim().toLocaleLowerCase();
  return files.filter(
    (file) => (query.type === "all" || fileTypeOf(file.name) === query.type) && (!search || file.name.toLocaleLowerCase().includes(search)),
  );
}

/** Counts per type for the filter chips. Counts ignore the current type filter but follow the search. */
export function fileTypeCounts(files: readonly { name: string }[]): Record<FileTypeFilter, number> {
  const counts: Record<FileTypeFilter, number> = { all: files.length, images: 0, documents: 0, code: 0, spreadsheets: 0, media: 0, other: 0 };
  for (const file of files) counts[fileTypeOf(file.name)] += 1;
  return counts;
}

export function fileCountLabel(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/** "Today", "Yesterday", or a short date, as the reference file list heads its day groups. */
export function fileDayLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

/** Newest first, one group per day. */
export function groupFilesByDay<T extends { at: string }>(files: readonly T[], now: Date): { key: string; label: string; files: T[] }[] {
  const sorted = [...files].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const groups: { key: string; label: string; files: T[] }[] = [];
  for (const file of sorted) {
    const label = fileDayLabel(file.at, now);
    const last = groups.at(-1);
    if (last?.label === label) last.files.push(file);
    else groups.push({ key: `${label}-${groups.length}`, label, files: [file] });
  }
  return groups;
}
