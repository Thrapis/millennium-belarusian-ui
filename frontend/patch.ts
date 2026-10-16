// Overrides values in Steam's LocalizationManager (window.LocalizationManager in steamui).
// Its member names are not minified: m_mapTokens, AddTokens, m_cbkTokensChanged.
// Keys in m_mapTokens have no leading '#'.

/** Output of tools/pipeline/compile.ts, bundled with the plugin. */
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

export interface ApplyResult {
  /** Tokens Steam had loaded, replaced with Belarusian. */
  overridden: number;
  /** Tokens Steam had not loaded into the map, added. */
  injected: number;
}

/**
 * Writes the translation of every compiled token into the map. Tokens Steam did not load here
 * are added too: its "shared" module lives in a separate store that LocalizeString only
 * consults for tokens missing from this map, so only an entry in the map gets translated.
 */
export function applyOverrides(map: Map<string, string>, t: CompiledTranslations): ApplyResult {
  const r: ApplyResult = { overridden: 0, injected: 0 };
  for (const id in t.tokens) {
    const loaded = map.get(id);
    map.set(id, resolve(t, id, loaded)!);
    if (loaded === undefined) r.injected++;
    else r.overridden++;
  }
  return r;
}

/** Adds the tokens a map lost (Steam clears it when it re-initialises); never touches present ones. */
function injectMissing(map: Map<string, string>, t: CompiledTranslations): void {
  for (const id in t.tokens) if (!map.has(id)) map.set(id, resolve(t, id, undefined)!);
}

/**
 * Applies translations now and after every later AddTokens call (tokens Steam loads lazily,
 * or loads again after clearing the map). Idempotent per manager.
 */
export function installOverrides(mgr: LocalizationManagerLike, t: CompiledTranslations): ApplyResult {
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
      injectMissing(this.m_mapTokens, t);
    };
  }
  mgr.m_cbkTokensChanged?.Dispatch();
  return applied;
}
