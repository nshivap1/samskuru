import type { MergeRuleId, MetricalSpan, Phoneme, PhonemeClass, TargetTileUse, Tile, TileKind } from "./types";

let tileCounter = 0;
const tileSessionPrefix = Math.random().toString(36).slice(2, 8);

export const A_CLASS = new Set<Phoneme>(["a", "ā"]);
export const I_CLASS = new Set<Phoneme>(["i", "ī"]);
export const U_CLASS = new Set<Phoneme>(["u", "ū"]);
export const R_CLASS = new Set<Phoneme>(["ṛ", "ṝ"]);
export const L_CLASS = new Set<Phoneme>(["ḷ"]);
export const EC = new Set<Phoneme>(["e", "o", "ai", "au"]);
export const VOWELS = new Set<Phoneme>([...A_CLASS, ...I_CLASS, ...U_CLASS, ...R_CLASS, ...L_CLASS, ...EC]);
export const CONSONANTS = new Set<Phoneme>([
  "k", "kh", "g", "gh", "ṅ",
  "c", "ch", "j", "jh", "ñ",
  "ṭ", "ṭh", "ḍ", "ḍh", "ṇ",
  "t", "th", "d", "dh", "n",
  "p", "ph", "b", "bh", "m",
  "y", "r", "l", "v",
  "ś", "ṣ", "s", "h"
]);

const DEVANAGARI_VOWELS: Record<string, string> = {
  a: "अ",
  ā: "आ",
  i: "इ",
  ī: "ई",
  u: "उ",
  ū: "ऊ",
  ṛ: "ऋ",
  ṝ: "ॠ",
  ḷ: "ऌ",
  e: "ए",
  o: "ओ",
  ai: "ऐ",
  au: "औ"
};

const DEVANAGARI_MATRAS: Record<string, string> = {
  a: "",
  ā: "ा",
  i: "ि",
  ī: "ी",
  u: "ु",
  ū: "ू",
  ṛ: "ृ",
  ṝ: "ॄ",
  ḷ: "ॢ",
  e: "े",
  o: "ो",
  ai: "ै",
  au: "ौ"
};

const DEVANAGARI_CONSONANTS: Record<string, string> = {
  k: "क",
  kh: "ख",
  g: "ग",
  gh: "घ",
  ṅ: "ङ",
  c: "च",
  ch: "छ",
  j: "ज",
  jh: "झ",
  ñ: "ञ",
  ṭ: "ट",
  ṭh: "ठ",
  ḍ: "ड",
  ḍh: "ढ",
  ṇ: "ण",
  t: "त",
  th: "थ",
  d: "द",
  dh: "ध",
  n: "न",
  p: "प",
  ph: "फ",
  b: "ब",
  bh: "भ",
  m: "म",
  y: "य",
  r: "र",
  l: "ल",
  v: "व",
  ś: "श",
  ṣ: "ष",
  s: "स",
  h: "ह",
};

export const PHONEME_TOKENS: Phoneme[] = [
  "ai", "au",
  "kh", "gh", "ch", "jh", "ṭh", "ḍh", "th", "dh", "ph", "bh",
  "ā", "ī", "ū", "ṛ", "ṝ", "ḷ",
  "a", "i", "u", "e", "o",
  "k", "g", "ṅ", "c", "j", "ñ", "ṭ", "ḍ", "ṇ", "t", "d", "n", "p", "b", "m",
  "y", "r", "l", "v", "ś", "ṣ", "s", "h", "ṃ", "ḥ"
];

export const SUPPORTED_PHONEMES = new Set<Phoneme>(PHONEME_TOKENS);

export function resetTileIdsForTests() {
  tileCounter = 0;
}

export function createTileId(prefix = "tile") {
  tileCounter += 1;
  return `${prefix}-${tileSessionPrefix}-${tileCounter.toString(36)}`;
}

export function surfaceIAST(phonemes: readonly Phoneme[]) {
  return phonemes.join("");
}

export function parseSurfaceToPhonemes(surface: string): Phoneme[] {
  const phonemes: Phoneme[] = [];
  let index = 0;

  while (index < surface.length) {
    const token = PHONEME_TOKENS.find(candidate => surface.startsWith(candidate, index));
    if (!token) {
      throw new Error(`Cannot parse IAST surface: ${surface}`);
    }
    phonemes.push(token);
    index += token.length;
  }

  return phonemes;
}

