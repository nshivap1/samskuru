import starterTargetPack from "../../content/target-packs/starter_word_targets.draft.json";
import { cloneBoard, computeMove, createEmptyBoard, getEmptyCells, getTiles, hasLegalMove, placeTile } from "../game/board";
import { makeTileFromPhonemes, parseSurfaceToPhonemes, surfaceDeva } from "../game/phonemes";
import { SeededRng } from "../game/rng";
import { ALL_RULES, mergeTiles } from "../game/rules";
import type { ActiveTarget, Board, CompletedTarget, Coord, Direction, GameState, HintPair, RuleId, TargetBuildPath, TargetTileRole, TargetTileUse, Tile } from "../game/types";

type RawTarget = {
  id: string;
  kind: "WORD";
  targetIAST: string;
  targetDeva: string;
  gloss?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  conceptTags: string[];
  allowedRules: RuleId[];
  buildPaths: TargetBuildPath[];
};

type TargetUseScope = "active" | "queued" | "generic";

const TARGET_COMPLETION_BASE = 80;
const TARGET_STREAK_BONUS = 20;
const QUEUED_TARGET_LOOKAHEAD = 12;
const OPENING_TARGET_COUNT = 3;
const OPENING_TILE_COUNT = 4;
const OPENING_MAX_ATTEMPTS = 80;
const OPENING_BOARD_MAX_ATTEMPTS = 80;
const DIRECTIONS: Direction[] = ["left", "up", "right", "down"];
const INITIAL_TARGET_RULES: RuleId[] = ["SAVARNA_DIRGHA", "GUNA", "VRDDHI"];
const OPENING_CELLS: Coord[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 3, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
  { x: 2, y: 1 },
  { x: 3, y: 1 },
  { x: 0, y: 2 },
  { x: 1, y: 2 },
  { x: 2, y: 2 },
  { x: 3, y: 2 },
  { x: 0, y: 3 },
  { x: 1, y: 3 },
  { x: 2, y: 3 },
  { x: 3, y: 3 }
];

export const STARTER_TARGETS: ActiveTarget[] = (starterTargetPack.targets as RawTarget[]).map(target => ({
  id: target.id,
  kind: "WORD",
  targetIAST: target.targetIAST,
  targetDeva: target.targetDeva,
  gloss: target.gloss,
  difficulty: target.difficulty,
  conceptTags: [...target.conceptTags],
  allowedRules: [...target.allowedRules],
  buildPaths: target.buildPaths.map(path => ({
    pathId: path.pathId,
    chunks: [...path.chunks],
    steps: path.steps.map(step => ({ ...step }))
  }))
}));

export function createNewTargetRun(seed = createRunSeed(), highScore = 0): GameState {
  const rng = new SeededRng(seed);
  const opening = createOpeningState(rng);

  return {
    mode: "endless",
    board: opening.board,
    status: "playing",
    score: 0,
    highScore,
    streak: 0,
    moveNumber: 0,
    activeRules: [...ALL_RULES],
    activeTargets: opening.activeTargets,
    targetQueue: opening.targetQueue,
    completedTargets: [],
    completedTargetIds: [],
    actionLog: [],
    rngSeed: seed,
    rngState: rng.getState()
  };
}

export function cloneTargets(targets: ActiveTarget[]) {
  return targets.map(target => ({
    ...target,
    conceptTags: [...target.conceptTags],
    allowedRules: [...target.allowedRules],
    buildPaths: target.buildPaths.map(path => ({
      ...path,
      chunks: [...path.chunks],
      steps: path.steps.map(step => ({ ...step }))
    }))
  }));
}

export function cloneCompletedTargets(targets: CompletedTarget[]) {
  return targets.map(target => ({ ...target }));
}

export function evaluateRunStatus(state: GameState): GameState {
  if (state.status !== "playing") return state;
  const boardFull = getEmptyCells(state.board).length === 0;
  return boardFull && !hasLegalMove(state.board, state.activeRules) ? { ...state, status: "failed" } : state;
}

