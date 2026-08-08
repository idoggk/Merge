import { valueOf } from './ranks'
import { generateCandidate } from './generateCandidate'
import { splitOversized, raiseUndersized, popcount } from './rankWindow'

// Rank-window variant of generateCandidate. The [minRank, maxRank] window is
// a hard floor/ceiling; item count is still soft. Sum is exact UNLESS the
// target isn't a multiple of valueOf(minRank), in which case there is no
// exact decomposition using only minRank-or-above items at all (every such
// item's value is itself a multiple of valueOf(minRank), so anything they
// sum to is too) — raiseUndersized rounds up by the smallest amount that
// fixes that (at most valueOf(minRank) - 1) rather than leaving an
// out-of-window item behind. Never rounds down, so the board's subsidy
// never comes in under what was configured, only (rarely) slightly over.
//
// When minRank < maxRank (an actual range, not a fixed rank), one item at
// minRank and one at maxRank are reserved up front so the result always
// shows variety across the window instead of collapsing to a cluster of
// similar ranks. Reservation is itself best-effort: it's skipped if there
// isn't enough sum, or if the remainder can't be decomposed within its
// leftover tile budget at all (checked via popcount — subtracting the
// reservation can unluckily need more items than plain decomposition would).
export function generateCandidateInRange(target, desiredCount, minRank, maxRank) {
  if (minRank < maxRank && desiredCount >= 2) {
    const reservedSum = valueOf(minRank) + valueOf(maxRank)
    const remainderTarget = target - reservedSum
    if (remainderTarget >= 0 && popcount(remainderTarget) <= desiredCount - 2) {
      const remainderRanks = generateCandidate(remainderTarget, desiredCount - 2)
      raiseUndersized(remainderRanks, minRank)
      splitOversized(remainderRanks, maxRank)
      return [minRank, maxRank, ...remainderRanks].sort((a, b) => a - b)
    }
  }

  const ranks = generateCandidate(target, desiredCount)
  raiseUndersized(ranks, minRank)
  splitOversized(ranks, maxRank)
  return ranks.sort((a, b) => a - b)
}
