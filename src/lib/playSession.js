import { simulatePlaythrough, buildInitialState, inBounds, buildReachability, performMerge, findSpawnCell } from './mergeSimulation'

// An interactive counterpart to simulatePlaythrough: the same merge/reveal
// rule primitives (buildInitialState, buildReachability, performMerge), but
// every merge/move is player-initiated rather than picked by a greedy
// heuristic - built so the economist can manually play a board and compare
// what they did against what the automatic simulator predicts.
//
// The generator here always spawns a plain rank 1 for 1 DR - no tier
// gating, no lucky-drop bonus - and drops it using the same findSpawnCell
// placement heuristic the automatic simulator uses (the player doesn't pick
// where it lands). Those model the *automatic* simulator's aggregate
// pacing/placement; this tool exists to isolate and check merge/reveal
// mechanics by hand, and tier/lucky-drop randomness or manual placement
// would only obscure that.
export function createPlaySession(board) {
  const state = buildInitialState(board)
  const session = { board, state, drSpent: 0, reachedAt: {}, events: [] }

  const recordRank = makeRecordRank(session)
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.itemAt[r][c] != null) {
        session.events.push({ drSpent: 0, type: 'initial', cell: [r, c], rank: state.itemAt[r][c] })
        recordRank(state.itemAt[r][c])
      }
    }
  }
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

// Spends 1 DR and drops a rank-1 item using the same placement heuristic
// the automatic simulator uses - the player doesn't choose where it lands.
export function spendGenerator(session) {
  if (!canSpendGenerator(session)) return session
  const { state } = session
  session.drSpent += 1
  const cell = findSpawnCell(state, 1)
  state.itemAt[cell[0]][cell[1]] = 1
  logEvent(session, { type: 'spend', tier: 1, cell, rank: 1 })
  makeRecordRank(session)(1)
  return session
}

function isMovable(state, r, c) {
  return state.itemAt[r][c] != null && !state.stuck[r][c]
}

function areAdjacent(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1
}

// What clicking `to` after selecting `from` would do - 'move' (relocate to
// an empty cell, however far, via reachability - free repositioning across
// the board), 'merge' (combine into a directly adjacent same-rank item,
// stuck or not - merging specifically requires the two items to actually be
// next to each other on the board, unlike the automatic simulator's
// reachability-based merge heuristic), or null (not legal). The UI uses
// this both to dispatch on click and to highlight legal targets for the
// current selection.
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
  if (targetItem !== state.itemAt[fr][fc]) return null
  return areAdjacent(from, to) ? 'merge' : null
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
  // A long-distance (reachable-but-not-adjacent) merge doesn't reveal
  // around the mover's original cell - see performMerge's comment. The
  // player watched the merge happen at `to`; a tile popping open somewhere
  // near wherever the dragged item used to sit has no visible connection
  // to that and reads as a random, unrelated event.
  const options = { revealAroundMover: areAdjacent(from, to) }
  performMerge(state, { mover: from, receiver: to, rank }, makeRecordRank(session), (e) => logEvent(session, e), options)
  return session
}

// Runs the automatic simulator on this session's exact board, capped at the
// DR the player has spent so far, so the UI can show "the simulator thinks
// a typical playthrough would be at rank N by now" right next to what the
// player actually achieved by hand.
export function compareToSimulator(session) {
  return simulatePlaythrough(session.board, { drBudget: session.drSpent })
}
