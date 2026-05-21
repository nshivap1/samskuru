import { describe, expect, it } from "vitest";
import { makeTileFromPhonemes } from "../game/phonemes";
import { mergeTiles, resolveBoundaryRule } from "../game/rules";

describe("sandhi rule resolver", () => {
  it("resolves guṇa for a+i", () => {
    expect(resolveBoundaryRule("a", "i", ["GUNA"])?.replacement).toEqual(["e"]);
  });

  it("honors active rule filtering", () => {
    expect(resolveBoundaryRule("a", "i", ["SAVARNA_DIRGHA"])).toBeNull();
  });

  it("prioritizes vṛddhi before guṇa for a+e", () => {
    const match = resolveBoundaryRule("a", "e", ["VRDDHI", "GUNA"]);
    expect(match?.ruleId).toBe("VRDDHI");
    expect(match?.replacement).toEqual(["ai"]);
  });

  it("keeps the right vowel for yaṇ merges", () => {
    const left = makeTileFromPhonemes(["s", "u"], { id: "left" });
    const right = makeTileFromPhonemes(["a", "s", "t", "i"], { id: "right" });
    const merged = mergeTiles(left, right, ["YAN"], left.id);
    expect(merged?.result.surfaceIAST).toBe("svasti");
    expect(merged?.match.mergeFamily).toBe("SANDHI_MERGE");
    if (merged?.match.mergeFamily === "SANDHI_MERGE") {
      expect(merged.match.consumeRight).toBe(false);
    }
  });
});
