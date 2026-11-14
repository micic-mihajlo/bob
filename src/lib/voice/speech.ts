/** What the call needs on both sides: the client tool's name and how a reply is turned into speech. */

/** The client tool the ElevenLabs agent calls with what the person said. Must match the tool config. */
export const SEND_TO_BOB = "send_to_bob";

/** What Bob says when the call connects. */
export const FIRST_MESSAGE = "Hi, this is Bob. What do you want built?";

/** What a call sends as the person's message: their own words since the last send, else the agent's paraphrase. */
export function utteranceFor(heard: readonly string[], toolText: string): string {
  const said = heard.map((line) => line.trim()).filter(Boolean).join(" ");
  return said || toolText.trim();
}

/** A reply as words to say aloud: no code, markdown marks, link targets or ids in backticks. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+[.)]|>)\s+/gm, "")
    .replace(/[*_~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
