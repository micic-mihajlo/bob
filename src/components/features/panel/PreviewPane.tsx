"use client";

import { ExternalLink, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Surface";
import { stopPreview, usePreview } from "@/lib/client/preview";
import { PaneFrame } from "./PaneFrame";

/** The pull request Bob is previewing, served by its own dev server and shown in a frame. */
export function PreviewPane() {
  const { view, error } = usePreview();
  const url = view ? `${window.location.protocol}//${window.location.hostname}:${view.port}/` : null;
  const title = view ? `${view.label} at ${view.sha.slice(0, 7)}` : "Preview";
  const ready = url !== null && view?.status === "ready";
  return (
    <PaneFrame className="bob-preview-panel" label="Preview">
      <div className="bob-preview-bar">
        <strong>{title}</strong>
        {view ? <span className="bob-preview-number">pull request #{view.number}</span> : null}
        {ready ? (
          <a className="bob-preview-open" href={url} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden="true" />
            Open in a new window
          </a>
        ) : null}
        {view ? (
          <Button variant="ghost" size="xs" onClick={() => void stopPreview()}>
            <Square data-icon="inline-start" aria-hidden="true" />
            Stop
          </Button>
        ) : null}
      </div>
      {ready ? (
        <iframe className="bob-preview-frame" src={`${url}?embed=1&tab=roadmap`} title={title} />
      ) : (
        <div className="bob-preview-status" role="status">
          {error ??
            (view?.status === "failed" ? (
              (view.error ?? "The preview stopped.")
            ) : view ? (
              <>
                <Spinner /> Starting pull request #{view.number}…
              </>
            ) : (
              "Nothing is being previewed."
            ))}
        </div>
      )}
    </PaneFrame>
  );
}
