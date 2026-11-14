import { describe, expect, it } from "vitest";
import { EMPTY_CHAT_HISTORY, chatHistoryShortcut, nearestChat, recordChat } from "./chat-history";

const all = () => true;

describe("chat history", () => {
  it("steps back and forward like a browser tab", () => {
    let history = recordChat(EMPTY_CHAT_HISTORY, "bob", null);
    history = recordChat(history, "tas-1", null);
    history = recordChat(history, "tas-2", null);
    const back = nearestChat(history, -1, all);
    expect(history.entries[back]).toBe("tas-1");
    history = recordChat(history, "tas-1", back);
    expect(history.entries[nearestChat(history, 1, all)]).toBe("tas-2");
    history = recordChat(history, "tas-3", null);
    expect(history.entries).toEqual(["bob", "tas-1", "tas-3"]);
    expect(nearestChat(history, 1, all)).toBe(-1);
  });

  it("steps over a thread that no longer exists", () => {
    let history = recordChat(EMPTY_CHAT_HISTORY, "bob", null);
    history = recordChat(history, "gone", null);
    history = recordChat(history, "tas-1", null);
    expect(history.entries[nearestChat(history, -1, (id) => id !== "gone")]).toBe("bob");
  });

  it("reads the platform's keys and leaves Alt+Left in a text field alone", () => {
    const key = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: null };
    expect(chatHistoryShortcut({ ...key, key: "[", metaKey: true }, true)).toBe("back");
    expect(chatHistoryShortcut({ ...key, key: "ArrowRight", altKey: true }, false)).toBe("forward");
    expect(chatHistoryShortcut({ ...key, key: "ArrowLeft", altKey: true, shiftKey: true }, false)).toBeUndefined();
  });
});
