import { makeTileFromPhonemes, parseSurfaceToPhonemes, surfaceDeva } from "../phonemes";
import type { Board, MetricalSpan, Phoneme, SyllableWeight, Tile } from "../types";
import { createEmptyBoard } from "../board";
import { spanFromWeights } from "./anustubh";

export type MeterWordSeed = {
  id: string;
  iast: string;
  deva: string;
  weights: SyllableWeight[];
  phonemes: Phoneme[];
};

export const ANUSTUBH_WORD_SEEDS: MeterWordSeed[] = [
  seed("ahiṃsā", ["L", "G", "G"]),
  seed("paramo", ["L", "L", "G"]),
  seed("dharmaḥ", ["G", "G"]),
  seed("satyaṃ", ["G", "G"]),
  seed("vada", ["L", "L"]),
  seed("nityam", ["G", "G"]),
  seed("śuddhaṃ", ["G", "G"]),
  seed("manaḥ", ["L", "G"])
];

export function makeWordTile(id: string, tileId?: string): Tile {
  const word = ANUSTUBH_WORD_SEEDS.find(seedEntry => seedEntry.id === id || seedEntry.iast === id);
  if (!word) throw new Error(`Unknown metrical word seed: ${id}`);

  return makeTileFromPhonemes([...word.phonemes], {
    id: tileId,
    kind: "WORD_SEGMENT",
    compactLabel: word.deva,
    meter: spanFromWeights([...word.weights])
  });
}

export function makePadaTile(padaIndex: 1 | 2 | 3 | 4, tileId?: string): Tile {
  const weights: SyllableWeight[] =
    padaIndex === 1 || padaIndex === 3
      ? ["L", "G", "G", "L", "L", "G", "G", "G"]
      : ["L", "G", "G", "G", "L", "G", "L", "G"];

  return makeTileFromPhonemes(["p", "a", "d", "a"], {
    id: tileId,
    kind: "PADA",
    compactLabel: `पाद ${padaIndex}`,
    meter: spanFromWeights(weights, padaIndex),
    originRule: "METER_PADA",
    mass: 3,
    depth: 2
  });
}

export function makeShlokaTile(tileId?: string): Tile {
  const padas = [1, 2, 3, 4].map(index => makePadaTile(index as 1 | 2 | 3 | 4));
  return makeTileFromPhonemes(padas.flatMap(tile => tile.phonemes), {
    id: tileId,
    kind: "SHLOKA",
    compactLabel: "श्लोकः",
    meter: { weights: padas.flatMap(tile => tile.meter!.weights), syllableCount: 32, shlokaCount: 1 },
    originRule: "METER_SHLOKA",
    parents: padas.map(tile => tile.id),
    mass: padas.reduce((sum, tile) => sum + tile.mass, 0),
    depth: 1 + Math.max(...padas.map(tile => tile.depth))
  });
}

export function initialAnustubhBoard(): Board {
  const board = createEmptyBoard();
  board[0][0] = makeWordTile("ahiṃsā", "anustubh-word-1");
  board[0][1] = makeWordTile("paramo", "anustubh-word-2");
  board[0][2] = makeWordTile("dharmaḥ", "anustubh-word-3");
  board[1][0] = makeWordTile("satyaṃ", "anustubh-word-4");
  board[1][1] = makeWordTile("vada", "anustubh-word-5");
  board[1][2] = makeWordTile("nityam", "anustubh-word-6");
  return board;
}

function seed(iast: string, weights: SyllableWeight[]): MeterWordSeed {
  const phonemes = parseSurfaceToPhonemes(iast);
  return { id: iast, iast, deva: surfaceDeva(phonemes), weights, phonemes };
}

export function spanLabel(span: MetricalSpan) {
  return span.weights.join("");
}
