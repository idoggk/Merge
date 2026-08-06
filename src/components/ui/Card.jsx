export default function Card({ title, subtitle, action, className = '', children }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}
