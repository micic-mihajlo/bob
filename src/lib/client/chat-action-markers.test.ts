import { describe, expect, it } from "vitest";
import { chatActionMarkers } from "./chat-action-markers";
import type { ConversationRow } from "./conversation-rows";

const sent = (id: string, at: string): ConversationRow => ({
  kind: "sent",
  id,
  at,
  item: { kind: "message_out", id, turnId: "turn" as never, messageId: id as never, to: ["tas-1" as never], text: "Do it", expectsReply: false, at },
});
const received = (id: string, at: string): ConversationRow => ({
  kind: "received",
  id,
  at,
  item: { kind: "message_in", id, messageId: id as never, from: "tas-1" as never, text: "Done", isReply: true, at },
});
const notice = (id: string, at: string): ConversationRow => ({ kind: "notice", id, at, item: { kind: "notice", id, tone: "warning", text: "Stopped", at } });

describe("chatActionMarkers", () => {
  it("joins consecutive agent messages into one group drawn by the first row", () => {
    const markers = chatActionMarkers([sent("a", "2026-11-14T10:00:00Z"), received("b", "2026-11-14T10:01:00Z")], "bob" as never, [], {}, new Set());
    expect(markers.get("a")).toMatchObject({ kind: "agent-message-group", timestamp: "2026-11-14T10:01:00Z" });
    expect(markers.get("b")).toBeNull();
  });

  it("stops a run at a notice, a new day and the first unread row", () => {
    const rows = [
      sent("a", "2026-11-13T10:00:00Z"),
      received("b", "2026-11-14T10:00:00Z"),
      notice("c", "2026-11-14T10:01:00Z"),
      sent("d", "2026-11-14T10:02:00Z"),
      received("e", "2026-11-14T10:03:00Z"),
    ];
    const markers = chatActionMarkers(rows, "bob" as never, [], {}, new Set(["a"]), "e");
    expect(markers.get("a")).toMatchObject({ kind: "agent-message", expanded: true });
    expect(markers.get("b")).toMatchObject({ kind: "agent-message", direction: "incoming" });
    expect(markers.get("c")).toMatchObject({ kind: "unavailable", label: "Stopped" });
    expect(markers.get("d")?.kind).toBe("agent-message");
    expect(markers.get("e")?.kind).toBe("agent-message");
  });
});
