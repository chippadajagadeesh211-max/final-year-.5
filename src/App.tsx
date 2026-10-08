import { useEffect, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell,
  BrainCircuit, Check, ChevronDown, CircleHelp, CloudRain, Compass, Download,
  Droplets, FileChartColumn, FileUp, Gauge, HardDrive, Layers3, MapPin,
  Menu, Mountain, Radio, RefreshCw, Settings, ShieldCheck, SlidersHorizontal,
  TriangleAlert, Waves, Wind, X,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Circle, MapContainer, TileLayer, Tooltip as MapTooltip } from 'react-leaflet'
import type { LucideIcon } from 'lucide-react'

type Page = 'Home' | 'Live Monitoring' | 'Slope Analysis' | 'Predictions' | 'History' | 'Sensors' | 'Alerts' | 'Data Upload' | 'AI Model' | 'Reports' | 'Settings'
type Scenario = 'SAFE' | 'WARNING' | 'CRITICAL'
type Sensor = { name: string; value: number; unit: string; status: string; trend: string; icon: LucideIcon; color: string; values: number[] }

const navigation: { label: Page; icon: LucideIcon; group: string }[] = [
  { label: 'Home', icon: Layers3, group: 'WORKSPACE' },
  { label: 'Live Monitoring', icon: Radio, group: 'WORKSPACE' },
  { label: 'Slope Analysis', icon: Mountain, group: 'WORKSPACE' },
  { label: 'Predictions', icon: BrainCircuit, group: 'WORKSPACE' },
  { label: 'History', icon: Activity, group: 'DATA' },
  { label: 'Sensors', icon: Compass, group: 'DATA' },
  { label: 'Alerts', icon: Bell, group: 'DATA' },
  { label: 'Data Upload', icon: FileUp, group: 'PROJECT' },
  { label: 'AI Model', icon: BrainCircuit, group: 'PROJECT' },
  { label: 'Reports', icon: FileChartColumn, group: 'PROJECT' },
  { label: 'Settings', icon: Settings, group: 'PROJECT' },
]

const initialSensors: Sensor[] = [
  { name: 'Rainfall', value: 205, unit: 'mm / 24h', status: 'Moderate', trend: 'Increasing', icon: CloudRain, color: '#258c91', values: [24, 28, 26, 33, 32, 42, 46, 49, 57, 62, 73, 79] },
  { name: 'Soil moisture', value: 74.5, unit: '%', status: 'Normal', trend: 'Stable', icon: Droplets, color: '#5884a5', values: [62, 63, 62, 65, 64, 66, 68, 69, 68, 70, 72, 74] },
  { name: 'Pore pressure', value: 52, unit: 'kPa', status: 'Normal', trend: 'Increasing', icon: Waves, color: '#3b9694', values: [38, 39, 40, 39, 42, 44, 45, 46, 48, 49, 51, 52] },
  { name: 'Slope movement', value: 0.8, unit: 'mm / day', status: 'Low', trend: 'Stable', icon: ArrowUpRight, color: '#78975b', values: [0.6, 0.61, 0.58, 0.64, 0.65, 0.67, 0.63, 0.69, 0.7, 0.74, 0.76, 0.8] },
  { name: 'GNSS displacement', value: 2.1, unit: 'mm', status: 'Normal', trend: 'Stable', icon: MapPin, color: '#7883a0', values: [1.1, 1.2, 1.2, 1.3, 1.4, 1.45, 1.5, 1.6, 1.6, 1.8, 1.9, 2.1] },
  { name: 'Groundwater head', value: 7.4, unit: 'm', status: 'Normal', trend: 'Stable', icon: Waves, color: '#558e9d', values: [7.1, 7.1, 7.2, 7.1, 7.2, 7.3, 7.2, 7.3, 7.3, 7.3, 7.4, 7.4] },
]

const historyData = [
  { time: '00:00', rain: 8, pressure: 43, moisture: 64, fos: 3.18 },
  { time: '02:00', rain: 12, pressure: 44, moisture: 65, fos: 3.12 },
  { time: '04:00', rain: 9, pressure: 45, moisture: 66, fos: 3.08 },
  { time: '06:00', rain: 16, pressure: 47, moisture: 67, fos: 3.04 },
  { time: '08:00', rain: 23, pressure: 48, moisture: 69, fos: 2.99 },
  { time: '10:00', rain: 31, pressure: 50, moisture: 71, fos: 2.95 },
  { time: '12:00', rain: 42, pressure: 52, moisture: 74, fos: 2.91 },
]

const predictionData = [
  { day: 'Oct 02', observed: 3.19 }, { day: 'Oct 03', observed: 3.14 },
  { day: 'Oct 04', observed: 3.11 }, { day: 'Oct 05', observed: 3.06 },
  { day: 'Oct 06', observed: 3.01 }, { day: 'Oct 07', observed: 2.96 },
  { day: 'Oct 08', observed: 2.91, predicted: 2.91 }, { day: 'Oct 09', predicted: 2.84 },
  { day: 'Oct 10', predicted: 2.77 }, { day: 'Oct 11', predicted: 2.72 },
  { day: 'Oct 12', predicted: 2.68 },
]

const sensorLocations: [string, number, number, string, string][] = [
  ['Rain gauge', 27.719, 85.316, '205 mm / 24h', '#258c91'],
  ['Piezometer', 27.716, 85.321, '52 kPa', '#3b9694'],
  ['Soil moisture', 27.713, 85.313, '74.5%', '#5884a5'],
  ['GNSS station', 27.721, 85.326, '2.1 mm', '#7883a0'],
  ['Inclinometer', 27.711, 85.324, '0.8 mm / day', '#78975b'],
]

const initialInputs = { height: 18, angle: 34, cohesion: 24, friction: 31, unitWeight: 18.5, porePressure: 52, groundwater: 7.4, surcharge: 10, seismic: 0.05 }
const descriptions: Record<Page, string> = {
  Home: 'Here’s the current condition of your monitored slope.',
  'Live Monitoring': 'Watch how the slope responds to changing environmental conditions.',
  'Slope Analysis': 'Understand the engineering conditions affecting slope stability.',
  Predictions: 'Use historical monitoring patterns to estimate future stability.',
  History: 'Review how this slope has behaved over time.',
  Sensors: 'Check the health and latest readings from each monitoring point.',
  Alerts: 'A clear record of conditions that may need an engineer’s attention.',
  'Data Upload': 'Upload historical sensor observations to analyse your slope.',
  'AI Model': 'A transparent look at how time-series patterns inform future estimates.',
  Reports: 'Prepare a concise engineering summary for your project review.',
  Settings: 'Adjust the monitoring context and project preferences.',
}

function classify(fos: number) {
  if (fos >= 1.5) return 'SAFE'
  if (fos >= 1.2) return 'CAUTION'
  if (fos >= 1) return 'WARNING'
  return 'CRITICAL'
}

function calcFos(input: typeof initialInputs) {
  const beta = Math.min(89, Math.max(1, input.angle)) * Math.PI / 180
  const phi = Math.min(89, Math.max(0, input.friction)) * Math.PI / 180
  const normal = input.unitWeight * input.height * Math.cos(beta) ** 2
  const effective = Math.max(0, normal - input.porePressure - input.groundwater * 2.2)
  const resistance = input.cohesion + effective * Math.tan(phi)
  const driving = Math.max(1, input.unitWeight * input.height * Math.sin(beta) * Math.cos(beta) + input.surcharge * Math.sin(beta) + input.seismic * input.unitWeight * input.height)
  return { fos: resistance / driving, normal, effective, resistance, driving }
}

