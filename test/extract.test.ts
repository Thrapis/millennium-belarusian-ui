import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { buildSnapshot, extract, findCollisions } from "../tools/extract.ts";

const FIXTURE_STEAM = join(import.meta.dirname, "fixtures");

describe("extract", () => {
  // Proves en and ru are joined per token id, and tokens missing in one language are kept.
  it("joins English and Russian by token id", () => {
    const [shared] = extract(FIXTURE_STEAM);
    expect(shared!.module).toBe("shared");
    expect(shared!.tokens["Button_Back"]).toEqual({ en: "Back", ru: "Назад" });
    expect(shared!.tokens["OnlyRu"]).toEqual({ en: undefined, ru: "x" });
  });

  // Proves output order is stable (sorted), so re-extracts produce clean diffs.
  it("sorts token ids", () => {
    const snap = buildSnapshot("m", { b: "B", a: "A" }, { c: "C" });
    expect(Object.keys(snap.tokens)).toEqual(["a", "b", "c"]);
  });
});

describe("findCollisions", () => {
  // Proves ids defined in several modules are reported, since the runtime map is flat.
  it("reports ids owned by more than one module", () => {
    const a = buildSnapshot("a", { X: "1", Y: "2" }, {});
    const b = buildSnapshot("b", { X: "1" }, {});
    expect([...findCollisions([a, b])]).toEqual([["X", ["a", "b"]]]);
  });
});
