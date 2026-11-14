"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ConnectClaudeDialog } from "@/components/features/sidebar/ConnectClaudeDialog";
import { useBob } from "@/components/features/window/BobContext";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { setThreadModel } from "@/lib/client/api";
import { CLAUDE_MODELS, type Agent } from "@/lib/types";

/** The model as the reference's model pill shows it: the name after the provider. */
export function modelName(model: string): string {
  if (/^claude-[a-z]+$/.test(model)) return `Claude ${model.charAt(7).toUpperCase()}${model.slice(8)}`;
  return model.split("/").at(-1) ?? model;
}

type Rail = "gateway" | "claude";

const RAILS: readonly Rail[] = ["gateway", "claude"];

const RAIL_NAME: Record<Rail, string> = { gateway: "Bob gateway", claude: "Claude" };

const isClaude = (model: string) => (CLAUDE_MODELS as readonly string[]).includes(model);

function ProviderMark({ rail, large }: { rail: Rail; large?: boolean }) {
  const className = cx("provider-model-mark", large && "provider-model-mark-large");
  if (rail === "claude") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        {[0, 45, 90, 135].map((angle) => (
          <rect key={angle} x="7.1" y="1" width="1.8" height="14" rx="0.9" transform={`rotate(${angle} 8 8)`} />
        ))}
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.2 14 4.6v6.8L8 14.8 2 11.4V4.6Z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="provider-model-chevron ui-glyph-16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="provider-model-check" viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3 8.25 3.1 3.1L13 4.8" />
    </svg>
  );
}

/**
 * A thread's model in the reference's model pill. Its popover is the reference's provider picker: a rail
 * with Bob's gateway and the person's Claude, and beside it that provider's models with a check on the
 * one the thread runs on. The Claude tab connects the account while it is not connected.
 */
