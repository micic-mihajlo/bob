import { ArrowRight } from "lucide-react";
import { formatClock } from "@/lib/client/format";
import type { WhyHop } from "@/lib/types";

export function WhyHopRow({ hop, last }: { hop: WhyHop; last: boolean }) {
  const fromPerson = hop.message.from.kind === "user";
  return (
    <li className="why-hop" data-origin={last && fromPerson ? "" : undefined}>
      <span className="why-node" aria-hidden="true" />
      <div className="why-copy">
        <p className="why-route">
          <span>{fromPerson ? "You" : hop.fromName}</span>
          <ArrowRight className="icon" size={12} aria-label="to" />
          <span>{hop.toNames.join(", ")}</span>
          <time className="why-time" dateTime={hop.message.at}>
            {formatClock(hop.message.at)}
          </time>
        </p>
        <p className="why-text">{hop.message.text}</p>
        {last && fromPerson ? <p className="why-origin">Where it started</p> : null}
      </div>
    </li>
  );
}
