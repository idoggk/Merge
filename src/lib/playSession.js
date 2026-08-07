import { currentTier, TIER2_UNLOCK_RANK } from './generatorTier'
import { DEFAULT_TARGET_EV, computeProbs, createEvScheduler } from './luckyDrop'
import {
  simulatePlaythrough,
  buildInitialState,
  inBounds,
  isEligibleReceiver,
  currentMaxRank,
  buildReachability,
  performMerge,
} from './mergeSimulation'

// An interactive counterpart to simulatePlaythrough: the same rule
// primitives (buildInitialState, isEligibleReceiver, buildReachability,
// performMerge, tier gating, lucky drops), but every action is player-
// initiated rather than picked by a greedy heuristic - built so the
// economist can manually play a board and compare what they did against
// what the automatic simulator predicts, on the exact same rules.
export function createPlaySession(board, { targetEv = DEFAULT_TARGET_EV } = {}) {
  const state = buildInitialState(board)
  const nextBonus = createEvScheduler(computeProbs(targetEv))
  const session = { board, state, nextBonus, drSpent: 0, reachedAt: {}, events: [], pendingSpawn: null }

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

// What the generator button would do right now, without spending anything -
// same tier/lucky-drop gating simulatePlaythrough uses, so the UI can show
// the player the cost and whether lucky drops are currently live.
export function generatorInfo(session) {
  const maxRankHeld = currentMaxRank(session.state)
  const tier = currentTier(maxRankHeld)
  return { cost: tier.cost, normalRank: tier.normalRank, luckyDropsActive: maxRankHeld >= TIER2_UNLOCK_RANK }
}

export function canSpendGenerator(session) {
  if (session.pendingSpawn) return false
  const { state } = session
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.itemAt[r][c] == null && !state.locked[r][c]) return true
    }
  }
  return false
}

// Spends DR and produces a pending item the player must then place with
// placeSpawn - unlike the auto-simulator's findSpawnCell heuristic, here the
// PLAYER decides where it lands, same as dragging a piece out of a real
// generator's dock.
export function spendGenerator(session) {
  if (!canSpendGenerator(session)) return session
  const { state } = session
  const maxRankHeld = currentMaxRank(state)
  const tier = currentTier(maxRankHeld)
  session.drSpent += tier.cost
  const bonus = maxRankHeld >= TIER2_UNLOCK_RANK ? session.nextBonus() : 0
  const rank = tier.normalRank + bonus
  session.pendingSpawn = { rank }
  logEvent(session, { type: 'spend', tier: tier.cost, rank })
  return session
}

export function canPlaceSpawn(session, r, c) {
  const { state } = session
  return !!session.pendingSpawn && inBounds(state, r, c) && state.itemAt[r][c] == null && !state.locked[r][c]
}

export function placeSpawn(session, r, c) {
  if (!canPlaceSpawn(session, r, c)) return session
  const { rank } = session.pendingSpawn
  session.state.itemAt[r][c] = rank
  session.pendingSpawn = null
  makeRecordRank(session)(rank)
  logEvent(session, { type: 'placed', cell: [r, c], rank })
  return session
}

function isMovable(state, r, c) {
  return state.itemAt[r][c] != null && !state.subsidyOrigin[r][c]
}

function areAdjacent(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1
}

// What clicking `to` after selecting `from` would do - 'move' (relocate to
// an empty, reachable cell), 'merge' (combine into a same-rank, eligible
// receiver), or null (not legal). The UI uses this both to dispatch on
// click and to highlight legal targets for the current selection.
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
  if (!isEligibleReceiver(state, tr, tc)) return null
  if (areAdjacent(from, to) || buildReachability(state).sameComponent(fr, fc, tr, tc)) return 'merge'
  return null
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
  performMerge(state, { mover: from, receiver: to, rank }, makeRecordRank(session), (e) => logEvent(session, e))
  return session
}

// Cell coordinates of the board's single committed subsidy anchor (see
// isEligibleReceiver in mergeSimulation.js), or null before any subsidy cell
// has been merged into - lets the UI highlight which one it locked onto.
export function activeAnchorCell(session) {
  const { state } = session
  if (state.activeAnchorKey === null) return null
  return [Math.floor(state.activeAnchorKey / state.cols), state.activeAnchorKey % state.cols]
}

// Runs the automatic simulator on this session's exact board, capped at the
// DR the player has spent so far, so the UI can show "the simulator thinks
// a typical playthrough would be at rank N by now" right next to what the
// player actually achieved by hand.
export function compareToSimulator(session) {
  return simulatePlaythrough(session.board, { drBudget: session.drSpent })
}
