// Compares two extractions of Steam's strings (module → token id → text per language).
// Used by the daily check (is Steam different from what the translation is based on?)
// and by the migration report.
import { createHash } from "node:crypto";
import type { SourceEntry } from "../extract.ts";

export type Snapshot = Record<string, Record<string, SourceEntry>>;

export interface ModuleDiff {
  added: string[];
  removed: string[];
  enChanged: string[];
  ruChanged: string[];
}
export type SnapshotDiff = Record<string, ModuleDiff>;

export function diffSources(old: Snapshot, next: Snapshot): SnapshotDiff {
  const out: SnapshotDiff = {};
  for (const module of [...new Set([...Object.keys(old), ...Object.keys(next)])].sort()) {
    const a = old[module] ?? {};
    const b = next[module] ?? {};
    const common = Object.keys(b).filter((id) => id in a);
    out[module] = {
      added: Object.keys(b).filter((id) => !(id in a)).sort(),
      removed: Object.keys(a).filter((id) => !(id in b)).sort(),
      enChanged: common.filter((id) => a[id]!.en !== b[id]!.en).sort(),
      ruChanged: common.filter((id) => a[id]!.ru !== b[id]!.ru).sort(),
    };
  }
  return out;
}

const changedIds = (d: ModuleDiff) => new Set([...d.enChanged, ...d.ruChanged]);

export function isEmpty(diff: SnapshotDiff): boolean {
  return Object.values(diff).every((d) => !d.added.length && !d.removed.length && !changedIds(d).size);
}

/** One line for a notification. A string changed in both languages counts once. */
export function summary(diff: SnapshotDiff): string {
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const d of Object.values(diff)) {
    added += d.added.length;
    removed += d.removed.length;
    changed += changedIds(d).size;
  }
  return `+${added} new, -${removed} removed, ${changed} changed`;
}

export function formatReport(diff: SnapshotDiff, old: Snapshot, next: Snapshot): string {
  const lines: string[] = [summary(diff), ""];
  for (const [module, d] of Object.entries(diff)) {
    if (isEmpty({ [module]: d })) continue;
    const a = old[module] ?? {};
    const b = next[module] ?? {};
    lines.push(`## ${module}`);
    for (const id of d.added) lines.push(`+ ${id}`, `    en: ${b[id]?.en}`, `    ru: ${b[id]?.ru}`);
    for (const id of d.removed) lines.push(`- ${id}`, `    en: ${a[id]?.en}`);
    for (const id of [...changedIds(d)].sort()) {
      lines.push(`~ ${id}`);
      if (a[id]?.en !== b[id]?.en) lines.push(`    en: ${a[id]?.en}`, `     -> ${b[id]?.en}`);
      if (a[id]?.ru !== b[id]?.ru) lines.push(`    ru: ${a[id]?.ru}`, `     -> ${b[id]?.ru}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Hash of the English and Russian text only: stable across key order and helper languages. */
export function fingerprint(s: Snapshot): string {
  const h = createHash("sha256");
  for (const module of Object.keys(s).sort()) {
    h.update(`#${module}\n`);
    for (const id of Object.keys(s[module]!).sort()) {
      const e = s[module]![id]!;
      h.update(JSON.stringify([id, e.en ?? null, e.ru ?? null]) + "\n");
    }
  }
  return h.digest("hex");
}