export function hasReachableActiveTarget(board: Board, activeTargets: ActiveTarget[]) {
  if (activeTargets.length === 0) return false;
  const surfaces = new Set(getTiles(board).map(tile => tile.surfaceIAST));
  const canSpawnMissingChunk = getEmptyCells(board).length > 0;

  return activeTargets.some(target =>
    target.buildPaths.some(path =>
      canSpawnMissingChunk ||
      path.chunks.some(chunk => surfaces.has(chunk)) ||
      path.steps.some(step => surfaces.has(step.result))
    )
  );
}

export function applyTargetCompletions(state: GameState, moveNumber: number) {
  const matches = findCompletedTargetMatches(state.board, state.activeTargets);
  if (matches.length === 0) {
    return {
      state: { ...state, streak: 0 },
      completed: [] as CompletedTarget[],
      clearedTileIds: [] as string[]
    };
  }

  const completed: CompletedTarget[] = matches.map((match, index) => {
    const streak = state.streak + index + 1;
    const scoreAwarded = TARGET_COMPLETION_BASE + match.target.difficulty * 20 + Math.max(0, streak - 1) * TARGET_STREAK_BONUS;
    return {
      targetId: match.target.id,
      targetIAST: match.target.targetIAST,
      targetDeva: match.target.targetDeva,
      completedAtMove: moveNumber,
      scoreAwarded
    };
  });

  const clearedBoard = cloneBoard(state.board);
  for (const match of matches) clearedBoard[match.coord.y][match.coord.x] = null;

  const newlyCompletedIds = new Set(completed.map(target => target.targetId));
  const completedThisCycle = new Set(state.completedTargetIds);
  for (const target of completed) completedThisCycle.add(target.targetId);

  const cycleExhausted = completedThisCycle.size >= STARTER_TARGETS.length;
  const blockedUntilCycleEnd = cycleExhausted ? new Set<string>() : completedThisCycle;
  const remainingActiveTargets = state.activeTargets.filter(target => !newlyCompletedIds.has(target.id));
  const refilled = refillActiveTargets(remainingActiveTargets, state.targetQueue, blockedUntilCycleEnd);
  const retagged = retagBoardForTargets(clearedBoard, refilled.activeTargets, refilled.targetQueue, blockedUntilCycleEnd, completedThisCycle);
  const scoreDelta = completed.reduce((sum, target) => sum + target.scoreAwarded, 0);
  const nextScore = state.score + scoreDelta;

  return {
    state: {
      ...state,
      board: retagged.board,
      score: nextScore,
      highScore: Math.max(state.highScore, nextScore),
      streak: state.streak + completed.length,
      activeTargets: refilled.activeTargets,
      targetQueue: refilled.targetQueue,
      completedTargets: [...completed, ...state.completedTargets].slice(0, 50),
      completedTargetIds: cycleExhausted ? [] : Array.from(completedThisCycle)
    },
    completed,
    clearedTileIds: [...matches.map(match => match.tile.id), ...retagged.removedTileIds]
  };
}

export function spawnTargetAwareTiles(state: GameState, count: number) {
  let board = state.board;
  const spawnedTileIds: string[] = [];
  const rng = new SeededRng(state.rngState ?? state.rngSeed ?? "target");

  for (let i = 0; i < count; i += 1) {
    const result = spawnTargetAwareTile(board, state.activeTargets, state.targetQueue, state.completedTargetIds, rng);
    board = result.board;
    if (result.spawnedTile) spawnedTileIds.push(result.spawnedTile.id);
  }

  return {
    state: {
      ...state,
      board,
      rngState: rng.getState()
    },
    spawnedTileIds
  };
}

export function targetSummary(targets: CompletedTarget[]) {
  if (targets.length === 0) return "";
  if (targets.length === 1) return `शब्दः सिद्धः ${targets[0].targetDeva}`;
  return `शब्दाः सिद्धाः ${targets.length}`;
}

