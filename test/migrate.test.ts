import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SourceEntry } from "../tools/extract.ts";
import { archiveName, migrateModule, migrateTree } from "../tools/migrate.ts";
import { buildModuleXliff } from "../tools/make-xliff.ts";
import { plain, toPieces } from "../tools/lib/placeholders.ts";
import { readXliff, writeXliff, type XliffFile } from "../tools/lib/xliff.ts";

type Tokens = Record<string, SourceEntry>;
const MT = "needs-review-translation";

/** The bellingua export of `tokens`, with the given targets filled in. */
function exported(tokens: Tokens, targets: Record<string, [string, string]>): XliffFile {
  const file = buildModuleXliff("shared", tokens).project;
  for (const u of file.units) {
    const t = targets[u.id];
    if (t) {
      u.target = toPieces(t[0]);
      u.state = t[1];
    }
  }
  return file;
}
const unit = (f: XliffFile, id: string) => f.units.find((u) => u.id === id)!;

describe("migrateModule", () => {
  const oldTokens: Tokens = {
    Same: { en: "Back", ru: "Назад" },
    RuChanged: { en: "Open", ru: "Открыть" },
    RuChangedMt: { en: "Close", ru: "Закрыть" },
    EnChanged: { en: "You do not own it", ru: "Нет игры" },
    Codes: { en: "Hello %1$s", ru: "Привет %1$s" },
    Gone: { en: "Gone", ru: "Удалено" },
    Final: { en: "Final", ru: "Финал" },
  };
  const newTokens: Tokens = {
    Same: { en: "Back", ru: "Назад" },
    RuChanged: { en: "Open", ru: "Открыть файл" },
    RuChangedMt: { en: "Close", ru: "Закрыть окно" },
    EnChanged: { en: "You do not have it", ru: "Нет игры" },
    Codes: { en: "Hello %1$s and %2$s", ru: "Привет %1$s и %2$s" },
    Final: { en: "Final", ru: "Финал 2" },
    Added: { en: "Added", ru: "Новое" },
  };
  const old = exported(oldTokens, {
    Same: ["Назад", "translated"],
    RuChanged: ["Адкрыць", "translated"],
    RuChangedMt: ["Закрыць", MT],
    EnChanged: ["Няма гульні", "final"],
    Codes: ["Прывітанне %1$s", "translated"],
    Gone: ["Выдалена", "translated"],
    Final: ["Фінал", "final"],
  });
  const { file, stats } = migrateModule("shared", old, oldTokens, newTokens);

  // Proves an unchanged string keeps its target and state exactly.
  it("keeps targets whose Russian is unchanged", () => {
    expect(unit(file, "Same").target && plain(unit(file, "Same").target!)).toBe("Назад");
    expect(unit(file, "Same").state).toBe("translated");
  });

  // Proves human work survives a Russian change but is flagged for review (state drops to
  // "translated", a note shows the old Russian), matching bellingua's re-import.
  it("keeps human translations when Russian changed, flagged", () => {
    const u = unit(file, "Final");
    expect(plain(u.target!)).toBe("Фінал");
    expect(u.state).toBe("translated");
    expect(u.note).toContain("Source changed, was: «Финал»");
    expect(unit(file, "RuChanged").state).toBe("translated");
  });

  // Proves machine translations of changed sources are dropped, as bellingua does.
  it("drops machine translations when Russian changed", () => {
    expect(unit(file, "RuChangedMt").target).toBeUndefined();
  });

  // Proves an English-only change keeps the translation and tells the translator what changed.
  it("notes English-only changes", () => {
    const u = unit(file, "EnChanged");
    expect(plain(u.target!)).toBe("Няма гульні");
    expect(u.state).toBe("final");
    expect(u.note).toContain("English changed: «You do not own it» → «You do not have it»");
  });

  // Proves a translation whose placeholders no longer fit is not shipped, but its text is kept in a note.
  it("drops targets with mismatched placeholders, keeping the text in a note", () => {
    const u = unit(file, "Codes");
    expect(u.target).toBeUndefined();
    expect(u.note).toContain("Previous translation: Прывітанне %1$s");
  });

  // Proves new ids come out untranslated and removed ids vanish, with accurate counts.
  it("adds new ids and removes old ones", () => {
    expect(unit(file, "Added").target).toBeUndefined();
    expect(file.units.some((u) => u.id === "Gone")).toBe(false);
    expect(stats).toEqual({
      carried: 1,
      flaggedSource: 2,
      flaggedEnglish: 1,
      droppedMt: 1,
      droppedCodes: 1,
      added: 1,
      removed: 1,
    });
  });

  // Proves the result is a valid bellingua file (writeXliff rejects mismatched codes) that reads back.
  it("writes valid XLIFF", () => {
    const back = readXliff(writeXliff(file));
    expect(back.problems).toEqual([]);
    expect(back.file.units.length).toBe(file.units.length);
  });

  // Proves a module with no previous translation migrates to a plain untranslated file.
  it("handles a module without an old file", () => {
    const r = migrateModule("shared", undefined, undefined, newTokens);
    expect(r.file.units.every((u) => !u.target)).toBe(true);
    expect(r.stats.added).toBe(Object.keys(newTokens).length);
  });
});

