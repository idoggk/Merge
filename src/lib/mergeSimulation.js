import { MAX_RANK } from './ranks'
import { currentTier, TIER2_UNLOCK_RANK } from './generatorTier'
import { DEFAULT_TARGET_EV, computeProbs, createEvScheduler } from './luckyDrop'

// 4-directional only — up/down/left/right, no diagonals.
const DELTAS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

function buildInitialState(board) {
  const { rows, cols, tiles, semiPlacements, blockedQueue } = board
  const itemAt = Array.from({ length: rows }, () => Array(cols).fill(null))
  // subsidyOrigin: true for any cell whose tile started blocked or semi —
  // permanent, based on the tile itself rather than whatever item currently
  // sits there. An item on one of these cells can only ever be a merge
  // RECEIVER, never a mover, even after growing from earlier merges into it —
  // a merge only happens when a player brings a same-rank item that's
  // currently sitting on an ordinary open tile (i.e. something the generator
  // placed, directly or by a few hops of open-open merges) to one of these,
  // or to another open item. Two subsidy-origin items sitting adjacent, or
  // reachable, never merge with each other on their own — that would be a
  // free chain reaction with no player action (DR spend) behind it.
  const subsidyOrigin = Array.from({ length: rows }, () => Array(cols).fill(false))
  // locked: true for a blocked tile with no item, not yet revealed.
  const locked = Array.from({ length: rows }, () => Array(cols).fill(false))

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r][c] === 'blocked') {
        locked[r][c] = true
        subsidyOrigin[r][c] = true
      } else if (tiles[r][c] === 'semi') {
        subsidyOrigin[r][c] = true
      }
    }
  }
  for (const p of semiPlacements) {
    itemAt[p.row][p.col] = p.rank
  }

  // activeAnchorKey: once the first open item merges into ANY subsidy cell,
  // that cell becomes the ONLY subsidy cell allowed to receive further
  // merges for the rest of the run - see isEligibleReceiver.
  return { rows, cols, itemAt, subsidyOrigin, locked, blockedQueue: [...blockedQueue], blockedQueueIndex: 0, activeAnchorKey: null }
}

function inBounds(state, r, c) {
  return r >= 0 && r < state.rows && c >= 0 && c < state.cols
}

function cellKey(state, r, c) {
  return r * state.cols + c
}

// A subsidy cell can receive a merge only if it's the board's one committed
// "anchor" (or no anchor has been committed yet, in which case this cell
// would become it). Open cells are always eligible. Without this, every
// early spend - before any two fresh open items have coexisted long enough
// to pair with each other - immediately drains whichever subsidy anchor it
// happens to be nearest/reachable to, and a board with several separate
// anchors drains them one by one before any open-open pairing ever forms,
// costing MORE total DR than a player who simply ignored the board's
// subsidy entirely (see the merge-priority comments below for why open-open
// pairing is already preferred - this closes the remaining gap: reachability
// spans the whole open area regardless of where a fresh item spawns, so
// avoiding *that* one subsidy neighbor at spawn time isn't enough on its
// own). Committing to a single anchor mirrors the optimal strategy: use
// exactly one anchor's existing free value as a discount, feed it with
// freshly-built matching items one level at a time, and leave every other
// anchor untouched rather than splitting effort across all of them.
function isEligibleReceiver(state, r, c) {
  if (!state.subsidyOrigin[r][c]) return true
  return state.activeAnchorKey === null || state.activeAnchorKey === cellKey(state, r, c)
}

// Fast path: two same-rank items sitting directly next to each other.
// Deterministic scan, row-major, checking neighbors up/down/left/right in
// that order — same pair of cells always resolves the same way.
//
// Two passes: open-open pairs first, open-subsidy pairs only if no open-open
// pair exists anywhere on the board right now. Merging an open item into a
// subsidy anchor is a one-way trip (the result can never move again), so
// doing it while a same-rank open partner is available elsewhere would burn
// that flexibility for no reason — the open items should always be free to
// consolidate with each other first, exactly like the board had no subsidy
// tiles at all. Subsidy anchors only get fed once that option is exhausted,
// at which point it's a pure bonus (using otherwise-idle board value)
// instead of a tax on the player's own progress.
function findDirectAdjacentMerge(state) {
  return scanDirectAdjacent(state, true) ?? scanDirectAdjacent(state, false)
}

function scanDirectAdjacent(state, requireBothOpen) {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const rank = state.itemAt[r][c]
      if (rank == null) continue
      for (const [dr, dc] of DELTAS) {
        const nr = r + dr
        const nc = c + dc
        if (!inBounds(state, nr, nc) || state.itemAt[nr][nc] !== rank) continue

        const hereMovable = !state.subsidyOrigin[r][c]
        const thereMovable = !state.subsidyOrigin[nr][nc]
        if (requireBothOpen && !(hereMovable && thereMovable)) continue
        if (hereMovable && isEligibleReceiver(state, nr, nc)) return { mover: [r, c], receiver: [nr, nc], rank }
        if (thereMovable && isEligibleReceiver(state, r, c)) return { mover: [nr, nc], receiver: [r, c], rank }
        // Neither side is an eligible receiver for the other — nothing here to drive the merge.
      }
    }
  }
  return null
}

