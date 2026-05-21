# Sandhi 2048 — PRD v5: Target-Driven Endless Sandhi

**Working title:** संस्कुरु  
**IAST title subtext:** saṃskuru  
**Tagline:** सम्यक् कुरु। संस्कृतं साधय।  
**Target platform:** mobile-first web app  
**Primary stack:** React + TypeScript + Tailwind CSS + Framer Motion or hand-rolled CSS transitions  
**Product thesis:** a fast 2048-style Sanskrit game where sandhi is the merge physics, curated word targets create purpose, and meter/shloka construction becomes the long-run progression system.

---

## 0. What changed in v5

This PRD supersedes previous v3/v4 guidance where it discusses deterministic levels, level packs, level completion, free play, chandas, spawn logic, and scoring.

### Remove

- Remove deterministic Level Mode from the product experience.
- Remove level dropdowns, level unlocks, move budgets, expected solutions, and "Next Level" flows.
- Remove JSON level-pack intake as the primary content pipeline.
- Remove arbitrary or generic references to “Chandas Practice.”
- Do not present free play as a vague meter sandbox.
- Do not generate random pseudo-Sanskrit or arbitrary syllable strings as a product-facing experience.
- Do not treat chandas as a decorative score bonus.

### Add

- Add one default **Target-Driven Endless Mode**.
- Maintain **3 visible active word targets** at a time, backed by a queue of 8-12 upcoming targets.
- Every target must come from a curated, source-traced, human-reviewable target pack.
- Every target must include at least one engine-verified build path using the same sandhi rule engine used during play.
- Spawn logic must be **target-aware**, drawing from the active targets' verified paths and board state rather than from a generic syllable inventory.
- Spawns must be target-fair: prefer active target frontier tiles, allow near-future queued target tiles only when active frontier candidates are exhausted, and never introduce a tile with no active or near-future target provenance.
- When a target word is created, award completion points, clear that tile, refill the active target slot, and continue the run.
- Add a later-compatible long-run progression:
  - **akṣara / syllable**
  - **word / segment**
  - **pāda**
  - **ardha-śloka / hemistich**
  - **śloka**
  - **2× śloka stack**
  - **4× śloka stack**
  - **8× śloka stack**
- Add consonant-bearing syllables and word chunks into endless spawn inventory.
- Keep consonant sandhi narrow in v1: consonants are allowed in tiles and metrical chunks, but the only implemented consonant sandhi remains `ANUSVARA_M` unless explicitly expanded later.
- Add automated target-pack validation and seeded run simulation before a pack can ship.

---

## 1. AI coding tool instruction block

Build a mobile-first React + TypeScript prototype of **संस्कुरु**, a 2048-style Sanskrit sandhi game.

Non-negotiables:

1. Keep the v3 mobile feel:
   - swipe-first board;
   - no default on-screen direction pad;
   - 100dvh shell;
   - input queue max depth 3;
   - smooth 2048 slide → collide → pop animation.
2. Keep v3 typography safeguards:
   - Devanagari default;
   - one general **Script** setting for Samskritam text, with Devanagari and IAST options;
   - the Script setting applies consistently to board tiles, active targets, rule examples, action-log Sanskrit surfaces, selected-tile Sanskrit surfaces, and move feedback;
   - minimum tile font size 16px;
   - compact labels for long metrical objects;
   - no Sanskrit hyphenation or wrapping.
3. Replace deterministic Level Mode with one default **Target-Driven Endless Mode**:
   - no level list;
   - no level unlocks;
   - no move budgets;
   - no expected-solution puzzles;
   - unlimited undo;
   - action log;
   - persistent score, high score, completed target history, and current run snapshot.
4. Replace the old “Chandas Practice” concept with target-driven endless play.
5. Implement two merge families:
   - `SANDHI_MERGE`: phonological boundary rewrite.
   - `METER_MERGE`: metrical assembly into valid anuṣṭubh objects.
6. Add curated target packs as the primary content source.
7. Each target must include at least one verified build path. The validator must recompute each path using the production merge engine.
8. Endless Mode must support 1-2 syllable akṣara chunks, word chunks, and longer known-word chunks where needed by verified target paths.
9. Endless Mode must not use pure random spawn. Use **Target-Aware Smart Spawn**.
10. Endless Mode scoring must strongly reward:
   - valid sandhi;
   - valid word target completion;
   - target streaks;
   - valid word/segment assembly;
   - valid 8-syllable pāda;
   - valid odd/even anuṣṭubh cadence;
   - hemistich completion;
   - śloka completion;
   - śloka stacking.
11. Sandhi and chandas rules must be human auditable:
   - maintain a versioned rule registry separate from UI components;
   - each rule must include rule id, family, Sanskrit/IAST name, source/reference note, input/output patterns, constraints, explanation, examples, and counterexamples;
   - every merge event must include a structured audit trace showing the applied rule, source version, tile surfaces, boundary or meter data, result kind, and human-readable explanation;
   - tests must fail when a merge-capable rule lacks audit metadata or when merge events omit audit traces.
12. Target packs must be human auditable:
   - every target includes source trace and review metadata;
   - every target includes `buildPaths`;
   - every build path lists chunks, ordered merge steps, expected intermediate surfaces, and required rules;
   - validator errors must be specific enough for an AI agent or human expert to repair the pack.

---

## 2. Research-grounded anuṣṭubh model

### 2.1 What the product should encode

An anuṣṭubh stanza has four pādas of eight syllables each, i.e. 32 syllables total. In classical Sanskrit, anuṣṭubh develops into the śloka, the dominant epic verse form. This is the correct long-run progression target for a Sanskrit 2048 game: the player should build from small syllabic chunks toward padas, verses, and stacks of verses.

### 2.2 Laghu/guru syllable weight rules

Implement a deterministic `scanSyllableWeight()` function:

| Rule | Weight |
|---|---|
| Short vowel followed by at most one consonant before next vowel | `LAGHU` |
| Long vowel or diphthong | `GURU` |
| Short vowel followed by consonant cluster | `GURU` |
| Syllable containing anusvāra `ṃ` | `GURU` |
| Syllable containing visarga `ḥ` | `GURU` |
| Final syllable of a pāda | `ANCEPS` for matching; natural weight still stored |

Short vowels for v1:

```ts
const SHORT_VOWELS = ["a", "i", "u", "ṛ", "ḷ"];
```

Long/diphthong vowels for v1:

```ts
const LONG_OR_DIPHTHONG_VOWELS = ["ā", "ī", "ū", "ṝ", "e", "ai", "o", "au"];
```

### 2.3 V1 anuṣṭubh / śloka constraints

Do **not** attempt full vipulā classification in v1. Implement a playable, strict, pathyā-oriented model first.

Each pāda has eight syllables:

```ts
type SyllableWeight = "L" | "G" | "X"; // X = anceps/flexible final slot
```

Universal checks:

1. A pāda must have exactly 8 syllables to become a `PADA` tile.
2. Syllables 2–3 may not both be laghu: `L L` is invalid at positions 2–3.
3. Even pādas — pāda 2 and pāda 4 — may not have `G L G` at positions 2–4.
4. Position 8 is anceps: any natural weight may fill it.
5. Prefix validation must be used while building partial padas, not only at completion.

V1 pathyā-style cadence templates:

```ts
const ANUSTUBH_PATHYA_PATTERNS = {
  // Positions: 1 2 3 4 5 6 7 8
  ODD_PADA:  ["X", "X", "X", "X", "L", "G", "G", "X"], // padas 1 and 3
  EVEN_PADA: ["X", "X", "X", "X", "L", "G", "L", "X"]  // padas 2 and 4
} as const;
```

Interpretation:

- Pādas 1 and 3 are **odd cadence**: positions 5–7 prefer `L G G`.
- Pādas 2 and 4 are **even cadence**: positions 5–7 prefer `L G L`.
- The first four syllables remain relatively flexible, subject to the universal constraints.
- V1 treats this as a strict game rule for clarity, even though historical śloka admits vipulā variations.

### 2.4 Deferred vipulā support

Later versions may add:

- `na-vipulā`
- `bha-vipulā`
- `ma-vipulā`
- `ra-vipulā`
- looser epic anuṣṭubh variants
- fuzzy metrical matching

Do not add these until the base pathyā loop is fun and the scansion engine is stable.

---

## 3. Core tile model

### 3.1 Tile kinds

```ts
type TileKind =
  | "PHONEME"
  | "AKSHARA"
  | "WORD_SEGMENT"
  | "PADA_SEGMENT"
  | "PADA"
  | "HEMISTICH"
  | "SHLOKA"
  | "SHLOKA_STACK";
```

### 3.2 Extended tile schema

```ts
type Tile = {
  id: string;
  kind: TileKind;

  // Existing sandhi model
  phonemes: Phoneme[];
  surfaceIAST: string;
  surfaceDeva: string;
  leftBoundary: Phoneme;
  rightBoundary: Phoneme;
  mass: number;
  depth: number;
  originRule: RuleId | MeterRuleId | null;
  parents: string[];

  // New metrical model
  meter?: MetricalSpan;
  lexicalStatus?: "atomic" | "known-word" | "phrase-fragment" | "meter-object";
  compactLabel?: string;
  fullTextIAST?: string;
  fullTextDeva?: string;

  // Rendering
  accessibleLabel: string;
};
```

### 3.3 Metrical span

