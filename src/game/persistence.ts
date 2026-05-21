import type { GameState, ScriptMode } from "./types";

export const RUN_SET_VERSION = "2026-05-19-target-endless-006";

const STORAGE_KEY = "sandhi2048:v5";

export type PersistedGameDataV1 = {
  schemaVersion: 1;
  runSetVersion: string;
  highScore: number;
  runSnapshot?: GameState;
  preferences: {
    hapticsEnabled: boolean;
    accessibilityControlsOpen: boolean;
    scriptMode: ScriptMode;
  };
};

export const DEFAULT_PERSISTED_DATA: PersistedGameDataV1 = {
  schemaVersion: 1,
  runSetVersion: RUN_SET_VERSION,
  highScore: 0,
  preferences: {
    hapticsEnabled: true,
    accessibilityControlsOpen: false,
    scriptMode: "deva"
  }
};

function normalizePersistedData(parsed: Partial<PersistedGameDataV1> = {}): PersistedGameDataV1 {
  return {
    schemaVersion: 1,
    runSetVersion: RUN_SET_VERSION,
    highScore: typeof parsed.highScore === "number" ? parsed.highScore : 0,
    preferences: {
      hapticsEnabled: parsed.preferences?.hapticsEnabled ?? true,
      accessibilityControlsOpen: parsed.preferences?.accessibilityControlsOpen ?? false,
      scriptMode: parsed.preferences?.scriptMode === "iast" ? "iast" : "deva"
    }
  };
}

export function loadPersistedGameData(): PersistedGameDataV1 {
  if (typeof localStorage === "undefined") return DEFAULT_PERSISTED_DATA;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PERSISTED_DATA;
    const parsed = JSON.parse(raw) as Partial<PersistedGameDataV1>;

    if (parsed.schemaVersion !== 1) return DEFAULT_PERSISTED_DATA;

    if (parsed.runSetVersion !== RUN_SET_VERSION) return normalizePersistedData(parsed);

    return {
      ...normalizePersistedData(parsed),
      runSnapshot: parsed.runSnapshot,
    };
  } catch {
    return DEFAULT_PERSISTED_DATA;
  }
}

export function savePersistedGameData(data: PersistedGameDataV1) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearPersistedGameData() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
