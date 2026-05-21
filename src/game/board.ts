import { cloneTile, createTileId, makeTileFromPhonemes, parseSurfaceToPhonemes } from "./phonemes";
import { mergeTiles, scoreMerge } from "./rules";
import { buildMergeAudit } from "./ruleAudit";
import type { Board, Coord, Direction, HintPair, MergeEvent, MergeRuleId, MoveResult, Phoneme, RuleId, Tile } from "./types";

export const BOARD_SIZE = 4;

type PositionedTile = {
  tile: Tile;
  coord: Coord;
};

type MoveOptions = {
  rankMergeSurface?: (surfaceIAST: string) => number;
};

type MergeCandidate = NonNullable<ReturnType<typeof mergeTiles>>;
type MergeChoice = MergeCandidate & {
  left: Tile;
  right: Tile;
};

export function createEmptyBoard(size = BOARD_SIZE): Board {
  return Array.from({ length: size }, () => Array.from<Tile | null>({ length: size }).fill(null));
}

export function cloneBoard(board: Board): Board {
  return board.map(row => row.map(tile => (tile ? cloneTile(tile) : null)));
}

export function ensureUniqueTileIds(board: Board): Board {
  const seen = new Set<string>();
  let changed = false;

  const next = board.map(row => row.map(tile => {
    if (!tile) return null;
    if (!seen.has(tile.id)) {
      seen.add(tile.id);
      return tile;
    }

    changed = true;
    const clone = cloneTile(tile);
    do {
      clone.id = createTileId();
    } while (seen.has(clone.id));
    seen.add(clone.id);
    return clone;
  }));

  return changed ? next : board;
}

export function boardFromPhonemeRows(rows: Array<Array<Phoneme[] | null>>): Board {
  const board = createEmptyBoard(rows.length);
  rows.forEach((row, y) => {
    row.forEach((phonemes, x) => {
      if (phonemes) board[y][x] = makeTileFromPhonemes(phonemes);
    });
  });
  return board;
}

export function boardFromSurfaces(surfaces: string[]): Board {
  const board = createEmptyBoard();
  surfaces.forEach((surface, index) => {
    const x = index % BOARD_SIZE;
    const y = Math.floor(index / BOARD_SIZE);
    board[y][x] = makeTileFromPhonemes(parseSurfaceToPhonemes(surface));
  });
  return board;
}

export function getTiles(board: Board) {
  const tiles: Array<Tile & { coord: Coord }> = [];
  board.forEach((row, y) => {
    row.forEach((tile, x) => {
      if (tile) tiles.push({ ...tile, coord: { x, y } });
    });
  });
  return tiles;
}

export function getEmptyCells(board: Board): Coord[] {
  const cells: Coord[] = [];
  board.forEach((row, y) => {
    row.forEach((tile, x) => {
      if (!tile) cells.push({ x, y });
    });
  });
  return cells;
}

export function placeTile(board: Board, tile: Tile, coord: Coord) {
  const next = cloneBoard(board);
  next[coord.y][coord.x] = tile;
  return next;
}

export function boardSignature(board: Board) {
  return board
    .map(row => row.map(tile => (tile ? `${tile.id}:${tile.surfaceIAST}` : ".")).join("|"))
    .join("/");
}

export function boardSurfaceSignature(board: Board) {
  return board
    .map(row => row.map(tile => (tile ? tile.surfaceIAST : ".")).join("|"))
    .join("/");
}

export function sameCoord(a: Coord, b: Coord) {
  return a.x === b.x && a.y === b.y;
}

function getLineCoords(direction: Direction, lineIndex: number, size: number): Coord[] {
  if (direction === "left" || direction === "right") {
    return Array.from({ length: size }, (_, x) => ({ x, y: lineIndex }));
  }

  return Array.from({ length: size }, (_, y) => ({ x: lineIndex, y }));
}

function positionedLine(board: Board, coords: Coord[]): PositionedTile[] {
  return coords
    .map(coord => {
      const tile = board[coord.y][coord.x];
      return tile ? { tile, coord } : null;
    })
    .filter((tile): tile is PositionedTile => Boolean(tile));
}

