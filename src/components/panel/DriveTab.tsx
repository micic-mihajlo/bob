"use client";

import { HardDrive } from "lucide-react";
import { useState } from "react";
import { useBob } from "@/components/app/BobContext";
import { PanelEmpty } from "@/components/common/PanelEmpty";
import { formatClock } from "@/lib/client/format";
import type { DriveFile } from "@/lib/types";
import { MarkdownView } from "./MarkdownView";

const ORDER = ["DIGEST", "CREW", "NOTES"];

function labelOf(file: DriveFile): string {
  return file.name.replace(/\.md$/i, "").toUpperCase();
}

function rank(file: DriveFile): number {
  const index = ORDER.indexOf(labelOf(file));
  return index < 0 ? ORDER.length : index;
}

export function DriveTab() {
  const { snapshot, captain } = useBob();
  const files = [...(snapshot.drive ?? [])].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const [picked, setPicked] = useState<string | null>(null);
  const current = files.find((file) => file.name === picked) ?? files[0];
  const captainName = captain?.name ?? "The captain";

  if (!current) {
    return (
      <PanelEmpty icon={HardDrive} title="The drive is empty">
        {captainName} keeps a digest, the crew list and notes here as the work moves.
      </PanelEmpty>
    );
  }

  return (
    <div className="panel-scroll drive">
      <div className="segmented" role="group" aria-label={`${captainName}'s files`}>
        {files.map((file) => (
          <button key={file.name} type="button" className="segment" aria-pressed={file.name === current.name} onClick={() => setPicked(file.name)}>
            {labelOf(file)}
          </button>
        ))}
      </div>
      <p className="drive-meta">
        {current.name} · updated {formatClock(current.updatedAt)}
      </p>
      {current.content.trim() === "" ? <p className="empty-line">Nothing written here yet.</p> : <MarkdownView source={current.content} />}
    </div>
  );
}
