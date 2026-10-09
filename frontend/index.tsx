import { definePlugin } from "millennium";
import { installOverrides, isLocalizationManager, type Overrides } from "./patch";

// Milestone 1 proof of concept: three hand-picked tokens. Replaced by the compiled be.json in milestone 3.
const POC_OVERRIDES: Overrides = {
  MainTabsLibrary: "Бібліятэка",
  MainTabsStore: "Крама",
  Menu_View: "Выгляд",
};

function install(): void {
  const mgr = (window as unknown as { LocalizationManager?: unknown }).LocalizationManager;
  if (!isLocalizationManager(mgr)) {
    console.error("[belarusian-ui] LocalizationManager not found or changed shape; plugin inactive.");
    return;
  }
  const t0 = performance.now();
  const applied = installOverrides(mgr, POC_OVERRIDES);
  console.log(
    `[belarusian-ui] applied ${applied}/${Object.keys(POC_OVERRIDES).length} overrides ` +
      `in ${(performance.now() - t0).toFixed(2)} ms; ${mgr.m_mapTokens.size} tokens in map; ` +
      `friendsui token present: ${mgr.m_mapTokens.has("FriendSettings_ExampleNickname")}`,
  );
}

export default definePlugin(() => {
  install();
  return { title: "Belarusian UI", icon: <span>BE</span>, content: <div /> };
});
