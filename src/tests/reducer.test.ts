import { describe, expect, it } from "vitest";
import { boardFromPhonemeRows, boardFromSurfaces, computeMove, createEmptyBoard, ensureUniqueTileIds, hasLegalMove, placeTile, reduceLine } from "../game/board";
import { makeTileFromPhonemes, parseSurfaceToPhonemes } from "../game/phonemes";

describe("board reducer", () => {
  it("solves level 1 in exactly two left moves", () => {
    const board = boardFromPhonemeRows([
      [["n", "a"], ["i"], ["a"], null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null]
    ]);

    const first = computeMove(board, "left", ["GUNA", "AYAVA"]);
    expect(first.nextBoard[0].map(tile => tile?.surfaceIAST ?? null)).toEqual(["ne", "a", null, null]);
    expect(first.mergeEvents).toHaveLength(1);

    const second = computeMove(first.nextBoard, "left", ["GUNA", "AYAVA"]);
    expect(second.nextBoard[0].map(tile => tile?.surfaceIAST ?? null)).toEqual(["naya", null, null, null]);
    expect(second.mergeEvents[0].ruleId).toBe("AYAVA");
  });

  it("does not allow a newly merged tile to merge again in the same move", () => {
    const line = [
      makeTileFromPhonemes(["n", "a"], { id: "na" }),
      makeTileFromPhonemes(["i"], { id: "i" }),
      makeTileFromPhonemes(["a"], { id: "a" }),
      null
    ];

    const reduced = reduceLine(line, "left", ["GUNA", "AYAVA"]);
    expect(reduced.map(tile => tile?.surfaceIAST ?? null)).toEqual(["ne", "a", null, null]);
  });

  it("repairs duplicate tile ids from persisted boards", () => {
    let board = createEmptyBoard();
    board = placeTile(board, makeTileFromPhonemes(["g", "u"], { id: "tile-2" }), { x: 0, y: 0 });
    board = placeTile(board, makeTileFromPhonemes(["r", "u"], { id: "tile-2" }), { x: 1, y: 0 });

    const repaired = ensureUniqueTileIds(board);
    const ids = repaired.flatMap(row => row.flatMap(tile => (tile ? [tile.id] : [])));

    expect(new Set(ids).size).toBe(ids.length);
    expect(repaired[0][0]?.id).toBe("tile-2");
    expect(repaired[0][1]?.id).not.toBe("tile-2");
  });

  it("uses pushed-tile order for upward vertical sandhi", () => {
    let board = createEmptyBoard();
    board = placeTile(board, makeTileFromPhonemes(parseSurfaceToPhonemes("utsava")), { x: 2, y: 0 });
    board = placeTile(board, makeTileFromPhonemes(parseSurfaceToPhonemes("mahā")), { x: 2, y: 1 });

    const move = computeMove(board, "up", ["GUNA"]);

    expect(move.nextBoard[0][2]?.surfaceIAST).toBe("mahotsava");
    expect(move.mergeEvents[0]).toMatchObject({
      leftSurface: "mahā",
      rightSurface: "utsava",
      resultSurface: "mahotsava"
    });
  });

  it("allows vertical sandhi in either order", () => {
    let board = createEmptyBoard();
    board = placeTile(board, makeTileFromPhonemes(parseSurfaceToPhonemes("yoga")), { x: 2, y: 0 });
    board = placeTile(board, makeTileFromPhonemes(parseSurfaceToPhonemes("abhyāsa")), { x: 2, y: 1 });

    const move = computeMove(board, "up", ["SAVARNA_DIRGHA"]);

    expect(move.nextBoard[0][2]?.surfaceIAST).toBe("yogābhyāsa");
    expect(move.mergeEvents[0]).toMatchObject({
      leftSurface: "yoga",
      rightSurface: "abhyāsa",
      resultSurface: "yogābhyāsa"
    });
  });

  it("uses target ranking to break vertical two-order ties", () => {
    let board = createEmptyBoard();
    board = placeTile(board, makeTileFromPhonemes(parseSurfaceToPhonemes("abhyāsa")), { x: 1, y: 0 });
    board = placeTile(board, makeTileFromPhonemes(parseSurfaceToPhonemes("eva")), { x: 1, y: 1 });

    const move = computeMove(board, "down", ["SAVARNA_DIRGHA", "VRDDHI"], {
      rankMergeSurface: surface => surface === "evābhyāsa" ? 500 : 0
    });

    expect(move.nextBoard[3][1]?.surfaceIAST).toBe("evābhyāsa");
    expect(move.mergeEvents[0]).toMatchObject({
      leftSurface: "eva",
      rightSurface: "abhyāsa",
      resultSurface: "evābhyāsa"
    });
  });

  it("keeps horizontal sandhi left-to-right for both horizontal swipes", () => {
    const readable = boardFromSurfaces(["mahā", "utsava"]);
    const left = computeMove(readable, "left", ["GUNA"]);
    const right = computeMove(readable, "right", ["GUNA"]);

    expect(left.nextBoard[0][0]?.surfaceIAST).toBe("mahotsava");
    expect(right.nextBoard[0][3]?.surfaceIAST).toBe("mahotsava");
    expect(right.mergeEvents[0]).toMatchObject({
      leftSurface: "mahā",
      rightSurface: "utsava"
    });

    const reversed = boardFromSurfaces(["utsava", "mahā"]);
    expect(computeMove(reversed, "left", ["GUNA"]).mergeEvents).toHaveLength(0);
    expect(computeMove(reversed, "right", ["GUNA"]).mergeEvents).toHaveLength(0);
  });

  it("treats a full board with a legal merge as playable", () => {
    const board = boardFromPhonemeRows([
      [["a"], ["a"], ["i"], ["u"]],
      [["k"], ["s"], ["t"], ["m"]],
      [["n"], ["h"], ["ś"], ["r"]],
      [["ā"], ["ī"], ["ū"], ["e"]]
    ]);

    expect(hasLegalMove(board, ["SAVARNA_DIRGHA"])).toBe(true);
  });

  it("marks a no-op move without consuming board state", () => {
    const board = boardFromPhonemeRows([
      [["a"], null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null]
    ]);

    const move = computeMove(board, "left", ["SAVARNA_DIRGHA"]);
    expect(move.boardChanged).toBe(false);
    expect(move.mergeEvents).toHaveLength(0);
  });
});
