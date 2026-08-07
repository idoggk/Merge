import { valueOf, MAX_RANK } from './ranks'
import { decompose } from './generateCandidate'
import { splitOversized, mergeUndersized } from './rankWindow'
import { simulatePlaythrough } from './mergeSimulation'

const CEILING = valueOf(MAX_RANK)
const MAX_ITERATIONS = 40

function countTiles(tiles) {
  let blocked = 0
  let semi = 0
  for (const row of tiles) {
    for (const state of row) {
      if (state === 'blocked') blocked++
      else if (state === 'semi') semi++
    }
  }
  return { blocked, semi }
}

function decomposeReserved(value, minRank, maxRank, targetRank) {
  const items = decompose(value)
  // Cap at targetRank, not just maxRank: decompose() minimizes item count,
  // which for a large enough value can yield a single item already ABOVE
  // the target rank — meaning it was revealed whole, never individually
  // held at exactly targetRank, so "reached targetRank" would never get
  // recorded even though the value more than covers it. Forcing every item
  // to start at or below targetRank guarantees at least one of them either
  // IS targetRank directly, or a merge lands exactly on it on the way up.
  splitOversized(items, Math.min(maxRank, targetRank))
  mergeUndersized(items, minRank)
  return items
}

// Existing semi tiles are visible and mergeable from turn zero, unlike
// blocked tiles which need a merge nearby to reveal anything at all. That
// matters because only the single largest subsidy item anywhere on the
// board can ever be a useful merge target (see isEligibleReceiver in
// mergeSimulation.js — two subsidy items never merge with each other, so
// splitting effort across several is never better than using the best one
// alone): that one item needs to be guaranteed visible from the very
// start, not left to chance in the blocked queue where it might never get
// revealed if no merge happens to land next to it. Hosting the BIGGEST
// reserve items on semi tiles (descending) guarantees this. Doesn't add
// tiles — only ever uses however many semi tiles are already painted,
// falling back to the blocked queue for whatever doesn't fit.
function splitReserveByHost(items, semiTileCount) {
  const descending = [...items].sort((a, b) => b - a)
  const semiItems = descending.slice(0, Math.min(semiTileCount, descending.length))
  const blockedItems = descending.slice(semiItems.length)
  return { semiItems, blockedItems }
}

// Checks the reserve in isolation from the rest of the board: the semi
// slots it doesn't use are treated as plain open cells (available to the
// generator, but starting empty) rather than pre-seeded by the remainder
// pool generated afterward — so whatever passes here is a guarantee that
// holds even before that remainder adds anything on top.
function buildIsolatedTestBoard(board, semiItems, blockedItems) {
  const tiles = board.tiles.map((row) => [...row])
  const semiPlacements = []
  let i = 0
  for (let r = 0; r < tiles.length && i < semiItems.length; r++) {
    for (let c = 0; c < tiles[r].length && i < semiItems.length; c++) {
      if (tiles[r][c] === 'semi') {
        semiPlacements.push({ row: r, col: c, rank: semiItems[i] })
        i += 1
      }
    }
  }
  for (let r = 0; r < tiles.length; r++) {
    for (let c = 0; c < tiles[r].length; c++) {
      if (tiles[r][c] === 'semi' && !semiPlacements.some((p) => p.row === r && p.col === c)) {
        tiles[r][c] = 'open'
      }
    }
  }
  return { rows: board.rows, cols: board.cols, tiles, semiPlacements, blockedQueue: blockedItems }
}

// Board-1-only: finds the smallest reservation (front-loaded, exact-sum,
// respecting the board's rank window) such that a player with `drBudget` DR
// reaches `targetRank` using only this reserve plus the generator — before
// the rest of the board's blockedValue is even considered. Returns null if
// infeasible within the chain's total value.
export function computeOnboardingReserve(board, { drBudget, targetRank }) {
  const { minRank, maxRank } = board
  const { semi: semiTileCount } = countTiles(board.tiles)

  function attempt(value) {
    const items = decomposeReserved(value, minRank, maxRank, targetRank)
    const { semiItems, blockedItems } = splitReserveByHost(items, semiTileCount)
    const result = simulatePlaythrough(buildIsolatedTestBoard(board, semiItems, blockedItems), { drBudget })
    return { ok: result.reachedAt[targetRank] !== undefined, semiItems, blockedItems, result }
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

  return {
    reservedValue: hi,
    semiItems: best.semiItems,
    blockedItems: best.blockedItems,
    drSpentToTarget: best.result.reachedAt[targetRank],
  }
}
