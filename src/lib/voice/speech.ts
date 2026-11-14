/** What the call needs on both sides: the client tool's name and how a reply is turned into speech. */

/** The client tool the ElevenLabs agent calls with what the person said. Must match the tool config. */
export const SEND_TO_BOB = "send_to_bob";

/** How the browser hands Bob's answer back into the call, and how the agent knows to say it. */
export const BOB_ANSWER = "Bob's answer:";

/** What Bob says when the call connects. */
export const FIRST_MESSAGE = "Hi, this is Bob. What do you want built?";

/** Speech recognition spells out short words letter by letter ("i d", "c s v"); join those runs back up. */
export function joinSpelled(text: string): string {
  return text.replace(/\b[a-z](?: [a-z]\b)+/gi, (run) => {
    const article = /^a [a-z] [a-z]/i.test(run) ? run.slice(0, 2) : "";
    const letters = run.slice(article.length);
    return /[^ai ]/i.test(letters) ? article + letters.replace(/ /g, "").toUpperCase() : run;
  });
}

/** What a call sends as the person's message: their own words since the last send, else the agent's paraphrase. */
export function utteranceFor(heard: readonly string[], toolText: string): string {
  const said = heard.map((line) => line.trim()).filter(Boolean).join(" ");
  return joinSpelled(said || toolText.trim());
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
