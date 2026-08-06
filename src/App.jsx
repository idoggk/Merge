import { useState } from 'react'
import { Save, Puzzle } from 'lucide-react'
import BoardList from './components/BoardList'
import BoardEditor from './components/BoardEditor'
import Button from './components/ui/Button'
import { createBoard, cloneBoard } from './lib/board'
import { loadState, saveState } from './lib/persistence'

function initialState() {
  const persisted = loadState()
  if (persisted?.boards?.length) {
    return {
      ...persisted,
      boards: persisted.boards.map((b) => ({ semiPlacements: [], blockedQueue: [], ...b })),
    }
  }
  const first = createBoard('Board 1')
  return { boards: [first], presets: [] }
}

function App() {
  const [state, setState] = useState(initialState)
  const { boards, presets } = state
  const [activeId, setActiveId] = useState(() => state.boards[0].id)
  const [savedAt, setSavedAt] = useState(null)

  const activeIndex = boards.findIndex((b) => b.id === activeId)
  const activeBoard = boards[activeIndex] ?? boards[0]

  function updateBoard(updated) {
    setState((s) => ({ ...s, boards: s.boards.map((b) => (b.id === updated.id ? updated : b)) }))
  }

  function addBoard() {
    const board = createBoard(`Board ${boards.length + 1}`)
    setState((s) => ({ ...s, boards: [...s.boards, board] }))
    setActiveId(board.id)
  }

  function duplicateBoard(id) {
    const board = boards.find((b) => b.id === id)
    const copy = cloneBoard(board)
    const idx = boards.findIndex((b) => b.id === id)
    setState((s) => ({ ...s, boards: [...s.boards.slice(0, idx + 1), copy, ...s.boards.slice(idx + 1)] }))
    setActiveId(copy.id)
  }

  function removeBoard(id) {
    if (boards.length <= 1) return
    setState((s) => ({ ...s, boards: s.boards.filter((b) => b.id !== id) }))
    if (activeId === id) {
      const remaining = boards.filter((b) => b.id !== id)
      setActiveId(remaining[0].id)
    }
  }

  function moveBoard(from, to) {
    if (to < 0 || to >= boards.length) return
    setState((s) => {
      const next = [...s.boards]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return { ...s, boards: next }
    })
  }

  function savePreset(preset) {
    setState((s) => ({ ...s, presets: [...s.presets, preset] }))
  }

  function handleSave() {
    saveState({ boards, presets })
    setSavedAt(new Date())
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-purple-600 text-white rounded-lg p-1.5">
              <Puzzle size={18} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-900 leading-tight">Merge Mania Board Simulator</h1>
              <p className="text-xs text-slate-400 leading-tight">Board layout &amp; item-placement design tool</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {savedAt && <span className="text-xs text-slate-400">Saved {savedAt.toLocaleTimeString()}</span>}
            <Button variant="dark" icon={Save} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 flex gap-8">
        <BoardList
          boards={boards}
          activeId={activeBoard?.id}
          onSelect={setActiveId}
          onAdd={addBoard}
          onDuplicate={duplicateBoard}
          onRemove={removeBoard}
          onMove={moveBoard}
        />
        {activeBoard && (
          <BoardEditor
            key={activeBoard.id}
            board={activeBoard}
            isFirstBoard={activeIndex === 0}
            presets={presets}
            onChange={updateBoard}
            onSavePreset={savePreset}
          />
        )}
      </main>
    </div>
  )
}

export default App