```ts
type PadaIndex = 1 | 2 | 3 | 4;
type PadaParity = "odd" | "even";

type Syllable = {
  id: string;
  iast: string;
  deva: string;
  phonemes: Phoneme[];
  naturalWeight: "L" | "G";
  displayWeight: "L" | "G" | "X";
};

type MetricalSpan = {
  meterId: "ANUSTUBH_PATHYA_V1";
  syllables: Syllable[];
  syllableCount: number;
  weightPattern: Array<"L" | "G" | "X">;

  // For partial tiles, this is a compatibility mask.
  possiblePadaIndices: PadaIndex[];

  // For completed padas and larger objects.
  assignedPadaIndex?: PadaIndex;
  padaParity?: PadaParity;

  isPrefixValid: boolean;
  isCompletePada: boolean;
  isCompleteHemistich: boolean;
  isCompleteShloka: boolean;
};
```

---

## 4. Merge families

The game now has two merge families. They share the same 2048 movement system and one-merge-per-output-per-move constraint.

Merge input order must match the player-facing mechanics:

- Horizontal swipes always evaluate adjacent tiles in left-to-right order. A row pair that is valid as `A + B` remains valid whether the player swipes left or right; `B + A` is not implied by swiping the opposite direction.
- Vertical swipes are flexible because there is no equally natural Sanskrit column reading order in the game surface. Adjacent vertical tiles may merge if either top + bottom or bottom + top is valid. If both orders are valid, a visible active target completion or active-target intermediate wins; otherwise pushed-tile order decides: swipe up prefers lower + upper, and swipe down prefers upper + lower.
- Merge events and audit traces must record the evaluated Sanskrit input order, not merely the visual destination cell or survivor tile id.

### 4.1 `SANDHI_MERGE`

This is the existing phonological merge.

Example:

```text
na + i → ne
ne + a → naya
am + ka → aṃka
su + asti → svasti
```

Active v1 sandhi rules:

```ts
type RuleId =
  | "SAVARNA_DIRGHA"
  | "GUNA"
  | "VRDDHI"
  | "YAN"
  | "AYAVA"
  | "ANUSVARA_M";
```

### 4.2 `METER_MERGE`

This is the new progression unlock.

`METER_MERGE` joins two tiles if the concatenated syllable sequence can still become a valid anuṣṭubh pāda, hemistich, śloka, or śloka stack.

Examples:

```text
[ahiṃsā] + [paramo] + [dharmaḥ] → PADA 1
[PADA 1] + [PADA 2] → HEMISTICH A
[HEMISTICH A] + [HEMISTICH B] → SHLOKA
[SHLOKA x1] + [SHLOKA x1] → SHLOKA x2
[SHLOKA x2] + [SHLOKA x2] → SHLOKA x4
```

### 4.3 Merge resolver priority

The resolver should prefer sandhi when a real boundary rewrite exists. If no sandhi rewrite is possible, it may attempt a metrical join.

```ts
type MergeKind = "SANDHI_MERGE" | "METER_MERGE";

type MergePlan = {
  kind: MergeKind;
  resultTile: Tile;
  events: MergeEvent[];
  scoreDelta: number;
};

function resolveTileMerge(
  frontTile: Tile,
  backTile: Tile,
  ctx: MergeContext
): MergePlan | null {
  const sandhi = trySandhiMerge(frontTile, backTile, ctx.activeRules);
  if (sandhi && meterAllowsResult(sandhi.resultTile, ctx)) return sandhi;

  const meter = tryMeterMerge(frontTile, backTile, ctx.meterProfile);
  if (meter) return meter;

  return null;
}
```

### 4.4 Meter join rules

```ts
function tryMeterMerge(
  frontTile: Tile,
  backTile: Tile,
  profile: MeterProfile
): MergePlan | null {
  // PADA + PADA → HEMISTICH
  if (frontTile.kind === "PADA" && backTile.kind === "PADA") {
    return tryHemistichMerge(frontTile, backTile, profile);
  }

  // HEMISTICH + HEMISTICH → SHLOKA
  if (frontTile.kind === "HEMISTICH" && backTile.kind === "HEMISTICH") {
    return tryShlokaMerge(frontTile, backTile, profile);
  }

  // SHLOKA + SHLOKA or equal SHLOKA_STACK + equal SHLOKA_STACK
  if (canStackShlokas(frontTile, backTile)) {
    return mergeShlokaStacks(frontTile, backTile);
  }

  // Otherwise try to build a partial or complete PADA.
  return tryPadaSegmentMerge(frontTile, backTile, profile);
}
```

### 4.5 Pāda segment merge

Two non-pāda metrical spans may merge if:

1. total syllable count ≤ 8;
2. concatenated pattern is prefix-valid for at least one possible pāda index;
3. the two tiles share at least one compatible `possiblePadaIndex`;
4. the join does not create a known-invalid universal pattern;
5. if the result reaches 8 syllables, it passes completed-pāda validation.

```ts
function tryPadaSegmentMerge(
  left: Tile,
  right: Tile,
  profile: MeterProfile
): MergePlan | null {
  const combined = concatMetricalSpans(left.meter, right.meter);
  if (combined.syllableCount > 8) return null;

  const possiblePadaIndices = intersect(
    left.meter?.possiblePadaIndices ?? [1, 2, 3, 4],
    right.meter?.possiblePadaIndices ?? [1, 2, 3, 4]
  );

  const validIndices = possiblePadaIndices.filter(index =>
    validateAnustubhPrefix(combined, index, profile)
  );

  if (validIndices.length === 0) return null;

  if (combined.syllableCount === 8) {
    const assigned = chooseBestPadaIndex(validIndices, profile);
    if (!validateCompletePada(combined, assigned, profile)) return null;
    return buildPadaTile(left, right, combined, assigned);
  }

  return buildPadaSegmentTile(left, right, combined, validIndices);
}
```

---

## 5. Anuṣṭubh validation

### 5.1 Prefix validation

Prefix validation prevents the player from building doomed segments.

```ts
function validateAnustubhPrefix(
  span: MetricalSpan,
  padaIndex: PadaIndex,
  profile: MeterProfile
): boolean {
  const pattern = getPatternForPada(padaIndex, profile);
  const weights = span.weightPattern;
  const n = weights.length;

  if (n > 8) return false;

  // Universal constraint: positions 2–3 cannot be L L.
  if (n >= 3 && weights[1] === "L" && weights[2] === "L") return false;

  // Even-pada constraint: positions 2–4 cannot be G L G.
  if ((padaIndex === 2 || padaIndex === 4) && n >= 4) {
    if (weights[1] === "G" && weights[2] === "L" && weights[3] === "G") return false;
  }

  for (let i = 0; i < n; i++) {
    const required = pattern[i];
    if (required === "X") continue;
    if (weights[i] !== required) return false;
  }

  return true;
}
```

### 5.2 Completed pāda validation

```ts
function validateCompletePada(
  span: MetricalSpan,
  padaIndex: PadaIndex,
  profile: MeterProfile
): boolean {
  if (span.syllableCount !== 8) return false;
  return validateAnustubhPrefix(span, padaIndex, profile);
}
```

### 5.3 Hemistich and śloka validation

```ts
function tryHemistichMerge(padaA: Tile, padaB: Tile, profile: MeterProfile): MergePlan | null {
  const a = padaA.meter?.assignedPadaIndex;
  const b = padaB.meter?.assignedPadaIndex;

  const valid =
    (a === 1 && b === 2) ||
    (a === 3 && b === 4);

  if (!valid) return null;

  return buildHemistichTile(padaA, padaB);
}

function tryShlokaMerge(hemA: Tile, hemB: Tile, profile: MeterProfile): MergePlan | null {
  if (!isHemistichA(hemA) || !isHemistichB(hemB)) return null;
  return buildShlokaTile(hemA, hemB);
}
```

### 5.4 Śloka stacking

This is the 2048 unlock.

```ts
type ShlokaStackMeta = {
  meterId: "ANUSTUBH_PATHYA_V1";
  shlokaCount: number; // 1, 2, 4, 8, 16...
  themes: string[];
};

function canStackShlokas(a: Tile, b: Tile): boolean {
  if (!isShlokaOrStack(a) || !isShlokaOrStack(b)) return false;
  if (a.meter?.meterId !== b.meter?.meterId) return false;

  const countA = getShlokaCount(a);
  const countB = getShlokaCount(b);

  return countA === countB;
}

function mergeShlokaStacks(a: Tile, b: Tile): MergePlan {
  const count = getShlokaCount(a) + getShlokaCount(b);
  return {
    kind: "METER_MERGE",
    resultTile: makeShlokaStackTile(a, b, count),
    events: [makeMeterEvent("SHLOKA_STACK", a, b)],
    scoreDelta: scoreShlokaStack(count)
  };
}
```

Board face labels:

| Object | Board label |
|---|---|
| Partial segment | `3/8` plus short surface |
| Complete pāda | `पाद १ · 8` |
| Hemistich | `अर्ध १ · 16` |
| Śloka | `श्लोक · 1` |
| Stack | `श्लोक ×2`, `श्लोक ×4`, `श्लोक ×8` |

Long text is shown in the log/detail drawer, not on the tile face.

---

## 6. Visual style for metrical mergeability

### 6.1 Weight styles

Color must be paired with a non-color indicator.