export function surfaceDeva(phonemes: readonly Phoneme[]) {
  let output = "";

  for (let i = 0; i < phonemes.length; i += 1) {
    const current = phonemes[i];
    const next = phonemes[i + 1];

    if (current === "ṃ") {
      output += "ं";
      continue;
    }

    if (current === "ḥ") {
      output += "ः";
      continue;
    }

    if (CONSONANTS.has(current)) {
      output += DEVANAGARI_CONSONANTS[current] ?? current;

      if (next && VOWELS.has(next)) {
        output += DEVANAGARI_MATRAS[next] ?? "";
        i += 1;
      } else if (next && CONSONANTS.has(next)) {
        output += "्";
      } else if (!next) {
        output += "्";
      }

      continue;
    }

    if (VOWELS.has(current)) {
      output += DEVANAGARI_VOWELS[current] ?? current;
      continue;
    }

    output += current;
  }

  return output;
}

export function phonemeClass(phoneme: Phoneme): PhonemeClass {
  if (A_CLASS.has(phoneme)) return "A";
  if (I_CLASS.has(phoneme)) return "I";
  if (U_CLASS.has(phoneme)) return "U";
  if (R_CLASS.has(phoneme)) return "R";
  if (EC.has(phoneme)) return "EC";
  if (CONSONANTS.has(phoneme)) return "CONSONANT";
  return "OTHER";
}

export function graphemeClusters(text: string) {
  const Segmenter = Intl.Segmenter;
  if (Segmenter) {
    return Array.from(new Segmenter("sa", { granularity: "grapheme" }).segment(text), part => part.segment);
  }

  return Array.from(text);
}

export function compactTileLabel(label: string) {
  const clusters = graphemeClusters(label);
  if (clusters.length <= 6) return label;
  return `${clusters.slice(0, 5).join("")}…`;
}

export function makeTileFromPhonemes(
  phonemes: Phoneme[],
  options: {
    id?: string;
    mass?: number;
    depth?: number;
    originRule?: MergeRuleId | null;
    kind?: TileKind;
    compactLabel?: string;
    meter?: MetricalSpan;
    targetUses?: TargetTileUse[];
    sourceTargetUses?: TargetTileUse[];
    parents?: string[];
  } = {}
): Tile {
  const leftBoundary = phonemes[0];
  const rightBoundary = phonemes[phonemes.length - 1];
  const iast = surfaceIAST(phonemes);
  const deva = surfaceDeva(phonemes);
  const originRule = options.originRule ?? null;
  const mass = options.mass ?? 1;
  const depth = options.depth ?? 0;

  return {
    id: options.id ?? createTileId(),
    kind: options.kind ?? "PHONEME",
    phonemes,
    surfaceIAST: iast,
    surfaceDeva: deva,
    compactLabel: options.compactLabel,
    leftBoundary,
    rightBoundary,
    mass,
    depth,
    originRule,
    parents: options.parents ?? [],
    classSignature: {
      left: phonemeClass(leftBoundary),
      right: phonemeClass(rightBoundary)
    },
    meter: options.meter ? { ...options.meter, weights: [...options.meter.weights] } : undefined,
    targetUses: options.targetUses?.map(use => ({ ...use })),
    sourceTargetUses: options.sourceTargetUses?.map(use => ({ ...use })),
    accessibleLabel: `Tile ${options.compactLabel ?? iast}. Left boundary ${leftBoundary}, right boundary ${rightBoundary}. Last rule ${originRule ?? "none"}. Mass ${mass}. Depth ${depth}.`
  };
}

export function cloneTile(tile: Tile): Tile {
  return {
    ...tile,
    phonemes: [...tile.phonemes],
    parents: [...tile.parents],
    classSignature: { ...tile.classSignature },
    meter: tile.meter ? { ...tile.meter, weights: [...tile.meter.weights] } : undefined,
    targetUses: tile.targetUses?.map(use => ({ ...use })),
    sourceTargetUses: tile.sourceTargetUses?.map(use => ({ ...use }))
  };
}
