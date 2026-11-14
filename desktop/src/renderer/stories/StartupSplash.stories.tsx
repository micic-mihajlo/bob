import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { StartupSplash } from "../src/features/startup/StartupSplash";
import { SplashPlayground } from "./splash-story-support";

interface SplashStoryArgs {
  readyAfterMs: number;
}

function SplashStory(args: SplashStoryArgs) {
  return (
    <SplashPlayground readyAfterMs={args.readyAfterMs}>
      {(ready, onExited) => <StartupSplash ready={ready()} onExited={onExited} />}
    </SplashPlayground>
  );
}

const meta = {
  title: "App/StartupSplash",
  component: SplashStory,
  args: { readyAfterMs: 3200 },
  argTypes: {
    readyAfterMs: { control: { type: "range", min: 0, max: 8000, step: 200 } },
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SplashStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The beam finds the glass mark, then the splash fades out. */
export const Sequence: Story = {};

/** The splash never finishes, so the loading state can be inspected. */
export const Loading: Story = {
  render: () => <StartupSplash ready={false} />,
};
