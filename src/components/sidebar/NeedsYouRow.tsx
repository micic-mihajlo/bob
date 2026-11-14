"use client";

import { Hand, MessageCircleQuestion, TriangleAlert, type LucideIcon } from "lucide-react";
import { useBob } from "@/components/app/BobContext";
import { CodeChip } from "@/components/common/CodeChip";
import { displayName } from "@/lib/client/crew";
import type { NeedsYouItem } from "@/lib/types";

const KIND_ICON: Record<NeedsYouItem["kind"], LucideIcon> = { approval: Hand, question: MessageCircleQuestion, failed: TriangleAlert };
const KIND_LABEL: Record<NeedsYouItem["kind"], string> = { approval: "Approval", question: "Question", failed: "Failed" };

export function NeedsYouRow({ item }: { item: NeedsYouItem }) {
  const { agentsById, focusThread } = useBob();
  const agent = agentsById.get(item.agentId);
  const Icon = KIND_ICON[item.kind];

  return (
    <button
      type="button"
      className="needs-row"
      data-kind={item.kind}
      onClick={() => focusThread({ agentId: item.agentId, approvalId: item.approvalId ?? null })}
    >
      <span className="needs-row-icon" aria-hidden="true">
        <Icon className="icon" size={14} />
      </span>
      <span className="team-row-text">
        <span className="needs-row-top">
          <span className="sr-only">{KIND_LABEL[item.kind]} from </span>
          {agent ? <CodeChip code={displayName(agent)} /> : null}
          <strong className="needs-row-title">{item.title}</strong>
        </span>
        {item.detail ? <span className="team-row-line">{item.detail}</span> : null}
      </span>
    </button>
  );
}
