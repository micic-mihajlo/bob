/**
 * In development macOS shows the name of the stock Electron.app in the Dock and the menu bar. This
 * names that bundle after Bob, so the Dock reads the same as a packaged build, and signs it again
 * because the name is part of the bundle's seal. It changes nothing on other platforms, nothing when
 * the bundle is not there, and nothing when it already carries the name.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEV_APP_NAME = "Bob and B(l)obs";
const bundle = fileURLToPath(new URL("../node_modules/electron/dist/Electron.app", import.meta.url));
const plist = `${bundle}/Contents/Info.plist`;

function bundleName(): string {
  return spawnSync("plutil", ["-extract", "CFBundleName", "raw", "-o", "-", plist], { encoding: "utf8" }).stdout.trim();
}

if (process.platform === "darwin" && existsSync(plist) && bundleName() !== DEV_APP_NAME) {
  for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
    spawnSync("plutil", ["-replace", key, "-string", DEV_APP_NAME, plist], { stdio: "ignore" });
  }
  spawnSync("codesign", ["--force", "--deep", "--sign", "-", bundle], { stdio: "ignore" });
}