export function makeTargetTile(surfaceIAST: string, targetUses?: TargetTileUse[]) {
  const phonemes = parseSurfaceToPhonemes(surfaceIAST);
  return makeTileFromPhonemes(phonemes, {
    kind: "WORD_SEGMENT",
    compactLabel: surfaceDeva(phonemes),
    targetUses
  });
}

export function getTargetUsesForSurface(surfaceIAST: string, targets: ActiveTarget[], roleOverride?: TargetTileRole) {
  const uses: TargetTileUse[] = [];

  for (const target of targets) {
    for (const path of target.buildPaths) {
      const role = roleOverride ?? getPathRoleForSurface(surfaceIAST, target, path);
      if (!role) continue;
      uses.push({
        targetId: target.id,
        targetIAST: target.targetIAST,
        pathId: path.pathId,
        role,
        surfaceIAST
      });
    }
  }

  return dedupeTargetUses(uses);
}

export function targetAwareMergeablePairs(
  board: Board,
  activeRules: readonly RuleId[],
  activeTargets: ActiveTarget[],
  targetQueue: ActiveTarget[]
) {
  const rankedPairs: Array<HintPair & { priority: number; reason: string; scope: TargetUseScope }> = [];

  board.forEach((row, y) => {
    row.forEach((tile, x) => {
      if (!tile) return;

      const right = row[x + 1];
      if (right) {
        const merged = mergeTiles(tile, right, activeRules, tile.id);
        if (merged) {
          const use = evaluateSurfaceTargetUse(merged.result.surfaceIAST, activeTargets, targetQueue);
          rankedPairs.push({ a: { x, y }, b: { x: x + 1, y }, ruleId: merged.match.ruleId, priority: use.priority, reason: use.reason, scope: use.scope });
        }
      }

      const below = board[y + 1]?.[x];
      if (below) {
        const candidates = [mergeTiles(tile, below, activeRules, tile.id), mergeTiles(below, tile, activeRules, tile.id)]
          .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
          .map(merged => ({
            merged,
            use: evaluateSurfaceTargetUse(merged.result.surfaceIAST, activeTargets, targetQueue)
          }))
          .sort((a, b) => b.use.priority - a.use.priority);
        const best = candidates[0];
        if (best) {
          rankedPairs.push({ a: { x, y }, b: { x, y: y + 1 }, ruleId: best.merged.match.ruleId, priority: best.use.priority, reason: best.use.reason, scope: best.use.scope });
        }
      }
    });
  });

  const bestPriority = Math.max(0, ...rankedPairs.map(pair => pair.priority));
  const pairs = (bestPriority > 0 ? rankedPairs.filter(pair => pair.priority === bestPriority) : rankedPairs)
    .sort((a, b) => b.priority - a.priority);

  return {
    pairs,
    activeTargetRelevantCount: rankedPairs.filter(pair => pair.scope === "active").length,
    queuedTargetRelevantCount: rankedPairs.filter(pair => pair.scope === "queued").length,
    genericMergeCount: rankedPairs.filter(pair => pair.scope === "generic").length,
    targetRelevantCount: rankedPairs.filter(pair => pair.scope !== "generic").length,
    bestReason: pairs[0]?.reason ?? ""
  };
}

export function bestTargetAwareDirection(
  board: Board,
  activeRules: readonly RuleId[],
  activeTargets: ActiveTarget[],
  targetQueue: ActiveTarget[]
) {
  const ranked = DIRECTIONS
    .map(direction => {
      const result = computeMove(board, direction, activeRules, {
        rankMergeSurface: surfaceIAST => rankSurfaceForTargets(surfaceIAST, activeTargets, targetQueue)
      });
      const mergeUses = result.mergeEvents.map(merge => evaluateSurfaceTargetUse(merge.resultSurface, activeTargets, targetQueue));
      const bestUse = mergeUses.sort((a, b) => b.priority - a.priority)[0] ?? evaluateSurfaceTargetUse("", activeTargets, targetQueue);

      return {
        direction,
        result,
        priority: bestUse.priority,
        reason: bestUse.reason,
        scope: bestUse.scope
      };
    })
    .filter(entry => entry.result.boardChanged)
    .sort((a, b) => {
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) return priorityDiff;
      const mergeDiff = b.result.mergeEvents.length - a.result.mergeEvents.length;
      if (mergeDiff !== 0) return mergeDiff;
      return b.result.scoreDelta - a.result.scoreDelta;
    });

  return ranked[0] ? { direction: ranked[0].direction, reason: ranked[0].reason, priority: ranked[0].priority, scope: ranked[0].scope } : null;
}

