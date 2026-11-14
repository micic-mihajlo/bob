import { Button, } from "@bob/ui";
import type { AgentProfile } from "@bob/ui/data";
import { AgentAvatar } from "@bob/ui/features/agents/AgentAvatar";
import { useText } from "@bob/ui/text";
import { cx } from "@bob/ui/utils";
import { useConversationViewScope } from "./conversation-scope";

/** The Bob chat, with no turn running: the quick actions can send. */
export function useBobQuickActionsVisible(): () => boolean {
  const { channel, props, presentedQueueDeliveries, agentReady } = useConversationViewScope();
  return () =>
    !channel &&
    props.agent?.provider === "bob" &&
    !props.activeTurnId &&
    presentedQueueDeliveries().length === 0 &&
    agentReady();
}

/**
 * Three chips for the factory captain: two send a whole message to Bob, and "Change of plan" starts
 * the sentence in the composer so the person can say what changes.
 */
export function BobQuickActions(props: { class?: string }) {
  const { t } = useText();
  const { sendCardMessage, updateCurrentDraft, setComposerFocusRequest } = useConversationViewScope();
  return (
    <section class={cx("ui-block-chips bob-quick-actions", props.class)} aria-label={t("chat.bob.quick.label")}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="ui-block-chip"
        onClick={() => sendCardMessage(t("chat.bob.quick.status"))}
      >
        {t("chat.bob.quick.status")}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="ui-block-chip"
        onClick={() => sendCardMessage(t("chat.bob.quick.ship"))}
      >
        {t("chat.bob.quick.ship")}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="ui-block-chip"
        onClick={() => {
          updateCurrentDraft({ text: t("chat.bob.quick.changePrefill") });
          setComposerFocusRequest((value) => value + 1);
        }}
      >
        {t("chat.bob.quick.change")}
      </Button>
    </section>
  );
}

/** The Bob chat before its first message: Bob, one line, and the quick actions. */
export function BobChatEmptyState(props: { agent: AgentProfile }) {
  const { t } = useText();
  return (
    <div class="agent-chat-empty bob-chat-empty">
      <div class="agent-chat-empty-pitch">
        <AgentAvatar agent={props.agent} mood="idle" motion="always" class="agent-chat-empty-avatar" />
        <h2 class="agent-chat-empty-title">{t("chat.bob.empty.title")}</h2>
        <BobQuickActions class="bob-quick-actions-centered" />
      </div>
    </div>
  );
}
