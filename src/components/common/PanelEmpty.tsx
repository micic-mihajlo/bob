import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function PanelEmpty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="panel-scroll panel-empty">
      <Icon className="icon" size={20} aria-hidden="true" />
      <p className="panel-empty-title">{title}</p>
      <p className="empty-line">{children}</p>
    </div>
  );
}
