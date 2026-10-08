# Smart Slope Stability Monitoring

A light engineering monitoring dashboard built with React, TypeScript, Vite, Recharts, Leaflet and FastAPI. The sample site and sensor readings are demonstration data. An uploaded poster image was not available in the workspace, so the interface follows the written project brief.

## Project structure

```text
smart-slope-monitoring/
  backend/
    engineering/factor_of_safety.py
    ml/lstm_model.py
    tests/test_factor_of_safety.py
    database.py
    main.py
    models.py
    reporting.py
    requirements.txt
    requirements-ml.txt
  examples/demo-monitoring.csv
  src/App.tsx
  src/main.tsx
  src/styles.css
  index.html
  package.json
```

## Prerequisites

- Node.js 20 or newer and npm.
- Python 3.10 or newer for the API. Python is not installed in the current workspace environment.
- Optional: TensorFlow for trained LSTM predictions. The base app does not require TensorFlow.

## Install and run

From the `smart-slope-monitoring` directory:

```powershell
npm install
npm run dev
```

In a second terminal, create and activate a virtual environment, install the API requirements, then start FastAPI:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Open the Vite URL printed by npm, normally `http://localhost:5173`. FastAPI's interactive API documentation is at `http://localhost:8000/docs`.

To enable LSTM training, install `backend/requirements-ml.txt` in an environment with a supported TensorFlow build. TensorFlow is intentionally separate because it is a large optional dependency.

## Database and demo data

SQLite is created automatically as `smart_slope.db` in the backend process working directory. SQLAlchemy creates the `slopes`, `sensors`, `sensor_readings`, `geotechnical_parameters`, `fos_results`, `predictions`, `alerts` and `model_runs` tables at startup. The API seeds the Himalayan Field Study and clearly illustrative initial sensor readings on the first request. To choose another SQLite path, set `DATABASE_URL`, for example `sqlite:///./data/project.db`.

The built-in simulation is labelled **DEMO SENSOR DATA**. It is intended for a project presentation, not field decisions. A sample CSV is provided at `examples/demo-monitoring.csv`.

## CSV format

Use a header row with all of these required columns (case-insensitive):

```csv
timestamp,rainfall_mm,soil_moisture,pore_pressure_kpa,slope_movement_mm_day,gnss_displacement_mm,inclinometer_deg,groundwater_head_m
```

Use ISO-8601 timestamps and numeric values in the named units. The API reports missing columns in readable language, coerces invalid numeric cells to missing values, and returns record count, monitoring period, missing-value count and data-quality percentage.

## API endpoints

- `GET /api/health` — API and database service check.
- `GET /api/dashboard` — current demo or latest saved stability summary.
- `GET /api/sensors` — most recent reading for each configured instrument.
- `POST /api/analysis` — validate geotechnical inputs, calculate and save FOS, and create a warning alert for warning/critical results.
- `POST /api/simulation` — deterministic scenario readings and resulting demo risk for a simulation step.
- `GET /api/predictions` — deterministic demo estimate when no trained model data is available.
- `POST /api/predictions/train` — train/evaluate an LSTM from a CSV containing the required sensor columns plus a `fos` target column.
- `GET /api/alerts` — saved assessment alerts.
- `POST /api/upload` — validate a monitoring CSV and import readings to SQLite.
- `GET /api/reports/pdf` — create a PDF summary from the latest saved assessment and readings.

The frontend uses local demonstration behavior when the API is unavailable; it does not pretend a failed upload was imported or an untrained model was trained.

## Engineering methods

The academic FOS calculation uses a simplified infinite-slope model. With slope height $H$, angle $\beta$, unit weight $\gamma$, cohesion $c$, friction angle $\phi$, pore pressure $u$, groundwater head $h_w$, surcharge $q$ and seismic coefficient $k_h$:

$$
\sigma_n = \gamma H \cos^2(\beta), \quad
\sigma'_n = \max(0, \sigma_n - u - 2.2h_w)
$$

$$
\tau_r = c + \sigma'_n \tan(\phi), \quad
\tau_d = \gamma H\sin(\beta)\cos(\beta) + q\sin(\beta) + k_h\gamma H
$$

$$
FOS = \frac{\tau_r}{\max(1,\tau_d)}
$$

Project display thresholds are configurable in `backend/engineering/factor_of_safety.py`: SAFE ≥ 1.50, CAUTION 1.20–1.49, WARNING 1.00–1.19, CRITICAL < 1.00. The groundwater conversion and planar failure assumption are simplifications for demonstration only.

The LSTM uses seven prior observations of rainfall, soil moisture, pore pressure, movement, GNSS displacement, inclinometer and groundwater head. It predicts the next FOS target. At least 20 supervised sequences and TensorFlow are needed to train; otherwise the API returns an explicitly labelled deterministic demonstration estimate. MAE, RMSE, training loss and validation loss are only returned after a successful training run.

Risk is a display estimate, not a calibrated probability: `clamp(round((3.4 - FOS) × 11), 3, 96)`. Scenario simulation adds an illustrative scenario offset. Do not interpret it as a validated probability of failure.

## Demo presentation sequence

1. Start the API and frontend; open Home and explain the current FOS and engineering cross-section.
2. Open Live Monitoring, start simulation, and change SAFE to WARNING or CRITICAL to see gradual values and messages.
3. Open Predictions and explain that the current estimate is deterministic demo mode.
4. Change analysis parameters, recalculate and expand the calculation assumptions.
5. Upload the included CSV, inspect validation feedback, then review History and Alerts.
6. Download the report PDF while the API is running.

## Limitations

This is an academic demonstrator, not a site-specific geotechnical design system. The slope illustration and coordinates are illustrative. Default sensor observations and initial FOS are demo values. The simplified FOS method is not a substitute for limit-equilibrium analysis, calibrated constitutive models, field inspection or a qualified engineer. Risk is not statistically calibrated. The LSTM has no pretrained model; it only trains when suitable labelled observations are supplied. The visible map relies on third-party tile services. The dashboard's browser simulation is explicitly marked as demo data.

## Viva summary

The system brings environmental and geotechnical measurements into one interface, validates time-stamped CSV readings, stores readings and assessments in SQLite, and compares simplified shear resistance with driving demand to report a transparent factor of safety. A threshold layer communicates the condition in human language. An optional LSTM can learn temporal associations from labelled site history; where data or TensorFlow is insufficient, the app clearly shows a deterministic demo estimate instead of implying trained AI. Every result requires site-specific validation before engineering use.