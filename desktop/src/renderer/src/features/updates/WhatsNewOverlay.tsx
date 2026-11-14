import { BOB_CHANGELOG_URL } from "@bob/contracts/bob-endpoints";
import { toast } from "@bob/ui";
import { WhatsNewDialog } from "@bob/ui/features/updates/WhatsNewDialog";
import { useText } from "@bob/ui/text";
import { createEffect, untrack } from "solid-js";
import { appPort } from "../../app-port";
import { useWhatsNew } from "./whats-new-context";

/** Mounted only when the workspace is ready, outside the lifetime of a selected server. */
export function WhatsNewOverlay(props: { ready: boolean }) {
  const { t, errorMessage } = useText();
  const whatsNew = useWhatsNew();
  createEffect(
    () => props.ready && whatsNew.state.version !== "",
    (ready) => {
      if (ready) untrack(whatsNew.start);
    },
  );
  return (
    <WhatsNewDialog
      open={props.ready && whatsNew.state.open}
      version={whatsNew.state.version}
      previousVersion={whatsNew.state.previousVersion}
      notes={whatsNew.state.notes}
      onOpenChange={(open) => {
        if (!open) whatsNew.close();
      }}
      onRetry={whatsNew.retry}
      onOpenChangelog={() => {
        void appPort()
          .openUrl(BOB_CHANGELOG_URL)
          .catch((error: unknown) => toast.error(errorMessage(error, t("update.whatsNew.changelogFailed")), { error }));
      }}
    />
  );
}
