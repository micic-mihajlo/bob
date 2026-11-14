"use client";

import { MessageSquarePlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { Button } from "@/components/ui/Button";
import { commentOnLines } from "@/lib/client/api";
import { displayName } from "@/lib/client/crew";
import type { DiffFile, DiffLine } from "@/lib/client/diff";
import type { PullRequestArtifact } from "@/lib/client/pull-requests";
import type { Artifact, LineComment } from "@/lib/types";

type CommentArtifact = Artifact & { lineComment: LineComment };

interface Selection {
  file: number;
  anchor: number;
  focus: number;
}

const lineNumber = (line: DiffLine | undefined) => (line && line.kind !== "hunk" && line.kind !== "note" ? (line.newNumber ?? line.oldNumber) : null);
const where = (c: Pick<LineComment, "path" | "startLine" | "endLine">) => `${c.path}:${c.startLine}${c.endLine > c.startLine ? `-${c.endLine}` : ""}`;
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
const commentId = (id: string) => `bob-comment-${id}`;

function setCommentUrl(pr: number, line: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("pr", String(pr));
  url.searchParams.set("line", line);
  window.history.replaceState(window.history.state, "", url);
}

/** The person's comment pinned under its lines like a post-it; once the pull request has a newer head it folds to "Resolved by". */
function CommentPin({ comment, headSha, focused }: { comment: CommentArtifact; headSha: string; focused: boolean }) {
  const { agentsById } = useBob();
  const owner = agentsById.get(comment.agentId);
  const resolved = headSha !== comment.lineComment.headSha;
  return (
    <span id={commentId(comment.id)} className="bob-line-comment" data-state={resolved ? "resolved" : "open"} data-focused={focused ? "" : undefined}>
      {resolved ? (
        <details className="bob-line-comment-resolved">
          <summary>Resolved by {headSha.slice(0, 7)}</summary>
          <span className="bob-line-comment-text">{comment.detail}</span>
        </details>
      ) : (
        <>
          <span className="bob-line-comment-text">{comment.detail}</span>
          <span className="bob-line-comment-meta">
            You on {where(comment.lineComment)}
            {owner ? ` · sent to ${displayName(owner)}` : null}
          </span>
        </>
      )}
    </span>
  );
}

function CommentComposer({ label, onSend, onCancel }: { label: string; onSend: (text: string) => Promise<string | null>; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const failed = await onSend(text);
    setSending(false);
    setError(failed);
  };
  return (
    <span className="bob-line-composer" onClick={(event) => event.stopPropagation()}>
      <textarea
        className="ui-input bob-line-composer-input"
        aria-label={`Comment on ${label}`}
        placeholder={`Comment on ${label}`}
        rows={2}
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void send();
          }
        }}
      />
      {error ? (
        <span className="bob-line-composer-error" role="alert">
          {error}
        </span>
      ) : null}
      <span className="bob-line-composer-actions">
        <Button variant="ghost" size="xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" disabled={!text.trim() || sending} onClick={() => void send()}>
          {sending ? "Sending…" : "Comment"}
        </Button>
      </span>
    </span>
  );
}

export interface DiffCommentProps {
  lineState: (index: number) => string | undefined;
  onLineClick: (index: number, event: MouseEvent) => void;
  afterLine: (index: number) => ReactNode;
}

/**
 * Line comments on a pull request's diff: click a line, shift-click to extend, then c or Comment. Each comment pins under
 * its lines. j and k move between files, n and p between comments, Esc closes. ?pr=&line= links to a comment.
 */