export function ModelPicker({ agent, disabled = false }: { agent: Agent; disabled?: boolean }) {
  const { snapshot } = useBob();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [rail, setRail] = useState<Rail>("gateway");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const railButtons = useRef<Partial<Record<Rail, HTMLButtonElement | null>>>({});
  const claudeConnected = snapshot.claude?.connected === true;
  const models = snapshot.models ?? { gateway: [agent.model], captain: agent.model, crew: agent.model, captainFallback: agent.model, crewFallback: agent.model };
  const defaultModel = agent.kind === "captain" ? models.captain : models.crew;
  const fallbackModel = agent.kind === "captain" ? models.captainFallback : models.crewFallback;
  const current = models.gateway.includes(agent.model) || (claudeConnected && isClaude(agent.model)) ? agent.model : defaultModel;
  const currentRail: Rail = isClaude(current) ? "claude" : "gateway";
  const name = modelName(current);
  const who = agent.code ?? agent.name;

  useEffect(() => {
    if (anchor === null) return;
    const panel = popover.current?.querySelector<HTMLElement>(".provider-model-panel[data-selected]");
    (panel?.querySelector<HTMLElement>("[aria-selected=true]") ?? panel?.querySelector<HTMLElement>("button"))?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!popover.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setAnchor(null);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setAnchor(null);
      trigger.current?.focus();
    };
    const onResize = () => setAnchor(null);
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [anchor]);

  const open = () => {
    setError(null);
    setRail(currentRail);
    setAnchor(trigger.current?.getBoundingClientRect() ?? null);
  };

  const close = () => {
    setAnchor(null);
    trigger.current?.focus();
  };

  const choose = async (model: string) => {
    if (model === agent.model) return close();
    setSaving(model);
    setError(null);
    const result = await setThreadModel(agent.id, model);
    setSaving(null);
    if (!result.ok) return setError(result.error);
    close();
  };

  const connect = () => {
    setAnchor(null);
    setConnectOpen(true);
  };

  const onRailKeyDown = (event: KeyboardEvent<HTMLButtonElement>, key: Rail) => {
    const delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = RAILS[(RAILS.indexOf(key) + delta + RAILS.length) % RAILS.length];
    setRail(next);
    railButtons.current[next]?.focus();
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[role=option]")];
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const railSummary = (key: Rail) =>
    key === "claude" ? (claudeConnected ? "Your Claude account" : "Not connected") : models.gateway.length === 1 ? "1 model" : `${models.gateway.length} models`;

  const list = (key: Rail, ids: readonly string[]) => (
    <div className="provider-model-list" role="listbox" aria-label={`${RAIL_NAME[key]} models`} onKeyDown={onListKeyDown}>
      {ids.map((model) => {
        const selected = model === current;
        const label = saving === model ? "Saving" : model === defaultModel ? "Default" : model === fallbackModel ? "Fallback" : null;
        return (
          <button
            key={model}
            type="button"
            role="option"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            title={model}
            disabled={saving !== null}
            className={cx("provider-model-option", selected && "provider-model-option-selected")}
            onClick={() => void choose(model)}
          >
            <span className="provider-model-option-name">
              <span>{modelName(model)}</span>
              {label ? <small>{label}</small> : null}
            </span>
            {selected ? <CheckIcon /> : null}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="provider-model-picker">
      <button
        ref={trigger}
        type="button"
        className="provider-model-trigger"
        aria-label={`Agent model: ${name}`}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        disabled={disabled}
        title={disabled ? `${who} is closed and runs no more turns` : `${RAIL_NAME[currentRail]} · ${current}`}
        onClick={() => (anchor === null ? open() : setAnchor(null))}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          open();
        }}
      >
        <span className="provider-model-trigger-value">
          <span className="provider-model-trigger-mark">
            <ProviderMark rail={currentRail} />
          </span>
          <span className="provider-model-trigger-name">{name}</span>
        </span>
        <ChevronDownIcon />
      </button>
      {anchor !== null ? (
        <div style={{ position: "fixed", zIndex: 60, top: anchor.bottom + 8, right: Math.max(12, window.innerWidth - anchor.right) }}>
          <div ref={popover} role="dialog" aria-label="Model" className="provider-model-popover" data-expanded="">
            <div className="provider-model-layout">
              <div className="provider-model-rail">
                <div className="provider-model-rail-tabs" role="tablist" aria-orientation="vertical" aria-label="Providers">
                  {RAILS.map((key) => (
                    <button
                      key={key}
                      ref={(element) => {
                        railButtons.current[key] = element;
                      }}
                      type="button"
                      role="tab"
                      id={`model-rail-${agent.id}-${key}`}
                      aria-selected={rail === key}
                      aria-controls={`model-panel-${agent.id}-${key}`}
                      tabIndex={rail === key ? 0 : -1}
                      aria-label={`${RAIL_NAME[key]}: ${railSummary(key)}`}
                      title={`${RAIL_NAME[key]} · ${railSummary(key)}`}
                      data-state={key === "claude" && !claudeConnected ? "sign-in-required" : "available"}
                      className={cx(
                        "provider-model-rail-button",
                        rail === key && "provider-model-rail-button-selected",
                        key === "claude" && !claudeConnected && "provider-model-rail-button-unavailable",
                      )}
                      onClick={() => setRail(key)}
                      onKeyDown={(event) => onRailKeyDown(event, key)}
                    >
                      <ProviderMark rail={key} large />
                    </button>
                  ))}
                </div>
              </div>
              {RAILS.map((key) => (
                <div
                  key={key}
                  id={`model-panel-${agent.id}-${key}`}
                  role="tabpanel"
                  aria-labelledby={`model-rail-${agent.id}-${key}`}
                  className="provider-model-panel"
                  data-selected={rail === key ? "" : undefined}
                >
                  <div className="provider-model-heading">
                    <div className="provider-model-heading-text">
                      <strong>{RAIL_NAME[key]}</strong>
                      <span>{key === "claude" && !claudeConnected ? "Not connected" : `${who} runs on it from its next turn`}</span>
                    </div>
                  </div>
                  {error && rail === key ? (
                    <div className="provider-model-empty" role="alert">
                      <span>{error}</span>
                    </div>
                  ) : null}
                  {key === "gateway" ? list(key, models.gateway) : null}
                  {key === "claude" && !claudeConnected ? (
                    <div className="provider-model-empty" role="status">
                      <span>Run {who} on your Claude subscription, an Anthropic API key, or this computer&apos;s Claude Code.</span>
                      <Button type="button" size="xs" variant="outline" onClick={connect}>
                        Use your Claude account…
                      </Button>
                    </div>
                  ) : null}
                  {key === "claude" && claudeConnected ? (
                    <>
                      {list(key, CLAUDE_MODELS)}
                      <div className="provider-model-effort">
                        <span>Connected</span>
                        <Button type="button" size="xs" variant="ghost" onClick={connect}>
                          Manage…
                        </Button>
                      </div>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {connectOpen ? (
        <ConnectClaudeDialog
          onClose={() => {
            setConnectOpen(false);
            requestAnimationFrame(() => trigger.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
}
