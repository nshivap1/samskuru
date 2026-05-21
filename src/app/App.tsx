import {
  BookOpen,
  Info,
  Lightbulb,
  List,
  MessageSquareText,
  RotateCcw,
  Settings,
  Undo2,
  X
} from "lucide-react";
import { CSSProperties, PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { initializeAlphaAnalytics } from "./alphaAnalytics";
import {
  boardSignature,
  cloneBoard,
  computeMove,
  ensureUniqueTileIds
} from "../game/board";
import { compactTileLabel, graphemeClusters, parseSurfaceToPhonemes, surfaceDeva } from "../game/phonemes";
import {
  PersistedGameDataV1,
  loadPersistedGameData,
  savePersistedGameData
} from "../game/persistence";
import type { ActionLogEntry, Coord, Direction, GameState, HintPair, RuleId, ScriptMode, Tile, TileMovement } from "../game/types";
import type { MergeRuleId } from "../game/types";
import {
  applyTargetCompletions,
  bestTargetAwareDirection,
  cloneCompletedTargets,
  cloneTargets,
  createNewTargetRun,
  evaluateRunStatus,
  rankSurfaceForTargets,
  spawnTargetAwareTiles,
  targetAwareMergeablePairs
} from "../targets/targetEngine";

const MIN_SWIPE_DISTANCE_PX = 24;
const AXIS_DOMINANCE_RATIO = 1.25;
const MAX_INPUT_QUEUE_DEPTH = 3;
const SLIDE_MS = 110;
const POP_MS = 90;
const ALPHA_FEEDBACK_URL = import.meta.env.VITE_ALPHA_FEEDBACK_URL || "mailto:?subject=संस्कुरु alpha feedback";

type RenderPhase = "stable" | "moving" | "consumed" | "merged-survivor" | "spawning";

type RenderTile = {
  renderId: string;
  logicalTileId: string;
  tile: Tile;
  from: Coord;
  to: Coord;
  phase: RenderPhase;
  zIndex: number;
  consumedIntoTileId?: string;
};

type ConsoleView = "log" | "mechanics" | "rules" | "settings";

const RULE_LABELS: Record<RuleId, { title: string; short: string; example: Record<ScriptMode, string> }> = {
  SAVARNA_DIRGHA: { title: "Savarṇa Dīrgha", short: "like vowels lengthen", example: { deva: "अ + अ → आ", iast: "a + a → ā" } },
  GUNA: { title: "Guṇa", short: "a strengthens i/u/ṛ", example: { deva: "अ + इ → ए", iast: "a + i → e" } },
  VRDDHI: { title: "Vṛddhi", short: "a with e/o class rises", example: { deva: "अ + ए → ऐ", iast: "a + e → ai" } },
  YAN: { title: "Yaṇ", short: "i/u/ṛ glide before vowels", example: { deva: "उ + अ → व", iast: "u + a → va" } },
  AYAVA: { title: "Ayāva", short: "e/o split before vowels", example: { deva: "ए + अ → अय", iast: "e + a → aya" } },
  ANUSVARA_M: { title: "Anusvāra", short: "m softens before consonants", example: { deva: "म् + क → ंक", iast: "m + k → ṃk" } }
};

const METER_LABELS: Record<Exclude<MergeRuleId, RuleId>, { title: string; short: string; example: Record<ScriptMode, string> }> = {
  METER_SEGMENT: { title: "Metrical Segment", short: "valid pāda prefix", example: { deva: "शब्द + शब्द", iast: "word + word" } },
  METER_PADA: { title: "Pāda", short: "8-syllable anuṣṭubh line", example: { deva: "३ + ३ + २ → पाद", iast: "3 + 3 + 2 → pāda" } },
  METER_HEMISTICH: { title: "Hemistich", short: "two pādas", example: { deva: "पाद १ + पाद २", iast: "pāda 1 + pāda 2" } },
  METER_SHLOKA: { title: "Śloka", short: "two hemistichs", example: { deva: "अर्ध + अर्ध", iast: "ardha + ardha" } },
  METER_SHLOKA_STACK: { title: "Śloka Stack", short: "equal ślokas combine", example: { deva: "श्लोक ×१ + श्लोक ×१ → ×२", iast: "1× + 1× → 2×" } }
};

const MERGE_LABELS: Record<MergeRuleId, { title: string; short: string; example: Record<ScriptMode, string> }> = {
  ...RULE_LABELS,
  ...METER_LABELS
};

function wait(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise(resolve => window.requestAnimationFrame(resolve));
}

function resolveSwipe(dx: number, dy: number): Direction | null {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (Math.max(absX, absY) < MIN_SWIPE_DISTANCE_PX) return null;
  if (absX > absY * AXIS_DOMINANCE_RATIO) return dx > 0 ? "right" : "left";
  if (absY > absX * AXIS_DOMINANCE_RATIO) return dy > 0 ? "down" : "up";
  return null;
}

function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    board: cloneBoard(state.board),
    activeRules: [...state.activeRules],
    activeTargets: cloneTargets(state.activeTargets),
    targetQueue: cloneTargets(state.targetQueue),
    completedTargets: cloneCompletedTargets(state.completedTargets),
    completedTargetIds: [...(state.completedTargetIds ?? [])],
    actionLog: state.actionLog.map(entry => ({
      ...entry,
      targetCompletions: entry.targetCompletions ? cloneCompletedTargets(entry.targetCompletions) : undefined,
      merges: entry.merges.map(merge => ({
        ...merge,
        boundary: { ...merge.boundary, replacement: [...merge.boundary.replacement] },
        sourceTileIds: [...merge.sourceTileIds]
      }))
    }))
  };
}

