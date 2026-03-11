import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api/client'

const CONFIDENCE = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-red-50 text-red-700 border-red-200',
}

const ToolIcons = {
  get_device_telemetry: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
  ),
  get_device_alerts: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>
  ),
  get_group_overview: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" /></svg>
  ),
  check_correlated_alerts: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
  ),
  compare_to_peers: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
  ),
  get_device_capabilities: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
  ),
  find_redundant_sensors: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" /></svg>
  ),
  find_nearby_devices: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>
  ),
  correlate_metrics: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" /></svg>
  ),
  get_environmental_context: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>
  ),
}

const ToolLabels = {
  get_device_telemetry: 'Get Device Telemetry',
  get_device_alerts: 'Get Device Alerts',
  get_group_overview: 'Get Group Overview',
  check_correlated_alerts: 'Check Correlated Alerts',
  compare_to_peers: 'Compare to Peers',
  get_device_capabilities: 'Get Device Capabilities',
  find_redundant_sensors: 'Find Redundant Sensors',
  find_nearby_devices: 'Find Nearby Devices',
  correlate_metrics: 'Correlate Metrics',
  get_environmental_context: 'Environmental Context',
  submit_analysis: 'Submit Analysis',
}

const ToolColors = {
  get_device_telemetry: 'bg-blue-50 text-blue-700 border-blue-200',
  get_device_alerts: 'bg-rose-50 text-rose-700 border-rose-200',
  get_group_overview: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  check_correlated_alerts: 'bg-amber-50 text-amber-700 border-amber-200',
  compare_to_peers: 'bg-purple-50 text-purple-700 border-purple-200',
  get_device_capabilities: 'bg-teal-50 text-teal-700 border-teal-200',
  find_redundant_sensors: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  find_nearby_devices: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  correlate_metrics: 'bg-orange-50 text-orange-700 border-orange-200',
  get_environmental_context: 'bg-sky-50 text-sky-700 border-sky-200',
}

const DefaultToolIcon = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" /></svg>
)

const BrainIcon = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" /></svg>
)

const CheckIcon = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
)

const ChevronIcon = ({ expanded }) => (
  <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
)


