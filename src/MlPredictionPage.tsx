import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, AlertTriangle, BrainCircuit, Check, Download, FileUp, LoaderCircle, ShieldCheck } from 'lucide-react'
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import {
  API_BASE_URL,
  MODEL_FEATURES,
  apiUrl,
  downloadPredictionCsv,
  parseCsvPreview,
  predictionRequestError,
  responseError,
} from './mlPrediction'
import type { BatchPredictionResponse, CsvPreview, PredictionRow } from './mlPrediction'

const predictionHistoryEvent = 'ml-prediction-saved'

type ModelInfo = {
  ready: boolean
  message: string
  selected_models?: { regression: string; classification: string }
  report?: {
    dataset_rows: number
    rows_used: number
    dataset: { source: string; licence: string; target_column: string }
    target_definition: { classification: string; classification_notice: string }
    feature_importance: {
      regression: { feature: string; importance: number }[]
      notice: string
    }
    test_plot_points: { actual: number; predicted: number; residual: number }[]
    test_plot_notice: string
    training_data_notice: string
    test_metrics: {
      regression: { mae: number; rmse: number; r2: number }
      classification: {
        accuracy: number
        balanced_accuracy: number
        precision_macro: number
        recall_macro: number
        f1_macro: number
        confusion_matrix: number[][]
        confusion_matrix_labels: string[]
      }
    }
  }
}

type ManualResult = {
  predicted_factor_of_safety: number
  predicted_risk_class: string
  predicted_warning_level: string
  warning_thresholds: Record<string, number>
  training_range_warnings: string[]
  model_version: string
  notice: string
}

type UploadPageProps = {
  onPredictions: (rows: PredictionRow[]) => void
}

const featureLabels: Record<(typeof MODEL_FEATURES)[number], { label: string; unit: string; min?: number; max?: number; options?: string[] }> = {
  unit_weight_kN_m3: { label: 'Unit weight', unit: 'kN/m³', min: 0, max: 50 },
  soil_cohesion_kPa: { label: 'Soil cohesion', unit: 'kPa', min: 0 },
  friction_angle_deg: { label: 'Friction angle', unit: '°', min: 0, max: 89.999 },
  slope_angle_deg: { label: 'Slope angle', unit: '°', min: 0, max: 89.999 },
  slope_height_m: { label: 'Slope height', unit: 'm', min: 0 },
  pore_water_pressure_ratio: { label: 'Pore-water pressure ratio', unit: 'dimensionless', min: 0, max: 1 },
  reinforcement_type: {
    label: 'Reinforcement type',
    unit: 'category',
    options: ['Drainage', 'Geosynthetics', 'Retaining Wall', 'Soil Nailing'],
  },
}

export function MlPredictionPage() {
  return <>
    <div className="demo-banner prediction-banner"><span className="demo-tag"><BrainCircuit size={13} /> USER-SUPPLIED DATASET</span><span>Dataset provenance is unverified. Prototype metrics do not establish field accuracy or slope safety.</span></div>
    <ModelEvaluationPage />
    <ManualPrediction />
    <PredictionHistory />
  </>
}

export function ModelEvaluationPage() {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)

  useEffect(() => {
    if (!API_BASE_URL) {
      setModelInfo({ ready: false, message: 'Configure VITE_API_BASE_URL to connect this GitHub Pages site to the deployed FastAPI service.' })
      return
    }
    let active = true
    fetch(apiUrl('/api/ml/model-info'))
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response))
        return await response.json() as ModelInfo
      })
      .then((result) => { if (active) setModelInfo(result) })
      .catch((error: unknown) => {
        if (active) setModelInfo({ ready: false, message: predictionRequestError(error) })
      })
    return () => { active = false }
  }, [])

  return <ModelEvaluation info={modelInfo} />
}

