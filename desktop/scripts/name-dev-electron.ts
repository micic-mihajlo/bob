/**
 * In development macOS shows the name of the stock Electron.app in the Dock and the menu bar. This
 * names that bundle after Bob, so the Dock reads the same as a packaged build. It changes nothing on
 * other platforms, and nothing when the bundle is not there.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const DEV_APP_NAME = "Bob and B(l)obs";
const plist = join(import.meta.dir, "..", "node_modules", "electron", "dist", "Electron.app", "Contents", "Info.plist");

if (process.platform === "darwin" && existsSync(plist)) {
  for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
    spawnSync("plutil", ["-replace", key, "-string", DEV_APP_NAME, plist], { stdio: "ignore" });
  }
}
