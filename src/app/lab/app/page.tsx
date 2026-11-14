import "@/components/theme/index.css";
import { AppWindow } from "@/components/features/window/AppWindow";

export default function AppLab() {
  return (
    <AppWindow>
      <main className="conversation-panel" aria-label="Conversation" />
    </AppWindow>
  );
}