function createRunSeed() {
  const randomSuffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `target-${Date.now()}-${randomSuffix}`;
}

function createOpeningState(rng: SeededRng) {
  for (let attempt = 0; attempt < OPENING_MAX_ATTEMPTS; attempt += 1) {
    const activeTargets = pickOpeningTargets(rng);
    const activeIds = new Set(activeTargets.map(target => target.id));
    const targetQueue = shuffle(STARTER_TARGETS.filter(target => !activeIds.has(target.id)), rng);
    const board = seedInitialBoard(activeTargets, rng);

    if (isValidOpeningBoard(board, activeTargets)) return { activeTargets, targetQueue, board };
  }

  const activeTargets = pickFallbackOpeningTargets();
  const activeIds = new Set(activeTargets.map(target => target.id));
  const targetQueue = STARTER_TARGETS.filter(target => !activeIds.has(target.id));
  const board = seedFallbackOpeningBoard(activeTargets);

  return { activeTargets, targetQueue, board };
}

function pickOpeningTargets(rng: SeededRng) {
  const selected: ActiveTarget[] = [];
  const selectedIds = new Set<string>();
  const selectedOpeningChunks = new Set<string>();

  for (const rule of INITIAL_TARGET_RULES) {
    const candidates = shuffle(openingCandidatesForRule(rule), rng).filter(target => !selectedIds.has(target.id));
    const chosen =
      candidates.find(target => {
        const openingChunk = target.buildPaths[0]?.chunks[0];
        return openingChunk && !selectedOpeningChunks.has(openingChunk);
      }) ?? candidates[0];

    if (!chosen) continue;
    selected.push(chosen);
    selectedIds.add(chosen.id);
    const openingChunk = chosen.buildPaths[0]?.chunks[0];
    if (openingChunk) selectedOpeningChunks.add(openingChunk);
  }

  if (selected.length < OPENING_TARGET_COUNT) {
    const backfill = shuffle(STARTER_TARGETS, rng).filter(target => !selectedIds.has(target.id));
    selected.push(...backfill.slice(0, OPENING_TARGET_COUNT - selected.length));
  }

  return selected.slice(0, OPENING_TARGET_COUNT);
}

function openingCandidatesForRule(rule: RuleId) {
  const gentle = STARTER_TARGETS.filter(target => target.allowedRules.includes(rule) && target.difficulty <= 3);
  return gentle.length > 0 ? gentle : STARTER_TARGETS.filter(target => target.allowedRules.includes(rule));
}

function pickFallbackOpeningTargets() {
  return INITIAL_TARGET_RULES.flatMap(rule => STARTER_TARGETS.find(target => target.allowedRules.includes(rule)) ?? []).slice(0, OPENING_TARGET_COUNT);
}

function seedInitialBoard(activeTargets: ActiveTarget[], rng: SeededRng) {
  for (let attempt = 0; attempt < OPENING_BOARD_MAX_ATTEMPTS; attempt += 1) {
    const board = buildOpeningBoard(activeTargets, rng);
    if (isValidOpeningBoard(board, activeTargets)) return board;
  }

  return seedFallbackOpeningBoard(activeTargets);
}

