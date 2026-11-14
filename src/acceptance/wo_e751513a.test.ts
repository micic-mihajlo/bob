import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatAgo } from "../lib/format-time";

const read = (relative: string) => readFileSync(path.resolve(process.cwd(), relative), "utf8");

/** The declarations of one rule, matched by its selector. */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "s"));
  if (!match) throw new Error(`no rule for ${selector}`);
  return match[1];
}

/** A token's value, following a var() alias to the literal it names. */
function tokenValue(css: string, name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`no token ${name}`);
  const value = match[1].trim();
  const alias = value.match(/^var\((--bob-[\w-]+)\)$/);
  return alias ? tokenValue(css, alias[1]) : value;
}

function luminance(colour: string): number {
  const hex = colour.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!hex) throw new Error(`not a six-digit hex colour: ${colour}`);
  const channels = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("pull request card opened time", () => {
  it("keeps the opened-time colour token at 4.5:1 against the card surface token", () => {
    const cardCss = read("src/components/features/conversation/styles/interaction-cards.css");
    const tokensCss = read("src/components/theme/tokens.css");

    const surfaceToken = rule(cardCss, ".conversation-interaction-card").match(/background:\s*var\((--bob-[\w-]+)\)/)?.[1];
    expect(surfaceToken, "the card declares its surface as a token").toBeTruthy();
    const openedTimeToken = rule(cardCss, ".pull-request-opened-time").match(/color:\s*var\((--bob-[\w-]+)\)/)?.[1];
    expect(openedTimeToken, "the opened time declares its colour as a token").toBeTruthy();

    const ratio = contrast(tokenValue(tokensCss, openedTimeToken!), tokenValue(tokensCss, surfaceToken!));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("draws the opened time with formatAgo on the pull request card", () => {
    const card = read("src/components/features/conversation/PullRequestCard.tsx");
    expect(card).toContain("pull-request-opened-time");
    expect(card).toContain("formatAgo");
  });
});

describe("formatAgo's default clock", () => {
  afterEach(() => vi.useRealTimers());

  it("formats a 12000 ms gap as 12s ago when called with no clock argument", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T12:00:12.000Z"));
    expect(formatAgo(Date.parse("2026-11-14T12:00:00.000Z"))).toBe("12s ago");
  });

  it("passes the requested gaps with no clock argument", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T12:00:00.000Z"));
    const now = Date.now();
    expect(formatAgo(now - 5_000)).toBe("just now");
    expect(formatAgo(now - 12_000)).toBe("12s ago");
    expect(formatAgo(now - 300_000)).toBe("5m ago");
    expect(formatAgo(now - 7_200_000)).toBe("2h ago");
    expect(formatAgo(now - 3 * 86_400_000)).toBe("3d ago");
  });
});
