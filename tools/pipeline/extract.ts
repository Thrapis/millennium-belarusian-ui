// Reads Steam's localization tables and writes a per-module snapshot to
// l10n/source/<module>.json: { "<token>": { "en": "...", "ru": "...", "uk": "...", "pl": "..." } }.
// English and Russian are required; Ukrainian and Polish are helper languages for translators.
// Usage: npm run extract [-- --steam <dir>] [--out <dir>]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parseLocFile, type TokenTable } from "./lib/steam-locfile.ts";
import { findSteamDir, listLocFiles } from "./lib/steam-paths.ts";

/** Language code → Steam file-name language, in snapshot key order. */
export const LANGUAGES = { en: "english", ru: "russian", uk: "ukrainian", pl: "polish" } as const;
export type LangCode = keyof typeof LANGUAGES;
const REQUIRED: LangCode[] = ["en", "ru"];
const HELPERS: LangCode[] = ["uk", "pl"];

export type SourceEntry = Partial<Record<LangCode, string>>;

export interface ModuleSnapshot {
  module: string;
  tokens: Record<string, SourceEntry>;
}

/** Token ids come from English and Russian only; helper languages fill in values for those ids. */
export function buildSnapshot(module: string, tables: Partial<Record<LangCode, TokenTable>>): ModuleSnapshot {
  const ids = [...new Set(REQUIRED.flatMap((l) => Object.keys(tables[l] ?? {})))].sort();
  const tokens: Record<string, SourceEntry> = {};
  for (const id of ids) {
    const entry: SourceEntry = {};
    for (const lang of Object.keys(LANGUAGES) as LangCode[]) {
      const value = tables[lang]?.[id];
      if (value !== undefined) entry[lang] = value;
    }
    tokens[id] = entry;
  }
  return { module, tokens };
}

export function extract(steamDir: string): ModuleSnapshot[] {
  const steamName = (codes: LangCode[]) => codes.map((c) => LANGUAGES[c]);
  return listLocFiles(steamDir, steamName(REQUIRED), steamName(HELPERS)).map(({ module, paths }) => {
    const tables: Partial<Record<LangCode, TokenTable>> = {};
    for (const lang of Object.keys(LANGUAGES) as LangCode[]) {
      const path = paths[LANGUAGES[lang]];
      if (path) tables[lang] = parseLocFile(readFileSync(path, "utf8"));
    }
    return buildSnapshot(module, tables);
  });
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
    const has = (l: LangCode) => entries.filter((e) => e[l] !== undefined).length;
    console.log(
      `${module.padEnd(12)} ${String(entries.length).padStart(6)} tokens  ` +
        (Object.keys(LANGUAGES) as LangCode[]).map((l) => `${l} ${has(l)}`).join(", "),
    );
    writeFileSync(join(outDir, `${module}.json`), JSON.stringify(tokens, null, 2) + "\n");
  }
  const collisions = findCollisions(snapshots);
  console.log(`Token ids shared across modules: ${collisions.size}`);
}

if (import.meta.main) main();