describe("archiveName", () => {
  // Proves an existing archive is never reused or overwritten.
  it("avoids collisions", () => {
    const taken = new Set(["tr/be.old-2026-10-16", "tr/be.old-2026-10-16-2"]);
    expect(archiveName("tr/be", "2026-10-16", (p) => taken.has(p))).toBe("tr/be.old-2026-10-16-3");
    expect(archiveName("tr/be", "2026-10-17", (p) => taken.has(p))).toBe("tr/be.old-2026-10-17");
  });
});

describe("migrateTree", () => {
  function setup() {
    const root = mkdtempSync(join(tmpdir(), "be-migrate-"));
    const from = join(root, "translations", "be");
    const source = join(root, "l10n", "source");
    mkdirSync(join(from, "source"), { recursive: true });
    mkdirSync(source, { recursive: true });
    const oldTokens: Tokens = { A: { en: "Back", ru: "Назад" }, B: { en: "Gone", ru: "Удалено" } };
    writeFileSync(join(from, "shared.xlf"), writeXliff(exported(oldTokens, { A: ["Назад", "translated"] })));
    writeFileSync(join(from, "source", "shared.json"), JSON.stringify(oldTokens));
    const newTokens: Tokens = { A: { en: "Back", ru: "Назад", uk: "Назад", pl: "Wstecz" }, C: { en: "New", ru: "Новое" } };
    writeFileSync(join(source, "shared.json"), JSON.stringify(newTokens));
    return { root, from, source };
  }

  // Proves the old tree is archived (not deleted) and the new one carries the translation,
  // a stripped en/ru snapshot and nothing from helper languages.
  it("archives the old tree and writes the new one", () => {
    const { root, from, source } = setup();
    const r = migrateTree({ from, source, date: "2026-10-16" });
    const archive = join(root, "translations", "be.old-2026-10-16");
    expect(r.archived).toBe(archive);
    expect(existsSync(join(archive, "shared.xlf"))).toBe(true);
    expect(readFileSync(join(archive, "source", "shared.json"), "utf8")).toContain("Удалено");

    const migrated = readXliff(readFileSync(join(from, "shared.xlf"), "utf8")).file;
    expect(migrated.units.map((u) => u.id)).toEqual(["A", "C"]);
    expect(plain(unit(migrated, "A").target!)).toBe("Назад");
    const snap = JSON.parse(readFileSync(join(from, "source", "shared.json"), "utf8"));
    expect(snap).toEqual({ A: { en: "Back", ru: "Назад" }, C: { en: "New", ru: "Новое" } });
    expect(r.report).toContain("shared");
    expect(readdirSync(join(root, "translations")).sort()).toEqual(["be", "be.old-2026-10-16"]);
  });

  // Proves a second migration on the same day archives to a new name instead of overwriting the first.
  it("keeps earlier archives", () => {
    const { root, from, source } = setup();
    migrateTree({ from, source, date: "2026-10-16" });
    migrateTree({ from, source, date: "2026-10-16" });
    expect(readdirSync(join(root, "translations")).sort()).toEqual(["be", "be.old-2026-10-16", "be.old-2026-10-16-2"]);
  });

  // Proves a missing extraction fails before anything is touched.
  it("leaves the tree alone when the new source is missing", () => {
    const { from, source } = setup();
    expect(() => migrateTree({ from, source: join(source, "nope"), date: "2026-10-16" })).toThrow();
    expect(existsSync(join(from, "shared.xlf"))).toBe(true);
  });
});
