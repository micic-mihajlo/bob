import type { AppLogoVariant } from "@bob/brand";
import type { AgentModelId, AgentProviderId, AppSetupState, DesktopPlatform } from "@bob/contracts/ipc";
import { Button, ErrorReference } from "@bob/ui";
import { useText } from "@bob/ui/text";
import { errorReference } from "@bob/user-errors";
import { createStore, onSettled, Show } from "solid-js";
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
  error: string;
  reference: string | null;
}

/**
 * Creates the Bob agent. The bob provider lists its model a moment after launch, so a first attempt
 * that finds Bob not connected yet tries again for a few seconds before the failure shows.
 */
async function completeBobOnboarding(): ReturnType<ReturnType<typeof onboardingPort>["bobOnboarding"]["complete"]> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await onboardingPort().bobOnboarding.complete();
    } catch (cause) {
      if (attempt >= 10) throw cause;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

/**
 * Bob's first run has no screens: it makes sure the Bob agent exists, saves the setup, and opens the
 * agents view on Bob's chat. Only a failure shows here, with a retry.
 */
export function FirstRunFlow(props: FirstRunFlowProps) {
  const { t, errorMessage } = useText();
  const agents = useAgents();
  const [state, setState] = createStore<FirstRunState>({ saving: false, error: "", reference: null });

  async function start(): Promise<void> {
    if (state.saving) return;
    setState((draft) => {
      draft.saving = true;
      draft.error = "";
      draft.reference = null;
    });
    try {
      const result = await completeBobOnboarding();
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

  onSettled(() => void start());

  return (
    <Show when={state.error}>
      <main class="onboarding-screen bob-onboarding">
        <div class="onboarding-shell">
          <p class="onboarding-error" role="alert">
            {state.error}
            <ErrorReference reference={state.reference} />
          </p>
          <div class="onboarding-actions">
            <Button type="button" disabled={state.saving} onClick={() => void start()}>
              {t("common.retry")}
            </Button>
          </div>
        </div>
      </main>
    </Show>
  );
}
