import { unansweredRows } from "@/lib/client/selectors";
import type { AgentActions } from "@/lib/client/use-agent-actions";
import type { Agent, AgentActivity, ThreadView } from "@/lib/types";
import { Composer } from "./Composer";
import { QuickReplies } from "./QuickReplies";
import { WaitingBlock } from "./WaitingBlock";

const ORCHESTRATOR_REPLIES = [
  "What is everyone doing?",
  "Ship it",
  "Change of plan",
  "We need a new teammate",
] as const;

interface ComposerStackProps {
  agent: Agent;
  thread: ThreadView | undefined;
  activity: AgentActivity | undefined;
  actions: AgentActions;
}

export function ComposerStack({ agent, thread, activity, actions }: ComposerStackProps) {
  const waitingOn = thread?.waitingOn ?? [];
  const showWaiting = unansweredRows(waitingOn).length > 0;
  const replies = agent.role === "orchestrator" ? ORCHESTRATOR_REPLIES : [];

  return (
    <div className="composer-stack">
      {replies.length > 0 ? (
        <QuickReplies replies={replies} disabled={actions.sending} onPick={(text) => void actions.send(text)} />
      ) : null}
      {showWaiting ? <WaitingBlock rows={waitingOn} /> : null}
      <Composer agent={agent} working={activity?.state === "working"} actions={actions} />
    </div>
  );
}
