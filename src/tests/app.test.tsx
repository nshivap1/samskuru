import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, renderTilesFromMovements, tileLabelFitLength } from "../app/App";
import { RUN_SET_VERSION, savePersistedGameData } from "../game/persistence";
import type { Tile, TileMovement } from "../game/types";
import { STARTER_TARGETS, createNewTargetRun } from "../targets/targetEngine";

const DEVANAGARI_RE = /[\u0900-\u097F]/;
const LATIN_SCRIPT_RE = /[a-zāīūṛṝḷṅñṭḍṇśṣṃḥ]/i;

function makeTestTile(id: string, surfaceIAST = "ṛṣi", surfaceDeva = "ऋषि"): Tile {
  return {
    id,
    kind: "WORD_SEGMENT",
    phonemes: ["ṛ", "ṣ", "i"],
    surfaceIAST,
    surfaceDeva,
    compactLabel: surfaceDeva,
    leftBoundary: "ṛ",
    rightBoundary: "i",
    mass: 1,
    depth: 1,
    originRule: null,
    parents: [],
    classSignature: { left: "R", right: "I" },
    accessibleLabel: surfaceIAST
  };
}

describe("App smoke flow", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("renders the Devanagari-first title, active targets, and default Devanagari tiles", () => {
    render(<App />);

    expect(screen.getByText("संस्कुरु")).toBeInTheDocument();
    expect(screen.getByText("saṃskuru")).toBeInTheDocument();

    const targetRegion = screen.getByLabelText("Active targets");
    const targetText = targetRegion.textContent ?? "";
    const visibleTargets = STARTER_TARGETS.filter(target => targetText.includes(target.targetDeva));
    expect(visibleTargets).toHaveLength(3);
    expect(visibleTargets.every(target => targetText.includes(target.targetIAST))).toBe(true);

    const board = screen.getByRole("application", { name: /sandhi 2048 board/i });
    const tileTexts = within(board).getAllByTestId("tile").map(tile => tile.textContent ?? "");
    expect(tileTexts).toHaveLength(4);
    expect(tileTexts.every(text => DEVANAGARI_RE.test(text))).toBe(true);
  });

  it("processes endless moves without level controls", async () => {
    render(<App />);

    await act(async () => {
      fireEvent.keyDown(window, { key: "ArrowLeft" });
      await vi.advanceTimersByTimeAsync(420);
    });

    expect(screen.getByText(/Left:/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next level/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
  });

  it("shows hint feedback even after a move has been logged", async () => {
    render(<App />);

    await act(async () => {
      fireEvent.keyDown(window, { key: "ArrowLeft" });
      await vi.advanceTimersByTimeAsync(420);
    });

    fireEvent.click(screen.getByRole("button", { name: "Hint" }));

    expect(screen.getByText(/target-advancing|future-useful|No target-advancing merge|No immediate merge/)).toBeInTheDocument();
  });

  it("applies the script setting to board tiles and rule examples", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByText("Script")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "iast" } });

    const board = screen.getByRole("application", { name: /sandhi 2048 board/i });
    const tileTexts = within(board).getAllByTestId("tile").map(tile =>
      tile.querySelector(".tile-label")?.textContent ?? ""
    );
    expect(tileTexts).toHaveLength(4);
    expect(tileTexts.every(text => !DEVANAGARI_RE.test(text))).toBe(true);
    expect(tileTexts.every(text => LATIN_SCRIPT_RE.test(text))).toBe(true);

    const rulesButtons = screen.getAllByRole("button", { name: /Vyākarana/ });
    fireEvent.click(rulesButtons[rulesButtons.length - 1]);

    expect(screen.getByText("a + a → ā")).toBeInTheDocument();
    expect(screen.queryByText("अ + अ → आ")).not.toBeInTheDocument();
  });

  it("shows concise mechanics and renames rules to Vyākarana", () => {
    render(<App />);

    const board = screen.getByRole("application", { name: /sandhi 2048 board/i });
    fireEvent.click(within(board).getAllByTestId("tile")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Open mechanics" }));

    expect(screen.getAllByRole("button", { name: /Vyākarana/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Mechanics/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Rules$/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Selected tile")).not.toBeInTheDocument();
    expect(screen.getByText("Rows read left to right.")).toBeInTheDocument();
    expect(screen.getByText(/whether you swipe left or right/)).toBeInTheDocument();
    expect(screen.getByText("Columns are flexible.")).toBeInTheDocument();
    expect(screen.getByText(/Vertical neighbors can merge in either order/)).toBeInTheDocument();
    expect(screen.getByText("Completion cleans selectively.")).toBeInTheDocument();
    expect(screen.getByText(/every target represented by their source fragments/)).toBeInTheDocument();
    expect(screen.getByText("Legal can still be off-target.")).toBeInTheDocument();
  });

  it("sizes Devanagari conjunct tiles by visual width, not grapheme count", () => {
    expect(tileLabelFitLength("विष्णु", "deva")).toBe(5);
    expect(tileLabelFitLength("औषध्यौषधीति", "deva")).toBe(10);
    expect(tileLabelFitLength("viṣṇu", "iast")).toBe(5);
  });

  it("keeps movement render identities unique without breaking slide transitions", () => {
    const sharedLogicalTile = makeTestTile("tile-2");
    const movements: TileMovement[] = [
      { tile: sharedLogicalTile, from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, kind: "move" },
      {
        tile: sharedLogicalTile,
        from: { x: 0, y: 2 },
        to: { x: 1, y: 2 },
        kind: "consumed",
        consumedIntoTileId: "tile-3"
      }
    ];

    const fromTiles = renderTilesFromMovements(movements, "from");
    const toTiles = renderTilesFromMovements(movements, "to");

    expect(new Set(fromTiles.map(tile => tile.renderId)).size).toBe(fromTiles.length);
    expect(fromTiles.map(tile => tile.renderId)).toEqual(toTiles.map(tile => tile.renderId));
    expect(fromTiles[1].phase).toBe("consumed");
  });

  it("shows a prominent restart CTA when the run is stuck", () => {
    const failedRun = { ...createNewTargetRun("failed-cta"), status: "failed" as const };
    savePersistedGameData({
      schemaVersion: 1,
      runSetVersion: RUN_SET_VERSION,
      highScore: failedRun.highScore,
      runSnapshot: failedRun,
      preferences: {
        hapticsEnabled: true,
        accessibilityControlsOpen: false,
        scriptMode: "deva"
      }
    });

    render(<App />);

    const restartCta = screen.getByRole("button", { name: "Restart run" });
    expect(restartCta).toHaveTextContent("पुनः");
    expect(screen.getByText(/Board stuck/)).toBeInTheDocument();

    fireEvent.click(restartCta);

    expect(screen.getByText("New run.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restart run" })).not.toBeInTheDocument();
  });

  it("restart cancels in-flight move rendering before creating a new run", async () => {
    render(<App />);

    await act(async () => {
      fireEvent.keyDown(window, { key: "ArrowLeft" });
      fireEvent.click(screen.getByRole("button", { name: "Restart" }));
      await vi.advanceTimersByTimeAsync(500);
    });

    const board = screen.getByRole("application", { name: /sandhi 2048 board/i });
    const tileTexts = within(board).getAllByTestId("tile").map(tile => tile.textContent);

    expect(screen.getByText("New run.")).toBeInTheDocument();
    expect(tileTexts).toHaveLength(4);
    expect(tileTexts.every(text => text && DEVANAGARI_RE.test(text))).toBe(true);
  });
});
