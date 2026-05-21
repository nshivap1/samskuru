import { A_CLASS, CONSONANTS, EC, I_CLASS, R_CLASS, U_CLASS, VOWELS, makeTileFromPhonemes } from "./phonemes";
import { tryMeterMerge } from "./meter/meterMerge";
import type { MergeRuleId, Phoneme, RuleId, RuleMatch, TargetTileUse, Tile } from "./types";

export const ALL_RULES: RuleId[] = [
  "SAVARNA_DIRGHA",
  "VRDDHI",
  "GUNA",
  "YAN",
  "AYAVA",
  "ANUSVARA_M"
];

export const RULE_SCORE: Record<RuleId, number> = {
  SAVARNA_DIRGHA: 10,
  GUNA: 15,
  VRDDHI: 20,
  YAN: 12,
  AYAVA: 15,
  ANUSVARA_M: 8
};

const METER_SCORE: Partial<Record<MergeRuleId, number>> = {
  METER_SEGMENT: 18,
  METER_PADA: 120,
  METER_HEMISTICH: 280,
  METER_SHLOKA: 700,
  METER_SHLOKA_STACK: 1200
};

const MAX_ENGINE_TILE_PHONEMES = 12;

function allowRule(match: RuleMatch, activeRules: readonly RuleId[]) {
  return activeRules.includes(match.ruleId) ? match : null;
}

export function resolveBoundaryRule(
  left: Phoneme,
  right: Phoneme,
  activeRules: readonly RuleId[] = ALL_RULES
): RuleMatch | null {
  const allow = (match: RuleMatch) => allowRule(match, activeRules);

  if (A_CLASS.has(left) && A_CLASS.has(right)) return allow({ ruleId: "SAVARNA_DIRGHA", replacement: ["ā"], consumeRight: true });
  if (I_CLASS.has(left) && I_CLASS.has(right)) return allow({ ruleId: "SAVARNA_DIRGHA", replacement: ["ī"], consumeRight: true });
  if (U_CLASS.has(left) && U_CLASS.has(right)) return allow({ ruleId: "SAVARNA_DIRGHA", replacement: ["ū"], consumeRight: true });
  if (R_CLASS.has(left) && R_CLASS.has(right)) return allow({ ruleId: "SAVARNA_DIRGHA", replacement: ["ṝ"], consumeRight: true });

  if (A_CLASS.has(left) && (right === "e" || right === "ai")) return allow({ ruleId: "VRDDHI", replacement: ["ai"], consumeRight: true });
  if (A_CLASS.has(left) && (right === "o" || right === "au")) return allow({ ruleId: "VRDDHI", replacement: ["au"], consumeRight: true });

  if (A_CLASS.has(left) && I_CLASS.has(right)) return allow({ ruleId: "GUNA", replacement: ["e"], consumeRight: true });
  if (A_CLASS.has(left) && U_CLASS.has(right)) return allow({ ruleId: "GUNA", replacement: ["o"], consumeRight: true });
  if (A_CLASS.has(left) && R_CLASS.has(right)) return allow({ ruleId: "GUNA", replacement: ["a", "r"], consumeRight: true });

  if (I_CLASS.has(left) && VOWELS.has(right) && !I_CLASS.has(right)) return allow({ ruleId: "YAN", replacement: ["y"], consumeRight: false });
  if (U_CLASS.has(left) && VOWELS.has(right) && !U_CLASS.has(right)) return allow({ ruleId: "YAN", replacement: ["v"], consumeRight: false });
  if (R_CLASS.has(left) && VOWELS.has(right) && !R_CLASS.has(right)) return allow({ ruleId: "YAN", replacement: ["r"], consumeRight: false });

  if (EC.has(left) && VOWELS.has(right)) {
    if (left === "e") return allow({ ruleId: "AYAVA", replacement: ["a", "y"], consumeRight: false });
    if (left === "o") return allow({ ruleId: "AYAVA", replacement: ["a", "v"], consumeRight: false });
    if (left === "ai") return allow({ ruleId: "AYAVA", replacement: ["ā", "y"], consumeRight: false });
    if (left === "au") return allow({ ruleId: "AYAVA", replacement: ["ā", "v"], consumeRight: false });
  }

  if (left === "m" && CONSONANTS.has(right)) return allow({ ruleId: "ANUSVARA_M", replacement: ["ṃ"], consumeRight: false });

  return null;
}

export function mergeTiles(left: Tile, right: Tile, activeRules: readonly RuleId[], resultId: string) {
  const match = resolveBoundaryRule(left.rightBoundary, right.leftBoundary, activeRules);
  if (!match) return tryMeterMerge(left, right, resultId);

  const leftStem = left.phonemes.slice(0, -1);
  const rightTail = match.consumeRight ? right.phonemes.slice(1) : right.phonemes;
  const phonemes = [...leftStem, ...match.replacement, ...rightTail];
  if (phonemes.length > MAX_ENGINE_TILE_PHONEMES) return null;

  const result = makeTileFromPhonemes(phonemes, {
    id: resultId,
    mass: left.mass + right.mass,
    depth: Math.max(left.depth, right.depth) + 1,
    originRule: match.ruleId,
    targetUses: mergeTargetUses(left, right, phonemes.join("")),
    sourceTargetUses: mergeSourceTargetUses(left, right),
    parents: [left.id, right.id]
  });

  return { result, match: { ...match, mergeFamily: "SANDHI_MERGE" as const } };
}

export function scoreMerge(ruleId: MergeRuleId, result: Tile) {
  const base = ruleId in RULE_SCORE ? RULE_SCORE[ruleId as RuleId] : METER_SCORE[ruleId] ?? 0;
  return base + 5 * result.mass + 3 * result.depth;
}

function mergeSourceTargetUses(left: Tile, right: Tile) {
  const uses = [
    ...(left.sourceTargetUses ?? left.targetUses ?? []),
    ...(right.sourceTargetUses ?? right.targetUses ?? [])
  ];
  const keyed = new Map<string, TargetTileUse>();

  for (const use of uses) {
    keyed.set(`${use.targetId}:${use.pathId}:${use.role}:${use.surfaceIAST}`, { ...use });
  }

  return keyed.size > 0 ? Array.from(keyed.values()) : undefined;
}

function mergeTargetUses(left: Tile, right: Tile, resultSurfaceIAST: string) {
  const uses = [...(left.targetUses ?? []), ...(right.targetUses ?? [])];
  const keyed = new Map<string, TargetTileUse>();

  for (const use of uses) {
    const key = `${use.targetId}:${use.pathId}:${resultSurfaceIAST}`;
    const role = use.surfaceIAST === resultSurfaceIAST ? use.role : "intermediate";
    keyed.set(key, {
      ...use,
      role,
      surfaceIAST: resultSurfaceIAST
    });
  }

  return keyed.size > 0 ? Array.from(keyed.values()) : undefined;
}
