const colorMap = {
  online: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  offline: 'bg-red-50 text-red-700 ring-red-600/20',
  warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  critical: 'bg-red-50 text-red-700 ring-red-600/20',
  info: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  decommissioned: 'bg-slate-100 text-slate-500 ring-slate-400/20',
}

const dotMap = {
  online: 'bg-emerald-500',
  offline: 'bg-red-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  info: 'bg-blue-500',
  decommissioned: 'bg-slate-400',
}

export default function StatusBadge({ status }) {
  const classes = colorMap[status] || 'bg-slate-100 text-slate-700 ring-slate-600/20'
  const dot = dotMap[status] || 'bg-slate-500'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium capitalize ring-1 ring-inset ${classes}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  )
}
