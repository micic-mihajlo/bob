import type { Token } from "@/lib/blocks/highlight";

/** Coloured tokens. Plain text renders without a span, so long lines stay light. */
export function Tokens({ tokens }: { tokens: readonly Token[] }) {
  return tokens.map((token, index) =>
    token.kind === "plain" ? (
      token.text
    ) : (
      <span key={index} className={`blk-tok-${token.kind}`}>
        {token.text}
      </span>
    ),
  );
}
