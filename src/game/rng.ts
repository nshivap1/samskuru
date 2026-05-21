export class SeededRng {
  private state: number;

  constructor(seedOrState: string | number) {
    this.state = typeof seedOrState === "number" ? seedOrState >>> 0 : hashSeed(seedOrState);
  }

  float() {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number) {
    return Math.floor(this.float() * maxExclusive);
  }

  choice<T>(items: readonly T[]) {
    return items[this.int(items.length)];
  }

  getState() {
    return this.state >>> 0;
  }
}

export function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
