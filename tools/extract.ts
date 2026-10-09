// Reads Steam's English + Russian localization tables and writes a per-module
// snapshot to l10n/source/<module>.json: { "<token>": { "en": "...", "ru": "..." } }.
// Usage: npm run extract [-- --steam <dir>] [--out <dir>]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parseLocFile, type TokenTable } from "./lib/steam-locfile.ts";
import { findSteamDir, listLocFiles } from "./lib/steam-paths.ts";

export interface SourceEntry {
  en?: string;
  ru?: string;
}

export interface ModuleSnapshot {
  module: string;
  tokens: Record<string, SourceEntry>;
}

export function buildSnapshot(module: string, en: TokenTable, ru: TokenTable): ModuleSnapshot {
  const ids = [...new Set([...Object.keys(en), ...Object.keys(ru)])].sort();
  const tokens: Record<string, SourceEntry> = {};
  for (const id of ids) tokens[id] = { en: en[id], ru: ru[id] };
  return { module, tokens };
}

export function extract(steamDir: string): ModuleSnapshot[] {
  return listLocFiles(steamDir, ["english", "russian"]).map(({ module, paths }) =>
    buildSnapshot(
      module,
      parseLocFile(readFileSync(paths["english"]!, "utf8")),
      parseLocFile(readFileSync(paths["russian"]!, "utf8")),
    ),
  );
}

/** Token ids defined by more than one module. The runtime token map is flat, so these share one value. */
export function findCollisions(snapshots: ModuleSnapshot[]): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const { module, tokens } of snapshots) {
    for (const id of Object.keys(tokens)) owners.set(id, [...(owners.get(id) ?? []), module]);
  }
  return new Map([...owners].filter(([, mods]) => mods.length > 1));
}

function main() {
  const { values } = parseArgs({ options: { steam: { type: "string" }, out: { type: "string" } } });
  const steamDir = findSteamDir(values.steam);
  const outDir = values.out ?? join("l10n", "source");
  mkdirSync(outDir, { recursive: true });

  const snapshots = extract(steamDir);
  console.log(`Steam: ${steamDir}`);
  for (const { module, tokens } of snapshots) {
    const entries = Object.values(tokens);
    const both = entries.filter((e) => e.en !== undefined && e.ru !== undefined).length;
    console.log(
      `${module.padEnd(12)} ${String(entries.length).padStart(6)} tokens  ` +
        `(en+ru ${both}, en only ${entries.filter((e) => e.ru === undefined).length}, ` +
        `ru only ${entries.filter((e) => e.en === undefined).length})`,
    );
    writeFileSync(join(outDir, `${module}.json`), JSON.stringify(tokens, null, 2) + "\n");
  }
  const collisions = findCollisions(snapshots);
  console.log(`Token ids shared across modules: ${collisions.size}`);
}

if (import.meta.main) main();