| Weight | Color cue | Shape cue | Label |
|---|---|---|---|
| Laghu | light saffron | open crescent | `⏑` |
| Guru | deep brown/gold | solid bar | `–` |
| Anceps | neutral parchment | diamond | `×` |

### 6.2 Pāda slot styles

| Slot | Cadence | Style | Non-color cue |
|---|---|---|---|
| Pāda 1 | odd cadence | saffron edge | one notch |
| Pāda 2 | even cadence | tulsi edge | two notches |
| Pāda 3 | odd cadence | saffron double edge | three notches |
| Pāda 4 | even cadence | tulsi double edge | four notches |

### 6.3 Merge hint overlay

When the player taps Hint in Target-Driven Endless Mode:

1. Highlight target-advancing sandhi pairs first.
2. Highlight other sandhi-mergeable pairs second.
3. Highlight meter-mergeable pairs when meter targets are active.
4. On a second Hint tap for the same board state, suggest a swipe direction ranked by:
   - completing an active target;
   - creating a verified intermediate for an active target;
   - creating a missing-partner setup for an active target;
   - helping a queued target;
   - otherwise, highest legal merge count and score.
5. Hint feedback must remain visible even after prior moves have populated the action log.
6. For meter merges, show a tiny pattern preview:
   - `⏑ – – ×`
   - `5/8`
   - `fits pāda 1/3`
7. Never put long explanations over the board.
8. Put full explanation in the action log.
9. If the only available merges are generic legal sandhi, do not describe them as target-advancing. The feedback should explicitly say that no target-advancing merge is available and that the highlighted merge is merely legal/off-target.

### 6.4 Mechanics access and copy

Mechanics must be available from the main screen without cluttering the play surface. Use a single info-icon button in the top action area to open the existing bottom sheet directly to Mechanics. In the expanded sheet, the Mechanics tab must also use the info icon.

Mechanics copy should be short and player-facing:

1. Rows read left to right: horizontal sandhi order is left-to-right, whether the player swipes left or right.
2. Columns are flexible: vertical neighbors can merge in either order. Visible targets win; otherwise the swipe direction decides.
3. Legal sandhi can still create off-target fragments.
4. Off-target fragments are part of the 2048 challenge and can clog the board.
5. Completed visible targets score, clear, and refill.
6. Completing targets can remove off-target sandhi fragments only when every target represented by their source fragments has also been completed.

---

## 7. Target-Aware Smart Spawn

### 7.1 Why ordinary smart spawn is not enough

The v3 smart spawn only guaranteed that a new phoneme had a possible sandhi partner. For Target-Driven Endless Mode, that is insufficient: the new tile must support at least one active target's verified build path, and preferably also support future metrical progression toward pādas and ślokas.

The spawner must answer four questions before placing a tile:

1. Which active target can this tile help complete?
2. Which verified build path does this tile belong to?
3. Does the board still have a plausible path to at least one active target after this spawn?
4. If the tile does not help an active target, is it tied to a near-future queued target within the configured lookahead?

If a candidate cannot be tied to an active target path, a useful intermediate on that path, a near-future queued target path, or a documented target-provenance failsafe, it should not spawn.

### 7.2 Active target model

The game should show **3 active targets** at a time. This gives the player meaningful choice without overwhelming the mobile target card. Internally, the run may maintain 8-12 queued targets so replacements are instant.

The UI must only show the active targets and direct play controls. Source trace, review status, and approval state remain audit metadata and must not appear as player-facing badges.

Opening runs must not be one-swipe target-completion puzzles. The initial board may seed first chunks from active target paths, but it must not seed every required partner for an active target in a layout where any first swipe can complete that target. Automated tests must simulate all four opening swipes and assert that no target completion is awarded before target-aware spawns have introduced missing partners during play.

```ts
type ActiveTarget = {
  targetId: string;
  targetIAST: string;
  targetDeva: string;
  gloss?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  conceptTags: string[];
  allowedRules: RuleId[];
  buildPaths: VerifiedBuildPath[];
  state: "active" | "completed" | "replaced";
};

type VerifiedBuildPath = {
  pathId: string;
  chunks: string[];
  steps: Array<{
    left: string;
    right: string;
    result: string;
    ruleId: RuleId;
  }>;
};
```

### 7.3 Target frontier

The engine should maintain a **target frontier**: the set of chunks, partners, and intermediate surfaces that can still advance an active target.

Examples:

```text
devarṣi = deva + ṛṣi
frontier: deva, ṛṣi, devarṣi

ityuktam = iti + uktam
frontier: iti, uktam, ityuktam

tathaiva = tathā + eva
frontier: tathā, eva, tathaiva
```

The frontier changes after every move:

- if `deva` is on the board, `ṛṣi` becomes higher priority;
- if `ṛṣi` is on the board, `deva` becomes higher priority;
- if an intermediate surface exists, its next partner becomes higher priority;
- if a target has just been completed, remove its frontier and add the replacement target's frontier.

### 7.4 Spawn candidate inventory

Do not spawn random bare consonants as product-facing units. Spawn 1-2 syllable **akṣara** and **word chunks** from active targets' verified paths, plus a small failsafe inventory with known syllable weights.

V1 spawn inventory includes:

```ts
const ENDLESS_AKSHARA_INVENTORY: AksharaSeed[] = [
  // light open syllables
  { iast: "ya", deva: "य", weight: "L", phonemes: ["y", "a"] },
  { iast: "ta", deva: "त", weight: "L", phonemes: ["t", "a"] },
  { iast: "pa", deva: "प", weight: "L", phonemes: ["p", "a"] },
  { iast: "ra", deva: "र", weight: "L", phonemes: ["r", "a"] },
  { iast: "su", deva: "सु", weight: "L", phonemes: ["s", "u"] },
  { iast: "khi", deva: "खि", weight: "L", phonemes: ["kh", "i"] },

  // heavy syllables
  { iast: "to", deva: "तो", weight: "G", phonemes: ["t", "o"] },
  { iast: "dhar", deva: "धर्", weight: "G", phonemes: ["dh", "a", "r"] },
  { iast: "maḥ", deva: "मः", weight: "G", phonemes: ["m", "a", "ḥ"] },
  { iast: "hiṃ", deva: "हिं", weight: "G", phonemes: ["h", "i", "ṃ"] },
  { iast: "sā", deva: "सा", weight: "G", phonemes: ["s", "ā"] },
  { iast: "mo", deva: "मो", weight: "G", phonemes: ["m", "o"] },
  { iast: "kṣa", deva: "क्ष", weight: "G", phonemes: ["k", "ṣ", "a"] },
  { iast: "jayaḥ", deva: "जयः", weightPattern: ["L", "G"], phonemes: ["j", "a", "y", "a", "ḥ"] }
];
```

V1 word/segment inventory includes curated, scansion-labeled units:

```ts
const ANUSTUBH_WORD_SEEDS: WordSeed[] = [
  {
    iast: "ahiṃsā",
    deva: "अहिंसा",
    syllables: [
      { iast: "a", weight: "L" },
      { iast: "hiṃ", weight: "G" },
      { iast: "sā", weight: "G" }
    ],
    possiblePadaIndices: [1, 3]
  },
  {
    iast: "paramo",
    deva: "परमो",
    syllables: [
      { iast: "pa", weight: "L" },
      { iast: "ra", weight: "L" },
      { iast: "mo", weight: "G" }
    ],
    possiblePadaIndices: [1, 2, 3, 4]
  },
  {
    iast: "dharmaḥ",
    deva: "धर्मः",
    syllables: [
      { iast: "dhar", weight: "G" },
      { iast: "maḥ", weight: "G" }
    ],
    possiblePadaIndices: [1, 3]
  },
  {
    iast: "yato",
    deva: "यतो",
    syllables: [
      { iast: "ya", weight: "L" },
      { iast: "to", weight: "G" }
    ],
    possiblePadaIndices: [2, 4]
  },
  {
    iast: "dharmas",
    deva: "धर्मस्",
    syllables: [
      { iast: "dhar", weight: "G" },
      { iast: "mas", weight: "G" }
    ],
    possiblePadaIndices: [2, 4]
  },
  {
    iast: "tato",
    deva: "ततो",
    syllables: [
      { iast: "ta", weight: "L" },
      { iast: "to", weight: "G" }
    ],
    possiblePadaIndices: [2, 4]
  },
  {
    iast: "jayaḥ",
    deva: "जयः",
    syllables: [
      { iast: "ja", weight: "L" },
      { iast: "yaḥ", weight: "G" }
    ],
    possiblePadaIndices: [2, 4]
  },
  {
    iast: "dharmo",
    deva: "धर्मो",
    syllables: [
      { iast: "dhar", weight: "G" },
      { iast: "mo", weight: "G" }
    ],
    possiblePadaIndices: [2, 4]
  },
  {
    iast: "rakṣati",
    deva: "रक्षति",
    syllables: [
      { iast: "rak", weight: "G" },
      { iast: "ṣa", weight: "L" },
      { iast: "ti", weight: "L" }
    ],
    possiblePadaIndices: [2, 4]
  },
  {
    iast: "rakṣitaḥ",
    deva: "रक्षितः",
    syllables: [
      { iast: "rak", weight: "G" },
      { iast: "ṣi", weight: "L" },
      { iast: "taḥ", weight: "G" }
    ],
    possiblePadaIndices: [2, 4]
  }
];
```

### 7.5 Target pāda examples

