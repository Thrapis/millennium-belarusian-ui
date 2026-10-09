import { describe, expect, it } from "vitest";
import { plain } from "../tools/lib/placeholders.ts";
import { readXliff, writeXliff } from "../tools/lib/xliff.ts";
import { buildModuleXliff } from "../tools/make-xliff.ts";
import type { LangCode } from "../tools/extract.ts";

const tokens = {
  Item: { en: "%1$s item", ru: "%1$s предмет", uk: "%1$s предмет", pl: "%1$s przedmiot" },
  Item_Plural: { en: "%1$s items", ru: "%1$s предметов", uk: "%1$s предметів" },
  VR: { en: "Ready for VR" },
  Empty: { en: "", ru: "" },
  Mismatch: { en: "%1$s of %2$s", ru: "%1$s", pl: "%1$s z %2$s" },
};

describe("buildModuleXliff", () => {
  const { project, references, stats } = buildModuleXliff("shared", tokens);
  const reference = references["en"]!;
  const unit = (id: string) => project.units.find((u) => u.id === id);

  // Proves the project file is ru → be, untranslated, with Russian sources.
  it("builds an untranslated ru → be project file", () => {
    expect([project.sourceLang, project.targetLang, project.original]).toEqual(["ru", "be", "shared"]);
    expect(project.units.every((u) => u.target === undefined)).toBe(true);
    expect(plain(unit("Item")!.source)).toBe("%1$s предмет");
  });

  // Proves translators are told which plural form a string is, and where Russian is missing.
  it("adds translator notes", () => {
    expect(unit("Item")!.note).toMatch(/Singular form.*Item_Plural/);
    expect(unit("Item_Plural")!.note).toMatch(/Plural form.*Singular: Item\./);
    expect(plain(unit("VR")!.source)).toBe("Ready for VR");
    expect(unit("VR")!.note).toMatch(/no Russian text/);
    expect(unit("Mismatch")!.note).toMatch(/placeholders differ.*%1\$s of %2\$s/);
  });

  // Proves empty strings are left out (bellingua requires a non-empty source).
  it("skips empty strings", () => {
    expect(unit("Empty")).toBeUndefined();
    expect(stats).toEqual({ units: 4, skippedEmpty: 1, englishSource: 1, codeMismatch: 1 });
  });

  // Proves the reference tree has identical ids and plain sources (bellingua's matching key)
  // with English targets, and that every reference target survives bellingua-style reading.
  it("builds a matching English reference file", () => {
    expect(reference.targetLang).toBe("en");
    expect(reference.units.map((u) => u.id)).toEqual(project.units.map((u) => u.id));
    for (const r of reference.units) {
      expect(plain(r.source)).toBe(plain(project.units.find((u) => u.id === r.id)!.source));
    }
    const { file, problems } = readXliff(writeXliff(reference));
    expect(problems).toEqual([]);
    expect(Object.fromEntries(file.units.map((u) => [u.id, plain(u.target!)]))).toEqual({
      Item: "%1$s item",
      Item_Plural: "%1$s items",
      VR: "Ready for VR",
      Mismatch: "%1$s of %2$s",
    });
  });

  // Proves Ukrainian and Polish reference files carry only the strings Steam translated,
  // keep the project's plain source text, and survive bellingua-style reading even
  // when their placeholders differ from the Russian source.
  it("builds Ukrainian and Polish reference files", () => {
    expect(Object.keys(references).sort()).toEqual(["en", "pl", "uk"]);
    const read = (lang: LangCode) => {
      const { file, problems } = readXliff(writeXliff(references[lang]!));
      expect(problems).toEqual([]);
      expect(file.targetLang).toBe(lang);
      for (const u of file.units) expect(plain(u.source)).toBe(plain(unit(u.id)!.source));
      return Object.fromEntries(file.units.map((u) => [u.id, plain(u.target!)]));
    };
    expect(read("uk")).toEqual({ Item: "%1$s предмет", Item_Plural: "%1$s предметів" });
    expect(read("pl")).toEqual({ Item: "%1$s przedmiot", Mismatch: "%1$s z %2$s" });
  });
});
