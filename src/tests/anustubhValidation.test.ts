import { describe, expect, it } from "vitest";
import { spanFromWeights, validateCompletePada } from "../game/meter/anustubh";

describe("anuṣṭubh pathyā validation", () => {
  it("accepts odd pāda cadence L G G at positions 5-7", () => {
    const span = spanFromWeights(["L", "G", "G", "L", "L", "G", "G", "G"]);
    expect(validateCompletePada(span, 1)).toBe(true);
  });

  it("accepts even pāda cadence L G L at positions 5-7", () => {
    const span = spanFromWeights(["L", "G", "G", "G", "L", "G", "L", "G"]);
    expect(validateCompletePada(span, 2)).toBe(true);
  });

  it("rejects L L at positions 2-3", () => {
    const span = spanFromWeights(["G", "L", "L", "G", "L", "G", "G", "G"]);
    expect(validateCompletePada(span, 1)).toBe(false);
  });

  it("rejects G L G at positions 2-4 in even pādas", () => {
    const span = spanFromWeights(["L", "G", "L", "G", "L", "G", "L", "G"]);
    expect(validateCompletePada(span, 2)).toBe(false);
  });
});