V1 should include curated target examples for scoring and validation.

```ts
const ANUSTUBH_TARGET_PADAS: TargetPada[] = [
  {
    id: "pada_ahimsa_paramo_dharmah",
    iast: "ahiṃsā paramo dharmaḥ",
    deva: "अहिंसा परमो धर्मः",
    syllableCount: 8,
    weightPattern: ["L", "G", "G", "L", "L", "G", "G", "G"],
    preferredPadaIndices: [1, 3]
  },
  {
    id: "pada_yato_dharmas_tato_jayah",
    iast: "yato dharmas tato jayaḥ",
    deva: "यतो धर्मस् ततो जयः",
    syllableCount: 8,
    weightPattern: ["L", "G", "G", "G", "L", "G", "L", "G"],
    preferredPadaIndices: [2, 4]
  },
  {
    id: "pada_dharmo_rakshati_rakshitah",
    iast: "dharmo rakṣati rakṣitaḥ",
    deva: "धर्मो रक्षति रक्षितः",
    syllableCount: 8,
    weightPattern: ["G", "G", "G", "L", "L", "G", "L", "G"],
    preferredPadaIndices: [2, 4]
  }
];
```

Note: these are **scoring targets**, not a claim that all possible Sanskrit phrases are generated. The game must prefer curated known phrases and meter-valid chunks.

### 7.6 Spawn algorithm

```ts
function spawnTargetAwareTile(
  board: Board,
  ctx: EndlessContext,
  rng: RNG
): Board {
  const emptyCells = getEmptyCells(board);
  if (emptyCells.length === 0) return board;

  const candidates = buildTargetFrontierCandidates(board, ctx)
    .map(seed => makeTileFromSeed(seed))
    .map(tile => evaluateSpawnCandidate(tile, board, ctx))
    .filter((result): result is EvaluatedSpawnCandidate => result !== null);

  const chosen = candidates.length > 0
    ? weightedChoice(candidates, rng).tile
    : chooseTargetFailsafeSpawn(board, ctx, rng);

  const cell = randomChoice(emptyCells, rng);
  return placeTile(board, chosen, cell);
}
```

### 7.7 Candidate evaluation

A spawn candidate is valid if it satisfies at least one of these:

1. It appears in a verified build path for an active target.
2. It is the missing partner for a useful board tile already present.
3. It can create a sandhi merge with an existing tile and the result is on a target path.
4. It can create a meter merge with an existing partial segment.
5. It can start a new prefix-valid pāda for an unmet odd/even slot.
6. It can pair with a completed pāda or hemistich toward śloka formation.

Every spawned tile must also carry machine-readable target provenance. This provenance is audit-only and is not shown in the core game UI.

```ts
type TargetTileUse = {
  targetId: string;
  targetIAST: string;
  pathId: string;
  role:
    | "left_chunk"
    | "right_chunk"
    | "intermediate"
    | "target_result"
    | "opening"
    | "repair";
  surfaceIAST: string;
};
```

Spawn policy:

1. A spawned tile must have at least one `TargetTileUse`.
2. The target owner may be active or in the near-future queue, but never already completed in the current target-deck cycle.
3. Active-target candidates must be attempted before near-future queued candidates.
4. Near-future queued candidates are allowed only when no active candidate can currently satisfy duplicate and path-to-completion constraints.
5. A documented repair/failsafe spawn must still carry `TargetTileUse`; it may relax duplicate suppression, but it must not introduce an unaudited arbitrary tile.
6. If a target is completed, remaining seed tiles must be retagged against the new active/queued target set.
7. A generated seed tile whose only owner was the completed target and which no longer has a valid future owner should be removed during target cleanup rather than left as dead clutter.
8. Duplicate seed surfaces should only spawn when the number of board copies is still useful for active or queued target paths, except for documented repair spawns that preserve target provenance.

```ts
function evaluateSpawnCandidate(
  candidate: Tile,
  board: Board,
  ctx: EndlessContext
): EvaluatedSpawnCandidate | null {
  const reasons: SpawnReason[] = [];

  const targetReasons = evaluateTargetFrontierFit(candidate, board, ctx.activeTargets);
  reasons.push(...targetReasons);

  for (const existing of board.tiles) {
    const sandhiA = resolveBoundaryRule(existing.rightBoundary, candidate.leftBoundary, ctx.activeRules);
    if (sandhiA) reasons.push({ type: "sandhi", orientation: "existing-before-candidate", ruleId: sandhiA.ruleId });

    const sandhiB = resolveBoundaryRule(candidate.rightBoundary, existing.leftBoundary, ctx.activeRules);
    if (sandhiB) reasons.push({ type: "sandhi", orientation: "candidate-before-existing", ruleId: sandhiB.ruleId });

    const meterA = canMeterMerge(existing, candidate, ctx.meterProfile);
    if (meterA) reasons.push({ type: "meter", orientation: "existing-before-candidate", meterResult: meterA.resultKind });

    const meterB = canMeterMerge(candidate, existing, ctx.meterProfile);
    if (meterB) reasons.push({ type: "meter", orientation: "candidate-before-existing", meterResult: meterB.resultKind });
  }

  if (canStartUsefulPada(candidate, ctx)) {
    reasons.push({ type: "meter-start", meterResult: "PADA_SEGMENT" });
  }

  if (reasons.length === 0) return null;

  return {
    tile: candidate,
    reasons,
    weight: computeTargetAwareSpawnWeight(candidate, reasons, board, ctx)
  };
}
```

### 7.8 Spawn weighting

```ts
function computeTargetAwareSpawnWeight(
  candidate: Tile,
  reasons: SpawnReason[],
  board: Board,
  ctx: EndlessContext
): number {
  let weight = 1;

  if (reasons.some(r => r.type === "target-missing-partner")) weight += 16;
  if (reasons.some(r => r.type === "target-path-chunk")) weight += 10;
  if (reasons.some(r => r.type === "target-intermediate")) weight += 12;
  if (reasons.some(r => r.type === "sandhi")) weight += 4;
  if (reasons.some(r => r.type === "meter")) weight += 6;
  if (reasons.some(r => r.meterResult === "PADA")) weight += 12;
  if (reasons.some(r => r.meterResult === "HEMISTICH")) weight += 18;
  if (reasons.some(r => r.meterResult === "SHLOKA")) weight += 30;

  if (candidate.kind === "AKSHARA") weight += 2;
  if (candidate.kind === "WORD_SEGMENT") weight += 4;

  if (candidate.lexicalStatus === "known-word") weight += 4;
  if (candidate.meter?.syllableCount === 1) weight += 1;
  if ((candidate.meter?.syllableCount ?? 0) >= 3) weight -= 1;

  // Help fill the active deficit of partial padas.
  const bestDeficitFit = scoreDeficitFit(candidate, board, ctx);
  weight += bestDeficitFit;

  // Avoid flooding board with same text.
  const sameSurfaceCount = board.tiles.filter(t => t.surfaceIAST === candidate.surfaceIAST).length;
  weight -= sameSurfaceCount * 2;

  return Math.max(1, weight);
}
```

### 7.9 Solvability invariant

After every move and every spawn, the engine must run a cheap reachability check:

```ts
function hasReachableActiveTarget(board: Board, ctx: EndlessContext): boolean {
  return ctx.activeTargets.some(target =>
    target.buildPaths.some(path => pathStillReachable(path, board, ctx.futureSpawnPolicy))
  );
}
```

If no active target is reachable, the next spawn must be corrective:

- spawn a missing partner for a tile already on the board;
- or replace the least reachable active target;
- or spawn a low-mass seed tile from the shortest verified path.

The product should avoid visible "dead target" states where the player is asked to build a word that the current board and spawn policy can no longer produce.

Spawn selection must also check local path-to-completion. If placing a candidate would consume the last empty cell, the candidate must immediately leave at least one active target path completable from the surfaces already on the board. More generally, the number of missing chunks for a candidate's target path must fit within the remaining empty-cell budget after spawn.

In addition, v1 endless must behave like a finite target deck before it behaves like infinite recycling:

- do not repeat a completed target until every target in the current pack cycle has been completed;
- when the pack cycle is exhausted, start a new hidden cycle without interrupting the run;
- preserve completed-target history for review while keeping the active deck free of premature repeats;
- seeded simulation must verify that all targets in the pack can be completed under the spawn policy before broad product review.

### 7.10 Completion cleanup

Target completion is the only automatic cleanup moment in v1. After one or more visible targets are completed:

1. Clear the completed target tile or tiles.
2. Refill active target slots from the queue.
3. Retag remaining tiles against active targets plus the near-future target queue lookahead.
4. Remove merged off-target sandhi fragments when all of the following are true:
   - the tile has `depth > 0`;
   - the tile has no `TargetTileUse` after retagging;
   - the tile preserves source-fragment target provenance in `sourceTargetUses`;
   - every target represented in `sourceTargetUses` has been completed in the current target cycle;
   - the tile has no metrical role.
5. Do not clear a merged stale tile just because any target completed. If its source fragments came from multiple target owners, it remains until all of those owners have been completed.
6. Do not clear seed chunks merely because they are alone. Seed chunks should only be removed when they are orphaned fragments from completed targets and no longer support visible active targets.

This keeps bad off-target merges consequential while the player is struggling, but rewards successful target completion with a small board cleanup.

### 7.11 Target failsafe