function buildOpeningBoard(activeTargets: ActiveTarget[], rng: SeededRng) {
  let board = createEmptyBoard();
  const openingChunks = activeTargets
    .map(target => rng.choice(target.buildPaths[0]?.chunks ?? []))
    .filter((chunk): chunk is string => Boolean(chunk));
  const chunks = [...openingChunks];

  while (chunks.length > 0 && chunks.length < OPENING_TILE_COUNT) {
    chunks.push(rng.choice(openingChunks));
  }

  const positions = shuffle(OPENING_CELLS, rng).slice(0, chunks.length);

  shuffle(chunks, rng).forEach((chunk, index) => {
    const owners = getTargetUsesForSurface(chunk, activeTargets, "opening");
    const tile = makeTargetTile(chunk, owners);
    board = placeTile(board, tile, positions[index]);
  });

  return board;
}

function seedFallbackOpeningBoard(activeTargets: ActiveTarget[]) {
  let board = createEmptyBoard();
  const openingChunks = activeTargets
    .map(target => target.buildPaths[0]?.chunks[0])
    .filter((chunk): chunk is string => Boolean(chunk));
  const chunks = [...openingChunks];

  while (chunks.length > 0 && chunks.length < OPENING_TILE_COUNT) {
    chunks.push(openingChunks[chunks.length % openingChunks.length]);
  }

  const fallbackCells = [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 1, y: 2 },
    { x: 3, y: 3 }
  ];

  chunks.forEach((chunk, index) => {
    const owners = getTargetUsesForSurface(chunk, activeTargets, "opening");
    const tile = makeTargetTile(chunk, owners);
    board = placeTile(board, tile, fallbackCells[index]);
  });

  return board;
}

function isValidOpeningBoard(board: Board, activeTargets: ActiveTarget[]) {
  const activeIds = new Set(activeTargets.map(target => target.id));
  const tiles = getTiles(board);

  if (tiles.length !== OPENING_TILE_COUNT) return false;
  if (!hasLegalMove(board, ALL_RULES)) return false;
  if (findCompletedTargetMatches(board, activeTargets).length > 0) return false;
  if (wouldCompleteTargetInOneMove(board, activeTargets)) return false;

  const everyTileUseful = tiles.every(tile =>
    tile.targetUses?.some(use => activeIds.has(use.targetId))
  );

  return everyTileUseful && activeTargets.every(target => targetHasCompletableOpeningPath(board, target));
}

function targetHasCompletableOpeningPath(board: Board, target: ActiveTarget) {
  const surfaces = new Set(getTiles(board).map(tile => tile.surfaceIAST));
  const emptyCells = getEmptyCells(board).length;

  return target.buildPaths.some(path => {
    const chunks = Array.from(new Set(path.chunks));
    const presentChunks = chunks.filter(chunk => surfaces.has(chunk));
    if (presentChunks.length === 0) return false;

    const missingChunkCount = chunks.length - presentChunks.length;
    return missingChunkCount <= emptyCells;
  });
}

function wouldCompleteTargetInOneMove(board: Board, activeTargets: ActiveTarget[]) {
  return DIRECTIONS.some(direction => {
    const moved = computeMove(board, direction, ALL_RULES, {
      rankMergeSurface: surfaceIAST => rankSurfaceForTargets(surfaceIAST, activeTargets, [])
    });
    return moved.boardChanged && findCompletedTargetMatches(moved.nextBoard, activeTargets).length > 0;
  });
}

function findCompletedTargetMatches(board: Board, activeTargets: ActiveTarget[]) {
  const matches: Array<{ target: ActiveTarget; tile: Tile; coord: Coord }> = [];
  const matchedTargetIds = new Set<string>();

  for (const tile of getTiles(board)) {
    const target = activeTargets.find(candidate => candidate.targetIAST === tile.surfaceIAST && !matchedTargetIds.has(candidate.id));
    if (!target) continue;
    matchedTargetIds.add(target.id);
    matches.push({ target, tile, coord: tile.coord });
  }

  return matches;
}

