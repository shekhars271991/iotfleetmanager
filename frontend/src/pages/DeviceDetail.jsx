import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import StatusBadge from '../components/StatusBadge'
import DeviceForm from '../components/DeviceForm'
import RulesPanel from '../components/RulesPanel'
import InvestigationTrace from '../components/InvestigationTrace'

function timeAgo(dateStr) {
  if (!dateStr) return 'N/A'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatTs(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleTimeString()
}

const METRIC_LABELS = {
  temp: { label: 'Temperature', unit: '°C', color: 'text-orange-600', bg: 'bg-orange-50' },
  humidity: { label: 'Humidity', unit: '%', color: 'text-blue-600', bg: 'bg-blue-50' },
  battery_pct: { label: 'Battery', unit: '%', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  cpu_usage: { label: 'CPU Usage', unit: '%', color: 'text-violet-600', bg: 'bg-violet-50' },
  mem_usage: { label: 'Memory', unit: '%', color: 'text-cyan-600', bg: 'bg-cyan-50' },
  uplink_kbps: { label: 'Uplink', unit: 'kbps', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  position: { label: 'Position', unit: '%', color: 'text-teal-600', bg: 'bg-teal-50' },
  power_on: { label: 'Power', unit: '', color: 'text-amber-600', bg: 'bg-amber-50' },
  fps: { label: 'FPS', unit: '', color: 'text-rose-600', bg: 'bg-rose-50' },
  storage_pct: { label: 'Storage', unit: '%', color: 'text-slate-600', bg: 'bg-slate-100' },
  pressure: { label: 'Pressure', unit: 'hPa', color: 'text-sky-600', bg: 'bg-sky-50' },
  noise_db: { label: 'Noise', unit: 'dB', color: 'text-pink-600', bg: 'bg-pink-50' },
  vibration: { label: 'Vibration', unit: 'g', color: 'text-red-600', bg: 'bg-red-50' },
  lux: { label: 'Light', unit: 'lx', color: 'text-yellow-600', bg: 'bg-yellow-50' },
}

function formatValue(metric, value) {
  if (value === null || value === undefined) return 'N/A'
  if (metric === 'power_on') return value ? 'ON' : 'OFF'
  const meta = METRIC_LABELS[metric]
  return `${value}${meta?.unit ? ' ' + meta.unit : ''}`
}

const TABS = [
  { id: 'info', label: 'Device Information', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>
  )},
  { id: 'telemetry', label: 'Telemetry', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
  )},
  { id: 'rules', label: 'Alert Rules', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
  )},
  { id: 'alerts_ai', label: 'Alerts', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>
  )},
  { id: 'investigations', label: 'Investigations', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" /></svg>
  )},
]

