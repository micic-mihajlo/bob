import type { NeedsYouItem } from "@/lib/types";
import { NeedsYouRow } from "./NeedsYouRow";

export function NeedsYouGroup({ items }: { items: readonly NeedsYouItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="needs-you" aria-labelledby="needs-you-heading">
      <h2 id="needs-you-heading" className="needs-you-name">
        Needs you
        <span className="needs-you-count" aria-label={`${items.length} waiting`}>
          {items.length}
        </span>
      </h2>
      {items.map((item) => (
        <NeedsYouRow key={item.id} item={item} />
      ))}
    </section>
  );
}
