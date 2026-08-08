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

// Two same-rank items merge regardless of where they sit on the board - a
// player can always bring one to the other eventually, so position isn't a
// legality constraint (buildReachability's connected-open-space graph is
// still used separately for the interactive play tester's "move to an
// empty cell" check, just not for merge legality).
//
// Two passes: an open-open pair (neither side stuck) anywhere on the board
// first, a stuck-involving pair only if no open-open pair exists at all.
// This isn't required for correctness (a stuck item can be legally cleared
// any time a matching mover reaches it) but keeps freshly-built items
// flexible for as long as possible rather than committing them to whichever
// stuck item is found first.
function findLegalMerge(state) {
  return scanForMerge(state, true) ?? scanForMerge(state, false)
}

function scanForMerge(state, requireBothFree) {
  // Group all occupied cells by rank, row-major scan order, so the result
  // is deterministic.
  const byRank = new Map()
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const rank = state.itemAt[r][c]
      if (rank == null) continue
      if (!byRank.has(rank)) byRank.set(rank, [])
      byRank.get(rank).push([r, c])
    }
  }

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
  return null
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

// Prefer an empty cell adjacent to an existing item of the same rank, purely
// so the spend looks intentional (landing next to a matching item) rather
// than scattered - findLegalMerge doesn't care where anything sits, so this
// has no effect on which merge happens next, only on where the new item
// visually appears.
//
// Two tiers: a not-stuck same-rank neighbor first, then a still-stuck one -
// same cosmetic-only reasoning, preferring to look like it's building
// toward an open item before showing up next to a fixed one.
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

export function recordAllOccupied(state, recordRank) {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.itemAt[r][c] != null) recordRank(state.itemAt[r][c])
    }
  }
}

// Whether `state` has no remaining subsidy machinery at all - no unrevealed
// locked tile, no revealed-but-not-yet-cleared stuck item. This is the
// trigger condition for pushing the next board in as a fresh wave of rows:
// once true, there's nothing left on the board that isn't a fully free item.
export function boardIsCleared(state) {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.locked[r][c] || state.stuck[r][c]) return false
    }
  }
  return true
}

// Pushes `waveBoard`'s own tile pattern + semiPlacements/blockedQueue in as
// new rows at the top of `state`, shifting every existing row down by
// however many rows the wave contributes (its own `rows`, capped to 3 and to
// `state`'s own row count - a board used as a wave is meant to be a short
// 1-3 row strip, not a full board). Column counts are aligned top-left,
// best-effort, matching applyPresetToBoard's convention - any width mismatch
// just leaves the uncovered columns open (wave narrower than the state) or
// ignores the extra columns (wave wider than the state).
//
// Items shifted past the bottom edge are returned as a plain array of ranks
// (order: top-to-bottom, left-to-right of the row(s) that fell off) - by the
// time this runs the trigger condition (boardIsCleared) guarantees every
// occupied cell on the board is a fully free item, so there's no stuck/locked
// state to carry over for the overflowed cells, just ranks.
export function pushBoardIn(state, waveBoard) {
  const rows = Math.max(0, Math.min(waveBoard.rows, 3, state.rows))
  if (rows === 0) return { rows, overflow: [] }

  const cols = state.cols
  const overflow = []
  for (let r = state.rows - rows; r < state.rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (state.itemAt[r][c] != null) overflow.push(state.itemAt[r][c])
    }
  }

  for (let r = state.rows - 1; r >= rows; r--) {
    for (let c = 0; c < cols; c++) {
      state.itemAt[r][c] = state.itemAt[r - rows][c]
      state.stuck[r][c] = state.stuck[r - rows][c]
      state.locked[r][c] = state.locked[r - rows][c]
    }
  }

  const waveCols = Math.min(waveBoard.cols, cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      state.itemAt[r][c] = null
      state.stuck[r][c] = false
      state.locked[r][c] = c < waveCols && waveBoard.tiles[r][c] === 'blocked'
    }
  }
  for (const p of waveBoard.semiPlacements) {
    if (p.row < rows && p.col < waveCols) {
      state.itemAt[p.row][p.col] = p.rank
      state.stuck[p.row][p.col] = true
    }
  }

  state.blockedQueue = [...waveBoard.blockedQueue]
  state.blockedQueueIndex = 0

  return { rows, overflow }
}

