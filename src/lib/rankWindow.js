import { MIN_RANK, valueOf } from './ranks'
import { decompose } from './generateCandidate'

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
// A lone item with no matching pair is left below minRank (best-effort) -
// used where item count needs to stay exactly as generated (board 0's
// small-rank guarantee already puts a rank-1/2/3 floor in place regardless,
// so a leftover odd one out there isn't the problem raiseUndersized exists
// for below).
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

// Removes every item below minRank and replaces them with a clean
// decomposition of their combined value - rounded UP to the nearest
// multiple of valueOf(minRank) if it isn't one already, since a value that
// isn't such a multiple can never be exactly represented using only
// minRank-or-above (power-of-two) items. Unlike mergeUndersized (which
// leaves an unpaired leftover below minRank), this makes the rank floor a
// hard constraint - the sum may overallocate by at most valueOf(minRank) - 1
// as the price of that, on top of whatever it's called on. Item count is
// unaffected by the rest of the list; the replacement decomposition's own
// count is whatever decompose() needs (its minimum, one item per set bit).
export function raiseUndersized(ranks, minRank) {
  const minValue = valueOf(minRank)
  let strayValue = 0
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (ranks[i] < minRank) {
      strayValue += valueOf(ranks[i])
      ranks.splice(i, 1)
    }
  }
  if (strayValue === 0) return
  const roundedValue = Math.ceil(strayValue / minValue) * minValue
  ranks.push(...decompose(roundedValue))
}
