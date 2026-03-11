import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import InvestigationTrace from '../components/InvestigationTrace'

function timeAgo(dateStr) {
  if (!dateStr) return 'N/A'
  const diff = Date.now() - new Date(dateStr).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 10) return 'Just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const SEV = {
  critical: { dot: 'bg-red-500', badge: 'bg-red-50 text-red-600 border-red-100', bar: 'border-l-red-500' },
  warning: { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-600 border-amber-100', bar: 'border-l-amber-500' },
  info: { dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-600 border-blue-100', bar: 'border-l-blue-500' },
}

const SCOPE_STYLES = {
  group: 'bg-indigo-50 text-indigo-500',
  device: 'bg-teal-50 text-teal-500',
}

const CONFIDENCE = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-red-50 text-red-700 border-red-200',
}

const INV_STATUS = {
  running: { dot: 'bg-violet-500 animate-pulse', text: 'text-violet-600', bg: 'bg-violet-50', label: 'Running' },
  completed: { dot: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Completed' },
  failed: { dot: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50', label: 'Failed' },
}

const filterBtn = (active) => `px-3 py-1.5 text-[12px] font-medium rounded-lg border transition-all ${
  active ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
}`

const SparkleIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" /></svg>
)

function normalizeMessage(msg) {
  if (!msg) return msg
  return msg.replace(/=\s*[\d.]+/g, '=_').replace(/[\d.]+[°%]/g, '_')
}

function groupAlerts(rawAlerts) {
  const map = {}
  for (const a of rawAlerts) {
    let key
    if (a.rule_id) {
      key = `${a.device_id}::${a.rule_id}`
    } else {
      key = `${a.device_id}::${normalizeMessage(a.message)}`
    }
    if (!map[key]) {
      map[key] = {
        key,
        device_id: a.device_id,
        rule_id: a.rule_id || '',
        rule_scope: a.rule_scope || '',
        severity: a.severity,
        message: a.message,
        latest_id: a.id,
        latest_at: a.created_at,
        first_at: a.created_at,
        count: 0,
        open_count: 0,
        all_ids: [],
      }
    }
    const g = map[key]
    g.count++
    if (!a.acknowledged) g.open_count++
    g.all_ids.push(a.id)
    if (a.created_at > g.latest_at) { g.latest_at = a.created_at; g.latest_id = a.id; g.message = a.message }
    if (a.created_at < g.first_at) g.first_at = a.created_at
    if (a.severity === 'critical') g.severity = 'critical'
  }
  return Object.values(map).sort((a, b) => (b.latest_at || '').localeCompare(a.latest_at || ''))
}

export default function Alerts() {
  const [rawAlerts, setRawAlerts] = useState([])
  const [devices, setDevices] = useState({})
  const [investigations, setInvestigations] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('alerts')
  const [sevFilter, setSevFilter] = useState('')
  const [scopeFilter, setScopeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [investigatingKey, setInvestigatingKey] = useState(null)
  const [runningInvId, setRunningInvId] = useState(null)
  const [selectedInvId, setSelectedInvId] = useState(null)
  const pollRef = useRef(null)
  const invPollRef = useRef(null)

  const fetchAlerts = useCallback(() => {
    api.get('/api/alerts').then(res => {
      setRawAlerts(res.data || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const fetchDevices = useCallback(() => {
    api.get('/api/devices').then(res => {
      const map = {}
      ;(res.data || []).forEach(d => { map[d.id] = d })
      setDevices(map)
    }).catch(() => {})
  }, [])

  const fetchInvestigations = useCallback(() => {
    api.get('/api/investigations').then(res => {
      setInvestigations(res.data || [])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetchAlerts()
    fetchDevices()
    fetchInvestigations()
    pollRef.current = setInterval(() => { fetchAlerts(); fetchInvestigations() }, 8000)
    return () => clearInterval(pollRef.current)
  }, [])

  const grouped = groupAlerts(rawAlerts)

  const filtered = grouped.filter(g => {
    if (sevFilter && g.severity !== sevFilter) return false
    if (scopeFilter && g.rule_scope !== scopeFilter) return false
    if (statusFilter === 'active' && g.open_count === 0) return false
    if (statusFilter === 'acknowledged' && g.open_count > 0) return false
    return true
  })

  const activeCount = grouped.filter(g => g.open_count > 0).length
  const criticalActive = grouped.filter(g => g.severity === 'critical' && g.open_count > 0).length
  const managedCount = grouped.filter(g => g.open_count === 0).length

  const handleAcknowledge = async (group) => {
    const openIds = group.all_ids.filter(id => {
      const a = rawAlerts.find(r => r.id === id)
      return a && !a.acknowledged
    })
    if (openIds.length === 0) return
    try {
      await api.put('/api/alerts/acknowledge-bulk', { alert_ids: openIds })
      setRawAlerts(prev => prev.map(a => openIds.includes(a.id) ? { ...a, acknowledged: true } : a))
    } catch {}
  }

  const handleInvestigate = async (group) => {
    setInvestigatingKey(group.key)
    try {
      const res = await api.post('/api/investigations', {
        alert_id: group.latest_id,
        device_id: group.device_id,
      })
      setRunningInvId(res.data.id)
      setInvestigations(prev => [res.data, ...prev])
      setActiveTab('investigations')
      setSelectedInvId(res.data.id)

      invPollRef.current = setInterval(async () => {
        try {
          const poll = await api.get(`/api/investigations/${res.data.id}`)
          setInvestigations(prev => prev.map(i => i.id === poll.data.id ? poll.data : i))
          if (poll.data.status === 'completed' || poll.data.status === 'failed') {
            clearInterval(invPollRef.current)
            invPollRef.current = null
            setRunningInvId(null)
          }
        } catch {}
      }, 3000)
    } catch {
      setInvestigatingKey(null)
    }
  }

  useEffect(() => () => { if (invPollRef.current) clearInterval(invPollRef.current) }, [])

  const selectedInv = selectedInvId ? investigations.find(i => i.id === selectedInvId) : null

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-40 bg-slate-200 rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-xl" />)}
          </div>
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-lg" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">Alerts</h2>
        <p className="text-sm text-slate-500 mt-0.5">Fleet-wide alert management and AI investigation</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <MiniStat label="Unique Alerts" value={grouped.length} color="text-slate-800" />
        <MiniStat label="Active" value={activeCount} color="text-amber-600" />
        <MiniStat label="Critical Active" value={criticalActive} color="text-red-600" />
        <MiniStat label="Managed" value={managedCount} color="text-emerald-600" />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm">
        <nav className="flex border-b border-slate-100 px-2">
          <button
            onClick={() => setActiveTab('alerts')}
            className={`relative flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 transition-all -mb-px ${
              activeTab === 'alerts' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <span className="relative">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>
              {activeCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white animate-pulse" />
              )}
            </span>
            Alerts
            {activeCount > 0 && (
              <span className="ml-1 text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{activeCount}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('investigations')}
            className={`relative flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 transition-all -mb-px ${
              activeTab === 'investigations' ? 'border-violet-600 text-violet-600' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <span className="relative">
              <SparkleIcon className="w-4 h-4" />
              {runningInvId && (
                <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-violet-500 rounded-full ring-2 ring-white animate-pulse" />
              )}
            </span>
            Investigations
            {investigations.length > 0 && (
              <span className="ml-1 text-[10px] font-bold bg-slate-200 text-slate-600 rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{investigations.length}</span>
            )}
          </button>
        </nav>

        <div className="p-5">
          {/* ========== ALERTS TAB ========== */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" /></svg>

                <button onClick={() => setStatusFilter('')} className={filterBtn(statusFilter === '')}>All</button>
                <button onClick={() => setStatusFilter('active')} className={filterBtn(statusFilter === 'active')}>Active</button>
                <button onClick={() => setStatusFilter('acknowledged')} className={filterBtn(statusFilter === 'acknowledged')}>Acknowledged</button>

                <span className="w-px h-5 bg-slate-200 mx-1" />
                <button onClick={() => setSevFilter('')} className={filterBtn(sevFilter === '')}>Any Severity</button>
                <button onClick={() => setSevFilter('critical')} className={filterBtn(sevFilter === 'critical')}>Critical</button>
                <button onClick={() => setSevFilter('warning')} className={filterBtn(sevFilter === 'warning')}>Warning</button>

                <span className="w-px h-5 bg-slate-200 mx-1" />
                <button onClick={() => setScopeFilter('')} className={filterBtn(scopeFilter === '')}>Any Scope</button>
                <button onClick={() => setScopeFilter('group')} className={filterBtn(scopeFilter === 'group')}>Group</button>
                <button onClick={() => setScopeFilter('device')} className={filterBtn(scopeFilter === 'device')}>Device</button>

                <span className="ml-auto text-[11px] text-slate-400 font-medium">{filtered.length} alert{filtered.length !== 1 ? 's' : ''}</span>
              </div>

              {filtered.length === 0 ? (
                <div className="py-12 text-center">
                  <svg className="w-10 h-10 text-emerald-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  <p className="text-sm font-medium text-slate-600">All clear</p>
                  <p className="text-[12px] text-slate-400 mt-0.5">{statusFilter === 'active' ? 'No active alerts right now' : 'No alerts match these filters'}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map(group => {
                    const sev = SEV[group.severity] || SEV.info
                    const dev = devices[group.device_id]
                    const isActive = group.open_count > 0
                    const isBeingInvestigated = investigatingKey === group.key && runningInvId

                    return (
                      <div
                        key={group.key}
                        className={`rounded-xl border border-slate-200/80 overflow-hidden border-l-4 ${isActive ? sev.bar : 'border-l-emerald-400'} transition-all ${
                          isBeingInvestigated ? 'ring-2 ring-violet-200' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 px-4 py-3 bg-white">
                          {/* Severity */}
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${sev.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                            {group.severity}
                          </span>

                          {/* Scope */}
                          {group.rule_scope && (
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${SCOPE_STYLES[group.rule_scope] || ''}`}>
                              {group.rule_scope}
                            </span>
                          )}

                          {/* Message + device */}
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] text-slate-700 truncate">{group.message}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {dev && (
                                <Link to={`/devices/${group.device_id}`} className="text-[11px] font-medium text-indigo-500 hover:text-indigo-700" onClick={e => e.stopPropagation()}>
                                  {dev.name}
                                </Link>
                              )}
                              <span className="text-[10px] text-slate-300">·</span>
                              <span className="text-[10px] text-slate-400">Active since {timeAgo(group.first_at)}</span>
                              {group.count > 1 && (
                                <>
                                  <span className="text-[10px] text-slate-300">·</span>
                                  <span className="text-[10px] text-slate-400">{group.count} occurrences</span>
                                </>
                              )}
                              <span className="text-[10px] text-slate-300">·</span>
                              <span className="text-[10px] text-slate-400">Last {timeAgo(group.latest_at)}</span>
                            </div>
                          </div>

                          {/* Status indicator */}
                          {isActive ? (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Active ({group.open_count})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 shrink-0">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                              Managed
                            </span>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleInvestigate(group)}
                              disabled={!!runningInvId}
                              className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1 bg-violet-50 text-violet-600 border border-violet-200 hover:bg-violet-100 disabled:opacity-50"
                            >
                              {isBeingInvestigated ? (
                                <span className="w-3 h-3 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
                              ) : (
                                <SparkleIcon className="w-3 h-3" />
                              )}
                              {isBeingInvestigated ? 'Running...' : 'Investigate'}
                            </button>
                            {isActive && (
                              <button
                                onClick={() => handleAcknowledge(group)}
                                className="text-[11px] px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-700 font-medium transition-all"
                              >
                                Acknowledge
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========== INVESTIGATIONS TAB ========== */}
          {activeTab === 'investigations' && (
            <div className="space-y-4">
              {investigations.length === 0 ? (
                <div className="py-12 text-center">
                  <SparkleIcon className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-500">No investigations yet</p>
                  <p className="text-[12px] text-slate-400 mt-0.5">Click "Investigate" on any alert to start an AI analysis</p>
                </div>
              ) : (
                <div className="flex gap-5">
                  {/* Investigation list */}
                  <div className="w-80 shrink-0 space-y-1 max-h-[600px] overflow-y-auto pr-1">
                    {investigations.map(inv => {
                      const st = INV_STATUS[inv.status] || INV_STATUS.completed
                      const isSelected = selectedInvId === inv.id
                      const dev = devices[inv.device_id]
                      return (
                        <button
                          key={inv.id}
                          onClick={() => setSelectedInvId(isSelected ? null : inv.id)}
                          className={`w-full text-left px-3 py-3 rounded-lg border transition-all ${
                            isSelected ? 'border-violet-200 bg-violet-50/50 shadow-sm' : 'border-transparent hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                            <span className={`text-[10px] font-semibold uppercase ${st.text}`}>{st.label}</span>
                            <span className="ml-auto text-[10px] text-slate-400">{timeAgo(inv.completed_at || inv.created_at)}</span>
                          </div>
                          <p className="text-[12px] text-slate-700 font-medium truncate">{dev?.name || inv.device_name || inv.device_id?.substring(0, 8)}</p>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">{inv.summary || inv.root_cause?.substring(0, 80) || 'Processing...'}</p>
                          {inv.confidence && (
                            <span className={`inline-block mt-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${CONFIDENCE[inv.confidence] || ''}`}>
                              {inv.confidence.toUpperCase()}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {/* Investigation detail */}
                  <div className="flex-1 min-w-0">
                    {selectedInv ? (
                      <InvestigationDetail inv={selectedInv} devices={devices} />
                    ) : (
                      <div className="flex items-center justify-center h-64 text-center">
                        <div>
                          <SparkleIcon className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                          <p className="text-[13px] text-slate-400">Select an investigation to view details</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InvestigationDetail({ inv, devices }) {
  const [detailView, setDetailView] = useState('summary')
  const dev = devices[inv.device_id]

  useEffect(() => {
    setDetailView('summary')
  }, [inv.id])

  if (inv.status === 'running') {
    return (
      <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100/80 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
            <span className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div>
            <p className="text-sm font-semibold text-violet-800">Agent Analyzing...</p>
            <p className="text-[11px] text-violet-500">{dev?.name || inv.device_name} — Correlating telemetry and reasoning</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {['Collecting Context', 'Querying Data', 'AI Reasoning'].map((label, i) => (
            <div key={i} className="flex items-center gap-2 bg-white/60 rounded-lg px-3 py-2">
              <span className="w-5 h-5 rounded-full bg-violet-200 text-violet-700 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
              <span className="text-[11px] text-violet-600 font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (inv.status === 'failed') {
    return (
      <div className="bg-red-50 border border-red-100 rounded-xl p-5 flex items-start gap-3">
        <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
        <div>
          <p className="text-sm font-medium text-red-700">Investigation failed</p>
          <p className="text-[12px] text-red-500 mt-1">{inv.root_cause || 'An unexpected error occurred.'}</p>
          <p className="text-[11px] text-red-400 mt-2">{inv.device_name || dev?.name} · {timeAgo(inv.created_at)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
          </div>
          <span className="text-[13px] font-semibold text-slate-800">Analysis Complete</span>
          <span className="text-[11px] text-slate-400">· {dev?.name || inv.device_name}</span>
          <span className="text-[11px] text-slate-400">· {timeAgo(inv.completed_at)}</span>
        </div>
        {inv.confidence && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CONFIDENCE[inv.confidence] || ''}`}>
            {inv.confidence.toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg w-fit">
        <button onClick={() => setDetailView('summary')} className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${detailView === 'summary' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          Summary
        </button>
        <button onClick={() => setDetailView('trace')} className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all flex items-center gap-1.5 ${detailView === 'trace' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>
          Agent Trace
          <span className="text-[9px] font-bold bg-violet-100 text-violet-600 rounded px-1 py-0.5">{inv.iterations}/{inv.tool_calls}</span>
        </button>
      </div>

      {detailView === 'summary' && (
        <div className="space-y-4">
          {inv.summary && <p className="text-[13px] text-slate-600 leading-relaxed bg-slate-50 rounded-lg px-4 py-3">{inv.summary}</p>}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-red-50/50 border border-red-100/80 rounded-lg p-4">
              <h4 className="text-[11px] font-semibold text-red-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                Root Cause
              </h4>
              <p className="text-[13px] text-slate-700 leading-relaxed">{inv.root_cause}</p>
            </div>
            <div className="bg-emerald-50/50 border border-emerald-100/80 rounded-lg p-4">
              <h4 className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" /></svg>
                Corrective Actions
              </h4>
              {inv.corrective_actions?.length > 0 ? (
                <ol className="space-y-1.5">
                  {inv.corrective_actions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-emerald-200 text-emerald-700 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <span className="text-[13px] text-slate-700 leading-relaxed">{action}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-[13px] text-slate-500">No specific actions recommended.</p>}
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <span className="text-[10px] text-slate-400 flex items-center gap-1"><SparkleIcon className="w-3 h-3" />Gemini AI</span>
            <span className="w-px h-3 bg-slate-200" />
            <span className="text-[10px] text-slate-400">{inv.iterations} iterations</span>
            <span className="w-px h-3 bg-slate-200" />
            <span className="text-[10px] text-slate-400">{inv.tool_calls} tool calls</span>
          </div>
        </div>
      )}

      {detailView === 'trace' && (
        <InvestigationTrace invId={inv.id} status={inv.status} />
      )}
    </div>
  )
}

function MiniStat({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm px-5 py-4">
      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-semibold mt-0.5 ${color}`}>{value}</p>
    </div>
  )
}
