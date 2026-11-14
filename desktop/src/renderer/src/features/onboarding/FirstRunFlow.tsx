import type { AppLogoVariant } from "@bob/brand";
import type { AgentModelId, AgentProviderId, AppSetupState, DesktopPlatform } from "@bob/contracts/ipc";
import { Button, ErrorReference } from "@bob/ui";
import { useText } from "@bob/ui/text";
import { errorReference } from "@bob/user-errors";
import { createStore, Show } from "solid-js";
import { useAgents } from "../agents/agents-context";
import type { OnboardingJourney } from "./onboarding-context";
import { onboardingPort } from "./onboarding-port";
import type { SetupProviderProps } from "./SetupProviderPicker";

export interface FirstRunFlowProps extends SetupProviderProps {
  state: AppSetupState;
  platform: DesktopPlatform;
  onSave: (provider: AgentProviderId, model: AgentModelId | null, journey: OnboardingJourney) => Promise<void>;
  onProviderStepShown?: () => void;
  logoVariant?: AppLogoVariant;
}

interface FirstRunState {
  saving: boolean;
  requesting: boolean;
  notificationsAllowed: boolean;
  error: string;
  reference: string | null;
}

/**
 * Bob's first run: one screen that offers the brief and check-in notifications, then opens the chat
 * with Bob, which asks its first-run questions there, one at a time.
 */
export function FirstRunFlow(props: FirstRunFlowProps) {
  const { t, errorMessage } = useText();
  const agents = useAgents();
  const [state, setState] = createStore<FirstRunState>({
    saving: false,
    requesting: false,
    notificationsAllowed: false,
    error: "",
    reference: null,
  });

  async function allowNotifications(): Promise<void> {
    if (state.requesting) return;
    setState((draft) => {
      draft.requesting = true;
      draft.error = "";
    });
    try {
      const preference = await onboardingPort().notifications.getPreference();
      await onboardingPort().notifications.setPreference({ ...preference, desktopNotifications: true });
      await onboardingPort().notifications.requestPermission();
      setState((draft) => {
        draft.notificationsAllowed = true;
      });
    } catch (cause) {
      setState((draft) => {
        draft.error = errorMessage(cause, t("onboarding.bob.notificationFailed"));
        draft.reference = errorReference(cause);
      });
    } finally {
      setState((draft) => {
        draft.requesting = false;
      });
    }
  }

  async function start(): Promise<void> {
    if (state.saving || state.requesting) return;
    setState((draft) => {
      draft.saving = true;
      draft.error = "";
      draft.reference = null;
    });
    try {
      if (!state.notificationsAllowed) {
        const preference = await onboardingPort().notifications.getPreference();
        await onboardingPort().notifications.setPreference({ ...preference, desktopNotifications: false });
      }
      const result = await onboardingPort().bobOnboarding.complete();
      agents.setActiveAgentId(result.agentId);
      agents.setAgentSetupOpen(false);
      agents.setExplicitlyOpenedAgentChatId(result.agentId);
      await props.onSave("bob", "bob", { path: "free", skipped: false });
    } catch (cause) {
      setState((draft) => {
        draft.error = errorMessage(cause, t("onboarding.bob.saveFailed"));
        draft.reference = errorReference(cause);
        draft.saving = false;
      });
    }
  }

  return (
    <main class="onboarding-screen bob-onboarding">
      <form
        class="onboarding-shell"
        onSubmit={(event) => {
          event.preventDefault();
          void start();
        }}
      >
        <section class="onboarding-panel">
          <h1>{t("onboarding.bob.welcome")}</h1>
          <p class="onboarding-description">{t("onboarding.bob.welcomeDescription")}</p>
          <p class="onboarding-description">{t("onboarding.bob.notificationsDescription")}</p>
          <Button
            type="button"
            variant="outline"
            disabled={state.requesting || state.notificationsAllowed || state.saving}
            onClick={() => void allowNotifications()}
          >
            {state.notificationsAllowed
              ? t("onboarding.bob.notificationsReady")
              : t("onboarding.bob.allowNotifications")}
          </Button>
        </section>
        <Show when={state.error}>
          <p class="onboarding-error" role="alert">
            {state.error}
            <ErrorReference reference={state.reference} />
          </p>
        </Show>
        <div class="onboarding-actions">
          <Button type="submit" disabled={state.saving || state.requesting}>
            {state.saving ? t("onboarding.bob.meeting") : t("onboarding.bob.meet")}
          </Button>
        </div>
      </form>
    </main>
  );
}