// Repeatedly pushes in boards (starting at `nextBoardIndex`) while the
// current one is fully cleared (boardIsCleared) and boards remain - a wave
// board with no subsidy tiles/items of its own clears instantly, so this
// cascades straight through it to the next one rather than stalling.
// Overflowed items are appended to `inventory` (mutated in place). Calls
// `onPush(waveBoard, rows, overflow)` for each board pushed, if given -
// callers use this to log the event in their own shape. Returns the index of
// the next not-yet-consumed board.
export function advanceBoards(state, boards, nextBoardIndex, inventory, onPush) {
  let i = nextBoardIndex
  while (boardIsCleared(state) && i < boards.length) {
    const waveBoard = boards[i]
    const { rows, overflow } = pushBoardIn(state, waveBoard)
    inventory.push(...overflow)
    onPush?.(waveBoard, rows, overflow)
    i += 1
  }
  return i
}

// Simulates a player working through `boards` (an array; play starts on
// `boards[options.startIndex ?? 0]`): greedily auto-merges any legal pair
// (deterministic tie-break via row-major scan), else places a free item from
// the inventory into an empty unlocked cell if one's waiting, else spends DR
// through the generator (tier-gated dynamically on the current max rank
// held, with deterministic EV-scheduled lucky drops) to spawn a new item.
// Merge and inventory-placement are both free, so they're always preferred
// over spending new DR. A merge reveals any locked blocked tile adjacent to
// either cell it touched, pulling the next item off the board's blockedQueue.
//
// Once the active board has no locked or stuck cells left at all
// (boardIsCleared), the next board in `boards` (if any) pushes in as a fresh
// wave of rows from the top (see pushBoardIn) — repeating through as many
// boards as clear instantly, in order, until one doesn't or the array is
// exhausted. Items shifted off the bottom edge go into an inventory the
// greedy loop drains before spending any new DR.
//
// Returns reachedAt: { [rank]: drSpentWhenFirstReached }, sparse — ranks
// never reached in this run are absent. `stopReason` explains why the run
// ended: 'max-rank-reached', 'no-legal-move', 'budget-exhausted', or
// 'max-steps' (a safety valve, not expected to trigger in practice).
// `inventoryRemaining` is how many items were still sitting unplaced in the
// inventory when the run stopped (only possible with 'no-legal-move' or
// 'budget-exhausted' — the board ran out of room, or DR, before they could
// go back on).
//
// options.trace: true also returns `events`, a step-by-step log (initial
// board state, each spend/merge/reveal/board-push, each first-time-reached
// rank, and the final stop) — off by default so normal runs don't pay for it.
export function simulatePlaythrough(boards, options = {}) {
  const { startIndex = 0, drBudget = Infinity, targetEv = DEFAULT_TARGET_EV, maxSteps = 20000, trace = false } = options

  const state = buildInitialState(boards[startIndex])
  const probs = computeProbs(targetEv)
  const nextBonus = createEvScheduler(probs)
  const inventory = []

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

  let nextBoardIndex = advanceBoards(state, boards, startIndex + 1, inventory, (waveBoard, rows, overflow) =>
    log?.({ type: 'board-push', name: waveBoard.name, rows, overflow }),
  )
  recordAllOccupied(state, recordRank)

  let stopReason = 'max-steps'
  for (let step = 0; step < maxSteps; step++) {
    if (reachedAt[MAX_RANK] !== undefined) {
      stopReason = 'max-rank-reached'
      break
    }

    const merge = findLegalMerge(state)
    if (merge) {
      performMerge(state, merge, recordRank, log)
      nextBoardIndex = advanceBoards(state, boards, nextBoardIndex, inventory, (waveBoard, rows, overflow) =>
        log?.({ type: 'board-push', name: waveBoard.name, rows, overflow }),
      )
      recordAllOccupied(state, recordRank)
      continue
    }

    const invCell = inventory.length ? findEmptyUnlockedCell(state) : null
    if (invCell) {
      const rank = inventory.shift()
      state.itemAt[invCell[0]][invCell[1]] = rank
      log?.({ type: 'inventory-place', cell: invCell, rank })
      recordRank(rank)
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
  const result = { reachedAt, drSpent, stopReason, inventoryRemaining: inventory.length }
  return trace ? { ...result, events } : result
}
