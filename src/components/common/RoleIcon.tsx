import { Hammer, ScanSearch, Telescope, type LucideIcon } from "lucide-react";
import type { CrewRole } from "@/lib/types";

const ROLE_ICON: Record<CrewRole, LucideIcon> = { build: Hammer, review: ScanSearch, research: Telescope };

export const ROLE_LABEL: Record<CrewRole, string> = { build: "Build", review: "Review", research: "Research" };

export function RoleIcon({ role, size = 14 }: { role: CrewRole | undefined; size?: 12 | 14 | 16 }) {
  const Icon = ROLE_ICON[role ?? "build"];
  return <Icon className="icon role-icon" size={size} aria-hidden="true" />;
}
