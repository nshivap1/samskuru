import { makeTileFromPhonemes } from "../phonemes";
import type { MeterRuleId, MetricalSpan, Phoneme, Tile, TileKind } from "../types";
import { firstValidPadaIndex, mergeSpans, spanFromWeights, validatePrefix } from "./anustubh";

type MeterMergeResult = {
  result: Tile;
  match: {
    ruleId: MeterRuleId;
    replacement: Phoneme[];
    mergeFamily: "METER_MERGE";
  };
};

export function tryMeterMerge(left: Tile, right: Tile, resultId: string): MeterMergeResult | null {
  const aggregate = tryAggregateMeterSpan(left, right, resultId);
  if (aggregate) return aggregate;

  const structural = tryStructuralMerge(left, right, resultId);
  if (structural) return structural;

  return null;
}

export function getShlokaCount(tile: Tile) {
  return tile.meter?.shlokaCount ?? (tile.kind === "SHLOKA" ? 1 : 0);
}

function tryAggregateMeterSpan(left: Tile, right: Tile, resultId: string): MeterMergeResult | null {
  if (!left.meter || !right.meter) return null;
  if (left.kind === "PADA" || right.kind === "PADA") return null;
  if (left.kind === "HEMISTICH" || right.kind === "HEMISTICH" || left.kind === "SHLOKA" || right.kind === "SHLOKA") return null;

  const meter = mergeSpans(left.meter, right.meter);
  if (meter.syllableCount > 8) return null;

  const assignedPadaIndex = firstValidPadaIndex(meter);
  const candidateIndexes = assignedPadaIndex ? [assignedPadaIndex] : ([1, 2, 3, 4] as const);
  if (!candidateIndexes.some(index => validatePrefix(meter, index))) return null;

  const kind: TileKind = meter.syllableCount === 8 && assignedPadaIndex ? "PADA" : "PADA_SEGMENT";
  const nextMeter: MetricalSpan = {
    ...meter,
    assignedPadaIndex: assignedPadaIndex ?? left.meter.assignedPadaIndex
  };
  return makeMeterResult(left, right, resultId, kind, kind === "PADA" ? "METER_PADA" : "METER_SEGMENT", nextMeter);
}

function tryStructuralMerge(left: Tile, right: Tile, resultId: string): MeterMergeResult | null {
  if (left.kind === "PADA" && right.kind === "PADA") {
    const pair = `${left.meter?.assignedPadaIndex ?? ""}${right.meter?.assignedPadaIndex ?? ""}`;
    if (pair === "12" || pair === "34") {
      const hemistichIndex = pair === "12" ? 1 : 2;
      return makeMeterResult(left, right, resultId, "HEMISTICH", "METER_HEMISTICH", {
        weights: [...left.meter!.weights, ...right.meter!.weights],
        syllableCount: 16,
        hemistichIndex
      });
    }
  }

  if (left.kind === "HEMISTICH" && right.kind === "HEMISTICH" && left.meter?.hemistichIndex === 1 && right.meter?.hemistichIndex === 2) {
    return makeMeterResult(left, right, resultId, "SHLOKA", "METER_SHLOKA", {
      weights: [...left.meter!.weights, ...right.meter!.weights],
      syllableCount: 32,
      shlokaCount: 1
    });
  }

  const leftCount = getShlokaCount(left);
  const rightCount = getShlokaCount(right);
  if (leftCount > 0 && leftCount === rightCount) {
    return makeMeterResult(left, right, resultId, "SHLOKA_STACK", "METER_SHLOKA_STACK", {
      weights: [...(left.meter?.weights ?? []), ...(right.meter?.weights ?? [])],
      syllableCount: 32 * (leftCount + rightCount),
      shlokaCount: leftCount + rightCount
    });
  }

  return null;
}

function makeMeterResult(
  left: Tile,
  right: Tile,
  resultId: string,
  kind: TileKind,
  ruleId: MeterRuleId,
  meter: MetricalSpan
): MeterMergeResult {
  const compactLabel = compactMeterLabel(left, right, kind, meter);
  const result = makeTileFromPhonemes([...left.phonemes, ...right.phonemes], {
    id: resultId,
    kind,
    compactLabel,
    meter,
    mass: left.mass + right.mass,
    depth: Math.max(left.depth, right.depth) + 1,
    originRule: ruleId,
    parents: [left.id, right.id]
  });

  return {
    result,
    match: {
      ruleId,
      replacement: [...result.phonemes],
      mergeFamily: "METER_MERGE"
    }
  };
}

function compactMeterLabel(left: Tile, right: Tile, kind: TileKind, meter: MetricalSpan) {
  if (kind === "PADA") return `पाद ${meter.assignedPadaIndex ?? ""}`.trim();
  if (kind === "HEMISTICH") return meter.hemistichIndex === 1 ? "अर्ध A" : "अर्ध B";
  if (kind === "SHLOKA") return "श्लोकः";
  if (kind === "SHLOKA_STACK") return `${meter.shlokaCount ?? 2}× श्लोक`;
  return `${left.compactLabel ?? left.surfaceDeva} ${right.compactLabel ?? right.surfaceDeva}`;
}

export function spanFromNaturalWeights(weights: Array<"L" | "G">) {
  return spanFromWeights(weights);
}