function refillActiveTargets(activeTargets: ActiveTarget[], targetQueue: ActiveTarget[], completedIds: Set<string>) {
  const nextActiveTargets = [...activeTargets];
  let nextTargetQueue = targetQueue.filter(target => !completedIds.has(target.id));

  while (nextActiveTargets.length < 3) {
    if (nextTargetQueue.length === 0) {
      const activeIds = new Set(nextActiveTargets.map(target => target.id));
      nextTargetQueue = STARTER_TARGETS.filter(target => !activeIds.has(target.id) && !completedIds.has(target.id));
    }

    const next = nextTargetQueue.shift();
    if (!next) break;
    nextActiveTargets.push(next);
  }

  return { activeTargets: nextActiveTargets, targetQueue: nextTargetQueue };
}

function spawnTargetAwareTile(
  board: Board,
  activeTargets: ActiveTarget[],
  targetQueue: ActiveTarget[],
  completedTargetIds: string[],
  rng: SeededRng
) {
  const emptyCells = getEmptyCells(board);
  if (emptyCells.length === 0) return { board, spawnedTile: null as Tile | null };

  const candidates = buildSpawnCandidates(board, activeTargets, targetQueue, completedTargetIds);
  if (candidates.length === 0) return { board, spawnedTile: null as Tile | null };
  const chosen = weightedChoice(candidates, rng);
  const spawnedTile = makeTargetTile(chosen.surfaceIAST, chosen.targetUses);
  const cell = rng.choice(emptyCells);

  return {
    board: placeTile(board, spawnedTile, cell),
    spawnedTile
  };
}

function buildSpawnCandidates(board: Board, activeTargets: ActiveTarget[], targetQueue: ActiveTarget[], completedTargetIds: string[]) {
  const existingSurfaces = getTiles(board).map(tile => tile.surfaceIAST);
  const remainingEmptyCellsAfterSpawn = Math.max(0, getEmptyCells(board).length - 1);
  const blocked = new Set(completedTargetIds);
  const activeEntries = activeTargets.filter(target => !blocked.has(target.id)).map(target => ({ target, priority: 1 }));
  const queuedTargets = targetQueue.filter(target => !blocked.has(target.id)).slice(0, QUEUED_TARGET_LOOKAHEAD);
  const queuedEntries = queuedTargets.map(target => ({ target, priority: 0.45 }));
  let candidates = collectSpawnCandidates(activeEntries, existingSurfaces, remainingEmptyCellsAfterSpawn);

  if (candidates.size === 0) candidates = collectSpawnCandidates(queuedEntries, existingSurfaces, remainingEmptyCellsAfterSpawn);
  if (candidates.size === 0) candidates = collectSpawnCandidates(activeEntries, existingSurfaces, remainingEmptyCellsAfterSpawn, { allowUsefulDuplicates: true, roleOverride: "repair" });
  if (candidates.size === 0) candidates = collectSpawnCandidates(queuedEntries, existingSurfaces, remainingEmptyCellsAfterSpawn, { allowUsefulDuplicates: true, roleOverride: "repair" });

  return Array.from(candidates.values()).map(candidate => ({
    ...candidate,
    weight: Math.max(1, candidate.weight)
  }));
}

function collectSpawnCandidates(
  targetEntries: Array<{ target: ActiveTarget; priority: number }>,
  existingSurfaces: string[],
  remainingEmptyCellsAfterSpawn: number,
  options: { allowUsefulDuplicates?: boolean; roleOverride?: TargetTileRole } = {}
) {
  const usefulSurfaceCounts = countUsefulSurfaces(targetEntries.map(entry => entry.target));
  const candidates = new Map<string, { surfaceIAST: string; weight: number; targetUses: TargetTileUse[] }>();

  for (const { target, priority } of targetEntries) {
    for (const path of target.buildPaths) {
      for (const chunk of path.chunks) {
        const sameCount = existingSurfaces.filter(surface => surface === chunk).length;
        const usefulCount = usefulSurfaceCounts.get(chunk) ?? 0;
        if (!options.allowUsefulDuplicates && usefulCount > 0 && sameCount >= usefulCount) continue;
        if (!pathCanStillCompleteAfterSpawn(chunk, target, path, existingSurfaces, remainingEmptyCellsAfterSpawn)) continue;

        const targetUses = getTargetUsesForSurface(chunk, [target], options.roleOverride);
        if (targetUses.length === 0) continue;

        const weight = Math.max(1, Math.round(scoreChunkForTarget(chunk, target, path, existingSurfaces) * priority));
        const current = candidates.get(chunk);
        candidates.set(chunk, {
          surfaceIAST: chunk,
          weight: Math.max(current?.weight ?? 0, weight),
          targetUses: dedupeTargetUses([...(current?.targetUses ?? []), ...targetUses])
        });
      }
    }
  }

  return candidates;
}