```ts
function chooseTargetFailsafeSpawn(
  board: Board,
  ctx: EndlessContext,
  rng: RNG
): Tile {
  const missingPartners = getMissingPartnersForActiveTargets(board, ctx);
  if (missingPartners.length > 0) {
    return makeTileFromSeed(weightedChoice(missingPartners, rng));
  }

  const activeDeficits = getActivePadaDeficits(board, ctx);

  // Prefer a syllable whose weight fits the next constrained slot.
  for (const deficit of activeDeficits) {
    const nextRequired = deficit.nextRequiredWeight;
    const options = ENDLESS_AKSHARA_INVENTORY.filter(seed =>
      seed.weight === nextRequired || nextRequired === "X"
    );
    if (options.length > 0) {
      return makeTileFromSeed(randomChoice(options, rng));
    }
  }

  // Fallback to useful light syllables.
  return makeTileFromSeed(randomChoice([
    { iast: "ya", deva: "य", weight: "L", phonemes: ["y", "a"] },
    { iast: "ta", deva: "त", weight: "L", phonemes: ["t", "a"] },
    { iast: "su", deva: "सु", weight: "L", phonemes: ["s", "u"] }
  ], rng));
}
```

---

## 8. Target-driven endless scoring

### 8.1 Scoring formula

```ts
const RULE_SCORE: Record<RuleId, number> = {
  SAVARNA_DIRGHA: 10,
  GUNA: 15,
  VRDDHI: 20,
  YAN: 12,
  AYAVA: 15,
  ANUSVARA_M: 8
};

const ENDLESS_SCORE = {
  COMPLETE_WORD_TARGET: 80,
  TARGET_STREAK_BONUS: 20,
  AKSHARA_JOIN: 6,
  WORD_SEGMENT_JOIN: 12,
  PADA_SEGMENT_EXTEND: 10,
  COMPLETE_VALID_PADA: 120,
  COMPLETE_ODD_CADENCE_PADA: 40,
  COMPLETE_EVEN_CADENCE_PADA: 40,
  COMPLETE_HEMISTICH: 250,
  COMPLETE_SHLOKA: 700,
  SHLOKA_STACK_MULTIPLIER_BASE: 900
};
```

### 8.2 Score events

```ts
function scoreTargetCompletion(target: ActiveTarget, streak: number): number {
  return (
    ENDLESS_SCORE.COMPLETE_WORD_TARGET +
    target.difficulty * 20 +
    Math.max(0, streak - 1) * ENDLESS_SCORE.TARGET_STREAK_BONUS
  );
}

function scoreMeterMerge(result: Tile): number {
  switch (result.kind) {
    case "PADA_SEGMENT":
      return ENDLESS_SCORE.PADA_SEGMENT_EXTEND + 4 * result.meter!.syllableCount;

    case "PADA": {
      const cadenceBonus = result.meter!.padaParity === "odd"
        ? ENDLESS_SCORE.COMPLETE_ODD_CADENCE_PADA
        : ENDLESS_SCORE.COMPLETE_EVEN_CADENCE_PADA;
      return ENDLESS_SCORE.COMPLETE_VALID_PADA + cadenceBonus;
    }

    case "HEMISTICH":
      return ENDLESS_SCORE.COMPLETE_HEMISTICH;

    case "SHLOKA":
      return ENDLESS_SCORE.COMPLETE_SHLOKA;

    case "SHLOKA_STACK":
      return ENDLESS_SCORE.SHLOKA_STACK_MULTIPLIER_BASE * getShlokaCount(result);

    default:
      return ENDLESS_SCORE.AKSHARA_JOIN;
  }
}
```

### 8.3 Combo bonuses

Add combo bonuses when a move produces more than one merge:

```ts
function scoreMoveCombo(events: MergeEvent[]): number {
  const mergeCount = events.length;
  const completedPadaCount = events.filter(e => e.resultKind === "PADA").length;
  const completedShlokaCount = events.filter(e => e.resultKind === "SHLOKA").length;

  return (
    Math.max(0, mergeCount - 1) * 15 +
    completedPadaCount * 60 +
    completedShlokaCount * 300
  );
}
```

### 8.4 Score copy

Use Sanskrit-native score milestones:

| Object | UI copy |
|---|---|
| Complete word target | `शब्दः सिद्धः` |
| Target streak | `सरणिः` |
| Complete pāda | `पाद सिद्धम्` |
| Complete hemistich | `अर्धश्लोकः` |
| Complete śloka | `श्लोकः सिद्धः` |
| Stack 2 ślokas | `द्विश्लोक-सङ्ग्रहः` |
| Stack 4 ślokas | `चतुर्श्लोक-सङ्ग्रहः` |
| Stack 8 ślokas | `अष्टश्लोक-सङ्ग्रहः` |

---

## 9. Target pack schema

Target packs replace level packs as the primary content source. A target pack is a curated set of words or future structural objects that the endless engine can present as active targets.

V1 target type:

```ts
type TargetKind = "WORD"; // Future: "PADA" | "HEMISTICH" | "SHLOKA"

type TargetDefinition = {
  id: string;
  kind: TargetKind;
  targetIAST: string;
  targetDeva: string;
  gloss?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  conceptTags: string[];
  allowedRules: RuleId[];
  syllableCount?: number;
  sourceTrace: {
    sourceId: string;
    sourceType: "course" | "text" | "expert" | "synthetic";
    title?: string;
    phraseIAST?: string;
    phraseDeva?: string;
    lessonRef?: string;
    notes?: string;
  };
  review: {
    status: "draft" | "needs_changes" | "expert_approved";
    reviewer?: string | null;
    comments: string[];
  };
  buildPaths: Array<{
    pathId: string;
    chunks: Array<{
      surfaceIAST: string;
      surfaceDeva?: string;
      phonemes: Phoneme[];
      syllableCount?: number;
    }>;
    steps: Array<{
      left: string;
      right: string;
      result: string;
      ruleId: RuleId;
    }>;
  }>;
};

type TargetPack = {
  packId: string;
  version: string;
  createdBy: string;
  sourcePolicy: "public-domain-or-permissioned-only";
  activeTargetCount: 3;
  queueSize: number; // recommended 8-12
  targets: TargetDefinition[];
};
```

Example:

```json
{
  "id": "target_devarsi",
  "kind": "WORD",
  "targetIAST": "devarṣi",
  "targetDeva": "देवर्षि",
  "gloss": "divine sage",
  "difficulty": 2,
  "conceptTags": ["guna", "vowel-sandhi"],
  "allowedRules": ["GUNA"],
  "buildPaths": [
    {
      "pathId": "deva_rsi_guna",
      "chunks": [
        { "surfaceIAST": "deva", "surfaceDeva": "देव", "phonemes": ["d", "e", "v", "a"] },
        { "surfaceIAST": "ṛṣi", "surfaceDeva": "ऋषि", "phonemes": ["ṛ", "ṣ", "i"] }
      ],
      "steps": [
        { "left": "deva", "right": "ṛṣi", "result": "devarṣi", "ruleId": "GUNA" }
      ]
    }
  ],
  "sourceTrace": {
    "sourceId": "expert_seed_001",
    "sourceType": "expert",
    "title": "Expert seed list"
  },
  "review": {
    "status": "draft",
    "reviewer": null,
    "comments": []
  }
}
```

### 9.1 Target pack validator

Before import, every target pack must pass the automated validator:

- pack metadata exists;
- target ids are unique;
- target count is sufficient for endless play;
- source trace and review metadata exist;
- supported phonemes only;
- active rules exist and have audit registry metadata;
- every build path starts from declared chunks;
- every build step can be recomputed by the production merge engine;
- the final build-path result equals `targetIAST`;
- the target surface can be rendered in Devanagari without display overflow;
- build paths do not require disabled or unaudited rules;
- targets are tagged by concept and difficulty;
- no target is product-facing unless it is source-traced and reviewable.

CLI:

```bash
npm run validate:targets:draft -- content/target-packs/starter_word_targets.draft.json
```

Current implementation intake uses the compact draft schema in `content/target-packs/starter_word_targets.draft.json`. Pack-level defaults may provide shared `sourceTrace` and `review` metadata, while each target still must include its id, word surface, concept tags, allowed rules, and at least one engine-verifiable build path. The draft validator is the required gate before a pack is wired into the game.

### 9.2 Pack sufficiency gates

A target pack is not sufficient merely because each individual word is valid. It must support a playable endless run.

Minimum starter-pack gates:

- at least 50 beginner targets;
- at least 100 intermediate targets before broad pilot;
- at least 20 targets per major rule family represented in the pack;
- no active target set may contain three targets that all require the same rare missing chunk;
- at least 90% of targets must have two or more spawnable chunks;
- at least 30% of targets should have alternative build paths once content volume allows it.

### 9.3 Seeded run simulation

Every pack must pass seeded simulation before product review:

```ts
type TargetPackSimulationResult = {
  seedsRun: number;
  averageMovesToTarget: number;
  medianMovesToTarget: number;
  targetCompletionRate: number;
  deadBoardRate: number;
  correctiveSpawnRate: number;
  averageActiveTargetReachability: number;
};
```

Acceptance thresholds for v1:

- run at least 100 deterministic seeds per pack;
- `deadBoardRate` must be 0 in smoke simulation;
- `targetCompletionRate` should be at least 70% across 100-move runs;
- median moves-to-target should land between 4 and 12 for beginner targets;
- corrective spawns should be visible enough to prevent dead ends but not exceed 25% of all spawns.

