import { computeDistances } from './boardDistance'
import { buildNoisyQueue } from './buildNoisyQueue'
import { generateCandidateInRange } from './generateCandidateInRange'
import { generateCandidateWithSmallRanks } from './generateCandidateWithSmallRanks'
import { computeOnboardingReserve } from './onboardingGoal'
import { simulatePlaythrough } from './mergeSimulation'
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

// Splits distance-ordered positions into what the onboarding reserve claims
// (up to `counts[state]` of each tile type, closest first) and what's left
// for the remainder's own assignment — so the remainder never adds enough
// of its own items on top to exceed the tile budget the reserve already
// spent.
function splitReservedSlots(orderedPositions, tiles, counts) {
  const remaining = { ...counts }
  const claimed = []
  const remainder = []
  for (const pos of orderedPositions) {
    const state = tiles[pos.row][pos.col]
    if (remaining[state] > 0) {
      remaining[state] -= 1
      claimed.push(pos)
    } else {
      remainder.push(pos)
    }
  }
  return { claimed, remainder }
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
// that rank on its own — and hosts it on the board's existing semi tiles
// first (visible and mergeable from turn zero) before falling back to the
// blocked queue for whatever doesn't fit. The REST of blockedValue is
// generated exactly as before and fills in behind it. This works alongside
// the board's own subsidy rather than replacing it: the goal is just an
// early checkpoint, not a redesign of the whole board, and never adds tiles
// beyond what's already painted.
function generatePlacement(board, { isFirstBoard = false, noise = 0.15, onboarding = null } = {}) {
  const { tiles, blockedValue, minRank, maxRank } = board
  const positions = fillableTiles(tiles)
  const distances = computeDistances(tiles)
  const orderedPositions = orderByDistance(positions, distances)
  const blockedTileCount = positions.filter((pos) => tiles[pos.row][pos.col] === 'blocked').length
  const semiTileCount = positions.length - blockedTileCount

  let reservedSemiItems = []
  let reservedBlockedItems = []
  let onboardingStatus = null

  if (isFirstBoard && onboarding?.drBudget != null && onboarding?.targetRank != null) {
    const reserve = computeOnboardingReserve(board, onboarding)
    if (!reserve) {
      onboardingStatus = { feasible: false, reason: 'unreachable' }
    } else if (reserve.reservedValue > blockedValue) {
      onboardingStatus = { feasible: false, reason: 'insufficient-subsidy', reservedValueNeeded: reserve.reservedValue }
    } else if (reserve.blockedItems.length > blockedTileCount || reserve.semiItems.length > semiTileCount) {
      const itemsNeeded = reserve.semiItems.length + reserve.blockedItems.length
      onboardingStatus = { feasible: false, reason: 'insufficient-tiles', itemsNeeded }
    } else {
      reservedSemiItems = reserve.semiItems
      reservedBlockedItems = reserve.blockedItems
      onboardingStatus = { feasible: true, reservedValue: reserve.reservedValue, drSpentToTarget: reserve.drSpentToTarget }
    }
  }

  // The reserve claims its slice of the blocked/semi tiles up front, closest
  // first — the remainder's own assignment only ever sees what's left.
  const { claimed: reservedPositions, remainder: remainderPositions } = splitReservedSlots(orderedPositions, tiles, {
    blocked: reservedBlockedItems.length,
    semi: reservedSemiItems.length,
  })

  const reservedValueTotal = [...reservedSemiItems, ...reservedBlockedItems].reduce((s, r) => s + valueOf(r), 0)
  const remainderTarget = blockedValue - reservedValueTotal
  const remainderDesired = isFirstBoard ? remainderPositions.length : positions.length

  const ranks = isFirstBoard
    ? generateCandidateWithSmallRanks(remainderTarget, remainderDesired, minRank, maxRank)
    : generateCandidateInRange(blockedValue, remainderDesired, minRank, maxRank)

  const queue = buildNoisyQueue(ranks, noise)

  // The reserve's semi items go onto whichever semi positions it actually
  // claimed above, in that same (closest-first) order — typically all
  // identical rank-1s, so the pairing rarely matters, but it's well-defined
  // either way.
  const semiPlacements = reservedPositions
    .filter((pos) => tiles[pos.row][pos.col] === 'semi')
    .map((pos, i) => ({ row: pos.row, col: pos.col, rank: reservedSemiItems[i] }))

  // generateCandidate* can legitimately produce more items than there are
  // tiles — item count is a soft constraint, and sometimes the minimum
  // possible item count for an exact sum (its binary population count)
  // exceeds the tile budget. Positions beyond the tile count have nowhere to
  // go, so only what's actually assigned below counts as "placed" — stats
  // are computed from that, not the raw pre-truncation generated list, or
  // they'd falsely report success on value that never made it onto the board.
  const blockedRanks = []
  const placedRanks = [...reservedSemiItems, ...reservedBlockedItems]
  remainderPositions.forEach((pos, i) => {
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
  const blockedQueue = [...reservedBlockedItems, ...blockedQueueRemainder]

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

// generatePlacement's onboarding guarantee is checked in ISOLATION
// (computeOnboardingReserve tests the reserve alone, ignoring whatever the
// remainder ends up placing) - two things can make that guarantee not
// actually hold on the real, combined board, so both get verified here
// against the real thing rather than trusted blindly, falling back to plain
// (no-onboarding) generation either way:
//
// 1. Splitting blockedValue into two independently-decomposed pieces
//    (reserve + remainder) can need more total items than the tile budget
//    has, even on a board where generating the whole value as one piece
//    would fit fine (splitting a binary number rarely reduces, and often
//    inflates, total set bits) - the remainder's own generation then
//    silently truncates to fit, quietly losing part of blockedValue's sum.
// 2. The remainder can place its OWN items on the board's other semi
//    tiles, and under mergeSimulation.js's single-biggest-anchor merge rule,
//    a bigger remainder item can steal the anchor role away from the one
//    the reserve was specifically counting on — the reserve's isolated
//    guarantee doesn't carry over to the real board in that case.
export function placeItems(board, options = {}) {
  const { isFirstBoard = false, noise = 0.15, onboarding = null } = options
  const result = generatePlacement(board, { isFirstBoard, noise, onboarding })
  if (!onboarding || !result.onboardingStatus?.feasible) return result

  if (result.sum !== board.blockedValue) {
    const fallback = generatePlacement(board, { isFirstBoard, noise, onboarding: null })
    return { ...fallback, onboardingStatus: { feasible: false, reason: 'tile-budget-too-tight' } }
  }

  const real = simulatePlaythrough(
    [{ ...board, semiPlacements: result.semiPlacements, blockedQueue: result.blockedQueue }],
    { drBudget: onboarding.drBudget },
  )
  const drSpentToTarget = real.reachedAt[onboarding.targetRank]
  if (drSpentToTarget === undefined) {
    const fallback = generatePlacement(board, { isFirstBoard, noise, onboarding: null })
    return { ...fallback, onboardingStatus: { feasible: false, reason: 'blocked-by-other-subsidy' } }
  }
  return { ...result, onboardingStatus: { ...result.onboardingStatus, drSpentToTarget } }
}
