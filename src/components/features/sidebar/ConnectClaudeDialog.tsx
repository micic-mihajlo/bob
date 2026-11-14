"use client";

import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { connectClaude, disconnectClaude } from "@/lib/client/api";
import type { ClaudeMethod } from "@/lib/types";

const FORM_ID = "connect-claude-form";

const METHODS: Record<ClaudeMethod, { label: string; hint: string; placeholder?: string; done: string }> = {
  "oauth-token": {
    label: "Claude subscription",
    hint: "On your computer, run claude setup-token, sign in with your Claude account, and paste the token it prints.",
    placeholder: "sk-ant-oat01-...",
    done: "your Claude subscription",
  },
  "api-key": {
    label: "Anthropic API key",
    hint: "Paste a key from the Anthropic Console.",
    placeholder: "sk-ant-api03-...",
    done: "your Anthropic API key",
  },
  "claude-code": {
    label: "Claude Code on this computer",
    hint: "Uses the Claude Code login on the computer that runs Bob. Run claude and sign in there first.",
    done: "Claude Code on this computer",
  },
};

/**
 * Connects the person's own Claude for agents' SDK turns. A saved credential is reported as a fact and
 * never read back into the input; the typed secret is dropped as soon as the server has it.
 */
export function ConnectClaudeDialog({ onClose }: { onClose: () => void }) {
  const { snapshot } = useBob();
  const status = snapshot.claude;
  const [method, setMethod] = useState<ClaudeMethod>(status?.method ?? "oauth-token");
  const [secret, setSecret] = useState("");
  const [phase, setPhase] = useState<"idle" | "saving" | "removing">("idle");
  const [error, setError] = useState<string | null>(null);
  const busy = phase !== "idle";
  const needsSecret = method !== "claude-code";
  const ready = !busy && (!needsSecret || secret.trim() !== "");
  const text = METHODS[method];

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!ready) return;
    setPhase("saving");
    setError(null);
    const result = await connectClaude(method, needsSecret ? secret.trim() : undefined);
    setSecret("");
    setPhase("idle");
    if (!result.ok) return setError(result.error);
    onClose();
  }

  async function remove(): Promise<void> {
    if (busy) return;
    setPhase("removing");
    setError(null);
    const result = await disconnectClaude();
    setPhase("idle");
    if (!result.ok) return setError(result.error);
    onClose();
  }

  const description = status?.connected
    ? status.from === "env"
      ? "Connected through the server's environment. Agents run on your Claude."
      : `Connected with ${status.method ? METHODS[status.method].done : "your Claude"}. Agents run on it. Connect again to replace it.`
    : "Run agents on your own Claude instead of Bob's Token Pass models.";

  return (
    <ConfirmDialog
      title="Connect your Claude"
      description={description}
      icon={<KeyRound />}
      error={error}
      onClose={() => !busy && onClose()}
      actions={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          {status?.connected && status.from === "file" ? (
            <Button variant="ghost" disabled={busy} onClick={() => void remove()}>
              {phase === "removing" ? "Disconnecting" : "Disconnect"}
            </Button>
          ) : null}
          <Button type="submit" form={FORM_ID} className="ui-confirm-dialog-confirm" disabled={!ready}>
            {phase === "saving" ? "Connecting" : "Connect"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="new-agent-form" onSubmit={submit}>
        <label className="ui-field">
          <span className="ui-label">How</span>
          <select className="ui-input" data-size="md" data-autofocus value={method} disabled={busy} onChange={(event) => setMethod(event.target.value as ClaudeMethod)}>
            {(Object.keys(METHODS) as ClaudeMethod[]).map((m) => (
              <option key={m} value={m}>
                {METHODS[m].label}
              </option>
            ))}
          </select>
        </label>
        <p className="ui-confirm-dialog-description">{text.hint}</p>
        {needsSecret ? (
          <label className="ui-field">
            <span className="ui-label">{method === "oauth-token" ? "Token" : "API key"}</span>
            <input
              className="ui-input"
              data-size="md"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={secret}
              disabled={busy}
              placeholder={text.placeholder}
              onChange={(event) => setSecret(event.target.value)}
            />
          </label>
        ) : null}
      </form>
    </ConfirmDialog>
  );
}
