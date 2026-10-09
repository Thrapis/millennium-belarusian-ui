import { describe, expect, it } from "vitest";
import { codesOf, plain, toPieces } from "../tools/lib/placeholders.ts";

describe("toPieces", () => {
  // Proves the markup Steam substitutes at runtime becomes locked codes.
  it("locks Steam runtime markup", () => {
    expect(toPieces("Нажмите %1$s для <1>входа</1>")).toEqual([
      { text: "Нажмите " },
      { text: "%1$s", code: true },
      { text: " для " },
      { text: "<1>", code: true },
      { text: "входа" },
      { text: "</1>", code: true },
    ]);
    expect(codesOf(toPieces("%s<br>[url=%2$s]x[/url] {s:fileid} [b]y[/b] <p>"))).toEqual([
      "%s", "<br>", "[url=%2$s]", "[/url]", "{s:fileid}", "[b]", "[/b]", "<p>",
    ]);
  });

  // Proves angle-bracket and brace text that Steam shows literally stays translatable.
  it("leaves literal brackets as text", () => {
    for (const s of ["<user name>", "<none>", "{LINK REMOVED}", "<spoiler>", "< не отвечает >", "$1$s"]) {
      expect(toPieces(s)).toEqual([{ text: s }]);
    }
  });

  // Proves splitting never loses or alters characters, including newlines.
  it("is lossless", () => {
    for (const s of ["", "a", "%1$s", "x\n\ny %2$s<br>", "<1></1>%1$s%2$s"]) {
      expect(plain(toPieces(s))).toBe(s);
    }
  });
});
