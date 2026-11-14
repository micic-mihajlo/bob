import { MAX_PUSHBACK_ROUNDS } from "./intake";
import type { IntentPart, ScriptedChange } from "./script-changes";
import { summarize } from "./script-plan";

const USER = /\b(customers?|users?|clients?|admins?|accountants?|managers?|buyers?|sellers?|members?|staff|developers?|finance team|support team|owners?)\b/i;
const SCOPE = /\b(columns?|fields?|rows?|buttons?|page|screen|tab|menu|list|table|endpoint|all|only|filter(ed)?)\b/i;
export const ACCEPTANCE =
  /\b(done when|acceptance|accepted when|passes when|tests? (that|pass|passes|proves)|should (show|return|produce|open|include|contain|have)|expect(ed)? (to|that)|one row per|opens in)\b/i;
const PROCEED =
  /^\s*(yes|yep|yeah|both)\b|\b(go ahead|go for it|your call|you decide|(use|go with) (your|the) (defaults?|judg(e)?ment)|assume|just (do|build|ship) it|defaults? (is|are) fine|sounds (good|right)|(that's|thats|that is) right|whatever you think)\b/i;

const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export interface IntentDraft {
  title: string;
  user: string;
  behaviour: string;
  acceptance: string;
  assumptions: string[];
}

export type IntakeDecision = { kind: "ask"; reply: string } | { kind: "record"; intent: IntentDraft };

/**
 * The scripted input inspection over everything the person wrote since the last recorded intent. A request
 * that names its behaviour and an acceptance check goes straight through. Otherwise ask about the
 * acceptance check, and the scope when it is missing too, for at most two rounds. Then record the intent
 * with each remaining gap filled by a stated assumption. The user is always assumed, never asked.
 */
export function inspectRequest(texts: string[], rounds: number, change: ScriptedChange): IntakeDecision {
  const all = texts.join("\n");
  const intake = change.intake(texts[0] ?? "");
  const user = USER.exec(all)?.[0] ?? null;
  const acceptance = sentences(all).find((x) => ACCEPTANCE.test(x)) ?? null;
  const missing: IntentPart[] = [
    ...(SCOPE.test(all) ? [] : (["scope"] as const)),
    ...(acceptance ? [] : (["acceptance"] as const)),
    ...(user ? [] : (["user"] as const)),
  ];
  if (!acceptance && rounds < MAX_PUSHBACK_ROUNDS && !PROCEED.test(texts[texts.length - 1] ?? "")) {
    const asks = missing.filter((part) => part !== "user").map((part) => intake[part].ask);
    const lead = rounds === 0 ? (asks.length > 1 ? "Two quick ones before I plan it." : "One quick one before I plan it.") : "One more round and I'll start.";
    return { kind: "ask", reply: [lead, ...asks.map((a) => `- ${a}`)].join("\n") };
  }
  const request = texts[0] ?? "";
  return {
    kind: "record",
    intent: {
      title: change.workTitle(request),
      user: user ? capitalize(user) : intake.user.assume,
      behaviour: [summarize(request), ...texts.slice(1).flatMap(sentences).filter((x) => SCOPE.test(x))].map((x) => x.replace(/[.!?]+$/, "")).join(". ") + ".",
      acceptance: acceptance ?? intake.acceptance.assume,
      assumptions: missing.map((part) => `${capitalize(part)}: ${intake[part].assume}`),
    },
  };
}
