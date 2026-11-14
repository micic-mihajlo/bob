export const VISUAL_HEIGHT = { min: 80, initial: 240, max: 600 } as const;

/** Tags every message the frame's script posts, so the parent can tell them from other messages. */
export const VISUAL_MESSAGE_SOURCE = "blocks-visual";

/** Page variable name, then the app token it is read from. */
export const VISUAL_THEME_TOKENS: ReadonlyArray<readonly [string, string]> = [
  ["--fg", "--color-ink"],
  ["--fg-secondary", "--color-ink-secondary"],
  ["--muted", "--color-ink-muted"],
  ["--surface", "--color-surface"],
  ["--surface-raised", "--color-surface-raised"],
  ["--border", "--color-border-strong"],
  ["--line", "--color-line"],
  ["--success", "--color-success"],
  ["--warning", "--color-warning"],
  ["--danger", "--color-danger-text"],
  ["--radius", "--radius-md"],
  ["--font-sans", "--font-sans"],
  ["--font-mono", "--font-mono"],
];

/** Chart hues at the app's agent lightness and chroma, so a chart reads like the rest of the app. */
export const VISUAL_CHART_HUES = [250, 150, 40, 320, 200, 90] as const;

export type VisualTheme = Readonly<Record<string, string>>;

export type VisualMessage = { type: "size"; height: number } | { type: "escape" };

/** Validates a message from the frame. Anything else is ignored. */
export function readVisualMessage(data: unknown): VisualMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.source !== VISUAL_MESSAGE_SOURCE) return null;
  if (record.type === "escape") return { type: "escape" };
  if (record.type === "size" && typeof record.height === "number" && Number.isFinite(record.height)) {
    return { type: "size", height: record.height };
  }
  return null;
}

export function clampVisualHeight(reported: number | null): number {
  if (reported === null) return VISUAL_HEIGHT.initial;
  return Math.min(VISUAL_HEIGHT.max, Math.max(VISUAL_HEIGHT.min, Math.ceil(reported)));
}

// A value must not close the style element or the rule it sits in.
const safeValue = (value: string): string => value.replace(/[<>{};]/g, "");

function themeStyle(theme: VisualTheme): string {
  const variables = Object.entries(theme)
    .map(([name, value]) => `${name}:${safeValue(value)};`)
    .join("");
  return `<style>:root{color-scheme:dark;--bg:transparent;${variables}}html,body{margin:0;background:transparent;color:var(--fg);font:13px/18px var(--font-sans);}</style>`;
}

const REPORTER = `<script>(()=>{const post=(m)=>parent.postMessage(Object.assign({source:${JSON.stringify(
  VISUAL_MESSAGE_SOURCE,
)}},m),"*");let last=-1;const report=()=>{const b=document.body;if(!b)return;const h=Math.ceil(b.getBoundingClientRect().bottom+parseFloat(getComputedStyle(b).marginBottom||"0"));if(h>0&&h!==last){last=h;post({type:"size",height:h});}};const start=()=>{report();new ResizeObserver(report).observe(document.body);};if(document.body)start();else addEventListener("DOMContentLoaded",start);addEventListener("load",report);addEventListener("resize",report);addEventListener("keydown",(e)=>{if(e.key==="Escape")post({type:"escape"});});})();</script>`;

/**
 * The agent's HTML plus theme variables and a reporter script. Escape is forwarded because keys
 * pressed inside the frame never reach the app. A frame that loads off screen or hidden can measure
 * its body as zero until the browser renders it, so a zero is never reported; the resize observer
 * sends the real height once it renders.
 */
export function buildVisualDocument(html: string, theme: VisualTheme): string {
  const head = `<meta charset="utf-8">${themeStyle(theme)}${REPORTER}`;
  const headTag = /<head(?:\s[^>]*)?>/i.exec(html);
  if (headTag) return html.replace(headTag[0], () => `${headTag[0]}${head}`);
  const htmlTag = /<html(?:\s[^>]*)?>/i.exec(html);
  if (htmlTag) return html.replace(htmlTag[0], () => `${htmlTag[0]}<head>${head}</head>`);
  return `<!doctype html><html><head>${head}</head><body>${html}</body></html>`;
}
