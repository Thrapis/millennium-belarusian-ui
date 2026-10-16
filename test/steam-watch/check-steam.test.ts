import { describe, expect, it } from "vitest";
import { decide, errorMessage } from "../../tools/steam-watch/check-steam.ts";
import { diffSources, type Snapshot } from "../../tools/steam-watch/source-diff.ts";
import { toastCommand } from "../../tools/steam-watch/windows-toast.ts";

const base: Snapshot = { shared: { A: { en: "A", ru: "А" } } };
const changed: Snapshot = { shared: { A: { en: "A", ru: "А" }, B: { en: "B", ru: "Б" } } };

describe("decide", () => {
  // Proves a Steam that matches the translation's baseline stays silent.
  it("is silent when nothing differs", () => {
    expect(decide(diffSources(base, base), "fp1", undefined).notify).toBe(false);
  });

  // Proves a first sighting of a change notifies, with the counts in the message.
  it("notifies on a new difference", () => {
    const d = decide(diffSources(base, changed), "fp2", { fingerprint: "fp1" });
    expect(d.notify).toBe(true);
    expect(d.body).toContain("+1 new");
  });

  // Proves the same unmigrated change is reported once, not every day.
  it("stays silent about a difference it already reported", () => {
    const d = decide(diffSources(base, changed), "fp2", { fingerprint: "fp2" });
    expect(d.notify).toBe(false);
  });

  // Proves a second, different Steam update is reported even while the first is still unmigrated.
  it("notifies again when Steam changes again", () => {
    expect(decide(diffSources(base, changed), "fp3", { fingerprint: "fp2" }).notify).toBe(true);
  });
});

describe("errorMessage", () => {
  // Proves failures (e.g. a new Steam file format) become a readable message, not a silent skip.
  it("describes errors", () => {
    expect(errorMessage(new Error("Unrecognised localization file"))).toContain("Unrecognised localization file");
    expect(errorMessage("boom")).toContain("boom");
  });
});

describe("toastCommand", () => {
  const t = { title: 'Steam "changed" <b>', body: "it's `$(calc)` & more", openPath: "C:\\x\\r.txt" };

  // Proves user-controlled text goes through the environment, never the command line,
  // so quotes, backticks and $() in a string cannot become code.
  it("passes text through the environment only", () => {
    const c = toastCommand(t);
    expect(c.args.join(" ")).not.toContain("changed");
    expect(c.args.join(" ")).not.toContain("calc");
    expect(c.env["BE_TOAST_TITLE"]).toBe(t.title);
    expect(c.env["BE_TOAST_BODY"]).toBe(t.body);
    expect(c.env["BE_TOAST_URL"]).toBe("file:///C:/x/r.txt");
  });

  // Proves a toast without a report has no click target.
  it("omits the URL when there is no file", () => {
    expect(toastCommand({ title: "t", body: "b" }).env["BE_TOAST_URL"]).toBe("");
  });
});
