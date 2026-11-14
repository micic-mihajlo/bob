import { describe, expect, it } from "vitest";
import { buildVisualDocument, clampVisualHeight, readVisualMessage, VISUAL_MESSAGE_SOURCE } from "../visual-document";

const THEME = { "--fg": "#fff", "--evil": "red;}</style><script>alert(1)</script>" };

describe("buildVisualDocument", () => {
  it("wraps a fragment, even one that starts with a header element, in a full document", () => {
    const page = buildVisualDocument("<header>Build times</header><div>chart</div>", THEME);
    expect(page.startsWith("<!doctype html><html><head>")).toBe(true);
    expect(page).toContain("<body><header>Build times</header><div>chart</div></body>");
  });

  it("injects into the head of a full document", () => {
    const page = buildVisualDocument('<!doctype html><html lang="en"><head><title>x</title></head><body></body></html>', THEME);
    expect(page.indexOf("--fg:#fff")).toBeGreaterThan(page.indexOf("<head>"));
    expect(page.indexOf("--fg:#fff")).toBeLessThan(page.indexOf("<title>"));
  });

  it("keeps theme values from closing the style element", () => {
    const page = buildVisualDocument("<p>x</p>", THEME);
    expect(page).not.toContain("</style><script>alert");
  });
});

describe("visual messages", () => {
  it("accepts only tagged size and escape messages, and clamps the height", () => {
    expect(readVisualMessage({ source: VISUAL_MESSAGE_SOURCE, type: "size", height: 9000 })).toEqual({ type: "size", height: 9000 });
    expect(readVisualMessage({ type: "size", height: 10 })).toBeNull();
    expect(readVisualMessage({ source: VISUAL_MESSAGE_SOURCE, type: "size", height: "10" })).toBeNull();
    expect(readVisualMessage("escape")).toBeNull();
    expect([clampVisualHeight(null), clampVisualHeight(10), clampVisualHeight(9000)]).toEqual([240, 80, 600]);
  });
});
