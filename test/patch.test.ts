import { describe, expect, it, vi } from "vitest";
import {
  installOverrides,
  isLocalizationManager,
  type CompiledTranslations,
  type LocalizationManagerLike,
} from "../frontend/patch.ts";

// Mirrors Steam's AddTokens: primary tokens overwrite, fallback only fills gaps.
function fakeManager(initial: Record<string, string>): LocalizationManagerLike & { dispatch: ReturnType<typeof vi.fn> } {
  const dispatch = vi.fn();
  return {
    m_mapTokens: new Map(Object.entries(initial)),
    AddTokens(tokens, fallback) {
      for (const k of Object.keys(tokens)) this.m_mapTokens.set(k, tokens[k]!);
      if (fallback) for (const k of Object.keys(fallback)) if (!this.m_mapTokens.has(k)) this.m_mapTokens.set(k, fallback[k]!);
    },
    m_cbkTokensChanged: { Dispatch: dispatch },
    dispatch,
  };
}

const t = (tokens: Record<string, string>, byEnglish: CompiledTranslations["byEnglish"] = {}): CompiledTranslations => ({
  tokens,
  byEnglish,
});

describe("installOverrides", () => {
  // Proves already-loaded tokens are replaced, unknown ids are not injected, and React is told to re-render.
  it("overrides existing tokens and notifies", () => {
    const mgr = fakeManager({ MainTabsLibrary: "Library", Other: "Other" });
    const applied = installOverrides(mgr, t({ MainTabsLibrary: "Бібліятэка", NotInSteam: "x" }));
    expect(applied).toBe(1);
    expect(mgr.m_mapTokens.get("MainTabsLibrary")).toBe("Бібліятэка");
    expect(mgr.m_mapTokens.get("Other")).toBe("Other");
    expect(mgr.m_mapTokens.has("NotInSteam")).toBe(false);
    expect(mgr.dispatch).toHaveBeenCalledOnce();
  });

  // Proves tokens Steam loads later (re-init, lazy chunks) still come out translated.
  it("re-applies after later AddTokens calls", () => {
    const mgr = fakeManager({});
    installOverrides(mgr, t({ Menu_View: "Выгляд" }));
    mgr.AddTokens({ Menu_View: "View", Menu_Help: "Help" });
    expect(mgr.m_mapTokens.get("Menu_View")).toBe("Выгляд");
    expect(mgr.m_mapTokens.get("Menu_Help")).toBe("Help");
  });

  // Proves ids whose text differs per Steam module get the translation matching the
  // English Steam actually loaded, both at install time and on later loads.
  it("picks the translation by loaded English text", () => {
    const tr = t({ Small: "Дробны" }, { Small: { Small: "Дробны", "Small text": "Маленькі" } });
    const mgr = fakeManager({ Small: "Small text" });
    installOverrides(mgr, tr);
    expect(mgr.m_mapTokens.get("Small")).toBe("Маленькі");
    mgr.AddTokens({ Small: "Small" });
    expect(mgr.m_mapTokens.get("Small")).toBe("Дробны");
    mgr.AddTokens({ Small: "Unknown English" });
    expect(mgr.m_mapTokens.get("Small")).toBe("Дробны");
  });

  // Proves inherited object keys can't be mistaken for translations.
  it("ignores prototype keys", () => {
    const mgr = fakeManager({ constructor: "Constructor", toString: "x" });
    expect(installOverrides(mgr, t({}))).toBe(0);
    expect(mgr.m_mapTokens.get("constructor")).toBe("Constructor");
  });

  // Proves installing twice doesn't stack wrappers (plugin reload in the same context).
  it("wraps AddTokens only once", () => {
    const mgr = fakeManager({});
    installOverrides(mgr, t({ A: "1" }));
    const wrapped = mgr.AddTokens;
    installOverrides(mgr, t({ A: "1" }));
    expect(mgr.AddTokens).toBe(wrapped);
  });
});

describe("isLocalizationManager", () => {
  // Proves the self-check rejects shapes that would break if Steam renames internals.
  it("accepts the expected shape only", () => {
    expect(isLocalizationManager(fakeManager({}))).toBe(true);
    expect(isLocalizationManager(undefined)).toBe(false);
    expect(isLocalizationManager({ m_mapTokens: {}, AddTokens() {} })).toBe(false);
  });
});
