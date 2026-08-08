import {
  simulatePlaythrough,
  buildInitialState,
  inBounds,
  buildReachability,
  performMerge,
  findSpawnCell,
  currentMaxRank,
  advanceBoards,
  recordAllOccupied,
} from './mergeSimulation'
import { currentTier, unlockedTiers } from './generatorTier'

// An interactive counterpart to simulatePlaythrough: the same merge/reveal
// rule primitives (buildInitialState, buildReachability, performMerge), but
// every merge/move is player-initiated rather than picked by a greedy
// heuristic - built so the economist can manually play a board and compare
// what they did against what the automatic simulator predicts.
//
// The generator unlocks tiers on the same schedule the automatic simulator
// uses (keyed off the player's current max rank held) - x1/1DR by default,
// x2/2DR once a rank-7 item is held, x4/4DR once a rank-10 item is held.
// Unlike the automatic simulator (which always greedily spends at the
// highest unlocked tier), the interactive tool lets the player pick ANY
// currently-unlocked tier - see unlockedGeneratorTiers/spendGenerator.
// Deliberately excluded: lucky-drop bonus ranks and manual spawn placement
// (still the same findSpawnCell heuristic the automatic simulator uses) -
// this tool exists to isolate and check merge/reveal mechanics by hand, and
// lucky-drop randomness or manual placement would only obscure that.
//
// `boards` is the full board list, and play starts on `boards[startIndex]` -
// every board after it is the wave queue: once the active board has no
// locked/stuck cells left at all, the next board in the list pushes in as a
// fresh strip of rows from the top (see mergeSimulation.js's pushBoardIn),
// and anything that falls off the bottom edge lands in `session.inventory`
// for the player to click back onto a free cell later (placeFromInventory).
export function createPlaySession(boards, startIndex = 0) {
  const state = buildInitialState(boards[startIndex])
  const session = {
    boards,
    boardIndex: startIndex,
    nextBoardIndex: startIndex + 1,
    state,
    drSpent: 0,
    reachedAt: {},
    events: [],
    inventory: [],
  }

  const recordRank = makeRecordRank(session)
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.itemAt[r][c] != null) {
        session.events.push({ drSpent: 0, type: 'initial', cell: [r, c], rank: state.itemAt[r][c] })
        recordRank(state.itemAt[r][c])
      }
    }
  }

  session.nextBoardIndex = advanceBoards(state, boards, session.nextBoardIndex, session.inventory, (waveBoard, rows, overflow) =>
    logEvent(session, { type: 'board-push', name: waveBoard.name, rows, overflow }),
  )
  recordAllOccupied(state, recordRank)

  return session
}

function makeRecordRank(session) {
  return (rank) => {
    if (session.reachedAt[rank] === undefined) {
      session.reachedAt[rank] = session.drSpent
      session.events.push({ drSpent: session.drSpent, type: 'reached', rank })
    }
  }
}

function logEvent(session, event) {
  session.events.push({ drSpent: session.drSpent, ...event })
}

export function canSpendGenerator(session) {
  const { state } = session
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.itemAt[r][c] == null && !state.locked[r][c]) return true
    }
  }
  return false
}

// The highest generator tier currently unlocked - the same dynamic
// (non-ratchet) gating the automatic simulator uses, re-evaluated off the
// player's CURRENT max rank held every time this is called.
export function currentGeneratorTier(session) {
  return currentTier(currentMaxRank(session.state))
}

// All tiers unlocked at the player's current max rank held, ascending by
// cost - unlike currentGeneratorTier (which mirrors the automatic
// simulator's "always spend at the highest unlocked tier" greed), this is
// for the interactive tool, where the player can choose ANY unlocked tier,
// not just the highest one.
export function unlockedGeneratorTiers(session) {
  return unlockedTiers(currentMaxRank(session.state))
}

