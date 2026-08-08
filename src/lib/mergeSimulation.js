import { MAX_RANK } from './ranks'
import { currentTier, TIER2_UNLOCK_RANK } from './generatorTier'
import { DEFAULT_TARGET_EV, computeProbs, createEvScheduler } from './luckyDrop'

// 4-directional only — up/down/left/right, no diagonals.
export const DELTAS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

export function buildInitialState(board) {
  const { rows, cols, tiles, semiPlacements, blockedQueue } = board
  const itemAt = Array.from({ length: rows }, () => Array(cols).fill(null))
  // stuck: true for a subsidy item (semi tile from the start, or a blocked
  // tile the moment it's revealed) that hasn't yet received its one
  // qualifying merge. A stuck item can be merged INTO but can't itself be
  // the mover — a merge only happens when a same-rank item currently
  // sitting on an ordinary open tile (something the generator placed,
  // directly or by a few hops of open-open merges), or an already-cleared
  // former-subsidy item, reaches it. Once that merge happens the receiver
  // clears (stuck goes false) and becomes a completely normal item from
  // then on — "revealed but needs one more merge to fully clear" per the
  // domain spec, which applies the same way whether the tile started semi
  // or blocked. Two still-stuck items never merge with each other on their
  // own — that would be a free chain reaction with no player action (DR
  // spend) behind it anywhere in its history.
  const stuck = Array.from({ length: rows }, () => Array(cols).fill(false))
  // locked: true for a blocked tile with no item, not yet revealed.
  const locked = Array.from({ length: rows }, () => Array(cols).fill(false))

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r][c] === 'blocked') locked[r][c] = true
    }
  }
  for (const p of semiPlacements) {
    itemAt[p.row][p.col] = p.rank
    stuck[p.row][p.col] = true
  }

  return { rows, cols, itemAt, stuck, locked, blockedQueue: [...blockedQueue], blockedQueueIndex: 0 }
}

export function inBounds(state, r, c) {
  return r >= 0 && r < state.rows && c >= 0 && c < state.cols
}

// Fast path: two same-rank items sitting directly next to each other.
// Deterministic scan, row-major, checking neighbors up/down/left/right in
// that order — same pair of cells always resolves the same way.
//
// Two passes: open-open pairs (neither side stuck) first, stuck-involving
// pairs only if no open-open pair exists anywhere on the board right now.
// This isn't required for correctness (a stuck item can be legally cleared
// any time a matching mover reaches it) but keeps freshly-built items
// flexible for as long as possible rather than committing them to whichever
// stuck tile happens to be nearest.
function findDirectAdjacentMerge(state) {
  return scanDirectAdjacent(state, true) ?? scanDirectAdjacent(state, false)
}

function scanDirectAdjacent(state, requireBothFree) {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const rank = state.itemAt[r][c]
      if (rank == null) continue
      for (const [dr, dc] of DELTAS) {
        const nr = r + dr
        const nc = c + dc
        if (!inBounds(state, nr, nc) || state.itemAt[nr][nc] !== rank) continue

        const hereMovable = !state.stuck[r][c]
        const thereMovable = !state.stuck[nr][nc]
        if (requireBothFree && !(hereMovable && thereMovable)) continue
        if (hereMovable) return { mover: [r, c], receiver: [nr, nc], rank }
        if (thereMovable) return { mover: [nr, nc], receiver: [r, c], rank }
        // Neither side can vacate (both still-stuck subsidy items) — not legal.
      }
    }
  }
  return null
}

// Union-find over cells: empty-empty and occupied-empty pairs connect;
// locked/unrevealed tiles are obstacles (never unioned) since a piece can't
// be dragged through them. Occupied-occupied pairs are deliberately NOT
// unioned directly — two same-rank items shouldn't be considered connected
// merely because an unrelated third item happens to sit between them with
// no way around; only shared empty space connects them. This is what lets a
// player drag a piece across any open space to reach a match, not just one
// grid-step — otherwise generator spawns scattering across a big board
// could converge into a deadlock (e.g. a checkerboard of alternating ranks
// where no two equal ranks are ever directly adjacent, yet plenty of
// connecting empty space exists).
export function buildReachability(state) {
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

  return { find: (r, c) => find(idx(r, c)), sameComponent: (r1, c1, r2, c2) => find(idx(r1, c1)) === find(idx(r2, c2)) }
}

