import { valueOf } from './ranks'
import { decompose, splitToCount, generateCandidate } from './generateCandidate'

// Ranks guaranteed present in the placed-item pool for board index 0, so
// early merges always have small pieces to combine. Scoped to board 0 only
// — do not apply this to any other board in the list.
const GUARANTEED_RANKS = [1, 2, 3]
const GUARANTEED_SUM = GUARANTEED_RANKS.reduce((sum, r) => sum + valueOf(r), 0) // 7

// Same exact-sum contract as generateCandidate, but reserves one rank-1,
// rank-2, and rank-3 item up front and never splits them away. If target is
// too small to afford the reservation (< 7), falls back to plain
// generateCandidate rather than breaking the sum invariant.
export function generateCandidateWithSmallRanks(target, desiredCount) {
  if (target < GUARANTEED_SUM) {
    return generateCandidate(target, desiredCount)
  }

  const remainderTarget = target - GUARANTEED_SUM
  const remainderDesired = Math.max(0, desiredCount - GUARANTEED_RANKS.length)
  const remainderRanks = splitToCount(decompose(remainderTarget), remainderDesired)

  return [...GUARANTEED_RANKS, ...remainderRanks].sort((a, b) => a - b)
}
