"use client";

import { ArrowLeft, Code, File, Folder, WrapText, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PaneFrame } from "@/components/features/panel/PaneFrame";
import { Button } from "@/components/ui/Button";
import { CopyTextButton } from "./CodeBlock";

export interface FilePreviewPanelProps {
  title: string;
  /** The full path, for the title's tooltip. */
  path?: string;
  icon?: "file" | "folder" | LucideIcon;
  /** Goes to the folder the file came from, or to the parent of the folder. */
  onBack?: (() => void) | undefined;
  /** Set for a Markdown file: the source toggle. */
  rawMarkdown?: { raw: boolean; onToggle: () => void } | undefined;
  /** Set while source text shows: the wrap toggle. */
  wrapLines?: { wrap: boolean; onToggle: () => void } | undefined;
  /** The text Copy takes. */
  copyText?: string | undefined;
  /** Shown after the title, such as a file count. */
  summary?: ReactNode;
  onClose: () => void;
  label?: string;
  className?: string;
  children: ReactNode;
}

/**
 * The reference file preview's frame as a side panel pane: Back, the file or folder icon, the name,
 * the source and wrap toggles, Copy and Close, then the content. In the dock the tab closes the pane,
 * so Close hides there.
 */
export function FilePreviewPanel({
  title,
  path,
  icon = "file",
  onBack,
  rawMarkdown,
  wrapLines,
  copyText,
  summary,
  onClose,
  label = "File preview",
  className,
  children,
}: FilePreviewPanelProps) {
  const Icon = icon === "file" ? File : icon === "folder" ? Folder : icon;
  return (
    <PaneFrame id="file-preview-panel" className={`file-preview-panel${className ? ` ${className}` : ""}`} label={label} slide>
      <header className="file-preview-header">
        {onBack ? (
          <Button variant="ghost" className="browser-toolbar-button" aria-label="Back" onClick={onBack}>
            <ArrowLeft className="browser-toolbar-icon" aria-hidden="true" />
          </Button>
        ) : null}
        <Icon className="file-preview-file-icon" aria-hidden="true" />
        <h2 title={path ?? title}>{title}</h2>
        {summary}
        {rawMarkdown ? (
          <Button
            variant="ghost"
            className="browser-toolbar-button"
            aria-label="Show Markdown source"
            aria-pressed={rawMarkdown.raw ? "true" : "false"}
            onClick={rawMarkdown.onToggle}
          >
            <Code className="browser-toolbar-icon" aria-hidden="true" />
          </Button>
        ) : null}
        {wrapLines ? (
          <Button
            variant="ghost"
            className="browser-toolbar-button"
            aria-label="Wrap long lines"
            aria-pressed={wrapLines.wrap ? "true" : "false"}
            onClick={wrapLines.onToggle}
          >
            <WrapText className="browser-toolbar-icon" aria-hidden="true" />
          </Button>
        ) : null}
        {copyText ? <CopyTextButton text={copyText} label="Copy file text" /> : null}
        <Button variant="ghost" className="browser-toolbar-button side-panel-pane-close" aria-label="Close file preview" data-cuelume-tap="close" onClick={onClose}>
          <X className="browser-toolbar-icon" aria-hidden="true" />
        </Button>
      </header>
      <div className="file-preview-content">{children}</div>
    </PaneFrame>
  );
}

/** A file's text as the preview shows its source. */
export function FileSourceText({ text, wrap }: { text: string; wrap: boolean }) {
  return <pre className={wrap ? "file-preview-text file-preview-text-wrap" : "file-preview-text"}>{text}</pre>;
}

export interface FolderEntry {
  name: string;
  path: string;
  kind: "file" | "dir";
  meta?: string;
}

/** A folder's entries, folders first, as the reference preview lists a workspace folder. */
export function FolderEntries({ label, entries, onOpen }: { label: string; entries: readonly FolderEntry[]; onOpen: (entry: FolderEntry) => void }) {
  if (entries.length === 0) return <p className="file-preview-folder-empty">This folder is empty.</p>;
  return (
    <ul className="file-preview-folder" aria-label={label}>
      {entries.map((entry) => (
        <li key={entry.path}>
          <Button variant="ghost" className="file-preview-folder-entry" title={entry.path} onClick={() => onOpen(entry)}>
            {entry.kind === "dir" ? <Folder className="file-preview-file-icon" aria-hidden="true" /> : <File className="file-preview-file-icon" aria-hidden="true" />}
            <span className="file-preview-folder-name">{entry.name}</span>
            <span className="file-preview-folder-meta">{entry.meta ?? ""}</span>
            <span className="file-preview-folder-meta" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
