"use client";

import { Play } from "lucide-react";
import { useBob } from "@/components/features/window/BobContext";
import { Button } from "@/components/ui/Button";
import { startPreview, usePreviewAvailable } from "@/lib/client/preview";

/** Preview: runs the pull request's head in its thread's workspace and shows it in the side panel. Hidden when the project has no dev script. */
export function PreviewButton({ pullRequestId, className }: { pullRequestId: string; className?: string }) {
  const { panelOpen, togglePanel } = useBob();
  const available = usePreviewAvailable(pullRequestId);
  if (!available) return null;
  return (
    <Button
      variant="secondary"
      className={className}
      onClick={() => {
        if (!panelOpen) togglePanel();
        void startPreview(pullRequestId);
      }}
    >
      <Play data-icon="inline-start" aria-hidden="true" />
      Preview
    </Button>
  );
}
