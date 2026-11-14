"use client";

import { Bot } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createAgent } from "@/lib/client/api";

const EMPTY = { name: "", title: "", description: "" };
const FORM_ID = "new-agent-form";

/** Adds a standing agent to the team: a name, a one-line title and what it should do. */
export function NewAgentDialog({ onClose }: { onClose: () => void }) {
  const { selectAgent } = useBob();
  const [fields, setFields] = useState(EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = fields.name.trim() !== "" && fields.title.trim() !== "" && fields.description.trim() !== "";
  const update = (key: keyof typeof EMPTY) => (value: string) => setFields((previous) => ({ ...previous, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    const result = await createAgent({ name: fields.name.trim(), title: fields.title.trim(), description: fields.description.trim() });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    selectAgent(result.agentId);
    onClose();
  }

  return (
    <ConfirmDialog
      title="New agent"
      description="A standing teammate the captain can message."
      icon={<Bot />}
      error={error}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} className="ui-confirm-dialog-confirm" disabled={!ready || pending}>
            {pending ? "Adding" : "Add to the team"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="new-agent-form" onSubmit={submit}>
        <label className="ui-field">
          <span className="ui-label">Name</span>
          <input className="ui-input" data-size="md" data-autofocus value={fields.name} maxLength={40} placeholder="Coder" onChange={(event) => update("name")(event.target.value)} />
        </label>
        <label className="ui-field">
          <span className="ui-label">Title</span>
          <input className="ui-input" data-size="md" value={fields.title} maxLength={80} placeholder="Builds the change" onChange={(event) => update("title")(event.target.value)} />
        </label>
        <label className="ui-field">
          <span className="ui-label">What it should do</span>
          <textarea
            className="ui-textarea"
            rows={4}
            value={fields.description}
            maxLength={2000}
            placeholder="Takes one work order at a time, opens a pull request, and asks Reviewer to look."
            onChange={(event) => update("description")(event.target.value)}
          />
        </label>
      </form>
    </ConfirmDialog>
  );
}