function scoreChunkForTarget(chunk: string, target: ActiveTarget, path: TargetBuildPath, existingSurfaces: string[]) {
  let weight = 4 + Math.max(0, 5 - target.difficulty);

  for (const step of path.steps) {
    if (step.left === chunk && existingSurfaces.includes(step.right)) weight += 22;
    if (step.right === chunk && existingSurfaces.includes(step.left)) weight += 22;
    if (step.left === chunk || step.right === chunk) weight += 5;
  }

  const sameCount = existingSurfaces.filter(surface => surface === chunk).length;
  weight -= sameCount * 4;

  return weight;
}

function evaluateSurfaceTargetUse(surfaceIAST: string, activeTargets: ActiveTarget[], targetQueue: ActiveTarget[]) {
  const activeUse = evaluateSurfaceAgainstTargets(surfaceIAST, activeTargets, true);
  if (activeUse.priority > 0) return activeUse;

  const queuedUse = evaluateSurfaceAgainstTargets(surfaceIAST, targetQueue.slice(0, QUEUED_TARGET_LOOKAHEAD), false);
  if (queuedUse.priority > 0) return queuedUse;

  return { priority: 0, reason: "legal merge", scope: "generic" as const };
}

export function rankSurfaceForTargets(surfaceIAST: string, activeTargets: ActiveTarget[], targetQueue: ActiveTarget[]) {
  return evaluateSurfaceTargetUse(surfaceIAST, activeTargets, targetQueue).priority;
}

function evaluateSurfaceAgainstTargets(surfaceIAST: string, targets: ActiveTarget[], active: boolean) {
  for (const target of targets) {
    if (surfaceIAST === target.targetIAST) {
      return {
        priority: active ? 500 : 180,
        reason: active ? `completes ${target.targetIAST}` : `prepares queued ${target.targetIAST}`,
        scope: active ? "active" as const : "queued" as const
      };
    }

    for (const path of target.buildPaths) {
      if (path.steps.some(step => step.result === surfaceIAST)) {
        return {
          priority: active ? 400 : 140,
          reason: active ? `builds toward ${target.targetIAST}` : `supports queued ${target.targetIAST}`,
          scope: active ? "active" as const : "queued" as const
        };
      }

      if (path.chunks.includes(surfaceIAST)) {
        return {
          priority: active ? 300 : 100,
          reason: active ? `sets up ${target.targetIAST}` : `keeps queued ${target.targetIAST} available`,
          scope: active ? "active" as const : "queued" as const
        };
      }
    }
  }

  return { priority: 0, reason: "legal merge", scope: "generic" as const };
}

function pathCanStillCompleteAfterSpawn(
  candidateSurface: string,
  target: ActiveTarget,
  path: TargetBuildPath,
  existingSurfaces: string[],
  remainingEmptyCellsAfterSpawn: number
) {
  const participates =
    path.chunks.includes(candidateSurface) ||
    path.steps.some(step => step.result === candidateSurface) ||
    candidateSurface === target.targetIAST;

  if (!participates) return false;
  if (candidateSurface === target.targetIAST || path.steps.some(step => step.result === candidateSurface)) return true;

  const surfaceCounts = new Map<string, number>();
  for (const surface of existingSurfaces) surfaceCounts.set(surface, (surfaceCounts.get(surface) ?? 0) + 1);
  surfaceCounts.set(candidateSurface, (surfaceCounts.get(candidateSurface) ?? 0) + 1);

  const missingChunks = Array.from(new Set(path.chunks)).filter(chunk => (surfaceCounts.get(chunk) ?? 0) === 0);
  return missingChunks.length <= remainingEmptyCellsAfterSpawn;
}