### 9.4 Target completion behavior

After each move:

1. Check result tiles against active targets.
2. For every matched target:
   - award `COMPLETE_WORD_TARGET` points;
   - apply streak bonus;
   - log the completed target and rule path;
   - clear the matched tile from the board after the pop animation;
   - refill the active target slot from the queue;
   - spawn 1-2 target-aware tiles if empty cells exist.
3. Continue the run. Do not show a win state for word targets.

### 9.5 Endless run state

The app should persist one current run, not level progress.

```ts
type EndlessRunState = {
  mode: "endless";
  board: Board;
  status: "playing" | "failed";
  score: number;
  highScore: number;
  streak: number;
  moveNumber: number;
  activeRules: RuleId[];
  activeTargets: ActiveTarget[];
  targetQueue: ActiveTarget[];
  completedTargets: Array<{
    targetId: string;
    targetIAST: string;
    targetDeva: string;
    completedAtMove: number;
    scoreAwarded: number;
  }>;
  actionLog: ActionLogEntry[];
  rngSeed: string;
  rngState: number;
};
```

Remove from persisted product state:

- `completedLevelIds`;
- `currentLevelId`;
- `levelSnapshot`;
- `endlessUnlocked`;
- level-set version naming.

Keep:

- current run snapshot;
- high score;
- completed target history;
- preferences.

### 9.6 Failure and liveness semantics

Failure must match the 2048 mental model, adapted to Sanskrit merge rules:

> A run fails only when the board is full and no valid board-changing move exists.

Unreachable targets are **not** an immediate loss. They are a content/spawn problem that the engine must repair through corrective spawn or target replacement.

Definitions:

```ts
type MoveClass =
  | "NOOP"
  | "SHIFT_ONLY"
  | "SANDHI_MERGE"
  | "METER_MERGE"
  | "TARGET_COMPLETION";

type LivenessResult = {
  status: "alive" | "failed";
  hasEmptyCell: boolean;
  hasBoardChangingMove: boolean;
  hasMergeMove: boolean;
  hasReachableActiveTarget: boolean;
  needsTargetRepair: boolean;
};
```

A **valid board-changing move** is any swipe direction that changes board state under the production move resolver:

1. at least one tile shifts into an empty cell; or
2. at least one `SANDHI_MERGE` occurs; or
3. at least one `METER_MERGE` occurs; or
4. at least one target-completion clear would occur as a consequence of the move.

Therefore:

- A full board with one possible sandhi merge is still alive.
- A full board with one possible meter merge is still alive.
- A full board with no empty cells and no sandhi/meter merge in any direction is failed.
- A not-full board is alive even if no immediate merge exists, because a shift/spawn cycle can still change the board.
- A board with unreachable active targets is alive if any board-changing move remains; the target system must repair reachability after the move.

Runtime predicate:

```ts
function evaluateLiveness(board: Board, ctx: EndlessContext): LivenessResult {
  const hasEmptyCell = getEmptyCells(board).length > 0;
  const moveResults = DIRECTIONS.map(direction =>
    computeMove(board, direction, ctx.activeRules, ctx.meterProfile)
  );

  const hasBoardChangingMove = moveResults.some(result => result.boardChanged);
  const hasMergeMove = moveResults.some(result =>
    result.mergeEvents.some(event =>
      event.mergeFamily === "SANDHI_MERGE" || event.mergeFamily === "METER_MERGE"
    )
  );
  const reachableActiveTarget = hasReachableActiveTarget(board, ctx);

  return {
    status: !hasEmptyCell && !hasBoardChangingMove ? "failed" : "alive",
    hasEmptyCell,
    hasBoardChangingMove,
    hasMergeMove,
    hasReachableActiveTarget: reachableActiveTarget,
    needsTargetRepair: !reachableActiveTarget
  };
}
```

Target repair policy:

1. If `needsTargetRepair` is true and the board has an empty cell, the next spawn must be corrective.
2. If `needsTargetRepair` is true and the board is full but a board-changing move exists, keep the run alive and wait for the next board change.
3. If `needsTargetRepair` remains true after a board-changing move, replace the least reachable active target with the next queued target whose frontier intersects the board or can be introduced by a corrective spawn.
4. If no queued target is reachable, inject a shortest-path beginner target from the validated failsafe target set.
5. Only set `status: "failed"` when the liveness predicate fails, not when target reachability fails.

This keeps failure understandable to players: they lose because the board is stuck, not because an invisible solver judged a target impossible.

---

## 10. Deprecated deterministic level examples

The deterministic level examples below are retained only as historical design reference. They must not be implemented as product-facing levels in v5. Any useful words from these examples should be converted into target-pack entries with verified build paths.

### Level 001 — `naya`, `rāmā`, `ū`

The original `naya` level was too much like a grammar demo. This version creates three simultaneous target tiles and introduces the idea of running parallel merges.

```json
{
  "id": "level_001_first_cluster",
  "name": "First Cluster",
  "mode": "level",
  "size": 4,
  "moveBudget": 2,
  "spawnPolicy": "none",
  "goal": {
    "type": "allSurfaces",
    "targets": [
      { "targetIAST": "naya", "targetDeva": "नय", "gloss": "lead / guide" },
      { "targetIAST": "rāmā", "targetDeva": "रामा", "gloss": "long-vowel form" },
      { "targetIAST": "ū", "targetDeva": "ऊ", "gloss": "long u" }
    ]
  },
  "tiles": [
    { "x": 0, "y": 0, "phonemes": ["n", "a"] },
    { "x": 1, "y": 0, "phonemes": ["i"] },
    { "x": 2, "y": 0, "phonemes": ["a"] },

    { "x": 0, "y": 1, "phonemes": ["r", "ā", "m", "a"] },
    { "x": 1, "y": 1, "phonemes": ["a"] },

    { "x": 0, "y": 2, "phonemes": ["u"] },
    { "x": 1, "y": 2, "phonemes": ["u"] }
  ],
  "activeRules": ["GUNA", "AYAVA", "SAVARNA_DIRGHA"],
  "teachingFocus": [
    "parallel merges",
    "a+i → e",
    "e+a → aya",
    "a+a → ā",
    "u+u → ū"
  ],
  "expectedSolution": ["left", "left"],
  "maxGeneratedIASTLength": 6
}
```

Expected progression:

| Move | Row 1 | Row 2 | Row 3 |
|---|---|---|---|
| Start | `na | i | a | ·` | `rāma | a | · | ·` | `u | u | · | ·` |
| Left | `ne | a | · | ·` | `rāmā | · | · | ·` | `ū | · | · | ·` |
| Left | `naya | · | · | ·` | `rāmā | · | · | ·` | `ū | · | · | ·` |

---

## 11. Deprecated advanced level examples

The examples in this section are not part of the v5 product loop. Convert valuable surfaces, source traces, and build paths into `TargetDefinition` entries instead of shipping them as levels.

### Level 002 — Three Fires

Parallel one-swipe board with guṇa, dīrgha, yaṇ, and anusvāra.

```json
{
  "id": "level_002_three_fires",
  "name": "Three Fires",
  "mode": "level",
  "size": 4,
  "moveBudget": 1,
  "spawnPolicy": "none",
  "goal": {
    "type": "allSurfaces",
    "targets": [
      { "targetIAST": "maheśa", "targetDeva": "महेश", "gloss": "great lord" },
      { "targetIAST": "sūkti", "targetDeva": "सूक्ति", "gloss": "well-said expression" },
      { "targetIAST": "svasti", "targetDeva": "स्वस्ति", "gloss": "well-being" },
      { "targetIAST": "aṃka", "targetDeva": "अंक", "gloss": "mark / number" }
    ]
  },
  "tiles": [
    { "x": 0, "y": 0, "phonemes": ["m", "a", "h", "a"] },
    { "x": 1, "y": 0, "phonemes": ["i", "ś", "a"] },

    { "x": 0, "y": 1, "phonemes": ["s", "u"] },
    { "x": 1, "y": 1, "phonemes": ["u", "k", "t", "i"] },

    { "x": 0, "y": 2, "phonemes": ["s", "u"] },
    { "x": 1, "y": 2, "phonemes": ["a", "s", "t", "i"] },

    { "x": 0, "y": 3, "phonemes": ["a", "m"] },
    { "x": 1, "y": 3, "phonemes": ["k", "a"] }
  ],
  "activeRules": ["GUNA", "SAVARNA_DIRGHA", "YAN", "ANUSVARA_M"],
  "teachingFocus": ["parallel combo", "a+i → e", "u+u → ū", "u+a → va", "m+k → ṃk"],
  "expectedSolution": ["left"],
  "maxGeneratedIASTLength": 6
}
```

### Level 003 — Vṛddhi Doors

Introduces vṛddhi while retaining earlier rules.

