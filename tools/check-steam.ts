// Checks whether Steam's UI strings differ from the ones the committed translation is based on
// (translations/be/source), and shows a Windows notification when they do. Meant to run daily
// from Task Scheduler (npm run schedule -- install); nothing in translations/ or l10n/source is changed.
// Usage: npm run check [-- --steam <dir>] [--baseline <dir>] [--no-toast]
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { extract } from "./extract.ts";
import { diffSources, fingerprint, formatReport, isEmpty, summary, type Snapshot, type SnapshotDiff } from "./lib/source-diff.ts";
import { findSteamDir } from "./lib/steam-paths.ts";
import { showToast } from "./lib/windows-toast.ts";

export interface CheckState {
  fingerprint: string;
}

export interface Decision {
  notify: boolean;
  title: string;
  body: string;
}

/** Notify once per distinct Steam state: not when up to date, not again for a change already reported. */
export function decide(diff: SnapshotDiff, fp: string, last: CheckState | undefined): Decision {
  if (isEmpty(diff)) return { notify: false, title: "", body: "Steam strings match the translation's baseline" };
  const body = `${summary(diff)}. Run npm run update-strings to migrate.`;
  if (last?.fingerprint === fp) return { notify: false, title: "", body: `Already reported: ${body}` };
  return { notify: true, title: "Steam changed its UI strings", body };
}

export function errorMessage(e: unknown): string {
  return `Steam string check failed: ${e instanceof Error ? e.message : String(e)}`;
}

const readSnapshot = (dir: string): Snapshot =>
  Object.fromEntries(
    readdirSyncJson(dir).map((name) => [basename(name, ".json"), JSON.parse(readFileSync(join(dir, name), "utf8"))]),
  );

function readdirSyncJson(dir: string): string[] {
  if (!existsSync(dir)) throw new Error(`No baseline at ${dir}. Seed translations/be first.`);
  return readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
}

function main() {
  const { values } = parseArgs({
    options: {
      steam: { type: "string" },
      baseline: { type: "string", default: join("translations", "be", "source") },
      "no-toast": { type: "boolean", default: false },
    },
  });
  const l10n = resolve("l10n");
  mkdirSync(join(l10n, "reports"), { recursive: true });
  const log = (line: string) => {
    const text = `${new Date().toISOString()} ${line}`;
    console.log(text);
    appendFileSync(join(l10n, "check.log"), text + "\n");
  };
  const notify = (title: string, body: string, openPath?: string) => {
    if (values["no-toast"]) return;
    const err = showToast({ title, body, openPath });
    if (err) log(`Toast failed: ${err}`);
  };

  try {
    const baseline = readSnapshot(values.baseline);
    const current: Snapshot = Object.fromEntries(extract(findSteamDir(values.steam)).map((m) => [m.module, m.tokens]));
    const diff = diffSources(baseline, current);
    const fp = isEmpty(diff) ? "" : fingerprint(current);

    const statePath = join(l10n, ".steam-check.json");
    const last: CheckState | undefined = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : undefined;
    const d = decide(diff, fp, last);
    log(d.body);
    if (d.notify) {
      const report = join(l10n, "reports", `steam-changes-${new Date().toISOString().slice(0, 10)}.txt`);
      writeFileSync(report, formatReport(diff, baseline, current));
      log(`Report: ${report}`);
      notify(d.title, d.body, report);
    }
    writeFileSync(statePath, JSON.stringify({ fingerprint: fp } satisfies CheckState));
  } catch (e) {
    log(errorMessage(e));
    notify("Steam string check failed", errorMessage(e));
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