// Spends `tier`'s DR cost and drops an item of its rank, placed using the
// same findSpawnCell heuristic the automatic simulator uses - the player
// doesn't choose where it lands, only which unlocked tier to spend at.
// Defaults to the highest unlocked tier (matching the automatic simulator's
// behavior) when the caller doesn't specify one.
export function spendGenerator(session, tier = currentGeneratorTier(session)) {
  if (!canSpendGenerator(session)) return session
  const { state } = session
  session.drSpent += tier.cost
  const cell = findSpawnCell(state, tier.normalRank)
  state.itemAt[cell[0]][cell[1]] = tier.normalRank
  logEvent(session, { type: 'spend', tier: tier.cost, cell, rank: tier.normalRank })
  makeRecordRank(session)(tier.normalRank)
  return session
}

function isMovable(state, r, c) {
  return state.itemAt[r][c] != null && !state.stuck[r][c]
}

// What clicking `to` after selecting `from` would do - 'move' (relocate to
// an empty cell, however far, via reachability - a piece can't be dragged
// through occupied tiles, so this still requires a connected path of open
// space) or 'merge' (combine into a same-rank item, stuck or not, anywhere
// on the board - position isn't a legality constraint for merging, matching
// the automatic simulator), or null (not legal). The UI uses this both to
// dispatch on click and to highlight legal targets for the current
// selection.
export function actionFor(session, from, to) {
  const { state } = session
  const [fr, fc] = from
  const [tr, tc] = to
  if (fr === tr && fc === tc) return null
  if (!isMovable(state, fr, fc)) return null
  if (!inBounds(state, tr, tc) || state.locked[tr][tc]) return null

  const targetItem = state.itemAt[tr][tc]
  if (targetItem == null) {
    return buildReachability(state).sameComponent(fr, fc, tr, tc) ? 'move' : null
  }
  return targetItem === state.itemAt[fr][fc] ? 'merge' : null
}

export function moveItem(session, from, to) {
  const { state } = session
  state.itemAt[to[0]][to[1]] = state.itemAt[from[0]][from[1]]
  state.itemAt[from[0]][from[1]] = null
  logEvent(session, { type: 'moved', from, to })
  return session
}

export function mergeItems(session, from, to) {
  const { state } = session
  const rank = state.itemAt[from[0]][from[1]]
  const recordRank = makeRecordRank(session)
  // Never reveal around the mover's original cell here, even when it's
  // directly adjacent to the receiver - see performMerge's comment. The
  // player watched the merge happen at `to`; a tile popping open next to
  // wherever the item used to sit, rather than next to where it ended up,
  // doesn't read as connected to the merge they were watching.
  performMerge(state, { mover: from, receiver: to, rank }, recordRank, (e) => logEvent(session, e), { revealAroundMover: false })
  // A merge is the only action that can clear the board's last locked/stuck
  // cell (moving/spending/inventory-placing only ever add or reposition
  // free items), so this is the only place a wave needs to be checked for.
  session.nextBoardIndex = advanceBoards(state, session.boards, session.nextBoardIndex, session.inventory, (waveBoard, rows, overflow) =>
    logEvent(session, { type: 'board-push', name: waveBoard.name, rows, overflow }),
  )
  recordAllOccupied(state, recordRank)
  return session
}

export function canPlaceFromInventory(session, index) {
  return index >= 0 && index < session.inventory.length
}

// Places inventory item `index` onto `to` if it's a free, unlocked, empty
// cell - the player picks the target themselves, unlike the generator's
// findSpawnCell heuristic. No-op (session unchanged) on an invalid target,
// same convention as actionFor's other invalid-move cases.
export function placeFromInventory(session, index, to) {
  const { state } = session
  if (!canPlaceFromInventory(session, index)) return session
  const [r, c] = to
  if (!inBounds(state, r, c) || state.itemAt[r][c] != null || state.locked[r][c]) return session

  const [rank] = session.inventory.splice(index, 1)
  state.itemAt[r][c] = rank
  logEvent(session, { type: 'inventory-place', cell: to, rank })
  makeRecordRank(session)(rank)
  return session
}

// Runs the automatic simulator on this session's exact board chain, capped
// at the DR the player has spent so far, so the UI can show "the simulator
// thinks a typical playthrough would be at rank N by now" right next to what
// the player actually achieved by hand.
export function compareToSimulator(session) {
  return simulatePlaythrough(session.boards, { startIndex: session.boardIndex, drBudget: session.drSpent })
}
