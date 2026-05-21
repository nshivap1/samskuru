import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PERSISTED_DATA, RUN_SET_VERSION, loadPersistedGameData, savePersistedGameData } from "../game/persistence";

describe("local persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("recovers from corrupt stored data", () => {
    localStorage.setItem("sandhi2048:v5", "{not json");
    expect(loadPersistedGameData()).toEqual(DEFAULT_PERSISTED_DATA);
  });

  it("drops stale run snapshots while preserving best score and preferences", () => {
    localStorage.setItem("sandhi2048:v5", JSON.stringify({
      schemaVersion: 1,
      runSetVersion: "older-target-pack",
      highScore: 1939,
      runSnapshot: { stale: true },
      preferences: {
        hapticsEnabled: false,
        accessibilityControlsOpen: true,
        scriptMode: "iast"
      }
    }));

    expect(loadPersistedGameData()).toEqual({
      schemaVersion: 1,
      runSetVersion: RUN_SET_VERSION,
      highScore: 1939,
      preferences: {
        hapticsEnabled: false,
        accessibilityControlsOpen: true,
        scriptMode: "iast"
      }
    });
  });

  it("round-trips high score and preferences", () => {
    savePersistedGameData({
      schemaVersion: 1,
      runSetVersion: RUN_SET_VERSION,
      highScore: 320,
      preferences: {
        hapticsEnabled: false,
        accessibilityControlsOpen: true,
        scriptMode: "iast"
      }
    });

    expect(loadPersistedGameData()).toMatchObject({
      highScore: 320,
      preferences: {
        hapticsEnabled: false,
        accessibilityControlsOpen: true,
        scriptMode: "iast"
      }
    });
  });
});
