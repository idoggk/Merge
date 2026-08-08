import { valueOf, MAX_RANK } from './ranks'
import { decompose, splitToCount } from './generateCandidate'
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
  // Split further into more, smaller items (up to the tile budget) rather
  // than a minimal few big ones. Subsidy items clear to fully free once
  // merged into (see mergeSimulation.js's `stuck` comment) and freely
  // combine with each other afterward, so a "ladder" of several matching-
  // ish items placed at multiple points along the climb — one to bridge
  // into at rank 2, another at rank 3, another at rank 4 — actually gets
  // used level by level as the player naturally climbs, unlike a single
  // large item that only pays off once, right at the top. Empirically
  // confirmed: for the same total reserved value, several smaller items
  // reach a given target rank in noticeably fewer real DR than one or two
  // big ones, because the small ones combine with the player's own
  // in-progress climb at multiple stages instead of just the last one.
  splitToCount(items, Math.min(value, maxItems))
  mergeUndersized(items, minRank)
  return items
}

// Existing semi tiles are visible and mergeable from turn zero, unlike
// blocked tiles which need a merge nearby to reveal anything at all — so
// the player's very first move can otherwise be "spend DR just to
// bootstrap a reveal" before any real progress happens. Hosting the
// smallest reserve items there instead means the very first generator
// spend (which also defaults to rank 1) has something to merge into
// immediately. Doesn't add tiles — only ever uses however many semi tiles
// are already painted, falling back to the blocked queue for whatever
// doesn't fit.
function splitReserveByHost(items, semiTileCount) {
  const ascending = [...items].sort((a, b) => a - b)
  const semiItems = ascending.slice(0, Math.min(semiTileCount, ascending.length))
  // Descending — biggest items revealed earliest gets to the target rank in
  // the fewest DR, since a blocked-queue item's reveal timing depends on
  // board/merge activity, not on how much DR has been spent.
  const blockedItems = ascending.slice(semiItems.length).sort((a, b) => b - a)
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
  const { blocked: blockedTileCount, semi: semiTileCount } = countTiles(board.tiles)
  // The reserve is meant to be a small early checkpoint, not a claim on most
  // of the board — it's typically a tiny fraction of blockedValue (a handful
  // of DR against a board designed for hundreds). Splitting it into as many
  // items as its own value would allow (up to every tile on the board) can
  // leave too few slots for the remainder to represent its own — usually far
  // larger — share, which can silently drop a big chunk of it (item count
  // beyond the tile budget is a soft constraint, and its minimum possible
  // count can exceed a handful of leftover slots). Capping at half the
  // board's tiles keeps the reserve's footprint proportionate — placeItems'
  // own sum-vs-real-board verification (see placement.js) is the backstop
  // if this cap still isn't tight enough for some layout.
  const maxItems = Math.max(1, Math.floor((blockedTileCount + semiTileCount) / 2))

  function attempt(value) {
    const items = decomposeReserved(value, minRank, maxRank, targetRank, maxItems)
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
