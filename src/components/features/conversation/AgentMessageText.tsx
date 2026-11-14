"use client";

import { Badge } from "@/components/ui/Badge";
import type { BadgeVariant } from "@/components/ui/classes";
import { reportView } from "@/lib/client/report-view";
import type { ReplyStatus } from "@/lib/reply-format";
import { MarkdownMessageText } from "./MarkdownMessageText";

const STATUS: Record<ReplyStatus, { label: string; variant: BadgeVariant }> = {
  done: { label: "Done", variant: "success-light" },
  partial: { label: "Partly done", variant: "warning-light" },
  blocked: { label: "Blocked", variant: "destructive-light" },
};

/**
 * An agent's message. A Status / Result / Evidence report reads as its status, the result, and the
 * evidence under a rule, instead of three labelled lines of prose.
 */
export function AgentMessageText({ text }: { text: string }) {
  const report = reportView(text);
  if (!report) return <MarkdownMessageText text={text} />;
  return (
    <>
      {report.lead ? <MarkdownMessageText text={report.lead} /> : null}
      <div className="bob-report" data-status={report.status}>
        <Badge variant={STATUS[report.status].variant} className="bob-report-status">
          {STATUS[report.status].label}
        </Badge>
        <MarkdownMessageText text={report.result} />
        <dl className="bob-report-facts">
          <div>
            <dt>Evidence</dt>
            <dd>
              <MarkdownMessageText text={report.evidence} />
            </dd>
          </div>
          {report.unblock ? (
            <div data-tone="blocked">
              <dt>Unblock</dt>
              <dd>
                <MarkdownMessageText text={report.unblock} />
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </>
  );
}