// Slow path: same-rank items connected via shared open space, not just
// directly adjacent (see buildReachability).
function findReachableMerge(state) {
  const { rows, cols } = state
  const reach = buildReachability(state)

  // Group occupied cells by (connected component, rank), in row-major scan
  // order, so the result is deterministic.
  const byRoot = new Map()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rank = state.itemAt[r][c]
      if (rank == null) continue
      const root = reach.find(r, c)
      if (!byRoot.has(root)) byRoot.set(root, new Map())
      const byRank = byRoot.get(root)
      if (!byRank.has(rank)) byRank.set(rank, [])
      byRank.get(rank).push([r, c])
    }
  }

  // Same two-pass open-first priority as the direct-adjacent path (see its
  // comment).
  for (const requireBothFree of [true, false]) {
    for (const byRank of byRoot.values()) {
      for (const cells of byRank.values()) {
        if (cells.length < 2) continue
        for (let i = 0; i < cells.length; i++) {
          for (let j = i + 1; j < cells.length; j++) {
            const [ar, ac] = cells[i]
            const [br, bc] = cells[j]
            const rank = state.itemAt[ar][ac]
            const hereMovable = !state.stuck[ar][ac]
            const thereMovable = !state.stuck[br][bc]
            if (requireBothFree && !(hereMovable && thereMovable)) continue
            if (hereMovable) return { mover: [ar, ac], receiver: [br, bc], rank }
            if (thereMovable) return { mover: [br, bc], receiver: [ar, ac], rank }
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

export function revealNeighbors(state, [r, c], recordRank, log) {
  for (const [dr, dc] of DELTAS) {
    const nr = r + dr
    const nc = c + dc
    if (!inBounds(state, nr, nc) || !state.locked[nr][nc]) continue
    if (state.blockedQueueIndex >= state.blockedQueue.length) continue
    const revealedRank = state.blockedQueue[state.blockedQueueIndex++]
    state.itemAt[nr][nc] = revealedRank
    state.locked[nr][nc] = false
    // Revealed but not yet cleared — see buildInitialState's comment on
    // `stuck`. Without this, a freshly-revealed blocked item was
    // immediately free to merge with ANY other same-rank item (including
    // another freshly-revealed one) with no player action behind it at
    // all, which is exactly how a single spend could cascade through an
    // entire board of blocked tiles for free.
    state.stuck[nr][nc] = true
    log?.({ type: 'reveal', cell: [nr, nc], rank: revealedRank, queuePosition: state.blockedQueueIndex })
    recordRank(revealedRank)
  }
}

export function performMerge(state, merge, recordRank, log, { revealAroundMover = true } = {}) {
  const [mr, mc] = merge.mover
  const [rr, rc] = merge.receiver
  const newRank = merge.rank + 1

  state.itemAt[rr][rc] = newRank
  state.itemAt[mr][mc] = null
  if (state.stuck[rr][rc]) state.stuck[rr][rc] = false // fully cleared — a normal item from here on

  log?.({ type: 'merge', from: [mr, mc], into: [rr, rc], rank: merge.rank, newRank })
  recordRank(newRank)
  // A merge "occurs" at both cells it touches — either can reveal a
  // neighboring locked tile. revealAroundMover exists for the interactive
  // play tester specifically: when a merge is a long-distance "drag across
  // open space" one (not directly adjacent), the mover's original cell is
  // just wherever it happened to start, with no visible connection to the
  // merge the player is watching happen at the receiver - revealing a tile
  // there reads as random and disconnected. The automatic simulator always
  // uses the default (true) and is unaffected either way.
  if (revealAroundMover) revealNeighbors(state, merge.mover, recordRank, log)
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
// Two tiers: a not-stuck same-rank neighbor first (always legal to merge
// into immediately), then a still-stuck one (legal too — the spawn itself
// is the mover — just deprioritized so fresh items consolidate with each
// other before committing a stuck tile's clearing to whichever is nearest).
export function findSpawnCell(state, rank) {
  return findSpawnCellNear(state, rank, true) ?? findSpawnCellNear(state, rank, false) ?? findEmptyUnlockedCell(state)
}

function findSpawnCellNear(state, rank, freeOnly) {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.itemAt[r][c] != null || state.locked[r][c]) continue
      for (const [dr, dc] of DELTAS) {
        const nr = r + dr
        const nc = c + dc
        if (!inBounds(state, nr, nc) || state.itemAt[nr][nc] !== rank) continue
        if (freeOnly && state.stuck[nr][nc]) continue
        return [r, c]
      }
    }
  }
  return null
}

export function currentMaxRank(state) {
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