// Slow path: a player can drag a piece across any open space to reach a
// match, not just one grid-step — otherwise generator spawns scattering
// across a big board can converge into a deadlock (e.g. a checkerboard of
// alternating ranks where no two equal ranks are ever directly adjacent,
// yet plenty of connecting empty space exists). Union-find over cells:
// empty-empty and occupied-empty pairs connect; locked/unrevealed tiles are
// obstacles (never unioned) since a piece can't be dragged through them.
// Occupied-occupied pairs of different rank are deliberately NOT unioned —
// two same-rank items shouldn't be considered connected merely because an
// unrelated third item happens to sit between them with no way around.
function findReachableMerge(state) {
  const { rows, cols } = state
  const parent = Array.from({ length: rows * cols }, (_, i) => i)
  const idx = (r, c) => r * cols + c
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  function union(a, b) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  const isEmptyPassable = (r, c) => state.itemAt[r][c] == null && !state.locked[r][c]

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hereEmpty = isEmptyPassable(r, c)
      const hereOccupied = state.itemAt[r][c] != null
      if (!hereEmpty && !hereOccupied) continue // locked/unrevealed: obstacle
      for (const [dr, dc] of DELTAS) {
        const nr = r + dr
        const nc = c + dc
        if (!inBounds(state, nr, nc)) continue
        const thereEmpty = isEmptyPassable(nr, nc)
        const thereOccupied = state.itemAt[nr][nc] != null
        if (!thereEmpty && !thereOccupied) continue
        if (hereEmpty || thereEmpty) union(idx(r, c), idx(nr, nc))
      }
    }
  }

  // Group occupied cells by (connected component, rank), in row-major scan
  // order, so the result is deterministic.
  const byRoot = new Map()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rank = state.itemAt[r][c]
      if (rank == null) continue
      const root = find(idx(r, c))
      if (!byRoot.has(root)) byRoot.set(root, new Map())
      const byRank = byRoot.get(root)
      if (!byRank.has(rank)) byRank.set(rank, [])
      byRank.get(rank).push([r, c])
    }
  }

  // Same two-pass open-first priority as the direct-adjacent path (see its
  // comment) - an open-open pair anywhere on the board wins over any
  // open-subsidy pair, so reachable-merge doesn't undo that ordering.
  for (const requireBothOpen of [true, false]) {
    for (const byRank of byRoot.values()) {
      for (const cells of byRank.values()) {
        if (cells.length < 2) continue
        for (let i = 0; i < cells.length; i++) {
          for (let j = i + 1; j < cells.length; j++) {
            const [ar, ac] = cells[i]
            const [br, bc] = cells[j]
            const rank = state.itemAt[ar][ac]
            const hereMovable = !state.subsidyOrigin[ar][ac]
            const thereMovable = !state.subsidyOrigin[br][bc]
            if (requireBothOpen && !(hereMovable && thereMovable)) continue
            if (hereMovable && isEligibleReceiver(state, br, bc)) return { mover: [ar, ac], receiver: [br, bc], rank }
            if (thereMovable && isEligibleReceiver(state, ar, ac)) return { mover: [br, bc], receiver: [ar, ac], rank }
          }
        }
      }
    }
  }
  return null
}

function findLegalMerge(state) {
  return findDirectAdjacentMerge(state) ?? findReachableMerge(state)
}

function revealNeighbors(state, [r, c], recordRank, log) {
  for (const [dr, dc] of DELTAS) {
    const nr = r + dr
    const nc = c + dc
    if (!inBounds(state, nr, nc) || !state.locked[nr][nc]) continue
    if (state.blockedQueueIndex >= state.blockedQueue.length) continue
    const revealedRank = state.blockedQueue[state.blockedQueueIndex++]
    state.itemAt[nr][nc] = revealedRank
    state.locked[nr][nc] = false
    log?.({ type: 'reveal', cell: [nr, nc], rank: revealedRank, queuePosition: state.blockedQueueIndex })
    recordRank(revealedRank)
  }
}

function performMerge(state, merge, recordRank, log) {
  const [mr, mc] = merge.mover
  const [rr, rc] = merge.receiver
  const newRank = merge.rank + 1

  state.itemAt[rr][rc] = newRank
  state.itemAt[mr][mc] = null
  if (state.activeAnchorKey === null && state.subsidyOrigin[rr][rc]) {
    state.activeAnchorKey = cellKey(state, rr, rc)
  }

  log?.({ type: 'merge', from: [mr, mc], into: [rr, rc], rank: merge.rank, newRank })
  recordRank(newRank)
  // A merge "occurs" at both cells it touches — either can reveal a
  // neighboring locked tile.
  revealNeighbors(state, merge.mover, recordRank, log)
  revealNeighbors(state, merge.receiver, recordRank, log)
}

function findEmptyUnlockedCell(state) {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.itemAt[r][c] == null && !state.locked[r][c]) return [r, c]
    }
  }
  return null
}

