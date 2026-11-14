import { Check } from "lucide-react";
import type { MdItem } from "@/lib/blocks/markdown";
import { InlineView } from "./InlineView";
import { MarkdownNode } from "./MarkdownNode";

export function MarkdownListItem({ item }: { item: MdItem }) {
  // A tight item's first paragraph sits inline, so short lists keep their line height.
  const [first, ...rest] = item.children;
  const lead = first?.type === "paragraph" ? <InlineView nodes={first.inline} /> : null;
  const body = (lead ? rest : item.children).map((node, index) => <MarkdownNode key={index} node={node} />);
  if (item.checked === null) {
    return (
      <li>
        <div className="blk-md-item">
          {lead ? <span>{lead}</span> : null}
          {body}
        </div>
      </li>
    );
  }
  return (
    <li className="blk-task" data-checked={item.checked ? "" : undefined}>
      <div className="blk-md-item">
        <span className="blk-task-row">
          <span className="blk-task-box" data-checked={item.checked ? "" : undefined} role="img" aria-label={item.checked ? "Done" : "Not done"}>
            {item.checked ? <Check size={12} strokeWidth={2.5} aria-hidden="true" /> : null}
          </span>
          <span className="blk-task-text">{lead}</span>
        </span>
        {body}
      </div>
    </li>
  );
}
