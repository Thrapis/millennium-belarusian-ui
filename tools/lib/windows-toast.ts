// Windows toast notifications through the built-in WinRT API (no dependency).
// The text travels in environment variables, so nothing in it can be read as PowerShell code.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface Toast {
  title: string;
  body: string;
  /** A file opened (in its default app) when the toast is clicked. */
  openPath?: string;
}

const SCRIPT = join(import.meta.dirname, "toast.ps1");

export function toastCommand(t: Toast): { file: string; args: string[]; env: Record<string, string> } {
  return {
    file: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT],
    env: {
      BE_TOAST_TITLE: t.title,
      BE_TOAST_BODY: t.body,
      BE_TOAST_URL: t.openPath ? pathToFileURL(t.openPath).href : "",
    },
  };
}

/** Returns an error message, or undefined when the toast was handed to Windows. */
export function showToast(t: Toast): string | undefined {
  const c = toastCommand(t);
  const r = spawnSync(c.file, c.args, { env: { ...process.env, ...c.env }, encoding: "utf8", windowsHide: true });
  if (r.error) return r.error.message;
  return r.status === 0 ? undefined : `powershell exited with ${r.status}: ${r.stderr.trim()}`;
}
