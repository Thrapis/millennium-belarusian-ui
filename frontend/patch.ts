// Overrides values in Steam's LocalizationManager (window.LocalizationManager in steamui).
// Its member names are not minified: m_mapTokens, AddTokens, m_cbkTokensChanged.
// Keys in m_mapTokens have no leading '#'.

export type Overrides = Record<string, string>;

export interface LocalizationManagerLike {
  m_mapTokens: Map<string, string>;
  AddTokens(tokens: Record<string, string>, fallback?: Record<string, string>): void;
  m_cbkTokensChanged?: { Dispatch(): void };
}

export function isLocalizationManager(x: unknown): x is LocalizationManagerLike {
  const m = x as LocalizationManagerLike | null | undefined;
  return !!m && m.m_mapTokens instanceof Map && typeof m.AddTokens === "function";
}

/** Writes overrides for every id already in the map. Returns how many were applied. */
export function applyOverrides(map: Map<string, string>, overrides: Overrides): number {
  let applied = 0;
  for (const id in overrides) {
    if (map.has(id)) {
      map.set(id, overrides[id]!);
      applied++;
    }
  }
  return applied;
}

/**
 * Applies overrides now and after every later AddTokens call (tokens Steam loads lazily).
 * Idempotent per manager. Returns the number of tokens overridden immediately.
 */
export function installOverrides(mgr: LocalizationManagerLike, overrides: Overrides): number {
  const applied = applyOverrides(mgr.m_mapTokens, overrides);
  const marked = mgr as LocalizationManagerLike & { __beOverrides?: boolean };
  if (!marked.__beOverrides) {
    marked.__beOverrides = true;
    const original = mgr.AddTokens;
    mgr.AddTokens = function (tokens, fallback) {
      original.call(this, tokens, fallback);
      for (const added of [tokens, fallback]) {
        if (!added) continue;
        for (const id in added) {
          if (id in overrides) this.m_mapTokens.set(id, overrides[id]!);
        }
      }
    };
  }
  mgr.m_cbkTokensChanged?.Dispatch();
  return applied;
}
