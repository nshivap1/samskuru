import { describe, expect, it } from "vitest";
import { boardFromSurfaces, computeMove, createEmptyBoard, getTiles, placeTile } from "../game/board";
import { makeTileFromPhonemes, parseSurfaceToPhonemes } from "../game/phonemes";
import type { Board, Direction } from "../game/types";
import {
  applyTargetCompletions,
  bestTargetAwareDirection,
  createNewTargetRun,
  evaluateRunStatus,
  getTargetUsesForSurface,
  hasReachableActiveTarget,
  makeTargetTile,
  spawnTargetAwareTiles,
  targetAwareMergeablePairs,
  STARTER_TARGETS
} from "../targets/targetEngine";

function stateWithActiveTargets(targetIASTs: string[], seed = "controlled") {
  const base = createNewTargetRun(seed);
  const activeTargets = targetIASTs.map(targetIAST => {
    const target = STARTER_TARGETS.find(candidate => candidate.targetIAST === targetIAST);
    if (!target) throw new Error(`Missing target fixture: ${targetIAST}`);
    return target;
  });
  const activeIds = new Set(activeTargets.map(target => target.id));

  return {
    ...base,
    activeTargets,
    targetQueue: STARTER_TARGETS.filter(target => !activeIds.has(target.id)),
    completedTargetIds: []
  };
}

function targetHasVisiblePath(state: ReturnType<typeof createNewTargetRun>, targetIAST: string) {
  const target = state.activeTargets.find(candidate => candidate.targetIAST === targetIAST);
  if (!target) return false;

  const surfaces = new Set(getTiles(state.board).map(tile => tile.surfaceIAST));
  const emptyCount = 16 - getTiles(state.board).length;

  return target.buildPaths.some(path => {
    const chunks = Array.from(new Set(path.chunks));
    const present = chunks.filter(chunk => surfaces.has(chunk)).length;
    return present > 0 && chunks.length - present <= emptyCount;
  });
}

