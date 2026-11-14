import "@/components/theme/index.css";
import { Conversation } from "@/components/features/conversation/Conversation";
import { AppWindow } from "@/components/features/window/AppWindow";

export default function Home() {
  return (
    <AppWindow>
      <Conversation />
    </AppWindow>
  );
}
