export default function NumberField({ label, hint, className = '', ...props }) {
  return (
    <label className={`text-sm flex flex-col gap-1.5 ${className}`}>
      <span className="font-medium text-slate-600">{label}</span>
      <input
        type="number"
        className="border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 transition-shadow"
        {...props}
      />
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  )
}
