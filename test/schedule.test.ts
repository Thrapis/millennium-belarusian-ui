import { describe, expect, it } from "vitest";
import { parseTime, registerScript, taskEnv, TASK_NAME } from "../tools/schedule.ts";

describe("parseTime", () => {
  // Proves only a real HH:MM clock time reaches the task definition.
  it("accepts HH:MM and rejects the rest", () => {
    expect(parseTime("12:00")).toBe("12:00");
    expect(parseTime("7:05")).toBe("07:05");
    for (const bad of ["24:00", "12:60", "noon", "12", "12:00; calc"]) expect(() => parseTime(bad)).toThrow();
  });
});

describe("registerScript / taskEnv", () => {
  // Proves paths and the time reach PowerShell only as environment values, so a path with
  // quotes or spaces cannot alter the script.
  it("keeps paths out of the script text", () => {
    const env = taskEnv({ node: "C:\\Program Files\\node's\\node.exe", repo: "E:\\Code base", at: "09:30" });
    expect(env).toEqual({ BE_NODE: "C:\\Program Files\\node's\\node.exe", BE_REPO: "E:\\Code base", BE_AT: "09:30" });
    const script = registerScript();
    expect(script).not.toContain("node's");
    expect(script).not.toContain("Code base");
    expect(script).toContain("$env:BE_NODE");
    expect(script).toContain(TASK_NAME);
  });

  // Proves a missed run happens later and no password is stored (interactive, current user).
  it("catches up on missed runs and runs as the logged-in user", () => {
    const script = registerScript();
    expect(script).toContain("-StartWhenAvailable");
    expect(script).not.toContain("-Password");
    expect(script).not.toContain("-User ");
  });
});