```json
{
  "id": "level_003_vrddhi_doors",
  "name": "Vṛddhi Doors",
  "mode": "level",
  "size": 4,
  "moveBudget": 1,
  "spawnPolicy": "none",
  "goal": {
    "type": "allSurfaces",
    "targets": [
      { "targetIAST": "nai", "targetDeva": "नै", "gloss": "na + e" },
      { "targetIAST": "gau", "targetDeva": "गौ", "gloss": "ga + o" },
      { "targetIAST": "rāmā", "targetDeva": "रामा", "gloss": "rāma + a" },
      { "targetIAST": "svasti", "targetDeva": "स्वस्ति", "gloss": "su + asti" }
    ]
  },
  "tiles": [
    { "x": 0, "y": 0, "phonemes": ["n", "a"] },
    { "x": 1, "y": 0, "phonemes": ["e"] },

    { "x": 0, "y": 1, "phonemes": ["g", "a"] },
    { "x": 1, "y": 1, "phonemes": ["o"] },

    { "x": 0, "y": 2, "phonemes": ["r", "ā", "m", "a"] },
    { "x": 1, "y": 2, "phonemes": ["a"] },

    { "x": 0, "y": 3, "phonemes": ["s", "u"] },
    { "x": 1, "y": 3, "phonemes": ["a", "s", "t", "i"] }
  ],
  "activeRules": ["VRDDHI", "SAVARNA_DIRGHA", "YAN"],
  "teachingFocus": ["a+e → ai", "a+o → au", "a+a → ā", "u+a → va"],
  "expectedSolution": ["left"],
  "maxGeneratedIASTLength": 6
}
```

### Level 004 — Chained Corridor

A vertical version of chained `naya` with simultaneous side goals.

```json
{
  "id": "level_004_chained_corridor",
  "name": "Chained Corridor",
  "mode": "level",
  "size": 4,
  "moveBudget": 2,
  "spawnPolicy": "none",
  "goal": {
    "type": "allSurfaces",
    "targets": [
      { "targetIAST": "naya", "targetDeva": "नय", "gloss": "guide" },
      { "targetIAST": "maheśa", "targetDeva": "महेश", "gloss": "great lord" },
      { "targetIAST": "svasti", "targetDeva": "स्वस्ति", "gloss": "well-being" },
      { "targetIAST": "aṃka", "targetDeva": "अंक", "gloss": "mark / number" }
    ]
  },
  "tiles": [
    { "x": 0, "y": 0, "phonemes": ["n", "a"] },
    { "x": 0, "y": 1, "phonemes": ["i"] },
    { "x": 0, "y": 2, "phonemes": ["a"] },

    { "x": 1, "y": 0, "phonemes": ["m", "a", "h", "a"] },
    { "x": 1, "y": 1, "phonemes": ["i", "ś", "a"] },

    { "x": 2, "y": 0, "phonemes": ["s", "u"] },
    { "x": 2, "y": 1, "phonemes": ["a", "s", "t", "i"] },

    { "x": 3, "y": 0, "phonemes": ["a", "m"] },
    { "x": 3, "y": 1, "phonemes": ["k", "a"] }
  ],
  "activeRules": ["GUNA", "AYAVA", "YAN", "ANUSVARA_M"],
  "teachingFocus": ["vertical merges", "two-step chain", "parallel goals"],
  "expectedSolution": ["up", "up"],
  "maxGeneratedIASTLength": 6
}
```

### Level 005 — Vowel Ladder

Requires watching multiple rows while the top row chains twice.

```json
{
  "id": "level_005_vowel_ladder",
  "name": "Vowel Ladder",
  "mode": "level",
  "size": 4,
  "moveBudget": 2,
  "spawnPolicy": "none",
  "goal": {
    "type": "allSurfaces",
    "targets": [
      { "targetIAST": "naya", "targetDeva": "नय", "gloss": "guide" },
      { "targetIAST": "gau", "targetDeva": "गौ", "gloss": "vṛddhi result" },
      { "targetIAST": "sūkti", "targetDeva": "सूक्ति", "gloss": "well-said expression" },
      { "targetIAST": "rāmā", "targetDeva": "रामा", "gloss": "long-vowel form" }
    ]
  },
  "tiles": [
    { "x": 0, "y": 0, "phonemes": ["n", "a"] },
    { "x": 1, "y": 0, "phonemes": ["i"] },
    { "x": 2, "y": 0, "phonemes": ["a"] },

    { "x": 0, "y": 1, "phonemes": ["g", "a"] },
    { "x": 1, "y": 1, "phonemes": ["o"] },

    { "x": 0, "y": 2, "phonemes": ["s", "u"] },
    { "x": 1, "y": 2, "phonemes": ["u", "k", "t", "i"] },

    { "x": 0, "y": 3, "phonemes": ["r", "ā", "m", "a"] },
    { "x": 1, "y": 3, "phonemes": ["a"] }
  ],
  "activeRules": ["GUNA", "AYAVA", "VRDDHI", "SAVARNA_DIRGHA"],
  "teachingFocus": ["multi-row planning", "vṛddhi", "dīrgha", "naya chain"],
  "expectedSolution": ["left", "left"],
  "maxGeneratedIASTLength": 6
}
```

### Level 006 — Mixed Gate

A dense board where one direction resolves four different rule families.

```json
{
  "id": "level_006_mixed_gate",
  "name": "Mixed Gate",
  "mode": "level",
  "size": 4,
  "moveBudget": 2,
  "spawnPolicy": "none",
  "goal": {
    "type": "allSurfaces",
    "targets": [
      { "targetIAST": "aṃka", "targetDeva": "अंक", "gloss": "mark / number" },
      { "targetIAST": "naya", "targetDeva": "नय", "gloss": "guide" },
      { "targetIAST": "maheśa", "targetDeva": "महेश", "gloss": "great lord" },
      { "targetIAST": "sūkti", "targetDeva": "सूक्ति", "gloss": "well-said expression" }
    ]
  },
  "tiles": [
    { "x": 0, "y": 0, "phonemes": ["a", "m"] },
    { "x": 1, "y": 0, "phonemes": ["k", "a"] },

    { "x": 0, "y": 1, "phonemes": ["n", "a"] },
    { "x": 1, "y": 1, "phonemes": ["i"] },
    { "x": 2, "y": 1, "phonemes": ["a"] },

    { "x": 0, "y": 2, "phonemes": ["m", "a", "h", "a"] },
    { "x": 1, "y": 2, "phonemes": ["i", "ś", "a"] },

    { "x": 0, "y": 3, "phonemes": ["s", "u"] },
    { "x": 1, "y": 3, "phonemes": ["u", "k", "t", "i"] }
  ],
  "activeRules": ["ANUSVARA_M", "GUNA", "AYAVA", "SAVARNA_DIRGHA"],
  "teachingFocus": ["anusvāra plus vowel sandhi", "two-step topological chain"],
  "expectedSolution": ["left", "left"],
  "maxGeneratedIASTLength": 6
}
```

---

## 12. Expanded phoneme inventory

The earlier v3 inventory was too small for consonant-bearing endless play. Expand the canonical phoneme type.

```ts
type Phoneme =
  | "a" | "ā" | "i" | "ī" | "u" | "ū" | "ṛ" | "ṝ" | "ḷ"
  | "e" | "o" | "ai" | "au"
  | "k" | "kh" | "g" | "gh" | "ṅ"
  | "c" | "ch" | "j" | "jh" | "ñ"
  | "ṭ" | "ṭh" | "ḍ" | "ḍh" | "ṇ"
  | "t" | "th" | "d" | "dh" | "n"
  | "p" | "ph" | "b" | "bh" | "m"
  | "y" | "r" | "l" | "v"
  | "ś" | "ṣ" | "s" | "h"
  | "ṃ" | "ḥ";
```

V1 does **not** need full consonant sandhi. The expanded inventory is necessary for rendering, scansion, and word chunks.

---

## 13. Algorithmic consequences for 2048 feel

### 13.1 Why this is now actually 2048-like

The original sandhi-only game risked topping out at short words. The v4 loop creates escalating tile ranks:

| Rank | Object | Merge target |
|---:|---|---|
| 1 | Akṣara / syllable | joins into segment |
| 2 | Word / segment | joins into pāda segment |
| 3 | Pāda segment | completes pāda |
| 4 | Pāda | merges with matching pāda |
| 5 | Hemistich | merges with matching hemistich |
| 6 | Śloka | stacks with śloka |
| 7 | 2× śloka stack | stacks with equal stack |
| 8 | 4× śloka stack | stacks with equal stack |
| 9 | 8× śloka stack | late-game target |

This is the core unlock: the game now has a meaningful high-ceiling object hierarchy analogous to `2 → 4 → 8 → 16 → 2048`.

### 13.2 Compact board labels are mandatory

Long pādas and ślokas cannot be rendered fully on tiles. The board must show compact metrical labels and open full text in detail/log panels.

Examples:

| Full object | Tile face |
|---|---|
| `ahiṃsā paramo dharmaḥ` | `पाद १` |
| `yato dharmas tato jayaḥ` | `पाद २` |
| First two padas | `अर्ध १` |
| Complete verse | `श्लोक ×1` |
| Two verses stacked | `श्लोक ×2` |

### 13.3 Acceptance criteria for Target-Driven Endless Mode

Target-Driven Endless Mode is acceptable only if:

1. The app opens directly into endless play with no level selection requirement.
2. Exactly 3 active word targets are visible by default.
3. Each active target comes from a validated target pack and includes at least one verified build path.
4. Spawned tiles are drawn from active targets' frontiers or documented failsafes.
5. A fresh opening board cannot complete an active target on the first swipe in any direction.
6. A player can complete word targets without luck-only dependence.
7. When a target word is completed, the tile clears, score increases, the action log records the completion, and the target slot refills.
8. The run continues after target completion; target completion is not a win state.
9. A player can make at least one valid pāda in a typical mature run without luck-only dependence once meter targets are enabled.
10. Completed pādas merge only in valid order:
   - `PADA 1 + PADA 2 → HEMISTICH A`
   - `PADA 3 + PADA 4 → HEMISTICH B`
   - `HEMISTICH A + HEMISTICH B → SHLOKA`
