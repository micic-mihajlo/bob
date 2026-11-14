/** The shape of one theorem in GET /api/verification that the Verified pane groups. */
export interface TheoremLike {
  name: string;
  rule: string;
}

/** Theorems grouped by the rule they prove, rules in the order they first appear. */
export function groupTheorems<T extends TheoremLike>(theorems: readonly T[]): { rule: string; theorems: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const theorem of theorems) groups.set(theorem.rule, [...(groups.get(theorem.rule) ?? []), theorem]);
  return [...groups].map(([rule, entries]) => ({ rule, theorems: entries }));
}
