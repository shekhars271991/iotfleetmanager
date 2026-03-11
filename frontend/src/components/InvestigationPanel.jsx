import { useState, useEffect, useRef } from 'react'
import api from '../api/client'

const CONFIDENCE_STYLES = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-red-50 text-red-700 border-red-200',
}

const SEVERITY_DOT = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const SparkleIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" /></svg>
)

export default function InvestigationSection({ deviceId, alertId, autoStart = false, onAutoStarted, embedded = false }) {
  const [investigation, setInvestigation] = useState(null)
  const [pastInvestigations, setPastInvestigations] = useState([])
  const [loading, setLoading] = useState(false)
  const [pastLoading, setPastLoading] = useState(true)
  const [selectedPastId, setSelectedPastId] = useState(null)
  const pollRef = useRef(null)
  const autoStarted = useRef(false)

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  useEffect(() => {
    api.get(`/api/investigations?device_id=${deviceId}`).then(res => {
      setPastInvestigations(res.data)
      setPastLoading(false)
    }).catch(() => setPastLoading(false))
  }, [deviceId])

  useEffect(() => {
    if (autoStart && alertId && !autoStarted.current) {
      autoStarted.current = true
      startInvestigation()
      if (onAutoStarted) onAutoStarted()
    }
  }, [autoStart, alertId])

  const startInvestigation = async () => {
    setLoading(true)
    setSelectedPastId(null)
    try {
      const res = await api.post('/api/investigations', { alert_id: alertId, device_id: deviceId })
      setInvestigation(res.data)
      pollRef.current = setInterval(async () => {
        try {
          const poll = await api.get(`/api/investigations/${res.data.id}`)
          setInvestigation(poll.data)
          if (poll.data.status === 'completed' || poll.data.status === 'failed') {
            clearInterval(pollRef.current)
            pollRef.current = null
            setLoading(false)
            setPastInvestigations(prev => [poll.data, ...prev.filter(p => p.id !== poll.data.id)])
          }
        } catch { /* keep polling */ }
      }, 3000)
    } catch {
      setLoading(false)
    }
  }

  const inv = investigation
  const isRunning = inv && inv.status === 'running'
  const isComplete = inv && inv.status === 'completed'
  const isFailed = inv && inv.status === 'failed'

  const selectedPast = selectedPastId ? pastInvestigations.find(p => p.id === selectedPastId) : null
  const displayInv = selectedPast || (isComplete || isFailed ? inv : null)

  return (
    <div className={embedded ? '' : 'bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden'}>
      {/* Header */}
      <div className={`flex items-center justify-between ${embedded ? 'mb-4' : 'px-5 py-4 border-b border-slate-100'}`}>
        {!embedded && (
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <SparkleIcon className="w-4 h-4 text-violet-500" />
            AI Investigation
          </h3>
        )}
        {embedded && <div />}
        {alertId ? (
          <button
            onClick={startInvestigation}
            disabled={loading || isRunning}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm shadow-violet-500/20 hover:from-violet-700 hover:to-indigo-700 transition-all disabled:opacity-50"
          >
            {(loading || isRunning) ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <SparkleIcon className="w-3.5 h-3.5" />
            )}
            {isRunning ? 'Investigating...' : 'New Investigation'}
          </button>
        ) : (
          <span className="text-[11px] text-slate-400">No alerts to investigate</span>
        )}
      </div>

      {/* Running state */}
      {isRunning && (
        <div className={embedded ? 'py-2' : 'px-5 py-5'}>
          <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100/80 rounded-xl p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                <span className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <div>
                <p className="text-sm font-semibold text-violet-800">Agent Analyzing...</p>
                <p className="text-[11px] text-violet-500">Correlating telemetry data and reasoning about root cause</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Collecting Context', icon: '1' },
                { label: 'Querying Data', icon: '2' },
                { label: 'AI Reasoning', icon: '3' },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-2 bg-white/60 rounded-lg px-3 py-2">
                  <span className="w-5 h-5 rounded-full bg-violet-200 text-violet-700 text-[10px] font-bold flex items-center justify-center">{step.icon}</span>
                  <span className="text-[11px] text-violet-600 font-medium">{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results display (current or selected past) */}
      {displayInv && displayInv.status === 'completed' && (
        <div className={`${embedded ? 'py-2' : 'px-5 py-5'} space-y-4`}>
          {/* Result header bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              </div>
              <span className="text-[13px] font-semibold text-slate-800">Analysis Complete</span>
              <span className="text-[11px] text-slate-400">{timeAgo(displayInv.completed_at)}</span>
            </div>
            <div className="flex items-center gap-2">
              {displayInv.confidence && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CONFIDENCE_STYLES[displayInv.confidence] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                  {displayInv.confidence.toUpperCase()}
                </span>
              )}
              {displayInv.severity && (
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[displayInv.severity] || 'bg-slate-400'}`} />
                  {displayInv.severity}
                </span>
              )}
            </div>
          </div>

          {/* Summary */}
          {displayInv.summary && (
            <p className="text-[13px] text-slate-600 leading-relaxed bg-slate-50 rounded-lg px-4 py-3">{displayInv.summary}</p>
          )}

          {/* Root cause & corrective actions side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Root Cause */}
            <div className="bg-red-50/50 border border-red-100/80 rounded-lg p-4">
              <h4 className="text-[11px] font-semibold text-red-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                Root Cause
              </h4>
              <p className="text-[13px] text-slate-700 leading-relaxed">{displayInv.root_cause}</p>
            </div>

            {/* Corrective Actions */}
            <div className="bg-emerald-50/50 border border-emerald-100/80 rounded-lg p-4">
              <h4 className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" /></svg>
                Corrective Actions
              </h4>
              {displayInv.corrective_actions && displayInv.corrective_actions.length > 0 ? (
                <ol className="space-y-1.5">
                  {displayInv.corrective_actions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-emerald-200 text-emerald-700 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <span className="text-[13px] text-slate-700 leading-relaxed">{action}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[13px] text-slate-500">No specific actions recommended.</p>
              )}
            </div>
          </div>

          {/* Meta footer */}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <SparkleIcon className="w-3 h-3" />
              Gemini AI
            </span>
            <span className="w-px h-3 bg-slate-200" />
            <span className="text-[10px] text-slate-400">{displayInv.iterations} iterations</span>
            <span className="w-px h-3 bg-slate-200" />
            <span className="text-[10px] text-slate-400">{displayInv.tool_calls} tool calls</span>
            {selectedPast && (
              <>
                <span className="w-px h-3 bg-slate-200" />
                <button onClick={() => setSelectedPastId(null)} className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium">
                  Clear selection
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Failed state */}
      {displayInv && displayInv.status === 'failed' && (
        <div className={embedded ? 'py-2' : 'px-5 py-5'}>
          <div className="bg-red-50 border border-red-100 rounded-lg p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
            <div>
              <p className="text-sm font-medium text-red-700">Investigation failed</p>
              <p className="text-[12px] text-red-500 mt-0.5">{displayInv.root_cause || 'An unexpected error occurred.'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Past investigations */}
      {!pastLoading && pastInvestigations.length > 0 && (
        <div className={embedded ? 'border-t border-slate-100 mt-4' : 'border-t border-slate-100'}>
          <div className={`${embedded ? '' : 'px-5'} py-3`}>
            <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">History</h4>
          </div>
          <div className="divide-y divide-slate-50">
            {pastInvestigations.slice(0, 5).map(p => {
              const isSelected = selectedPastId === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPastId(isSelected ? null : p.id)}
                  className={`w-full text-left ${embedded ? '' : 'px-5'} py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors rounded ${isSelected ? 'bg-indigo-50/50' : ''}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${p.status === 'completed' ? 'bg-emerald-500' : p.status === 'running' ? 'bg-violet-500 animate-pulse' : 'bg-red-400'}`} />
                    <span className="text-[12px] text-slate-700 font-medium truncate">{p.summary || p.root_cause?.substring(0, 60) || 'Investigation'}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {p.confidence && (
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${CONFIDENCE_STYLES[p.confidence] || ''}`}>
                        {p.confidence.toUpperCase()}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 w-12 text-right">{timeAgo(p.completed_at || p.created_at)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!alertId && pastInvestigations.length === 0 && !pastLoading && (
        <div className="px-5 py-8 text-center">
          <SparkleIcon className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No investigations yet</p>
          <p className="text-[11px] text-slate-300 mt-0.5">Alert rules must trigger before an investigation can run</p>
        </div>
      )}
    </div>
  )
}
