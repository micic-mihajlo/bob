import type { Token } from "@/lib/blocks/highlight";

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