export function computeMove(board: Board, direction: Direction, activeRules: readonly RuleId[], options: MoveOptions = {}): MoveResult {
  const size = board.length;
  const nextBoard = createEmptyBoard(size);
  const movements: MoveResult["movements"] = [];
  const mergeEvents: MergeEvent[] = [];
  let scoreDelta = 0;

  for (let lineIndex = 0; lineIndex < size; lineIndex += 1) {
    const coords = getLineCoords(direction, lineIndex, size);
    const items = positionedLine(board, coords);

    if (direction === "left" || direction === "up") {
      let targetIndex = 0;
      let i = 0;

      while (i < items.length) {
        const current = items[i];
        const next = items[i + 1];
        const target = coords[targetIndex];

        if (next) {
          const merged = direction === "up"
            ? chooseVerticalMerge(next.tile, current.tile, activeRules, current.tile.id, options)
            : chooseOrderedMerge(current.tile, next.tile, activeRules, current.tile.id);
          if (merged) {
            nextBoard[target.y][target.x] = merged.result;
            movements.push({ tile: current.tile, from: current.coord, to: target, kind: "survivor" });
            movements.push({
              tile: next.tile,
              from: next.coord,
              to: target,
              kind: "consumed",
              consumedIntoTileId: current.tile.id
            });
            const event = createMergeEvent(mergeEvents.length, merged.left, merged.right, merged.result, merged.match);
            mergeEvents.push(event);
            scoreDelta += scoreMerge(event.ruleId, merged.result);
            i += 2;
            targetIndex += 1;
            continue;
          }
        }

        nextBoard[target.y][target.x] = cloneTile(current.tile);
        movements.push({ tile: current.tile, from: current.coord, to: target, kind: "move" });
        i += 1;
        targetIndex += 1;
      }
    } else {
      let targetIndex = size - 1;
      let i = items.length - 1;

      while (i >= 0) {
        const current = items[i];
        const previous = items[i - 1];
        const target = coords[targetIndex];

        if (previous) {
          const merged = direction === "down"
            ? chooseVerticalMerge(previous.tile, current.tile, activeRules, current.tile.id, options)
            : chooseOrderedMerge(previous.tile, current.tile, activeRules, current.tile.id);
          if (merged) {
            nextBoard[target.y][target.x] = merged.result;
            movements.push({ tile: current.tile, from: current.coord, to: target, kind: "survivor" });
            movements.push({
              tile: previous.tile,
              from: previous.coord,
              to: target,
              kind: "consumed",
              consumedIntoTileId: current.tile.id
            });
            const event = createMergeEvent(mergeEvents.length, merged.left, merged.right, merged.result, merged.match);
            mergeEvents.push(event);
            scoreDelta += scoreMerge(event.ruleId, merged.result);
            i -= 2;
            targetIndex -= 1;
            continue;
          }
        }

        nextBoard[target.y][target.x] = cloneTile(current.tile);
        movements.push({ tile: current.tile, from: current.coord, to: target, kind: "move" });
        i -= 1;
        targetIndex -= 1;
      }
    }
  }

  const boardChanged =
    mergeEvents.length > 0 ||
    movements.some(movement => !sameCoord(movement.from, movement.to));

  if (!boardChanged) {
    return {
      boardChanged: false,
      nextBoard: cloneBoard(board),
      movements: [],
      mergeEvents: [],
      scoreDelta: 0
    };
  }

  return {
    boardChanged,
    nextBoard,
    movements,
    mergeEvents,
    scoreDelta
  };
}

function chooseOrderedMerge(left: Tile, right: Tile, activeRules: readonly RuleId[], resultId: string): MergeChoice | null {
  const merged = mergeTiles(left, right, activeRules, resultId);
  return merged ? { ...merged, left, right } : null;
}

