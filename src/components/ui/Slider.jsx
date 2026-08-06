export default function Slider({ label, valueLabel, className = '', ...props }) {
  return (
    <label className={`text-sm flex flex-col gap-1.5 ${className}`}>
      <span className="font-medium text-slate-600 flex items-baseline justify-between">
        {label}
        {valueLabel && <span className="text-purple-600 font-semibold tabular-nums">{valueLabel}</span>}
      </span>
      <input type="range" className="w-full accent-purple-600" {...props} />
    </label>
  )
}
