import { splitPath, type DiffFile } from "@/lib/client/diff";
import type { ChangedFile } from "@/lib/types";

interface ChangedFileListProps {
  files: readonly ChangedFile[];
  diffs: readonly DiffFile[];
  onPick: (path: string, index: number) => void;
}

export function ChangedFileList({ files, diffs, onPick }: ChangedFileListProps) {
  return (
    <ul className="change-files" aria-label="Changed files">
      {files.map((file) => {
        const index = diffs.findIndex((diff) => diff.path === file.path);
        const { dir, base } = splitPath(file.path);
        return (
          <li key={file.path}>
            <button type="button" className="change-file" disabled={index < 0} title={file.path} onClick={() => onPick(file.path, index)}>
              <span className="change-file-path">
                <span className="pr-file-dir">{dir}</span>
                {base}
              </span>
              <span className="diff-count" data-kind="add">+{file.additions}</span>
              <span className="diff-count" data-kind="del">−{file.deletions}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
