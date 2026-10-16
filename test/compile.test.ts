import { describe, expect, it } from "vitest";
import { compileTranslations, stateRank, toModuleSource } from "../tools/compile.ts";
import { toPieces } from "../tools/lib/placeholders.ts";
import type { XliffFile } from "../tools/lib/xliff.ts";

const file = (original: string, units: [id: string, ru: string, be: string | undefined, state?: string][]): XliffFile => ({
  original,
  sourceLang: "ru",
  targetLang: "be",
  units: units.map(([id, ru, be, state]) => ({
    id,
    source: toPieces(ru),
    ...(be === undefined ? {} : { target: toPieces(be) }),
    ...(state ? { state } : {}),
  })),
});

const sources = {
  steamui: {
    MainTabsLibrary: { en: "Library", ru: "Библиотека" },
    Small: { en: "Small", ru: "Мелкий" },
    Retry: { en: "Retry", ru: "Повторить попытку" },
    Fresh: { en: "Fresh", ru: "Новое" },
  },
  friendsui: {
    Small: { en: "Small text", ru: "Маленький" },
    Retry: { en: "Retry", ru: "Повторить" },
  },
};

describe("stateRank", () => {
  // Proves XLIFF states map to bellingua's order: mt < translated < approved.
  it("orders states like bellingua", () => {
    expect(stateRank("needs-review-translation")).toBe(1);
    expect(stateRank(undefined)).toBe(1);
    expect(stateRank("translated")).toBe(2);
    expect(stateRank("final")).toBe(3);
  });
});

describe("compileTranslations", () => {
  const files = [
    file("steamui", [
      ["MainTabsLibrary", "Библиотека", "Бібліятэка", "final"],
      ["Small", "Мелкий", "Дробны", "needs-review-translation"],
      ["Retry", "Повторить попытку", "Паўтарыць спробу", "translated"],
      ["Fresh", "Новое", undefined],
      ["Gone", "Удалено", "Выдалена", "final"],
    ]),
    file("friendsui", [
      ["Small", "Маленький", "Маленькі", "needs-review-translation"],
      ["Retry", "Повторить", "Паўтарыць", "translated"],
    ]),
  ];

  // Proves translations land in one flat id → text map, untranslated units are skipped,
  // and ids Steam no longer has are reported instead of shipped.
  it("builds a flat token map", () => {
    const { data, report } = compileTranslations(files, sources, "mt");
    expect(data.tokens["MainTabsLibrary"]).toBe("Бібліятэка");
    expect(data.tokens).not.toHaveProperty("Fresh");
    expect(data.tokens).not.toHaveProperty("Gone");
    expect(report.unknownIds).toEqual(["steamui:Gone"]);
    expect(report.modules["steamui"]).toEqual({ units: 5, shipped: 3 });
  });

  // Proves an id whose English differs per module is resolved at runtime by its English text,
  // with the main-window module (steamui) as the default.
  it("disambiguates colliding ids by English text", () => {
    const { data } = compileTranslations(files, sources, "mt");
    expect(data.tokens["Small"]).toBe("Дробны");
    expect(data.byEnglish["Small"]).toEqual({ Small: "Дробны", "Small text": "Маленькі" });
    // Same English in both modules: nothing to tell apart, steamui wins and no table is emitted.
    expect(data.tokens["Retry"]).toBe("Паўтарыць спробу");
    expect(data.byEnglish).not.toHaveProperty("Retry");
  });

  // Proves the state threshold drops machine translations when only reviewed text should ship.
  it("applies the minimum state", () => {
    const { data } = compileTranslations(files, sources, "translated");
    expect(Object.keys(data.tokens).sort()).toEqual(["MainTabsLibrary", "Retry"]);
    expect(compileTranslations(files, sources, "approved").data.tokens).toEqual({ MainTabsLibrary: "Бібліятэка" });
  });
});

describe("toModuleSource", () => {
  // Proves the generated module embeds the table as one JSON.parse string literal
  // (V8 parses that faster than an object literal) and evaluates back to identical data,
  // including quotes, newlines and characters that are special inside JS strings.
  it("emits a JSON.parse module that round-trips", () => {
    const data = { tokens: { A: `"Цытата" 'адна' \\ ${"\n"} \u2028 </script>` }, byEnglish: { B: { x: "y" } } };
    const src = toModuleSource(data);
    expect(src.match(/JSON\.parse\(/g)).toHaveLength(1);
    const body = src.slice(src.indexOf("JSON.parse("), src.lastIndexOf(")") + 1);
    expect(new Function(`return ${body}`)()).toEqual(data);
  });
});
