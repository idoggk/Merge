import { valueOf } from './ranks'
import { generateCandidate } from './generateCandidate'
import { splitOversized, mergeUndersized, popcount } from './rankWindow'

// Best-effort rank-window variant of generateCandidate. Sum is always exact;
// item count and the [minRank, maxRank] window are soft and may drift when
// they can't be satisfied together (e.g. a lone unmatched undersized item).
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
      splitOversized(remainderRanks, maxRank)
      mergeUndersized(remainderRanks, minRank)
      return [minRank, maxRank, ...remainderRanks].sort((a, b) => a - b)
    }
  }

  const ranks = generateCandidate(target, desiredCount)
  splitOversized(ranks, maxRank)
  mergeUndersized(ranks, minRank)
  return ranks.sort((a, b) => a - b)
}
