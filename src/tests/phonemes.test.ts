import { describe, expect, it } from "vitest";
import { makeTileFromPhonemes, parseSurfaceToPhonemes, surfaceDeva } from "../game/phonemes";

describe("phoneme rendering", () => {
  it("renders consonant-final fragments with virama", () => {
    expect(surfaceDeva(parseSurfaceToPhonemes("sam"))).toBe("सम्");
    expect(makeTileFromPhonemes(parseSurfaceToPhonemes("sam")).surfaceDeva).toBe("सम्");
  });

  it("keeps full vowel-ending words and anusvara targets readable", () => {
    expect(surfaceDeva(parseSurfaceToPhonemes("deva"))).toBe("देव");
    expect(surfaceDeva(parseSurfaceToPhonemes("saṃskṛta"))).toBe("संस्कृत");
  });
});
