/** The order choices of the reference file list. */
export type FileSort = "newest" | "largest" | "name";

export const FILE_SORTS: ReadonlyArray<{ value: FileSort; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "largest", label: "Largest" },
  { value: "name", label: "Name" },
];

export function sortFiles<T extends { name: string; at: string; size?: number }>(files: readonly T[], sort: FileSort): T[] {
  return [...files].sort((left, right) => {
    if (sort === "largest") return (right.size ?? 0) - (left.size ?? 0);
    if (sort === "name") return left.name.localeCompare(right.name);
    return Date.parse(right.at) - Date.parse(left.at);
  });
}
