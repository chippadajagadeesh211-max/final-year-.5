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
- Python 3.10 or newer for the API and model training.

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

Install the model training dependencies with `pip install -r backend\requirements-ml.txt`, then follow [ML-SETUP.md](./ML-SETUP.md) to train the models and configure CSV and manual predictions.

## Database and demo data

SQLite is created automatically as `smart_slope.db` in the backend process working directory. SQLAlchemy creates the `slopes`, `sensors`, `sensor_readings`, `geotechnical_parameters`, `fos_results`, `predictions`, `alerts` and `model_runs` tables at startup. The API seeds the Himalayan Field Study and clearly illustrative initial sensor readings on the first request. To choose another SQLite path, set `DATABASE_URL`, for example `sqlite:///./data/project.db`.

The built-in simulation is labelled **DEMO SENSOR DATA**. It is software-only and intended for a project presentation, not field decisions. A sample monitoring CSV is provided at `examples/demo-monitoring.csv`. No physical sensors are connected.

## CSV format

Monitoring history imports use the legacy sensor format below. ML predictions use the seven features actually present in the supplied slope-stability CSV; source mappings and units are documented in [ML-SETUP.md](./ML-SETUP.md).

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
- `GET /api/predictions` and `POST /api/predictions/train` — disabled legacy demo/LSTM routes; return explicit 503/410 responses rather than fabricated estimates or on-request training.
- `GET /api/ml/model-info` — trained-model readiness, selected estimators and held-out evaluation metrics.
- `GET /api/ml/history` — latest saved manual and CSV model predictions from SQLite.
- `POST /api/ml/predict/csv` — predict all valid CSV rows while retaining invalid rows with row-specific errors.
- `POST /api/ml/predict/manual` — predict from seven validated dataset-supported feature values and save the result to history.
- `GET /api/alerts` — saved assessment alerts.
- `POST /api/upload` — validate a monitoring CSV and import readings to SQLite.
- `GET /api/reports/pdf` — create a PDF summary from the latest saved assessment and readings.

The frontend uses local demonstration behavior when the API is unavailable; it does not pretend a failed upload was imported or an untrained model was trained.

## Engineering methods

The academic FOS calculation uses a simplified planar infinite-slope approximation. Its input assumptions and equation are listed here for transparency, but this calculation has not been independently validated against a reference case and must not be treated as verified engineering output. With the current project inputs—slope height $H$, angle $\beta$, unit weight $\gamma$, cohesion $c$, friction angle $\phi$, pore pressure $u$, groundwater input $h_w$, surcharge $q$ and seismic coefficient $k_h$:

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

The legacy experimental LSTM module and its API routes are disabled; they do not return demo estimates or train on prediction requests. The prediction API loads fitted Random Forest or Linear Regression and Random Forest or Logistic Regression pipelines trained through the script documented in [ML-SETUP.md](./ML-SETUP.md). Risk classification is derived from the observed FoS target: UNSTABLE below 1.0, STABLE otherwise. If model artifacts or the API are unavailable, prediction controls report the failure rather than substituting an ML estimate.

Dashboard risk percentages and scenario offsets remain illustrative demo UI values, not calibrated probabilities. The trained model API returns a separate binary class and FoS estimate; neither is validated for field decisions.

## Demo presentation sequence

1. Start the API and frontend; open Home and explain the current FOS and engineering cross-section.
2. Open Live Monitoring, start simulation, and change SAFE to WARNING or CRITICAL to see gradual values and messages.
3. Open Predictions to review held-out model metrics, then run a manual or batch prediction only after training artifacts are present.
4. Change analysis parameters, recalculate and expand the calculation assumptions.
5. Upload the included CSV, inspect validation feedback, then review History and Alerts.
6. Download the report PDF while the API is running.

## Limitations

This is an academic demonstrator, not a site-specific geotechnical design system. The attached CSV has no source or licence metadata and its values appear generated; verify provenance before redistribution. Model metrics are limited to this CSV and are not independent field validation or safety certification. The slope illustration, coordinates and default observations are illustrative. The simplified FOS method has not been reference-validated and is not a substitute for limit-equilibrium analysis, field inspection or a qualified engineer. The visible map relies on third-party tile services. The browser simulation is explicitly marked as demo data.

## Viva summary

The system brings geotechnical inputs into one interface, validates CSV inputs, stores monitoring readings and assessments in SQLite, and offers optional trained prototype regression and binary classification predictions. The supplied dataset's provenance and licence are unverified; model output is not a certified slope-safety decision. Every result requires appropriate field data, site-specific geotechnical analysis and qualified engineering review.