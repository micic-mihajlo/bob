"use client";

import { FolderGit2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { openProject } from "@/lib/client/api";

const FORM_ID = "open-project-form";

/** Brings in a repository by URL or local path, or starts a new project from the invoices template. */
export function OpenProjectDialog({ onClose }: { onClose: () => void }) {
  const { selectAgent } = useBob();
  const [repo, setRepo] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fromTemplate = repo.trim() === "";
  const ready = !fromTemplate || name.trim() !== "";

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    const result = await openProject({ repo: repo.trim() || undefined, name: name.trim() || undefined });
    setPending(false);
    if (!result.ok) return setError(result.error);
    selectAgent("bob");
    onClose();
  }

  return (
    <ConfirmDialog
      title="Open a project"
      description="Bring in a repository, or start a new project from the invoices template. The project you leave keeps its threads."
      icon={<FolderGit2 />}
      error={error}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
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
      </form>
    </ConfirmDialog>
  );
}
