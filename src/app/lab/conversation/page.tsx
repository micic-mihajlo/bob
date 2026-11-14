import "@/components/theme/index.css";
import "./shell-gap.css";
import { Conversation } from "@/components/features/conversation/Conversation";
import { AppWindow } from "@/components/features/window/AppWindow";

/** The conversation pane in the window shell. The sidebar switches threads. */
export default function ConversationLab() {
  return (
    <AppWindow>
      <Conversation />
    </AppWindow>
  );
}
