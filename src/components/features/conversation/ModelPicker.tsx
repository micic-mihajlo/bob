"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { setThreadModel } from "@/lib/client/api";
import { cx } from "@/components/ui/classes";
import { THREAD_MODELS, type Agent } from "@/lib/types";

/** The model as the reference's model pill shows it: the name after the provider. */
export function modelName(model: string): string {
  return model.split("/").at(-1) ?? model;
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

/** A crew thread's model, in the reference's model pill, with a menu of the models it can run on. */
export function ModelPicker({ agent }: { agent: Agent }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const name = modelName(agent.model);

  useEffect(() => {
    if (anchor === null) return;
    (menu.current?.querySelector<HTMLElement>("[aria-checked=true]") ?? menu.current?.querySelector<HTMLElement>("[role=menuitemradio]"))?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setAnchor(null);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setAnchor(null);
      trigger.current?.focus();
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor]);

  const open = () => {
    setError(null);
    setAnchor(trigger.current?.getBoundingClientRect() ?? null);
  };

  const choose = async (model: string) => {
    if (model === agent.model) {
      setAnchor(null);
      return;
    }
    setSaving(model);
    setError(null);
    const result = await setThreadModel(agent.id, model);
    setSaving(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAnchor(null);
    trigger.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div className="provider-model-picker">
      <button
        ref={trigger}
        type="button"
        className="provider-model-trigger"
        aria-label={`Agent model: ${name}`}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        title={agent.model}
        onClick={() => (anchor === null ? open() : setAnchor(null))}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          open();
        }}
      >
        <span className="provider-model-trigger-value">
          <span className="provider-model-trigger-name">{name}</span>
        </span>
        <ChevronDownIcon />
      </button>
      {anchor !== null ? (
        <div style={{ position: "fixed", zIndex: 60, top: anchor.bottom + 8, right: window.innerWidth - anchor.right }}>
          <div ref={menu} role="menu" aria-label="Models" className="provider-model-popover" data-expanded="" onKeyDown={onMenuKeyDown}>
            <div className="provider-model-panel" data-selected="">
              <div className="provider-model-heading">
                <div className="provider-model-heading-text">
                  <strong>Model</strong>
                  <span>{agent.code ?? agent.name} runs on it from its next turn</span>
                </div>
              </div>
              {error ? (
                <div className="provider-model-empty" role="alert">
                  <span>{error}</span>
                </div>
              ) : null}
              <div className="provider-model-list">
                {THREAD_MODELS.map((model) => {
                  const selected = model === agent.model;
                  return (
                    <button
                      key={model}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      tabIndex={-1}
                      title={model}
                      disabled={saving !== null}
                      className={cx("provider-model-option", selected && "provider-model-option-selected")}
                      onClick={() => void choose(model)}
                    >
                      <span className="provider-model-option-name">
                        <span>{modelName(model)}</span>
                        {saving === model ? <small>Saving</small> : null}
                      </span>
                      {selected ? <CheckIcon /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