function ModelEvaluation({ info }: { info: ModelInfo | null }) {
  if (!info?.ready || !info.report || !info.selected_models) {
    return <div className="panel model-status"><div className="model-status-heading"><AlertTriangle size={17} /><strong>Trained model unavailable</strong></div><p>{info?.message ?? 'Connecting to the FastAPI model service…'}</p></div>
  }
  const { regression, classification } = info.report.test_metrics
  return <section className="panel model-evaluation">
    <div className="panel-heading"><div><h2>Held-out model evaluation</h2><p>Untouched test split · {info.report.dataset_rows.toLocaleString()} source rows, {info.report.rows_used.toLocaleString()} used</p></div><span className="demo-tag"><span /> SOURCE UNVERIFIED</span></div>
    <div className="model-metric-groups">
      <div><h3>Regression · {info.selected_models.regression}</h3><div className="metric-values"><span>MAE <strong>{regression.mae.toFixed(4)}</strong></span><span>RMSE <strong>{regression.rmse.toFixed(4)}</strong></span><span>R² <strong>{regression.r2.toFixed(4)}</strong></span></div></div>
      <div><h3>Classification · {info.selected_models.classification}</h3><div className="metric-values"><span>Accuracy <strong>{(classification.accuracy * 100).toFixed(1)}%</strong></span><span>Balanced accuracy <strong>{(classification.balanced_accuracy * 100).toFixed(1)}%</strong></span><span>Precision (macro) <strong>{(classification.precision_macro * 100).toFixed(1)}%</strong></span><span>Recall (macro) <strong>{(classification.recall_macro * 100).toFixed(1)}%</strong></span><span>F1 (macro) <strong>{(classification.f1_macro * 100).toFixed(1)}%</strong></span></div></div>
    </div>
    <div className="model-diagnostic-grid">
      <div className="model-chart"><h3>Actual vs predicted FoS</h3><ResponsiveContainer width="100%" height={220}><ScatterChart margin={{ top: 8, right: 16, bottom: 12, left: 0 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" dataKey="actual" name="Actual FoS" label={{ value: 'Actual FoS', position: 'insideBottom', offset: -8 }} /><YAxis type="number" dataKey="predicted" name="Predicted FoS" label={{ value: 'Predicted FoS', angle: -90, position: 'insideLeft' }} /><Tooltip cursor={{ strokeDasharray: '3 3' }} /><Scatter data={info.report.test_plot_points} fill="#168f9a" /></ScatterChart></ResponsiveContainer></div>
      <div className="model-chart"><h3>Regression residuals</h3><ResponsiveContainer width="100%" height={220}><ScatterChart margin={{ top: 8, right: 16, bottom: 12, left: 0 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" dataKey="actual" name="Actual FoS" label={{ value: 'Actual FoS', position: 'insideBottom', offset: -8 }} /><YAxis type="number" dataKey="residual" name="Residual" label={{ value: 'Residual', angle: -90, position: 'insideLeft' }} /><ReferenceLine y={0} stroke="#d66a49" strokeDasharray="4 4" /><Tooltip cursor={{ strokeDasharray: '3 3' }} /><Scatter data={info.report.test_plot_points} fill="#df9851" /></ScatterChart></ResponsiveContainer></div>
    </div>
    <p className="synthetic-caveat">{info.report.test_plot_notice}</p>
    <div className="table-scroll confusion-table"><table><thead><tr><th>ACTUAL / PREDICTED</th>{classification.confusion_matrix_labels.map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{classification.confusion_matrix.map((values, index) => <tr key={classification.confusion_matrix_labels[index]}><td>{classification.confusion_matrix_labels[index]}</td>{values.map((value, column) => <td key={`${index}-${column}`}>{value}</td>)}</tr>)}</tbody></table></div>
    <div className="table-scroll confusion-table"><table><thead><tr><th>Regression feature association (not causation)</th><th>Relative importance</th></tr></thead><tbody>{info.report.feature_importance.regression.slice(0, 5).map((item) => <tr key={item.feature}><td>{item.feature}</td><td>{item.importance.toFixed(4)}</td></tr>)}</tbody></table></div>
    <p className="synthetic-caveat">{info.report.dataset.source}. {info.report.dataset.licence} {info.report.training_data_notice} Classification rule: {info.report.target_definition.classification}. {info.report.target_definition.classification_notice}</p>
  </section>
}

function ManualPrediction() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ManualResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)

  async function predict(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const missing = MODEL_FEATURES.filter((feature) => !values[feature]?.trim())
    if (missing.length) {
      setError(`Enter a value for every required measurement: ${missing.map((feature) => featureLabels[feature].label).join(', ')}.`)
      setResult(null)
      return
    }
    const features = Object.fromEntries(MODEL_FEATURES.map((feature) => [
      feature,
      feature === 'reinforcement_type' ? values[feature] : Number(values[feature]),
    ]))
    if (Object.entries(features).some(([feature, value]) => feature !== 'reinforcement_type' && (typeof value !== 'number' || !Number.isFinite(value)))) {
      setError('Every measurement must be a finite number. Check for text, NaN, or infinity values.')
      setResult(null)
      return
    }
    if (!API_BASE_URL) {
      setError('The model API is not configured. Set VITE_API_BASE_URL to the deployed FastAPI URL.')
      setResult(null)
      return
    }

    submitting.current = true
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const response = await fetch(apiUrl('/api/ml/predict/manual'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features }),
      })
      if (!response.ok) throw new Error(await responseError(response))
      setResult(await response.json() as ManualResult)
      window.dispatchEvent(new Event(predictionHistoryEvent))
    } catch (requestError) {
      setError(predictionRequestError(requestError))
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return <section className="manual-prediction">
    <div className="section-heading"><div><h2>Manual model prediction</h2><p>Enter only the seven features supported by this dataset and model; no missing values are substituted.</p></div><span className="eyebrow">TRAINED MODEL OUTPUT</span></div>
    <form className="panel manual-form" onSubmit={(event) => void predict(event)}>
      <div className="manual-fields">{MODEL_FEATURES.map((feature) => {
        const config = featureLabels[feature]
        return <label className="field" key={feature}><span>{config.label} <small>({config.unit})</small></span><div className="field-input">{config.options ? <select aria-label={`${config.label} (${config.unit})`} value={values[feature] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [feature]: event.target.value }))} required><option value="">Select a category</option>{config.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input aria-label={`${config.label} (${config.unit})`} type="number" step="any" min={config.min} max={config.max} value={values[feature] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [feature]: event.target.value }))} required />}</div></label>
      })}</div>
      <button className="primary-button analyze-data" type="submit" disabled={loading}><Activity size={16} />{loading ? <><LoaderCircle size={15} className="spin-icon" />Predicting…</> : 'Predict with trained model'}</button>
    </form>
    {error && <div className="panel prediction-message prediction-error" role="alert"><AlertTriangle size={16} />{error}</div>}
    {result && <div className="panel manual-result" role="status">
      <div className="panel-heading"><div><h2>Model prediction</h2><p>Generated from the entered measurements</p></div><ShieldCheck size={19} /></div>
      <div className="manual-result-values"><div><span>ESTIMATED FACTOR OF SAFETY</span><strong>{result.predicted_factor_of_safety.toFixed(3)}</strong></div><div><span>PREDICTED RISK CATEGORY</span><strong>{result.predicted_risk_class}</strong></div><div><span>PROTOTYPE WARNING LEVEL</span><strong>{result.predicted_warning_level}</strong></div></div>
      <p className="synthetic-caveat">{result.notice} Binary project convention: FoS &lt; {result.warning_thresholds.unstable.toFixed(2)} is UNSTABLE; otherwise STABLE. Model version: {result.model_version}.</p>
      {result.training_range_warnings.length > 0 && <p className="prediction-message prediction-error" role="note">Outside training-data range: {result.training_range_warnings.join('; ')}.</p>}
    </div>}
  </section>
}