describe("target endless engine", () => {
  it("opens with three active targets and a queued deck", () => {
    const state = createNewTargetRun("open");
    const activeIds = new Set(state.activeTargets.map(target => target.id));

    expect(state.activeTargets).toHaveLength(3);
    expect(activeIds.size).toBe(3);
    expect(state.targetQueue).toHaveLength(STARTER_TARGETS.length - 3);
    expect(state.targetQueue.every(target => !activeIds.has(target.id))).toBe(true);
    expect((["SAVARNA_DIRGHA", "GUNA", "VRDDHI"] as const).every(rule =>
      state.activeTargets.some(target => target.allowedRules.includes(rule))
    )).toBe(true);
    expect(getTiles(state.board)).toHaveLength(4);
    expect(getTiles(state.board).every(tile => tile.targetUses && tile.targetUses.length > 0)).toBe(true);
    expect(hasReachableActiveTarget(state.board, state.activeTargets)).toBe(true);
    expect(state.activeTargets.every(target => targetHasVisiblePath(state, target.targetIAST))).toBe(true);
  });

  it("varies target draw and opening tile placement by seed", () => {
    const openings = Array.from({ length: 20 }, (_, index) => createNewTargetRun(`varied-${index}`));
    const targetSignatures = new Set(openings.map(state => state.activeTargets.map(target => target.targetIAST).join("|")));
    const boardSignatures = new Set(openings.map(state => getTiles(state.board)
      .map(tile => `${tile.surfaceIAST}@${tile.coord.x},${tile.coord.y}`)
      .sort()
      .join("|")));

    expect(targetSignatures.size).toBeGreaterThan(8);
    expect(boardSignatures.size).toBeGreaterThan(12);
  });

  it("opens solvable boards without one-swipe target completions across seeded runs", () => {
    for (let index = 0; index < 120; index += 1) {
      const state = createNewTargetRun(`opening-sweep-${index}`);
      const activeIds = new Set(state.activeTargets.map(target => target.id));

      expect(state.status).toBe("playing");
      expect(getTiles(state.board)).toHaveLength(4);
      expect(getTiles(state.board).every(tile => tile.targetUses?.some(use => activeIds.has(use.targetId)))).toBe(true);
      expect(state.activeTargets.every(target => targetHasVisiblePath(state, target.targetIAST))).toBe(true);
      expect(getTiles(state.board).some(tile => state.activeTargets.some(target => target.targetIAST === tile.surfaceIAST))).toBe(false);

      for (const direction of ["up", "right", "down", "left"] as Direction[]) {
        const moved = computeMove(state.board, direction, state.activeRules);
        const completed = applyTargetCompletions({ ...state, board: moved.nextBoard, moveNumber: 1 }, 1);

        expect(completed.completed).toHaveLength(0);
      }
    }
  });

  it("scores, clears, and refills completed targets", () => {
    const state = stateWithActiveTargets(["devālaya", "devendra", "tathaiva"], "complete");
    const board = placeTile(createEmptyBoard(), makeTargetTile("devālaya"), { x: 0, y: 0 });
    const afterMerge = {
      ...state,
      board,
      moveNumber: 1
    };
    const completed = applyTargetCompletions(afterMerge, 1);

    expect(completed.completed.length).toBeGreaterThan(0);
    expect(completed.state.score).toBeGreaterThan(afterMerge.score);
    expect(completed.state.activeTargets).toHaveLength(3);
    expect(getTiles(completed.state.board).some(tile => tile.surfaceIAST === "devālaya")).toBe(false);
  });

  it("target-aware spawning pulls from active target chunks", () => {
    const state = createNewTargetRun("spawn");
    const result = spawnTargetAwareTiles(state, 1);
    const before = new Set(getTiles(state.board).map(tile => tile.id));
    const spawned = getTiles(result.state.board).find(tile => !before.has(tile.id));
    const usefulChunks = new Set(state.activeTargets.flatMap(target => target.buildPaths.flatMap(path => path.chunks)));

    expect(spawned).toBeTruthy();
    expect(usefulChunks.has(spawned!.surfaceIAST)).toBe(true);
    expect(spawned!.targetUses && spawned!.targetUses.length > 0).toBe(true);
  });

  it("only spawns a tile with a path to completion when the board has one empty cell", () => {
    const state = stateWithActiveTargets(["devālaya", "devendra", "tathaiva"], "spawn-completable");
    const board = boardFromSurfaces([
      "deva", "ka", "ki", "ku",
      "ga", "gi", "gu", "ca",
      "ci", "cu", "pa", "pi",
      "pu", "na", "ni"
    ]);
    const result = spawnTargetAwareTiles({ ...state, board }, 1);
    const before = new Set(getTiles(board).map(tile => tile.id));
    const spawned = getTiles(result.state.board).find(tile => !before.has(tile.id));

    expect(spawned).toBeTruthy();
    expect(["ālaya", "indra"]).toContain(spawned!.surfaceIAST);
  });

  it("ranks hints by active target completion before generic merge value", () => {
    const state = stateWithActiveTargets(["devālaya", "devendra", "tathaiva"], "hint-target");
    const board = boardFromSurfaces(["tathā", "eva"]);
    const pairs = targetAwareMergeablePairs(board, state.activeRules, state.activeTargets, state.targetQueue);
    const direction = bestTargetAwareDirection(board, state.activeRules, state.activeTargets, state.targetQueue);

    expect(pairs.targetRelevantCount).toBe(1);
    expect(pairs.activeTargetRelevantCount).toBe(1);
    expect(pairs.queuedTargetRelevantCount).toBe(0);
    expect(pairs.bestReason).toContain("tathaiva");
    expect(direction?.direction).toBe("left");
    expect(direction?.reason).toContain("tathaiva");
  });

  it("treats upward vertical target merges as pushed lower tile plus upper tile", () => {
    const state = stateWithActiveTargets(["mahotsava", "gaṇeśa", "sureśa"], "hint-vertical-push");
    let board = createEmptyBoard();
    board = placeTile(board, makeTargetTile("utsava", getTargetUsesForSurface("utsava", state.activeTargets)), { x: 2, y: 0 });
    board = placeTile(board, makeTargetTile("mahā", getTargetUsesForSurface("mahā", state.activeTargets)), { x: 2, y: 1 });

    const pairs = targetAwareMergeablePairs(board, state.activeRules, state.activeTargets, state.targetQueue);
    const direction = bestTargetAwareDirection(board, state.activeRules, state.activeTargets, state.targetQueue);
    const move = computeMove(board, "up", state.activeRules);

    expect(move.mergeEvents[0]).toMatchObject({
      leftSurface: "mahā",
      rightSurface: "utsava",
      resultSurface: "mahotsava"
    });
    expect(pairs.targetRelevantCount).toBe(1);
    expect(pairs.bestReason).toContain("mahotsava");
    expect(direction?.direction).toBe("up");
    expect(direction?.reason).toContain("mahotsava");
  });

  it("recognizes vertical target merges in either order", () => {
    const state = stateWithActiveTargets(["yogābhyāsa", "yathaiva", "śivārcana"], "hint-vertical-flex");
    let board = createEmptyBoard();
    board = placeTile(board, makeTargetTile("yoga", getTargetUsesForSurface("yoga", state.activeTargets)), { x: 3, y: 0 });
    board = placeTile(board, makeTargetTile("abhyāsa", getTargetUsesForSurface("abhyāsa", state.activeTargets)), { x: 3, y: 1 });

    const pairs = targetAwareMergeablePairs(board, state.activeRules, state.activeTargets, state.targetQueue);
    const direction = bestTargetAwareDirection(board, state.activeRules, state.activeTargets, state.targetQueue);
    const move = computeMove(board, "up", state.activeRules, {
      rankMergeSurface: surfaceIAST => surfaceIAST === "yogābhyāsa" ? 500 : 0
    });

    expect(move.mergeEvents[0]).toMatchObject({
      leftSurface: "yoga",
      rightSurface: "abhyāsa",
      resultSurface: "yogābhyāsa"
    });
    expect(pairs.targetRelevantCount).toBe(1);
    expect(pairs.bestReason).toContain("yogābhyāsa");
    expect(direction?.direction).toBe("up");
    expect(direction?.reason).toContain("yogābhyāsa");
  });

  it("keeps generic legal hints distinct from target-advancing hints", () => {
    const state = stateWithActiveTargets(["devālaya", "devendra", "tathaiva"], "hint-generic");
    const board = boardFromSurfaces(["sam", "su"]);
    const pairs = targetAwareMergeablePairs(board, state.activeRules, state.activeTargets, state.targetQueue);
    const direction = bestTargetAwareDirection(board, state.activeRules, state.activeTargets, state.targetQueue);

    expect(pairs.pairs).toHaveLength(1);
    expect(pairs.targetRelevantCount).toBe(0);
    expect(pairs.genericMergeCount).toBe(1);
    expect(pairs.bestReason).toBe("legal merge");
    expect(direction?.priority).toBe(0);
  });

  it("spawns only active or near-future target-backed tiles", () => {
    const state = createNewTargetRun("spawn-target-fair");
    let current = state;

    for (let index = 0; index < 8; index += 1) {
      const activeIds = new Set(current.activeTargets.map(target => target.id));
      const nearFutureIds = new Set(current.targetQueue.slice(0, 12).map(target => target.id));
      const result = spawnTargetAwareTiles(current, 1);
      const before = new Set(getTiles(current.board).map(tile => tile.id));
      const spawned = getTiles(result.state.board).find(tile => !before.has(tile.id));

      expect(spawned).toBeTruthy();
      expect(spawned!.targetUses && spawned!.targetUses.length > 0).toBe(true);
      expect(spawned!.targetUses!.some(use => activeIds.has(use.targetId) || nearFutureIds.has(use.targetId))).toBe(true);
      current = result.state;
    }
  });

  it("does not spawn duplicate unique chunks once the board already has a useful copy", () => {
    const state = stateWithActiveTargets(["devālaya", "devendra", "tathaiva"], "no-duplicate");
    const devalaya = state.activeTargets.find(target => target.targetIAST === "devālaya")!;
    const withAlaya = {
      ...state,
      board: placeTile(
        state.board,
        makeTargetTile("ālaya", getTargetUsesForSurface("ālaya", [devalaya])),
        { x: 2, y: 2 }
      )
    };

    const result = spawnTargetAwareTiles(withAlaya, 6);
    const alayaCount = getTiles(result.state.board).filter(tile => tile.surfaceIAST === "ālaya").length;

    expect(alayaCount).toBe(1);
  });

  it("removes orphaned generated chunks when their only target is completed", () => {
    const state = stateWithActiveTargets(["devālaya", "devendra", "tathaiva"], "orphan-cleanup");
    const devalaya = state.activeTargets.find(target => target.targetIAST === "devālaya")!;
    let board = placeTile(createEmptyBoard(), makeTargetTile("devālaya"), { x: 0, y: 0 });
    board = placeTile(board, makeTargetTile("ālaya", getTargetUsesForSurface("ālaya", [devalaya])), { x: 1, y: 0 });

    const completed = applyTargetCompletions({ ...state, board, moveNumber: 1 }, 1);

    expect(completed.completed).toHaveLength(1);
    expect(getTiles(completed.state.board).some(tile => tile.surfaceIAST === "ālaya")).toBe(false);
  });

  it("clears stale off-target merged fragments after a target completion", () => {
    const state = stateWithActiveTargets(["devālaya", "devendra", "tathaiva"], "stale-merge-cleanup");
    const devalaya = state.activeTargets.find(target => target.targetIAST === "devālaya")!;
    const tathaiva = state.activeTargets.find(target => target.targetIAST === "tathaiva")!;
    let board = placeTile(createEmptyBoard(), makeTargetTile("devālaya"), { x: 0, y: 0 });
    board = placeTile(board, makeTileFromPhonemes(parseSurfaceToPhonemes("saṃsu"), {
      id: "stale-off-target",
      depth: 1,
      originRule: "ANUSVARA_M",
      parents: ["deva", "su"],
      sourceTargetUses: getTargetUsesForSurface("deva", [devalaya])
    }), { x: 1, y: 0 });
    board = placeTile(board, makeTileFromPhonemes(parseSurfaceToPhonemes("tathā"), {
      id: "target-useful-merged",
      depth: 1,
      originRule: "SAVARNA_DIRGHA",
      parents: ["ta", "thā"],
      targetUses: getTargetUsesForSurface("tathā", [tathaiva])
    }), { x: 2, y: 0 });

    const completed = applyTargetCompletions({ ...state, board, moveNumber: 1 }, 1);
    const surfaces = getTiles(completed.state.board).map(tile => tile.surfaceIAST);

    expect(completed.completed).toHaveLength(1);
    expect(surfaces).not.toContain("saṃsu");
    expect(surfaces).toContain("tathā");
    expect(completed.clearedTileIds).toContain("stale-off-target");
  });

  it("keeps stale merged fragments until all source target owners are completed", () => {
    const state = stateWithActiveTargets(["devālaya", "devendra", "tathaiva"], "stale-mixed-owners");
    const devalaya = state.activeTargets.find(target => target.targetIAST === "devālaya")!;
    const tathaiva = state.activeTargets.find(target => target.targetIAST === "tathaiva")!;
    let board = placeTile(createEmptyBoard(), makeTargetTile("devālaya"), { x: 0, y: 0 });
    board = placeTile(board, makeTileFromPhonemes(parseSurfaceToPhonemes("devātra"), {
      id: "mixed-stale",
      depth: 1,
      originRule: "SAVARNA_DIRGHA",
      parents: ["deva", "atra"],
      sourceTargetUses: [
        ...getTargetUsesForSurface("deva", [devalaya]),
        ...getTargetUsesForSurface("eva", [tathaiva])
      ]
    }), { x: 1, y: 0 });

    const afterDevalaya = applyTargetCompletions({ ...state, board, moveNumber: 1 }, 1);

    expect(afterDevalaya.completed).toHaveLength(1);
    expect(getTiles(afterDevalaya.state.board).some(tile => tile.surfaceIAST === "devātra")).toBe(true);
    expect(afterDevalaya.clearedTileIds).not.toContain("mixed-stale");

    const afterBoth = applyTargetCompletions({
      ...afterDevalaya.state,
      activeTargets: [tathaiva],
      targetQueue: [],
      board: placeTile(afterDevalaya.state.board, makeTargetTile("tathaiva"), { x: 0, y: 1 }),
      moveNumber: 2
    }, 2);

    expect(afterBoth.completed).toHaveLength(1);
    expect(getTiles(afterBoth.state.board).some(tile => tile.surfaceIAST === "devātra")).toBe(false);
    expect(afterBoth.clearedTileIds).toContain("mixed-stale");
  });

  it("removes seed chunks from completed targets even when they could serve a queued target", () => {
    const state = stateWithActiveTargets(["devālaya", "devendra", "tathaiva"], "queued-cleanup");
    const devalaya = state.activeTargets.find(target => target.targetIAST === "devālaya")!;
    const devendra = state.activeTargets.find(target => target.targetIAST === "devendra")!;
    let board = placeTile(createEmptyBoard(), makeTargetTile("devālaya"), { x: 0, y: 0 });
    board = placeTile(board, makeTargetTile("devendra"), { x: 1, y: 0 });
    board = placeTile(board, makeTargetTile("deva", getTargetUsesForSurface("deva", [devalaya, devendra])), { x: 2, y: 0 });

    const completed = applyTargetCompletions({ ...state, board, moveNumber: 1 }, 1);

    expect(completed.completed).toHaveLength(2);
    expect(completed.state.targetQueue.some(target => target.targetIAST === "devarṣi")).toBe(true);
    expect(getTiles(completed.state.board).some(tile => tile.surfaceIAST === "deva")).toBe(false);
  });

  it("does not recycle completed targets until the current pack cycle is exhausted", () => {
    const state = stateWithActiveTargets(["devālaya", "devendra", "tathaiva"], "finite-deck");
    const completed = applyTargetCompletions({
      ...state,
      board: placeTile(createEmptyBoard(), makeTargetTile("devālaya"), { x: 0, y: 0 }),
      moveNumber: 1
    }, 1).state;

    const visibleAndQueuedIds = new Set([...completed.activeTargets, ...completed.targetQueue].map(target => target.id));

    expect(completed.completedTargetIds).toContain("starter_savarna_dirgha_devalaya");
    expect(visibleAndQueuedIds.has("starter_savarna_dirgha_devalaya")).toBe(false);
  });

  it("starts a new hidden target cycle only after the whole pack is completed", () => {
    const finalTarget = STARTER_TARGETS[STARTER_TARGETS.length - 1];
    const almostDone = createNewTargetRun("cycle-reset");
    const completedTargetIds = STARTER_TARGETS.slice(0, -1).map(target => target.id);
    const completed = applyTargetCompletions({
      ...almostDone,
      activeTargets: [finalTarget],
      targetQueue: [],
      completedTargetIds,
      board: placeTile(createEmptyBoard(), makeTargetTile(finalTarget.targetIAST), { x: 0, y: 0 }),
      moveNumber: 1
    }, 1).state;

    expect(completed.completedTargetIds).toEqual([]);
    expect(completed.activeTargets).toHaveLength(3);
  });

  it("keeps a full board with a legal merge alive", () => {
    const state = createNewTargetRun("alive");
    const fullBoard: Board = state.board.map(row => row.map(() => null));
    const surfaces = [
      "deva", "ālaya", "i", "u",
      "k", "s", "t", "m",
      "n", "h", "ś", "r",
      "ā", "ī", "ū", "e"
    ];

    surfaces.forEach((surface, index) => {
      fullBoard[Math.floor(index / 4)][index % 4] = makeTileFromPhonemes(parseSurfaceToPhonemes(surface));
    });

    expect(evaluateRunStatus({ ...state, board: fullBoard }).status).toBe("playing");
  });
});
