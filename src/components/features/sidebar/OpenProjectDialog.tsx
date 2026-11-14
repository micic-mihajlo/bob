"use client";

import { FolderGit2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { openProject } from "@/lib/client/api";
import type { ProjectTemplate } from "@/lib/types";

const FORM_ID = "open-project-form";
const stayOpen = () => {};

/** The templates a new project can start from, blank first. The invoices app is the sample the demo runs on. */
export const TEMPLATE_LABELS: Record<ProjectTemplate, string> = {
  "blank-ts": "Blank TypeScript",
  invoices: "Sample: invoices app",
};

/** Brings in a repository by URL or local path, or starts a new project from a template. Without onClose it is the first-run choice and stays open. */
export function OpenProjectDialog({ onClose }: { onClose?: () => void }) {
  const { selectAgent } = useBob();
  const [repo, setRepo] = useState("");
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<ProjectTemplate>("blank-ts");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fromTemplate = repo.trim() === "";
  const ready = !fromTemplate || name.trim() !== "";

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    const result = await openProject(fromTemplate ? { name: name.trim(), template } : { repo: repo.trim(), name: name.trim() || undefined });
    setPending(false);
    if (!result.ok) return setError(result.error);
    selectAgent("bob");
    onClose?.();
  }

  return (
    <ConfirmDialog
      title="Open a project"
      description={`Bring in a repository by URL or path, or start from a template: blank TypeScript, or the invoices sample.${onClose ? " The project you leave keeps its threads." : ""}`}
      icon={<FolderGit2 />}
      error={error}
      onClose={onClose ?? stayOpen}
      actions={
        <>
          {onClose ? (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" form={FORM_ID} className="ui-confirm-dialog-confirm" disabled={!ready || pending}>
            {pending ? (fromTemplate ? "Creating" : "Cloning") : fromTemplate ? "Start from template" : "Bring it in"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="new-agent-form" onSubmit={submit}>
        <label className="ui-field">
          <span className="ui-label">Repository</span>
          <input
            className="ui-input"
            data-size="md"
            data-autofocus
            value={repo}
            maxLength={500}
            placeholder="https://github.com/acme/shop or /path/to/repo"
            spellCheck={false}
            onChange={(event) => setRepo(event.target.value)}
          />
        </label>
        <label className="ui-field">
          <span className="ui-label">{fromTemplate ? "Name" : "Name (optional)"}</span>
          <input className="ui-input" data-size="md" value={name} maxLength={80} placeholder={fromTemplate ? "shop" : "Taken from the repository"} onChange={(event) => setName(event.target.value)} />
        </label>
        {fromTemplate ? (
          <label className="ui-field">
            <span className="ui-label">Template</span>
            <select className="ui-input" data-size="md" value={template} onChange={(event) => setTemplate(event.target.value as ProjectTemplate)}>
              {Object.entries(TEMPLATE_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </form>
    </ConfirmDialog>
  );
}
