// What main answers for the Bob roadmap pane.

import { type BobRoadmap, parseBobRoadmap } from "@bob/contracts/ipc";

export function decodeBobRoadmap(value: unknown): BobRoadmap {
  const roadmap = parseBobRoadmap(value);
  if (!roadmap) throw new Error("Invalid Bob roadmap response.");
  return roadmap;
}
