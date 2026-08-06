import { valueOf, MIN_RANK, MAX_RANK } from './ranks'
import { decompose, splitToCount, generateCandidate } from './generateCandidate'
import { splitOversized, mergeUndersized, popcount } from './rankWindow'

// Ranks guaranteed present in the placed-item pool for board index 0, so
// early merges always have small pieces to combine. Scoped to board 0 only
// — do not apply this to any other board in the list.
const GUARANTEED_RANKS = [1, 2, 3]

function reservedSum(ranks) {
  return ranks.reduce((sum, r) => sum + valueOf(r), 0)
}

// A reservation is only usable if the leftover (target - reservedSum) can
// actually be decomposed within the leftover tile budget — checked via
// popcount, since subtracting the reservation can unluckily need more items
// than the target's own decomposition would (e.g. 2048 - 7 = 2041 needs 9
// items even though 2048 alone needs only 1).
function canReserve(reserved, target, desiredCount) {
  const sum = reservedSum(reserved)
  return target >= sum && desiredCount >= reserved.length && popcount(target - sum) <= desiredCount - reserved.length
}

// Same exact-sum contract as generateCandidate, but reserves one rank-1,
// rank-2, and rank-3 item up front and never splits them away (the board-0
// small-rank guarantee). Also reserves one item at maxRank, so setting a top
// rank on board 0 is still guaranteed to show up at least once — same
// best-effort spirit as generateCandidateInRange's min/max reservation, just
// layered on top of the small-rank set instead of replacing it. The
// remainder is clamped into [minRank, maxRank] the same way.
//
// Reservation degrades gracefully if it isn't feasible: max-rank first, then
// the small-rank guarantee itself, always preserving the exact sum.
export function generateCandidateWithSmallRanks(target, desiredCount, minRank = MIN_RANK, maxRank = MAX_RANK) {
  const withMax = maxRank > 3 ? [...GUARANTEED_RANKS, maxRank] : GUARANTEED_RANKS

  let reserved
  if (canReserve(withMax, target, desiredCount)) {
    reserved = withMax
  } else if (canReserve(GUARANTEED_RANKS, target, desiredCount)) {
    reserved = GUARANTEED_RANKS
  } else {
    return generateCandidate(target, desiredCount)
  }

  const remainderTarget = target - reservedSum(reserved)
  const remainderDesired = Math.max(0, desiredCount - reserved.length)
  const remainderRanks = splitToCount(decompose(remainderTarget), remainderDesired)
  splitOversized(remainderRanks, maxRank)
  mergeUndersized(remainderRanks, minRank)

  return [...reserved, ...remainderRanks].sort((a, b) => a - b)
}
