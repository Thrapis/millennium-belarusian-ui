import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toPieces, plain } from "../../tools/pipeline/lib/placeholders.ts";
import { readXliff, writeXliff, type XliffFile } from "../../tools/pipeline/lib/xliff.ts";

const sample = (): XliffFile => ({
  original: "steamui",
  sourceLang: "ru",
  targetLang: "be",
  units: [
    {
      id: "Fmt",
      note: "a & b",
      source: toPieces(`%1$s "из" <%2$s>\nдалее`),
      target: toPieces(`%2$s "з" <%1$s>\nдалей`),
      state: "translated",
    },
    { id: "Untranslated", source: toPieces("Новости") },
  ],
});

describe("writeXliff", () => {
  // Proves output matches bellingua's own writer byte-for-byte (Go encoding/xml escaping,
  // per-unit <ph> ids from source order), so bellingua re-exports diff cleanly.
  it("writes bellingua's XLIFF 1.2 layout", () => {
    expect(writeXliff(sample())).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">\n` +
        `  <file original="steamui" source-language="ru" target-language="be" datatype="plaintext">\n` +
        `    <body>\n` +
        `      <trans-unit id="Fmt" xml:space="preserve">\n` +
        `        <source><ph id="1">%1$s</ph> &#34;из&#34; &lt;<ph id="2">%2$s</ph>&gt;&#xA;далее</source>\n` +
        `        <target state="translated"><ph id="2">%2$s</ph> &#34;з&#34; &lt;<ph id="1">%1$s</ph>&gt;&#xA;далей</target>\n` +
        `        <note>a &amp; b</note>\n` +
        `      </trans-unit>\n` +
        `      <trans-unit id="Untranslated" xml:space="preserve">\n` +
        `        <source>Новости</source>\n` +
        `      </trans-unit>\n` +
        `    </body>\n  </file>\n</xliff>\n`,
    );
  });

  // Proves a target whose codes don't exist in the source is refused rather than written.
  it("refuses targets with codes missing from the source", () => {
    const f = sample();
    f.units[0]!.target = toPieces("%3$s");
    expect(() => writeXliff(f)).toThrow(/Fmt/);
  });
});

describe("readXliff", () => {
  // Proves write → read is lossless for sources, targets, notes and states.
  it("round-trips its own output", () => {
    const { file, problems } = readXliff(writeXliff(sample()));
    expect(problems).toEqual([]);
    expect(file.original).toBe("steamui");
    expect(file.units.map((u) => [u.id, plain(u.source), u.target && plain(u.target), u.state, u.note])).toEqual([
      ["Fmt", `%1$s "из" <%2$s>\nдалее`, `%2$s "з" <%1$s>\nдалей`, "translated", "a & b"],
      ["Untranslated", "Новости", undefined, undefined, undefined],
    ]);
  });

  // Proves a bellingua export parses: reordered/rewritten codes come back as the
  // source markup, entities decode, and broken tag sets are dropped and reported.
  it("reads a bellingua export", () => {
    const xml = readFileSync(join(import.meta.dirname, "..", "fixtures", "bellingua-export", "steamui.xlf"), "utf8");
    const { file, problems } = readXliff(xml);
    const byId = Object.fromEntries(file.units.map((u) => [u.id, u]));
    expect(file.targetLang).toBe("be");
    expect(plain(byId["MainTabsLibrary"]!.target!)).toBe("Бібліятэка");
    expect(byId["MainTabsLibrary"]!.state).toBe("final");
    expect(plain(byId["Reorder"]!.target!)).toBe("%2$s з %1$s");
    expect(plain(byId["Escapes"]!.target!)).toBe(`"Стоп" & <адразу>\nяшчэ`);
    expect(byId["Escapes"]!.note).toBe("Context & note");
    expect(byId["Untranslated"]!.target).toBeUndefined();
    expect(byId["BrokenTags"]!.target).toBeUndefined();
    expect(problems).toEqual([{ id: "BrokenTags", reason: "missing tag ids 1" }]);
  });

  // Proves malformed XML fails loudly instead of yielding a partial translation.
  it("throws on malformed XML", () => {
    expect(() => readXliff("<xliff><file><body><trans-unit id='a'><source>x</trans-unit>")).toThrow();
  });
});
