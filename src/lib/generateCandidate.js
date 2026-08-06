import { MIN_RANK } from './ranks'

// Decompose target into powers of two -> ranks, descending (highest rank first).
export function decompose(target) {
  const ranks = []
  let remaining = target
  let bit = 1
  let rank = 1
  while (remaining > 0) {
    if (remaining & bit) {
      ranks.push(rank)
      remaining -= bit
    }
    bit <<= 1
    rank += 1
  }
  return ranks.sort((a, b) => b - a)
}

// Mutates `ranks` in place: repeatedly splits the largest splittable item
// (rank > MIN_RANK) in half until length reaches desiredCount, or nothing is
// left splittable. Sum is unaffected by construction (2^(r-1) = 2 * 2^(r-2)).
export function splitToCount(ranks, desiredCount) {
  while (ranks.length < desiredCount) {
    let largestIdx = -1
    for (let i = 0; i < ranks.length; i++) {
      if (ranks[i] > MIN_RANK && (largestIdx === -1 || ranks[i] > ranks[largestIdx])) {
        largestIdx = i
      }
    }
    if (largestIdx === -1) break // nothing left to split

    const splitRank = ranks[largestIdx] - 1
    ranks.splice(largestIdx, 1, splitRank, splitRank)
  }
  return ranks
}

// Exact-sum decomposition of `target` into `desiredCount` items (ranks).
// Always preserves sum(valueOf(rank)) === target. Item count is best-effort:
// if every item bottoms out at MIN_RANK before reaching desiredCount, the
// loop stops early rather than breaking the sum.
export function generateCandidate(target, desiredCount) {
  const ranks = splitToCount(decompose(target), desiredCount)
  return ranks.sort((a, b) => a - b)
}
