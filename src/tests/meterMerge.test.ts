import { describe, expect, it } from "vitest";
import { tryMeterMerge, getShlokaCount } from "../game/meter/meterMerge";
import { makePadaTile, makeShlokaTile, makeWordTile } from "../game/meter/targetPadas";

describe("meter merge", () => {
  it("merges valid word chunks into a complete pāda", () => {
    const a = makeWordTile("ahiṃsā", "a");
    const b = makeWordTile("paramo", "b");
    const c = makeWordTile("dharmaḥ", "c");

    const ab = tryMeterMerge(a, b, "ab")!.result;
    const abc = tryMeterMerge(ab, c, "abc")!.result;

    expect(abc.kind).toBe("PADA");
    expect(abc.meter?.assignedPadaIndex).toBe(1);
  });

  it("merges pāda 1 and pāda 2 into hemistich A", () => {
    const p1 = makePadaTile(1, "p1");
    const p2 = makePadaTile(2, "p2");
    const result = tryMeterMerge(p1, p2, "h1")!.result;

    expect(result.kind).toBe("HEMISTICH");
    expect(result.meter?.hemistichIndex).toBe(1);
  });

  it("merges two equal ślokas into a śloka stack", () => {
    const s1 = makeShlokaTile("s1");
    const s2 = makeShlokaTile("s2");
    const result = tryMeterMerge(s1, s2, "stack")!.result;

    expect(result.kind).toBe("SHLOKA_STACK");
    expect(getShlokaCount(result)).toBe(2);
  });
});
