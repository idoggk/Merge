export const MIN_RANK = 1
export const MAX_RANK = 12

export function valueOf(rank) {
  return 2 ** (rank - 1)
}

// Rarity-style gradient, teal -> blue -> violet -> magenta -> gold as rank
// increases 1-12. Deliberately deviates from CLAUDE.md's single-hue purple
// convention per explicit request (the old ramp read as flat/washed-out).
const RAMP = [
  '#059669', // 1  emerald
  '#0d9488', // 2  teal
  '#0891b2', // 3  cyan
  '#0284c7', // 4  sky
  '#2563eb', // 5  blue
  '#4f46e5', // 6  indigo
  '#7c3aed', // 7  violet
  '#9333ea', // 8  purple
  '#c026d3', // 9  fuchsia
  '#db2777', // 10 pink
  '#e11d48', // 11 rose
  '#d97706', // 12 gold
]

export function colorForRank(rank) {
  const i = Math.min(Math.max(rank, MIN_RANK), MAX_RANK) - 1
  return RAMP[i]
}
