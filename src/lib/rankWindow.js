import { MIN_RANK } from './ranks'

// Split every item above maxRank down into rank-1 pairs until none remain.
export function splitOversized(ranks, maxRank) {
  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < ranks.length; i++) {
      if (ranks[i] > maxRank) {
        const r = ranks[i] - 1
        ranks.splice(i, 1, r, r)
        changed = true
        break
      }
    }
  }
}

// Merge pairs of equal-rank items below minRank up one rank at a time.
// A lone item with no matching pair is left below minRank (best-effort).
export function mergeUndersized(ranks, minRank) {
  let changed = true
  while (changed) {
    changed = false
    for (let r = MIN_RANK; r < minRank; r++) {
      const idxs = []
      for (let i = 0; i < ranks.length; i++) {
        if (ranks[i] === r) idxs.push(i)
      }
      if (idxs.length >= 2) {
        const [i1, i2] = idxs
        ranks.splice(i2, 1)
        ranks.splice(i1, 1)
        ranks.push(r + 1)
        changed = true
        break
      }
    }
  }
}
