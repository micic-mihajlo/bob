import { unansweredRows } from "@/lib/client/selectors";
import type { AgentActions } from "@/lib/client/use-agent-actions";
import type { Agent, AgentActivity, ThreadView } from "@/lib/types";
import { ClosedBanner } from "./ClosedBanner";
import { Composer } from "./Composer";
import { QuickReplies } from "./QuickReplies";
import { WaitingBlock } from "./WaitingBlock";

const CAPTAIN_REPLIES = ["What is everyone doing?", "Ship it", "Change of plan", "We need a new teammate"] as const;

interface ComposerStackProps {
  agent: Agent;
  isCaptain: boolean;
  closed: boolean;
  thread: ThreadView | undefined;
  activity: AgentActivity | undefined;
  actions: AgentActions;
}

export function ComposerStack({ agent, isCaptain, closed, thread, activity, actions }: ComposerStackProps) {
  const waitingOn = thread?.waitingOn ?? [];
  const showWaiting = !closed && unansweredRows(waitingOn).length > 0;

  return (
    <div className="composer-stack">
      {closed ? <ClosedBanner agent={agent} /> : null}
      {isCaptain && !closed ? (
        <QuickReplies replies={CAPTAIN_REPLIES} disabled={actions.sending} onPick={(text) => void actions.send(text)} />
      ) : null}
      {showWaiting ? <WaitingBlock rows={waitingOn} /> : null}
      <Composer agent={agent} working={activity?.state === "working"} actions={actions} closed={closed} />
    </div>
  );
}