// Prefer an empty cell adjacent to an existing item of the rank about to be
// spawned, so the spawn sets up an immediate merge. Always filling the first
// empty cell in scan order (regardless of rank) can converge into a
// checkerboard of alternating ranks where no two equal ranks are ever
// adjacent — a real player would place to merge, not spread out.
//
// Two tiers: an open-origin same-rank neighbor first (always good), then an
// eligible subsidy neighbor (only the committed anchor, or no anchor
// committed yet - see isEligibleReceiver) - a neighbor that's a subsidy cell
// but NOT the active anchor is skipped entirely, same as if it weren't there,
// since merging with it isn't legal anyway.
function findSpawnCell(state, rank) {
  return findSpawnCellNear(state, rank, true) ?? findSpawnCellNear(state, rank, false) ?? findEmptyUnlockedCell(state)
}

function findSpawnCellNear(state, rank, openOnly) {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.itemAt[r][c] != null || state.locked[r][c]) continue
      for (const [dr, dc] of DELTAS) {
        const nr = r + dr
        const nc = c + dc
        if (!inBounds(state, nr, nc) || state.itemAt[nr][nc] !== rank) continue
        if (openOnly && state.subsidyOrigin[nr][nc]) continue
        if (!isEligibleReceiver(state, nr, nc)) continue
        return [r, c]
      }
    }
  }
  return null
}

function currentMaxRank(state) {
  let max = 0
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.itemAt[r][c] != null && state.itemAt[r][c] > max) max = state.itemAt[r][c]
    }
  }
  return max
}

// Simulates a player working through `board`: greedily auto-merges any
// legal adjacent same-rank pair (deterministic tie-break via row-major scan),
// otherwise spends DR through the generator (tier-gated dynamically on the
// current max rank held, with deterministic EV-scheduled lucky drops) to
// spawn a new item into an empty unlocked cell. A merge reveals any locked
// blocked tile adjacent to either cell it touched, pulling the next item off
// the board's blockedQueue.
//
// Returns reachedAt: { [rank]: drSpentWhenFirstReached }, sparse — ranks
// never reached in this run are absent. `stopReason` explains why the run
// ended: 'max-rank-reached', 'no-legal-move', 'budget-exhausted', or
// 'max-steps' (a safety valve, not expected to trigger in practice).
//
// options.trace: true also returns `events`, a step-by-step log (initial
// board state, each spend/merge/reveal, each first-time-reached rank, and
// the final stop) — off by default so normal runs don't pay for it.
export function simulatePlaythrough(board, options = {}) {
  const { drBudget = Infinity, targetEv = DEFAULT_TARGET_EV, maxSteps = 20000, trace = false } = options

  const state = buildInitialState(board)
  const probs = computeProbs(targetEv)
  const nextBonus = createEvScheduler(probs)

  const events = trace ? [] : null
  const log = trace ? (e) => events.push({ drSpent, ...e }) : null

  let drSpent = 0
  const reachedAt = {}
  const recordRank = (rank) => {
    if (reachedAt[rank] === undefined) {
      reachedAt[rank] = drSpent
      log?.({ type: 'reached', rank })
    }
  }

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.itemAt[r][c] != null) {
        log?.({ type: 'initial', cell: [r, c], rank: state.itemAt[r][c] })
        recordRank(state.itemAt[r][c])
      }
    }
  }

  let stopReason = 'max-steps'
  for (let step = 0; step < maxSteps; step++) {
    if (reachedAt[MAX_RANK] !== undefined) {
      stopReason = 'max-rank-reached'
      break
    }

    const merge = findLegalMerge(state)
    if (merge) {
      performMerge(state, merge, recordRank, log)
      continue
    }

    if (!findEmptyUnlockedCell(state)) {
      stopReason = 'no-legal-move'
      break
    }

    const maxRankHeld = currentMaxRank(state)
    const tier = currentTier(maxRankHeld)
    if (drSpent + tier.cost > drBudget) {
      stopReason = 'budget-exhausted'
      break
    }

    drSpent += tier.cost
    // Lucky drops only open once the player holds a rank-7+ item — same
    // threshold as the x2 tier unlock. Before that, every spend is a
    // guaranteed normal roll; nextBonus() isn't called at all pre-unlock so
    // its deficit-round-robin scheduler starts converging toward targetEv
    // fresh from the first post-unlock spend, not diluted by forced-normal
    // spends that came before the gate opened.
    const bonus = maxRankHeld >= TIER2_UNLOCK_RANK ? nextBonus() : 0
    const spawnedRank = tier.normalRank + bonus
    const spawnCell = findSpawnCell(state, spawnedRank)
    state.itemAt[spawnCell[0]][spawnCell[1]] = spawnedRank
    log?.({ type: 'spend', tier: tier.cost, cell: spawnCell, rank: spawnedRank })
    recordRank(spawnedRank)
  }

  log?.({ type: 'stop', reason: stopReason })
  return trace ? { reachedAt, drSpent, stopReason, events } : { reachedAt, drSpent, stopReason }
}