function retagBoardForTargets(
  board: Board,
  activeTargets: ActiveTarget[],
  targetQueue: ActiveTarget[],
  blockedTargetIds: Set<string>,
  cleanupCompletedIds: Set<string>
) {
  const queuedTargets = targetQueue.filter(target => !blockedTargetIds.has(target.id)).slice(0, QUEUED_TARGET_LOOKAHEAD);
  const next = cloneBoard(board);
  const removedTileIds: string[] = [];

  next.forEach((row, y) => {
    row.forEach((tile, x) => {
      if (!tile) return;
      const activeUses = getTargetUsesForSurface(tile.surfaceIAST, activeTargets);
      const queuedUses = getTargetUsesForSurface(tile.surfaceIAST, queuedTargets);
      const targetUses = activeUses.length > 0 ? activeUses : queuedUses;

      if (activeUses.length === 0 && tile.targetUses && tile.parents.length === 0 && tile.depth === 0) {
        removedTileIds.push(tile.id);
        next[y][x] = null;
        return;
      }

      if (targetUses.length === 0 && shouldClearStaleMergedTile(tile, cleanupCompletedIds)) {
        removedTileIds.push(tile.id);
        next[y][x] = null;
        return;
      }

      next[y][x] = {
        ...tile,
        targetUses: targetUses.length > 0 ? targetUses : undefined
      };
    });
  });

  return { board: next, removedTileIds };
}

function shouldClearStaleMergedTile(tile: Tile, completedIds: Set<string>) {
  if (tile.depth <= 0 || tile.meter) return false;
  const sourceTargetUses = tile.sourceTargetUses ?? tile.targetUses ?? [];
  const sourceTargetIds = Array.from(new Set(sourceTargetUses.map(use => use.targetId)));

  return sourceTargetIds.length > 0 && sourceTargetIds.every(targetId => completedIds.has(targetId));
}

function countUsefulSurfaces(targets: ActiveTarget[]) {
  const targetIdsBySurface = new Map<string, Set<string>>();

  for (const target of targets) {
    for (const path of target.buildPaths) {
      for (const chunk of path.chunks) {
        const ids = targetIdsBySurface.get(chunk) ?? new Set<string>();
        ids.add(target.id);
        targetIdsBySurface.set(chunk, ids);
      }
    }
  }

  return new Map(Array.from(targetIdsBySurface.entries()).map(([surface, ids]) => [surface, ids.size]));
}

function getPathRoleForSurface(surfaceIAST: string, target: ActiveTarget, path: TargetBuildPath): TargetTileRole | null {
  if (surfaceIAST === target.targetIAST) return "target_result";

  for (const step of path.steps) {
    if (step.result === surfaceIAST) return "intermediate";
    if (step.left === surfaceIAST) return "left_chunk";
    if (step.right === surfaceIAST) return "right_chunk";
  }

  return path.chunks.includes(surfaceIAST) ? "left_chunk" : null;
}

function dedupeTargetUses(targetUses: TargetTileUse[]) {
  const keyed = new Map<string, TargetTileUse>();

  for (const use of targetUses) {
    keyed.set(`${use.targetId}:${use.pathId}:${use.role}:${use.surfaceIAST}`, { ...use });
  }

  return Array.from(keyed.values());
}

function weightedChoice<T extends { weight: number }>(items: T[], rng: SeededRng) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = rng.float() * total;

  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }

  return items[items.length - 1];
}

function shuffle<T>(items: readonly T[], rng: SeededRng) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.int(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