export function useDiffComments(pullRequest: PullRequestArtifact | undefined, diffs: readonly DiffFile[], fileId: (index: number) => string, maxLines: number) {
  const { snapshot } = useBob();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [composing, setComposing] = useState(false);
  const [file, setFile] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const linked = useRef(false);

  const comments = useMemo(
    () => snapshot.artifacts.filter((a): a is CommentArtifact => a.kind === "comment" && a.lineComment?.pullRequestId === pullRequest?.id),
    [snapshot.artifacts, pullRequest?.id],
  );

  const placed = useMemo(() => {
    const at = new Map<string, CommentArtifact[]>();
    const order: CommentArtifact[] = [];
    diffs.forEach((diff, d) => {
      const shown = diff.lines.slice(0, maxLines);
      for (const comment of comments.filter((c) => c.lineComment.path === diff.path).sort((a, b) => a.lineComment.endLine - b.lineComment.endLine)) {
        const found = shown.findIndex((line) => lineNumber(line) === comment.lineComment.endLine);
        const key = `${d}:${found >= 0 ? found : shown.length - 1}`;
        at.set(key, [...(at.get(key) ?? []), comment]);
        order.push(comment);
      }
    });
    return { at, order };
  }, [comments, diffs, maxLines]);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });

  useEffect(() => {
    if (linked.current || !pullRequest || placed.order.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("pr") !== String(pullRequest.pullRequest.number)) return;
    const target = placed.order.find((c) => where(c.lineComment) === params.get("line"));
    if (!target) return;
    linked.current = true;
    setFocused(target.id);
    requestAnimationFrame(() => scrollTo(commentId(target.id)));
  }, [pullRequest, placed.order]);

  const range = selection ? [Math.min(selection.anchor, selection.focus), Math.max(selection.anchor, selection.focus)] : null;
  const close = () => {
    setComposing(false);
    setSelection(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      if (event.key === "Escape" && (selection || composing)) {
        close();
        return;
      }
      if (event.key === "c" && selection && pullRequest) {
        event.preventDefault();
        setComposing(true);
        return;
      }
      if ((event.key === "j" || event.key === "k") && diffs.length > 0) {
        event.preventDefault();
        const next = Math.max(0, Math.min(diffs.length - 1, file + (event.key === "j" ? 1 : -1)));
        setFile(next);
        document.getElementById(fileId(next))?.scrollIntoView({ block: "start", behavior: "smooth" });
        return;
      }
      if ((event.key === "n" || event.key === "p") && placed.order.length > 0 && pullRequest) {
        event.preventDefault();
        const index = placed.order.findIndex((c) => c.id === focused);
        const step = event.key === "n" ? 1 : -1;
        const next = placed.order[index < 0 ? (step > 0 ? 0 : placed.order.length - 1) : (index + step + placed.order.length) % placed.order.length];
        setFocused(next.id);
        scrollTo(commentId(next.id));
        setCommentUrl(pullRequest.pullRequest.number, where(next.lineComment));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const forFile = (d: number): DiffCommentProps | undefined => {
    if (!pullRequest) return undefined;
    const diff = diffs[d];
    const pinned = new Set<number>();
    for (const comment of comments) {
      if (comment.lineComment.path !== diff.path || comment.lineComment.headSha !== pullRequest.pullRequest.headSha) continue;
      for (let n = comment.lineComment.startLine; n <= comment.lineComment.endLine; n++) pinned.add(n);
    }
    const selected = (i: number) => selection?.file === d && range !== null && i >= range[0] && i <= range[1];
    return {
      lineState: (i) => {
        const n = lineNumber(diff.lines[i]);
        if (n === null) return undefined;
        if (selected(i)) return "selected";
        return pinned.has(n) ? "pinned" : "selectable";
      },
      onLineClick: (i, event) => {
        if (lineNumber(diff.lines[i]) === null) return;
        setFile(d);
        setSelection(event.shiftKey && selection?.file === d ? { ...selection, focus: i } : { file: d, anchor: i, focus: i });
        setComposing(false);
      },
      afterLine: (i) => {
        const pins = placed.at.get(`${d}:${i}`) ?? [];
        const lines =
          selection?.file === d && range !== null && i === range[1]
            ? { path: diff.path, startLine: lineNumber(diff.lines[range[0]]) ?? 1, endLine: lineNumber(diff.lines[range[1]]) ?? 1 }
            : null;
        if (pins.length === 0 && !lines) return null;
        return (
          <>
            {pins.map((comment) => (
              <CommentPin key={comment.id} comment={comment} headSha={pullRequest.pullRequest.headSha} focused={focused === comment.id} />
            ))}
            {lines && composing ? (
              <CommentComposer
                label={where(lines)}
                onCancel={close}
                onSend={async (text) => {
                  const result = await commentOnLines(pullRequest.id, { ...lines, text });
                  if (!result.ok) return result.error;
                  close();
                  setCommentUrl(pullRequest.pullRequest.number, where(lines));
                  return null;
                }}
              />
            ) : null}
            {lines && !composing ? (
              <span className="bob-line-comment-affordance">
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    setComposing(true);
                  }}
                >
                  <MessageSquarePlus aria-hidden="true" />
                  Comment
                  <kbd>c</kbd>
                </Button>
              </span>
            ) : null}
          </>
        );
      },
    };
  };

  return forFile;
}