export function DataUploadPage({ onPredictions }: UploadPageProps) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<BatchPredictionResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const submitting = useRef(false)
  const pageSize = 25
  const visibleRows = result?.rows.slice(page * pageSize, (page + 1) * pageSize) ?? []

  async function selectFile(selected: File) {
    setFile(selected)
    setPreview(null)
    setResult(null)
    setError('')
    onPredictions([])
    if (!selected.name.toLowerCase().endsWith('.csv')) {
      setError('Please choose a CSV file.')
      return
    }
    if (selected.size > 20 * 1024 * 1024) {
      setError('This file is larger than 20 MB. Please choose a smaller CSV.')
      return
    }
    try {
      const parsed = parseCsvPreview(await selected.text())
      setPreview(parsed)
      if (parsed.records === 0) setError('The CSV has a header but no data rows.')
      else if (parsed.missingColumns.length) setError(`Missing required model input columns: ${parsed.missingColumns.join(', ')}.`)
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'The CSV could not be read.')
    }
  }

  async function predictCsv() {
    if (!file || !preview || preview.missingColumns.length || preview.records === 0 || submitting.current) return
    if (!API_BASE_URL) {
      setError('The model API is not configured. Set VITE_API_BASE_URL to the deployed FastAPI URL.')
      return
    }
    submitting.current = true
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch(apiUrl('/api/ml/predict/csv'), { method: 'POST', body: form })
      if (!response.ok) throw new Error(await responseError(response))
      const prediction = await response.json() as BatchPredictionResponse
      setResult(prediction)
      setPage(0)
      onPredictions(prediction.rows)
      window.dispatchEvent(new Event(predictionHistoryEvent))
    } catch (requestError) {
      setError(`${predictionRequestError(requestError)} No predictions were produced.`)
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  const headers = result?.columns ?? []
  return <><div className="upload-layout"><div className="panel upload-panel">
    <div className="upload-heading-icon"><FileUp size={22} /></div><h2>Batch CSV prediction</h2><p>Upload rows containing the seven model features. Supported dataset headers are mapped automatically; extra columns are preserved in the results.</p>
    <label className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const selected = event.dataTransfer.files[0]; if (selected) void selectFile(selected) }}>
      <input type="file" accept=".csv,text/csv" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void selectFile(selected); event.target.value = '' }} />
      <span className="upload-cloud"><FileUp size={22} /></span><strong>Drop your CSV file here</strong><span>or <u>browse files</u> from your computer</span><small>CSV files only · Maximum 20 MB</small>
    </label>
    {file && <div className={`file-result ${error ? 'file-error' : ''}`}><div className="file-result-head"><span><FileUp size={16} />{file.name}</span>{error ? <AlertTriangle size={17} /> : <Check size={17} />}</div>
      {preview && <><p>{preview.records.toLocaleString()} data rows · {preview.columns.length} columns</p><div className="csv-detected-columns">{preview.columns.map((column) => <code key={column}>{column}</code>)}</div></>}
    </div>}
    {preview && <div className="upload-stats"><div><small>UPLOADED ROWS</small><strong>{preview.records.toLocaleString()}</strong></div><div><small>REQUIRED FEATURES</small><strong>{MODEL_FEATURES.length}</strong></div><div><small>MODEL</small><strong>{loading ? 'Running…' : result ? 'Complete' : 'Ready'}</strong></div></div>}
    <button className="primary-button analyze-data" onClick={() => void predictCsv()} disabled={!file || !preview || !!error || loading}><Activity size={16} />{loading ? <><LoaderCircle size={15} className="spin-icon" />Predicting every row…</> : 'Predict CSV rows'}</button>
    {error && <div className="prediction-message prediction-error" role="alert"><AlertTriangle size={16} />{error}</div>}
    {result && <div className="batch-result-summary"><strong>{result.predicted_rows.toLocaleString()} predicted</strong><span>{result.failed_rows.toLocaleString()} row errors</span><button className="secondary-button" onClick={() => downloadPredictionCsv(result.columns, result.rows, 'slope-stability-predictions.csv')}><Download size={15} />Download results CSV</button><p>{result.notice}</p></div>}
  </div><div className="upload-guide"><div className="eyebrow">REQUIRED MODEL INPUTS</div><h3>7 dataset-supported features</h3><p>Include every listed input. The source dataset headers are mapped automatically. Missing values are reported per row, never replaced with zero.</p><div className="csv-columns">{MODEL_FEATURES.map((name) => <code key={name}>{name}</code>)}</div><p className="coordinates-note">Extra fields, including coordinates and source target columns, are preserved but are not model inputs.</p></div>
    {result && <div className="panel prediction-table-panel"><div className="panel-heading"><div><h2>Prediction results</h2><p>Original input columns plus model outputs and range warnings</p></div><span className="demo-tag"><span /> {result.records.toLocaleString()} ROWS</span></div><div className="table-scroll prediction-table-scroll"><table><thead><tr>{headers.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={page * pageSize + index} className={String(row.prediction_status).startsWith('error:') ? 'prediction-row-error' : ''}>{headers.map((column) => <td key={column}>{row[column] === null || row[column] === undefined ? '—' : String(row[column])}</td>)}</tr>)}</tbody></table></div><div className="prediction-pagination"><span>Rows {page * pageSize + 1}–{Math.min((page + 1) * pageSize, result.records)} of {result.records}</span><button className="secondary-button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>Previous</button><button className="secondary-button" onClick={() => setPage((current) => Math.min(Math.ceil(result.records / pageSize) - 1, current + 1))} disabled={(page + 1) * pageSize >= result.records}>Next</button></div><p className="synthetic-caveat">Rows with missing or invalid inputs are retained with an explanatory prediction_status; their model output fields are blank.</p></div>}
    <span className="visually-hidden" aria-live="polite">{loading ? 'Predictions are running.' : result ? `${result.predicted_rows} rows predicted; ${result.failed_rows} rows failed validation.` : ''}</span>
  </div><PredictionHistory /></>
}

