export function hashSeed(seed: number, index = 0): number {
  let value = (seed + index * 0x9e3779b9) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

export function seededRandom(seed: number, index = 0): number {
  return hashSeed(seed, index) / 4294967296;
}

export function randomBetween(
  seed: number,
  index: number,
  min: number,
  max: number,
): number {
  return min + seededRandom(seed, index) * (max - min);
}

export function randomSigned(
  seed: number,
  index: number,
  amount: number,
): number {
  return randomBetween(seed, index, -amount, amount);
}