11. Equal śloka stacks merge like 2048:
   - `SHLOKA ×1 + SHLOKA ×1 → SHLOKA ×2`
   - `SHLOKA ×2 + SHLOKA ×2 → SHLOKA ×4`
12. The action log shows both sandhi and metrical reasons for merges.
13. Smart spawn never introduces a tile that is useless for active targets, sandhi, and meter unless the documented failsafe triggers.
14. No product-facing mode generates pseudo-Sanskrit as a success state.
15. Every completed pāda is either:
   - from a curated target pāda; or
   - validated by the pathyā-prefix and completion rules.
16. Seeded simulation passes the pack sufficiency gates before a target pack ships.
17. Failure occurs only when the board is full and no board-changing swipe exists.
18. A full board with any possible sandhi or meter merge remains alive.
19. Unreachable active targets trigger target repair/replacement, not immediate failure.

---

## 14. Testing additions

Add tests beyond v3.

### 14.1 Meter scanner tests

```ts
test("scans ahiṃsā paramo dharmaḥ as 8 syllables", () => {
  const span = scanMetricalSpan("ahiṃsā paramo dharmaḥ");
  expect(span.syllableCount).toBe(8);
  expect(span.weightPattern).toEqual(["L", "G", "G", "L", "L", "G", "G", "G"]);
});

test("final syllable is treated as anceps for matching", () => {
  const span = scanMetricalSpan("ahiṃsā paramo dharmaḥ");
  const matchWeights = weightsForMatching(span);
  expect(matchWeights[7]).toBe("X");
});
```

### 14.2 Anuṣṭubh validation tests

```ts
test("odd pada accepts L G G cadence at 5-7", () => {
  const span = spanFromWeights(["L", "G", "G", "L", "L", "G", "G", "G"]);
  expect(validateCompletePada(span, 1, ANUSTUBH_PATHYA_V1)).toBe(true);
});

test("even pada accepts L G L cadence at 5-7", () => {
  const span = spanFromWeights(["L", "G", "G", "G", "L", "G", "L", "G"]);
  expect(validateCompletePada(span, 2, ANUSTUBH_PATHYA_V1)).toBe(true);
});

test("pada rejects L L at positions 2-3", () => {
  const span = spanFromWeights(["G", "L", "L", "G", "L", "G", "G", "G"]);
  expect(validateCompletePada(span, 1, ANUSTUBH_PATHYA_V1)).toBe(false);
});

test("even pada rejects G L G at positions 2-4", () => {
  const span = spanFromWeights(["L", "G", "L", "G", "L", "G", "L", "G"]);
  expect(validateCompletePada(span, 2, ANUSTUBH_PATHYA_V1)).toBe(false);
});
```

### 14.3 Metrical merge tests

```ts
test("valid word chunks merge into complete pada", () => {
  const a = makeWordTile("ahiṃsā");
  const b = makeWordTile("paramo");
  const c = makeWordTile("dharmaḥ");

  const ab = tryMeterMerge(a, b, ANUSTUBH_PATHYA_V1)!.resultTile;
  const abc = tryMeterMerge(ab, c, ANUSTUBH_PATHYA_V1)!.resultTile;

  expect(abc.kind).toBe("PADA");
  expect(abc.meter!.assignedPadaIndex).toBe(1);
});

test("pada 1 and pada 2 merge into hemistich A", () => {
  const p1 = makePadaTile(1);
  const p2 = makePadaTile(2);
  const result = tryMeterMerge(p1, p2, ANUSTUBH_PATHYA_V1)!.resultTile;
  expect(result.kind).toBe("HEMISTICH");
});

test("two equal shlokas merge into shloka x2", () => {
  const s1 = makeShlokaTile();
  const s2 = makeShlokaTile();
  const result = tryMeterMerge(s1, s2, ANUSTUBH_PATHYA_V1)!.resultTile;
  expect(result.kind).toBe("SHLOKA_STACK");
  expect(getShlokaCount(result)).toBe(2);
});
```

### 14.4 Target-pack and endless-loop tests

```ts
test("every target build path reproduces the target with production merge rules", () => {
  for (const target of STARTER_TARGET_PACK.targets) {
    for (const path of target.buildPaths) {
      expect(replayBuildPath(path, target.allowedRules).surfaceIAST).toBe(target.targetIAST);
    }
  }
});

test("target-aware spawn selects a tile from an active target frontier", () => {
  const state = newEndlessTargetRun({ seed: "spawn-frontier" });
  const spawned = spawnTargetAwareTile(state.board, state.ctx, state.rng);
  expect(tileAdvancesActiveTarget(spawned.tile, state.activeTargets)).toBe(true);
});

test("completed target scores, clears the tile, and refills the target slot", () => {
  const state = stateOneMoveBeforeTarget("devarṣi");
  const next = executeMove(state, "left");
  expect(next.score).toBeGreaterThan(state.score);
  expect(hasSurface(next.board, "devarṣi")).toBe(false);
  expect(next.completedTargets).toContain("target_devarsi");
  expect(next.activeTargets).toHaveLength(3);
});

test("seeded target-pack simulation has no dead boards", () => {
  const result = simulateTargetPack(STARTER_TARGET_PACK, { seeds: 100, maxMoves: 100 });
  expect(result.deadBoardRate).toBe(0);
  expect(result.targetCompletionRate).toBeGreaterThanOrEqual(0.7);
});

test("full board with a possible sandhi merge is alive", () => {
  const state = fullBoardWithOneSandhiMerge();
  const liveness = evaluateLiveness(state.board, state.ctx);
  expect(liveness.status).toBe("alive");
  expect(liveness.hasMergeMove).toBe(true);
});

test("full board with no shifts and no merges is failed", () => {
  const state = fullBoardWithNoLegalMoves();
  const liveness = evaluateLiveness(state.board, state.ctx);
  expect(liveness.status).toBe("failed");
});

test("unreachable targets trigger repair, not failure, while board can still move", () => {
  const state = movableBoardWithUnreachableTargets();
  const liveness = evaluateLiveness(state.board, state.ctx);
  expect(liveness.status).toBe("alive");
  expect(liveness.needsTargetRepair).toBe(true);
});
```

---

## 15. Implementation file changes

Current v5 implementation adds or keeps these files:

```text
content/target-packs/
  starter_word_targets.draft.json

scripts/
  validate-target-pack-draft.ts

src/targets/
  targetEngine.ts

src/tests/
  anustubhValidation.test.ts
  meterMerge.test.ts
  targetEngine.test.ts
```

Update these files:

```text
src/game/phonemes.ts        # expanded Sanskrit surface parsing/rendering
src/game/rules.ts           # sandhi and meter merge resolver entry point
src/game/types.ts           # endless target run state and target schemas
src/game/board.ts           # shared 2048 movement and liveness checks
src/game/persistence.ts     # remove level progress, persist current endless run and high score
src/app/App.tsx             # remove level UI, show active targets and endless stats
src/styles/globals.css      # clean parchment/ivory mobile UI and tile sizing
src/tests/app.test.tsx      # smoke-test target UI and absence of level affordances
src/tests/persistence.test.ts
src/tests/reducer.test.ts
```

---

## 16. Product principle

The original sandhi-only design taught a rule system. The v5 design gives the game an always-on arcade loop with meaningful Sanskrit targets and a high-ceiling arc.

The product should now feel like:

> Swipe syllables into real words.  
> Clear word targets for points.  
> Keep the board alive.  
> Then grow words into pādas, ślokas, and śloka stacks.

That is the core game loop.

Do not ship a level ladder or a vague chandas sandbox. Ship **Target-Driven Endless Mode** with curated target packs, verified build paths, target-aware spawning, and a narrow, auditable, fun rule set.


---

## 17. Research source notes for implementers

Use these as background references when validating the metrical implementation. The game should encode the simplified v1 pathyā model above, not attempt the full historical range of śloka/vipulā variation.

- Anuṣṭubh / śloka structure: four pādas of eight syllables; classical śloka as the developed epic anuṣṭubh form.
- Universal śloka constraints to encode in v1:
  - positions 2–3 in a pāda may not be `L L`;
  - even pādas / the second pāda of each hemistich may not have `G L G` at positions 2–4.
- Laghu/guru rules:
  - short vowel + no cluster = laghu;
  - long vowel/diphthong = guru;
  - short vowel followed by consonant cluster = guru;
  - anusvāra/visarga = guru;
  - final syllable can be treated as anceps for metrical matching.
- Modern Sanskrit computational prosody tools such as Chandojñānam and recent prosody-aware generation work support the design choice to treat meter as an explicit data model with scansion, pattern validation, and line/pāda segmentation.

Reference URLs:
- https://en.wikipedia.org/wiki/Anu%E1%B9%A3%E1%B9%ADubh
- https://en.wikipedia.org/wiki/Shloka
- https://en.wikipedia.org/wiki/Sanskrit_prosody
- https://arxiv.org/abs/2209.14924
- https://arxiv.org/abs/2603.24413
