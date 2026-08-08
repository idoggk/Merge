export default function NumberField({ label, hint, className = '', ...props }) {
  return (
    <label className={`text-sm flex flex-col gap-1.5 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type="number"
        className="border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-medium bg-white/70 focus:outline-none focus:ring-4 focus:ring-purple-200/60 focus:border-purple-400 transition-shadow"
        {...props}
      />
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  )
}
