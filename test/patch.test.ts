import { describe, expect, it, vi } from "vitest";
import { installOverrides, isLocalizationManager, type LocalizationManagerLike } from "../frontend/patch.ts";

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

describe("installOverrides", () => {
  // Proves already-loaded tokens are replaced, unknown ids are not injected, and React is told to re-render.
  it("overrides existing tokens and notifies", () => {
    const mgr = fakeManager({ MainTabsLibrary: "Library", Other: "Other" });
    const applied = installOverrides(mgr, { MainTabsLibrary: "Бібліятэка", NotInSteam: "x" });
    expect(applied).toBe(1);
    expect(mgr.m_mapTokens.get("MainTabsLibrary")).toBe("Бібліятэка");
    expect(mgr.m_mapTokens.get("Other")).toBe("Other");
    expect(mgr.m_mapTokens.has("NotInSteam")).toBe(false);
    expect(mgr.dispatch).toHaveBeenCalledOnce();
  });

  // Proves tokens Steam loads later (re-init, lazy chunks) still come out translated.
  it("re-applies after later AddTokens calls", () => {
    const mgr = fakeManager({});
    installOverrides(mgr, { Menu_View: "Выгляд" });
    mgr.AddTokens({ Menu_View: "View", Menu_Help: "Help" });
    expect(mgr.m_mapTokens.get("Menu_View")).toBe("Выгляд");
    expect(mgr.m_mapTokens.get("Menu_Help")).toBe("Help");
  });

  // Proves installing twice doesn't stack wrappers (plugin reload in the same context).
  it("wraps AddTokens only once", () => {
    const mgr = fakeManager({});
    installOverrides(mgr, { A: "1" });
    const wrapped = mgr.AddTokens;
    installOverrides(mgr, { A: "1" });
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
