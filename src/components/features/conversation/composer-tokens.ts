import { asciiFaceFrame, asciiFaceIdentity, drawAsciiFace } from "@/components/features/agents/ascii-face";
import type { Agent } from "@/lib/types";

/** An agent handle as the draft stores it: `@[Name](agent:id)`. */
export const MENTION_PATTERN = /@\[([^\]]+)]\(([^)]+)\)/g;

const CHIP_CLASSES = { root: "reference-chip", icon: "reference-chip-icon", name: "reference-chip-name" };

export function truncateComposerValue(value: string, limit: number): string {
  if (value.length <= limit) return value;
  let result = "";
  let cursor = 0;
  for (const match of value.matchAll(MENTION_PATTERN)) {
    const index = match.index ?? 0;
    const text = value.slice(cursor, index);
    if (result.length + text.length >= limit) {
      return result + text.slice(0, limit - result.length);
    }
    result += text;
    if (result.length + match[0].length > limit) return result;
    result += match[0];
    cursor = index + match[0].length;
  }
  return result + value.slice(cursor, cursor + limit - result.length);
}

/** The draft as it goes to the agent: each handle reads as `@Name`. */
export function expandComposerMentions(value: string): string {
  return value.replace(MENTION_PATTERN, (_match, name: string) => `@${name}`);
}

/** The agent's head, drawn once: a token is built outside React, so it has no animated avatar. */
function drawStaticMentionAvatar(avatar: HTMLElement, agent: Pick<Agent, "id" | "hue" | "kind">): void {
  queueMicrotask(() => {
    if (!avatar.isConnected) return;
    const canvas = document.createElement("canvas");
    canvas.className = "agent-avatar-ascii";
    avatar.replaceChildren(canvas);
    const size = avatar.getBoundingClientRect().width * 1.5;
    const context = canvas.getContext("2d");
    if (!context || size === 0) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const identity = asciiFaceIdentity(agent.id, agent.kind === "captain" ? null : agent.hue);
    drawAsciiFace(context, size, identity, asciiFaceFrame("idle", identity.phase, false, 0, null), true);
  });
}

export function createMentionToken(agent: Agent): HTMLSpanElement {
  const token = document.createElement("span");
  token.className = `composer-mention-token ${CHIP_CLASSES.root}`;
  token.dataset.kind = "agent";
  token.title = agent.name;
  token.contentEditable = "false";
  token.dataset.mentionId = agent.id;
  token.dataset.mentionName = agent.name;
  token.setAttribute("aria-label", `Agent ${agent.name}`);
  const avatar = document.createElement("span");
  avatar.className = `composer-mention-avatar agent-avatar agent-avatar-bob agent-avatar-motion-hover ${CHIP_CLASSES.icon}`;
  avatar.setAttribute("aria-hidden", "true");
  drawStaticMentionAvatar(avatar, agent);
  const name = document.createElement("span");
  name.className = CHIP_CLASSES.name;
  name.textContent = agent.name;
  token.append(avatar, name);
  return token;
}

function createUnavailableTagToken(id: string, name: string): HTMLSpanElement {
  const token = document.createElement("span");
  token.className = "composer-mention-token composer-tag-unavailable";
  token.contentEditable = "false";
  token.dataset.mentionId = id;
  token.dataset.mentionName = name;
  token.setAttribute("aria-label", `Unavailable agent ${name}`);
  token.textContent = name;
  return token;
}

export function renderEditorValue(editor: HTMLDivElement, value: string, agents: Agent[]) {
  editor.replaceChildren();
  let cursor = 0;
  for (const match of value.matchAll(MENTION_PATTERN)) {
    const index = match.index ?? 0;
    const [, name = "", target = ""] = match;
    if (index > cursor) editor.append(document.createTextNode(value.slice(cursor, index)));
    const id = target.startsWith("agent:") ? target.slice("agent:".length) : target;
    const agent = agents.find((candidate) => candidate.id === id);
    editor.append(agent ? createMentionToken(agent) : createUnavailableTagToken(id, name));
    cursor = index + match[0].length;
  }
  if (cursor < value.length) editor.append(document.createTextNode(value.slice(cursor)));
  if (value.endsWith("\n")) editor.append(document.createElement("br"));
}
