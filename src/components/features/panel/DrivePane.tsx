"use client";

import { Folder, X } from "lucide-react";
import { useState } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { FileList } from "@/components/features/files/FileList";
import { FilePreviewPanel, FileSourceText } from "@/components/features/files/FilePreviewPanel";
import { MarkdownFilePreview } from "@/components/features/files/MarkdownFilePreview";
import { Button } from "@/components/ui/Button";
import { driveFilesInOrder, formatFileSize, textBytes } from "@/lib/client/drive";
import { fileCountLabel } from "@/lib/client/files-view";
import { formatClock } from "@/lib/client/format";
import { PaneFrame } from "./PaneFrame";

/**
 * The captain's drive: its digest, crew list and notes as the reference's chat Files list, and a
 * file opens in the reference file preview with Back to the list.
 */
export function DrivePane({ onClose }: { onClose: () => void }) {
  const { snapshot, captain } = useBob();
  const files = driveFilesInOrder(snapshot.drive);
  const [open, setOpen] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const [wrap, setWrap] = useState(false);
  const file = files.find((entry) => entry.name === open);
  const captainName = captain?.name ?? "The captain";
  const totalBytes = files.reduce((sum, entry) => sum + textBytes(entry.content), 0);

  if (file) {
    const markdown = /\.md$/i.test(file.name);
    return (
      <FilePreviewPanel
        title={file.name}
        label="Drive"
        onBack={() => {
          setOpen(null);
          setRaw(false);
        }}
        rawMarkdown={markdown ? { raw, onToggle: () => setRaw((value) => !value) } : undefined}
        wrapLines={!markdown || raw ? { wrap, onToggle: () => setWrap((value) => !value) } : undefined}
        copyText={file.content}
        onClose={onClose}
      >
        {file.content.trim() === "" ? (
          <p className="file-preview-folder-empty">Nothing written here yet.</p>
        ) : markdown && !raw ? (
          <MarkdownFilePreview className="file-preview-markdown" body={file.content} />
        ) : (
          <FileSourceText text={file.content} wrap={wrap} />
        )}
      </FilePreviewPanel>
    );
  }

  return (
    <PaneFrame className="conversation-files-panel" label={`Files in ${captainName}'s drive`}>
      <header className="file-preview-header conversation-files-header">
        <Folder className="file-preview-file-icon side-panel-pane-title" aria-hidden="true" />
        <h2 className="side-panel-pane-title">Drive</h2>
        <span className="conversation-files-summary">
          {fileCountLabel(files.length)} · {formatFileSize(totalBytes)}
        </span>
        <Button variant="ghost" className="browser-toolbar-button side-panel-pane-close" aria-label="Close files" data-cuelume-tap="close" onClick={onClose}>
          <X className="browser-toolbar-icon" aria-hidden="true" />
        </Button>
      </header>
      <div className="conversation-files-content">
        <div>
          <FileList
            label={`Files in ${captainName}'s drive`}
            groupByDay
            emptyTitle="The drive is empty"
            emptyDescription={`${captainName} keeps a digest, the Blob list and notes here as the work moves.`}
            rows={files.map((entry) => ({
              key: entry.name,
              name: entry.name,
              at: entry.updatedAt,
              size: textBytes(entry.content),
              meta: [formatFileSize(textBytes(entry.content)), formatClock(entry.updatedAt)].filter(Boolean),
              onOpen: () => setOpen(entry.name),
            }))}
          />
        </div>
      </div>
    </PaneFrame>
  );
}
