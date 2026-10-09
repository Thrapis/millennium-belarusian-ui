import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const LOC_SUBDIR = join("steamui", "localization");
const LOC_FILE = /^(?<module>[a-z]+)_(?<language>[a-z_]+)-json\.js$/;

/** Steam install dir: explicit arg, then STEAM_DIR, then the Windows registry. */
export function findSteamDir(explicit?: string): string {
  const candidates = [explicit, process.env["STEAM_DIR"], readRegistrySteamPath()];
  for (const dir of candidates) {
    if (dir && existsSync(join(dir, LOC_SUBDIR))) return dir;
  }
  throw new Error("Steam install not found. Pass --steam <dir> or set STEAM_DIR.");
}

function readRegistrySteamPath(): string | undefined {
  if (process.platform !== "win32") return undefined;
  try {
    const out = execFileSync("reg", ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return /SteamPath\s+REG_SZ\s+(.+)/.exec(out)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

export interface LocModule {
  module: string;
  paths: Record<string, string>;
}

/** Modules (steamui, shared, friendsui…) that have a file for every requested language. */
export function listLocFiles(steamDir: string, languages: string[]): LocModule[] {
  const dir = join(steamDir, LOC_SUBDIR);
  const byModule = new Map<string, Record<string, string>>();
  for (const name of readdirSync(dir)) {
    const m = LOC_FILE.exec(name);
    if (!m?.groups || !languages.includes(m.groups["language"]!)) continue;
    const mod = m.groups["module"]!;
    const paths = byModule.get(mod) ?? {};
    paths[m.groups["language"]!] = join(dir, name);
    byModule.set(mod, paths);
  }
  return [...byModule]
    .filter(([, paths]) => languages.every((l) => l in paths))
    .map(([module, paths]) => ({ module, paths }))
    .sort((a, b) => a.module.localeCompare(b.module));
}
