import { describe, expect, it } from "vitest";
import { diffSources, fingerprint, formatReport, isEmpty, summary, type Snapshot } from "../tools/lib/source-diff.ts";

const old: Snapshot = {
  shared: {
    Keep: { en: "Keep", ru: "Оставить" },
    Gone: { en: "Gone", ru: "Удалено" },
    EnOnly: { en: "You do not own this game", ru: "Нет игры" },
    RuOnly: { en: "Same", ru: "Старое" },
    Both: { en: "Old en", ru: "Старое ru" },
  },
  steamui: { Solo: { en: "Solo", ru: "Один" } },
};
const next: Snapshot = {
  shared: {
    Keep: { en: "Keep", ru: "Оставить" },
    New: { en: "New", ru: "Новое" },
    EnOnly: { en: "You do not have this game", ru: "Нет игры" },
    RuOnly: { en: "Same", ru: "Новое" },
    Both: { en: "New en", ru: "Новое ru" },
  },
  steamui: { Solo: { en: "Solo", ru: "Один" } },
  friendsui: { Fresh: { en: "Fresh" } },
};

describe("diffSources", () => {
  // Proves each kind of change lands in its own bucket, per module, including a module new to Steam.
  it("classifies added, removed, English and Russian changes", () => {
    const d = diffSources(old, next);
    expect(d["shared"]).toEqual({
      added: ["New"],
      removed: ["Gone"],
      enChanged: ["Both", "EnOnly"],
      ruChanged: ["Both", "RuOnly"],
    });
    expect(d["steamui"]).toEqual({ added: [], removed: [], enChanged: [], ruChanged: [] });
    expect(d["friendsui"]!.added).toEqual(["Fresh"]);
  });

  // Proves a module that disappeared counts all its ids as removed.
  it("treats a missing module as all removed", () => {
    expect(diffSources(old, {})["steamui"]!.removed).toEqual(["Solo"]);
  });
});

describe("summary / isEmpty", () => {
  // Proves a string changed in both languages is counted once, not twice.
  it("counts changed ids once", () => {
    expect(summary(diffSources(old, next))).toBe("+2 new, -1 removed, 3 changed");
  });

  // Proves "nothing changed" is detectable, which gates the notification.
  it("detects an empty diff", () => {
    expect(isEmpty(diffSources(old, old))).toBe(true);
    expect(isEmpty(diffSources(old, next))).toBe(false);
  });
});

describe("formatReport", () => {
  // Proves the report shows old and new text, so a translator can judge a change without opening Steam.
  it("lists old and new text", () => {
    const text = formatReport(diffSources(old, next), old, next);
    expect(text).toContain("## shared");
    expect(text).toContain("+ New");
    expect(text).toContain("- Gone");
    expect(text).toContain("You do not own this game");
    expect(text).toContain("You do not have this game");
  });
});

describe("fingerprint", () => {
  // Proves the fingerprint ignores key order and helper languages but notices any en/ru edit,
  // so the daily check repeats a notification only when Steam changed again.
  it("depends only on en/ru content", () => {
    const reordered: Snapshot = { steamui: next["steamui"]!, shared: next["shared"]!, friendsui: next["friendsui"]! };
    const withHelper: Snapshot = structuredClone(next);
    withHelper["shared"]!["Keep"]!.uk = "Залишити";
    expect(fingerprint(reordered)).toBe(fingerprint(next));
    expect(fingerprint(withHelper)).toBe(fingerprint(next));
    expect(fingerprint(old)).not.toBe(fingerprint(next));
  });
});