function boardRenderId(tile: Tile, coord: Coord) {
  return `${tile.id}@${coord.x},${coord.y}`;
}

function movementRenderId(movement: TileMovement, index: number) {
  return [
    movement.tile.id,
    movement.kind,
    `${movement.from.x},${movement.from.y}`,
    `${movement.to.x},${movement.to.y}`,
    index
  ].join("@");
}

function renderTilesFromBoard(board: GameState["board"], options: { poppedIds?: Set<string>; spawnedTileIds?: Set<string> } = {}): RenderTile[] {
  const tiles: RenderTile[] = [];

  board.forEach((row, y) => {
    row.forEach((tile, x) => {
      if (!tile) return;
      const coord = { x, y };
      const spawning = options.spawnedTileIds?.has(tile.id);
      const popped = options.poppedIds?.has(tile.id);
      tiles.push({
        renderId: boardRenderId(tile, coord),
        logicalTileId: tile.id,
        tile,
        from: coord,
        to: coord,
        phase: spawning ? "spawning" : popped ? "merged-survivor" : "stable",
        zIndex: spawning ? 5 : popped ? 4 : 2
      });
    });
  });

  return tiles;
}

export function renderTilesFromMovements(movements: TileMovement[], position: "from" | "to"): RenderTile[] {
  return movements.map((movement, index) => ({
    renderId: movementRenderId(movement, index),
    logicalTileId: movement.tile.id,
    tile: movement.tile,
    from: movement.from,
    to: position === "from" ? movement.from : movement.to,
    phase: movement.kind === "consumed" ? "consumed" : "moving",
    zIndex: movement.kind === "consumed" ? 4 : movement.kind === "survivor" ? 3 : 2,
    consumedIntoTileId: movement.consumedIntoTileId
  }));
}

function addLogEntry(state: GameState, entry: ActionLogEntry): ActionLogEntry[] {
  return [entry, ...state.actionLog].slice(0, 12);
}

function getInitialState(persisted: PersistedGameDataV1) {
  return normalizeGameStateTileIds(persisted.runSnapshot ?? createNewTargetRun(undefined, persisted.highScore));
}

function normalizeGameStateTileIds(state: GameState): GameState {
  const board = ensureUniqueTileIds(state.board);
  return board === state.board ? state : { ...state, board };
}

