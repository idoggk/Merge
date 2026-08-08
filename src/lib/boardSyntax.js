// Draft export syntax for handing board configs off to Ops at "the finish
// line" - THIS FORMAT IS NOT FINAL, it's a stand-in until the real Ops
// syntax spec exists. Nothing else in the app reads this format or depends
// on its shape, so once the real spec is known, replace boardToSyntax (and
// boardsToSyntax, if the real spec bundles boards differently) wholesale -
// this file is the only place that needs to change.

const TILE_CHAR = { open: '.', semi: 'o', blocked: '#' }

function layoutLines(tiles) {
  return tiles.map((row) => row.map((s) => TILE_CHAR[s] ?? '?').join(''))
}

// `index` is this board's position in the board list, which doubles as the
// wave queue (see CLAUDE.md's "Board chaining" section) - index 0 is played
// directly from the start, every board after it pushes in as a wave once
// the previous one's blocked/semi tiles fully clear.
export function boardToSyntax(board, index) {
  const role = index === 0 ? 'START' : `WAVE ${index}`
  const lines = [
    `BOARD ${index + 1} "${board.name}" [${role}] ${board.rows}x${board.cols}`,
    'LAYOUT:',
    ...layoutLines(board.tiles),
    `CONFIG: blockedValue=${board.blockedValue} minRank=${board.minRank} maxRank=${board.maxRank}`,
  ]

  if (board.semiPlacements.length === 0 && board.blockedQueue.length === 0) {
    lines.push('SEQUENCE: (not generated yet)')
    return lines.join('\n')
  }

  const semi = board.semiPlacements.map((p) => `(${p.row},${p.col})=R${p.rank}`).join(' ')
  lines.push(`SEMI: ${semi || '(none)'}`)
  lines.push(`QUEUE: ${board.blockedQueue.map((r) => `R${r}`).join(',') || '(none)'}`)
  return lines.join('\n')
}

// The full board chain, in play order, as one document - what an Ops
// handoff would actually want (the whole sequence, not one board at a time).
export function boardsToSyntax(boards) {
  return boards.map((board, i) => boardToSyntax(board, i)).join('\n\n')
}
