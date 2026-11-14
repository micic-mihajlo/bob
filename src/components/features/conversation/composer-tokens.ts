import { asciiFaceFrame, asciiFaceIdentity, drawAsciiFace } from "@/components/features/agents/ascii-face";
import type { Agent } from "@/lib/types";
import { BLOCK_PATTERN, LINK_PATTERN, blockChip, languageLabel, linkChip, serializeBlock, type PasteChip } from "./composer-paste";

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

const ICON_PATHS = {
  pull: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M6 9v12"/>',
  issue: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  text: '<path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/>',
};

/** A pasted link or block. The token keeps the exact draft text it stands for in `data-serialized`. */
export function createPasteToken(chip: PasteChip): HTMLSpanElement {
  const token = document.createElement("span");
  token.className = `composer-mention-token composer-paste-token ${CHIP_CLASSES.root}`;
  token.contentEditable = "false";
  const icon = document.createElement("span");
  icon.className = CHIP_CLASSES.icon;
  icon.setAttribute("aria-hidden", "true");
  const name = document.createElement("span");
  name.className = CHIP_CLASSES.name;
  token.append(icon, name);
  let path: string;
  if (chip.kind === "link") {
    token.dataset.serialized = chip.url;
    token.title = chip.url;
    token.setAttribute("aria-label", `Link ${chip.label}`);
    name.textContent = chip.label;
    path = ICON_PATHS[chip.icon];
  } else {
    const label = languageLabel(chip.language);
    const lines = `${chip.lines} ${chip.lines === 1 ? "line" : "lines"}`;
    token.dataset.serialized = serializeBlock(chip.language, chip.text);
    token.dataset.blockLanguage = chip.language;
    token.title = `${chip.text.split("\n", 1)[0]?.slice(0, 120) ?? ""}\nClick to edit`;
    token.setAttribute("aria-label", `${label}, ${lines}. Click to edit`);
    name.textContent = label;
    const meta = document.createElement("span");
    meta.className = "composer-paste-token-meta";
    meta.textContent = lines;
    token.append(meta);
    path = ["stacktrace", "log", "text"].includes(chip.language) ? ICON_PATHS.text : ICON_PATHS.code;
  }
  icon.innerHTML = `<svg class="lucide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
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

/** The first mention, block or link at or after `from`; the earliest start wins, so a link inside a block stays text. */
function nextToken(value: string, from: number): RegExpExecArray | null {
  let first: RegExpExecArray | null = null;
  for (const pattern of [MENTION_PATTERN, BLOCK_PATTERN, LINK_PATTERN]) {
    const search = new RegExp(pattern.source, "g");
    search.lastIndex = from;
    const match = search.exec(value);
    if (match && (!first || match.index < first.index)) first = match;
  }
  return first;
}

function tokenFor(text: string, agents: Agent[]): HTMLSpanElement | null {
  const mention = new RegExp(`^${MENTION_PATTERN.source}$`).exec(text);
  if (mention) {
    const [, name = "", target = ""] = mention;
    const id = target.startsWith("agent:") ? target.slice("agent:".length) : target;
    const agent = agents.find((candidate) => candidate.id === id);
    return agent ? createMentionToken(agent) : createUnavailableTagToken(id, name);
  }
  const block = new RegExp(`^${BLOCK_PATTERN.source}$`).exec(text);
  if (block) return createPasteToken(blockChip(block[2] ?? "", block[3] ?? ""));
  const link = linkChip(text);
  return link ? createPasteToken(link) : null;
}

export function renderEditorValue(editor: HTMLDivElement, value: string, agents: Agent[]) {
  editor.replaceChildren();
  let cursor = 0;
  for (let match = nextToken(value, 0); match; match = nextToken(value, cursor)) {
    const token = tokenFor(match[0], agents);
    if (match.index > cursor) editor.append(document.createTextNode(value.slice(cursor, match.index)));
    editor.append(token ?? document.createTextNode(match[0]));
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) editor.append(document.createTextNode(value.slice(cursor)));
  if (value.endsWith("\n")) editor.append(document.createElement("br"));
}
