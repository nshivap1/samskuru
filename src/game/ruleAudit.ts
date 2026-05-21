import type { MergeAudit, MergeRuleId, MetricalSpan, Phoneme, RuleAuditSpec, Tile, TileKind } from "./types";

export const RULE_AUDIT_VERSION = "sandhi-chandas-rules-v1";

export const RULE_AUDIT_REGISTRY: Record<MergeRuleId, RuleAuditSpec> = {
  SAVARNA_DIRGHA: {
    id: "SAVARNA_DIRGHA",
    family: "SANDHI_MERGE",
    sourceVersion: RULE_AUDIT_VERSION,
    name: "Savarṇa Dīrgha",
    sanskritName: "सवर्णदीर्घ",
    sutraRef: "Pāṇini 6.1.101",
    inputPattern: "same vowel class + same vowel class",
    outputPattern: "corresponding long vowel",
    constraints: ["Only applies when the level or mode enables SAVARNA_DIRGHA."],
    explanation: "Two adjacent vowels from the same class merge into the long member of that class.",
    examples: [
      { input: "a + a", output: "ā" },
      { input: "u + u", output: "ū" }
    ],
    counterExamples: [
      { input: "a + i", output: "not ā", note: "Different vowel classes use guṇa in this game." },
      { input: "u + a", output: "not ū", note: "Yaṇ handles u before a unlike vowel." }
    ]
  },
  GUNA: {
    id: "GUNA",
    family: "SANDHI_MERGE",
    sourceVersion: RULE_AUDIT_VERSION,
    name: "Guṇa",
    sanskritName: "गुण",
    sutraRef: "Pāṇini 6.1.87",
    inputPattern: "a/ā + i/ī/u/ū/ṛ/ṝ",
    outputPattern: "e / o / ar",
    constraints: ["Only applies when the level or mode enables GUNA.", "Vṛddhi is checked first for a + e/o-class vowels."],
    explanation: "An a-class vowel combines with a following i-, u-, or ṛ-class vowel into the corresponding guṇa grade.",
    examples: [
      { input: "a + i", output: "e" },
      { input: "a + u", output: "o" }
    ],
    counterExamples: [
      { input: "i + a", output: "not e", note: "The boundary direction matters." },
      { input: "a + e", output: "not e", note: "This is handled by vṛddhi in v1." }
    ]
  },
  VRDDHI: {
    id: "VRDDHI",
    family: "SANDHI_MERGE",
    sourceVersion: RULE_AUDIT_VERSION,
    name: "Vṛddhi",
    sanskritName: "वृद्धि",
    sutraRef: "Pāṇini 6.1.88",
    inputPattern: "a/ā + e/ai/o/au",
    outputPattern: "ai / au",
    constraints: ["Only applies when the level or mode enables VRDDHI.", "Checked before guṇa."],
    explanation: "An a-class vowel followed by an e/o-class vowel rises to the vṛddhi grade.",
    examples: [
      { input: "a + e", output: "ai" },
      { input: "a + o", output: "au" }
    ],
    counterExamples: [
      { input: "a + i", output: "not ai", note: "This is guṇa, not vṛddhi." },
      { input: "e + a", output: "not ai", note: "This is ayāva in v1." }
    ]
  },
  YAN: {
    id: "YAN",
    family: "SANDHI_MERGE",
    sourceVersion: RULE_AUDIT_VERSION,
    name: "Yaṇ",
    sanskritName: "यण्",
    sutraRef: "Pāṇini 6.1.77",
    inputPattern: "i/ī/u/ū/ṛ/ṝ + unlike vowel",
    outputPattern: "y/v/r + following vowel",
    constraints: ["Only applies when the level or mode enables YAN.", "The following vowel is retained."],
    explanation: "An i-, u-, or ṛ-class vowel becomes its glide before a following unlike vowel.",
    examples: [
      { input: "u + a", output: "va" },
      { input: "i + a", output: "ya" }
    ],
    counterExamples: [
      { input: "u + u", output: "not vu", note: "Same vowel class uses savarṇa dīrgha." },
      { input: "a + u", output: "not va", note: "Boundary direction matters." }
    ]
  },
  AYAVA: {
    id: "AYAVA",
    family: "SANDHI_MERGE",
    sourceVersion: RULE_AUDIT_VERSION,
    name: "Ayāva",
    sanskritName: "अयाव",
    sutraRef: "Pāṇini 6.1.78",
    inputPattern: "e/o/ai/au + vowel",
    outputPattern: "ay/av/āy/āv + following vowel",
    constraints: ["Only applies when the level or mode enables AYAVA.", "The following vowel is retained."],
    explanation: "An e/o-class vowel resolves into ay/av-style material before another vowel.",
    examples: [
      { input: "e + a", output: "aya" },
      { input: "o + a", output: "ava" }
    ],
    counterExamples: [
      { input: "a + e", output: "not aye", note: "This is vṛddhi in v1." },
      { input: "e + k", output: "not ayk", note: "The right side must be a vowel." }
    ]
  },
  ANUSVARA_M: {
    id: "ANUSVARA_M",
    family: "SANDHI_MERGE",
    sourceVersion: RULE_AUDIT_VERSION,
    name: "Anusvāra",
    sanskritName: "अनुस्वार",
    sutraRef: "v1 game rule",
    inputPattern: "m + consonant",
    outputPattern: "ṃ + consonant",
    constraints: ["Only implemented consonant sandhi in v1.", "Only applies when the level or mode enables ANUSVARA_M."],
    explanation: "A final m is represented as anusvāra before a following consonant.",
    examples: [
      { input: "am + ka", output: "aṃka" }
    ],
    counterExamples: [
      { input: "m + a", output: "not ṃa", note: "The right boundary must be consonantal." },
      { input: "n + k", output: "not ṃk", note: "This v1 rule is scoped to m only." }
    ]
  },
  METER_SEGMENT: {
    id: "METER_SEGMENT",
    family: "METER_MERGE",
    sourceVersion: RULE_AUDIT_VERSION,
    name: "Metrical Segment",
    sanskritName: "छन्दोभाग",
    inputPattern: "two word or pāda-prefix spans",
    outputPattern: "valid anuṣṭubh pāda prefix",
    constraints: ["Combined span must be at most eight syllables.", "Prefix must still satisfy pathyā-v1 constraints."],
    explanation: "Two metrical chunks can merge only if their combined laghu/guru span remains a valid prefix for at least one pāda slot.",
    examples: [
      { input: "ahiṃsā + paramo", output: "valid pāda prefix" }
    ],
    counterExamples: [
      { input: "span over 8 syllables", output: "rejected" },
      { input: "prefix with L L at positions 2-3", output: "rejected" }
    ]
  },
  METER_PADA: {
    id: "METER_PADA",
    family: "METER_MERGE",
    sourceVersion: RULE_AUDIT_VERSION,
    name: "Pāda",
    sanskritName: "पाद",
    inputPattern: "metrical prefix + word/segment",
    outputPattern: "complete 8-syllable pāda",
    constraints: ["Exactly eight syllables.", "Odd/even cadence must match the assigned pathyā pāda type."],
    explanation: "A full pāda tile is created only when the span is exactly eight syllables and passes the strict v1 anuṣṭubh template.",
    examples: [
      { input: "ahiṃsā + paramo + dharmaḥ", output: "PADA" }
    ],
    counterExamples: [
      { input: "eight syllables with wrong 5-7 cadence", output: "rejected" },
      { input: "seven syllables", output: "not PADA" }
    ]
  },
  METER_HEMISTICH: {
    id: "METER_HEMISTICH",
    family: "METER_MERGE",
    sourceVersion: RULE_AUDIT_VERSION,
    name: "Hemistich",
    sanskritName: "अर्धश्लोक",
    inputPattern: "pāda 1 + pāda 2 or pāda 3 + pāda 4",
    outputPattern: "hemistich",
    constraints: ["Only adjacent pāda pairs 1+2 and 3+4 merge."],
    explanation: "A hemistich is the two-pāda half of a śloka.",
    examples: [
      { input: "pāda 1 + pāda 2", output: "HEMISTICH" }
    ],
    counterExamples: [
      { input: "pāda 2 + pāda 3", output: "rejected" },
      { input: "pāda 1 + pāda 3", output: "rejected" }
    ]
  },
  METER_SHLOKA: {
    id: "METER_SHLOKA",
    family: "METER_MERGE",
    sourceVersion: RULE_AUDIT_VERSION,
    name: "Śloka",
    sanskritName: "श्लोक",
    inputPattern: "hemistich A + hemistich B",
    outputPattern: "complete śloka",
    constraints: ["Requires hemistich 1 followed by hemistich 2."],
    explanation: "Two ordered hemistichs merge into one complete four-pāda śloka.",
    examples: [
      { input: "hemistich A + hemistich B", output: "SHLOKA" }
    ],
    counterExamples: [
      { input: "hemistich B + hemistich A", output: "rejected" },
      { input: "pāda + hemistich", output: "rejected" }
    ]
  },
  METER_SHLOKA_STACK: {
    id: "METER_SHLOKA_STACK",
    family: "METER_MERGE",
    sourceVersion: RULE_AUDIT_VERSION,
    name: "Śloka Stack",
    sanskritName: "श्लोकसङ्ग्रह",
    inputPattern: "equal śloka counts",
    outputPattern: "doubled śloka stack",
    constraints: ["Only equal śloka counts merge, matching 2048-style stacking."],
    explanation: "Equal śloka tiles stack into a doubled śloka count.",
    examples: [
      { input: "1 śloka + 1 śloka", output: "2× śloka stack" }
    ],
    counterExamples: [
      { input: "1 śloka + 2 ślokas", output: "rejected" },
      { input: "hemistich + śloka", output: "rejected" }
    ]
  }
};

