import { describe, expect, it } from "vitest";
import { computeMove, createEmptyBoard } from "../game/board";
import { makeWordTile } from "../game/meter/targetPadas";
import { makeTileFromPhonemes } from "../game/phonemes";
import { RULE_AUDIT_REGISTRY } from "../game/ruleAudit";
import { ALL_RULES } from "../game/rules";
import type { MergeRuleId } from "../game/types";

const METER_RULES: MergeRuleId[] = [
  "METER_SEGMENT",
  "METER_PADA",
  "METER_HEMISTICH",
  "METER_SHLOKA",
  "METER_SHLOKA_STACK"
];

describe("rule audit registry", () => {
  it("covers every merge-capable rule with human-reviewable metadata", () => {
    const expectedRuleIds: MergeRuleId[] = [...ALL_RULES, ...METER_RULES];

    for (const ruleId of expectedRuleIds) {
      const spec = RULE_AUDIT_REGISTRY[ruleId];

      expect(spec, ruleId).toBeDefined();
      expect(spec.id).toBe(ruleId);
      expect(spec.sourceVersion).toBeTruthy();
      expect(spec.name).toBeTruthy();
      expect(spec.inputPattern).toBeTruthy();
      expect(spec.outputPattern).toBeTruthy();
      expect(spec.explanation).toBeTruthy();
      expect(spec.constraints.length, ruleId).toBeGreaterThan(0);
      expect(spec.examples.length, ruleId).toBeGreaterThan(0);
      expect(spec.counterExamples.length, ruleId).toBeGreaterThan(0);
    }
  });

  it("attaches meter audit metadata to merge events", () => {
    const board = createEmptyBoard();
    board[0][0] = makeWordTile("ahiṃsā", "left");
    board[0][1] = makeWordTile("paramo", "right");

    const result = computeMove(board, "left", []);
    const audit = result.mergeEvents[0].audit;

    expect(audit.ruleName).toBe("Metrical Segment");
    expect(audit.sourceVersion).toBeTruthy();
    expect(audit.applied.leftSurface).toBe("ahiṃsā");
    expect(audit.applied.resultMeter?.syllableCount).toBe(6);
  });

  it("attaches sandhi audit metadata to boundary rewrites", () => {
    const board = createEmptyBoard();
    board[0][0] = makeTileFromPhonemes(["a"], { id: "a" });
    board[0][1] = makeTileFromPhonemes(["i"], { id: "i" });

    const result = computeMove(board, "left", ["GUNA"]);
    const audit = result.mergeEvents[0].audit;

    expect(audit.ruleName).toBe("Guṇa");
    expect(audit.sutraRef).toBe("Pāṇini 6.1.87");
    expect(audit.applied.boundary).toMatchObject({ left: "a", right: "i", replacement: ["e"] });
    expect(audit.examples[0]).toMatchObject({ input: "a + i", output: "e" });
  });
});
