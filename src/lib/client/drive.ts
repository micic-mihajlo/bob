import type { DriveFile } from "@/lib/types";

const ORDER = ["DIGEST", "CREW", "NOTES"];

function rank(file: DriveFile): number {
  const index = ORDER.indexOf(file.name.replace(/\.md$/i, "").toUpperCase());
  return index < 0 ? ORDER.length : index;
}

/** The captain's files: the digest, the crew list and the notes first, then the rest by name. */
export function driveFilesInOrder(files: readonly DriveFile[] | undefined): DriveFile[] {
  return [...(files ?? [])].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** Rough size of a file's text in bytes, for the file row's meta line. */
export function textBytes(content: string): number {
  return new TextEncoder().encode(content).length;
}

/** "5 KB", "1.2 MB": the file size format of the reference file rows. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
