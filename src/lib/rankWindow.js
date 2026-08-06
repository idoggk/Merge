import { MIN_RANK } from './ranks'

// The minimum number of power-of-two-valued items that can sum to `target`
// (repetition allowed) is provably its population count: any representation
// with a duplicate value could always merge that pair into one larger item,
// so a minimal representation never has duplicates, which is exactly the
// standard binary form. Used to check whether a reservation (subtracting a
// fixed sum before decomposing the remainder) is even satisfiable within a
// tile budget before committing to it — subtracting a small amount from a
// round number can unluckily flip many bits (e.g. 2048 - 7 = 2041 needs 9
// items even though 2048 alone needs only 1).
export function popcount(n) {
  let count = 0
  let x = n
  while (x > 0) {
    count += x & 1
    x >>= 1
  }
  return count
}

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