type HistoryEntry = {
  id: number
  scenario: string
  input_parameters: Record<string, string | number>
  predicted_factor_of_safety: number
  predicted_risk_class: string
  model_version: string
  created_at: string
}

function PredictionHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadHistory() {
      if (!API_BASE_URL) {
        setError('Prediction history is available when the FastAPI model service is configured.')
        return
      }
      try {
        const response = await fetch(apiUrl('/api/ml/history'))
        if (!response.ok) throw new Error(await responseError(response))
        const history = await response.json() as HistoryEntry[]
        if (active) {
          setEntries(history)
          setError('')
        }
      } catch (requestError) {
        if (active) setError(predictionRequestError(requestError))
      }
    }
    const refresh = () => { void loadHistory() }
    void loadHistory()
    window.addEventListener(predictionHistoryEvent, refresh)
    return () => {
      active = false
      window.removeEventListener(predictionHistoryEvent, refresh)
    }
  }, [])

  return <section className="panel prediction-table-panel">
    <div className="panel-heading"><div><h2>Saved model prediction history</h2><p>Local SQLite records; hypothetical/model scenarios are not field observations.</p></div><span className="demo-tag"><span /> {entries.length} SAVED</span></div>
    {error && <p className="synthetic-caveat" role="status">{error}</p>}
    {!error && entries.length === 0 && <p className="synthetic-caveat">No model predictions have been saved yet.</p>}
    {entries.length > 0 && <div className="table-scroll prediction-table-scroll"><table><thead><tr><th>Timestamp</th><th>Scenario</th><th>Predicted FoS</th><th>Model class</th><th>Model version</th><th>Inputs</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{new Date(entry.created_at).toLocaleString()}</td><td>{entry.scenario}</td><td>{entry.predicted_factor_of_safety.toFixed(3)}</td><td>{entry.predicted_risk_class}</td><td>{entry.model_version}</td><td><details><summary>View inputs</summary><pre>{JSON.stringify(entry.input_parameters, null, 2)}</pre></details></td></tr>)}</tbody></table></div>}
  </section>
}
