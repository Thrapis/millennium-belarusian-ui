import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeJsSingleQuoted, parseLocFile } from "../tools/lib/steam-locfile.ts";
import { listLocFiles } from "../tools/lib/steam-paths.ts";

const FIXTURE_STEAM = join(import.meta.dirname, "fixtures");
const fixture = (name: string) =>
  readFileSync(join(FIXTURE_STEAM, "steamui", "localization", name), "utf8");

describe("decodeJsSingleQuoted", () => {
  // Proves every JS escape form Steam's minifier can emit is decoded.
  it("decodes JS escapes", () => {
    expect(decodeJsSingleQuoted(String.raw`a\'b\\c\nd\x41\u0410\u{1F600}`)).toBe("a'b\\c\nd\x41\u0410\u{1F600}");
  });
  it("drops line continuations", () => {
    expect(decodeJsSingleQuoted("a\\\nb")).toBe("ab");
  });
  it("rejects a dangling backslash", () => {
    expect(() => decodeJsSingleQuoted("a\\")).toThrow();
  });
});

describe("parseLocFile", () => {
  // Proves the two-layer escaping (JS literal, then JSON) round-trips to the
  // exact strings Steam shows, including quotes, backslashes and newlines.
  it("parses an English chunk", () => {
    const t = parseLocFile(fixture("shared_english-json.js"));
    expect(t["Button_Back"]).toBe("Back");
    expect(t["Quote"]).toBe(`Don't "stop"`);
    expect(t["Path"]).toBe("C:\\Steam");
    expect(t["Multi"]).toBe("Line1\nLine2");
    expect(t["Tag"]).toBe("Click <1>here</1>");
  });

  // Proves raw UTF-8 Cyrillic (as in real Russian files) survives both decoding layers.
  it("parses a Russian chunk", () => {
    const t = parseLocFile(fixture("shared_russian-json.js"));
    expect(t["Button_Back"]).toBe("Назад");
    expect(t["Multi"]).toBe("Строка1\nСтрока2");
  });

  // Proves the "language" marker is metadata, not a translatable token.
  it("omits the language key", () => {
    expect(parseLocFile(fixture("shared_english-json.js"))).not.toHaveProperty("language");
  });

  // Proves we fail loudly if Steam changes the chunk format, instead of extracting nothing.
  it("throws on an unrecognised file", () => {
    expect(() => parseLocFile("console.log(1)")).toThrow(/JSON\.parse/);
    expect(() => parseLocFile("JSON.parse('{}');JSON.parse('{}')")).toThrow(/exactly one/);
  });
});

describe("listLocFiles", () => {
  // Proves file discovery pairs english/russian per module and ignores other languages.
  it("pairs modules by language", () => {
    const files = listLocFiles(FIXTURE_STEAM, ["english", "russian"]);
    expect(files.map((f) => f.module)).toEqual(["shared"]);
    expect(Object.keys(files[0]!.paths).sort()).toEqual(["english", "russian"]);
  });
});
