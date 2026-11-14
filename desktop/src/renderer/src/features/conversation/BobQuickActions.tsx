import { Button, Input } from "@bob/ui";
import type { AgentProfile } from "@bob/ui/data";
import { AgentAvatar } from "@bob/ui/features/agents/AgentAvatar";
import { useText } from "@bob/ui/text";
import { cx } from "@bob/ui/utils";
import { createSignal, Show } from "solid-js";
import { BOB_ONLY } from "../../bob";
import { useConversationViewScope } from "./conversation-scope";

/** The Bob chat, with no turn running: the quick actions can send. */
export function useBobQuickActionsVisible(): () => boolean {
  const { channel, props, presentedQueueDeliveries, agentReady } = useConversationViewScope();
  return () =>
    BOB_ONLY &&
    !channel &&
    props.agent?.provider === "bob" &&
    !props.activeTurnId &&
    presentedQueueDeliveries().length === 0 &&
    agentReady();
}

/**
 * Four chips for a person who does not know what to type: each sends a whole message to Bob, except
 * "I'm stuck", which starts the sentence in the composer, and "I made a sale", which asks the amount.
 */
export function BobQuickActions(props: { class?: string }) {
  const { t } = useText();
  const { sendCardMessage, updateCurrentDraft, setComposerFocusRequest } = useConversationViewScope();
  const [saleOpen, setSaleOpen] = createSignal(false);
  const [amount, setAmount] = createSignal("");
  const [item, setItem] = createSignal("");

  function sendSale(): void {
    const value = amount().trim();
    if (!value) return;
    const money = /^[\d.,\s]+$/.test(value) ? `$${value}` : value;
    const what = item().trim();
    const message = what
      ? t("chat.bob.quick.saleMessageFor", { amount: money, item: what })
      : t("chat.bob.quick.saleMessage", { amount: money });
    if (!sendCardMessage(message)) return;
    setSaleOpen(false);
    setAmount("");
    setItem("");
  }

  return (
    <Show
      when={saleOpen()}
      fallback={
        <section class={cx("ui-block-chips bob-quick-actions", props.class)} aria-label={t("chat.bob.quick.label")}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="ui-block-chip"
            onClick={() => sendCardMessage(t("chat.bob.quick.planMessage"))}
          >
            {t("chat.bob.quick.plan")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="ui-block-chip"
            onClick={() => sendCardMessage(t("chat.bob.quick.doneMessage"))}
          >
            {t("chat.bob.quick.done")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="ui-block-chip"
            onClick={() => {
              updateCurrentDraft({ text: t("chat.bob.quick.stuckPrefill") });
              setComposerFocusRequest((value) => value + 1);
            }}
          >
            {t("chat.bob.quick.stuck")}
          </Button>
          <Button type="button" variant="outline" size="sm" class="ui-block-chip" onClick={() => setSaleOpen(true)}>
            {t("chat.bob.quick.sale")}
          </Button>
        </section>
      }
    >
      <form
        class={cx("ui-block-quick-text bob-quick-actions", props.class)}
        novalidate
        onSubmit={(event) => {
          event.preventDefault();
          sendSale();
        }}
      >
        <Input
          type="text"
          size="sm"
          inputmode="decimal"
          value={amount()}
          placeholder={t("chat.bob.quick.saleAmountPlaceholder")}
          aria-label={t("chat.bob.quick.saleAmountLabel")}
          autofocus
          onValueChange={setAmount}
        />
        <Input
          type="text"
          size="sm"
          value={item()}
          placeholder={t("chat.bob.quick.saleItemPlaceholder")}
          aria-label={t("chat.bob.quick.saleItemLabel")}
          onValueChange={setItem}
        />
        <Button type="submit" size="sm" disabled={amount().trim() === ""}>
          {t("chat.bob.quick.saleSend")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSaleOpen(false)}>
          {t("common.cancel")}
        </Button>
      </form>
    </Show>
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
