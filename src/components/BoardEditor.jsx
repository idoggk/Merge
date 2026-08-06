import { useMemo, useState } from 'react'
import { Wand2, BookmarkPlus, CheckCircle2, AlertTriangle } from 'lucide-react'
import BoardGrid from './BoardGrid'
import Card from './ui/Card'
import Button from './ui/Button'
import NumberField from './ui/NumberField'
import Slider from './ui/Slider'
import { resizeTiles } from '../lib/board'
import { placeItems } from '../lib/placement'
import { MIN_RANK, MAX_RANK } from '../lib/ranks'
import { applyPresetToBoard, createPreset } from '../lib/presets'

export default function BoardEditor({ board, isFirstBoard, presets, onChange, onSavePreset }) {
  const [noise, setNoise] = useState(0.15)
  const [presetName, setPresetName] = useState('')
  const [result, setResult] = useState(null)

  const blockedTileCount = useMemo(
    () => board.tiles.flat().filter((s) => s === 'blocked' || s === 'semi').length,
    [board.tiles],
  )

  function updateBoard(patch) {
    onChange({ ...board, ...patch })
    setResult(null)
  }

  function handleDimensionChange(rows, cols) {
    updateBoard({ rows, cols, tiles: resizeTiles(board.tiles, rows, cols) })
  }

  function handlePaint(r, c, state) {
    const tiles = board.tiles.map((row) => [...row])
    tiles[r][c] = state
    updateBoard({ tiles })
  }

  function handleFillAll(state) {
    const tiles = Array.from({ length: board.rows }, () => Array.from({ length: board.cols }, () => state))
    updateBoard({ tiles })
  }

  function handleGenerate() {
    setResult(placeItems(board, { isFirstBoard, noise }))
  }

  function handleApplyPreset(preset) {
    updateBoard({ tiles: applyPresetToBoard(preset, board.rows, board.cols) })
  }

  function handleSavePreset() {
    if (!presetName.trim()) return
    onSavePreset(createPreset(presetName.trim(), board))
    setPresetName('')
  }

  const sumOk = result && result.sum === board.blockedValue
  const countOk = result && result.itemCount === result.tileCount

  return (
    <div className="flex flex-wrap items-start gap-6">
      <Card
        title={board.name}
        subtitle={`${blockedTileCount} blocked/semi tile${blockedTileCount === 1 ? '' : 's'} to fill`}
        className="shrink-0"
      >
        <BoardGrid tiles={board.tiles} placements={result?.placements} onPaint={handlePaint} onFillAll={handleFillAll} />
      </Card>

      <div className="flex flex-col gap-6 flex-1 min-w-72">
        <Card title="Board size">
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Rows"
              min={1}
              max={20}
              value={board.rows}
              onChange={(e) => handleDimensionChange(Number(e.target.value) || 1, board.cols)}
            />
            <NumberField
              label="Columns"
              min={1}
              max={20}
              value={board.cols}
              onChange={(e) => handleDimensionChange(board.rows, Number(e.target.value) || 1)}
            />
          </div>
        </Card>

        <Card title="Subsidy & rank window" subtitle="Blocked-tile value and the allowed item rank range">
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Blocked value (DR)"
              className="col-span-2"
              min={0}
              value={board.blockedValue}
              onChange={(e) => updateBoard({ blockedValue: Number(e.target.value) || 0 })}
            />
            <NumberField
              label="Min rank"
              min={MIN_RANK}
              max={MAX_RANK}
              value={board.minRank}
              onChange={(e) => updateBoard({ minRank: Number(e.target.value) || MIN_RANK })}
            />
            <NumberField
              label="Max rank"
              min={MIN_RANK}
              max={MAX_RANK}
              value={board.maxRank}
              onChange={(e) => updateBoard({ maxRank: Number(e.target.value) || MAX_RANK })}
            />
          </div>
        </Card>

        <Card title="Placement" subtitle="Generate items and place them by distance-to-player">
          <div className="flex flex-col gap-4">
            <Slider
              label="Noise"
              valueLabel={noise.toFixed(2)}
              min={0}
              max={1}
              step={0.05}
              value={noise}
              onChange={(e) => setNoise(Number(e.target.value))}
            />

            <Button variant="primary" icon={Wand2} onClick={handleGenerate} className="w-full">
              Generate items
            </Button>

            {result && (
              <div className="flex flex-col gap-2 text-sm bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Sum vs. target</span>
                  <span className={`flex items-center gap-1 font-medium ${sumOk ? 'text-emerald-600' : 'text-red-600'}`}>
                    {sumOk ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {result.sum} / {board.blockedValue}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Items vs. tiles</span>
                  <span className={`flex items-center gap-1 font-medium ${countOk ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {countOk ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {result.itemCount} / {result.tileCount}
                  </span>
                </div>
                {!countOk && <p className="text-xs text-amber-600">Best-effort undershoot — rank window couldn't be fully satisfied.</p>}
              </div>
            )}
          </div>
        </Card>

        <Card title="Suggestions" subtitle="Save a layout you like, apply it elsewhere">
          <div className="flex flex-col gap-3">
            {presets.length === 0 ? (
              <p className="text-sm text-slate-400">No saved suggestions yet — design a layout, then save it below.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="text-left text-sm border border-slate-200 rounded-lg px-3 py-2 hover:border-purple-300 hover:bg-purple-50/50 transition-colors flex items-center justify-between"
                  >
                    <span className="text-slate-700">{preset.name}</span>
                    <span className="text-xs text-slate-400">{preset.rows}×{preset.cols}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Name this layout..."
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
              />
              <Button icon={BookmarkPlus} onClick={handleSavePreset}>
                Save
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