export function App() {
  const loadedPersisted = loadPersistedGameData();
  const [persisted, setPersisted] = useState(loadedPersisted);
  const [gameState, setGameState] = useState(() => getInitialState(loadedPersisted));
  const [history, setHistory] = useState<GameState[]>([]);
  const [renderTiles, setRenderTiles] = useState(() => renderTilesFromBoard(gameState.board));
  const [feedback, setFeedback] = useState("Swipe to begin.");
  const [transitioning, setTransitioning] = useState(false);
  const [hintPairs, setHintPairs] = useState<HintPair[]>([]);
  const [hintDirection, setHintDirection] = useState<Direction | null>(null);
  const [hintBoardKey, setHintBoardKey] = useState("");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleView, setConsoleView] = useState<ConsoleView>("log");
  const [reducedMotion, setReducedMotion] = useState(false);

  const gameRef = useRef(gameState);
  const persistedRef = useRef(persisted);
  const transitioningRef = useRef(false);
  const transitionTokenRef = useRef(0);
  const inputQueueRef = useRef<Direction[]>([]);
  const pointerStartRef = useRef<Coord | null>(null);
  const scriptMode = persisted.preferences.scriptMode;

  useEffect(() => {
    gameRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    persistedRef.current = persisted;
  }, [persisted]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    initializeAlphaAnalytics();
  }, []);

  const persist = useCallback((state: GameState) => {
    setPersisted(previous => {
      const highScore = Math.max(previous.highScore, state.highScore, state.score);
      const next: PersistedGameDataV1 = {
        ...previous,
        highScore,
        runSnapshot: cloneGameState({ ...state, highScore })
      };
      savePersistedGameData(next);
      persistedRef.current = next;
      return next;
    });
  }, []);

  const commitGameState = useCallback(
    (state: GameState) => {
      const normalized = normalizeGameStateTileIds(state);
      gameRef.current = normalized;
      setGameState(normalized);
      persist(normalized);
    },
    [persist]
  );

  const resetHints = useCallback(() => {
    setHintPairs([]);
    setHintDirection(null);
    setHintBoardKey("");
  }, []);

  const announce = useCallback((message: string) => {
    setFeedback(message);
  }, []);

  const vibrate = useCallback((pattern: number | number[]) => {
    if (!persistedRef.current.preferences.hapticsEnabled) return;
    navigator.vibrate?.(pattern);
  }, []);

  const enqueueMove = useCallback((direction: Direction) => {
    const queue = inputQueueRef.current;
    if (queue.length >= MAX_INPUT_QUEUE_DEPTH) queue.shift();
    queue.push(direction);
  }, []);

  const processNextQueuedMove = useCallback(() => {
    const next = inputQueueRef.current.shift();
    const token = transitionTokenRef.current;
    if (next) {
      window.setTimeout(() => {
        if (token === transitionTokenRef.current) executeMoveRef.current(next);
      }, 0);
    }
  }, []);

  const cancelPendingMotion = useCallback(() => {
    transitionTokenRef.current += 1;
    inputQueueRef.current = [];
    transitioningRef.current = false;
    setTransitioning(false);
  }, []);

  const executeMoveRef = useRef<(direction: Direction) => void>(() => undefined);

  const executeMove = useCallback(
    async (direction: Direction) => {
      if (transitioningRef.current) {
        enqueueMove(direction);
        return;
      }

      const current = gameRef.current;
      if (current.status !== "playing") return;

      const result = computeMove(current.board, direction, current.activeRules, {
        rankMergeSurface: surfaceIAST => rankSurfaceForTargets(surfaceIAST, current.activeTargets, current.targetQueue)
      });
      if (!result.boardChanged) {
        announce(`${directionLabel(direction)}: no move`);
        vibrate(8);
        return;
      }

      const transitionToken = transitionTokenRef.current + 1;
      transitionTokenRef.current = transitionToken;
      transitioningRef.current = true;
      setTransitioning(true);
      resetHints();
      setHistory(previous => [cloneGameState(current), ...previous]);
      setRenderTiles(renderTilesFromMovements(result.movements, "from"));

      await nextFrame();
      if (transitionToken !== transitionTokenRef.current) return;
      setRenderTiles(renderTilesFromMovements(result.movements, "to"));

      const moveNumber = current.moveNumber + 1;
      const mergeEvents = result.mergeEvents.map(merge => ({ ...merge, id: `${moveNumber}-${merge.id}` }));
      const afterMergeScore = current.score + result.scoreDelta;
      const afterMerge: GameState = {
        ...current,
        board: result.nextBoard,
        score: afterMergeScore,
        highScore: Math.max(current.highScore, afterMergeScore),
        moveNumber
      };

      const completionResult = applyTargetCompletions(afterMerge, moveNumber);
      const completionScore = completionResult.completed.reduce((sum, target) => sum + target.scoreAwarded, 0);
      const totalScoreDelta = result.scoreDelta + completionScore;
      const spawnCount = completionResult.completed.length > 0 ? 2 : 1;
      const withLog: GameState = {
        ...completionResult.state,
        actionLog: addLogEntry(current, {
          id: `move-${moveNumber}`,
          moveNumber,
          direction,
          timestamp: Date.now(),
          merges: mergeEvents,
          targetCompletions: completionResult.completed,
          scoreDelta: totalScoreDelta,
          boardChanged: true
        })
      };
      const spawned = spawnTargetAwareTiles(withLog, spawnCount);
      const nextState = evaluateRunStatus(spawned.state);
      const summary = completionResult.completed.length > 0
        ? `${targetCompletionSummary(completionResult.completed, scriptMode)} · +${totalScoreDelta}`
        : summarizeMove(direction, mergeEvents, totalScoreDelta, nextState.status, scriptMode);

      announce(summary);
      if (mergeEvents.length > 0 || completionResult.completed.length > 0) vibrate([8, 24, 12]);

      await wait(reducedMotion ? 1 : SLIDE_MS);
      if (transitionToken !== transitionTokenRef.current) return;
      const poppedIds = new Set([...mergeEvents.map(merge => merge.resultTileId), ...completionResult.clearedTileIds]);
      if (completionResult.completed.length > 0) {
        setRenderTiles(renderTilesFromBoard(result.nextBoard, { poppedIds }));
        await wait(reducedMotion ? 1 : POP_MS);
        if (transitionToken !== transitionTokenRef.current) return;
      }

      commitGameState(nextState);
      setRenderTiles(renderTilesFromBoard(nextState.board, { spawnedTileIds: new Set(spawned.spawnedTileIds) }));

      await wait(reducedMotion ? 1 : POP_MS);
      if (transitionToken !== transitionTokenRef.current) return;
      setRenderTiles(renderTilesFromBoard(nextState.board));
      transitioningRef.current = false;
      setTransitioning(false);
      processNextQueuedMove();
    },
    [announce, commitGameState, enqueueMove, processNextQueuedMove, reducedMotion, resetHints, vibrate]
  );

  useEffect(() => {
    executeMoveRef.current = executeMove;
  }, [executeMove]);

  const undo = useCallback(() => {
    if (transitioningRef.current) return;
    const [previous, ...rest] = history;
    if (!previous) {
      announce("Nothing to undo yet.");
      return;
    }
    setHistory(rest);
    commitGameState(previous);
    setRenderTiles(renderTilesFromBoard(previous.board));
    resetHints();
    announce("Undo restored.");
  }, [announce, commitGameState, history, resetHints]);

  const restart = useCallback(() => {
    cancelPendingMotion();
    const next = createNewTargetRun(undefined, persistedRef.current.highScore);
    setHistory([]);
    commitGameState(next);
    setRenderTiles(renderTilesFromBoard(next.board));
    resetHints();
    announce("New run.");
  }, [announce, cancelPendingMotion, commitGameState, resetHints]);

  const showHint = useCallback(() => {
    const current = gameRef.current;
    const key = boardSignature(current.board);

    if (hintBoardKey !== key || hintPairs.length === 0) {
      const hint = targetAwareMergeablePairs(current.board, current.activeRules, current.activeTargets, current.targetQueue);
      setHintPairs(hint.pairs);
      setHintDirection(null);
      setHintBoardKey(key);
      if (hint.pairs.length === 0) {
        announce("No immediate merge.");
      } else if (hint.activeTargetRelevantCount > 0) {
        announce(`${hint.pairs.length} target-advancing boundary${hint.pairs.length === 1 ? "" : "ies"} highlighted.`);
      } else if (hint.queuedTargetRelevantCount > 0) {
        announce(`${hint.pairs.length} future-useful boundary${hint.pairs.length === 1 ? "" : "ies"} highlighted.`);
      } else {
        announce(`No target-advancing merge. ${hint.pairs.length} legal boundary${hint.pairs.length === 1 ? "" : "ies"} highlighted.`);
      }
      return;
    }

    const hint = bestTargetAwareDirection(current.board, current.activeRules, current.activeTargets, current.targetQueue);
    setHintDirection(hint?.direction ?? null);
    announce(hint
      ? hint.priority > 0
        ? `Try ${directionLabel(hint.direction)}: ${hint.reason}.`
        : `No target-advancing direction. ${directionLabel(hint.direction)} only shifts or makes a generic merge.`
      : "No board-changing move remains.");
  }, [announce, hintBoardKey, hintPairs.length]);

  const openConsole = useCallback((view: ConsoleView) => {
    setConsoleView(view);
    setConsoleOpen(true);
  }, []);

  const updatePreferences = useCallback((preferences: PersistedGameDataV1["preferences"]) => {
    setPersisted(previous => {
      const next = { ...previous, preferences };
      savePersistedGameData(next);
      persistedRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return;

      if (event.key === "ArrowUp") {
        event.preventDefault();
        executeMoveRef.current("up");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        executeMoveRef.current("right");
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        executeMoveRef.current("down");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        executeMoveRef.current("left");
      } else if (event.key.toLowerCase() === "u") {
        undo();
      } else if (event.key.toLowerCase() === "h") {
        showHint();
      } else if (event.key.toLowerCase() === "l") {
        openConsole("log");
      } else if (event.key.toLowerCase() === "r") {
        restart();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openConsole, restart, showHint, undo]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerStartRef.current) event.preventDefault();
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) return;
    const direction = resolveSwipe(event.clientX - start.x, event.clientY - start.y);
    if (direction) executeMove(direction);
  };

  const latestMoveText = gameState.status === "failed"
    ? "Board stuck. Undo or restart."
    : feedback;

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-lockup" aria-label="संस्कुरु, saṃskuru">
          <h1 className="app-title">
            <span className="app-title-deva">संस्कुरु</span>
            <span className="app-title-iast">saṃskuru</span>
          </h1>
        </div>

        <div className="top-actions">
          <button className="icon-button" type="button" onClick={restart} aria-label="Restart">
            <RotateCcw size={18} />
          </button>
          <button className="icon-button" type="button" onClick={() => openConsole("mechanics")} aria-label="Open mechanics">
            <Info size={18} />
          </button>
          <button className="icon-button" type="button" onClick={() => openConsole("settings")} aria-label="Open settings">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <section className="target-card" aria-label="Active targets">
        <p className="eyebrow">Targets</p>
        <div className="target-list">
          {gameState.activeTargets.map(target => (
            <article className="target-chip" key={target.id}>
              <span className={scriptMode === "deva" ? "deva-text" : ""}>{scriptMode === "deva" ? target.targetDeva : target.targetIAST}</span>
              <span>{scriptMode === "deva" ? target.targetIAST : target.targetDeva}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="stats-row" aria-label="Game statistics">
        <Stat label="Score" value={gameState.score.toString()} />
        <Stat label="Best" value={gameState.highScore.toString()} />
        <Stat label="Streak" value={gameState.streak.toString()} />
      </section>

      <section
        className="board-zone"
      >
        <div
          className={`board hint-${hintDirection ?? "none"}`}
          role="application"
          aria-label="Sandhi 2048 board. Swipe or use arrow keys."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            pointerStartRef.current = null;
          }}
        >
          <div className="board-grid" aria-hidden="true">
            {Array.from({ length: 16 }, (_, index) => (
              <div className="grid-cell" key={index} />
            ))}
          </div>
          <div className="hint-layer" aria-hidden="true">
            {hintPairs.map(pair => (
              <HintBridge key={`${pair.a.x}-${pair.a.y}-${pair.b.x}-${pair.b.y}`} pair={pair} scriptMode={scriptMode} />
            ))}
            {hintDirection && <div className={`edge-pulse edge-${hintDirection}`} />}
          </div>
          <div className="tile-layer">
            {renderTiles.map(tile => (
              <TileNode key={tile.renderId} renderTile={tile} scriptMode={scriptMode} />
            ))}
          </div>
        </div>
        {gameState.status === "failed" && (
          <button className="restart-run-cta" type="button" onClick={restart} aria-label="Restart run">
            <span>पुनः</span>
          </button>
        )}
      </section>

      <section className="feedback-strip" aria-live="polite">
        <span>{latestMoveText}</span>
      </section>

      <section className="bottom-tray" aria-label="Game controls">
        <TrayButton icon={<Undo2 size={18} />} label="Undo" onClick={undo} disabled={history.length === 0 || transitioning} />
        <TrayButton icon={<Lightbulb size={18} />} label="Hint" onClick={showHint} />
        <TrayButton icon={<List size={18} />} label="Log" onClick={() => openConsole("log")} />
        <TrayButton icon={<BookOpen size={18} />} label="Vyākarana" onClick={() => openConsole("rules")} />
        <TrayLink icon={<MessageSquareText size={18} />} label="Feedback" href={ALPHA_FEEDBACK_URL} />
      </section>

      {persisted.preferences.accessibilityControlsOpen && (
        <section className="accessibility-pad" aria-label="Directional controls">
          <button type="button" onClick={() => executeMove("up")} aria-label="Move up">↑</button>
          <button type="button" onClick={() => executeMove("left")} aria-label="Move left">←</button>
          <button type="button" onClick={() => executeMove("down")} aria-label="Move down">↓</button>
          <button type="button" onClick={() => executeMove("right")} aria-label="Move right">→</button>
        </section>
      )}

      <ConsoleSheet
        open={consoleOpen}
        view={consoleView}
        setView={setConsoleView}
        onClose={() => setConsoleOpen(false)}
        gameState={gameState}
        preferences={persisted.preferences}
        updatePreferences={updatePreferences}
      />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TrayButton({ icon, label, onClick, disabled = false }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button className="tray-button" type="button" onClick={onClick} disabled={disabled}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function TrayLink({ icon, label, href }: { icon: React.ReactNode; label: string; href: string }) {
  return (
    <a className="tray-button" href={href} target="_blank" rel="noreferrer" aria-label={label}>
      {icon}
      <span>{label}</span>
    </a>
  );
}

function TileNode({
  renderTile,
  scriptMode
}: {
  renderTile: RenderTile;
  scriptMode: ScriptMode;
}) {
  const fullLabel = scriptMode === "deva" ? renderTile.tile.compactLabel ?? renderTile.tile.surfaceDeva : renderTile.tile.surfaceIAST;
  const label = compactTileLabel(fullLabel);
  const len = tileLabelFitLength(label, scriptMode);
  const style = {
    "--x": renderTile.to.x,
    "--y": renderTile.to.y,
    zIndex: renderTile.zIndex
  } as CSSProperties;

  return (
    <button
      className="tile"
      data-phase={renderTile.phase}
      data-depth={Math.min(renderTile.tile.depth, 5)}
      data-testid="tile"
      data-render-id={renderTile.renderId}
      data-logical-id={renderTile.logicalTileId}
      style={style}
      type="button"
      aria-label={renderTile.tile.accessibleLabel}
      onClick={event => {
        event.stopPropagation();
      }}
    >
      <span className="tile-label" data-len={len} data-script={scriptMode}>
        {label}
      </span>
    </button>
  );
}

export function tileLabelFitLength(label: string, scriptMode: ScriptMode) {
  const clusterCount = graphemeClusters(label).length;
  if (scriptMode === "iast") return Math.min(12, clusterCount);

  const visibleDevaUnits = Array.from(label).filter(char => char !== "\u094d").length;
  return Math.min(12, Math.max(clusterCount, visibleDevaUnits));
}

function HintBridge({ pair, scriptMode }: { pair: HintPair; scriptMode: ScriptMode }) {
  const horizontal = pair.a.y === pair.b.y;
  const x = horizontal ? Math.min(pair.a.x, pair.b.x) + 0.5 : pair.a.x;
  const y = horizontal ? pair.a.y : Math.min(pair.a.y, pair.b.y) + 0.5;

  return (
    <div
      className={horizontal ? "hint-bridge horizontal" : "hint-bridge vertical"}
      style={{ "--hint-x": x, "--hint-y": y } as CSSProperties}
      title={MERGE_LABELS[pair.ruleId].example[scriptMode]}
    />
  );
}

function ConsoleSheet({
  open,
  view,
  setView,
  onClose,
  gameState,
  preferences,
  updatePreferences
}: {
  open: boolean;
  view: ConsoleView;
  setView: (view: ConsoleView) => void;
  onClose: () => void;
  gameState: GameState;
  preferences: PersistedGameDataV1["preferences"];
  updatePreferences: (preferences: PersistedGameDataV1["preferences"]) => void;
}) {
  return (
    <aside className={open ? "console-sheet open" : "console-sheet"} aria-hidden={!open}>
      <div className="sheet-handle" />
      <div className="sheet-head">
        <div className="sheet-tabs">
          <button className={view === "log" ? "active" : ""} type="button" onClick={() => setView("log")}>
            <List size={15} /> Log
          </button>
          <button className={view === "mechanics" ? "active" : ""} type="button" onClick={() => setView("mechanics")}>
            <Info size={15} /> Mechanics
          </button>
          <button className={view === "rules" ? "active" : ""} type="button" onClick={() => setView("rules")}>
            <BookOpen size={15} /> Vyākarana
          </button>
          <button className={view === "settings" ? "active" : ""} type="button" onClick={() => setView("settings")}>
            <Settings size={15} /> Settings
          </button>
        </div>
        <button className="icon-button subtle" type="button" onClick={onClose} aria-label="Close sheet">
          <X size={18} />
        </button>
      </div>

      <div className="sheet-body">
        {view === "log" && (
          <div className="log-list">
            {gameState.actionLog.length === 0 ? (
              <p className="empty-copy">Moves will appear here as you play.</p>
            ) : (
              gameState.actionLog.map(entry => (
                <article className="log-entry" key={entry.id}>
                  <header>
                    <strong>#{entry.moveNumber} {entry.direction.toUpperCase()}</strong>
                    <span>+{entry.scoreDelta}</span>
                  </header>
                  {entry.targetCompletions?.map(target => (
                    <p key={target.targetId}>
                      <strong className={preferences.scriptMode === "deva" ? "deva-text" : ""}>{targetSurface(target, preferences.scriptMode)}</strong> · {targetSurface(target, otherScript(preferences.scriptMode))} · +{target.scoreAwarded}
                    </p>
                  ))}
                  {entry.merges.length === 0 ? (
                    <p>Board shifted.</p>
                  ) : (
                    entry.merges.map(merge => (
                      <p key={merge.id}>
                        {formatSurface(merge.leftSurface, preferences.scriptMode)} + {formatSurface(merge.rightSurface, preferences.scriptMode)} → <strong>{formatSurface(merge.resultSurface, preferences.scriptMode)}</strong> · {MERGE_LABELS[merge.ruleId].title}
                      </p>
                    ))
                  )}
                </article>
              ))
            )}
          </div>
        )}

        {view === "mechanics" && (
          <div className="mechanics-list">
            <article className="mechanic-card">
              <strong>Swipe moves the whole board.</strong>
              <p>Tiles merge only when they collide in the swipe direction.</p>
            </article>
            <article className="mechanic-card">
              <strong>Rows read left to right.</strong>
              <p>Horizontal sandhi uses left-to-right order, whether you swipe left or right.</p>
            </article>
            <article className="mechanic-card">
              <strong>Columns are flexible.</strong>
              <p>Vertical neighbors can merge in either order. Visible targets win; otherwise the swipe direction decides.</p>
            </article>
            <article className="mechanic-card">
              <strong>Build the visible targets.</strong>
              <p>When a target word appears on the board, it scores, clears, and a new target enters.</p>
            </article>
            <article className="mechanic-card">
              <strong>Completion cleans selectively.</strong>
              <p>Off-target sandhi fragments clear only after every target represented by their source fragments is completed.</p>
            </article>
            <article className="mechanic-card">
              <strong>Legal can still be off-target.</strong>
              <p>Valid sandhi may create fragments outside the visible targets. Those tiles are part of the challenge and can clog the board.</p>
            </article>
            <article className="mechanic-card">
              <strong>The run ends only when stuck.</strong>
              <p>A full board is still alive if any swipe can shift or merge tiles.</p>
            </article>
          </div>
        )}

        {view === "rules" && (
          <div className="rule-grid">
            {(Object.keys(RULE_LABELS) as RuleId[]).map(ruleId => (
              <article className="rule-card" key={ruleId}>
                <span className="rule-chip">{ruleId}</span>
                <h3>{RULE_LABELS[ruleId].title}</h3>
                <p>{RULE_LABELS[ruleId].short}</p>
                <strong>{RULE_LABELS[ruleId].example[preferences.scriptMode]}</strong>
              </article>
            ))}
          </div>
        )}

        {view === "settings" && (
          <div className="settings-list">
            <label className="setting-row">
              <span>
                <strong>Haptics</strong>
                <small>Short tactile bumps after moves and merges</small>
              </span>
              <input
                type="checkbox"
                checked={preferences.hapticsEnabled}
                onChange={event => updatePreferences({ ...preferences, hapticsEnabled: event.target.checked })}
              />
            </label>
            <label className="setting-row">
              <span>
                <strong>Accessibility controls</strong>
                <small>Show optional directional buttons below the tray</small>
              </span>
              <input
                type="checkbox"
                checked={preferences.accessibilityControlsOpen}
                onChange={event => updatePreferences({ ...preferences, accessibilityControlsOpen: event.target.checked })}
              />
            </label>
            <label className="setting-row">
              <span>
                <strong>Script</strong>
                <small>Samskritam text display</small>
              </span>
              <select
                value={preferences.scriptMode}
                onChange={event => updatePreferences({ ...preferences, scriptMode: event.target.value === "iast" ? "iast" : "deva" })}
              >
                <option value="deva">देवनागरी</option>
                <option value="iast">IAST</option>
              </select>
            </label>
          </div>
        )}
      </div>
    </aside>
  );
}

function directionLabel(direction: Direction) {
  return direction[0].toUpperCase() + direction.slice(1);
}

function summarizeMove(direction: Direction, merges: ActionLogEntry["merges"], scoreDelta: number, status: GameState["status"], scriptMode: ScriptMode) {
  const suffix = status === "failed" ? " · board stuck" : "";
  if (merges.length === 0) return `${directionLabel(direction)}: shifted · +${scoreDelta}${suffix}`;
  if (merges.length === 1) {
    const merge = merges[0];
    return `${directionLabel(direction)}: ${formatSurface(merge.leftSurface, scriptMode)} + ${formatSurface(merge.rightSurface, scriptMode)} → ${formatSurface(merge.resultSurface, scriptMode)} · ${MERGE_LABELS[merge.ruleId].title}${suffix}`;
  }
  const rules = Array.from(new Set(merges.map(merge => MERGE_LABELS[merge.ruleId].title))).join(", ");
  return `${directionLabel(direction)}: ${merges.length} merges · ${rules}${suffix}`;
}

function otherScript(scriptMode: ScriptMode): ScriptMode {
  return scriptMode === "deva" ? "iast" : "deva";
}

function targetSurface(target: { targetDeva: string; targetIAST: string }, scriptMode: ScriptMode) {
  return scriptMode === "deva" ? target.targetDeva : target.targetIAST;
}

function targetCompletionSummary(targets: NonNullable<ActionLogEntry["targetCompletions"]>, scriptMode: ScriptMode) {
  if (targets.length === 0) return "";
  const prefix = scriptMode === "deva" ? "शब्दः सिद्धः" : "śabdaḥ siddhaḥ";
  const pluralPrefix = scriptMode === "deva" ? "शब्दाः सिद्धाः" : "śabdāḥ siddhāḥ";
  if (targets.length === 1) return `${prefix} ${targetSurface(targets[0], scriptMode)}`;
  return `${pluralPrefix} ${targets.length}`;
}

function formatSurface(surfaceIASTText: string, scriptMode: ScriptMode) {
  if (scriptMode === "iast") return surfaceIASTText;

  try {
    return surfaceDeva(parseSurfaceToPhonemes(surfaceIASTText));
  } catch {
    return surfaceIASTText;
  }
}
