import StatusBadge from './StatusBadge'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function AlertList({ alerts, onAcknowledge }) {
  if (!alerts.length) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-slate-400">No alerts</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {alerts.map(alert => (
        <div
          key={alert.id}
          className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-colors ${
            alert.acknowledged ? 'bg-slate-50/50 opacity-60' : 'bg-slate-50 hover:bg-slate-100/80'
          }`}
        >
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-slate-700 truncate leading-snug">{alert.message}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(alert.created_at)}</p>
          </div>
          <StatusBadge status={alert.severity} />
          {onAcknowledge && !alert.acknowledged && (
            <button
              onClick={() => onAcknowledge(alert.id)}
              className="text-[11px] px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-700 font-medium transition-all shadow-sm"
            >
              Ack
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