export default function DeviceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const autoInvestigateAlertId = searchParams.get('investigate')
  const [device, setDevice] = useState(null)
  const [groups, setGroups] = useState([])
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [telemetry, setTelemetry] = useState([])
  const [aggResults, setAggResults] = useState([])
  const [latestAlert, setLatestAlert] = useState(null)
  const [activeTab, setActiveTab] = useState(autoInvestigateAlertId ? 'alerts_ai' : 'info')
  const [deviceAlerts, setDeviceAlerts] = useState([])
  const [deviceInvestigations, setDeviceInvestigations] = useState([])
  const [selectedInvId, setSelectedInvId] = useState(null)
  const [runningInvId, setRunningInvId] = useState(null)
  const intervalRef = useRef(null)
  const invPollRef = useRef(null)

  useEffect(() => {
    Promise.all([
      api.get(`/api/devices/${id}`),
      api.get('/api/groups'),
      api.get(`/api/devices/${id}/telemetry?limit=50`),
      api.get(`/api/devices/${id}/aggregations`),
    ]).then(([devRes, grpRes, telRes, aggRes]) => {
      setDevice(devRes.data)
      setGroups(grpRes.data)
      setTelemetry(telRes.data)
      setAggResults(aggRes.data)
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      api.get(`/api/devices/${id}/telemetry?limit=50`).then(res => setTelemetry(res.data)).catch(() => {})
      api.get(`/api/devices/${id}`).then(res => setDevice(res.data)).catch(() => {})
      api.get(`/api/devices/${id}/aggregations`).then(res => setAggResults(res.data)).catch(() => {})
    }, 15000)
    return () => clearInterval(intervalRef.current)
  }, [id])

  const fetchInvs = useCallback(() => {
    api.get(`/api/investigations?device_id=${id}`).then(res => setDeviceInvestigations(res.data || [])).catch(() => {})
  }, [id])

  useEffect(() => {
    const fetchAlerts = () => {
      api.get(`/api/alerts?device_id=${id}`).then(res => {
        setDeviceAlerts(res.data || [])
        if (res.data && res.data.length > 0) setLatestAlert(res.data[0])
      }).catch(() => {})
    }
    fetchAlerts()
    fetchInvs()
    const alertInterval = setInterval(() => { fetchAlerts(); fetchInvs() }, 15000)
    return () => clearInterval(alertInterval)
  }, [id])

  useEffect(() => () => { if (invPollRef.current) clearInterval(invPollRef.current) }, [])

  const handleUpdate = async (form) => {
    const res = await api.put(`/api/devices/${id}`, form)
    setDevice(res.data)
    setEditing(false)
  }

  const groupedAlerts = (() => {
    const normalize = (msg) => msg ? msg.replace(/=\s*[\d.]+/g, '=_').replace(/[\d.]+[°%]/g, '_') : msg
    const map = {}
    for (const a of deviceAlerts) {
      const key = a.rule_id ? `${a.device_id}::${a.rule_id}` : `${a.device_id}::${normalize(a.message)}`
      if (!map[key]) {
        map[key] = { key, severity: a.severity, message: a.message, rule_scope: a.rule_scope || '', latest_id: a.id, latest_at: a.created_at, first_at: a.created_at, count: 0, open_count: 0, all_ids: [] }
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
  })()

  const handleAcknowledgeGroup = async (group) => {
    const openIds = group.all_ids.filter(aid => { const a = deviceAlerts.find(r => r.id === aid); return a && !a.acknowledged })
    if (openIds.length === 0) return
    try {
      await api.put('/api/alerts/acknowledge-bulk', { alert_ids: openIds })
      setDeviceAlerts(prev => prev.map(a => openIds.includes(a.id) ? { ...a, acknowledged: true } : a))
    } catch {}
  }

  const handleInvestigateGroup = async (group) => {
    try {
      const res = await api.post('/api/investigations', { alert_id: group.latest_id, device_id: id })
      setRunningInvId(res.data.id)
      setDeviceInvestigations(prev => [res.data, ...prev])
      setActiveTab('investigations')
      setSelectedInvId(res.data.id)
      invPollRef.current = setInterval(async () => {
        try {
          const poll = await api.get(`/api/investigations/${res.data.id}`)
          setDeviceInvestigations(prev => prev.map(i => i.id === poll.data.id ? poll.data : i))
          if (poll.data.status === 'completed' || poll.data.status === 'failed') {
            clearInterval(invPollRef.current)
            invPollRef.current = null
            setRunningInvId(null)
          }
        } catch {}
      }, 3000)
    } catch {}
  }

  const handleDecommission = async () => {
    if (!confirm('Decommission this device? It will be taken out of active service.')) return
    const res = await api.put(`/api/devices/${id}/decommission`)
    setDevice(res.data)
  }

  const handleRecommission = async () => {
    if (!confirm('Recommission this device? It will be set back to online.')) return
    const res = await api.put(`/api/devices/${id}/recommission`)
    setDevice(res.data)
  }

  const handleDelete = async () => {
    if (!confirm('Permanently delete this device? This cannot be undone.')) return
    await api.delete(`/api/devices/${id}`)
    navigate('/devices')
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-slate-200 rounded" />
          <div className="h-12 bg-slate-100 rounded-xl" />
          <div className="h-48 bg-slate-100 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!device) {
    return <div className="p-8"><p className="text-red-500">Device not found</p></div>
  }

  const groupName = groups.find(g => g.id === device.group_id)?.name || 'None'
  const deviceMetric = device.metric_type || ''
  const metricMeta = METRIC_LABELS[deviceMetric] || null
  const latest = telemetry.length > 0 ? telemetry[0] : null

  return (
    <div className="p-8 space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/devices')}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">{device.name}</h2>
              <StatusBadge status={device.status} />
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              <span className="font-mono text-[11px] text-slate-400">{device.id?.substring(0, 8)}</span>
              <span className="mx-1.5 text-slate-300">&middot;</span>
              {device.location || 'No location'}
              <span className="mx-1.5 text-slate-300">&middot;</span>
              <span className="capitalize">{device.type}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {device.status !== 'decommissioned' && (
            <button
              onClick={() => { setActiveTab('info'); setEditing(!editing) }}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all shadow-sm ${
                editing ? 'bg-white text-slate-600 border border-slate-200' : 'bg-indigo-600 text-white shadow-indigo-500/20 hover:bg-indigo-700'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
              {editing ? 'Cancel' : 'Edit'}
            </button>
          )}
          {device.status !== 'decommissioned' ? (
            <button
              onClick={handleDecommission}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-white text-slate-500 border border-slate-200 hover:bg-slate-50 hover:text-slate-700 transition-all shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3l1.664 1.664M21 21l-1.5-1.5m-5.533-1.967a3.75 3.75 0 0 1-5.3-5.3m5.3 5.3-5.3-5.3m5.3 5.3L12 17.25m-3.533-3.967L3 8.25m4.5 4.5 1.967-1.967" /></svg>
              Decommission
            </button>
          ) : (
            <button
              onClick={handleRecommission}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-500/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" /></svg>
              Recommission
            </button>
          )}
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-white text-red-500 border border-slate-200 hover:bg-red-50 hover:border-red-200 transition-all shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
            Delete
          </button>
        </div>
      </div>

      {/* Decommissioned Banner */}
      {device.status === 'decommissioned' && (
        <div className="bg-slate-100 border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
          <div>
            <p className="text-sm font-medium text-slate-700">This device has been decommissioned</p>
            <p className="text-[11px] text-slate-400 mt-0.5">It is no longer part of active fleet operations. You can recommission it to bring it back online.</p>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm">
        <nav className="flex border-b border-slate-100 px-2">
          {TABS.map(tab => {
            const activeAlerts = tab.id === 'alerts_ai' ? groupedAlerts.filter(g => g.open_count > 0).length : 0
            const hasRunning = tab.id === 'investigations' && !!runningInvId
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 transition-all -mb-px ${
                  activeTab === tab.id
                    ? (tab.id === 'investigations' ? 'border-violet-600 text-violet-600' : 'border-indigo-600 text-indigo-600')
                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200'
                }`}
              >
                <span className="relative">
                  {tab.icon}
                  {tab.id === 'alerts_ai' && activeAlerts > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white animate-pulse" />
                  )}
                  {hasRunning && (
                    <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-violet-500 rounded-full ring-2 ring-white animate-pulse" />
                  )}
                </span>
                {tab.label}
                {tab.id === 'alerts_ai' && activeAlerts > 0 && (
                  <span className="ml-1 text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{activeAlerts}</span>
                )}
                {tab.id === 'investigations' && deviceInvestigations.length > 0 && (
                  <span className="ml-1 text-[10px] font-bold bg-slate-200 text-slate-600 rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{deviceInvestigations.length}</span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Tab Content */}
        <div className="p-5">
          {/* ===== DEVICE INFORMATION ===== */}
          {activeTab === 'info' && (
            <div className="space-y-5">
              {editing && (
                <div>
                  <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Edit Device</h4>
                  <DeviceForm device={device} groups={groups} onSubmit={handleUpdate} onCancel={() => setEditing(false)} />
                </div>
              )}

              {!editing && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-100 rounded-lg overflow-hidden border border-slate-100">
                    <InfoCell label="Device ID" value={device.id ? device.id.substring(0, 8) : 'N/A'} mono />
                    <InfoCell label="IP Address" value={device.ip_address || 'N/A'} mono />
                    <InfoCell label="Firmware" value={device.firmware_ver || 'N/A'} />
                    <InfoCell label="Group" value={groupName} />
                    <InfoCell label="Type" value={device.type} />
                    <InfoCell label="Status" value={device.status} />
                    <InfoCell label="Location" value={device.location || 'N/A'} />
                    <InfoCell label="Last Seen" value={timeAgo(device.last_seen)} />
                    <InfoCell label="Coordinates" value={device.latitude && device.longitude ? `${device.latitude}, ${device.longitude}` : 'N/A'} />
                    <InfoCell label="Redundancy Group" value={device.redundancy_group || 'None'} />
                    <InfoCell label="Created" value={device.created_at ? new Date(device.created_at).toLocaleDateString() : 'N/A'} />
                    <InfoCell label="Reports" value={metricMeta ? metricMeta.label : (deviceMetric || 'Not defined')} />
                  </div>

                  {device.tags && Object.keys(device.tags).length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Tags</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(device.tags).map(([k, v]) => (
                          <span key={k} className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[11px] font-medium rounded-md">{k}={v}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ===== TELEMETRY ===== */}
          {activeTab === 'telemetry' && (
            <div className="space-y-5">
              {/* Live reading */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Live Reading</h4>
                    {latest && (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live
                      </span>
                    )}
                  </div>
                  {latest && <span className="text-[11px] text-slate-400">{formatTs(latest.timestamp)}</span>}
                </div>
                {latest ? (() => {
                  const m = latest.metric || deviceMetric
                  const meta = METRIC_LABELS[m] || { label: m, unit: '', color: 'text-slate-800', bg: 'bg-slate-50' }
                  return (
                    <div className={`rounded-xl p-5 ${meta.bg} border border-slate-100`}>
                      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">{meta.label}</p>
                      <p className={`text-4xl font-semibold tracking-tight ${meta.color}`}>
                        {formatValue(m, latest.value)}
                      </p>
                    </div>
                  )
                })() : (
                  <div className="text-center py-10 bg-slate-50 rounded-lg">
                    <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
                    <p className="text-sm text-slate-400">Waiting for telemetry data...</p>
                    <p className="text-[11px] text-slate-300 mt-1">Data appears once the producer is running</p>
                  </div>
                )}
              </div>

              {/* Aggregations */}
              {aggResults.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Aggregations</h4>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {aggResults.map((r, i) => {
                      const meta = METRIC_LABELS[r.metric]
                      const windowStr = r.window_secs < 3600 ? `${r.window_secs / 60}m` : r.window_secs < 86400 ? `${r.window_secs / 3600}h` : `${r.window_secs / 86400}d`
                      return (
                        <div key={i} className="bg-slate-50 rounded-lg p-3">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${r.level === 'group' ? 'bg-indigo-50 text-indigo-600' : 'bg-teal-50 text-teal-600'}`}>
                              {r.level === 'group' ? 'Group' : 'Device'}
                            </span>
                            <span className="text-[10px] text-slate-400">{windowStr}</span>
                          </div>
                          <p className="text-[11px] font-medium text-slate-500 mb-0.5">{r.job_name || `${r.function.toUpperCase()}(${meta?.label || r.metric})`}</p>
                          <p className={`text-xl font-semibold tracking-tight ${meta?.color || 'text-slate-800'}`}>
                            {r.value !== null ? r.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'N/A'}
                            {meta?.unit && <span className="text-xs font-normal text-slate-400 ml-1">{meta.unit}</span>}
                          </p>
                          <p className="text-[10px] text-slate-300 mt-0.5">{r.sample_count} samples</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* History table */}
              {telemetry.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">History</h4>
                    <span className="text-[11px] text-slate-400">Auto-refresh &middot; {telemetry.length} readings</span>
                  </div>
                  <div className="overflow-x-auto border border-slate-100 rounded-lg">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Time</th>
                          <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                            {metricMeta?.label || deviceMetric || 'Value'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {telemetry.slice(0, 30).map((row, i) => (
                          <tr key={i} className={i === 0 ? 'bg-indigo-50/40' : 'hover:bg-slate-50/50'}>
                            <td className="px-4 py-2 text-[13px] text-slate-500 font-mono">{formatTs(row.timestamp)}</td>
                            <td className={`px-4 py-2 text-[13px] font-medium ${metricMeta?.color || 'text-slate-700'}`}>
                              {formatValue(row.metric || deviceMetric, row.value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== ALERT RULES ===== */}
          {activeTab === 'rules' && (
            <RulesPanel scope="device" scopeId={id} embedded />
          )}

          {/* ===== ALERTS ===== */}
          {activeTab === 'alerts_ai' && (
            <div className="space-y-2">
              {groupedAlerts.length > 0 ? groupedAlerts.map(group => {
                const isActive = group.open_count > 0
                const sevCls = group.severity === 'critical' ? 'border-l-red-500' : group.severity === 'warning' ? 'border-l-amber-500' : 'border-l-blue-500'
                return (
                  <div key={group.key} className={`rounded-lg border border-slate-100 overflow-hidden border-l-4 ${isActive ? sevCls : 'border-l-emerald-400'}`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${
                        group.severity === 'critical' ? 'bg-red-50 text-red-600 border-red-100' : group.severity === 'warning' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${group.severity === 'critical' ? 'bg-red-500' : group.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                        {group.severity}
                      </span>
                      {group.rule_scope && (
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                          group.rule_scope === 'group' ? 'bg-indigo-50 text-indigo-500' : 'bg-teal-50 text-teal-500'
                        }`}>{group.rule_scope}</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-slate-700 truncate">{group.message}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                          <span>Since {timeAgo(group.first_at)}</span>
                          {group.count > 1 && <><span className="text-slate-300">·</span><span>{group.count} occurrences</span></>}
                          <span className="text-slate-300">·</span>
                          <span>Last {timeAgo(group.latest_at)}</span>
                        </div>
                      </div>
                      {isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />Active ({group.open_count})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 shrink-0">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                          Managed
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleInvestigateGroup(group)}
                          disabled={!!runningInvId}
                          className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1 bg-violet-50 text-violet-600 border border-violet-200 hover:bg-violet-100 disabled:opacity-50"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" /></svg>
                          Investigate
                        </button>
                        {isActive && (
                          <button
                            onClick={() => handleAcknowledgeGroup(group)}
                            className="text-[11px] px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-700 font-medium transition-all"
                          >
                            Acknowledge
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              }) : (
                <div className="text-center py-10">
                  <svg className="w-8 h-8 text-emerald-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  <p className="text-sm text-slate-400">No alerts for this device</p>
                  <p className="text-[11px] text-slate-300 mt-0.5">Alerts appear when rules are triggered by telemetry</p>
                </div>
              )}
            </div>
          )}

          {/* ===== INVESTIGATIONS ===== */}
          {activeTab === 'investigations' && (
            <DeviceInvestigationsTab investigations={deviceInvestigations} selectedInvId={selectedInvId} setSelectedInvId={setSelectedInvId} runningInvId={runningInvId} />
          )}
        </div>
      </div>
    </div>
  )
}

function InfoCell({ label, value, mono }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-[13px] font-medium text-slate-800 capitalize ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

const INV_STATUS = {
  running: { dot: 'bg-violet-500 animate-pulse', text: 'text-violet-600', label: 'Running' },
  completed: { dot: 'bg-emerald-500', text: 'text-emerald-600', label: 'Completed' },
  failed: { dot: 'bg-red-500', text: 'text-red-600', label: 'Failed' },
}
const CONFIDENCE = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-red-50 text-red-700 border-red-200',
}

function DeviceInvestigationsTab({ investigations, selectedInvId, setSelectedInvId }) {
  const inv = selectedInvId ? investigations.find(i => i.id === selectedInvId) : null

  if (investigations.length === 0) {
    return (
      <div className="py-12 text-center">
        <svg className="w-10 h-10 text-slate-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" /></svg>
        <p className="text-sm font-medium text-slate-500">No investigations yet</p>
        <p className="text-[12px] text-slate-400 mt-0.5">Click "Investigate" on any alert to start an AI analysis</p>
      </div>
    )
  }

  return (
    <div className="flex gap-5">
      {/* List */}
      <div className="w-72 shrink-0 space-y-1 max-h-[600px] overflow-y-auto pr-1">
        {investigations.map(i => {
          const st = INV_STATUS[i.status] || INV_STATUS.completed
          const sel = selectedInvId === i.id
          return (
            <button key={i.id} onClick={() => setSelectedInvId(sel ? null : i.id)}
              className={`w-full text-left px-3 py-3 rounded-lg border transition-all ${sel ? 'border-violet-200 bg-violet-50/50 shadow-sm' : 'border-transparent hover:bg-slate-50'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                <span className={`text-[10px] font-semibold uppercase ${st.text}`}>{st.label}</span>
                <span className="ml-auto text-[10px] text-slate-400">{timeAgo(i.completed_at || i.created_at)}</span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">{i.summary || i.root_cause?.substring(0, 80) || 'Processing...'}</p>
              {i.confidence && <span className={`inline-block mt-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${CONFIDENCE[i.confidence] || ''}`}>{i.confidence.toUpperCase()}</span>}
            </button>
          )
        })}
      </div>
      {/* Detail */}
      <div className="flex-1 min-w-0">
        {inv ? (
          <InvDetail inv={inv} />
        ) : (
          <div className="flex items-center justify-center h-48 text-center">
            <p className="text-[13px] text-slate-400">Select an investigation to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}

function InvDetail({ inv }) {
  const [detailView, setDetailView] = useState('summary')

  useEffect(() => {
    setDetailView('summary')
  }, [inv.id])

  if (inv.status === 'running') {
    return (
      <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100/80 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
            <span className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div>
            <p className="text-sm font-semibold text-violet-800">Agent Analyzing...</p>
            <p className="text-[11px] text-violet-500">Correlating telemetry and reasoning about root cause</p>
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
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
        </div>
        <span className="text-[13px] font-semibold text-slate-800">Analysis Complete</span>
        <span className="text-[11px] text-slate-400">{timeAgo(inv.completed_at)}</span>
        {inv.confidence && <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CONFIDENCE[inv.confidence] || ''}`}>{inv.confidence.toUpperCase()}</span>}
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
              <h4 className="text-[11px] font-semibold text-red-700 uppercase tracking-wider mb-2">Root Cause</h4>
              <p className="text-[13px] text-slate-700 leading-relaxed">{inv.root_cause}</p>
            </div>
            <div className="bg-emerald-50/50 border border-emerald-100/80 rounded-lg p-4">
              <h4 className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider mb-2">Corrective Actions</h4>
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
          <div className="flex items-center gap-3 pt-1 text-[10px] text-slate-400">
            <span>Gemini AI</span><span className="w-px h-3 bg-slate-200" />
            <span>{inv.iterations} iterations</span><span className="w-px h-3 bg-slate-200" />
            <span>{inv.tool_calls} tool calls</span>
          </div>
        </div>
      )}

      {detailView === 'trace' && (
        <InvestigationTrace invId={inv.id} status={inv.status} />
      )}
    </div>
  )
}
