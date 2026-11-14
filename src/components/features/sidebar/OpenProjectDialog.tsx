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

/** The templates a new project can start from. */
export const TEMPLATE_LABELS: Record<ProjectTemplate, string> = {
  "blank-ts": "Blank TypeScript",
};

/** Bob's own repository at the pinned demo base, as pnpm demo --self opens it. */
const BOB_ITSELF = { repo: "https://github.com/micic-mihajlo/bob.git", branch: "demo/self-base", name: "bob" };

type Start = ProjectTemplate | "self";
const START_LABELS: Record<Start, string> = { self: "Bob itself", ...TEMPLATE_LABELS };

/** Brings in a repository by URL or local path, or starts a new project from a template. Without onClose it is the first-run choice and stays open. */
export function OpenProjectDialog({ onClose }: { onClose?: () => void }) {
  const { selectAgent } = useBob();
  const [repo, setRepo] = useState("");
  const [name, setName] = useState("");
  const [start, setStart] = useState<Start>("self");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fromTemplate = repo.trim() === "";
  const ready = !fromTemplate || start === "self" || name.trim() !== "";

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    const result = await openProject(!fromTemplate ? { repo: repo.trim(), name: name.trim() || undefined } : start === "self" ? BOB_ITSELF : { name: name.trim(), template: start });
    setPending(false);
    if (!result.ok) return setError(result.error);
    selectAgent("bob");
    onClose?.();
  }

  return (
    <ConfirmDialog
      title="Open a project"
      description={`Bring in a repository by URL or path, or start from Bob itself or the blank TypeScript template.${onClose ? " The project you leave keeps its threads." : ""}`}
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
            {pending ? (fromTemplate && start !== "self" ? "Creating" : "Cloning") : fromTemplate ? (start === "self" ? "Open Bob itself" : "Start from template") : "Bring it in"}
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
        {fromTemplate && start === "self" ? null : (
          <label className="ui-field">
            <span className="ui-label">{fromTemplate ? "Name" : "Name (optional)"}</span>
            <input className="ui-input" data-size="md" value={name} maxLength={80} placeholder={fromTemplate ? "shop" : "Taken from the repository"} onChange={(event) => setName(event.target.value)} />
          </label>
        )}
        {fromTemplate ? (
          <label className="ui-field">
            <span className="ui-label">Start from</span>
            <select className="ui-input" data-size="md" value={start} onChange={(event) => setStart(event.target.value as Start)}>
              {Object.entries(START_LABELS).map(([id, label]) => (
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
