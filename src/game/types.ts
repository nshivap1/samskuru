export type Direction = "up" | "right" | "down" | "left";

export type Coord = { x: number; y: number };

export type RuleId =
  | "SAVARNA_DIRGHA"
  | "GUNA"
  | "VRDDHI"
  | "YAN"
  | "AYAVA"
  | "ANUSVARA_M";

export type MeterRuleId =
  | "METER_SEGMENT"
  | "METER_PADA"
  | "METER_HEMISTICH"
  | "METER_SHLOKA"
  | "METER_SHLOKA_STACK";

export type MergeRuleId = RuleId | MeterRuleId;

export type Phoneme =
  | "a"
  | "ā"
  | "i"
  | "ī"
  | "u"
  | "ū"
  | "ṛ"
  | "ṝ"
  | "ḷ"
  | "e"
  | "o"
  | "ai"
  | "au"
  | "k"
  | "kh"
  | "g"
  | "gh"
  | "ṅ"
  | "c"
  | "ch"
  | "j"
  | "jh"
  | "ñ"
  | "ṭ"
  | "ṭh"
  | "ḍ"
  | "ḍh"
  | "ṇ"
  | "t"
  | "th"
  | "d"
  | "dh"
  | "n"
  | "p"
  | "ph"
  | "b"
  | "bh"
  | "m"
  | "y"
  | "r"
  | "l"
  | "v"
  | "ś"
  | "ṣ"
  | "s"
  | "h"
  | "ṃ"
  | "ḥ";

export type PhonemeClass = "A" | "I" | "U" | "R" | "EC" | "CONSONANT" | "OTHER";

export type PhonemeClassSignature = {
  left: PhonemeClass;
  right: PhonemeClass;
};

export type TileKind =
  | "PHONEME"
  | "AKSHARA"
  | "WORD_SEGMENT"
  | "PADA_SEGMENT"
  | "PADA"
  | "HEMISTICH"
  | "SHLOKA"
  | "SHLOKA_STACK";

export type SyllableWeight = "L" | "G" | "X";

export type MetricalSpan = {
  weights: SyllableWeight[];
  syllableCount: number;
  assignedPadaIndex?: 1 | 2 | 3 | 4;
  hemistichIndex?: 1 | 2;
  shlokaCount?: number;
};

export type TargetTileRole =
  | "left_chunk"
  | "right_chunk"
  | "intermediate"
  | "target_result"
  | "opening"
  | "repair";

export type TargetTileUse = {
  targetId: string;
  targetIAST: string;
  pathId: string;
  role: TargetTileRole;
  surfaceIAST: string;
};

export type RuleAuditExample = {
  input: string;
  output: string;
  note?: string;
};

export type RuleAuditSpec = {
  id: MergeRuleId;
  family: "SANDHI_MERGE" | "METER_MERGE";
  sourceVersion: string;
  name: string;
  sanskritName?: string;
  sutraRef?: string;
  inputPattern: string;
  outputPattern: string;
  constraints: string[];
  explanation: string;
  examples: RuleAuditExample[];
  counterExamples: RuleAuditExample[];
};

export type MergeAudit = {
  sourceVersion: string;
  ruleName: string;
  sanskritName?: string;
  sutraRef?: string;
  inputPattern: string;
  outputPattern: string;
  constraints: string[];
  explanation: string;
  examples: RuleAuditExample[];
  counterExamples: RuleAuditExample[];
  applied: {
    leftSurface: string;
    rightSurface: string;
    resultSurface: string;
    resultKind: TileKind;
    boundary: {
      left: Phoneme;
      right: Phoneme;
      replacement: Phoneme[];
    };
    leftMeter?: MetricalSpan;
    rightMeter?: MetricalSpan;
    resultMeter?: MetricalSpan;
  };
};

export type Tile = {
  id: string;
  kind: TileKind;
  phonemes: Phoneme[];
  surfaceIAST: string;
  surfaceDeva: string;
  compactLabel?: string;
  leftBoundary: Phoneme;
  rightBoundary: Phoneme;
  mass: number;
  depth: number;
  originRule: MergeRuleId | null;
  parents: string[];
  classSignature: PhonemeClassSignature;
  meter?: MetricalSpan;
  targetUses?: TargetTileUse[];
  sourceTargetUses?: TargetTileUse[];
  accessibleLabel: string;
};

export type Board = Array<Array<Tile | null>>;

export type RuleMatch = {
  ruleId: RuleId;
  replacement: Phoneme[];
  consumeRight: boolean;
};

export type MergeEvent = {
  id: string;
  ruleId: MergeRuleId;
  mergeFamily: "SANDHI_MERGE" | "METER_MERGE";
  audit: MergeAudit;
  leftSurface: string;
  rightSurface: string;
  resultSurface: string;
  resultKind: TileKind;
  boundary: {
    left: Phoneme;
    right: Phoneme;
    replacement: Phoneme[];
  };
  sourceTileIds: string[];
  resultTileId: string;
};

export type ActionLogEntry = {
  id: string;
  moveNumber: number;
  direction: Direction;
  timestamp: number;
  merges: MergeEvent[];
  targetCompletions?: CompletedTarget[];
  scoreDelta: number;
  boardChanged: boolean;
};

export type GameStatus = "playing" | "failed";

export type GameMode = "endless";
export type ScriptMode = "deva" | "iast";

export type TargetBuildStep = {
  left: string;
  right: string;
  result: string;
  ruleId: RuleId;
};

export type TargetBuildPath = {
  pathId: string;
  chunks: string[];
  steps: TargetBuildStep[];
};

export type ActiveTarget = {
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

export type CompletedTarget = {
  targetId: string;
  targetIAST: string;
  targetDeva: string;
  completedAtMove: number;
  scoreAwarded: number;
};

export type GameState = {
  mode: "endless";
  board: Board;
  status: GameStatus;
  score: number;
  highScore: number;
  streak: number;
  moveNumber: number;
  activeRules: RuleId[];
  activeTargets: ActiveTarget[];
  targetQueue: ActiveTarget[];
  completedTargets: CompletedTarget[];
  completedTargetIds: string[];
  actionLog: ActionLogEntry[];
  rngSeed?: string;
  rngState?: number;
};

export type TileMovement = {
  tile: Tile;
  from: Coord;
  to: Coord;
  kind: "move" | "survivor" | "consumed";
  consumedIntoTileId?: string;
};

export type MoveResult = {
  boardChanged: boolean;
  nextBoard: Board;
  movements: TileMovement[];
  mergeEvents: MergeEvent[];
  scoreDelta: number;
};

export type HintPair = {
  a: Coord;
  b: Coord;
  ruleId: MergeRuleId;
};
