import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { buildSnapshot, extract, findCollisions } from "../../tools/pipeline/extract.ts";

const FIXTURE_STEAM = join(import.meta.dirname, "..", "fixtures");

describe("extract", () => {
  // Proves en and ru are joined per token id, and tokens missing in one language are kept.
  it("joins English and Russian by token id", () => {
    const [shared] = extract(FIXTURE_STEAM);
    expect(shared!.module).toBe("shared");
    expect(shared!.tokens["Button_Back"]).toMatchObject({ en: "Back", ru: "Назад" });
    expect(shared!.tokens["OnlyRu"]).toEqual({ ru: "x" });
  });

  // Proves helper languages are attached where Steam has them, and a missing
  // helper file (Polish in the fixture) or missing string is simply absent.
  it("adds Ukrainian and Polish when present", () => {
    const [shared] = extract(FIXTURE_STEAM);
    expect(shared!.tokens["Item_Plural"]).toEqual({ en: "%1$s items", ru: "%1$s предметов", uk: "%1$s предметів" });
    expect(shared!.tokens["Quote"]).not.toHaveProperty("uk");
    expect(Object.values(shared!.tokens).some((e) => "pl" in e)).toBe(false);
  });

  // Proves output order is stable (sorted), so re-extracts produce clean diffs.
  it("sorts token ids", () => {
    const snap = buildSnapshot("m", { en: { b: "B", a: "A" }, ru: { c: "C" } });
    expect(Object.keys(snap.tokens)).toEqual(["a", "b", "c"]);
  });

  // Proves helper languages never add token ids that Steam's English/Russian don't have.
  it("ignores helper-only token ids", () => {
    const snap = buildSnapshot("m", { en: { a: "A" }, ru: { a: "А" }, uk: { a: "А", stale: "x" } });
    expect(Object.keys(snap.tokens)).toEqual(["a"]);
  });
});

describe("findCollisions", () => {
  // Proves ids defined in several modules are reported, since the runtime map is flat.
  it("reports ids owned by more than one module", () => {
    const a = buildSnapshot("a", { en: { X: "1", Y: "2" }, ru: {} });
    const b = buildSnapshot("b", { en: { X: "1" }, ru: {} });
    expect([...findCollisions([a, b])]).toEqual([["X", ["a", "b"]]]);
  });
});
