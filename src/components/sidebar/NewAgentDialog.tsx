"use client";

import { X } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import { useBob } from "@/components/app/BobContext";
import { useModalDialog } from "@/components/common/use-modal-dialog";
import { createAgent } from "@/lib/client/api";

const EMPTY = { name: "", title: "", description: "" };

export function NewAgentDialog() {
  const { newAgentOpen, setNewAgentOpen, selectAgent } = useBob();
  const [fields, setFields] = useState(EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setNewAgentOpen(false);
    setError(null);
  }, [setNewAgentOpen]);
  const { ref, onKeyDown } = useModalDialog(newAgentOpen, close);

  const ready = fields.name.trim() !== "" && fields.title.trim() !== "" && fields.description.trim() !== "";

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    const result = await createAgent({
      name: fields.name.trim(),
      title: fields.title.trim(),
      description: fields.description.trim(),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFields(EMPTY);
    selectAgent(result.agentId);
    close();
  }

  const update = (key: keyof typeof EMPTY) => (value: string) => setFields((previous) => ({ ...previous, [key]: value }));

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="new-agent-title" onKeyDown={onKeyDown}>
      <form className="dialog-body" onSubmit={submit}>
        <header className="dialog-header">
          <h2 id="new-agent-title" className="dialog-title">
            New agent
          </h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={close}>
            <X className="icon" size={16} aria-hidden="true" />
          </button>
        </header>
        <label className="field">
          <span className="field-label">Name</span>
          <input
            className="field-input"
            value={fields.name}
            maxLength={40}
            placeholder="Coder"
            data-autofocus
            onChange={(event) => update("name")(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Title</span>
          <input
            className="field-input"
            value={fields.title}
            maxLength={80}
            placeholder="Builds the change"
            onChange={(event) => update("title")(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">What it should do</span>
          <textarea
            className="field-input field-textarea"
            value={fields.description}
            rows={4}
            maxLength={2000}
            placeholder="Takes one work order at a time, opens a pull request, and asks Reviewer to look."
            onChange={(event) => update("description")(event.target.value)}
          />
        </label>
        {error ? (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="dialog-footer">
          <button type="button" className="btn btn-quiet" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!ready || pending}>
            {pending ? "Adding" : "Add to the team"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
