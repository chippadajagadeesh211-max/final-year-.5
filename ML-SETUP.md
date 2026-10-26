# ML prediction setup

The model workflow uses the CSV supplied in `archive.zip`, extracted to `data/slope_stability.csv`. The archive contains no provenance or licence metadata. Its generated-looking values are not verified field observations; test metrics describe only this supplied file and do not establish real-world accuracy, engineering adequacy, or slope safety.

## Dataset fields used

The pipeline maps the source headers explicitly:

| Source column | Model input / target | Unit |
|---|---|---|
| `Unit Weight (kN/m³)` | `unit_weight_kN_m3` | kN/m³ |
| `Cohesion (kPa)` | `soil_cohesion_kPa` | kPa |
| `Internal Friction Angle (°)` | `friction_angle_deg` | degrees |
| `Slope Angle (°)` | `slope_angle_deg` | degrees |
| `Slope Height (m)` | `slope_height_m` | m |
| `Pore Water Pressure Ratio` | `pore_water_pressure_ratio` | dimensionless ratio, 0–1 |
| `Reinforcement Type` | `reinforcement_type` | category |
| `Factor of Safety (FS)` | regression target `factor_of_safety` | dimensionless |

`Reinforcement Numeric` duplicates the category encoding and is deliberately excluded. All seven model inputs are required for manual and batch inference. Rainfall, sensor readings, and other unsupported features are not requested or fabricated.

## Train the models

From the `smart-slope-monitoring` directory:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements-ml.txt
python -m backend.ml.train --dataset data\slope_stability.csv
```

The trainer reports missing values, invalid values, duplicate rows, excluded rows and class balance. Numeric and categorical missing values are imputed only inside the fitted training pipeline. Inputs outside the documented physical ranges and rows without a positive finite FoS target are excluded with counts and reasons; exact duplicate rows are reported, not silently removed.

Regression candidates are Random Forest and Linear Regression. Classification candidates are Random Forest and Logistic Regression. Candidates are selected on a validation split; selected models are refitted on training plus validation data and evaluated once on a stratified held-out test split (64% / 16% / 20%, seed 42). Classification labels are derived only from the observed FoS target: `UNSTABLE` when FoS < 1.0 and `STABLE` otherwise. This is a research convention, not a universal acceptance rule.

The script writes to `backend/artifacts/`:

- `trained_models.joblib` — fitted preprocessing and model pipelines, feature categories, training ranges and version.
- `feature_names.json` — exact ordered model inputs.
- `evaluation_report.json` — validation comparisons, held-out metrics, data-quality counts, feature associations and limitations.
- `test_predictions.csv` — actual and predicted FoS, residuals and actual/predicted class for each test row.

Do not interpret feature importance as causation. The dashboard plots a sample of held-out actual/predicted values and residuals; the full set is in `test_predictions.csv`. The API warns when numeric prediction inputs are outside the training range and retains successful manual/CSV predictions in SQLite (`GET /api/ml/history`). Missing or corrupt model files produce an explicit unavailable/error response; prediction requests do not train models.

## Local execution

Start the API from the project root after training:

```powershell
$env:CORS_ALLOW_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal, start the Vite dashboard:

```powershell
npm install
npm run dev
```

Local Vite development defaults to `http://localhost:8000`. Check `GET /api/health` and `GET /api/ml/model-info`, then enter the seven listed features on Predictions or upload a CSV containing those features. The source dataset headers in the table above are mapped automatically. Invalid rows receive row-specific errors.

Run tests and a production frontend build:

```powershell
python -m unittest discover -s backend\tests -v
npm run build
```

## Static hosting

GitHub Pages serves only the Vite frontend and cannot execute FastAPI or Python model files. A separately hosted Python backend and its generated artifacts are required for predictions. Configure the actual API URL as the Vite build variable `VITE_API_BASE_URL`, and set `CORS_ALLOW_ORIGINS` on the backend to the exact frontend origin. The dashboard reports when the model/API is not configured; it does not substitute fake ML outputs.
