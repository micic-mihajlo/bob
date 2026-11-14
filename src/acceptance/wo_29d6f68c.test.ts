import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoadmapPanel } from "@/components/features/roadmap/RoadmapPanel";
import { BobProvider } from "@/components/features/window/BobContext";
import { formatElapsed } from "@/lib/client/format";
import type { Roadmap, Snapshot } from "@/lib/types";

const gates = [
  { stage: 1, title: "Intent", done: true },
  { stage: 2, title: "Build", done: false },
  { stage: 3, title: "Ship", done: false },
];

const roadmap: Roadmap = {
  goal: { title: "Export tasks as CSV", why: null, deadline: null },
  stage: 2,
  stageTitle: "Build",
  totalStages: 3,
  gates,
  today: [],
  backlog: [],
  tracks: [
    {
      requestId: "r1",
      messageId: null,
      ask: "Export tasks as CSV",
      goal: { title: "Export tasks as CSV", why: null, deadline: null },
      stage: 2,
      stageTitle: "Build",
      gates,
      startedAt: "2026-11-14T12:00:00.000Z",
      updatedAt: "2026-11-14T12:03:05.000Z",
    },
  ],
  updatedAt: "2026-11-14T12:03:05.000Z",
};

const snapshot = {
  roadmap,
  agents: [],
  requests: [
    {
      requestId: "r1",
      ask: "Export tasks as CSV",
      startedAt: "2026-11-14T12:00:00.000Z",
      seconds: 185,
      running: true,
      turns: 1,
      modelCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      alerts: [],
    },
  ],
} as unknown as Snapshot;

describe("roadmap card elapsed timer", () => {
  /** The panel's resizer reads the window while rendering, which the node test environment does not have. */
  const withWindow = <T,>(run: () => T): T => {
    const globals = globalThis as { window?: unknown };
    globals.window = { innerWidth: 1200, matchMedia: () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }) };
    try {
      return run();
    } finally {
      delete globals.window;
    }
  };

  it("renders one track card whose elapsed timer carries the large-timer class and shows formatElapsed's value", () => {
    const html = withWindow(() =>
      renderToStaticMarkup(createElement(BobProvider, { snapshot, sync: "live" }, createElement(RoadmapPanel, { onClose: () => undefined }))),
    );

    expect(html.match(/aria-label="Export tasks as CSV"/g)).toHaveLength(1);
    expect(formatElapsed(185_000)).toBe("3m 05s");
    const timer = /<p class="bob-roadmap-timer"[^>]*>([^<]*)<\/p>/.exec(html);
    expect(timer?.[1]).toBe(formatElapsed(185_000));
  });
});
