import type { Meta, StoryObj } from "storybook-solidjs-vite";
import BobRoadmapPanel from "../src/features/bob-roadmap/BobRoadmapPanel";
import { createMockBobRoadmap } from "../src/preview/mock-bob-roadmap";

function RoadmapStory() {
  window.bob = { ...window.bob, bobRoadmap: createMockBobRoadmap() };
  return (
    <div style={{ display: "flex", height: "100vh", width: "380px" }}>
      <BobRoadmapPanel busy={false} onClose={() => {}} />
    </div>
  );
}

const meta = {
  title: "Bob/RoadmapPanel",
  component: RoadmapStory,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RoadmapStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Stage 2 of 6: the goal, today's tasks, the roadmap with the plan of each stage, and the weekly rhythm. */
export const Planned: Story = {};
