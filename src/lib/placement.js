import { computeDistances } from './boardDistance'
import { buildNoisyQueue } from './buildNoisyQueue'
import { generateCandidateInRange } from './generateCandidateInRange'
import { generateCandidateWithSmallRanks } from './generateCandidateWithSmallRanks'
import { computeOnboardingReserve } from './onboardingGoal'
import { valueOf } from './ranks'

function fillableTiles(tiles) {
  const positions = []
  for (let r = 0; r < tiles.length; r++) {
    for (let c = 0; c < tiles[r].length; c++) {
      if (tiles[r][c] === 'blocked' || tiles[r][c] === 'semi') {
        positions.push({ row: r, col: c })
      }
    }
  }
  return positions
}

// Distance-to-player queue, closest tile first. Ties break row-major so
// results are stable; buildNoisyQueue supplies the actual local variance.
function orderByDistance(positions, distances) {
  return [...positions].sort((a, b) => {
    const da = distances[a.row][a.col]
    const db = distances[b.row][b.col]
    if (da !== db) return da - db
    if (a.row !== b.row) return a.row - b.row
    return a.col - b.col
  })
}

// Full generation pipeline for one board: generate items (exact sum to
// blockedValue), order blocked/semi tiles by distance-to-open-tile, run the
// ascending item list through the noisy queue, then split the result:
//
// - semi tiles are grid-fixed (visible from the start), so they keep a
//   {row, col, rank} placement.
// - blocked tiles have no fixed position — a blocked tile isn't visible to
//   the player until a merge next to it reveals it, and which physical tile
//   that happens to be is decided by the playthrough simulation, not here.
//   So blocked items become a position-independent ordered queue; only their
//   reveal ORDER is controlled at generation time (and can be hand-reordered
//   afterward) — this ordering doubles as the queue's default sequence.
//
// isFirstBoard scopes the small-rank guarantee to board index 0 only.
//
// onboarding (board 0 only): { drBudget, targetRank } carves a reserved
// prefix off blockedValue up front — sized to guarantee that budget reaches
// that rank on its own — and prepends it to the blocked queue. The REST of
// blockedValue is generated exactly as before and fills in behind it. This
// works alongside the board's own subsidy rather than replacing it: the
// goal is just an early checkpoint, not a redesign of the whole board.
export function placeItems(board, { isFirstBoard = false, noise = 0.15, onboarding = null } = {}) {
  const { tiles, blockedValue, minRank, maxRank } = board
  const positions = fillableTiles(tiles)
  const distances = computeDistances(tiles)
  const orderedPositions = orderByDistance(positions, distances)

  let reservedItems = []
  let onboardingStatus = null

  if (isFirstBoard && onboarding?.drBudget != null && onboarding?.targetRank != null) {
    const reserve = computeOnboardingReserve(board, onboarding)
    if (!reserve) {
      onboardingStatus = { feasible: false, reason: 'unreachable' }
    } else if (reserve.reservedValue > blockedValue) {
      onboardingStatus = { feasible: false, reason: 'insufficient-subsidy', reservedValueNeeded: reserve.reservedValue }
    } else if (reserve.reservedItems.length > positions.length) {
      onboardingStatus = { feasible: false, reason: 'insufficient-tiles', itemsNeeded: reserve.reservedItems.length }
    } else {
      reservedItems = reserve.reservedItems
      onboardingStatus = { feasible: true, reservedValue: reserve.reservedValue, drSpentToTarget: reserve.drSpentToTarget }
    }
  }

  const remainderTarget = blockedValue - reservedItems.reduce((s, r) => s + valueOf(r), 0)
  const remainderDesired = Math.max(0, positions.length - reservedItems.length)

  const ranks = isFirstBoard
    ? generateCandidateWithSmallRanks(remainderTarget, remainderDesired, minRank, maxRank)
    : generateCandidateInRange(blockedValue, positions.length, minRank, maxRank)

  const queue = buildNoisyQueue(ranks, noise)

  // generateCandidate* can legitimately produce more items than there are
  // tiles — item count is a soft constraint, and sometimes the minimum
  // possible item count for an exact sum (its binary population count)
  // exceeds the tile budget. Positions beyond the tile count have nowhere to
  // go, so only what's actually assigned below counts as "placed" — stats
  // are computed from that, not the raw pre-truncation generated list, or
  // they'd falsely report success on value that never made it onto the board.
  const semiPlacements = []
  const blockedRanks = []
  const placedRanks = [...reservedItems]
  orderedPositions.forEach((pos, i) => {
    const rank = queue[i]
    if (rank == null) return
    placedRanks.push(rank)
    if (tiles[pos.row][pos.col] === 'semi') {
      semiPlacements.push({ row: pos.row, col: pos.col, rank })
    } else {
      blockedRanks.push(rank)
    }
  })

  // The blocked queue has no grid position of its own, so its presentation
  // order shouldn't just inherit whatever it happened to interleave with in
  // the distance ordering above — re-noise it on its own so it reads as
  // ascending-with-visible-local-variation rather than a flat ramp. The
  // onboarding reserve, if any, stays fixed at the front — it exists
  // specifically to guarantee reveal order, so it must not get reshuffled in.
  const blockedQueueRemainder = buildNoisyQueue([...blockedRanks].sort((a, b) => a - b), noise)
  const blockedQueue = [...reservedItems, ...blockedQueueRemainder]

  // Board 0 only guarantees small ranks (1-3) plus maxRank, not minRank, so
  // its variety check is max-only; other boards check both ends of the window.
  const isRange = minRank < maxRank
  const hasMax = placedRanks.includes(maxRank)
  const hasRangeVariety = !isRange ? null : isFirstBoard ? hasMax : hasMax && placedRanks.includes(minRank)

  return {
    semiPlacements,
    blockedQueue,
    itemCount: placedRanks.length,
    tileCount: positions.length,
    sum: placedRanks.reduce((s, r) => s + valueOf(r), 0),
    hasRangeVariety,
    onboardingStatus,
  }
}
