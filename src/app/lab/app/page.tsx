import "@/components/theme/index.css";
import { SnapshotGate } from "@/components/features/window/SnapshotGate";

export default function AppLab() {
  return (
    <SnapshotGate>
      <div className="app-window" />
    </SnapshotGate>
  );
}
