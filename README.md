# Belarusian UI for Steam

A [Millennium](https://steambrew.app) plugin that shows the Steam client in Belarusian, plus the
tooling to keep the translation up to date as Steam changes.

Steam keeps running in English. At startup the plugin overwrites the values in Steam's own
localization token table with Belarusian ones, so React renders Belarusian directly: no DOM
walking, no per-frame work. The merge takes about 15 ms for roughly 15,000 strings.

## How it works

```
Steam install ──extract──▶ l10n/source ──xliff──▶ l10n/xliff (ru → be) + reference-{en,uk,pl}
                                                      │
                                              import into bellingua, translate
                                                      │
translations/be (committed export) ◀──export──────────┘
        │
        └──compile──▶ frontend/generated/translations.ts ──build──▶ plugin
```

- **Source language is Russian.** Translators work from the Russian strings, with English,
  Ukrainian and Polish as reference languages.
- **Translation happens in [bellingua](https://github.com/Thrapis/bellingua)**, which imports and
  exports XLIFF 1.2. This repo produces the files it imports and builds the plugin from what it
  exports.
- **Keys are Steam's token ids**, which are stable across updates, not the English text.
- **Fallback is English**: a string without a translation shows as Steam wrote it.

## Requirements

- Windows, Steam and [Millennium](https://steambrew.app) installed
- Node.js 24 or newer (the scripts are TypeScript run directly by Node)

```bash
npm install
```

Steam is found through `--steam <dir>`, then the `STEAM_DIR` environment variable, then the
registry.

## Build and install the plugin

```bash
npm run build
```

This compiles `translations/be` into the plugin and installs it into Millennium's plugins folder.
Restart Steam and enable "Belarusian UI" in Millennium. `npm run pack` builds a `.star` package in
`build/` instead.

`npm run compile -- --min-state translated|approved` ships only reviewed strings. The default,
`mt`, includes machine translations.

## Keeping up with Steam updates

Steam changes its strings often. Each update adds, removes and rewords some of them.

```bash
npm run update-strings
```

This extracts Steam's current strings, regenerates the XLIFF trees and migrates the translation:

- Translations of unchanged strings are kept as they are.
- Human translations survive a change in the Russian text, but are marked "translated" with a note
  showing the old Russian. Machine translations of changed text are dropped.
- If only the English changed, the translation is kept with a note showing the old and new English.
- A translation whose placeholders no longer fit is dropped, and its text is kept in a note.
- The previous tree is renamed to `translations/be.old-<date>`, never deleted. Git ignores it.

Then import `translations/be` and the `l10n/reference-*` trees into bellingua, translate, export
back into `translations/be`, and run `npm run build`.

## Daily check

`npm run check` compares Steam's current strings with the ones `translations/be` is based on and
shows a Windows notification when they differ. Clicking it opens a report. It stays quiet when
nothing changed or when it already reported the same change.

```bash
npm run schedule -- install            # daily at 12:00
npm run schedule -- install --at 09:30
npm run schedule -- status
npm run schedule -- uninstall
```

The task runs as the current user, only while logged in, and runs a missed check at the next login.
After moving or renaming the repo, run `install` again.

## Repository layout

| Path | What it is |
|---|---|
| `frontend/` | The plugin: hooks Steam's `LocalizationManager` and applies the translations. |
| `translations/be/` | The committed Belarusian translation (bellingua export) and `source/`, the English and Russian text it is based on. |
| `tools/` | Extraction, XLIFF, migration, compile, the daily check and the scheduler. |
| `l10n/` | Generated and not committed: extraction, XLIFF trees, reports, check log. |
| `test/` | Vitest tests and fixtures. |

## Development

```bash
npm test          # unit tests
npm run typecheck
npm run dev       # rebuild the plugin on change
```

## Notes

- Only the Steam client UI is translated. The Store and Community pages are localized by Steam's
  servers.
- Steam's localization files and internal `LocalizationManager` are not a public API. The plugin
  checks its hook at startup and leaves Steam untouched if it is missing.
- `translations/` contains Valve's English and Russian strings as the translation's source text.
- Belarusian has three plural forms, but Steam only switches between "one" and "many", so some
  counted strings read imperfectly.

## License

Not chosen yet.