function App() {
  const [page, setPage] = useState<Page>('Home')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sensors, setSensors] = useState(initialSensors)
  const [scenario, setScenario] = useState<Scenario>('SAFE')
  const [running, setRunning] = useState(false)
  const [tick, setTick] = useState(0)
  const [fos, setFos] = useState(2.91)
  const [inputs, setInputs] = useState(initialInputs)
  const [calculation, setCalculation] = useState<ReturnType<typeof calcFos> | null>(null)
  const [mapStyle, setMapStyle] = useState<'Standard' | 'Terrain' | 'Satellite'>('Standard')
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null)
  const [fileResult, setFileResult] = useState<{ name: string; records: number; missing: number; columns: string[]; error: string } | null>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [demoData, setDemoData] = useState(true)
  const [apiOnline, setApiOnline] = useState(false)
  const [toast, setToast] = useState('')
  const [frequency, setFrequency] = useState('Every 5 minutes')
  const risk = Math.max(3, Math.min(96, Math.round((3.4 - fos) * 11 + (scenario === 'CRITICAL' ? 20 : scenario === 'WARNING' ? 10 : 0))))
  const condition = classify(fos)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetch('http://localhost:8000/api/dashboard'), fetch('http://localhost:8000/api/sensors')])
      .then(async ([dashboardResponse, sensorResponse]) => {
        if (!dashboardResponse.ok || !sensorResponse.ok) return
        const dashboard = await dashboardResponse.json()
        const sensorData = await sensorResponse.json()
        if (cancelled) return
        setApiOnline(true)
        setFos(dashboard.factor_of_safety)
        setDemoData(dashboard.demo_data)
        setSensors((current) => current.map((sensor) => {
          const reading = sensorData.sensors.find((item: { name: string }) => item.name === sensor.name)
          return reading ? { ...sensor, value: reading.value, unit: reading.unit } : sensor
        }))
      })
      .catch(() => { if (!cancelled) setApiOnline(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!running) return
    const interval = window.setInterval(() => {
      const nextTick = tick + 1
      setTick(nextTick)
      setSensors((current) => current.map((sensor, index) => {
        const severity = scenario === 'CRITICAL' ? 1.45 : scenario === 'WARNING' ? 1.15 : 0.45
        const pulse = Math.sin((tick + index) / 2.4) * severity
        const rate = index === 0 ? 1.1 : index === 2 ? 0.5 : index === 3 ? 0.08 : index === 1 ? 0.3 : 0.05
        const next = Math.max(0, sensor.value + pulse * rate + (scenario === 'SAFE' ? 0.05 : rate * 0.4))
        return { ...sensor, value: Number(next.toFixed(index < 3 ? 1 : 2)), values: [...sensor.values.slice(1), next] }
      }))
      setFos((current) => Math.max(0.72, Math.min(3.3, current + (scenario === 'SAFE' ? 0.006 : scenario === 'WARNING' ? -0.025 : -0.06))))
      void fetch('http://localhost:8000/api/simulation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario, step: nextTick }) })
        .then((response) => response.ok ? response.json() : null)
        .then((result) => {
          if (!result) return
          setFos(result.fos)
          setSensors((current) => current.map((sensor) => {
            const keys: Record<string, string> = { Rainfall: 'rainfall_mm', 'Soil moisture': 'soil_moisture', 'Pore pressure': 'pore_pressure_kpa', 'Slope movement': 'slope_movement_mm_day', 'GNSS displacement': 'gnss_displacement_mm', 'Groundwater head': 'groundwater_head_m' }
            const value = result.readings[keys[sensor.name]]
            return value === undefined ? sensor : { ...sensor, value, values: [...sensor.values.slice(1), value] }
          }))
        })
        .catch(() => undefined)
    }, 1600)
    return () => window.clearInterval(interval)
  }, [running, scenario, tick])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  function resetSimulation() {
    setRunning(false); setTick(0); setScenario('SAFE'); setFos(2.91); setSensors(initialSensors)
    setToast('Demo readings returned to their starting values.')
  }

  async function recalculate() {
    try {
      const response = await fetch('http://localhost:8000/api/analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inputs) })
      if (!response.ok) throw new Error('API unavailable')
      const result = await response.json()
      setFos(result.fos); setCalculation(result.intermediate)
    } catch {
      const result = calcFos(inputs)
      setFos(result.fos); setCalculation(result)
    }
    setToast('Stability assessment updated using the entered parameters.')
  }

  async function readCsv(file: File) {
    setUploadedFile(file)
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setFileResult({ name: file.name, records: 0, missing: 0, columns: [], error: 'Please choose a CSV file.' })
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setFileResult({ name: file.name, records: 0, missing: 0, columns: [], error: 'This file is larger than 20 MB. Please choose a smaller CSV.' })
      return
    }
    const text = await file.text()
    const rows = text.trim().split(/\r?\n/)
    const columns = rows[0]?.split(',').map((column) => column.trim().toLowerCase()) ?? []
    const required = ['timestamp', 'rainfall_mm', 'soil_moisture', 'pore_pressure_kpa', 'slope_movement_mm_day', 'gnss_displacement_mm', 'inclinometer_deg', 'groundwater_head_m']
    const missingColumns = required.filter((column) => !columns.includes(column))
    const emptyCells = rows.slice(1).filter((row) => row.split(',').some((cell) => !cell.trim())).length
    const error = missingColumns.length ? `${missingColumns[0].replace(/_/g, ' ')} column is missing.` : ''
    setFileResult({ name: file.name, records: Math.max(0, rows.length - 1), missing: emptyCells, columns, error })
  }

  async function analyzeCsv() {
    if (!uploadedFile || fileResult?.error) return
    setUploading(true)
    const form = new FormData()
    form.append('file', uploadedFile)
    try {
      const response = await fetch('http://localhost:8000/api/upload', { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) {
        setFileResult((current) => current ? { ...current, error: result.detail ?? 'We could not analyse this file. Check the CSV and try again.' } : current)
        setToast(result.detail ?? 'We could not analyse this file. Check the CSV and try again.')
        return
      }
      setDemoData(false)
      setToast(`${result.readings_imported.toLocaleString()} monitoring readings imported from ${result.records.toLocaleString()} records.`)
    } catch {
      setToast('The CSV is valid, but the API is offline. Start FastAPI to import and analyse it.')
    } finally {
      setUploading(false)
    }
  }

  async function refreshSensors() {
    try {
      const response = await fetch('http://localhost:8000/api/sensors')
      if (!response.ok) throw new Error('Reading service unavailable')
      const result = await response.json()
      setSensors((current) => current.map((sensor) => {
        const reading = result.sensors.find((item: { name: string }) => item.name === sensor.name)
        return reading ? { ...sensor, value: reading.value, unit: reading.unit } : sensor
      }))
      setToast('Latest sensor readings have been refreshed.')
    } catch {
      setToast('The API is offline. Showing the current demonstration readings.')
    }
  }

  async function exportReport() {
    try {
      const response = await fetch('http://localhost:8000/api/reports/pdf')
      if (!response.ok) throw new Error('PDF service unavailable')
      const link = document.createElement('a')
      link.href = URL.createObjectURL(await response.blob())
      link.download = 'smart-slope-monitoring-report.pdf'
      link.click(); URL.revokeObjectURL(link.href)
      setToast('Your engineering summary PDF has been downloaded.')
      return
    } catch {
      setToast('PDF export needs the FastAPI service. A text summary was downloaded instead.')
    }
    const report = `SMART SLOPE STABILITY MONITORING\n\nProject: Himalayan Field Study\nGenerated: ${new Date().toLocaleString()}\nCurrent factor of safety: ${fos.toFixed(2)}\nStability category: ${condition}\nModel-based risk estimate: ${risk}%\n\nSensor summary\n${sensors.map((sensor) => `${sensor.name}: ${sensor.value} ${sensor.unit}`).join('\n')}\n\nInterpretation\n${condition === 'SAFE' ? 'Current monitoring indicators are within the configured safe range.' : 'Monitoring indicators warrant review by a qualified geotechnical engineer.'}\n\nLimitations\nAcademic demonstration model. Not a substitute for site-specific geotechnical design.`
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([report], { type: 'text/plain' }))
    link.download = 'smart-slope-monitoring-report.txt'
    link.click(); URL.revokeObjectURL(link.href)
    setToast('Your monitoring summary has been downloaded.')
  }

  const goTo = (next: Page) => { setPage(next); setMobileOpen(false) }
  const headerTitle = page === 'Home' ? 'Slope overview' : page

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Mountain size={20} strokeWidth={1.8} /></div><div><strong>SMART SLOPE</strong><span>STABILITY MONITORING</span></div><button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="project-chip"><span className="project-dot" /><div><small>ACTIVE PROJECT</small><strong>Himalayan Field Study</strong></div><ChevronDown size={15} /></div>
      <nav aria-label="Main navigation">{['WORKSPACE', 'DATA', 'PROJECT'].map((group) => <div className="nav-group" key={group}><small className="nav-label">{group}</small>{navigation.filter((item) => item.group === group).map(({ label, icon: Icon }) => <button key={label} className={`nav-link ${page === label ? 'active' : ''}`} onClick={() => goTo(label)}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Alerts' && <em>2</em>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="online-card"><div className="online-icon"><Radio size={17} /></div><div><strong>{apiOnline ? 'Monitoring online' : 'Demo mode active'}</strong><small>{apiOnline ? '5 sensors connected' : 'Using local demonstration data'}</small></div><span className={apiOnline ? 'pulse-dot' : 'muted-dot'} /></div><div className="profile"><div className="avatar">AR</div><div><strong>Alex Rivera</strong><small>Project engineer</small></div><ChevronDown size={15} /></div></div>
    </aside>
    {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
    <main className="main-area">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumb"><span>Himalayan Field Study</span><span className="crumb-separator">/</span><strong>{headerTitle}</strong></div><div className="topbar-right"><div className="live-status"><span className={apiOnline ? 'pulse-dot' : 'muted-dot'} />{apiOnline ? 'Live monitoring' : 'Demo monitoring'}</div><span className="top-divider" /><span className="updated-label">Updated <strong>10:42 AM</strong></span><button className="icon-button notification-button" onClick={() => goTo('Alerts')} aria-label="Open alerts"><Bell size={18} /><i /></button><button className="icon-button" onClick={() => goTo('Settings')} aria-label="Open settings"><Settings size={18} /></button></div></header>
      <div className="page-content">
        <div className="page-heading"><div>{page !== 'Home' && <div className="eyebrow">AI + IoT + GEOTECHNICAL ENGINEERING</div>}<h1>{page === 'Home' ? 'SLOPE STABILITY MONITORING' : page === 'Predictions' ? 'Predicted slope condition' : page}</h1>{page === 'Home' ? <><p>AI + IoT + Geotechnical Engineering</p><p className="developer-credit">Developed by Ch. Jagadeesh</p></> : <p>{descriptions[page]}</p>}</div>{page === 'Home' && <div className="heading-date"><span>THURSDAY, OCTOBER 08</span><strong><span className={apiOnline ? 'pulse-dot' : 'muted-dot'} />{apiOnline ? 'All systems operational' : 'Demonstration data in use'}</strong></div>}</div>
        {page === 'Home' && <HomePage fos={fos} risk={risk} condition={condition} sensors={sensors} demoData={demoData} setSelectedSensor={setSelectedSensor} setPage={goTo} mapStyle={mapStyle} setMapStyle={setMapStyle} />}
        {page === 'Live Monitoring' && <LivePage running={running} setRunning={setRunning} scenario={scenario} setScenario={setScenario} sensors={sensors} fos={fos} risk={risk} tick={tick} onReset={resetSimulation} onSelectSensor={setSelectedSensor} />}
        {page === 'Slope Analysis' && <AnalysisPage fos={fos} condition={condition} inputs={inputs} setInputs={setInputs} calculation={calculation} onRecalculate={recalculate} />}
        {page === 'Predictions' && <PredictionPage fos={fos} />}
        {page === 'History' && <HistoryPage />}
        {page === 'Sensors' && <SensorPage sensors={sensors} onSelectSensor={setSelectedSensor} onRefresh={refreshSensors} />}
        {page === 'Alerts' && <AlertsPage condition={condition} risk={risk} />}
        {page === 'Data Upload' && <UploadPage fileResult={fileResult} onFile={readCsv} onAnalyze={analyzeCsv} uploading={uploading} />}
        {page === 'AI Model' && <AiPage />}
        {page === 'Reports' && <ReportsPage onExport={exportReport} fos={fos} risk={risk} condition={condition} />}
        {page === 'Settings' && <SettingsPage frequency={frequency} setFrequency={setFrequency} />}
        <footer className="page-footer"><span>SMART SLOPE <i>·</i> From monitoring data to safer decisions</span><span>Academic demonstration model <i>·</i> v1.0</span></footer>
      </div>
    </main>
    {selectedSensor && <SensorDrawer sensor={sensors.find((item) => item.name === selectedSensor) ?? sensors[0]} onClose={() => setSelectedSensor(null)} />}
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>
}

function HomePage({ fos, risk, condition, sensors, demoData, setSelectedSensor, setPage, mapStyle, setMapStyle }: { fos: number; risk: number; condition: string; sensors: Sensor[]; demoData: boolean; setSelectedSensor: (name: string) => void; setPage: (page: Page) => void; mapStyle: 'Standard' | 'Terrain' | 'Satellite'; setMapStyle: (style: 'Standard' | 'Terrain' | 'Satellite') => void }) {
  const stabilityIndex = Math.min(0.99, fos / 3.2)
  const indexStatus = stabilityIndex >= 0.75 ? 'STABLE' : stabilityIndex >= 0.5 ? 'DECLINING' : 'LOW'
  return <>
    <section className="status-grid">
      <StatusCard label="Factor of Safety" value={fos.toFixed(2)} unit="FOS" status={condition} icon={ShieldCheck} color={condition === 'SAFE' ? 'green' : 'amber'} copy={condition === 'SAFE' ? 'Available resistance is above the configured safe threshold.' : 'Available resistance is below the configured safe threshold.'} />
      <StatusCard label="Stability index" value={stabilityIndex.toFixed(2)} unit="INDEX" status={indexStatus} icon={Activity} color="blue" copy={indexStatus === 'STABLE' ? 'Monitoring indicators remain within the stable range.' : 'Current indicators show reduced stability.'} />
      <StatusCard label="Current risk" value={`${risk.toFixed(1)}%`} unit="ESTIMATE" status={risk < 20 ? 'LOW' : risk < 45 ? 'MODERATE' : 'ELEVATED'} icon={TriangleAlert} color="amber" copy="Model-based estimate from current conditions." />
      <StatusCard label="Early warning" value={condition === 'SAFE' ? 'Normal' : condition} unit="STATUS" status={condition === 'SAFE' ? 'CLEAR' : 'REVIEW'} icon={Bell} color="teal" copy={condition === 'SAFE' ? 'No immediate warning condition detected.' : 'Review recent monitoring observations.'} />
    </section>
    <section className="overview-grid">
      <div className="panel slope-panel"><div className="panel-heading"><div><h2>Slope condition</h2><p>Live view of the monitored slope and sensor locations</p></div><button className="text-button" onClick={() => setPage('Live Monitoring')}>View live <ArrowRight size={15} /></button></div><div className="visual-wrap"><SlopeDrawing condition={condition} /><div className="diagram-caption"><span><i className="legend-dot sensor-legend" />Monitoring point</span><span><i className="legend-line" />Groundwater level</span><span><i className="legend-arrow">↑</i>Movement direction</span></div></div><div className="slope-bottom"><div><small>SLOPE SITE</small><strong>Himalayan Field Study <span className="coordinate">27.7172° N, 85.3240° E</span></strong></div><span className={`condition-pill ${condition.toLowerCase()}`}><i />{condition}</span></div></div>
      <div className="panel map-panel"><div className="panel-heading"><div><h2>Monitoring locations</h2><p>5 active points across the study area</p></div><button className="icon-button subtle-button" aria-label="Map options"><SlidersHorizontal size={16} /></button></div><div className="map-frame"><MapContainer center={[27.7172, 85.324]} zoom={14} scrollWheelZoom={false} zoomControl={true}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url={mapStyle === 'Satellite' ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' : mapStyle === 'Terrain' ? 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png' : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'} />
        {sensorLocations.map(([name, lat, lng, value, color]) => <Circle key={name} center={[lat, lng]} radius={48} pathOptions={{ color, fillColor: color, fillOpacity: 0.78, weight: 2 }} eventHandlers={{ click: () => setSelectedSensor(name === 'Piezometer' ? 'Pore pressure' : name === 'GNSS station' ? 'GNSS displacement' : name === 'Inclinometer' ? 'Slope movement' : name === 'Rain gauge' ? 'Rainfall' : 'Soil moisture') }}><MapTooltip direction="top"><strong>{name}</strong><br />{value}<br /><small>Click for sensor details</small></MapTooltip></Circle>)}</MapContainer><div className="map-style-control">{(['Standard', 'Terrain', 'Satellite'] as const).map((style) => <button key={style} className={mapStyle === style ? 'selected' : ''} onClick={() => setMapStyle(style)}>{style}</button>)}</div></div><div className="map-foot"><span><i className="pulse-dot" /> 5 of 5 sensors reporting</span><span>OpenStreetMap</span></div></div>
    </section>
    <section className="sensor-section"><div className="section-heading"><div><h2>Monitoring data</h2><p>Latest readings from across the slope</p></div><div className="section-actions">{demoData && <span className="demo-tag"><span /> DEMO SENSOR DATA</span>}<button className="text-button" onClick={() => setPage('Sensors')}>All sensors <ArrowRight size={15} /></button></div></div><div className="sensor-grid">{sensors.map((sensor) => <SensorCard key={sensor.name} sensor={sensor} onClick={() => setSelectedSensor(sensor.name)} />)}</div></section>
    <section className="bottom-grid"><div className="panel chart-panel"><div className="panel-heading"><div><h2>Stability through today</h2><p>Observed factor of safety and rainfall response</p></div><span className="chart-key"><i className="key-line" />Factor of safety</span></div><div className="chart-holder"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={historyData} margin={{ top: 10, right: 8, left: -15, bottom: 0 }}><CartesianGrid stroke="#eaf0ee" vertical={false} /><XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#8a9697', fontSize: 11 }} /><YAxis yAxisId="fos" domain={[2.7, 3.3]} axisLine={false} tickLine={false} tick={{ fill: '#8a9697', fontSize: 11 }} /><YAxis yAxisId="rain" orientation="right" hide domain={[0, 60]} /><Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #dce5e2', fontSize: 12 }} /><Area yAxisId="rain" dataKey="rain" fill="#dceeed" stroke="#dceeed" name="Rainfall (mm)" /><Line yAxisId="fos" dataKey="fos" stroke="#145a8d" strokeWidth={2.5} dot={{ r: 3, fill: '#145a8d', strokeWidth: 0 }} activeDot={{ r: 5 }} name="Factor of safety" /></ComposedChart></ResponsiveContainer></div></div><div className="panel insight-panel"><div className="insight-icon"><Wind size={19} /></div><div className="eyebrow">ENGINEER'S NOTE</div><h3>Everything looks stable right now.</h3><p>Rainfall has increased over the last 6 hours. Pore pressure is also gradually rising, while movement remains within the configured monitoring range.</p><button className="text-button" onClick={() => setPage('Predictions')}>See what may happen next <ArrowRight size={15} /></button></div></section>
  </>
}

function StatusCard({ label, value, unit, status, icon: Icon, color, copy }: { label: string; value: string; unit: string; status: string; icon: LucideIcon; color: string; copy: string }) {
  return <div className={`status-card status-${color}`}><div className="status-top"><span>{label}</span><span className="status-icon"><Icon size={17} /></span></div><div className="status-value">{value}<small>{unit}</small></div><div className="status-bottom"><span className="mini-status">{status}</span><span className="status-copy">{copy}</span></div></div>
}

function SensorCard({ sensor, onClick }: { sensor: Sensor; onClick: () => void }) {
  const Icon = sensor.icon
  const points = sensor.values.map((value, index) => `${(index / (sensor.values.length - 1)) * 100},${32 - (value - Math.min(...sensor.values)) / (Math.max(...sensor.values) - Math.min(...sensor.values) || 1) * 25}`).join(' ')
  return <button className="sensor-card" onClick={onClick}><div className="sensor-card-top"><span className="sensor-icon" style={{ color: sensor.color, backgroundColor: `${sensor.color}13` }}><Icon size={17} /></span><span className={`sensor-badge ${sensor.status.toLowerCase()}`}>{sensor.status}</span></div><span className="sensor-name">{sensor.name}</span><span className="sensor-reading">{sensor.value}<small>{sensor.unit}</small></span><div className="sparkline-row"><svg viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke={sensor.color} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg><span className={sensor.trend === 'Increasing' ? 'trend-up' : 'trend-stable'}>{sensor.trend === 'Increasing' ? <ArrowUpRight size={13} /> : <ArrowRight size={13} />}{sensor.trend}</span></div></button>
}

function SlopeDrawing({ condition }: { condition: string }) {
  return <svg className="slope-svg" viewBox="0 0 780 315" role="img" aria-label="Engineering cross-section of monitored slope with sensor positions"><defs><pattern id="contours" width="88" height="38" patternUnits="userSpaceOnUse"><path d="M-10 27 C15 5 48 5 98 22" fill="none" stroke="#d5e4db" strokeWidth="1" /><path d="M-10 35 C18 13 49 13 98 30" fill="none" stroke="#d5e4db" strokeWidth=".8" /></pattern><pattern id="strata" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)"><line x1="0" y1="0" x2="0" y2="12" stroke="#c9bfa9" strokeWidth="2" opacity=".4" /></pattern><linearGradient id="soilFill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#e6eadd" /><stop offset="1" stopColor="#d9e3d6" /></linearGradient></defs><rect width="780" height="315" fill="#f5f8f5" /><rect width="780" height="118" fill="url(#contours)" opacity=".8" /><path d="M0 100 L205 100 L424 272 L780 272 L780 315 L0 315Z" fill="url(#soilFill)" /><path d="M0 100 L205 100 L424 272 L780 272 L780 315 L0 315Z" fill="url(#strata)" /><path d="M0 100 L205 100 L424 272 L780 272" fill="none" stroke="#5e795f" strokeWidth="3" /><path d="M0 229 C146 219 270 246 394 249 C528 254 637 238 780 245" fill="none" stroke="#6aa4a5" strokeDasharray="7 6" strokeWidth="2" /><text x="26" y="250" fill="#54898d" fontSize="11">Groundwater level</text><text x="45" y="84" fill="#64727d" fontSize="11">Crest</text><text x="463" y="291" fill="#64727d" fontSize="11">Slope toe</text><path d="M445 257 L445 220 M490 263 L490 226 M532 266 L532 228" stroke="#d99a2b" strokeWidth="2" /><path d="M440 228 L445 219 L450 228 M485 234 L490 225 L495 234 M527 236 L532 227 L537 236" fill="none" stroke="#d99a2b" strokeWidth="2" /><g className="diagram-rain" stroke="#70a5b1" strokeWidth="2"><path d="M338 26v17m-18-13v17m39-12v17m-7-22v17" /></g><g fill="#fff" stroke="#258c91" strokeWidth="2"><circle cx="90" cy="100" r="7" /><circle cx="236" cy="132" r="7" /><circle cx="345" cy="204" r="7" /><circle cx="520" cy="272" r="7" /><circle cx="622" cy="272" r="7" /></g><g fill="#334b4e" fontSize="10"><text x="54" y="120">Rain gauge</text><text x="205" y="153">Piezometer</text><text x="308" y="224">Moisture</text><text x="493" y="292">GNSS</text><text x="593" y="292">Inclinometer</text></g><g transform="translate(604 22)"><rect width="130" height="44" rx="7" fill="#fff" stroke="#dce5e2" /><text x="13" y="17" fill="#6b7b78" fontSize="9" letterSpacing="1">CURRENT FOS</text><text x="13" y="36" fill="#24323d" fontSize="17" fontWeight="600">{condition === 'SAFE' ? '2.91 · Safe' : condition}</text></g><text x="25" y="290" fill="#82908c" fontSize="9" letterSpacing="1">NOT TO SCALE · ILLUSTRATIVE CROSS-SECTION</text></svg>
}

function LivePage({ running, setRunning, scenario, setScenario, sensors, fos, risk, tick, onReset, onSelectSensor }: { running: boolean; setRunning: (value: boolean) => void; scenario: Scenario; setScenario: (value: Scenario) => void; sensors: Sensor[]; fos: number; risk: number; tick: number; onReset: () => void; onSelectSensor: (name: string) => void }) {
  return <><div className="demo-banner"><span className="demo-tag"><span /> DEMO SENSOR DATA</span><span>Simulated readings are for presentation and academic demonstration only.</span></div><div className="live-toolbar panel"><div><strong>Demo sensor simulation</strong><p>Values respond gradually to the selected scenario.</p></div><div className="scenario-control"><span>SCENARIO</span><div>{(['SAFE', 'WARNING', 'CRITICAL'] as Scenario[]).map((item) => <button key={item} className={`scenario-option ${scenario === item ? `chosen ${item.toLowerCase()}` : ''}`} onClick={() => setScenario(item)}>{item}</button>)}</div></div><div className="live-actions"><button className="secondary-button" onClick={onReset}><RefreshCw size={15} />Reset</button><button className={running ? 'stop-button' : 'primary-button'} onClick={() => setRunning(!running)}>{running ? <><X size={15} />Stop simulation</> : <><Radio size={15} />Start simulation</>}</button></div></div><div className="live-summary"><StatusCard label="Factor of Safety" value={fos.toFixed(2)} unit="FOS" status={classify(fos)} icon={ShieldCheck} color="green" copy="Updated with each demo reading." /><StatusCard label="Current risk" value={`${risk}%`} unit="ESTIMATE" status={risk < 20 ? 'LOW' : 'ELEVATED'} icon={TriangleAlert} color="amber" copy="Changes as the scenario evolves." /><div className="panel simulation-panel"><span className="eyebrow">SIMULATION STATUS</span><div className="simulation-value"><span className={running ? 'pulse-dot' : 'muted-dot'} />{running ? 'Running' : 'Paused'}</div><p>{running ? `Reading ${tick + 1} · updating every 1.6 seconds` : 'Start the simulation to see readings change.'}</p></div></div><div className="sensor-grid live-sensor-grid">{sensors.map((sensor) => <SensorCard key={sensor.name} sensor={sensor} onClick={() => onSelectSensor(sensor.name)} />)}</div><div className="panel live-chart"><div className="panel-heading"><div><h2>Rainfall and pore pressure response</h2><p>Illustrative readings during the current session</p></div><span className="chart-key"><i className="key-line teal-key" />Pore pressure</span></div><div className="chart-holder tall"><ResponsiveContainer width="100%" height="100%"><LineChart data={historyData.map((point, index) => ({ ...point, time: index === 6 ? `${tick} min` : point.time }))} margin={{ top: 10, right: 8, left: -15, bottom: 0 }}><CartesianGrid stroke="#eaf0ee" vertical={false} /><XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#8a9697', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#8a9697', fontSize: 11 }} /><Tooltip /><Line dataKey="pressure" name="Pore pressure (kPa)" stroke="#159a9c" strokeWidth={2.5} dot={false} /><Line dataKey="rain" name="Rainfall (mm)" stroke="#d99a2b" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></div><AlertBanner scenario={scenario} /></>
}

function AlertBanner({ scenario }: { scenario: Scenario }) {
  if (scenario === 'SAFE') return <div className="notice-banner safe-notice"><ShieldCheck size={20} /><div><strong>No immediate warning condition detected</strong><p>Movement remains within the configured monitoring range. Continue routine observation.</p></div></div>
  return <div className={`notice-banner ${scenario === 'CRITICAL' ? 'critical-notice' : 'warning-notice'}`}><AlertTriangle size={20} /><div><strong>{scenario === 'CRITICAL' ? 'Critical monitoring condition' : 'Increased slope movement detected'}</strong><p>{scenario === 'CRITICAL' ? 'Multiple stability indicators have moved outside the configured safe range. Immediate engineering assessment is recommended.' : 'Slope movement has increased above the configured monitoring threshold. Review recent sensor observations and assess if required.'}</p></div></div>
}

function AnalysisPage({ fos, condition, inputs, setInputs, calculation, onRecalculate }: { fos: number; condition: string; inputs: typeof initialInputs; setInputs: (value: typeof initialInputs) => void; calculation: ReturnType<typeof calcFos> | null; onRecalculate: () => void }) {
  const groups: { title: string; fields: [keyof typeof initialInputs, string, string][] }[] = [
    { title: 'Geometry', fields: [['height', 'Slope height', 'm'], ['angle', 'Slope angle', '°']] },
    { title: 'Soil properties', fields: [['cohesion', 'Cohesion', 'kPa'], ['friction', 'Friction angle', '°'], ['unitWeight', 'Unit weight', 'kN/m³']] },
    { title: 'Water conditions', fields: [['porePressure', 'Pore pressure', 'kPa'], ['groundwater', 'Groundwater head', 'm']] },
    { title: 'External factors', fields: [['surcharge', 'Surcharge', 'kPa'], ['seismic', 'Seismic coefficient', 'g']] },
  ]
  return <><div className="analysis-layout"><div className="analysis-inputs">{groups.map((group) => <div className="panel input-panel" key={group.title}><div className="panel-heading"><h2>{group.title}</h2><span className="group-symbol"><Mountain size={16} /></span></div><div className="field-grid">{group.fields.map(([key, label, unit]) => <label className="field" key={key}><span>{label}</span><div className="field-input"><input type="number" min="0" step="any" value={inputs[key]} onChange={(event) => setInputs({ ...inputs, [key]: Number(event.target.value) })} /><small>{unit}</small></div></label>)}</div></div>)}<button className="primary-button recalculate" onClick={onRecalculate}><RefreshCw size={16} />Recalculate stability</button></div><div className="analysis-results"><div className="panel result-panel"><div className="eyebrow">CURRENT ASSESSMENT</div><div className="result-number">{fos.toFixed(2)}<small>FOS</small></div><EngineeringScale fos={fos} /><div className="result-row"><span>Stability category</span><strong className={`condition-pill ${condition.toLowerCase()}`}><i />{condition}</strong></div><div className="result-row"><span>Stability index</span><strong>{Math.min(.99, fos / 3.2).toFixed(2)}</strong></div><div className="result-row"><span>Risk estimate</span><strong>{Math.max(3, Math.round((3.4 - fos) * 11))}%</strong></div></div><details className="panel calculation-details"><summary><CircleHelp size={16} />How is this calculated?<ChevronDown size={16} /></summary><div className="calculation-content"><p>A simplified infinite-slope model compares available shear resistance with the forces driving movement.</p><div className="formula-box">Factor of safety = resisting shear / driving shear</div><strong>Intermediate calculations</strong><div className="calculation-line"><span>Effective normal stress</span><b>{calculation ? calculation.effective.toFixed(1) : 'Calculated on request'} kPa</b></div><div className="calculation-line"><span>Available resistance</span><b>{calculation ? calculation.resistance.toFixed(1) : 'Calculated on request'} kPa</b></div><div className="calculation-line"><span>Driving demand</span><b>{calculation ? calculation.driving.toFixed(1) : 'Calculated on request'} kPa</b></div><div className="calculation-line final-line"><span>Final factor of safety</span><b>{fos.toFixed(2)}</b></div><p className="assumption-text">Assumes a uniform soil layer and a simplified planar failure surface. Project thresholds: SAFE ≥ 1.50, CAUTION 1.20–1.49, WARNING 1.00–1.19, CRITICAL &lt; 1.00.</p></div></details><div className="disclaimer"><TriangleAlert size={15} /><span>Academic demonstration model — not a substitute for site-specific geotechnical design.</span></div></div></div></>
}

function EngineeringScale({ fos }: { fos: number }) {
  const position = `${Math.max(1, Math.min(99, (fos / 3.5) * 100))}%`
  return <div className="engineering-scale"><div className="scale-track"><span className="scale-critical" /><span className="scale-warning" /><span className="scale-caution" /><span className="scale-safe" /><i className="scale-marker" style={{ left: position }} /></div><div className="scale-labels"><span>CRITICAL<br />&lt; 1.0</span><span>WARNING<br />1.0 – 1.19</span><span>CAUTION<br />1.2 – 1.49</span><span>SAFE<br />≥ 1.5</span></div></div>
}

function PredictionPage({ fos }: { fos: number }) {
  return <><div className="demo-banner prediction-banner"><span className="demo-tag"><BrainCircuit size={13} /> DEMO PREDICTION MODE</span><span>Demonstration estimate — not generated from a trained LSTM model.</span></div><div className="prediction-summary"><div className="panel prediction-stat"><span>Current factor of safety</span><strong>{fos.toFixed(2)}</strong><small>Latest calculated condition</small></div><div className="prediction-arrow"><ArrowRight size={22} /></div><div className="panel prediction-stat estimate-stat"><span>Predicted in 4 days</span><strong>{Math.max(.8, fos - .23).toFixed(2)}</strong><small>Demonstration time-series estimate</small></div><div className="panel prediction-change"><span>EXPECTED CHANGE</span><strong><ArrowDownRight size={17} /> −0.23</strong><small>Slight deterioration</small></div></div><div className="panel prediction-chart-panel"><div className="panel-heading"><div><h2>Historical stability vs predicted stability</h2><p>Observed measurements are solid; estimates are shown as a dashed line.</p></div><div className="prediction-legend"><span><i className="key-line" />Observed</span><span><i className="key-line dashed-key" />Predicted</span></div></div><div className="chart-holder prediction-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={predictionData} margin={{ top: 16, right: 15, left: -15, bottom: 0 }}><CartesianGrid stroke="#eaf0ee" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#8a9697', fontSize: 11 }} /><YAxis domain={[2.4, 3.35]} axisLine={false} tickLine={false} tick={{ fill: '#8a9697', fontSize: 11 }} /><Tooltip /><ReferenceLine x="Oct 08" stroke="#aebcb8" strokeDasharray="3 4" label={{ value: 'NOW', fill: '#778783', fontSize: 10, position: 'insideTopRight' }} /><Line dataKey="observed" name="Observed FOS" connectNulls stroke="#145a8d" strokeWidth={2.5} dot={{ r: 3 }} /><Line dataKey="predicted" name="Predicted FOS" connectNulls stroke="#159a9c" strokeWidth={2.5} strokeDasharray="7 5" dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} /></LineChart></ResponsiveContainer></div></div><div className="prediction-explain"><div className="panel explain-copy"><div className="eyebrow">A HUMAN-READABLE EXPLANATION</div><h2>How does the AI help?</h2><p>The LSTM model learns patterns from previous monitoring observations such as rainfall, pore pressure, soil moisture and slope movement. It uses these time-series patterns to estimate the future stability condition.</p><span className="demo-note">This screen currently uses a deterministic demonstration estimate. A trained model needs sufficient, quality-checked historical observations.</span></div><div className="panel flow-panel"><div className="flow-step"><div><Activity size={20} /></div><strong>Past observations</strong><small>Sensor time series</small></div><ArrowRight className="flow-arrow" size={19} /><div className="flow-step lstm-step"><div><BrainCircuit size={20} /></div><strong>LSTM</strong><small>Pattern learning</small></div><ArrowRight className="flow-arrow" size={19} /><div className="flow-step"><div><Gauge size={20} /></div><strong>Future estimate</strong><small>Next 4 days</small></div></div></div></>
}

function HistoryPage() {
  const [period, setPeriod] = useState('Daily')
  const pairs = [{ title: 'Rainfall ↔ Soil moisture', coefficient: '0.82', dataKey: 'moisture', color: '#159a9c' }, { title: 'Rainfall ↔ Pore pressure', coefficient: '0.76', dataKey: 'pressure', color: '#145a8d' }, { title: 'Pore pressure ↔ Movement', coefficient: '0.68', dataKey: 'fos', color: '#78975b' }, { title: 'Movement ↔ FOS', coefficient: '−0.71', dataKey: 'fos', color: '#d99a2b' }]
  return <><div className="filter-row panel"><label>Date range <select defaultValue="Last 7 days"><option>Last 7 days</option><option>Last 30 days</option><option>Custom range</option></select></label><label>Sensor <select defaultValue="All sensors"><option>All sensors</option><option>Rain gauge</option><option>Piezometer</option></select></label><label>Parameter <select defaultValue="All parameters"><option>All parameters</option><option>Rainfall</option><option>Factor of safety</option></select></label><div className="period-toggle">{['Daily', 'Weekly', 'Monthly'].map((item) => <button className={period === item ? 'selected' : ''} onClick={() => setPeriod(item)} key={item}>{item}</button>)}</div></div><div className="history-grid">{[{ title: 'Rainfall', unit: 'mm / 2h', key: 'rain', color: '#159a9c' }, { title: 'Pore pressure', unit: 'kPa', key: 'pressure', color: '#145a8d' }, { title: 'Soil moisture', unit: '%', key: 'moisture', color: '#78975b' }, { title: 'Factor of safety', unit: 'FOS', key: 'fos', color: '#d99a2b' }].map((series) => <div className="panel history-chart" key={series.key}><div className="panel-heading"><div><h2>{series.title}</h2><p>{series.unit} · {period.toLowerCase()} view</p></div><span className="history-dot" style={{ background: series.color }} /></div><div className="chart-holder small-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={historyData}><CartesianGrid stroke="#eaf0ee" vertical={false} /><XAxis dataKey="time" hide /><YAxis hide /><Tooltip /><Area dataKey={series.key} stroke={series.color} fill={`${series.color}20`} strokeWidth={2} /></AreaChart></ResponsiveContainer></div></div>)}</div><div className="section-heading correlation-heading"><div><h2>What is changing together?</h2><p>Relationship between selected monitoring parameters</p></div><span className="eyebrow">CORRELATION ANALYSIS</span></div><div className="correlation-grid">{pairs.map((pair) => <div className="panel correlation-card" key={pair.title}><div className="correlation-title"><h3>{pair.title}</h3><span>r = {pair.coefficient}</span></div><div className="scatter-plot"><ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid stroke="#edf1ef" /><XAxis dataKey="rain" hide type="number" /><YAxis dataKey={pair.dataKey} hide type="number" /><Tooltip /><Scatter data={historyData} fill={pair.color} /></ScatterChart></ResponsiveContainer></div></div>)}</div><p className="correlation-footnote">Correlation indicates a statistical relationship in the available dataset; it does not by itself establish causation.</p></>
}

function exportSensorRegister(sensors: Sensor[]) {
  const rows = [
    ['Instrument', 'Current value', 'Unit', 'Status', 'Trend'],
    ...sensors.map((sensor) => [sensor.name, String(sensor.value), sensor.unit, sensor.status, sensor.trend]),
  ]
  const csv = rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'sensor-register.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function SensorPage({ sensors, onSelectSensor, onRefresh }: { sensors: Sensor[]; onSelectSensor: (name: string) => void; onRefresh: () => void }) {
  return <><div className="sensor-page-summary"><div><span>CONNECTED</span><strong>{sensors.length} <small>/ {sensors.length} sensors</small></strong></div><div><span>LAST SYNCHRONISED</span><strong>2 min <small>ago</small></strong></div><div><span>DATA QUALITY</span><strong>98.7<small>%</small></strong></div><button className="secondary-button" onClick={onRefresh}><RefreshCw size={15} />Refresh readings</button></div><div className="sensor-grid sensor-page-grid">{sensors.map((sensor) => <SensorCard key={sensor.name} sensor={sensor} onClick={() => onSelectSensor(sensor.name)} />)}</div><div className="panel sensor-table-panel"><div className="panel-heading"><div><h2>Sensor register</h2><p>Monitoring instruments configured for this site</p></div><button className="text-button" onClick={() => exportSensorRegister(sensors)}><Download size={15} />Export register</button></div><div className="table-scroll"><table><thead><tr><th>INSTRUMENT</th><th>TYPE</th><th>LOCATION</th><th>STATUS</th><th>LAST READING</th></tr></thead><tbody>{sensors.map((sensor, index) => <tr key={sensor.name}><td><span className="table-sensor-icon"><sensor.icon size={15} /></span>{sensor.name}</td><td>{['Pluviometer', 'Dielectric probe', 'Vibrating wire', 'Inclinometer', 'GNSS receiver', 'Observation well'][index]}</td><td>Station {String(index + 1).padStart(2, '0')}</td><td><span className="table-online"><i />Online</span></td><td>{sensor.value} {sensor.unit}</td></tr>)}</tbody></table></div></div></>
}

function AlertsPage({ condition, risk }: { condition: string; risk: number }) {
  return <><div className="alert-overview"><div className="panel alert-count"><span className="alert-count-icon"><Bell size={19} /></span><div><strong>2</strong><small>Open alerts</small></div></div><div className="panel alert-count"><span className="alert-count-icon amber-alert"><Check size={19} /></span><div><strong>14</strong><small>Resolved this month</small></div></div><div className="panel alert-rule-note"><ShieldCheck size={18} /><span>Thresholds are configured for this academic demonstration. Review before field use.</span></div></div><div className="panel timeline-panel"><div className="panel-heading"><div><h2>Alert timeline</h2><p>Thursday, October 08 · Himalayan Field Study</p></div><span className="open-alert-count">2 OPEN</span></div><div className="timeline"><TimelineItem time="10:42 AM" title="Pore pressure increased" description="Pore pressure reached 52 kPa, trending upward over the previous 6 hours." tone="teal" /><TimelineItem time="10:47 AM" title="Slope movement increased" description="Movement reached 0.8 mm/day and remains within the configured monitoring range." tone="green" /><TimelineItem time="10:51 AM" title="Factor of safety updated" description={`Current FOS is ${condition === 'SAFE' ? '2.91' : 'under review'} based on latest geotechnical inputs.`} tone="amber" /><TimelineItem time="10:53 AM" title={condition === 'SAFE' ? 'Routine status confirmed' : 'Warning condition generated'} description={condition === 'SAFE' ? 'No immediate warning condition detected. Continue routine observation.' : `Current category is ${condition} with an estimated risk of ${risk}%. Review recent readings.`} tone={condition === 'SAFE' ? 'green' : 'red'} last /></div></div><AlertBanner scenario={condition === 'CRITICAL' ? 'CRITICAL' : condition === 'SAFE' ? 'SAFE' : 'WARNING'} /></>
}

function TimelineItem({ time, title, description, tone, last }: { time: string; title: string; description: string; tone: string; last?: boolean }) {
  return <div className={`timeline-item ${last ? 'last' : ''}`}><span className={`timeline-dot ${tone}`} /><span className="timeline-time">{time}</span><div><strong>{title}</strong><p>{description}</p></div></div>
}

function UploadPage({ fileResult, onFile, onAnalyze, uploading }: { fileResult: { name: string; records: number; missing: number; columns: string[]; error: string } | null; onFile: (file: File) => void; onAnalyze: () => void; uploading: boolean }) {
  const [dragging, setDragging] = useState(false)
  return <><div className="upload-layout"><div className="panel upload-panel"><div className="upload-heading-icon"><FileUp size={22} /></div><h2>Import monitoring data</h2><p>Upload historical sensor observations to analyse your slope.</p><label className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files[0]) void onFile(event.dataTransfer.files[0]) }}><input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onFile(file) }} /><span className="upload-cloud"><FileUp size={22} /></span><strong>Drop your CSV file here</strong><span>or <u>browse files</u> from your computer</span><small>CSV files only · Maximum 20 MB</small></label>{fileResult && <div className={`file-result ${fileResult.error ? 'file-error' : ''}`}><div className="file-result-head"><span><HardDrive size={17} />{fileResult.name}</span>{fileResult.error ? <AlertTriangle size={17} /> : <Check size={17} />}</div>{fileResult.error ? <p>{fileResult.error}</p> : <div className="validation-list"><span><Check size={14} />File received</span><span><Check size={14} />Columns detected ({fileResult.columns.length})</span><span><Check size={14} />Timestamp recognised</span><span><Check size={14} />Data quality checked</span></div>}</div>}{fileResult && !fileResult.error && <><div className="upload-stats"><div><small>RECORDS</small><strong>{fileResult.records.toLocaleString()}</strong></div><div><small>MISSING VALUES</small><strong>{fileResult.missing}</strong></div><div><small>DATA QUALITY</small><strong>{fileResult.records ? `${Math.max(0, 100 - fileResult.missing / fileResult.records * 100).toFixed(1)}%` : '—'}</strong></div></div><button className="primary-button analyze-data" onClick={onAnalyze} disabled={uploading}><Activity size={16} />{uploading ? 'Processing monitoring data…' : 'Analyse data'}</button></>}</div><div className="upload-guide"><div className="eyebrow">CSV FORMAT</div><h3>Columns we look for</h3><p>Use one row per observation and include these exact column names. Units should match the labels.</p><div className="csv-columns">{['timestamp', 'rainfall_mm', 'soil_moisture', 'pore_pressure_kpa', 'slope_movement_mm_day', 'gnss_displacement_mm', 'inclinometer_deg', 'groundwater_head_m'].map((name) => <code key={name}>{name}</code>)}</div><button className="text-button download-template" onClick={() => { const csv = `timestamp,${['rainfall_mm', 'soil_moisture', 'pore_pressure_kpa', 'slope_movement_mm_day', 'gnss_displacement_mm', 'inclinometer_deg', 'groundwater_head_m'].join(',')}\n2026-10-08T10:00:00,12.5,74.5,52,0.8,2.1,0.04,7.4`; const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'monitoring-template.csv'; link.click(); URL.revokeObjectURL(link.href) }}><Download size={15} />Download CSV template</button></div></div></>
}

function AiPage() {
  return <><div className="ai-hero panel"><div className="ai-hero-icon"><BrainCircuit size={24} /></div><div><div className="eyebrow">TIME-SERIES MODEL</div><h2>Long Short-Term Memory (LSTM)</h2><p>Sequence learning for monitoring trends, with transparent limits on what the estimate means.</p></div><span className="demo-tag"><span /> DEMONSTRATION MODE</span></div><div className="ai-grid"><div className="panel ai-detail"><h3>What the model learns</h3><p>An LSTM can learn how combinations of rainfall, pore pressure, soil moisture and movement have changed before. A sequence of past observations is used to estimate a future stability indicator.</p><div className="feature-list">{['Rainfall', 'Soil moisture', 'Pore pressure', 'Slope movement', 'GNSS displacement', 'Inclinometer', 'Groundwater'].map((item) => <span key={item}><Check size={14} />{item}</span>)}</div></div><div className="panel model-config"><h3>Model configuration</h3><div className="calculation-line"><span>Input sequence</span><b>7 previous observations</b></div><div className="calculation-line"><span>Prediction horizon</span><b>4 days</b></div><div className="calculation-line"><span>Training status</span><b>Not trained</b></div><div className="calculation-line"><span>MAE / RMSE</span><b>Unavailable</b></div><p className="demo-note">A trained model requires sufficient, validated site observations. The current prediction view uses a deterministic demonstration estimate and does not report fabricated training metrics.</p></div></div><div className="panel model-flow"><div className="eyebrow">MODEL WORKFLOW</div><div className="flow-diagram"><span>Past 7 observations</span><ArrowRight size={16} /><span>Normalise features</span><ArrowRight size={16} /><span className="flow-highlight">LSTM sequence model</span><ArrowRight size={16} /><span>Future FOS estimate</span></div></div></>
}

function ReportsPage({ onExport, fos, risk, condition }: { onExport: () => void; fos: number; risk: number; condition: string }) {
  return <><div className="report-layout"><div className="panel report-preview"><div className="report-preview-top"><div className="brand-mark"><Mountain size={18} /></div><span>ENGINEERING SUMMARY · 08 OCT 2026</span></div><div className="eyebrow">HIMALAYAN FIELD STUDY</div><h2>Monitoring condition report</h2><p className="report-intro">A summary of the observed slope condition and available monitoring information.</p><div className="report-metrics"><div><span>FACTOR OF SAFETY</span><strong>{fos.toFixed(2)}</strong></div><div><span>CURRENT RISK</span><strong>{risk}%</strong></div><div><span>CONDITION</span><strong className="condition-text">{condition}</strong></div></div><h3>Engineering interpretation</h3><p>Current monitoring indicators suggest a {condition.toLowerCase()} condition. Rainfall and pore pressure trends should be interpreted alongside the site-specific geotechnical model and reviewed by a qualified engineer.</p><h3>Limitations</h3><p>Academic demonstration model. Not a substitute for site-specific geotechnical design, field inspection or professional engineering judgement.</p></div><div className="report-options"><div className="eyebrow">REPORT CONTENTS</div><h3>Included in your export</h3>{['Project information', 'Sensor summary', 'Current condition & FOS', 'Risk estimate', 'Engineering interpretation', 'Limitations & disclaimer'].map((item) => <div key={item} className="report-check"><Check size={15} />{item}</div>)}<button className="primary-button" onClick={onExport}><Download size={16} />Download report</button><small>Exports a plain-text project summary. PDF export can be added when a PDF rendering service is configured.</small></div></div><div className="disclaimer report-disclaimer"><TriangleAlert size={15} />This report is for academic demonstration and review purposes only.</div></>
}

function SettingsPage({ frequency, setFrequency }: { frequency: string; setFrequency: (value: string) => void }) {
  const [notifications, setNotifications] = useState(true)
  const [units, setUnits] = useState('Metric')
  return <div className="settings-layout"><div className="panel settings-panel"><div className="panel-heading"><div><h2>Monitoring preferences</h2><p>Configure how this dashboard presents site data.</p></div><Settings size={18} /></div><label className="settings-row"><span><strong>Reading refresh frequency</strong><small>How often the dashboard checks for updated readings.</small></span><select value={frequency} onChange={(event) => setFrequency(event.target.value)}><option>Every 1 minute</option><option>Every 5 minutes</option><option>Every 15 minutes</option></select></label><label className="settings-row"><span><strong>Units</strong><small>Displayed units for measurements and inputs.</small></span><select value={units} onChange={(event) => setUnits(event.target.value)}><option>Metric</option><option>Imperial</option></select></label><div className="settings-row"><span><strong>Alert notifications</strong><small>Show in-app notifications for threshold changes.</small></span><button className={`toggle ${notifications ? 'on' : ''}`} onClick={() => setNotifications(!notifications)} role="switch" aria-checked={notifications}><i /></button></div></div><div className="panel project-info"><div className="eyebrow">PROJECT IDENTITY</div><h3>SMART SLOPE</h3><p>AI + IoT + Geotechnical Engineering</p><div className="project-info-rule" /><span>From Monitoring Data to Safer Decisions</span><small>Academic project · Dashboard v1.0</small></div></div>
}

function SensorDrawer({ sensor, onClose }: { sensor: Sensor; onClose: () => void }) {
  const Icon = sensor.icon
  return <><button className="drawer-scrim" onClick={onClose} aria-label="Close sensor details" /><aside className="sensor-drawer"><div className="drawer-head"><span className="sensor-icon" style={{ color: sensor.color, backgroundColor: `${sensor.color}13` }}><Icon size={18} /></span><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div><div className="eyebrow">SENSOR DETAILS</div><h2>{sensor.name}</h2><div className="drawer-value">{sensor.value}<small>{sensor.unit}</small></div><span className={`sensor-badge ${sensor.status.toLowerCase()}`}>{sensor.status}</span><div className="drawer-divider" /><div className="drawer-data-row"><span>Recent trend</span><strong>{sensor.trend}</strong></div><div className="drawer-data-row"><span>Last update</span><strong>2 minutes ago</strong></div><div className="drawer-data-row"><span>Station</span><strong>HFS-{String(initialSensors.indexOf(sensor) + 1).padStart(2, '0')}</strong></div><div className="drawer-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={sensor.values.map((value, index) => ({ time: index, value }))}><Area dataKey="value" stroke={sensor.color} fill={`${sensor.color}20`} strokeWidth={2} /></AreaChart></ResponsiveContainer></div><button className="secondary-button drawer-action" onClick={onClose}>Close details</button></aside></>
}

export default App