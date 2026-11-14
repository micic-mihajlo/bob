import { Info, TriangleAlert } from "lucide-react";

export function NoticeLine({ tone, text }: { tone: "info" | "warning"; text: string }) {
  const Icon = tone === "warning" ? TriangleAlert : Info;
  return (
    <p className="marker notice" data-tone={tone}>
      <Icon className="icon" size={12} aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}
