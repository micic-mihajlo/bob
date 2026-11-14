"use client";

import { RefreshCw, Search, TriangleAlert } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { BadgeVariant } from "@/components/ui/classes";
import { Skeleton } from "@/components/ui/Surface";
import { fileBadge, fileReferenceTone, type FileReferenceTone } from "@/lib/client/file-reference";
import { FILE_TYPE_FILTERS, fileCountLabel, fileTypeCounts, groupFilesByDay, queryFiles, type FileQuery } from "@/lib/client/files-view";

export interface FileListRow {
  key: string;
  name: string;
  /** When it was made or last changed, for the day groups. */
  at: string;
  meta: readonly string[];
  /** The badge text; the file's extension when absent. */
  badge?: string;
  tone?: FileReferenceTone;
  status?: { label: string; variant: BadgeVariant };
  /** Accessible name of the row's main button. */
  actionLabel?: string;
  /** Takes the place of the reference's row menu. */
  trailing?: ReactNode;
  disabled?: boolean;
  onOpen: () => void;
}

export interface FileListProps {
  label: string;
  rows: readonly FileListRow[];
  /** Day headings between rows, newest first. */
  groupByDay?: boolean;
  /** Search and type filters above the rows. */
  filters?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle: string;
  emptyDescription: string;
}

const LOADING_ROWS = [0, 1, 2, 3, 4];

/** The reference's compact file list: search, type filters, day groups and file rows. */
export function FileList({ label, rows, groupByDay = false, filters = true, loading, error, onRetry, emptyTitle, emptyDescription }: FileListProps) {
  const [query, setQuery] = useState<FileQuery>({ search: "", type: "all" });
  const searched = useMemo(() => queryFiles(rows, { ...query, type: "all" }), [rows, query]);
  const counts = fileTypeCounts(searched);
  const visible = queryFiles(rows, query);
  const groups = groupByDay ? groupFilesByDay(visible, new Date()) : [{ key: "all", label: "", files: visible }];
  const filtered = query.search.trim() !== "" || query.type !== "all";

  return (
    <section className="file-list" data-compact="true" aria-label={label}>
      {filters ? (
        <>
          <div className="file-list-toolbar">
            <div className="file-list-search">
              <Search className="file-list-search-icon" aria-hidden="true" />
              <input
                data-cuelume-type=""
                type="search"
                placeholder="Search files"
                className="ui-input file-list-search-input"
                data-size="sm"
                aria-label="Search files"
                value={query.search}
                onChange={(event) => setQuery((previous) => ({ ...previous, search: event.target.value }))}
              />
            </div>
          </div>
          <fieldset className="file-list-filters" aria-label="File type">
            {FILE_TYPE_FILTERS.filter((filter) => filter.value === "all" || counts[filter.value] > 0).map((filter) => (
              <Button
                key={filter.value}
                size="xs"
                variant="ghost"
                className="file-list-filter"
                aria-pressed={query.type === filter.value ? "true" : "false"}
                data-cuelume-tap="select"
                onClick={() => setQuery((previous) => ({ ...previous, type: filter.value }))}
              >
                {filter.label}
                <span className="file-list-filter-count">{counts[filter.value]}</span>
              </Button>
            ))}
          </fieldset>
        </>
      ) : null}

      {loading ? (
        <div className="file-list-rows" role="status" aria-busy="true" aria-label="Loading files">
          {LOADING_ROWS.map((row) => (
            <Skeleton key={row} className="file-list-skeleton" />
          ))}
        </div>
      ) : error ? (
        <div className="file-list-message" role="alert">
          <TriangleAlert className="file-list-message-icon" data-tone="danger" aria-hidden="true" />
          <p className="file-list-message-title">Files could not load</p>
          <p className="file-list-message-description">{error}</p>
          {onRetry ? (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              <RefreshCw className="files-button-icon" aria-hidden="true" />
              Try again
            </Button>
          ) : null}
        </div>
      ) : rows.length === 0 ? (
        <div className="file-list-message">
          <p className="file-list-message-title">{emptyTitle}</p>
          <p className="file-list-message-description">{emptyDescription}</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="file-list-message">
          <p className="file-list-message-title">No matching files</p>
          {filtered ? (
            <Button size="sm" variant="secondary" onClick={() => setQuery({ search: "", type: "all" })}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          {filtered ? (
            <p className="file-list-summary" aria-live="polite">
              {fileCountLabel(visible.length)} of {rows.length}
            </p>
          ) : null}
          {groups.map((group) => (
            <div key={group.key} className="file-list-group">
              {group.label ? <h3 className="file-list-group-heading">{group.label}</h3> : null}
              <ul className="file-list-rows">
                {group.files.map((row) => (
                  <FileRow key={row.key} row={row} />
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function FileRow({ row }: { row: FileListRow }) {
  return (
    <li className="file-row" data-status="available">
      <Button variant="ghost" className="file-row-main" disabled={row.disabled} aria-label={row.actionLabel ?? `Preview ${row.name}`} onClick={row.onOpen}>
        <span className="files-file-visual" aria-hidden="true" data-file-tone={row.tone ?? fileReferenceTone(row.name)} data-status="available">
          {row.badge ?? fileBadge(row.name)}
        </span>
        <span className="file-row-copy">
          <span className="file-row-name" title={row.name}>
            {row.name}
          </span>
          <span className="file-row-meta">
            {row.meta.map((part, index) => (
              <Fragment key={index}>
                {index > 0 ? <span aria-hidden="true"> · </span> : null}
                <span className="file-row-meta-part">{part}</span>
              </Fragment>
            ))}
          </span>
        </span>
      </Button>
      {row.status ? (
        <Badge className="file-row-status" variant={row.status.variant}>
          {row.status.label}
        </Badge>
      ) : null}
      {row.trailing}
    </li>
  );
}
