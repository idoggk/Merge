import { valueOf, MAX_RANK } from './ranks'
import { decompose, splitToCount } from './generateCandidate'
import { splitOversized, mergeUndersized } from './rankWindow'
import { simulatePlaythrough } from './mergeSimulation'

const CEILING = valueOf(MAX_RANK)
const MAX_ITERATIONS = 40

// The reserve only ever feeds the blocked queue — semi tiles are grid-fixed
// and never draw from it — so its item count is capped by blocked tiles
// specifically, not blocked+semi combined.
function countBlockedTiles(tiles) {
  let count = 0
  for (const row of tiles) {
    for (const state of row) {
      if (state === 'blocked') count++
    }
  }
  return count
}

function decomposeReserved(value, minRank, maxRank, targetRank, maxItems) {
  const items = decompose(value)
  // Cap at targetRank, not just maxRank: decompose() minimizes item count,
  // which for a large enough value can yield a single item already ABOVE
  // the target rank — meaning it was revealed whole, never individually
  // held at exactly targetRank, so "reached targetRank" would never get
  // recorded even though the value more than covers it. Forcing every item
  // to start at or below targetRank guarantees at least one of them either
  // IS targetRank directly, or a merge lands exactly on it on the way up.
  splitOversized(items, Math.min(maxRank, targetRank))
  // Bias toward smaller items (more rank-1s), not just enough to pass through
  // the target rank: a reserve of a few large, efficient items can get
  // revealed and satisfy the goal almost for free, barely touching the
  // player's DR grant. Splitting further so the climb happens through more,
  // smaller pieces means more of it has to happen via actual generator-fueled
  // merging, using more of the grant — capped at the tile budget so this
  // never claims more slots than the board has to hold it.
  splitToCount(items, Math.min(value, maxItems))
  mergeUndersized(items, minRank)
  // Descending — biggest items revealed earliest gets to the target rank in
  // the fewest DR, since a blocked-queue item's reveal timing depends on
  // board/merge activity, not on how much DR has been spent.
  return items.sort((a, b) => b - a)
}

// A blocked-queue item's reveal timing depends on merge activity near it,
// not directly on DR spent, so this checks the reserve in isolation from any
// semi-tile bonus: semi tiles are treated as plain open cells (available to
// the generator, but starting empty) rather than pre-seeded — so whatever
// reserve passes here is a guarantee that holds even before the remainder
// pool (generated afterward, using whatever blockedValue is left over) adds
// anything on top.
function buildIsolatedTestBoard(board, reservedItems) {
  const tiles = board.tiles.map((row) => row.map((s) => (s === 'semi' ? 'open' : s)))
  return { rows: board.rows, cols: board.cols, tiles, semiPlacements: [], blockedQueue: reservedItems }
}

// Board-1-only: finds the smallest blocked-queue reservation (front-loaded,
// exact-sum, respecting the board's rank window) such that a player with
// `drBudget` DR reaches `targetRank` using only this reserve plus the
// generator — before the rest of the board's blockedValue is even
// considered. Returns null if infeasible within the chain's total value.
export function computeOnboardingReserve(board, { drBudget, targetRank }) {
  const { minRank, maxRank } = board
  const maxItems = countBlockedTiles(board.tiles)

  function attempt(value) {
    const items = decomposeReserved(value, minRank, maxRank, targetRank, maxItems)
    const result = simulatePlaythrough(buildIsolatedTestBoard(board, items), { drBudget })
    return { ok: result.reachedAt[targetRank] !== undefined, items, result }
  }

  let high = valueOf(targetRank)
  let best = null
  while (high <= CEILING) {
    const a = attempt(high)
    if (a.ok) {
      best = a
      break
    }
    high *= 2
  }
  if (!best) return null

  let lo = 0
  let hi = high
  for (let i = 0; i < MAX_ITERATIONS && hi - lo > 1; i++) {
    const mid = Math.floor((lo + hi) / 2)
    const a = attempt(mid)
    if (a.ok) {
      hi = mid
      best = a
    } else {
      lo = mid
    }
  }

  return { reservedValue: hi, reservedItems: best.items, drSpentToTarget: best.result.reachedAt[targetRank] }
}