function buildTraceSteps(messages, toolDetails) {
  const steps = []
  let toolIdx = 0

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.phase === 'analysis') {
      steps.push({ type: 'analysis', content: msg.content || '', ts: msg.ts })
    } else if (msg.role === 'assistant' && msg.phase === 'action') {
      let parsedJson = null
      const raw = msg.content || ''
      try {
        let cleaned = raw.trim()
        if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7)
        if (cleaned.startsWith('```')) cleaned = cleaned.slice(3)
        if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)
        parsedJson = JSON.parse(cleaned.trim())
      } catch {}

      if (parsedJson?.tool === 'submit_analysis') {
        steps.push({ type: 'conclusion', data: parsedJson.params || parsedJson, reasoning: parsedJson.reasoning || '', ts: msg.ts })
      } else if (parsedJson?.tool) {
        steps.push({ type: 'tool_call', tool: parsedJson.tool, params: parsedJson.params || {}, reasoning: parsedJson.reasoning || parsedJson.thought || '', ts: msg.ts })
      } else {
        steps.push({ type: 'thought', content: raw, ts: msg.ts })
      }
    } else if (msg.role === 'assistant') {
      let parsedJson = null
      const raw = msg.content || ''
      try {
        let cleaned = raw.trim()
        if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7)
        if (cleaned.startsWith('```')) cleaned = cleaned.slice(3)
        if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)
        parsedJson = JSON.parse(cleaned.trim())
      } catch {}

      if (parsedJson?.tool === 'submit_analysis') {
        steps.push({ type: 'conclusion', data: parsedJson.params || parsedJson, reasoning: parsedJson.reasoning || '', ts: msg.ts })
      } else if (parsedJson?.tool) {
        steps.push({ type: 'tool_call', tool: parsedJson.tool, params: parsedJson.params || {}, reasoning: parsedJson.reasoning || parsedJson.thought || '', ts: msg.ts })
      } else {
        steps.push({ type: 'analysis', content: raw, ts: msg.ts })
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
  if (result.metric_type || result.metric) highlights.push(`Metric: ${result.metric_type || result.metric}`)
  if (result.total_readings !== undefined) highlights.push(`${result.total_readings} readings`)
  if (result.summary) {
    const s = result.summary
    if (s.avg !== undefined) highlights.push(`avg=${typeof s.avg === 'number' ? s.avg.toFixed(1) : s.avg}`)
    if (s.min !== undefined) highlights.push(`min=${typeof s.min === 'number' ? s.min.toFixed(1) : s.min}`)
    if (s.max !== undefined) highlights.push(`max=${typeof s.max === 'number' ? s.max.toFixed(1) : s.max}`)
  }
  if (result.this_device) {
    const s = result.this_device
    if (s.avg !== undefined) highlights.push(`this avg=${typeof s.avg === 'number' ? s.avg.toFixed(1) : s.avg}`)
  }
  if (result.environment_baseline) {
    const s = result.environment_baseline
    if (s.avg !== undefined) highlights.push(`env avg=${typeof s.avg === 'number' ? s.avg.toFixed(1) : s.avg}`)
  }
  if (result.deviation_pct !== undefined) highlights.push(`deviation: ${result.deviation_pct}%`)
  if (result.deviation_from_environment_pct !== undefined) highlights.push(`env deviation: ${result.deviation_from_environment_pct}%`)
  if (result.group_name) highlights.push(`Group: ${result.group_name}`)
  if (result.total_devices !== undefined) highlights.push(`${result.total_devices} devices`)
  if (result.online_count !== undefined) highlights.push(`${result.online_count} online`)
  if (result.peer_count !== undefined) highlights.push(`${result.peer_count} peers`)
  if (result.nearby_count !== undefined) highlights.push(`${result.nearby_count} nearby`)
  if (result.correlated_devices !== undefined) highlights.push(`${result.correlated_devices} correlated`)
  if (result.total_alerts !== undefined) highlights.push(`${result.total_alerts} alerts`)
  if (result.correlation !== undefined) highlights.push(`r=${typeof result.correlation === 'number' ? result.correlation.toFixed(3) : result.correlation}`)

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
  if (step.type === 'analysis') {
    return (
      <div className="relative pl-9 pb-3">
        <div className="absolute left-[8px] top-2 w-[15px] h-[15px] rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 ring-2 ring-white z-10 flex items-center justify-center text-white">
          {BrainIcon}
        </div>
        <button onClick={toggle} className="w-full text-left">
          <div className="rounded-lg border border-violet-200/60 bg-gradient-to-r from-violet-50/80 to-indigo-50/40 overflow-hidden">
            <div className="px-3.5 py-2.5 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold text-violet-500 uppercase tracking-wider">LLM Analysis</span>
                  {step.ts && <span className="text-[10px] text-slate-300">{new Date(step.ts).toLocaleTimeString()}</span>}
                </div>
                <p className={`text-[12px] text-slate-700 leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>{step.content}</p>
              </div>
              <ChevronIcon expanded={expanded} />
            </div>
          </div>
        </button>
      </div>
    )
  }

  if (step.type === 'tool_call') {
    const icon = ToolIcons[step.tool] || DefaultToolIcon
    const label = ToolLabels[step.tool] || step.tool
    return (
      <div className="relative pl-9 pb-3">
        <div className="absolute left-[8px] top-2 w-[15px] h-[15px] rounded-full bg-slate-700 ring-2 ring-white z-10 flex items-center justify-center text-white">
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5" /></svg>
        </div>
        <button onClick={toggle} className="w-full text-left">
          <div className="rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all overflow-hidden">
            <div className="px-3.5 py-2.5 flex items-center gap-2.5">
              <span className="text-slate-500 shrink-0">{icon}</span>
              <span className="text-[12px] font-semibold text-slate-700">{label}</span>
              {step.ts && <span className="ml-auto text-[10px] text-slate-300">{new Date(step.ts).toLocaleTimeString()}</span>}
              <ChevronIcon expanded={expanded} />
            </div>
            {step.reasoning && (
              <div className="px-3.5 pb-2.5 -mt-0.5">
                <p className="text-[11px] text-slate-500 italic leading-relaxed">{step.reasoning}</p>
              </div>
            )}
            {expanded && (
              <div className="border-t border-slate-100 px-3.5 py-2.5 bg-slate-50/50">
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
    const color = ToolColors[step.tool] || 'bg-slate-50 text-slate-600 border-slate-200'
    return (
      <div className="relative pl-9 pb-3">
        <div className="absolute left-[8px] top-2 w-[15px] h-[15px] rounded-full bg-blue-400 ring-2 ring-white z-10 flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" /></svg>
        </div>
        <button onClick={toggle} className="w-full text-left">
          <div className="rounded-lg border border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm transition-all overflow-hidden">
            <div className="px-3.5 py-2.5 flex items-center gap-2">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${color}`}>{step.tool}</span>
              <span className="text-[11px] text-slate-400">returned data</span>
              {step.ts && <span className="ml-auto text-[10px] text-slate-300">{new Date(step.ts).toLocaleTimeString()}</span>}
              <ChevronIcon expanded={expanded} />
            </div>
            {!expanded && step.result && (
              <div className="px-3.5 pb-2.5 -mt-0.5">
                <ToolResultPreview result={step.result} />
              </div>
            )}
            {expanded && (
              <div className="border-t border-slate-100 px-3.5 py-2.5 bg-slate-50/50">
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
        <div className="absolute left-[8px] top-2 w-[15px] h-[15px] rounded-full bg-slate-300 ring-2 ring-white z-10" />
        <button onClick={toggle} className="w-full text-left">
          <div className="rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
            <div className="px-3.5 py-2.5 flex items-start gap-2">
              <p className={`text-[11px] text-slate-500 leading-relaxed flex-1 ${expanded ? '' : 'line-clamp-2'}`}>{step.content}</p>
              <ChevronIcon expanded={expanded} />
            </div>
          </div>
        </button>
      </div>
    )
  }

  if (step.type === 'conclusion') {
    return (
      <div className="relative pl-9 pb-3">
        <div className="absolute left-[8px] top-2 w-[15px] h-[15px] rounded-full bg-emerald-500 ring-2 ring-white z-10 flex items-center justify-center text-white">
          {CheckIcon}
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3.5 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold text-emerald-700">Analysis Submitted</span>
            <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CONFIDENCE[step.data?.confidence] || ''}`}>
              {(step.data?.confidence || 'medium').toUpperCase()}
            </span>
          </div>
          {step.reasoning && <p className="text-[11px] text-slate-600 italic leading-relaxed mb-1">{step.reasoning}</p>}
          {step.data?.summary && <p className="text-[11px] text-slate-600 leading-relaxed">{step.data.summary}</p>}
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
  const bottomRef = useRef(null)
  const prevStepCount = useRef(0)
  const isRunning = status === 'running'

  const loadTrace = useCallback(async () => {
    if (loading) return
    if (!isRunning && traceData) return
    setLoading(true)
    try {
      const res = await api.get(`/api/investigations/${invId}?trace=true`)
      setTraceData(res.data)
    } catch {
      if (!traceData) setTraceData(null)
    } finally {
      setLoading(false)
    }
  }, [invId, isRunning, traceData, loading])

  useEffect(() => { loadTrace() }, [invId, status])

  useEffect(() => {
    if (!isRunning) return
    const poll = setInterval(() => {
      api.get(`/api/investigations/${invId}?trace=true`).then(res => setTraceData(res.data)).catch(() => {})
    }, 2500)
    return () => clearInterval(poll)
  }, [invId, isRunning])

  useEffect(() => { setTraceData(null); setExpandedSteps({}); prevStepCount.current = 0 }, [invId])

  const toggleStep = (idx) => setExpandedSteps(prev => ({ ...prev, [idx]: !prev[idx] }))

  const messages = traceData?.agent_messages || []
  const toolDetails = traceData?.tool_calls_detail || []
  const steps = buildTraceSteps(messages, toolDetails)
  const analysisCount = steps.filter(s => s.type === 'analysis').length
  const toolCallCount = steps.filter(s => s.type === 'tool_call' || s.type === 'tool_result').length / 2

  useEffect(() => {
    if (isRunning && steps.length > prevStepCount.current) {
      prevStepCount.current = steps.length
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [steps.length, isRunning])

  if (loading && messages.length === 0) {
    return (
      <div className="py-8 text-center">
        <span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin inline-block mb-2" />
        <p className="text-[13px] text-slate-500">Loading agent trace...</p>
      </div>
    )
  }

  if (messages.length === 0 && !isRunning) {
    return (
      <div className="py-8 text-center">
        <p className="text-[13px] text-slate-400">No trace data available for this investigation.</p>
        <p className="text-[11px] text-slate-300 mt-1">Trace data is recorded for investigations started after this feature was enabled.</p>
      </div>
    )
  }

  if (messages.length === 0 && isRunning) {
    return (
      <div className="py-8 text-center">
        <span className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin inline-block mb-2" />
        <p className="text-[13px] text-slate-500">Agent is starting up...</p>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Agent Reasoning Trace</h4>
        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{steps.length} steps</span>
        {analysisCount > 0 && <span className="text-[10px] text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded">{analysisCount} reasoning</span>}
        {toolCallCount > 0 && <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{Math.round(toolCallCount)} tool calls</span>}
        {isRunning && (
          <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
            Live
          </span>
        )}
      </div>
      <div className="relative">
        <div className="absolute left-[15px] top-0 bottom-0 w-px bg-slate-200" />
        <div className="space-y-0">
          {steps.map((step, idx) => (
            <TraceStep key={idx} step={step} idx={idx} expanded={!!expandedSteps[idx]} toggle={() => toggleStep(idx)} />
          ))}
          {isRunning && (
            <div className="relative pl-9 pb-3">
              <div className="absolute left-[8px] top-2 w-[15px] h-[15px] rounded-full bg-amber-100 ring-2 ring-white z-10 flex items-center justify-center">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              </div>
              <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-3.5 py-2.5">
                <span className="text-[12px] text-amber-600 font-medium">Agent is thinking...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
