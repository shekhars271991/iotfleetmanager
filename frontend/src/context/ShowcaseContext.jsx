import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api/client'

const ShowcaseContext = createContext(null)

const FALLBACK_CONFIG = {
  mode: 'iot',
  config: {
    label: 'IoT Fleet Manager',
    subtitle: 'Control Panel',
    accent: 'indigo',
    entity_labels: {
      device: 'Device', devices: 'Devices',
      group: 'Group', groups: 'Groups',
      alert: 'Alert', alerts: 'Alerts',
      telemetry: 'Telemetry',
      investigation: 'Investigation', investigations: 'Investigations',
      simulation: 'Simulation', simulations: 'Simulations',
      rule: 'Rule', rules: 'Rules',
    },
    device_types: ['sensor', 'gateway', 'actuator', 'camera', 'controller'],
  },
}

export function ShowcaseProvider({ children }) {
  const [data, setData] = useState(FALLBACK_CONFIG)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/showcase-mode')
      setData(res.data)
    } catch {
      setData(FALLBACK_CONFIG)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const switchMode = useCallback(async (newMode) => {
    try {
      const res = await api.put('/api/admin/showcase-mode', { mode: newMode })
      setData(res.data)
    } catch {
      await refresh()
    }
  }, [refresh])

  const mode = data.mode || 'iot'
  const config = data.config || FALLBACK_CONFIG.config
  const labels = config.entity_labels || FALLBACK_CONFIG.config.entity_labels

  return (
    <ShowcaseContext.Provider value={{ mode, config, labels, loading, switchMode, refresh }}>
      {children}
    </ShowcaseContext.Provider>
  )
}

export function useShowcase() {
  const ctx = useContext(ShowcaseContext)
  if (!ctx) throw new Error('useShowcase must be used within ShowcaseProvider')
  return ctx
}
