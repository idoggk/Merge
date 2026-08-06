import { MAX_RANK } from './ranks'
import { currentTier } from './generatorTier'
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
  // stuck: true for a semi tile that hasn't yet received its one qualifying
  // merge — its item can be merged INTO, but can't itself move/vacate.
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

function inBounds(state, r, c) {
  return r >= 0 && r < state.rows && c >= 0 && c < state.cols
}

// Fast path: two same-rank items sitting directly next to each other.
// Deterministic scan, row-major, checking neighbors up/down/left/right in
// that order — same pair of cells always resolves the same way.
function findDirectAdjacentMerge(state) {
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
        if (hereMovable) return { mover: [r, c], receiver: [nr, nc], rank }
        if (thereMovable) return { mover: [nr, nc], receiver: [r, c], rank }
        // Neither side can vacate (both un-cleared semi tiles) — not legal.
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

  for (const byRank of byRoot.values()) {
    for (const cells of byRank.values()) {
      if (cells.length < 2) continue
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const [ar, ac] = cells[i]
          const [br, bc] = cells[j]
          const rank = state.itemAt[ar][ac]
          if (!state.stuck[ar][ac]) return { mover: [ar, ac], receiver: [br, bc], rank }
          if (!state.stuck[br][bc]) return { mover: [br, bc], receiver: [ar, ac], rank }
        }
      }
    }
  }
  return null
}

function findLegalMerge(state) {
  return findDirectAdjacentMerge(state) ?? findReachableMerge(state)
}

function revealNeighbors(state, [r, c], recordRank) {
  for (const [dr, dc] of DELTAS) {
    const nr = r + dr
    const nc = c + dc
    if (!inBounds(state, nr, nc) || !state.locked[nr][nc]) continue
    if (state.blockedQueueIndex >= state.blockedQueue.length) continue
    const revealedRank = state.blockedQueue[state.blockedQueueIndex++]
    state.itemAt[nr][nc] = revealedRank
    state.locked[nr][nc] = false
    recordRank(revealedRank)
  }
}

function performMerge(state, merge, recordRank) {
  const [mr, mc] = merge.mover
  const [rr, rc] = merge.receiver
  const newRank = merge.rank + 1

  state.itemAt[rr][rc] = newRank
  state.itemAt[mr][mc] = null
  if (state.stuck[rr][rc]) state.stuck[rr][rc] = false // semi tile fully cleared

  recordRank(newRank)
  // A merge "occurs" at both cells it touches — either can reveal a
  // neighboring locked tile.
  revealNeighbors(state, merge.mover, recordRank)
  revealNeighbors(state, merge.receiver, recordRank)
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
function findSpawnCell(state, rank) {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.itemAt[r][c] != null || state.locked[r][c]) continue
      for (const [dr, dc] of DELTAS) {
        const nr = r + dr
        const nc = c + dc
        if (inBounds(state, nr, nc) && state.itemAt[nr][nc] === rank) return [r, c]
      }
    }
  }
  return findEmptyUnlockedCell(state)
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
export function simulatePlaythrough(board, options = {}) {
  const { drBudget = Infinity, targetEv = DEFAULT_TARGET_EV, maxSteps = 20000 } = options

  const state = buildInitialState(board)
  const probs = computeProbs(targetEv)
  const nextBonus = createEvScheduler(probs)

  let drSpent = 0
  const reachedAt = {}
  const recordRank = (rank) => {
    if (reachedAt[rank] === undefined) reachedAt[rank] = drSpent
  }

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.itemAt[r][c] != null) recordRank(state.itemAt[r][c])
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
      performMerge(state, merge, recordRank)
      continue
    }

    if (!findEmptyUnlockedCell(state)) {
      stopReason = 'no-legal-move'
      break
    }

    const tier = currentTier(currentMaxRank(state))
    if (drSpent + tier.cost > drBudget) {
      stopReason = 'budget-exhausted'
      break
    }

    drSpent += tier.cost
    const spawnedRank = tier.normalRank + nextBonus()
    const spawnCell = findSpawnCell(state, spawnedRank)
    state.itemAt[spawnCell[0]][spawnCell[1]] = spawnedRank
    recordRank(spawnedRank)
  }

  return { reachedAt, drSpent, stopReason }
}
