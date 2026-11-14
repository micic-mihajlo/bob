"use client";

import { Moon, Pin, PinOff, RotateCcw } from "lucide-react";
import type { Agent } from "@/lib/types";
import { SidebarMenu, type MenuAnchor, type SidebarMenuItem } from "./SidebarMenu";
import type { useSidebarPins } from "./sidebar-pins";

/**
 * The right-click menu on an agent, in the pinned group and in a section alike. `userHidden` swaps
 * the hide item for a restore item.
 */
export function SidebarAgentContextMenu({
  agent,
  pinned,
  userHidden = false,
  anchor,
  pins,
  onClose,
}: {
  agent: Agent;
  pinned: boolean;
  userHidden?: boolean;
  anchor: MenuAnchor;
  pins: ReturnType<typeof useSidebarPins>;
  onClose: () => void;
}) {
  const items: SidebarMenuItem[] = [
    {
      key: "pin",
      content: (
        <>
          {pinned ? <PinOff className="agent-context-icon size-4" aria-hidden="true" /> : <Pin className="agent-context-icon size-4" aria-hidden="true" />}
          <span>{pinned ? "Unpin" : "Pin"}</span>
        </>
      ),
      onSelect: () => (pinned ? pins.unpin(agent.id) : pins.pin(agent.id)),
    },
    userHidden
      ? {
          key: "restore",
          content: (
            <>
              <RotateCcw className="agent-context-icon size-4" aria-hidden="true" />
              <span>Restore</span>
            </>
          ),
          onSelect: () => pins.restore(agent.id),
        }
      : {
          key: "hide",
          content: (
            <>
              <Moon className="agent-context-icon size-4" aria-hidden="true" />
              <span>Hide agent</span>
            </>
          ),
          onSelect: () => pins.hide(agent.id),
        },
  ];
  return <SidebarMenu anchor={anchor} label="Agent actions" className="agent-context-menu" items={items} onClose={onClose} />;
}
