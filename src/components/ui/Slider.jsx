export default function Slider({ label, valueLabel, className = '', ...props }) {
  return (
    <label className={`text-sm flex flex-col gap-1.5 ${className}`}>
      <span className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {valueLabel && <span className="text-purple-600 font-bold tabular-nums">{valueLabel}</span>}
      </span>
      <input type="range" className="w-full accent-purple-600" {...props} />
    </label>
  )
}
