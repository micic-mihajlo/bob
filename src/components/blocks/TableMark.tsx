import { Check, X } from "lucide-react";
import { parseInline } from "@/lib/blocks/inline";
import { markOf } from "@/lib/blocks/table";
import { InlineView } from "./InlineView";

export function TableMark({ cell }: { cell: string }) {
  const mark = markOf(cell);
  if (mark === null) return <InlineView nodes={parseInline(cell)} />;
  return (
    <span className="blk-mark" data-mark={mark} role="img" aria-label={mark === "yes" ? "Yes" : "No"}>
      {mark === "yes" ? <Check size={12} strokeWidth={2.5} aria-hidden="true" /> : <X size={12} strokeWidth={2.5} aria-hidden="true" />}
    </span>
  );
}
