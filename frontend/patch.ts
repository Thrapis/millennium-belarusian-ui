// Overrides values in Steam's LocalizationManager (window.LocalizationManager in steamui).
// Its member names are not minified: m_mapTokens, AddTokens, m_cbkTokensChanged.
// Keys in m_mapTokens have no leading '#'.

/** Output of tools/compile.ts, bundled with the plugin. */
export interface CompiledTranslations {
  /** token id → Belarusian */
  tokens: Record<string, string>;
  /**
   * For ids whose text differs between Steam's loc modules (steamui vs friendsui…):
   * token id → text Steam loaded (English) → Belarusian. Falls back to `tokens`.
   */
  byEnglish: Record<string, Record<string, string>>;
}

export interface LocalizationManagerLike {
  m_mapTokens: Map<string, string>;
  AddTokens(tokens: Record<string, string>, fallback?: Record<string, string>): void;
  m_cbkTokensChanged?: { Dispatch(): void };
}

export function isLocalizationManager(x: unknown): x is LocalizationManagerLike {
  const m = x as LocalizationManagerLike | null | undefined;
  return !!m && m.m_mapTokens instanceof Map && typeof m.AddTokens === "function";
}

/** The Belarusian text for `id`, given the text Steam currently has for it. */
function resolve(t: CompiledTranslations, id: string, loaded: string | undefined): string | undefined {
  if (!Object.hasOwn(t.tokens, id)) return undefined;
  const alt = loaded === undefined ? undefined : t.byEnglish[id];
  return (alt && Object.hasOwn(alt, loaded!) ? alt[loaded!] : undefined) ?? t.tokens[id];
}

/** Writes translations for every id already in the map. Returns how many were applied. */
export function applyOverrides(map: Map<string, string>, t: CompiledTranslations): number {
  let applied = 0;
  for (const id in t.tokens) {
    const loaded = map.get(id);
    if (loaded === undefined) continue;
    map.set(id, resolve(t, id, loaded)!);
    applied++;
  }
  return applied;
}

/**
 * Applies translations now and after every later AddTokens call (tokens Steam loads lazily).
 * Idempotent per manager. Returns the number of tokens overridden immediately.
 */
export function installOverrides(mgr: LocalizationManagerLike, t: CompiledTranslations): number {
  const applied = applyOverrides(mgr.m_mapTokens, t);
  const marked = mgr as LocalizationManagerLike & { __beOverrides?: boolean };
  if (!marked.__beOverrides) {
    marked.__beOverrides = true;
    const original = mgr.AddTokens;
    mgr.AddTokens = function (tokens, fallback) {
      original.call(this, tokens, fallback);
      for (const added of [tokens, fallback]) {
        if (!added) continue;
        for (const id in added) {
          const be = resolve(t, id, this.m_mapTokens.get(id));
          if (be !== undefined) this.m_mapTokens.set(id, be);
        }
      }
    };
  }
  mgr.m_cbkTokensChanged?.Dispatch();
  return applied;
}
