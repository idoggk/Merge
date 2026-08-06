const VARIANTS = {
  primary: 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm',
  dark: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
  ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
  danger: 'text-slate-400 hover:bg-red-50 hover:text-red-600',
}

const SIZES = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5',
  md: 'text-sm px-3.5 py-2 gap-2',
}

export default function Button({ variant = 'secondary', size = 'md', icon: Icon, className = '', children, ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2.25} />}
      {children}
    </button>
  )
}
