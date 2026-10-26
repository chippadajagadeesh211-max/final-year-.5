export const MODEL_FEATURES = [
  'unit_weight_kN_m3',
  'soil_cohesion_kPa',
  'friction_angle_deg',
  'slope_angle_deg',
  'slope_height_m',
  'pore_water_pressure_ratio',
  'reinforcement_type',
] as const

export const PREDICTION_COLUMNS = [
  'predicted_factor_of_safety',
  'predicted_risk_class',
  'predicted_warning_level',
  'prediction_status',
] as const

const featureAliases: Record<string, (typeof MODEL_FEATURES)[number]> = {
  'unit weight (kn/m³)': 'unit_weight_kN_m3',
  'unit weight (kn/m3)': 'unit_weight_kN_m3',
  'cohesion (kpa)': 'soil_cohesion_kPa',
  'internal friction angle (°)': 'friction_angle_deg',
  'internal friction angle (deg)': 'friction_angle_deg',
  'friction angle (°)': 'friction_angle_deg',
  'friction angle (deg)': 'friction_angle_deg',
  'slope angle (°)': 'slope_angle_deg',
  'slope angle (deg)': 'slope_angle_deg',
  'slope height (m)': 'slope_height_m',
  'pore water pressure ratio': 'pore_water_pressure_ratio',
  'reinforcement type': 'reinforcement_type',
}

function normalizeColumn(column: string): string {
  const normalized = column.trim().toLowerCase()
  return featureAliases[normalized] ?? normalized
}

export type PredictionRow = Record<string, string | number | null>

export type CsvPreview = {
  columns: string[]
  records: number
  missingColumns: string[]
}

export type BatchPredictionResponse = {
  records: number
  columns: string[]
  predicted_rows: number
  failed_rows: number
  rows: PredictionRow[]
  warning_thresholds: Record<string, number>
  notice: string
}

const configuredApiUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '')
export const API_BASE_URL = configuredApiUrl || (import.meta.env.DEV ? 'http://localhost:8000' : '')

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`
}

export function parseCsvPreview(text: string): CsvPreview {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let hasRecordContent = false
  const source = text.replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += character
      }
      continue
    }

    if (character === '"' && field.length === 0) {
      inQuotes = true
      hasRecordContent = true
    } else if (character === ',') {
      row.push(field)
      field = ''
      hasRecordContent = true
    } else if (character === '\n' || character === '\r') {
      if (hasRecordContent || field.length > 0 || row.length > 0) {
        row.push(field)
        rows.push(row)
      }
      row = []
      field = ''
      hasRecordContent = false
      if (character === '\r' && source[index + 1] === '\n') index += 1
    } else {
      field += character
      hasRecordContent = true
    }
  }

  if (inQuotes) throw new Error('The CSV contains an unclosed quoted field.')
  if (hasRecordContent || field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const header = rows.shift()
  if (!header || !header.some((column) => column.trim())) {
    throw new Error('The CSV is empty or does not contain a header row.')
  }

  const columns = header.map((column) => column.trim())
  const normalized = columns.map((column) => normalizeColumn(column).toLowerCase())
  const duplicates = normalized.filter((column, index) => normalized.indexOf(column) !== index)
  if (duplicates.length) {
    throw new Error(`Duplicate column name: ${[...new Set(duplicates)].join(', ')}.`)
  }
  const outputCollisions = PREDICTION_COLUMNS.filter((column) => normalized.includes(column))
  if (outputCollisions.length) {
    throw new Error(`Rename existing prediction output columns before uploading: ${outputCollisions.join(', ')}.`)
  }
  const missingColumns = MODEL_FEATURES.filter((feature) => !normalized.includes(feature.toLowerCase()))
  return { columns, records: rows.length, missingColumns }
}

export async function responseError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { detail?: string | { msg?: string }[] }
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail)) return body.detail.map((issue) => issue.msg).filter(Boolean).join('; ')
  } catch {
    // The response body can be plain text for a reverse-proxy or hosting error.
  }
  return `Prediction service returned HTTP ${response.status}.`
}

export function predictionRequestError(error: unknown): string {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'Cannot reach the prediction API. Check that FastAPI is running, VITE_API_BASE_URL is correct, and the backend allows this site through CORS.'
  }
  return error instanceof Error ? error.message : 'The model service is unavailable.'
}

export function downloadPredictionCsv(columns: string[], rows: PredictionRow[], filename: string): void {
  const escapeCell = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? '' : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }
  const csv = [columns, ...rows.map((row) => columns.map((column) => row[column] ?? null))]
    .map((record) => record.map(escapeCell).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
