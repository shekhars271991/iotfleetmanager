import { useState, useEffect, useCallback } from 'react'
import api from '../api/client'

const CONFIDENCE = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-red-50 text-red-700 border-red-200',
}

const TOOL_META = {
  get_device_telemetry: { icon: '\u{1F4CA}', label: 'Get Device Telemetry', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  get_group_overview: { icon: '\u{1F4CB}', label: 'Get Group Overview', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  get_correlated_alerts: { icon: '\u{1F517}', label: 'Get Correlated Alerts', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  compare_to_peers: { icon: '\u{2696}\u{FE0F}', label: 'Compare to Peers', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  get_device_capabilities: { icon: '\u{1F527}', label: 'Get Device Capabilities', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  find_redundant_sensors: { icon: '\u{1F501}', label: 'Find Redundant Sensors', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  find_nearby_devices: { icon: '\u{1F4CD}', label: 'Find Nearby Devices', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  correlate_metrics: { icon: '\u{1F4C8}', label: 'Correlate Metrics', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  get_environmental_context: { icon: '\u{1F321}\u{FE0F}', label: 'Environmental Context', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  submit_analysis: { icon: '\u{2705}', label: 'Submit Analysis', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

function buildTraceSteps(messages, toolDetails) {
  const steps = []
  let toolIdx = 0

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      let reasoning = msg.content || ''
      let parsedJson = null
      try {
        let cleaned = reasoning.trim()
        if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7)
        if (cleaned.startsWith('```')) cleaned = cleaned.slice(3)
        if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)
        parsedJson = JSON.parse(cleaned.trim())
      } catch {}

      if (parsedJson?.tool && parsedJson.tool !== 'submit_analysis') {
        steps.push({
          type: 'reasoning',
          tool: parsedJson.tool,
          params: parsedJson.params || {},
          reasoning: parsedJson.reasoning || parsedJson.thought || '',
          raw: reasoning,
          ts: msg.ts,
        })
      } else if (parsedJson?.tool === 'submit_analysis') {
        steps.push({
          type: 'conclusion',
          data: parsedJson.params || parsedJson,
          ts: msg.ts,
        })
      } else {
        steps.push({
          type: 'thought',
          content: reasoning,
          ts: msg.ts,
        })
      }
    } else if (msg.role === 'tool') {
      const detail = toolDetails[toolIdx] || {}
      let resultData = null
      try { resultData = JSON.parse(detail.result_summary || msg.content || '{}') } catch {}
      steps.push({
        type: 'tool_result',
        tool: msg.tool || detail.tool || 'unknown',
        params: detail.params || {},
        result: resultData,
        resultRaw: detail.result_summary || msg.content || '',
        ts: msg.ts,
      })
      toolIdx++
    }
  }
  return steps
}


function ToolResultPreview({ result }) {
  if (!result || typeof result !== 'object') return null

  const highlights = []
  if (result.device_id) highlights.push(`Device: ${result.device_id.substring(0, 8)}`)
  if (result.metric_type) highlights.push(`Metric: ${result.metric_type}`)
  if (result.total_readings !== undefined) highlights.push(`${result.total_readings} readings`)
  if (result.summary) {
    const s = result.summary
    if (s.avg !== undefined) highlights.push(`avg=${typeof s.avg === 'number' ? s.avg.toFixed(1) : s.avg}`)
    if (s.min !== undefined) highlights.push(`min=${typeof s.min === 'number' ? s.min.toFixed(1) : s.min}`)
    if (s.max !== undefined) highlights.push(`max=${typeof s.max === 'number' ? s.max.toFixed(1) : s.max}`)
  }
  if (result.group_name) highlights.push(`Group: ${result.group_name}`)
  if (result.total_devices !== undefined) highlights.push(`${result.total_devices} devices`)
  if (result.online_count !== undefined) highlights.push(`${result.online_count} online`)
  if (result.redundant_count !== undefined) highlights.push(`${result.redundant_count} redundant sensors`)
  if (result.nearby_count !== undefined) highlights.push(`${result.nearby_count} nearby devices`)
  if (result.devices && Array.isArray(result.devices)) highlights.push(`${result.devices.length} devices`)
  if (result.correlated_alerts !== undefined) highlights.push(`${result.correlated_alerts} correlated alerts`)
  if (result.correlation !== undefined) highlights.push(`correlation: ${typeof result.correlation === 'number' ? result.correlation.toFixed(3) : result.correlation}`)
  if (result.peer_count !== undefined) highlights.push(`${result.peer_count} peers`)

  if (highlights.length === 0) {
    Object.keys(result).slice(0, 4).forEach(k => {
      const v = result[k]
      if (v !== null && v !== undefined && typeof v !== 'object') highlights.push(`${k}: ${String(v).substring(0, 30)}`)
    })
  }

  if (highlights.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {highlights.map((h, i) => (
        <span key={i} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-mono">{h}</span>
      ))}
    </div>
  )
}


function TraceStep({ step, idx, expanded, toggle }) {
  if (step.type === 'reasoning') {
    const meta = TOOL_META[step.tool] || { icon: '\u{1F527}', label: step.tool, color: 'bg-slate-50 text-slate-600 border-slate-200' }
    return (
      <div className="relative pl-9 pb-3">
        <div className="absolute left-[10px] top-2 w-[11px] h-[11px] rounded-full bg-violet-500 ring-2 ring-white z-10" />
        <button onClick={toggle} className="w-full text-left group">
          <div className="rounded-lg border border-slate-200 bg-white hover:border-violet-200 hover:shadow-sm transition-all overflow-hidden">
            <div className="px-3 py-2.5 flex items-center gap-2">
              <span className="text-[13px]">{meta.icon}</span>
              <span className="text-[12px] font-semibold text-slate-700">Calling {meta.label}</span>
              {step.ts && <span className="ml-auto text-[10px] text-slate-300">{new Date(step.ts).toLocaleTimeString()}</span>}
              <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
            </div>
            {step.reasoning && (
              <div className="px-3 pb-2.5 -mt-1">
                <p className="text-[11px] text-slate-500 italic leading-relaxed">{step.reasoning}</p>
              </div>
            )}
            {expanded && (
              <div className="border-t border-slate-100 px-3 py-2.5 bg-slate-50/50">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Parameters</p>
                <pre className="text-[11px] text-slate-600 font-mono whitespace-pre-wrap break-all bg-white rounded p-2 border border-slate-100 max-h-40 overflow-auto">{JSON.stringify(step.params, null, 2)}</pre>
              </div>
            )}
          </div>
        </button>
      </div>
    )
  }

  if (step.type === 'tool_result') {
    const meta = TOOL_META[step.tool] || { icon: '\u{1F4C4}', label: step.tool, color: 'bg-slate-50 text-slate-600 border-slate-200' }
    return (
      <div className="relative pl-9 pb-3">
        <div className="absolute left-[10px] top-2 w-[11px] h-[11px] rounded-full bg-blue-400 ring-2 ring-white z-10" />
        <button onClick={toggle} className="w-full text-left">
          <div className="rounded-lg border border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm transition-all overflow-hidden">
            <div className="px-3 py-2.5 flex items-center gap-2">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${meta.color}`}>{step.tool}</span>
              <span className="text-[11px] text-slate-500">returned data</span>
              {step.ts && <span className="ml-auto text-[10px] text-slate-300">{new Date(step.ts).toLocaleTimeString()}</span>}
              <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
            </div>
            {!expanded && step.result && (
              <div className="px-3 pb-2.5 -mt-0.5">
                <ToolResultPreview result={step.result} />
              </div>
            )}
            {expanded && (
              <div className="border-t border-slate-100 px-3 py-2.5 bg-slate-50/50">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Full Response</p>
                <pre className="text-[11px] text-slate-600 font-mono whitespace-pre-wrap break-all bg-white rounded p-2 border border-slate-100 max-h-64 overflow-auto">{typeof step.result === 'object' ? JSON.stringify(step.result, null, 2) : step.resultRaw}</pre>
              </div>
            )}
          </div>
        </button>
      </div>
    )
  }

  if (step.type === 'thought') {
    return (
      <div className="relative pl-9 pb-3">
        <div className="absolute left-[10px] top-2 w-[11px] h-[11px] rounded-full bg-slate-300 ring-2 ring-white z-10" />
        <button onClick={toggle} className="w-full text-left">
          <div className="rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
            <div className="px-3 py-2.5 flex items-start gap-2">
              <span className="text-[11px] text-slate-500 shrink-0 mt-0.5">{'\u{1F4AD}'}</span>
              <p className={`text-[11px] text-slate-500 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>{step.content}</p>
              <svg className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
            </div>
          </div>
        </button>
      </div>
    )
  }

  if (step.type === 'conclusion') {
    return (
      <div className="relative pl-9 pb-3">
        <div className="absolute left-[10px] top-2 w-[11px] h-[11px] rounded-full bg-emerald-500 ring-2 ring-white z-10" />
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px]">{'\u{2705}'}</span>
            <span className="text-[12px] font-semibold text-emerald-700">Analysis Submitted</span>
            <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CONFIDENCE[step.data?.confidence] || ''}`}>
              {(step.data?.confidence || 'medium').toUpperCase()}
            </span>
          </div>
          {step.data?.summary && <p className="text-[11px] text-slate-600 leading-relaxed mt-1">{step.data.summary}</p>}
        </div>
      </div>
    )
  }

  return null
}


export default function InvestigationTrace({ invId, status }) {
  const [traceData, setTraceData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [expandedSteps, setExpandedSteps] = useState({})

  const loadTrace = useCallback(async () => {
    if (traceData || loading || status !== 'completed') return
    setLoading(true)
    try {
      const res = await api.get(`/api/investigations/${invId}?trace=true`)
      setTraceData(res.data)
    } catch {
      setTraceData(null)
    } finally {
      setLoading(false)
    }
  }, [invId, status, traceData, loading])

  useEffect(() => {
    loadTrace()
  }, [loadTrace])

  useEffect(() => {
    setTraceData(null)
    setExpandedSteps({})
  }, [invId])

  const toggleStep = (idx) => setExpandedSteps(prev => ({ ...prev, [idx]: !prev[idx] }))

  if (loading) {
    return (
      <div className="py-8 text-center">
        <span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin inline-block mb-2" />
        <p className="text-[13px] text-slate-500">Loading agent trace...</p>
      </div>
    )
  }

  const messages = traceData?.agent_messages || []
  const toolDetails = traceData?.tool_calls_detail || []

  if (messages.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-[13px] text-slate-400">No trace data available for this investigation.</p>
        <p className="text-[11px] text-slate-300 mt-1">Trace data is recorded for investigations started after this feature was enabled.</p>
      </div>
    )
  }

  const steps = buildTraceSteps(messages, toolDetails)

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-2 mb-3">
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Agent Reasoning Trace</h4>
        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{steps.length} steps</span>
      </div>
      <div className="relative">
        <div className="absolute left-[15px] top-0 bottom-0 w-px bg-slate-200" />
        <div className="space-y-0">
          {steps.map((step, idx) => (
            <TraceStep key={idx} step={step} idx={idx} expanded={!!expandedSteps[idx]} toggle={() => toggleStep(idx)} />
          ))}
        </div>
      </div>
    </div>
  )
}
