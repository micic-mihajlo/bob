import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/agents/bob-agent/[user]/prompt/route";
import { getState } from "../store";
import { freshTeam } from "./helpers";

describe("desktop bridge prompt route", () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("posts the prompt to the captain, so the web thread shows it", async () => {
    const abort = new AbortController();
    const response = await POST(
      new Request("http://bob.test/agents/bob-agent/me/prompt", {
        method: "POST",
        body: JSON.stringify({ text: "Add a health check", timezone: "UTC", client: "desktop", clientTools: [] }),
        signal: abort.signal,
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson");
    const captain = getState().agents.find((a) => a.kind === "captain")!;
    const message = getState().messages.find((m) => m.text === "Add a health check");
    expect(message).toMatchObject({ from: { kind: "user" }, to: [captain.id] });
    abort.abort();
    await response.body?.cancel();
  });
});
