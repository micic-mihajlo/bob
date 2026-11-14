import type { Agent } from "@/lib/types";

/**
 * Where the picker hangs, and from which element. Like the queue panel, it is a child of
 * `.composer-wrap` that hangs from the composer's top edge, so the composer paints over its
 * bottom and it grows out from under the input. `mount` is undefined for an editor rendered
 * without a composer around it.
 */
export interface PickerFrame {
  mount: HTMLElement | undefined;
  bottom: number;
}

export type PickerOption = { type: "agent"; agent: Agent };

export function pickerOptionKey(option: PickerOption): string {
  return `agent:${option.agent.id}`;
}

export function pickerOptionText(option: PickerOption): string {
  return `${option.agent.name} Agent`;
}

export function pickerOptionDescription(option: PickerOption): string | undefined {
  return option.agent.description.trim() || option.agent.title.trim() || undefined;
}

/** Hangs the picker off the composer's top edge, inside the wrap the queue panel also sits in. */
export function measurePickerFrame(editor: HTMLElement): PickerFrame {
  const wrap = editor.closest(".composer-wrap");
  const composer = editor.closest(".composer");
  if (!(wrap instanceof HTMLElement) || !composer) return { mount: undefined, bottom: 0 };
  return { mount: wrap, bottom: wrap.getBoundingClientRect().bottom - composer.getBoundingClientRect().top };
}

interface MentionableAgent {
  name: string;
  title: string;
  description: string;
}

/** Lower case, without diacritics, so `e` finds `é`. */
function foldMentionText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}

/**
 * How well an agent answers the query, lower first; null when it does not. A hit in the name
 * outranks one in the title, and the title outranks the description, so the agent the user names
 * is at the top.
 */
function agentMentionRank(agent: MentionableAgent, query: string): number | null {
  const folded = foldMentionText(query.trim());
  if (!folded) return 0;
  const name = foldMentionText(agent.name);
  if (name === folded) return 0;
  if (name.startsWith(folded)) return 1;
  if (name.split(/[\s\-_]+/u).some((word) => word.startsWith(folded))) return 2;
  if (name.includes(folded)) return 3;
  const title = foldMentionText(agent.title);
  if (title.includes(folded)) return 4;
  const description = foldMentionText(agent.description);
  if (description.includes(folded)) return 5;
  // A query can run across fields, such as `alice eng` for Alice the engineer.
  return `${name} ${title} ${description}`.includes(folded) ? 6 : null;
}

/** The agents that match, best first. Agents of one rank keep their input order. */
export function rankAgentMentions<T extends MentionableAgent>(agents: readonly T[], query: string): T[] {
  const ranked = agents.flatMap((agent) => {
    const rank = agentMentionRank(agent, query);
    return rank === null ? [] : [{ agent, rank }];
  });
  ranked.sort((left, right) => left.rank - right.rank);
  return ranked.map(({ agent }) => agent);
}
