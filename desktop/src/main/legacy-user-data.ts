import { existsSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";

const LEGACY_PREFIX = /^bob/iu;

/**
 * Bob started as a copy of Bob, whose saved files are named `bob-*` and `bob.db`.
 * Before anything opens them, each one moves once to its Bob name. A name that already exists
 * under Bob is left alone, so a later launch never overwrites newer data.
 */
export function moveLegacyUserData(userDataPath: string): string[] {
  const moved: string[] = [];
  for (const folder of [userDataPath, join(userDataPath, "Partitions")]) {
    let names: string[];
    try {
      names = readdirSync(folder);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!LEGACY_PREFIX.test(name)) continue;
      const target = name.replace(LEGACY_PREFIX, "bob");
      if (existsSync(join(folder, target))) continue;
      try {
        renameSync(join(folder, name), join(folder, target));
        moved.push(name);
      } catch {
        // A file that cannot move keeps its old name; Bob starts that setting fresh.
      }
    }
  }
  return moved;
}
