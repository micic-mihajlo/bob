"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/components/ui/classes";

export interface SidebarMenuItem {
  key: string;
  content: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** A separator above the item. */
  separated?: boolean;
}

export interface MenuAnchor {
  x: number;
  y: number;
  /** `end` lines the menu's right edge up with x, as a dropdown placed bottom-end. */
  align: "start" | "end";
  /** Where focus returns when the menu closes. */
  returnFocus: HTMLElement | null;
}

/** The point a right-click opened a context menu at, and the handlers that open and close it. */
export function useMenuAnchor() {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  return {
    anchor,
    openAtPointer: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      setAnchor({ x: event.clientX, y: event.clientY, align: "start", returnFocus: event.currentTarget });
    },
    openBelow: (trigger: HTMLElement, gutter = 4) => {
      const rect = trigger.getBoundingClientRect();
      setAnchor({ x: rect.right, y: rect.bottom + gutter, align: "end", returnFocus: trigger });
    },
    close: () => setAnchor(null),
  };
}

/**
 * The menu panel, in the body so the sidebar's clip does not cut it. It focuses its first item,
 * moves with the arrow keys, and closes on Escape, a press outside, a scroll or a selection.
 */
export function SidebarMenu({
  anchor,
  label,
  className,
  items,
  onClose,
}: {
  anchor: MenuAnchor;
  label: string;
  className?: string;
  items: readonly SidebarMenuItem[];
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    const left = anchor.align === "end" ? anchor.x - width : anchor.x;
    setPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(anchor.y, window.innerHeight - height - 8)),
    });
  }, [anchor]);

  useEffect(() => {
    menu.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
    const close = (event: Event) => {
      const target = event.target as Node;
      if (menu.current?.contains(target)) return;
      if (event.type === "pointerdown" && anchor.align === "end" && anchor.returnFocus?.contains(target)) return;
      onClose();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClose();
      anchor.returnFocus?.focus();
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("blur", onClose);
    };
  }, [anchor, onClose]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const enabled = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? [])];
    const index = enabled.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : index + (event.key === "ArrowDown" ? 1 : -1);
    enabled[(next + enabled.length) % enabled.length]?.focus();
  };

  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      className={cx("ui-action-menu", className)}
      data-expanded=""
      style={{ position: "fixed", left: position?.left ?? anchor.x, top: position?.top ?? anchor.y, visibility: position ? undefined : "hidden" }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => [
        item.separated ? <div key={`${item.key}-separator`} role="separator" /> : null,
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className={item.danger ? "ui-action-menu-danger agent-context-danger" : undefined}
          disabled={item.disabled}
          data-disabled={item.disabled ? "" : undefined}
          tabIndex={-1}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.content}
        </button>,
      ])}
    </div>,
    document.body,
  );
}
