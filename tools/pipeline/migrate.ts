// Moves the committed translation (translations/be) onto a fresh extraction of Steam's strings.
// Usage: npm run migrate [-- --from translations/be] [--source l10n/source]
// Run `npm run extract` first (npm run update-strings does extract + xliff + migrate).
//
// The new tree has exactly the ids, order, sources and notes `npm run xliff` produces. Old targets
// are carried over with the rules bellingua applies on re-import: a human translation survives a
// changed Russian source (flagged for review), a machine one does not. The old tree is renamed to
// <from>.old-<date>, never deleted, and git ignores it.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { stateRank } from "./compile.ts";
import type { SourceEntry } from "./extract.ts";
import { buildModuleXliff } from "./make-xliff.ts";
import { codesOf, plain } from "./lib/placeholders.ts";
import { readXliff, writeXliff, type XliffFile } from "./lib/xliff.ts";

type Tokens = Record<string, SourceEntry>;

export interface MigrateStats {
  carried: number; // target kept as it was
  flaggedSource: number; // human target kept, Russian changed
  flaggedEnglish: number; // target kept, English changed
  droppedMt: number; // machine target dropped, Russian changed
  droppedCodes: number; // target dropped, placeholders no longer fit
  added: number; // ids Steam added
  removed: number; // ids Steam removed
}

const sameMultiset = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join("\0") === [...b].sort().join("\0");
const addNote = (note: string | undefined, extra: string) => (note ? `${note}\n${extra}` : extra);

export function migrateModule(
  module: string,
  old: XliffFile | undefined,
  oldTokens: Tokens | undefined,
  next: Tokens,
): { file: XliffFile; stats: MigrateStats } {
  const file = buildModuleXliff(module, next).project;
  const stats: MigrateStats = {
    carried: 0, flaggedSource: 0, flaggedEnglish: 0, droppedMt: 0, droppedCodes: 0, added: 0, removed: 0,
  };
  const oldUnits = new Map((old?.units ?? []).map((u) => [u.id, u]));
  for (const u of file.units) {
    const o = oldUnits.get(u.id);
    if (!o) {
      stats.added++;
      continue;
    }
    if (!o.target) continue;
    const sourceChanged = plain(o.source) !== plain(u.source);
    if (sourceChanged && stateRank(o.state) < 2) {
      stats.droppedMt++;
      continue;
    }
    if (!sameMultiset(codesOf(o.target), codesOf(u.source))) {
      u.note = addNote(u.note, `Previous translation: ${plain(o.target)}`);
      stats.droppedCodes++;
      continue;
    }
    u.target = o.target;
    u.state = o.state;
    const oldEn = oldTokens?.[u.id]?.en;
    const newEn = next[u.id]?.en;
    if (sourceChanged) {
      if (stateRank(o.state) > 2) u.state = "translated";
      u.note = addNote(u.note, `Source changed, was: «${plain(o.source)}»`);
      stats.flaggedSource++;
    } else if (oldTokens && oldEn !== newEn) {
      u.note = addNote(u.note, `English changed: «${oldEn ?? ""}» → «${newEn ?? ""}»`);
      stats.flaggedEnglish++;
    } else {
      stats.carried++;
    }
  }
  const ids = new Set(file.units.map((u) => u.id));
  stats.removed = [...oldUnits.keys()].filter((id) => !ids.has(id)).length;
  return { file, stats };
}

/** `<dir>.old-<date>`, or `-2`, `-3`… when that already exists. */
export function archiveName(dir: string, date: string, exists: (p: string) => boolean): string {
  const base = `${dir}.old-${date}`;
  if (!exists(base)) return base;
  for (let n = 2; ; n++) if (!exists(`${base}-${n}`)) return `${base}-${n}`;
}

const readJson = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const jsonFiles = (dir: string) => readdirSync(dir).filter((n) => n.endsWith(".json")).sort();

/** The part of the extraction the translation is based on: English and Russian. */
const stripSource = (tokens: Tokens): Tokens =>
  Object.fromEntries(
    Object.entries(tokens).map(([id, e]) => [id, { ...(e.en !== undefined && { en: e.en }), ...(e.ru !== undefined && { ru: e.ru }) }]),
  );

export function migrateTree(opts: { from: string; source: string; date: string }): {
  archived?: string;
  stats: Record<string, MigrateStats>;
  report: string;
} {
  const { from, source, date } = opts;
  // Everything is computed and written next to the target first, so a failure leaves `from` as it was.
  const outputs = new Map<string, string>();
  const stats: Record<string, MigrateStats> = {};
  for (const name of jsonFiles(source)) {
    const module = basename(name, ".json");
    const next = readJson<Tokens>(join(source, name));
    const oldXlf = join(from, `${module}.xlf`);
    const oldSnap = join(from, "source", name);
    const old = existsSync(oldXlf) ? readXliff(readFileSync(oldXlf, "utf8")).file : undefined;
    const oldTokens = existsSync(oldSnap) ? readJson<Tokens>(oldSnap) : undefined;
    const r = migrateModule(module, old, oldTokens, next);
    stats[module] = r.stats;
    outputs.set(`${module}.xlf`, writeXliff(r.file));
    outputs.set(join("source", name), JSON.stringify(stripSource(next), null, 2) + "\n");
  }

  const staging = `${from}.new`;
  rmSync(staging, { recursive: true, force: true });
  for (const [rel, text] of outputs) {
    mkdirSync(join(staging, rel, ".."), { recursive: true });
    writeFileSync(join(staging, rel), text);
  }
  let archived: string | undefined;
  if (existsSync(from)) {
    archived = archiveName(from, date, existsSync);
    renameSync(from, archived);
  }
  renameSync(staging, from);

  const report = Object.entries(stats)
    .map(([m, s]) => `${m.padEnd(12)} ${Object.entries(s).map(([k, v]) => `${k} ${v}`).join(", ")}`)
    .join("\n");
  return { archived, stats, report };
}

function main() {
  const { values } = parseArgs({
    options: {
      from: { type: "string", default: join("translations", "be") },
      source: { type: "string", default: join("l10n", "source") },
    },
  });
  const date = new Date().toISOString().slice(0, 10);
  const r = migrateTree({ from: values.from, source: values.source, date });
  console.log(r.report);
  console.log(r.archived ? `Previous translation archived at ${r.archived}` : "No previous translation to archive");
  console.log(`New translation: ${values.from}. Import it into bellingua, then export back to the same folder.`);
}

if (import.meta.main) main();
