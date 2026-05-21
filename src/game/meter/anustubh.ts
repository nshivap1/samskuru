import type { MetricalSpan, SyllableWeight } from "../types";

export const ANUSTUBH_PATHYA_V1 = {
  ODD_PADA: ["X", "X", "X", "X", "L", "G", "G", "X"],
  EVEN_PADA: ["X", "X", "X", "X", "L", "G", "L", "X"]
} as const;

export function spanFromWeights(weights: SyllableWeight[], assignedPadaIndex?: 1 | 2 | 3 | 4): MetricalSpan {
  return {
    weights,
    syllableCount: weights.length,
    assignedPadaIndex
  };
}

export function mergeSpans(a: MetricalSpan, b: MetricalSpan): MetricalSpan {
  return spanFromWeights([...a.weights, ...b.weights], a.assignedPadaIndex);
}

export function validatePrefix(span: MetricalSpan, padaIndex: 1 | 2 | 3 | 4) {
  if (span.syllableCount > 8) return false;
  const pattern = patternForPada(padaIndex);

  for (let index = 0; index < span.weights.length; index += 1) {
    const expected = pattern[index];
    if (expected !== "X" && span.weights[index] !== expected) return false;
  }

  return passesUniversalRules(span, padaIndex);
}

export function validateCompletePada(span: MetricalSpan, padaIndex: 1 | 2 | 3 | 4) {
  return span.syllableCount === 8 && validatePrefix(span, padaIndex);
}

export function firstValidPadaIndex(span: MetricalSpan): 1 | 2 | 3 | 4 | null {
  for (const index of [1, 2, 3, 4] as const) {
    if (validateCompletePada(span, index)) return index;
  }
  return null;
}

function patternForPada(padaIndex: 1 | 2 | 3 | 4) {
  return padaIndex === 1 || padaIndex === 3 ? ANUSTUBH_PATHYA_V1.ODD_PADA : ANUSTUBH_PATHYA_V1.EVEN_PADA;
}

function passesUniversalRules(span: MetricalSpan, padaIndex: 1 | 2 | 3 | 4) {
  const weights = span.weights;
  if (weights.length >= 3 && weights[1] === "L" && weights[2] === "L") return false;
  if ((padaIndex === 2 || padaIndex === 4) && weights.length >= 4 && weights[1] === "G" && weights[2] === "L" && weights[3] === "G") return false;
  return true;
}