function chooseVerticalMerge(
  pushFirst: Tile,
  pushSecond: Tile,
  activeRules: readonly RuleId[],
  resultId: string,
  options: MoveOptions
) {
  const pushOrder = chooseOrderedMerge(pushFirst, pushSecond, activeRules, resultId);
  const reverseOrder = chooseOrderedMerge(pushSecond, pushFirst, activeRules, resultId);
  const candidates = [
    pushOrder ? { ...pushOrder, priority: options.rankMergeSurface?.(pushOrder.result.surfaceIAST) ?? 0 } : null,
    reverseOrder ? { ...reverseOrder, priority: options.rankMergeSurface?.(reverseOrder.result.surfaceIAST) ?? 0 } : null
  ].filter((candidate): candidate is MergeChoice & { priority: number } => Boolean(candidate));

  if (candidates.length === 0) return null;

  return candidates.reduce((best, candidate) => (
    candidate.priority > best.priority ? candidate : best
  ), candidates[0]);
}

export function reduceLine(line: Array<Tile | null>, direction: "left" | "right", activeRules: readonly RuleId[]) {
  const board = createEmptyBoard(4);
  line.forEach((tile, x) => {
    board[0][x] = tile;
  });
  return computeMove(board, direction, activeRules).nextBoard[0];
}

export function hasLegalMove(board: Board, activeRules: readonly RuleId[]) {
  return (["up", "right", "down", "left"] as Direction[]).some(direction => computeMove(board, direction, activeRules).boardChanged);
}

export function mergeablePairs(board: Board, activeRules: readonly RuleId[]): HintPair[] {
  const pairs: HintPair[] = [];

  board.forEach((row, y) => {
    row.forEach((tile, x) => {
      if (!tile) return;

      const right = row[x + 1];
      if (right) {
        const horizontal = mergeTiles(tile, right, activeRules, tile.id);
        if (horizontal) {
          pairs.push({ a: { x, y }, b: { x: x + 1, y }, ruleId: horizontal.match.ruleId });
        }
      }

      const below = board[y + 1]?.[x];
      if (below) {
        const vertical = mergeTiles(tile, below, activeRules, tile.id) ?? mergeTiles(below, tile, activeRules, tile.id);
        if (vertical) {
          pairs.push({ a: { x, y }, b: { x, y: y + 1 }, ruleId: vertical.match.ruleId });
        }
      }
    });
  });

  return pairs;
}

export function bestDirection(board: Board, activeRules: readonly RuleId[]): Direction | null {
  const ranked = (["left", "up", "right", "down"] as Direction[])
    .map(direction => ({ direction, result: computeMove(board, direction, activeRules) }))
    .filter(entry => entry.result.boardChanged)
    .sort((a, b) => {
      const mergeDiff = b.result.mergeEvents.length - a.result.mergeEvents.length;
      if (mergeDiff !== 0) return mergeDiff;
      return b.result.scoreDelta - a.result.scoreDelta;
    });

  return ranked[0]?.direction ?? null;
}

export function hasSurface(board: Board, surface: string) {
  return getTiles(board).some(tile => tile.surfaceIAST === surface);
}

function createMergeEvent(
  index: number,
  left: Tile,
  right: Tile,
  result: Tile,
  match: { ruleId: MergeRuleId; replacement: Phoneme[]; mergeFamily?: "SANDHI_MERGE" | "METER_MERGE" }
): MergeEvent {
  return {
    id: `merge-${left.id}-${right.id}-${index}`,
    ruleId: match.ruleId,
    mergeFamily: match.mergeFamily ?? "SANDHI_MERGE",
    audit: buildMergeAudit({
      ruleId: match.ruleId,
      mergeFamily: match.mergeFamily ?? "SANDHI_MERGE",
      left,
      right,
      result,
      replacement: match.replacement
    }),
    leftSurface: left.surfaceIAST,
    rightSurface: right.surfaceIAST,
    resultSurface: result.surfaceIAST,
    resultKind: result.kind,
    boundary: {
      left: left.rightBoundary,
      right: right.leftBoundary,
      replacement: match.replacement
    },
    sourceTileIds: [left.id, right.id],
    resultTileId: result.id
  };
}
