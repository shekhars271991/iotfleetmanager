import { useState, useEffect, useRef } from 'react'
import api from '../api/client'

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

const TEMPLATE_ICONS = {
  normal: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
  ),
  anomaly: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
  ),
  stress: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg>
  ),
  degradation: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6 9 12.75l4.286-4.286a11.948 11.948 0 0 1 4.306 6.43l.776 2.898m0 0 3.182-5.511m-3.182 5.51-5.511-3.181" /></svg>
  ),
  intermittent: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" /></svg>
  ),
}

const TEMPLATE_COLORS = {
  normal: { bg: 'bg-blue-50', text: 'text-blue-600', ring: 'ring-blue-500', badge: 'bg-blue-100 text-blue-700' },
  anomaly: { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-500', badge: 'bg-amber-100 text-amber-700' },
  stress: { bg: 'bg-red-50', text: 'text-red-600', ring: 'ring-red-500', badge: 'bg-red-100 text-red-700' },
  degradation: { bg: 'bg-orange-50', text: 'text-orange-600', ring: 'ring-orange-500', badge: 'bg-orange-100 text-orange-700' },
  intermittent: { bg: 'bg-purple-50', text: 'text-purple-600', ring: 'ring-purple-500', badge: 'bg-purple-100 text-purple-700' },
}

const STATUS_STYLES = {
  running: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-amber-50 text-amber-700',
  stopped: 'bg-slate-100 text-slate-500',
}

const STATUS_DOTS = {
  running: 'bg-emerald-500 animate-pulse',
  paused: 'bg-amber-500',
  stopped: 'bg-slate-400',
}

const inputCls = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-colors'

const COMP_ICONS = {
  aerospike: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>,
  backend: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z" /></svg>,
  kafka: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>,
  producer: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg>,
  consumer: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>,
}

const COMP_STATUS = {
  healthy: { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Healthy' },
  stale: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', label: 'Stale' },
  down: { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', label: 'Down' },
  unknown: { dot: 'bg-slate-400', text: 'text-slate-500', bg: 'bg-slate-100', label: 'Unknown' },
}

export default function Admin() {
  const [templates, setTemplates] = useState([])
  const [simulations, setSimulations] = useState([])
  const [groups, setGroups] = useState([])
  const [devices, setDevices] = useState([])
  const [sysStatus, setSysStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const pollRef = useRef(null)

  // Creation form state
  const [formName, setFormName] = useState('')
  const [formTemplate, setFormTemplate] = useState('')
  const [formInterval, setFormInterval] = useState(5)
  const [formConfig, setFormConfig] = useState({})
  const [selectedGroups, setSelectedGroups] = useState([])
  const [selectedDevices, setSelectedDevices] = useState([])
  const [expandedGroups, setExpandedGroups] = useState({})
  const [creating, setCreating] = useState(false)
  const [actionLoading, setActionLoading] = useState({})

  // Gemini API Key state
  const [geminiStatus, setGeminiStatus] = useState(null)
  const [geminiInput, setGeminiInput] = useState('')
  const [geminiSaving, setGeminiSaving] = useState(false)
  const [geminiMsg, setGeminiMsg] = useState(null)

  // Clear Data state
  const [clearSets, setClearSets] = useState({})
  const [clearing, setClearing] = useState(false)
  const [clearResult, setClearResult] = useState(null)

  const fetchStatus = () => {
    api.get('/api/admin/status').then(res => setSysStatus(res.data)).catch(() => {})
  }

  const fetchGeminiStatus = () => {
    api.get('/api/admin/gemini-key').then(res => setGeminiStatus(res.data)).catch(() => {})
  }

  const fetchAll = () => {
    Promise.all([
      api.get('/api/admin/templates'),
      api.get('/api/admin/simulations'),
      api.get('/api/groups'),
      api.get('/api/devices'),
    ]).then(([tplRes, simRes, grpRes, devRes]) => {
      setTemplates(tplRes.data)
      setSimulations(simRes.data)
      setGroups(grpRes.data)
      setDevices(devRes.data)
      setLoading(false)
    }).catch(() => setLoading(false))
    fetchStatus()
    fetchGeminiStatus()
  }

  const fetchPoll = () => {
    api.get('/api/admin/simulations').then(res => setSimulations(res.data)).catch(() => {})
    fetchStatus()
  }

  useEffect(() => {
    fetchAll()
    pollRef.current = setInterval(fetchPoll, 5000)
    return () => clearInterval(pollRef.current)
  }, [])

  const devicesInGroup = (groupId) => devices.filter(d => d.group_id === groupId && d.status !== 'decommissioned')
  const ungroupedDevices = devices.filter(d => (!d.group_id || !groups.find(g => g.id === d.group_id)) && d.status !== 'decommissioned')

  const toggleGroupSelect = (groupId) => {
    const groupDeviceIds = devicesInGroup(groupId).map(d => d.id)
    const allSelected = groupDeviceIds.every(id => selectedDevices.includes(id))
    if (allSelected) {
      setSelectedDevices(prev => prev.filter(id => !groupDeviceIds.includes(id)))
      setSelectedGroups(prev => prev.filter(id => id !== groupId))
    } else {
      setSelectedDevices(prev => [...new Set([...prev, ...groupDeviceIds])])
      if (!selectedGroups.includes(groupId)) {
        setSelectedGroups(prev => [...prev, groupId])
      }
    }
  }

  const toggleDevice = (deviceId, groupId) => {
    setSelectedDevices(prev => {
      const next = prev.includes(deviceId) ? prev.filter(id => id !== deviceId) : [...prev, deviceId]
      if (groupId) {
        const groupDeviceIds = devicesInGroup(groupId).map(d => d.id)
        const allNowSelected = groupDeviceIds.every(id => next.includes(id))
        if (allNowSelected && !selectedGroups.includes(groupId)) {
          setSelectedGroups(sg => [...sg, groupId])
        } else if (!allNowSelected && selectedGroups.includes(groupId)) {
          setSelectedGroups(sg => sg.filter(id => id !== groupId))
        }
      }
      return next
    })
  }

  const toggleExpanded = (groupId) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  const resetForm = () => {
    setFormName('')
    setFormTemplate('')
    setFormInterval(5)
    setFormConfig({})
    setSelectedGroups([])
    setSelectedDevices([])
    setExpandedGroups({})
    setShowCreate(false)
  }

  const fetchSimsAsync = async () => {
    try {
      const res = await api.get('/api/admin/simulations')
      setSimulations(res.data)
    } catch {}
  }

  const handleCreate = async () => {
    if (!formTemplate || selectedDevices.length === 0) return
    setCreating(true)
    try {
      const res = await api.post('/api/admin/simulations', {
        name: formName || `${templates.find(t => t.id === formTemplate)?.name} Simulation`,
        template: formTemplate,
        device_ids: selectedDevices,
        group_ids: selectedGroups,
        interval: formInterval,
        config: formConfig,
      })
      setSimulations(prev => [res.data, ...prev])
      resetForm()
    } finally {
      setCreating(false)
    }
  }

  const handleAction = async (simId, action) => {
    setActionLoading(prev => ({ ...prev, [simId]: action }))
    try {
      const res = await api.put(`/api/admin/simulations/${simId}/${action}`)
      setSimulations(prev => prev.map(s => s.id === simId ? res.data : s))
    } finally {
      setActionLoading(prev => ({ ...prev, [simId]: null }))
    }
  }

  const handleDelete = async (simId) => {
    if (!confirm('Delete this simulation?')) return
    setActionLoading(prev => ({ ...prev, [simId]: 'delete' }))
    try {
      await api.delete(`/api/admin/simulations/${simId}`)
      setSimulations(prev => prev.filter(s => s.id !== simId))
    } finally {
      setActionLoading(prev => ({ ...prev, [simId]: null }))
    }
  }

  const handleGeminiSave = async () => {
    if (!geminiInput.trim()) return
    setGeminiSaving(true)
    setGeminiMsg(null)
    try {
      const res = await api.put('/api/admin/gemini-key', { api_key: geminiInput.trim() })
      setGeminiInput('')
      setGeminiMsg({ type: 'success', text: `Key saved (${res.data.hint})` })
      fetchGeminiStatus()
    } catch (err) {
      setGeminiMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to save key' })
    } finally {
      setGeminiSaving(false)
    }
  }

  const handleGeminiRemove = async () => {
    setGeminiSaving(true)
    setGeminiMsg(null)
    try {
      await api.delete('/api/admin/gemini-key')
      setGeminiMsg({ type: 'success', text: 'User override removed' })
      fetchGeminiStatus()
    } catch {
      setGeminiMsg({ type: 'error', text: 'Failed to remove key' })
    } finally {
      setGeminiSaving(false)
    }
  }

  const CLEAR_OPTIONS = [
    { id: 'alerts', label: 'Alerts', desc: 'All alert records' },
    { id: 'telemetry', label: 'Telemetry', desc: 'All telemetry data' },
    { id: 'investigations', label: 'Investigations', desc: 'AI investigation history' },
    { id: 'rules', label: 'Rules', desc: 'Alert rules' },
    { id: 'simulations', label: 'Simulations', desc: 'Simulation jobs' },
    { id: 'agg_jobs', label: 'Aggregation Jobs', desc: 'Aggregation definitions' },
    { id: 'agg_results', label: 'Aggregation Results', desc: 'Computed aggregations' },
    { id: 'devices', label: 'Devices', desc: 'All device records' },
    { id: 'groups', label: 'Groups', desc: 'Device groups' },
  ]

  const toggleClearSet = (id) => setClearSets(prev => ({ ...prev, [id]: !prev[id] }))
  const selectedClearCount = Object.values(clearSets).filter(Boolean).length

  const handleClearData = async () => {
    const sets = Object.entries(clearSets).filter(([, v]) => v).map(([k]) => k)
    if (sets.length === 0) return
    if (!confirm(`Are you sure you want to permanently delete all data from: ${sets.join(', ')}? This cannot be undone.`)) return
    setClearing(true)
    setClearResult(null)
    try {
      const res = await api.post('/api/admin/clear-data', { sets })
      setClearResult(res.data.cleared)
      setClearSets({})
      fetchAll()
    } catch (err) {
      setClearResult({ error: err.response?.data?.detail || 'Failed to clear data' })
    } finally {
      setClearing(false)
    }
  }

  const selectedTpl = templates.find(t => t.id === formTemplate)
  const [adminTab, setAdminTab] = useState('status')

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-slate-200 rounded" />
          <div className="h-64 bg-slate-100 rounded-xl" />
        </div>
      </div>
    )
  }

  const statusComponents = sysStatus ? [
    { key: 'aerospike', name: 'Aerospike', detail: `Port ${sysStatus.aerospike?.port}`, ...sysStatus.aerospike },
    { key: 'backend', name: 'Backend API', detail: `Port ${sysStatus.backend?.port}`, ...sysStatus.backend },
    { key: 'kafka', name: 'Kafka', detail: `Port ${sysStatus.kafka?.port}`, ...sysStatus.kafka },
    { key: 'producer', name: 'Producer', detail: sysStatus.producer?.msgs_total ? `${sysStatus.producer.msgs_total.toLocaleString()} msgs` : 'No data', last_heartbeat: sysStatus.producer?.last_heartbeat, ...sysStatus.producer },
    { key: 'consumer', name: 'Consumer', detail: sysStatus.consumer?.records ? `${sysStatus.consumer.records.toLocaleString()} records / ${(sysStatus.consumer.alerts || 0).toLocaleString()} alerts` : 'No data', last_heartbeat: sysStatus.consumer?.last_heartbeat, ...sysStatus.consumer },
  ] : []

  const healthyCount = statusComponents.filter(c => c.status === 'healthy').length

  const ADMIN_TABS = [
    { id: 'status', label: 'System Status', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg> },
    { id: 'simulations', label: 'Simulations', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg> },
    { id: 'settings', label: 'Settings', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg> },
    { id: 'data', label: 'Data Management', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg> },
  ]

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">Admin</h2>
        <p className="text-sm text-slate-500 mt-0.5">System health, simulations, and configuration</p>
      </div>

      {/* Tabbed Container */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm">
        <nav className="flex border-b border-slate-100 px-2">
          {ADMIN_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setAdminTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 transition-all -mb-px ${
                adminTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200'
              }`}
            >
              <span className="relative">
                {tab.icon}
                {tab.id === 'status' && healthyCount === statusComponents.length && statusComponents.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white" />
                )}
                {tab.id === 'status' && healthyCount < statusComponents.length && statusComponents.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-white" />
                )}
              </span>
              {tab.label}
              {tab.id === 'simulations' && simulations.filter(s => s.status === 'running').length > 0 && (
                <span className="ml-1 text-[10px] font-bold bg-emerald-500 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {simulations.filter(s => s.status === 'running').length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-5">
          {/* ===== SYSTEM STATUS TAB ===== */}
          {adminTab === 'status' && sysStatus && (
            <div className="grid grid-cols-5 gap-3">
              {statusComponents.map(comp => {
                const style = COMP_STATUS[comp.status] || COMP_STATUS.unknown
                return (
                  <div key={comp.key} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center">
                        {COMP_ICONS[comp.key]}
                      </div>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium ${style.bg} ${style.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot} ${comp.status === 'healthy' ? 'animate-pulse' : ''}`} />
                        {style.label}
                      </span>
                    </div>
                    <p className="text-[13px] font-semibold text-slate-800">{comp.name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{comp.detail}</p>
                    {comp.last_heartbeat && (
                      <p className="text-[10px] text-slate-300 mt-1">Last ping: {timeAgo(comp.last_heartbeat)}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {adminTab === 'status' && !sysStatus && (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-400">Unable to fetch system status</p>
            </div>
          )}

          {/* ===== SIMULATIONS TAB ===== */}
          {adminTab === 'simulations' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-400">{simulations.length} simulation{simulations.length !== 1 ? 's' : ''}</p>
          <button
            onClick={() => showCreate ? resetForm() : setShowCreate(true)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all shadow-sm ${
              showCreate
                ? 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20'
            }`}
          >
            {showCreate ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                Cancel
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                New Simulation
              </>
            )}
          </button>
        </div>

      {/* Creation Form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Create Simulation</h3>
          </div>
          <div className="p-6 space-y-6">
            {/* Name & Interval */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-[13px] font-medium text-slate-600 mb-1.5">Simulation Name</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Warehouse sensor stress test"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-slate-600 mb-1.5">Interval (sec)</label>
                <input
                  type="number" min="1" max="60"
                  value={formInterval}
                  onChange={e => setFormInterval(parseInt(e.target.value) || 5)}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Template Selection */}
            <div>
              <label className="block text-[13px] font-medium text-slate-600 mb-2">Event Template</label>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {templates.map(tpl => {
                  const colors = TEMPLATE_COLORS[tpl.id] || TEMPLATE_COLORS.normal
                  const icon = TEMPLATE_ICONS[tpl.id]
                  const selected = formTemplate === tpl.id
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => {
                        setFormTemplate(tpl.id)
                        const defaults = {}
                        tpl.options?.forEach(o => { defaults[o.key] = o.default })
                        setFormConfig(defaults)
                      }}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        selected
                          ? `${colors.bg} border-current ${colors.text} shadow-sm`
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg ${selected ? colors.bg : 'bg-slate-50'} ${selected ? colors.text : 'text-slate-400'} flex items-center justify-center mb-2.5`}>
                        {icon}
                      </div>
                      <p className={`text-[13px] font-semibold ${selected ? colors.text : 'text-slate-800'}`}>{tpl.name}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{tpl.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Template-specific options */}
            {selectedTpl?.options?.length > 0 && (
              <div>
                <label className="block text-[13px] font-medium text-slate-600 mb-2">Template Options</label>
                <div className="flex gap-4">
                  {selectedTpl.options.map(opt => (
                    <div key={opt.key} className="w-48">
                      <label className="block text-[11px] text-slate-400 mb-1">{opt.label}</label>
                      <input
                        type="number"
                        min={opt.min} max={opt.max}
                        value={formConfig[opt.key] ?? opt.default}
                        onChange={e => setFormConfig(prev => ({ ...prev, [opt.key]: parseInt(e.target.value) || opt.default }))}
                        className={inputCls}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Device Picker */}
            <div>
              <label className="block text-[13px] font-medium text-slate-600 mb-2">
                Select Devices
                {selectedDevices.length > 0 && (
                  <span className="ml-2 text-indigo-600 font-normal">{selectedDevices.length} selected</span>
                )}
              </label>
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                {groups.map(group => {
                  const gDevices = devicesInGroup(group.id)
                  if (gDevices.length === 0) return null
                  const allSelected = gDevices.every(d => selectedDevices.includes(d.id))
                  const someSelected = gDevices.some(d => selectedDevices.includes(d.id))
                  const expanded = expandedGroups[group.id]

                  return (
                    <div key={group.id} className="border-b border-slate-100 last:border-b-0">
                      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                          onChange={() => toggleGroupSelect(group.id)}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20"
                        />
                        <button onClick={() => toggleExpanded(group.id)} className="flex-1 flex items-center justify-between text-left">
                          <div>
                            <span className="text-[13px] font-semibold text-slate-700">{group.name}</span>
                            <span className="text-[11px] text-slate-400 ml-2">{gDevices.length} device{gDevices.length !== 1 ? 's' : ''}</span>
                          </div>
                          <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                        </button>
                      </div>
                      {expanded && (
                        <div className="divide-y divide-slate-50">
                          {gDevices.map(device => (
                            <label key={device.id} className="flex items-center gap-3 px-4 py-2 pl-11 hover:bg-slate-50/50 cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={selectedDevices.includes(device.id)}
                                onChange={() => toggleDevice(device.id, group.id)}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20"
                              />
                              <span className="text-[13px] text-slate-700 flex-1">{device.name}</span>
                              <span className="text-[11px] text-slate-400 capitalize">{device.type}</span>
                              <span className="text-[11px] text-slate-400 font-mono">{device.id?.substring(0, 8)}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

                {ungroupedDevices.length > 0 && (
                  <div className="border-b border-slate-100 last:border-b-0">
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50/50">
                      <input
                        type="checkbox"
                        checked={ungroupedDevices.every(d => selectedDevices.includes(d.id))}
                        onChange={() => {
                          const ids = ungroupedDevices.map(d => d.id)
                          const allSel = ids.every(id => selectedDevices.includes(id))
                          if (allSel) {
                            setSelectedDevices(prev => prev.filter(id => !ids.includes(id)))
                          } else {
                            setSelectedDevices(prev => [...new Set([...prev, ...ids])])
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20"
                      />
                      <button onClick={() => toggleExpanded('_ungrouped')} className="flex-1 flex items-center justify-between text-left">
                        <div>
                          <span className="text-[13px] font-semibold text-slate-700">Ungrouped</span>
                          <span className="text-[11px] text-slate-400 ml-2">{ungroupedDevices.length} device{ungroupedDevices.length !== 1 ? 's' : ''}</span>
                        </div>
                        <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandedGroups['_ungrouped'] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                      </button>
                    </div>
                    {expandedGroups['_ungrouped'] && (
                      <div className="divide-y divide-slate-50">
                        {ungroupedDevices.map(device => (
                          <label key={device.id} className="flex items-center gap-3 px-4 py-2 pl-11 hover:bg-slate-50/50 cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              checked={selectedDevices.includes(device.id)}
                              onChange={() => toggleDevice(device.id, null)}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20"
                            />
                            <span className="text-[13px] text-slate-700 flex-1">{device.name}</span>
                            <span className="text-[11px] text-slate-400 capitalize">{device.type}</span>
                            <span className="text-[11px] text-slate-400 font-mono">{device.id?.substring(0, 8)}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Create Button */}
            <div className="flex items-center justify-between pt-2">
              <p className="text-[11px] text-slate-400">
                {!formTemplate && 'Select a template to continue'}
                {formTemplate && selectedDevices.length === 0 && 'Select at least one device'}
                {formTemplate && selectedDevices.length > 0 && `Ready: ${selectedDevices.length} devices with ${selectedTpl?.name} template`}
              </p>
              <button
                onClick={handleCreate}
                disabled={!formTemplate || selectedDevices.length === 0 || creating}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>
                {creating ? 'Creating...' : 'Create & Start'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Simulations */}
      {simulations.length > 0 ? (
        <div className="space-y-3">
          {simulations.map(sim => {
            const colors = TEMPLATE_COLORS[sim.template] || TEMPLATE_COLORS.normal
            const icon = TEMPLATE_ICONS[sim.template]
            const tpl = templates.find(t => t.id === sim.template)
            return (
              <div key={sim.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Template icon */}
                  <div className={`w-10 h-10 rounded-xl ${colors.bg} ${colors.text} flex items-center justify-center shrink-0`}>
                    {icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h4 className="text-[13px] font-semibold text-slate-800 truncate">{sim.name}</h4>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium ${colors.badge}`}>
                        {tpl?.name || sim.template}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium ${STATUS_STYLES[sim.status] || STATUS_STYLES.stopped}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOTS[sim.status] || STATUS_DOTS.stopped}`} />
                        {sim.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-[11px] text-slate-400">
                      <span>{sim.device_ids.length} device{sim.device_ids.length !== 1 ? 's' : ''}</span>
                      <span>{sim.interval}s interval</span>
                      <span>{(sim.msgs_sent || 0).toLocaleString()} messages</span>
                      <span>Cycle #{sim.cycle_count || 0}</span>
                      <span>Created {timeAgo(sim.created_at)}</span>
                      {sim.config && Object.keys(sim.config).length > 0 && (
                        <span className="text-slate-300">|</span>
                      )}
                      {sim.config && Object.entries(sim.config).map(([k, v]) => (
                        <span key={k} className="text-slate-400">{k}: {v}</span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  {actionLoading[sim.id] ? (
                    <div className="flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-400">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      <span className="text-[11px] font-medium capitalize">{actionLoading[sim.id] === 'delete' ? 'Deleting' : `${actionLoading[sim.id]}ing`}...</span>
                    </div>
                  ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {sim.status !== 'running' && (
                      <button
                        onClick={() => handleAction(sim.id, 'start')}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                        title="Start"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>
                      </button>
                    )}
                    {sim.status === 'running' && (
                      <button
                        onClick={() => handleAction(sim.id, 'pause')}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
                        title="Pause"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" /></svg>
                      </button>
                    )}
                    {sim.status !== 'stopped' && (
                      <button
                        onClick={() => handleAction(sim.id, 'stop')}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                        title="Stop"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" /></svg>
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(sim.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                    </button>
                  </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        !showCreate && (
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-16 text-center">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
            </svg>
            <p className="text-base font-medium text-slate-600">No simulations yet</p>
            <p className="text-sm text-slate-400 mt-1">Create your first simulation to start generating telemetry data</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              New Simulation
            </button>
          </div>
        )
      )}

      {/* Info note */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
        </svg>
        <div>
          <p className="text-[13px] font-medium text-slate-600">How simulations work</p>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            Each simulation generates telemetry data for the selected devices using the chosen template. The <strong>Normal</strong> template
            produces values within safe operating ranges. <strong>Anomaly Injection</strong> randomly introduces out-of-range values that trigger
            alerts. <strong>Stress Test</strong> pushes all metrics near critical thresholds. <strong>Gradual Degradation</strong> slowly
            worsens metrics over time simulating device aging. <strong>Intermittent Connectivity</strong> randomly takes devices offline and
            brings them back. Detected anomalies automatically appear on the Alerts page.
          </p>
        </div>
      </div>
            </div>
          )}

          {/* ===== SETTINGS TAB ===== */}
          {adminTab === 'settings' && (
            <div className="space-y-6">
              {/* Gemini API Key */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-500 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[13px] font-semibold text-slate-800">Gemini API Key</p>
                    {geminiStatus && (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                        geminiStatus.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${geminiStatus.active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {geminiStatus.active ? 'Configured' : 'Not Set'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">Required for AI anomaly investigation. You can set a key here or via the GEMINI_API_KEY environment variable.</p>

                  {geminiStatus && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-3 text-[11px]">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${geminiStatus.env_available ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400'}`}>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" /></svg>
                          Env variable: {geminiStatus.env_available ? 'Available' : 'Not set'}
                        </div>
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${geminiStatus.user_override ? 'bg-violet-50 text-violet-600' : 'bg-slate-50 text-slate-400'}`}>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
                          User override: {geminiStatus.user_override ? geminiStatus.user_key_hint : 'None'}
                        </div>
                        {geminiStatus.active && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                            Active: {geminiStatus.active_source === 'user' ? 'User override' : 'Env variable'}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input type="password" value={geminiInput} onChange={e => setGeminiInput(e.target.value)}
                          placeholder={geminiStatus.user_override ? 'Enter new key to update...' : 'Paste your Gemini API key...'}
                          className={`${inputCls} flex-1`} onKeyDown={e => { if (e.key === 'Enter') handleGeminiSave() }} />
                        <button onClick={handleGeminiSave} disabled={!geminiInput.trim() || geminiSaving}
                          className="px-4 py-2 bg-violet-600 text-white text-[13px] font-medium rounded-lg hover:bg-violet-700 shadow-sm shadow-violet-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
                          {geminiSaving ? 'Saving...' : geminiStatus.user_override ? 'Update Key' : 'Save Key'}
                        </button>
                        {geminiStatus.user_override && (
                          <button onClick={handleGeminiRemove} disabled={geminiSaving}
                            className="px-3 py-2 bg-white text-slate-500 text-[13px] font-medium rounded-lg border border-slate-200 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all disabled:opacity-50 whitespace-nowrap">
                            Remove
                          </button>
                        )}
                      </div>
                      {geminiMsg && (
                        <p className={`text-[11px] font-medium ${geminiMsg.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>{geminiMsg.text}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ===== DATA MANAGEMENT TAB ===== */}
          {adminTab === 'data' && (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 mb-1">Clear Data</p>
                  <p className="text-[11px] text-slate-400 mb-4">Select which data stores to clear. This action is irreversible.</p>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {CLEAR_OPTIONS.map(opt => {
                      const checked = !!clearSets[opt.id]
                      return (
                        <label key={opt.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition-all ${
                          checked ? 'border-red-300 bg-red-50/50' : 'border-slate-100 bg-white hover:border-slate-200'
                        }`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleClearSet(opt.id)}
                            className="w-4 h-4 rounded border-slate-300 text-red-500 focus:ring-red-500/20" />
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-slate-700">{opt.label}</p>
                            <p className="text-[10px] text-slate-400">{opt.desc}</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>

                  <div className="flex items-center gap-3">
                    <button onClick={() => {
                      const all = {}; CLEAR_OPTIONS.forEach(o => { all[o.id] = true })
                      setClearSets(prev => CLEAR_OPTIONS.every(o => prev[o.id]) ? {} : all)
                    }} className="text-[11px] text-slate-500 hover:text-slate-700 font-medium transition-colors">
                      {CLEAR_OPTIONS.every(o => clearSets[o.id]) ? 'Deselect All' : 'Select All'}
                    </button>
                    <button onClick={handleClearData} disabled={selectedClearCount === 0 || clearing}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-[12px] font-medium rounded-lg hover:bg-red-700 shadow-sm shadow-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                      {clearing ? 'Clearing...' : `Clear ${selectedClearCount} Selected`}
                    </button>
                    {clearResult && !clearResult.error && (
                      <div className="flex items-center gap-2 text-[11px] text-emerald-600 font-medium">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                        Cleared: {Object.entries(clearResult).map(([k, v]) => `${k} (${v})`).join(', ')}
                      </div>
                    )}
                    {clearResult?.error && <span className="text-[11px] text-red-500 font-medium">{clearResult.error}</span>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