export function getRuleAuditSpec(ruleId: MergeRuleId) {
  return RULE_AUDIT_REGISTRY[ruleId];
}

export function buildMergeAudit({
  ruleId,
  mergeFamily,
  left,
  right,
  result,
  replacement
}: {
  ruleId: MergeRuleId;
  mergeFamily: "SANDHI_MERGE" | "METER_MERGE";
  left: Tile;
  right: Tile;
  result: Tile;
  replacement: Phoneme[];
}): MergeAudit {
  const spec = getRuleAuditSpec(ruleId);

  return {
    sourceVersion: spec.sourceVersion,
    ruleName: spec.name,
    sanskritName: spec.sanskritName,
    sutraRef: spec.sutraRef,
    inputPattern: spec.inputPattern,
    outputPattern: spec.outputPattern,
    constraints: [...spec.constraints],
    explanation: spec.explanation,
    examples: spec.examples.map(example => ({ ...example })),
    counterExamples: spec.counterExamples.map(example => ({ ...example })),
    applied: {
      leftSurface: left.surfaceIAST,
      rightSurface: right.surfaceIAST,
      resultSurface: result.surfaceIAST,
      resultKind: result.kind as TileKind,
      boundary: {
        left: left.rightBoundary,
        right: right.leftBoundary,
        replacement: [...replacement]
      },
      leftMeter: copyMeter(left.meter),
      rightMeter: copyMeter(right.meter),
      resultMeter: copyMeter(result.meter)
    }
  };
}

function copyMeter(meter: MetricalSpan | undefined): MetricalSpan | undefined {
  if (!meter) return undefined;
  return { ...meter, weights: [...meter.weights] };
}
