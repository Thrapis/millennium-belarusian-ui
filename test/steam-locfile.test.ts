import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeJsSingleQuoted, parseLocFile } from "../tools/lib/steam-locfile.ts";
import { listLocFiles } from "../tools/lib/steam-paths.ts";

const FIXTURE_STEAM = join(import.meta.dirname, "fixtures");

// Encodes text as a JS string literal the way Steam's bundler does since Oct 2026:
// backslash, the quote and "${" escaped; everything outside ASCII as \uXXXX.
// (Built from character codes so no editor can decode the escapes in this file.)
const BS = String.fromCharCode(92);
function jsLiteral(text: string, quote: "'" | '"' | "`"): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const code = c.charCodeAt(0);
    if (c === BS || c === quote) out += BS + c;
    else if (quote === "`" && c === "$" && text[i + 1] === "{") out += BS + c;
    else if (c === "\n") out += BS + "n";
    else if (code > 0x7e) out += BS + "u" + code.toString(16).toUpperCase().padStart(4, "0");
    else out += c;
  }
  return quote + out + quote;
}
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

  // Proves the Oct 2026 Steam build format parses: a template literal argument with
  // \uXXXX-escaped Cyrillic, an IIFE wrapper and a trailing sourceMappingURL comment.
  it("parses template-literal chunks", () => {
    const tokens = { language: "russian", Button_Back: "Назад", Quote: "Don't \"stop\" ` ${x}", Multi: "A\nB" };
    const src =
      '"use strict";(()=>{(self.webpackChunksteamui=self.webpackChunksteamui||[]).push([[2664],{36717:(e=>{e.exports=JSON.parse(' +
      jsLiteral(JSON.stringify(tokens), "`") +
      ")})}]);})();\n//# sourceMappingURL=file:///x.js.map\n";
    expect(src).toContain(BS + "u041D"); // really escaped, like Steam's files
    expect(parseLocFile(src)).toEqual({ Button_Back: "Назад", Quote: "Don't \"stop\" ` ${x}", Multi: "A\nB" });
  });

  // Proves double-quoted arguments (the bundler's third choice) parse too.
  it("parses double-quoted chunks", () => {
    expect(parseLocFile(`e.exports=JSON.parse(${jsLiteral(JSON.stringify({ A: "а'" }), '"')})`)).toEqual({ A: "а'" });
  });

  // Proves an unescaped ${ (a real interpolation, not data) is refused rather than mis-read.
  it("refuses template interpolation", () => {
    expect(() => parseLocFile('JSON.parse(`{"A":"${x}"}`)')).toThrow(/interpolation/);
  });

  // Proves we fail loudly if Steam changes the chunk format, instead of extracting nothing.
  it("throws on an unrecognised file", () => {
    expect(() => parseLocFile("console.log(1)")).toThrow(/JSON\.parse/);
    expect(() => parseLocFile("JSON.parse('{}');JSON.parse('{}')")).toThrow(/exactly one/);
    expect(() => parseLocFile("JSON.parse(`{}`);JSON.parse('{}')")).toThrow(/exactly one/);
  });
});

describe("listLocFiles", () => {
  // Proves file discovery pairs english/russian per module and ignores other languages.
  it("pairs modules by language", () => {
    const files = listLocFiles(FIXTURE_STEAM, ["english", "russian"]);
    expect(files.map((f) => f.module)).toEqual(["shared"]);
    expect(Object.keys(files[0]!.paths).sort()).toEqual(["english", "russian"]);
  });

  // Proves optional languages are included when present and don't exclude a module when absent.
  it("includes optional languages when present", () => {
    const files = listLocFiles(FIXTURE_STEAM, ["english", "russian"], ["ukrainian", "polish"]);
    expect(Object.keys(files[0]!.paths).sort()).toEqual(["english", "russian", "ukrainian"]);
  });
});
