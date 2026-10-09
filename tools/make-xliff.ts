// Turns l10n/source/<module>.json snapshots into the trees bellingua imports:
//   l10n/xliff/<module>.xlf            ru → be, no targets (the project)
//   l10n/reference-<lang>/<module>.xlf same paths, ids and sources, with English, Ukrainian
//                                      or Polish as target (reference languages)
// Usage: npm run xliff
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { LangCode, SourceEntry } from "./extract.ts";
import { codesOf, toPieces, type Piece } from "./lib/placeholders.ts";
import { writeXliff, type XliffFile, type XliffUnit } from "./lib/xliff.ts";

export const SOURCE_LANG = "ru";
export const TARGET_LANG = "be";
export const REFERENCE_LANGS: LangCode[] = ["en", "uk", "pl"];
const PLURAL = "_Plural";

export interface ModuleXliff {
  project: XliffFile;
  references: Partial<Record<LangCode, XliffFile>>;
  stats: { units: number; skippedEmpty: number; englishSource: number; codeMismatch: number };
}

export function buildModuleXliff(module: string, tokens: Record<string, SourceEntry>): ModuleXliff {
  const project: XliffUnit[] = [];
  const references = Object.fromEntries(REFERENCE_LANGS.map((l) => [l, [] as XliffUnit[]]));
  const stats = { units: 0, skippedEmpty: 0, englishSource: 0, codeMismatch: 0 };

  for (const [id, entry] of Object.entries(tokens)) {
    const { en, ru } = entry;
    const sourceText = ru || en;
    if (!sourceText) {
      stats.skippedEmpty++;
      continue;
    }
    const source = toPieces(sourceText);
    const notes: string[] = [];
    if (!ru) {
      stats.englishSource++;
      notes.push("Steam has no Russian text for this string; the source is English.");
    }
    if (id.endsWith(PLURAL)) {
      notes.push(`Plural form: used when the count is not 1. Singular: ${id.slice(0, -PLURAL.length)}.`);
    } else if (`${id}${PLURAL}` in tokens) {
      notes.push(`Singular form: used when the count is exactly 1. Plural: ${id}${PLURAL}.`);
    }
    if (en && !sameMultiset(codesOf(source), codesOf(toPieces(en)))) {
      stats.codeMismatch++;
      notes.push(`English and Russian placeholders differ. English: ${en}`);
    }

    const unit: XliffUnit = { id, source };
    if (notes.length) unit.note = notes.join("\n");
    project.push(unit);
    stats.units++;

    for (const lang of REFERENCE_LANGS) {
      const text = entry[lang];
      if (text) references[lang]!.push(referenceUnit(id, source, sourceText, text));
    }
  }

  return {
    project: { original: module, sourceLang: SOURCE_LANG, targetLang: TARGET_LANG, units: project },
    references: Object.fromEntries(
      REFERENCE_LANGS.map((l) => [l, { original: module, sourceLang: SOURCE_LANG, targetLang: l, units: references[l]! }]),
    ),
    stats,
  };
}

// When codes differ, write both sides as plain text: bellingua matches reference
// units by the plain source text, and a code mismatch would make it drop the target.
function referenceUnit(id: string, source: Piece[], sourceText: string, text: string): XliffUnit {
  const target = toPieces(text);
  return sameMultiset(codesOf(source), codesOf(target))
    ? { id, source, target, state: "final" }
    : { id, source: [{ text: sourceText }], target: [{ text }], state: "final" };
}

function sameMultiset(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join("\0") === [...b].sort().join("\0");
}

function main() {
  const srcDir = join("l10n", "source");
  const projectDir = join("l10n", "xliff");
  const refDir = (lang: LangCode) => join("l10n", `reference-${lang}`);
  for (const dir of [projectDir, ...REFERENCE_LANGS.map(refDir)]) mkdirSync(dir, { recursive: true });

  for (const name of readdirSync(srcDir).filter((n) => n.endsWith(".json")).sort()) {
    const module = basename(name, ".json");
    const tokens = JSON.parse(readFileSync(join(srcDir, name), "utf8")) as Record<string, SourceEntry>;
    const { project, references, stats } = buildModuleXliff(module, tokens);
    writeFileSync(join(projectDir, `${module}.xlf`), writeXliff(project));
    for (const lang of REFERENCE_LANGS) {
      writeFileSync(join(refDir(lang), `${module}.xlf`), writeXliff(references[lang]!));
    }
    const refCounts = REFERENCE_LANGS.map((l) => `${l} ${references[l]!.units.length}`).join(", ");
    console.log(
      `${module.padEnd(12)} ${String(stats.units).padStart(6)} units  references: ${refCounts}  ` +
        `(skipped empty ${stats.skippedEmpty}, English source ${stats.englishSource}, ` +
        `placeholder mismatch en/ru ${stats.codeMismatch})`,
    );
  }
}

if (import.meta.main) main();
