// Registers (or removes) the daily Task Scheduler job that runs tools/check-steam.ts.
// Usage: npm run schedule -- install [--at HH:MM] | uninstall | status
// The task belongs to the current user and runs only while they are logged in (toasts need that);
// no password is stored. A run missed while the PC was off happens as soon as possible after.
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

export const TASK_NAME = "BelarusianUI Steam check";

export function parseTime(s: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`--at must be a time like 12:00, got "${s}"`);
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

export function taskEnv(o: { node: string; repo: string; at: string }): Record<string, string> {
  return { BE_NODE: o.node, BE_REPO: o.repo, BE_AT: o.at };
}

/** Static script: the node path, repo folder and time come from the environment. */
export function registerScript(): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    // conhost --headless runs the console program without opening a window.
    `$a = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument ('--headless "' + $env:BE_NODE + '" tools\\check-steam.ts') -WorkingDirectory $env:BE_REPO`,
    "$t = New-ScheduledTaskTrigger -Daily -At $env:BE_AT",
    "$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)",
    `Register-ScheduledTask -TaskName '${TASK_NAME}' -Action $a -Trigger $t -Settings $s -Description 'Daily check of Steam UI strings (millennium-belarusian-ui)' -Force | Out-Null`,
  ].join("\n");
}

function powershell(script: string, env: Record<string, string> = {}): number {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  return r.status ?? 1;
}

function main() {
  const { values, positionals } = parseArgs({ options: { at: { type: "string", default: "12:00" } }, allowPositionals: true });
  const cmd = positionals[0];
  let status: number;
  if (cmd === "install") {
    const at = parseTime(values.at);
    status = powershell(registerScript(), taskEnv({ node: process.execPath, repo: process.cwd(), at }));
    if (status === 0) console.log(`Installed "${TASK_NAME}": daily at ${at}`);
  } else if (cmd === "uninstall") {
    status = powershell(`Unregister-ScheduledTask -TaskName '${TASK_NAME}' -Confirm:$false`);
    if (status === 0) console.log(`Removed "${TASK_NAME}"`);
  } else if (cmd === "status") {
    status = powershell(
      `$t = Get-ScheduledTask -TaskName '${TASK_NAME}'; $i = $t | Get-ScheduledTaskInfo; ` +
        "[pscustomobject]@{ State = $t.State; LastRun = $i.LastRunTime; LastResult = $i.LastTaskResult; NextRun = $i.NextRunTime } | Format-List",
    );
  } else {
    console.error("Usage: npm run schedule -- install [--at HH:MM] | uninstall | status");
    status = 2;
  }
  process.exitCode = status;
}

if (import.meta.main) main();
